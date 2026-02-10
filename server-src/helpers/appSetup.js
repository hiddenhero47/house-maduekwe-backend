const { PaymentProvider } = require("../models/paymentProviderModel");
const { ExportFee } = require("../models/exportFeeModel");

const ensureStripePaymentProvider = async () => {
  try {
    const providerName = "stripe";

    const existingProvider = await PaymentProvider.findOne({
      provider: providerName,
    });

    if (!existingProvider) {
      const provider = await PaymentProvider.create({
        provider: providerName,
        percentageFee: 2.9, // adjust if needed
        flatFee: 0.30,
        isActive: true,
      });

      return {
        task: "Ensure Payment Provider",
        status: "success",
        message: `Payment provider created: ${provider.provider}`,
      };
    }

    return {
      task: "Ensure Payment Provider",
      status: "success",
      message: `Payment provider already exists: ${existingProvider.provider}`,
    };
  } catch (error) {
    return {
      task: "Ensure Payment Provider",
      status: "failed",
      message: error.message,
    };
  }
};

const ensureUSExportFee = async () => {
  try {
    const countryCode = "US";
    const texasState = "Texas";

    let exportFee = await ExportFee.findOne({ country: countryCode });

    if (!exportFee) {
      exportFee = await ExportFee.create({
        country: countryCode,
        defaultAmount: 10, // set your default export fee
        states: [
          {
            state: texasState,
            amount: 5, // Texas-specific fee
          },
        ],
        isActive: true,
      });

      return {
        task: "Ensure Export Fee",
        status: "success",
        message: `Export fee created for ${countryCode} (Texas included)`,
      };
    }

    // If country exists, ensure Texas exists
    const texasExists = exportFee.states.some((s) => s.state === texasState);

    if (!texasExists) {
      exportFee.states.push({
        state: texasState,
        amount: 5,
      });

      await exportFee.save();

      return {
        task: "Ensure Export Fee",
        status: "success",
        message: `Texas export fee added to ${countryCode}`,
      };
    }

    return {
      task: "Ensure Export Fee",
      status: "success",
      message: `Export fee already exists for ${countryCode} (Texas included)`,
    };
  } catch (error) {
    return {
      task: "Ensure Export Fee",
      status: "failed",
      message: error.message,
    };
  }
};

module.exports = {
  ensureStripePaymentProvider,
  ensureUSExportFee,
};
