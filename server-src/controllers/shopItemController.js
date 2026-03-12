const asyncHandler = require("express-async-handler");
const { ShopItem } = require("../models/shopItemModel");
const {
  shopItemValidationSchema,
} = require("../validations/shopItemValidation");
const fileValidationSchema = require("../validations/itemImageValidation");
const { uploadHandler, deleteFile } = require("../helpers/fileManager");
const {
  parseMultipartData,
  normalizeData,
  parseClassTagsFilter,
  sanitizeAttributes,
  mergeUnique,
} = require("../helpers/shopItemHelper");
const mongoose = require("mongoose");
const ItemGroup = require("../models/itemGroupModel");

// @desc   Public Get Items (with filters + pagination)
// @route  GET /api/shop-items
// @access Public
const getShopItems = asyncHandler(async (req, res) => {
  const {
    search,
    category,
    subCategory,
    minPrice,
    maxPrice,
    attributes,
    classTags,
    page = 1,
    limit = 12,
  } = req.query;

  const query = {};

  if (search) {
    query.$or = [
      { $text: { $search: search } },
      { name: { $regex: `^${search}`, $options: "i" } },
      { brand: { $regex: `^${search}`, $options: "i" } },
    ];
  }

  if (classTags) {
    const parsedClassTags = parseClassTagsFilter(classTags);

    if (!parsedClassTags) {
      res.status(400);
      throw new Error("Invalid classTags filter format");
    }

    query.$and = query.$and || [];
    query.$and.push(parsedClassTags);
  }

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
        "Invalid attributes filter format — must be a valid JSON array",
      );
    }
  }

  const skip = (page - 1) * limit;

  // ✅ Fetch items with category + attribute population
  const findQuery = ShopItem.find(
    query,
    search ? { score: { $meta: "textScore" } } : {},
  )
    .populate("category", "name")
    .populate({
      path: "attributes.Attribute",
      select: "name value type display",
    })
    .skip(skip)
    .limit(Number(limit));

  if (search) {
    findQuery.sort({ score: { $meta: "textScore" } });
  }

  const [items, total] = await Promise.all([
    findQuery.lean(),
    ShopItem.countDocuments(query),
  ]);

  res.json({
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / limit),
    },
    data: items,
  });
});

// @desc   Create Item
// @route  POST /api/shop-items
// @access Private (admin/super_admin)
const createShopItem = asyncHandler(async (req, res) => {
  const parsedData = parseMultipartData(req);
  const { base64, url, ...itemData } = normalizeData(parsedData);

  // ✅ Ensure required image data
  if ((!req.files || req.files.length === 0) && !base64 && !url) {
    res.status(400);
    throw new Error("Image catalog is required. Please add item images.");
  }

  // ✅ Validate request body with Yup
  await shopItemValidationSchema.validate(itemData, { abortEarly: false });

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
    data: populatedItem,
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

  const parsedData = parseMultipartData(req);
  const { base64, url, removeImages, ...itemData } = normalizeData(parsedData);
  await shopItemValidationSchema.validate(itemData, { abortEarly: false });

  let imageCatalog = [...item.imageCatalog];
  const imageLogs = [];

  // ✅ Handle image removal
  if (Array.isArray(removeImages) && removeImages.length > 0) {
    const removePaths = removeImages.map((r) => r.path);
    imageCatalog = imageCatalog.filter(
      (img) => !removePaths.includes(img.path),
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

  let sanitizedAttributes = itemData.attributes;

  // Only run if attributes are being updated
  if (Array.isArray(itemData.attributes)) {
    sanitizedAttributes = await sanitizeAttributes(
      itemData.attributes,
      removeImages,
    );
  }

  // Sanitize
  const updatePayload = {
    ...itemData,
    imageCatalog,
    attributes: sanitizedAttributes,
  };
  Object.keys(updatePayload).forEach((key) => {
    if (key !== "imageCatalog" && updatePayload[key] === undefined) {
      delete updatePayload[key];
    }
  });

  // ✅ Update item
  const updatedItem = await ShopItem.findByIdAndUpdate(
    req.params.id,
    { $set: updatePayload },
    {
      new: true,
      runValidators: true,
    },
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
    data: updatedItem,
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

// @desc   Public Get Single Shop Item
// @route  GET /api/shop-items/:id
// @access Public
const getShopItemById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400);
    throw new Error("Invalid shop item ID");
  }

  const item = await ShopItem.findOne({
    _id: id,
    isDeleted: false,
  })
    .populate("category", "name")
    .populate({
      path: "attributes.Attribute",
      select: "name value type display",
    })
    .lean();

  if (!item) {
    res.status(404);
    throw new Error("Shop item not found");
  }

  res.json({
    success: true,
    data: item,
  });
});

// @desc   Public Get Related Shop Items
// @route  GET /api/shop-items/:id/related
// @access Public
const getRelatedShopItems = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const limit = Number(req.query.limit) || 8;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400);
    throw new Error("Invalid shop item ID");
  }

  const baseItem = await ShopItem.findOne({
    _id: id,
    isDeleted: false,
  }).lean();

  if (!baseItem) {
    res.status(404);
    throw new Error("Shop item not found");
  }

  let relatedItems = [];

  /* ===========================
     1️⃣ ITEM GROUPS (strongest)
     =========================== */
  const groups = await ItemGroup.find({
    shopItems: id,
  }).select("shopItems");

  if (groups.length) {
    const groupItemIds = [
      ...new Set(
        groups
          .flatMap((g) => g.shopItems.map(String))
          .filter((itemId) => itemId !== id),
      ),
    ];

    const groupItems = await ShopItem.find({
      _id: { $in: groupItemIds },
      isDeleted: false,
    })
      .limit(limit)
      .lean();

    relatedItems = mergeUnique(relatedItems, groupItems, limit);
  }

  /* ===========================
     2️⃣ SAME SUBCATEGORY
     =========================== */
  if (relatedItems.length < limit && baseItem.subCategory) {
    const subCategoryItems = await ShopItem.find({
      _id: { $ne: id },
      subCategory: baseItem.subCategory,
      isDeleted: false,
    })
      .limit(limit)
      .lean();

    relatedItems = mergeUnique(relatedItems, subCategoryItems, limit);
  }

  /* ===========================
     3️⃣ CLASS TAGS
     =========================== */
  if (
    relatedItems.length < limit &&
    Array.isArray(baseItem.classTags) &&
    baseItem.classTags.length
  ) {
    const classTagItems = await ShopItem.find({
      _id: { $ne: id },
      classTags: { $in: baseItem.classTags },
      isDeleted: false,
    })
      .limit(limit)
      .lean();

    relatedItems = mergeUnique(relatedItems, classTagItems, limit);
  }

  /* ===========================
     4️⃣ ATTRIBUTES (weakest)
     =========================== */
  if (
    relatedItems.length < limit &&
    Array.isArray(baseItem.attributes) &&
    baseItem.attributes.length
  ) {
    const attributeIds = baseItem.attributes.map((a) => a.Attribute);

    const attributeItems = await ShopItem.find({
      _id: { $ne: id },
      "attributes.Attribute": { $in: attributeIds },
      isDeleted: false,
    })
      .limit(limit)
      .lean();

    relatedItems = mergeUnique(relatedItems, attributeItems, limit);
  }

  /* ===========================
     POPULATE ONCE (FINAL)
     =========================== */
  const populatedItems = await ShopItem.populate(relatedItems, [
    { path: "category", select: "name" },
    {
      path: "attributes.Attribute",
      select: "name value type display",
    },
  ]);

  res.json({
    success: true,
    total: populatedItems.length,
    data: populatedItems,
  });
});

module.exports = {
  getShopItems,
  createShopItem,
  updateShopItem,
  deleteShopItem,
  getShopItemById,
  getRelatedShopItems,
};
