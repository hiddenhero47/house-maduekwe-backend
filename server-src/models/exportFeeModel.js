const mongoose = require("mongoose");

const stateFeeSchema = new mongoose.Schema({
  state: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  amount: {
    type: Number,
    required: true,
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
    },

    defaultAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    states: {
      type: [stateFeeSchema],
      default: [],
      validate: {
        validator: function (states) {
          return !hasDuplicateStates(states);
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
