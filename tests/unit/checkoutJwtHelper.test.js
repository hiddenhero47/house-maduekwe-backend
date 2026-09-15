const {
  buildCheckoutHash,
  signCheckoutToken,
  verifyCheckoutToken,
} = require("../../server-src/helpers/checkoutJwtHelper");

describe("checkoutJwtHelper", () => {
  describe("buildCheckoutHash", () => {
    const address = {
      country: "US",
      state: "Texas",
      city: "Austin",
      zipCode: "78701",
      fullAddress: "123 Test St",
    };

    it("is deterministic for the same input", () => {
      const items = [{ shopItem: { _id: "abc123" }, quantity: 2, selectedAttributes: [] }];

      const hash1 = buildCheckoutHash({ items, address, provider: "internal" });
      const hash2 = buildCheckoutHash({ items, address, provider: "internal" });

      expect(hash1).toBe(hash2);
    });

    it("is independent of item order", () => {
      const itemA = { shopItem: { _id: "aaa" }, quantity: 1, selectedAttributes: [] };
      const itemB = { shopItem: { _id: "bbb" }, quantity: 2, selectedAttributes: [] };

      const hash1 = buildCheckoutHash({ items: [itemA, itemB], address, provider: "internal" });
      const hash2 = buildCheckoutHash({ items: [itemB, itemA], address, provider: "internal" });

      expect(hash1).toBe(hash2);
    });

    it("changes when quantity changes", () => {
      const base = { shopItem: { _id: "abc123" }, selectedAttributes: [] };

      const hash1 = buildCheckoutHash({ items: [{ ...base, quantity: 1 }], address, provider: "internal" });
      const hash2 = buildCheckoutHash({ items: [{ ...base, quantity: 2 }], address, provider: "internal" });

      expect(hash1).not.toBe(hash2);
    });

    it("changes when the address changes", () => {
      const items = [{ shopItem: { _id: "abc123" }, quantity: 1, selectedAttributes: [] }];

      const hash1 = buildCheckoutHash({ items, address, provider: "internal" });
      const hash2 = buildCheckoutHash({
        items,
        address: { ...address, city: "Dallas" },
        provider: "internal",
      });

      expect(hash1).not.toBe(hash2);
    });

    it("changes when the provider changes", () => {
      const items = [{ shopItem: { _id: "abc123" }, quantity: 1, selectedAttributes: [] }];

      const hash1 = buildCheckoutHash({ items, address, provider: "internal" });
      const hash2 = buildCheckoutHash({ items, address, provider: "shopify" });

      expect(hash1).not.toBe(hash2);
    });

    it("works whether shopItem is a populated doc/object or a bare id", () => {
      const asObject = [{ shopItem: { _id: "abc123" }, quantity: 1, selectedAttributes: [] }];
      const asId = [{ shopItem: "abc123", quantity: 1, selectedAttributes: [] }];

      expect(buildCheckoutHash({ items: asObject, address, provider: "internal" })).toBe(
        buildCheckoutHash({ items: asId, address, provider: "internal" }),
      );
    });
  });

  describe("signCheckoutToken / verifyCheckoutToken", () => {
    it("round-trips a payload", () => {
      const token = signCheckoutToken({ provider: "internal", shippingFee: 10, checkoutHash: "abc" });
      const decoded = verifyCheckoutToken(token);

      expect(decoded.provider).toBe("internal");
      expect(decoded.shippingFee).toBe(10);
      expect(decoded.checkoutHash).toBe("abc");
    });

    it("returns null for a missing token instead of throwing", () => {
      expect(verifyCheckoutToken(undefined)).toBeNull();
      expect(verifyCheckoutToken("")).toBeNull();
    });

    it("returns null for a garbage/invalid token instead of throwing", () => {
      expect(verifyCheckoutToken("not-a-real-jwt")).toBeNull();
    });

    it("returns null for a token signed with a different secret", () => {
      const jwt = require("jsonwebtoken");
      const foreignToken = jwt.sign({ provider: "internal" }, "some-other-secret", {
        expiresIn: "10m",
      });

      expect(verifyCheckoutToken(foreignToken)).toBeNull();
    });

    it("returns null for an expired token", () => {
      const jwt = require("jsonwebtoken");
      const expiredToken = jwt.sign(
        { provider: "internal" },
        process.env.CHECKOUT_JWT_SECRET,
        { expiresIn: -10 }, // already expired
      );

      expect(verifyCheckoutToken(expiredToken)).toBeNull();
    });
  });
});
