const mongoose = require("mongoose");
const { isValidStateCode } = require("../helpers/countryReference");

const stateFeeSchema = new mongoose.Schema({
  state: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    // Sibling-aware — this.parent() is the owning ExportFee document, so a
    // state is checked against the country it actually belongs to on this
    // same document.
    validate: {
      validator: function (value) {
        return isValidStateCode(this.parent()?.country, value);
      },
      message: "Not a recognized state/province for this document's country",
    },
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },

  vat: {
    type: Number,
    min: 0,
  },
});

const exportFeeSchema = new mongoose.Schema(
  {
    country: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
      uppercase: true,
      match: [
        /^[A-Z]{2}$/,
        "country must be a valid 2-letter country code (e.g. NG, US)",
      ],
    },

    defaultAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    defaultVat: {
      type: Number,
      required: true,
      min: 0,
    },

    states: {
      type: [stateFeeSchema],
      default: [],
      validate: {
        validator(states) {
          const set = new Set(states.map((s) => s.state.toLowerCase().trim()));
          return set.size === states.length;
        },
        message: "Duplicate states are not allowed",
      },
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

const ExportFee = mongoose.model("exportFee", exportFeeSchema);

module.exports = { ExportFee };
