const {
  isValidCountryCode,
  isValidStateCode,
  getStatesOfCountry,
  getCitiesOfState,
} = require("../../server-src/helpers/countryReference");

describe("countryReference", () => {
  describe("isValidCountryCode", () => {
    it("accepts a real ISO-2 country code", () => {
      expect(isValidCountryCode("US")).toBe(true);
      expect(isValidCountryCode("us")).toBe(true);
    });

    it("rejects an unrecognized code", () => {
      expect(isValidCountryCode("ZZ")).toBe(false);
      expect(isValidCountryCode()).toBe(false);
    });
  });

  describe("isValidStateCode", () => {
    it("accepts a real state code for its country", () => {
      expect(isValidStateCode("US", "TX")).toBe(true);
      expect(isValidStateCode("us", "tx")).toBe(true);
    });

    it("rejects a state code that doesn't belong to that country", () => {
      expect(isValidStateCode("US", "ZZ")).toBe(false);
    });

    it("rejects a missing state value", () => {
      expect(isValidStateCode("US", "")).toBe(false);
      expect(isValidStateCode("US")).toBe(false);
    });

    it("accepts any state for a country with no subdivisions in the dataset", () => {
      // Vatican City has no states/provinces in country-state-city's data.
      expect(getStatesOfCountry("VA")).toHaveLength(0);
      expect(isValidStateCode("VA", "anything")).toBe(true);
    });
  });

  describe("getCitiesOfState", () => {
    it("returns real cities for a known state", () => {
      const cities = getCitiesOfState("US", "TX");
      expect(cities.some((c) => c.name === "Austin")).toBe(true);
    });

    it("returns an empty array for missing input", () => {
      expect(getCitiesOfState("US")).toEqual([]);
      expect(getCitiesOfState()).toEqual([]);
    });
  });
});
