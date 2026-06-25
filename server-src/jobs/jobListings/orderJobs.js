const cron = require("node-cron");
const cronStatus = require("../status");

const { cancelExpiredOrders } = require("../../helpers/orderHelper");

const { ORDER_STATUS } = require("../../models/orderModel");

const CANCEL_GRACE_PERIOD_MS = 15 * 60 * 1000;

const expiredOrderCleanup = () => {
  cron.schedule(
    "0 */2 * * *",
    async () => {
      if (cronStatus.expiredOrderCleanup?.running) {
        console.log(
          "[CRON][EXPIRED_ORDER_CLEANUP] Previous run still executing",
        );
        return;
      }

      try {
        cronStatus.expiredOrderCleanup.running = true;
        cronStatus.expiredOrderCleanup.lastRun = new Date();

        console.log(
          `[CRON][EXPIRED_ORDER_CLEANUP] Started at ${new Date().toISOString()}`,
        );

        const expiryCutoff = new Date(Date.now() - CANCEL_GRACE_PERIOD_MS);

        const cancelledCount = await cancelExpiredOrders({
          filter: {
            status: ORDER_STATUS.PENDING,
            expiresAt: {
              $ne: null,
              $lte: expiryCutoff,
            },
          },
          updatedBy: {
            email: "system-cron",
          },
        });

        console.log(
          `[CRON][EXPIRED_ORDER_CLEANUP] Completed. Cancelled ${cancelledCount} orders.`,
        );
      } catch (error) {
        console.error("[CRON][EXPIRED_ORDER_CLEANUP] Fatal Error:", error);
      } finally {
        cronStatus.expiredOrderCleanup.running = false;
      }
    },
    {
      scheduled: true,
      timezone: "Africa/Lagos",
    },
  );
};

module.exports = expiredOrderCleanup;
