const { getUspsClient, USPS_CRID, USPS_MAILER_ID } = require("../../config/usps");

// USPS's OAuth2 "USPS APIs" platform request/response shapes below follow
// their published Developer Portal structure as of this writing — no live
// credentials yet (see docs/shopify-ups-integration-plan.md), so treat
// exact field names as best-effort until the first real sandbox call
// confirms them, same caveat as upsProvider.js.
const PRICES_VERSION = "v3";
const LABELS_VERSION = "v3";
const TRACKING_VERSION = "v3";

// USPS's Domestic Prices/Labels APIs are domestic-only (US origin AND
// destination) — unlike UPS, this provider genuinely can't serve
// international addresses, which is a real "can't serve" case for the
// fallback chain, not just a formality.
const isDomesticUS = (address) =>
  (address?.country || "").toUpperCase() === "US";

const LABEL_FORMAT = "PDF";
const LABEL_CONTENT_TYPES = {
  PDF: "application/pdf",
  TIFF: "image/tiff",
  ZPL203DPI: "application/octet-stream",
  ZPL300DPI: "application/octet-stream",
};

const LB_PER_KG = 2.2046226218;

const sumWeightLbs = (items = []) =>
  items.reduce(
    (total, item) => total + ((item.weightGrams || 0) / 1000) * LB_PER_KG,
    0,
  );

const buildLabel = (labelImageBase64, format = LABEL_FORMAT) => {
  if (!labelImageBase64) return null;

  return {
    format,
    contentType: LABEL_CONTENT_TYPES[format] || "application/octet-stream",
    data: Buffer.from(labelImageBase64, "base64"),
  };
};

// USPS's tracking "statusCategory" values, mapped to our own SHIPMENT_STATUS
// enum — same philosophy as upsProvider's mapUpsStatus. Verify against live
// tracking responses once credentials exist.
const mapUspsStatus = (statusCategory) => {
  const map = {
    Delivered: "delivered",
    "Out for Delivery": "out_for_delivery",
    "In Transit": "in_transit",
    "Accepted": "picked_up",
    "Pre-Shipment": "label_created",
    "Alert": "failed",
    "Return to Sender": "failed",
  };

  return map[statusCategory] || "pending";
};

// Real destination-aware quote — but only within the US (see isDomesticUS).
const getQuote = async ({ items, destination, origin, currency }) => {
  if (!destination?.zipCode || !origin?.zipCode) {
    throw new Error("Origin and destination ZIP codes are required for a USPS quote");
  }

  if (!isDomesticUS(destination) || !isDomesticUS(origin)) {
    return null; // USPS only ships within the US
  }

  const weightLbs = Math.max(sumWeightLbs(items), 0.1);

  try {
    const client = await getUspsClient();

    const { data } = await client.post(`/prices/${PRICES_VERSION}/base-rates/search`, {
      originZIPCode: origin.zipCode,
      destinationZIPCode: destination.zipCode,
      weight: Number(weightLbs.toFixed(2)),
      mailClass: "USPS_GROUND_ADVANTAGE",
      priceType: "COMMERCIAL",
      accountType: "EPS",
      accountNumber: USPS_CRID,
      mailingDate: new Date().toISOString().slice(0, 10),
    });

    if (!data?.totalBasePrice) {
      return null; // no serviceable rate for this destination
    }

    return {
      shippingFee: Number(data.totalBasePrice),
      currency: currency || "USD", // USPS pricing is always USD
      raw: data,
    };
  } catch (err) {
    // A destination/ZIP USPS won't rate (bad ZIP, unsupported combo, etc.)
    // comes back as a 4xx — treat as "can't serve", same as upsProvider.
    if (err.response?.status >= 400 && err.response?.status < 500) {
      return null;
    }
    throw err;
  }
};

// Buys the label — self-serves a real tracking number, no manual carrier
// entry needed (supportsAutoTracking: true below).
//
// ⚠️ USPS's Labels API expects an X-Payment-Authorization-Token header,
// obtained from a separate Payments API call tied to an EPS/permit account
// — that step isn't implemented yet (no live USPS account to build it
// against). USPS_PAYMENT_AUTH_TOKEN below is a placeholder env var until
// that flow exists; label purchase will 4xx against a real account without it.
const createShipment = async ({ order, items, destination, origin }) => {
  const weightLbs = Math.max(sumWeightLbs(items), 0.1);

  const client = await getUspsClient();

  const { data } = await client.post(
    `/labels/${LABELS_VERSION}/label`,
    {
      imageInfo: {
        imageType: LABEL_FORMAT,
        labelType: "4X6LABEL",
        receiptOption: "NONE",
      },
      toAddress: {
        firstName: order.consigneesName || "Customer",
        streetAddress: destination.fullAddress,
        city: destination.city,
        state: destination.state,
        ZIPCode: destination.zipCode,
      },
      fromAddress: {
        firstName: "House Maduekwe",
        streetAddress: origin.fullAddress,
        city: origin.city,
        state: origin.state,
        ZIPCode: origin.zipCode,
      },
      packageDescription: {
        weight: Number(weightLbs.toFixed(2)),
        mailClass: "USPS_GROUND_ADVANTAGE",
        mailingDate: new Date().toISOString().slice(0, 10),
      },
      mailerId: USPS_MAILER_ID,
    },
    {
      headers: {
        "X-Payment-Authorization-Token": process.env.USPS_PAYMENT_AUTH_TOKEN || "",
      },
    },
  );

  const trackingNumber = data?.labelMetadata?.trackingNumber;

  if (!trackingNumber) {
    throw new Error("USPS did not return a tracking number for this shipment");
  }

  return {
    providerShipmentId: trackingNumber,
    carrier: "USPS",
    trackingNumber,
    trackingUrl: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`,
    status: "label_created",
    shippingCost: data?.labelMetadata?.postage
      ? Number(data.labelMetadata.postage)
      : null,
    currency: "USD",
    label: buildLabel(data?.labelImage),
    raw: data,
  };
};

// Always re-queries USPS directly (never trusts a webhook payload alone),
// same rule as every other provider/webhook in this codebase.
const getShipment = async ({ providerShipmentId }) => {
  if (!providerShipmentId) {
    throw new Error("providerShipmentId (USPS tracking number) is required");
  }

  const client = await getUspsClient();

  const { data } = await client.get(
    `/tracking/${TRACKING_VERSION}/tracking/${providerShipmentId}`,
    { params: { expand: "DETAIL" } },
  );

  return {
    status: mapUspsStatus(data?.statusCategory),
    trackingNumber: data?.trackingNumber || providerShipmentId,
    trackingUrl: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${providerShipmentId}`,
    raw: data,
  };
};

module.exports = {
  name: "usps",
  supportsAutoTracking: true,
  getQuote,
  createShipment,
  getShipment,
  mapUspsStatus,
  // No recoverLabel — USPS has no confirmed equivalent to UPS's Label
  // Recovery endpoint; shipmentController.getShipmentLabel only attempts
  // provider-side recovery when a provider actually exports this function.
};
