const mongoose = require("mongoose");

const SHIPMENT_STATUS = {
  PENDING: "pending",
  LABEL_CREATED: "label_created",
  PICKED_UP: "picked_up",
  IN_TRANSIT: "in_transit",
  OUT_FOR_DELIVERY: "out_for_delivery",
  DELIVERED: "delivered",
  FAILED: "failed",
  CANCELLED: "cancelled",
};

const shipmentSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      unique: true, // one shipment per order
      index: true,
    },

    // "internal" | "shopify" | "dhl" | "fedex" — matches ShippingSettings.activeProvider
    provider: {
      type: String,
      required: true,
    },

    // The external provider's own id — distinct from this doc's _id and
    // from trackingNumber (the carrier's id).
    providerShipmentId: {
      type: String,
      index: true,
    },

    // The physical carrier, which may differ from `provider` (e.g. provider
    // "shopify" fulfilling via carrier "DHL").
    carrier: {
      type: String,
    },

    trackingNumber: {
      type: String,
    },

    trackingUrl: {
      type: String,
    },

    status: {
      type: String,
      enum: Object.values(SHIPMENT_STATUS),
      default: SHIPMENT_STATUS.PENDING,
      index: true,
    },

    // What the provider actually charged House Maduekwe — NOT the
    // customer-facing shipping fee stored on the Order.
    shippingCost: {
      type: Number,
      min: 0,
    },

    currency: {
      type: String,
    },

    shippedAt: {
      type: Date,
    },

    deliveredAt: {
      type: Date,
    },

    // Last raw payload from the provider (quote/creation/webhook response),
    // kept for debugging — never used as the source of truth for reads.
    raw: {
      type: mongoose.Schema.Types.Mixed,
    },

    // Metadata only — the actual bytes live under server-src/private/, never
    // in Mongo and never under the public static folder. See
    // helpers/privateFileManager.js and docs/shopify-ups-integration-plan.md.
    files: {
      type: [
        {
          kind: { type: String, required: true }, // "label" for now
          format: { type: String, required: true }, // "PDF" | "GIF" | "ZPL"
          filename: { type: String, required: true },
          path: { type: String, required: true }, // relative to PRIVATE_DIR
          contentType: { type: String, required: true },
          storedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },

    createdBy: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      email: {
        type: String,
      },
    },
  },
  {
    timestamps: true,
  },
);

const Shipment = mongoose.model("Shipment", shipmentSchema);

module.exports = { Shipment, SHIPMENT_STATUS };
