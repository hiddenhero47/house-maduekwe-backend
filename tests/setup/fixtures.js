const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { User, ROLE } = require("../../server-src/models/userModel");
const Category = require("../../server-src/models/categoryModel");
const { ShopItem } = require("../../server-src/models/shopItemModel");
const { ExportFee } = require("../../server-src/models/exportFeeModel");
const { Address } = require("../../server-src/models/addressModel");
const Cart = require("../../server-src/models/cartModel");
const { Order, ORDER_STATUS } = require("../../server-src/models/orderModel");
const { Attribute, attributeType } = require("../../server-src/models/attributeModel");

// A real (tiny, valid) 1x1 transparent PNG — needed anywhere code validates
// file type by magic bytes (server-src/helpers/fileManager.js), not just by
// extension. Fully local, no network involved.
const TEST_PNG_BASE64 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

// Same image as a Buffer, for supertest's .attach() (real multipart file
// upload — the path server-src/controllers/shopItemController.js actually
// expects; its base64/url fields are read inconsistently, see tests).
const TEST_PNG_BUFFER = Buffer.from(
  TEST_PNG_BASE64.split("base64,")[1],
  "base64",
);

let counter = 0;
const next = () => {
  counter += 1;
  return counter;
};

const createUser = async ({ role = ROLE.BASIC, ...overrides } = {}) => {
  const n = next();

  const user = new User({
    name: `Test User ${n}`,
    email: `test.user.${n}.${Date.now()}@example.com`,
    password: await bcrypt.hash("password123", 4),
    role,
    verified: true,
    ...overrides,
  });

  if (role === ROLE.ADMIN || role === ROLE.SUPER_ADMIN) {
    user._adminCreation = true; // required by userModel's pre-save guard
  }

  await user.save();

  return user;
};

const createAdmin = (overrides) =>
  createUser({ role: ROLE.ADMIN, ...overrides });

// Matches userController.js's generateToken exactly, so it's indistinguishable
// from a token issued by a real login.
const generateToken = (user) =>
  jwt.sign({ id: user._id, sessionId: user.sessionId }, process.env.JWT_SECRET, {
    expiresIn: "1d",
  });

const createCategory = async (overrides = {}) =>
  Category.create({
    name: `Test Category ${next()}-${Date.now()}`,
    ...overrides,
  });

const createShopItem = async (overrides = {}) => {
  const category = overrides.category || (await createCategory())._id;

  return ShopItem.create({
    name: `Test Shirt ${next()}`,
    price: 50,
    productTax: 0,
    weight: { value: 0.2, unit: "kg" },
    currency: "USD",
    quantity: 100,
    imageCatalog: ["https://example.com/image.jpg"],
    ...overrides,
    category,
  });
};

const createExportFee = async (overrides = {}) =>
  ExportFee.create({
    country: "US",
    defaultAmount: 10,
    defaultVat: 7.5,
    states: [],
    isActive: true,
    ...overrides,
  });

const createAddress = async ({ user, ...overrides } = {}) =>
  Address.create({
    user: user._id,
    city: "Austin",
    state: "Texas",
    country: "US",
    fullAddress: "123 Test St",
    zipCode: "78701",
    ...overrides,
  });

const createCart = async ({ user, itemList = [] } = {}) =>
  Cart.create({ user: user._id, itemList });

// Bypasses checkout entirely — builds an Order directly at whatever status
// is needed (e.g. PAID, ready for a shipment to be created against it).
const createOrder = async ({
  user,
  shopItem,
  quantity = 1,
  status = ORDER_STATUS.PAID,
  shippedBy = "internal",
  ...overrides
} = {}) =>
  Order.create({
    user: user._id,
    userEmail: user.email,
    consigneesName: "Test Buyer",
    checkoutType: "user-checkout",
    items: [
      {
        shopItem: shopItem.toObject(),
        quantity,
        selectedAttributes: [],
      },
    ],
    address: {
      country: "US",
      state: "Texas",
      city: "Austin",
      fullAddress: "123 Test St",
      zipCode: "78701",
    },
    totalAmount: shopItem.price * quantity,
    totalVat: 0,
    totalProductTax: 0,
    shippingFee: 10,
    status,
    shippedBy,
    ...overrides,
  });

const createAttribute = async (overrides = {}) =>
  Attribute.create({
    name: `Test Attribute ${next()}`,
    value: "red",
    type: attributeType.COLOR,
    ...overrides,
  });

module.exports = {
  createUser,
  createAdmin,
  generateToken,
  createCategory,
  createShopItem,
  createExportFee,
  createAddress,
  createCart,
  createOrder,
  createAttribute,
  TEST_PNG_BASE64,
  TEST_PNG_BUFFER,
};
