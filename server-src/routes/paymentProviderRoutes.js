const express = require("express");
const router = express.Router();

const {
  createPaymentProvider,
  getPaymentProviders,
  updatePaymentProvider,
  disablePaymentProvider,
  deletePaymentProviderPermanent,
  getClientPaymentProviders,
} = require("../controllers/paymentProviderController");

const { secureRole } = require("../middleware/authMiddleware");
const { ROLE } = require("../models/userModel");
const verify2fa = require("../middleware/verify2faMiddleware");

router.get("/", secureRole(ROLE.SUPER_ADMIN), getPaymentProviders);

router.post("/", secureRole(ROLE.SUPER_ADMIN), createPaymentProvider);

router.put("/:id", secureRole(ROLE.SUPER_ADMIN), updatePaymentProvider);

router.delete("/:id", secureRole(ROLE.SUPER_ADMIN), disablePaymentProvider);

router.delete(
  "/:id/permanent",
  secureRole(ROLE.SUPER_ADMIN),
  verify2fa(true),
  deletePaymentProviderPermanent,
);

// client
router.get("/client", getClientPaymentProviders);

module.exports = router;
