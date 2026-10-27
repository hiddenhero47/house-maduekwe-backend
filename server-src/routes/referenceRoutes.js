const express = require("express");
const router = express.Router();
const {
  getCountries,
  getStates,
  getCities,
} = require("../controllers/referenceController");

router.get("/countries", getCountries);
router.get("/countries/:countryCode/states", getStates);
router.get("/countries/:countryCode/cities", getCities);

module.exports = router;
