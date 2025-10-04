const mongoose = require("mongoose");

const MAX_ADDRESSES = 5; // limit per user

const addressSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    city: {
      type: String,
      required: [true, "Please select a city for your address"],
    },
    state: {
      type: String,
      required: [true, "Please select a state for your address"],
    },
    country: {
      type: String,
      required: [true, "Please select a country for your address"],
    },
    description: {
      type: String,
      required: [true, "Please add a description to your address"],
    },
    fullAddress: {
      type: String,
      required: [true, "Please add your full address description"],
    },
    coordinates: {
      type: mongoose.Schema.Types.Mixed,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save hook to enforce limit
addressSchema.pre("save", async function (next) {
  const Address = mongoose.model("Address");
  const count = await Address.countDocuments({ user: this.user });

  if (count >= MAX_ADDRESSES) {
    const error = new Error(
      `You can only have a maximum of ${MAX_ADDRESSES} addresses`
    );
    error.status = 400;
    return next(error);
  }

  next();
});

const Address = mongoose.model("Address", addressSchema);
module.exports = { Address, MAX_ADDRESSES };
