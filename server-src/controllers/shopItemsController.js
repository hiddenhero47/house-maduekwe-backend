const asyncHandler = require("express-async-handler");
const ShopItem = require("../models/shopItemsModel");
const {
  shopItemValidationSchema,
  fileValidationSchema,
} = require("../validations/shopItemValidation");
const { uploadHandler, deleteFile } = require("../helpers/fileManager");

// @desc   Public Get Items (with filters + pagination)
// @route  GET /api/shop-items
// @access Public
const getShopItems = asyncHandler(async (req, res) => {
  const {
    category,
    subCategory,
    minPrice,
    maxPrice,
    attributes,
    page = 1,
    limit = 10,
  } = req.query;

  const query = {};

  if (category) query.category = category;
  if (subCategory) query.subCategory = subCategory;
  if (minPrice || maxPrice) {
    query.price = {};
    if (minPrice) query.price.$gte = Number(minPrice);
    if (maxPrice) query.price.$lte = Number(maxPrice);
  }
  if (attributes) {
    // attributes param should be JSON string like: [{"name":"Color","value":"Red"}]
    try {
      const parsed = JSON.parse(attributes);
      if (Array.isArray(parsed)) {
        query["attributes"] = {
          $all: parsed.map((attr) => ({
            $elemMatch: { name: attr.name, value: attr.value },
          })),
        };
      }
    } catch (e) {
      res.status(400);
      throw new Error("Invalid attributes filter format");
    }
  }

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    ShopItem.find(query).skip(skip).limit(Number(limit)),
    ShopItem.countDocuments(query),
  ]);

  res.json({
    page: Number(page),
    limit: Number(limit),
    total,
    totalPages: Math.ceil(total / limit),
    items,
  });
});

// @desc   Create Item
// @route  POST /api/shop-items
// @access Private (admin/super_admin)
const createShopItem = asyncHandler(async (req, res) => {
  const { base64, url, ...itemData } = req.body;

  // ✅ Ensure required image data
  if (!req.files || !base64 || !url) {
    res.status(400);
    throw new Error("Image catalog is required. Please add item images.");
  }

  // ✅ Validate request body with Yup
  await shopItemValidationSchema.validate(req.body, { abortEarly: false });

  // ✅ Upload images (with validation)
  const imageCatalog = await uploadHandler({
    req,
    schema: fileValidationSchema,
    allowedTypes: ["image/jpeg", "image/png"],
  });

  // ✅ Construct item object
  const newItem = {
    ...itemData,
    imageCatalog,
  };

  const shopItem = await ShopItem.create(newItem);
  res.status(201).json(shopItem);
});

// @desc   Update Item
// @route  PUT /api/shop-items/:id
// @access Private (admin/super_admin)
const updateShopItem = asyncHandler(async (req, res) => {
  const item = await ShopItem.findById(req.params.id);
  if (!item) {
    res.status(404);
    throw new Error("Shop item not found");
  }

  const { base64, url, ...itemData } = req.body;

  let newImage = null;

  // if client sent new images (via files, base64, or url), handle them
  if (req.files || base64 || url) {
    newImage = await uploadHandler({
      req,
      schema: fileValidationSchema,
      allowedTypes: ["image/jpeg", "image/png"],
    });
  }

  const imageCatalog = newImage
    ? [...item.imageCatalog, ...newImage]
    : item.imageCatalog;

  await shopItemValidationSchema.validate(itemData, { abortEarly: false });

  const updatedItem = await ShopItem.findByIdAndUpdate(
    req.params.id,
    { ...itemData, imageCatalog },
    { new: true }
  );

  res.json(updatedItem);
});

// @desc   Delete Item
// @route  DELETE /api/shop-items/:id
// @access Private (admin/super_admin)
const deleteShopItem = asyncHandler(async (req, res) => {
  const item = await ShopItem.findById(req.params.id);
  if (!item) {
    res.status(404);
    throw new Error("Shop item not found");
  }
  // loop through the image catalog and delete each file
  if (item.imageCatalog && item.imageCatalog.length > 0) {
    for (const image of item.imageCatalog) {
      try {
        await deleteFile(image?.path);
      } catch (err) {
        console.error(`Failed to delete file ${image}:`, err.message);
      }
    }
  }
  await ShopItem.deleteOne({ _id: req.params.id });
  res.json({ message: "Shop item deleted successfully", id: req.params.id });
});

module.exports = {
  getShopItems,
  createShopItem,
  updateShopItem,
  deleteShopItem,
};
