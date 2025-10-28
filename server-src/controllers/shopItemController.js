const asyncHandler = require("express-async-handler");
const { ShopItem } = require("../models/shopItemModel");
const {
  shopItemValidationSchema,
} = require("../validations/shopItemValidation");
const { fileValidationSchema } = require("../validations/itemImageValidation");
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
            Attribute: attr.Attribute, // expecting Attribute ID
          })),
        };
      }
    } catch (e) {
      res.status(400);
      throw new Error(
        "Invalid attributes filter format — must be a valid JSON array"
      );
    }
  }

  const skip = (page - 1) * limit;

  // ✅ Fetch items with category + attribute population
  const [items, total] = await Promise.all([
    ShopItem.find(query)
      .populate("category", "name") // only bring back category name
      .populate({
        path: "attributes.Attribute",
        select: "name value type display", // fields from Attribute model
      })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
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
  if (!req.files && !base64 && !url) {
    res.status(400);
    throw new Error("Image catalog is required. Please add item images.");
  }

  // ✅ Validate request body with Yup
  await shopItemValidationSchema.validate(req.body, { abortEarly: false });

  // ✅ Upload images (with validation)
  const fileData = await uploadHandler({
    req,
    schema: fileValidationSchema,
    allowedTypes: ["image/jpeg", "image/png"],
  });
  const imageCatalog = fileData.results;

  if (imageCatalog.length === 0) {
    res.status(400);
    throw new Error(fileData.errorLogs);
  }

  // ✅ Construct item object
  const newItem = {
    ...itemData,
    imageCatalog,
  };

  // ✅ Create item
  const shopItem = await ShopItem.create(newItem);

  // ✅ Re-fetch with population
  const populatedItem = await ShopItem.findById(shopItem._id)
    .populate("category", "name")
    .populate({
      path: "attributes.Attribute",
      select: "name value type display",
    })
    .lean();

  // ✅ Send response
  res.status(201).json({
    success: true,
    message: "Shop item created successfully",
    item: populatedItem,
  });
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

  const { base64, url, removeImages, ...itemData } = req.body;
  await shopItemValidationSchema.validate(itemData, { abortEarly: false });

  let imageCatalog = [...item.imageCatalog];
  const imageLogs = [];

  // ✅ Handle image removal
  if (Array.isArray(removeImages) && removeImages.length > 0) {
    const removePaths = removeImages.map((r) => r.path);
    imageCatalog = imageCatalog.filter(
      (img) => !removePaths.includes(img.path)
    );

    for (const path of removePaths) {
      try {
        await deleteFile(path);
      } catch (err) {
        console.error(`⚠️ Failed to delete ${path}:`, err.message);
        imageLogs.push(`Failed to delete ${path}`);
      }
    }
  }

  // ✅ Handle new image uploads
  if (req.files || base64 || url) {
    const fileData = await uploadHandler({
      req,
      schema: fileValidationSchema,
      allowedTypes: ["image/jpeg", "image/png"],
    });

    if (fileData?.results?.length > 0) {
      imageCatalog.push(...fileData.results);
    }
    if (fileData?.errorLogs?.length > 0) {
      imageLogs.push(...fileData.errorLogs);
    }
  }

  // ✅ Update item
  const updatedItem = await ShopItem.findByIdAndUpdate(
    req.params.id,
    { ...itemData, imageCatalog },
    { new: true }
  )
    .populate("category", "name")
    .populate({
      path: "attributes.Attribute",
      select: "name value type display",
    })
    .lean();

  // ✅ Response (reflect partial image issues)
  res.status(200).json({
    success: true,
    message: "Shop item updated successfully",
    item: updatedItem,
    ...(imageLogs.length > 0 && { imageLogs }), // only include if any issues
  });
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
