const crypto = require("crypto");
const { getUpsClient, UPS_ACCOUNT_NUMBER } = require("../../config/ups");

// UPS's JSON Rating/Shipping/Tracking/Label-Recovery request & response
// shapes below follow their published Developer Portal structure as of this
// writing — we don't have live credentials yet (see
// docs/shopify-ups-integration-plan.md), so treat exact field names as
// best-effort until the first real call against UPS's sandbox confirms them.
const RATING_VERSION = "v2409";
const SHIPPING_VERSION = "v2409";
const TRACKING_VERSION = "v1";

// PDF by default per docs/shopify-ups-integration-plan.md — GIF/ZPL are the
// alternatives for a thermal label printer.
const LABEL_FORMAT = "PDF";
const LABEL_CONTENT_TYPES = {
  PDF: "application/pdf",
  GIF: "image/gif",
  ZPL: "application/octet-stream",
};

const transactionHeaders = () => ({
  transId: crypto.randomUUID(),
  transactionSrc: "house-maduekwe",
});

const sumWeightKg = (items = []) =>
  items.reduce((total, item) => total + (item.weightGrams || 0) / 1000, 0);

const buildAddress = (address = {}) => ({
  AddressLine: [address.fullAddress].filter(Boolean),
  City: address.city,
  StateProvinceCode: address.state,
  PostalCode: address.zipCode,
  CountryCode: address.country,
});

const buildLabel = (graphicImageBase64) => {
  if (!graphicImageBase64) return null;

  return {
    format: LABEL_FORMAT,
    contentType: LABEL_CONTENT_TYPES[LABEL_FORMAT],
    data: Buffer.from(graphicImageBase64, "base64"),
  };
};

// UPS's tracking "status type" codes, mapped to our own SHIPMENT_STATUS
// enum — same philosophy as shopifyProvider's mapping function, provider
// event names never leak past this. Verify against live responses once
// credentials exist.
const mapUpsStatus = (upsStatusType) => {
  const map = {
    D: "delivered",
    I: "in_transit",
    M: "label_created",
    P: "picked_up",
    X: "failed",
  };

  return map[upsStatusType] || "pending";
};

// Real destination-aware quote — the genuine second opinion in the fallback
// chain (unlike shopifyProvider, which has no rate API to call at all).
const getQuote = async ({ items, destination, origin, currency }) => {
  if (!destination?.country) {
    throw new Error("Destination country is required for a UPS quote");
  }

  const weightKg = Math.max(sumWeightKg(items), 0.1); // UPS rejects a 0 weight

  try {
    const client = await getUpsClient();

    const { data } = await client.post(
      `/api/rating/${RATING_VERSION}/Shop`,
      {
        RateRequest: {
          Shipment: {
            Shipper: {
              ShipperNumber: UPS_ACCOUNT_NUMBER,
              Address: buildAddress(origin),
            },
            ShipFrom: { Address: buildAddress(origin) },
            ShipTo: { Address: buildAddress(destination) },
            Package: [
              {
                PackagingType: { Code: "02" }, // Customer Supplied Package
                PackageWeight: {
                  UnitOfMeasurement: { Code: "KGS" },
                  Weight: weightKg.toFixed(1),
                },
              },
            ],
          },
        },
      },
      { headers: transactionHeaders() },
    );

    const ratedShipments = data?.RateResponse?.RatedShipment;
    const cheapest = Array.isArray(ratedShipments)
      ? ratedShipments[0]
      : ratedShipments;

    if (!cheapest?.TotalCharges?.MonetaryValue) {
      return null; // no serviceable rate for this destination
    }

    return {
      shippingFee: Number(cheapest.TotalCharges.MonetaryValue),
      currency: cheapest.TotalCharges.CurrencyCode || currency,
      raw: data,
    };
  } catch (err) {
    // A destination UPS won't service (bad address, restricted zone, etc.)
    // comes back as a 4xx with a UPS error payload, not a network fault —
    // treat that as "can't serve" so the fallback loop tries the next
    // provider silently; genuine faults (network/auth/5xx) still propagate.
    if (err.response?.status >= 400 && err.response?.status < 500) {
      return null;
    }
    throw err;
  }
};

// Buys the label — self-serves a real tracking number, no manual carrier
// entry needed (supportsAutoTracking: true below).
const createShipment = async ({ order, items, destination, origin }) => {
  const weightKg = Math.max(sumWeightKg(items), 0.1);

  const client = await getUpsClient();

  const { data } = await client.post(
    `/api/shipments/${SHIPPING_VERSION}/ship`,
    {
      ShipmentRequest: {
        Shipment: {
          Description: `House Maduekwe order ${order._id}`,
          Shipper: {
            Name: "House Maduekwe",
            ShipperNumber: UPS_ACCOUNT_NUMBER,
            Address: buildAddress(origin),
          },
          ShipFrom: { Name: "House Maduekwe", Address: buildAddress(origin) },
          ShipTo: {
            Name: order.consigneesName || "Customer",
            Address: buildAddress(destination),
          },
          PaymentInformation: {
            ShipmentCharge: {
              Type: "01", // transportation charges
              BillShipper: { AccountNumber: UPS_ACCOUNT_NUMBER },
            },
          },
          // UPS Ground — TODO: make the service level configurable once
          // there's an actual business decision on which UPS services to
          // offer (Ground vs. Air/Express etc.).
          Service: { Code: "03" },
          Package: [
            {
              Packaging: { Code: "02" },
              PackageWeight: {
                UnitOfMeasurement: { Code: "KGS" },
                Weight: weightKg.toFixed(1),
              },
            },
          ],
        },
        LabelSpecification: {
          LabelImageFormat: { Code: LABEL_FORMAT },
        },
      },
    },
    { headers: transactionHeaders() },
  );

  const results = data?.ShipmentResponse?.ShipmentResults;
  const packageResult = Array.isArray(results?.PackageResults)
    ? results.PackageResults[0]
    : results?.PackageResults;

  if (!packageResult?.TrackingNumber) {
    throw new Error("UPS did not return a tracking number for this shipment");
  }

  return {
    providerShipmentId: packageResult.TrackingNumber,
    carrier: "UPS",
    trackingNumber: packageResult.TrackingNumber,
    trackingUrl: `https://www.ups.com/track?tracknum=${packageResult.TrackingNumber}`,
    status: "label_created",
    shippingCost: results?.ShipmentCharges?.TotalCharges?.MonetaryValue
      ? Number(results.ShipmentCharges.TotalCharges.MonetaryValue)
      : null,
    currency: results?.ShipmentCharges?.TotalCharges?.CurrencyCode || null,
    label: buildLabel(packageResult.ShippingLabel?.GraphicImage),
    raw: data,
  };
};

// Always re-queries UPS directly (never trusts a webhook payload alone),
// same rule as every other provider/webhook in this codebase.
const getShipment = async ({ providerShipmentId }) => {
  if (!providerShipmentId) {
    throw new Error("providerShipmentId (UPS tracking number) is required");
  }

  const client = await getUpsClient();

  const { data } = await client.get(
    `/api/track/${TRACKING_VERSION}/details/${providerShipmentId}`,
    { headers: transactionHeaders() },
  );

  const shipment = Array.isArray(data?.trackResponse?.shipment)
    ? data.trackResponse.shipment[0]
    : data?.trackResponse?.shipment;
  const pkg = Array.isArray(shipment?.package)
    ? shipment.package[0]
    : shipment?.package;
  const activity = Array.isArray(pkg?.activity) ? pkg.activity[0] : pkg?.activity;

  return {
    status: mapUpsStatus(activity?.status?.type),
    trackingNumber: pkg?.trackingNumber || providerShipmentId,
    trackingUrl: `https://www.ups.com/track?tracknum=${providerShipmentId}`,
    raw: data,
  };
};

// Best-effort fallback only — see docs/shopify-ups-integration-plan.md
// ("Recovery vs. storage"). We store the label ourselves at creation time;
// this is called by shipmentController's label route only when that stored
// copy is unexpectedly missing.
const recoverLabel = async ({ trackingNumber }) => {
  const client = await getUpsClient();

  const { data } = await client.post(
    `/api/labels/${SHIPPING_VERSION}/recovery`,
    {
      LabelRecoveryRequest: {
        LabelSpecification: { LabelImageFormat: { Code: LABEL_FORMAT } },
        TrackingNumber: trackingNumber,
      },
    },
    { headers: transactionHeaders() },
  );

  const results = data?.LabelRecoveryResponse?.LabelResults;
  const result = Array.isArray(results) ? results[0] : results;
  const label = buildLabel(result?.LabelImage?.GraphicImage);

  if (!label) {
    throw new Error("UPS label recovery returned no label image");
  }

  return label;
};

module.exports = {
  name: "ups",
  supportsAutoTracking: true,
  getQuote,
  createShipment,
  getShipment,
  recoverLabel,
  mapUpsStatus,
};
