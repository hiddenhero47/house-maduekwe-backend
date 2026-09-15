const request = require("supertest");
const createApp = require("../../server-src/app");
const { connectTestDB, disconnectTestDB, clearTestDB } = require("../setup/db");
const {
  createUser,
  generateToken,
  createShopItem,
  createExportFee,
  createAddress,
  createCart,
} = require("../setup/fixtures");
const Cart = require("../../server-src/models/cartModel");
const { ShopItem } = require("../../server-src/models/shopItemModel");
const { Order } = require("../../server-src/models/orderModel");
const internalProvider = require("../../server-src/providers/shippingProviders/internalProvider");

const app = createApp();

beforeAll(async () => {
  await connectTestDB();
});

afterEach(async () => {
  await clearTestDB();
  jest.restoreAllMocks();
});

afterAll(async () => {
  await disconnectTestDB();
});

// price 100 × qty 2 = 200 totalAmount, productTax 10% = 20
// destination = Texas -> ExportFee state override: shippingFee 5, vat 6%
// totalVat = 200 * 6% = 12
const setupCheckoutFixtures = async () => {
  const user = await createUser();
  const token = generateToken(user);
  const shopItem = await createShopItem({
    price: 100,
    productTax: 10,
    weight: { value: 0.3, unit: "kg" },
  });

  await createExportFee({
    country: "US",
    defaultAmount: 15,
    defaultVat: 8,
    states: [{ state: "texas", amount: 5, vat: 6 }],
  });

  const address = await createAddress({ user, country: "US", state: "Texas" });
  const cart = await createCart({
    user,
    itemList: [{ shopItem: shopItem._id, quantity: 2 }],
  });
  const cartItemId = cart.itemList[0]._id.toString();

  return { user, token, shopItem, address, cart, cartItemId };
};

describe("POST /api/orders/confirm-checkout", () => {
  it("returns a checkoutToken and the correct totals", async () => {
    const { token, address, cartItemId } = await setupCheckoutFixtures();

    const res = await request(app)
      .post("/api/orders/confirm-checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({ itemList: [cartItemId], selectedAddress: address._id.toString() });

    expect(res.status).toBe(200);
    expect(res.body.checkoutToken).toEqual(expect.any(String));
    expect(res.body.order.totalAmount).toBe(200);
    expect(res.body.order.totalProductTax).toBe(20);
    expect(res.body.order.shippingFee).toBe(5); // Texas state override
    expect(res.body.order.totalVat).toBe(12); // state vat override (6%)
  });

  it("falls back to the country default when the address state has no override", async () => {
    const { token, cartItemId, user } = await setupCheckoutFixtures();
    const address = await createAddress({ user, country: "US", state: "California" });

    const res = await request(app)
      .post("/api/orders/confirm-checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({ itemList: [cartItemId], selectedAddress: address._id.toString() });

    expect(res.status).toBe(200);
    expect(res.body.order.shippingFee).toBe(15); // country default
    expect(res.body.order.totalVat).toBe(16); // 200 * 8% default
  });

  it("reuses the cached shipping quote on a repeat confirm call with a matching token", async () => {
    const { token, address, cartItemId } = await setupCheckoutFixtures();
    const getQuoteSpy = jest.spyOn(internalProvider, "getQuote");

    const first = await request(app)
      .post("/api/orders/confirm-checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({ itemList: [cartItemId], selectedAddress: address._id.toString() });

    expect(getQuoteSpy).toHaveBeenCalledTimes(1);

    const second = await request(app)
      .post("/api/orders/confirm-checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({
        itemList: [cartItemId],
        selectedAddress: address._id.toString(),
        checkoutToken: first.body.checkoutToken,
      });

    // Same inputs + a still-valid token -> quote reused, provider NOT re-called
    expect(getQuoteSpy).toHaveBeenCalledTimes(1);
    expect(second.body.order.shippingFee).toBe(first.body.order.shippingFee);
  });

  it("does NOT reuse the quote if the cart changed since the token was issued", async () => {
    const { token, address, cartItemId, cart } = await setupCheckoutFixtures();
    const getQuoteSpy = jest.spyOn(internalProvider, "getQuote");

    const first = await request(app)
      .post("/api/orders/confirm-checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({ itemList: [cartItemId], selectedAddress: address._id.toString() });

    await Cart.updateOne(
      { _id: cart._id, "itemList._id": cart.itemList[0]._id },
      { $set: { "itemList.$.quantity": 5 } },
    );

    await request(app)
      .post("/api/orders/confirm-checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({
        itemList: [cartItemId],
        selectedAddress: address._id.toString(),
        checkoutToken: first.body.checkoutToken,
      });

    expect(getQuoteSpy).toHaveBeenCalledTimes(2); // hash mismatch -> fresh quote
  });
});

describe("POST /api/orders/checkout", () => {
  it("always recalculates fresh, ignoring the token's cached numbers", async () => {
    const { token, address, cartItemId } = await setupCheckoutFixtures();
    const getQuoteSpy = jest.spyOn(internalProvider, "getQuote");

    const confirmRes = await request(app)
      .post("/api/orders/confirm-checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({ itemList: [cartItemId], selectedAddress: address._id.toString() });

    expect(getQuoteSpy).toHaveBeenCalledTimes(1);

    const checkoutRes = await request(app)
      .post("/api/orders/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({
        itemList: [cartItemId],
        selectedAddress: address._id.toString(),
        consigneesName: "Jane Doe",
        checkoutToken: confirmRes.body.checkoutToken,
      });

    expect(checkoutRes.status).toBe(201);
    // checkout ALWAYS calls the provider again, even with a valid token
    expect(getQuoteSpy).toHaveBeenCalledTimes(2);
  });

  it("creates an Order with the correct totals, shippedBy, and decrements stock", async () => {
    const { token, address, cartItemId, shopItem } = await setupCheckoutFixtures();

    const res = await request(app)
      .post("/api/orders/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({
        itemList: [cartItemId],
        selectedAddress: address._id.toString(),
        consigneesName: "Jane Doe",
      });

    expect(res.status).toBe(201);
    expect(res.body.order.totalAmount).toBe(200);
    expect(res.body.order.totalProductTax).toBe(20);
    expect(res.body.order.shippingFee).toBe(5);
    expect(res.body.order.totalVat).toBe(12);
    expect(res.body.order.shippedBy).toBe("internal");
    expect(res.body.order.status).toBe("pending");
    expect(res.body.order.extraInfo.checkoutTrusted).toBe(false); // no token sent
    expect(res.body.payment.amountToPay).toBe(237); // 200 + 12 + 20 + 5

    const updatedItem = await ShopItem.findById(shopItem._id).lean();
    expect(updatedItem.quantity).toBe(98); // 100 - 2
  });

  it("marks extraInfo.checkoutTrusted true when a valid prior confirm token is presented", async () => {
    const { token, address, cartItemId } = await setupCheckoutFixtures();

    const confirmRes = await request(app)
      .post("/api/orders/confirm-checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({ itemList: [cartItemId], selectedAddress: address._id.toString() });

    const checkoutRes = await request(app)
      .post("/api/orders/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({
        itemList: [cartItemId],
        selectedAddress: address._id.toString(),
        consigneesName: "Jane Doe",
        checkoutToken: confirmRes.body.checkoutToken,
      });

    expect(checkoutRes.body.order.extraInfo.checkoutTrusted).toBe(true);
  });

  it("rejects a second checkout while a pending order already exists for that user", async () => {
    const { token, address, cartItemId, user } = await setupCheckoutFixtures();

    const first = await request(app)
      .post("/api/orders/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({
        itemList: [cartItemId],
        selectedAddress: address._id.toString(),
        consigneesName: "Jane Doe",
      });
    expect(first.status).toBe(201);

    const shopItem2 = await createShopItem({ price: 10 });
    const cart = await Cart.findOne({ user: user._id });
    cart.itemList.push({ shopItem: shopItem2._id, quantity: 1 });
    await cart.save();
    const secondCartItemId = cart.itemList[cart.itemList.length - 1]._id.toString();

    const second = await request(app)
      .post("/api/orders/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({
        itemList: [secondCartItemId],
        selectedAddress: address._id.toString(),
        consigneesName: "Jane Doe",
      });

    expect(second.status).toBe(400);

    const orders = await Order.find({ user: user._id });
    expect(orders).toHaveLength(1); // second attempt never created an order
  });

  it("rejects checkout without authentication", async () => {
    const res = await request(app).post("/api/orders/checkout").send({});
    expect(res.status).toBe(401);
  });
});
