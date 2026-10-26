const { toStateCode } = require("../../server-src/helpers/usStateHelper");

describe("usStateHelper", () => {
  describe("toStateCode", () => {
    it("converts a full state name to its 2-letter code", () => {
      expect(toStateCode("Texas")).toBe("TX");
      expect(toStateCode("california")).toBe("CA");
      expect(toStateCode("New York")).toBe("NY");
    });

    it("passes through an already-2-letter code, uppercased", () => {
      expect(toStateCode("tx")).toBe("TX");
      expect(toStateCode("TX")).toBe("TX");
    });

    it("handles a territory name", () => {
      expect(toStateCode("Puerto Rico")).toBe("PR");
    });

    it("falls back to the uppercased original value for something unrecognized", () => {
      expect(toStateCode("Nowhere")).toBe("NOWHERE");
    });

    it("returns falsy input unchanged", () => {
      expect(toStateCode(undefined)).toBeUndefined();
      expect(toStateCode("")).toBe("");
      expect(toStateCode(null)).toBeNull();
    });
  });
});
