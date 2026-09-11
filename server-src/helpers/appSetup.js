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
    const defaultVatRate = 0; // TODO: set the real default VAT/sales-tax rate for this country

    let exportFee = await ExportFee.findOne({ country: countryCode });

    if (!exportFee) {
      exportFee = await ExportFee.create({
        country: countryCode,
        defaultAmount: 10, // set your default export fee
        defaultVat: defaultVatRate,
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

    let needsSave = false;

    // 🔧 Backfill defaultVat for export fees created before defaultVat existed —
    // it's now a required field, so any .save() below would otherwise throw.
    if (typeof exportFee.defaultVat !== "number") {
      exportFee.defaultVat = defaultVatRate;
      needsSave = true;
    }

    // If country exists, ensure Texas exists
    const texasExists = exportFee.states.some((s) => s.state === texasState);

    if (!texasExists) {
      exportFee.states.push({
        state: texasState,
        amount: 5,
      });

      needsSave = true;
    }

    if (needsSave) {
      await exportFee.save();

      return {
        task: "Ensure Export Fee",
        status: "success",
        message: `Export fee updated for ${countryCode} (defaultVat/Texas backfilled as needed)`,
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
