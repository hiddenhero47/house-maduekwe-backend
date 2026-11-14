const asyncHandler = require("express-async-handler");
const { ShopItem, MAX_IMAGE_CATALOG } = require("../models/shopItemModel");
const {
  shopItemValidationSchema,
  imageReorderSchema,
  imageTagSchema,
} = require("../validations/shopItemValidation");
const fileValidationSchema = require("../validations/itemImageValidation");
const { uploadHandler, deleteFile } = require("../helpers/fileManager");
const {
  parseMultipartData,
  normalizeData,
  parseClassTagsFilter,
  sanitizeAttributes,
  sanitizeImageCatalogTags,
  mergeUnique,
} = require("../helpers/shopItemHelper");
const mongoose = require("mongoose");
const ItemGroup = require("../models/itemGroupModel");
const { toPublicShopItem } = require("../helpers/shopItemResponseBuilder");

const PACKAGE_POPULATE_FIELDS = "name length width height weight";

const POPULATE_CHAIN = [
  { path: "category", select: "name" },
  { path: "package", select: PACKAGE_POPULATE_FIELDS },
  { path: "attributes.Attribute", select: "name value type display" },
];

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
    endDate,
    startDate,
    page = 1,
    limit = 12,
  } = req.query;

  const query = {};

  // 🔎 Text search
  if (search) {
    query.$text = { $search: search };

    query.$and = [
      {
        $or: [
          { name: { $regex: `^${search}`, $options: "i" } },
          { brand: { $regex: `^${search}`, $options: "i" } },
          { classTags: { $regex: `^${search}`, $options: "i" } },
        ],
      },
    ];
  }

  // 🏷 classTags filter
  if (classTags) {
    const parsedClassTags = parseClassTagsFilter(classTags);

    if (!parsedClassTags) {
      res.status(400);
      throw new Error("Invalid classTags filter format");
    }

    query.$and = query.$and || [];
    query.$and.push(parsedClassTags);
  }

  // 🗂 Category filters
  if (category) query.category = category;
  if (subCategory) query.subCategory = subCategory;

  // 💰 Price filters
  if (minPrice || maxPrice) {
    query.price = {};
    if (minPrice) query.price.$gte = Number(minPrice);
    if (maxPrice) query.price.$lte = Number(maxPrice);
  }

  // 🎨 Attributes filter
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

  // 📅 Date filtering
  if (startDate || endDate) {
    query.createdAt = {};

    if (startDate) {
      const start = new Date(startDate);
      if (!isNaN(start)) query.createdAt.$gte = start;
    }

    if (endDate) {
      const end = new Date(endDate);
      if (!isNaN(end)) {
        end.setHours(23, 59, 59, 999); // include full day
        query.createdAt.$lte = end;
      }
    }

    // cleanup if empty
    if (Object.keys(query.createdAt).length === 0) {
      delete query.createdAt;
    }
  }

  const skip = (page - 1) * limit;

  // ✅ Fetch items with category + attribute population
  const findQuery = ShopItem.find(
    query,
    search ? { score: { $meta: "textScore" } } : {},
  )
    .populate("category", "name")
    .populate("package", PACKAGE_POPULATE_FIELDS)
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
    data: items.map(toPublicShopItem),
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

  // 🔧 base64/url (if present) live inside the parsed "data" JSON field,
  // not at req.body.base64/url — but uploadHandler only ever looks at
  // req.body.base64/url directly. Sync them so the image the gate check
  // above found is the same one that actually gets uploaded.
  if (base64 !== undefined) req.body.base64 = base64;
  if (url !== undefined) req.body.url = url;

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

  if (imageCatalog.length > MAX_IMAGE_CATALOG) {
    await Promise.all(imageCatalog.map((img) => deleteFile(img.path)));
    res.status(400);
    throw new Error(`A product can have at most ${MAX_IMAGE_CATALOG} images`);
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
    .populate("package", PACKAGE_POPULATE_FIELDS)
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
  // Images are owned by the dedicated /images routes now — base64/url/
  // removeImages/imageCatalog from the old bundled-upload flow are ignored
  // here, never applied to the product.
  const { base64, url, removeImages, imageCatalog: _ignored, ...itemData } =
    normalizeData(parsedData);
  await shopItemValidationSchema.validate(itemData, { abortEarly: false });

  let sanitizedAttributes = itemData.attributes;
  const updatePayload = { ...itemData };

  // Only run if attributes are being updated
  if (Array.isArray(itemData.attributes)) {
    sanitizedAttributes = await sanitizeAttributes(itemData.attributes);
    updatePayload.attributes = sanitizedAttributes;

    const survivingIds = sanitizedAttributes.map((a) => a.Attribute);
    const previousIds = item.attributes.map((a) => a.Attribute);
    const changed =
      survivingIds.length !== previousIds.length ||
      survivingIds.some((id) => !previousIds.some((p) => String(p) === String(id)));

    if (changed) {
      updatePayload.imageCatalog = sanitizeImageCatalogTags(
        item.imageCatalog,
        survivingIds,
      );
    }
  }

  Object.keys(updatePayload).forEach((key) => {
    if (updatePayload[key] === undefined) {
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
    .populate(POPULATE_CHAIN)
    .lean();

  res.status(200).json({
    success: true,
    message: "Shop item updated successfully",
    data: updatedItem,
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

// @desc   Add images to an existing item's catalog
// @route  POST /api/shop-items/:id/images
// @access Private (admin/super_admin)
const addShopItemImages = asyncHandler(async (req, res) => {
  const item = await ShopItem.findById(req.params.id);
  if (!item) {
    res.status(404);
    throw new Error("Shop item not found");
  }

  const fileData = await uploadHandler({
    req,
    schema: fileValidationSchema,
    allowedTypes: ["image/jpeg", "image/png"],
  });

  if (fileData.results.length === 0) {
    res.status(400);
    throw new Error(fileData.errorLogs.join("; ") || "No valid images uploaded");
  }

  if (item.imageCatalog.length + fileData.results.length > MAX_IMAGE_CATALOG) {
    await Promise.all(fileData.results.map((r) => deleteFile(r.path)));
    res.status(400);
    throw new Error(
      `This item already has ${item.imageCatalog.length} of ${MAX_IMAGE_CATALOG} images allowed`,
    );
  }

  item.imageCatalog.push(...fileData.results);
  await item.save();

  const populatedItem = await ShopItem.findById(item._id)
    .populate(POPULATE_CHAIN)
    .lean();

  res.status(201).json({
    success: true,
    message: "Images added successfully",
    data: populatedItem,
    ...(fileData.errorLogs.length > 0 && { imageLogs: fileData.errorLogs }),
  });
});

// @desc   Remove one image from an item's catalog
// @route  DELETE /api/shop-items/:id/images/:imageId
// @access Private (admin/super_admin)
const removeShopItemImage = asyncHandler(async (req, res) => {
  const item = await ShopItem.findById(req.params.id);
  if (!item) {
    res.status(404);
    throw new Error("Shop item not found");
  }

  const image = item.imageCatalog.find((img) => img.id === req.params.imageId);
  if (!image) {
    res.status(404);
    throw new Error("Image not found in catalog");
  }

  await deleteFile(image.path);
  item.imageCatalog = item.imageCatalog.filter(
    (img) => img.id !== req.params.imageId,
  );
  await item.save();

  const populatedItem = await ShopItem.findById(item._id)
    .populate(POPULATE_CHAIN)
    .lean();

  res.status(200).json({
    success: true,
    message: "Image removed successfully",
    data: populatedItem,
  });
});

// @desc   Reorder an item's image catalog
// @route  PATCH /api/shop-items/:id/images/reorder
// @access Private (admin/super_admin)
const reorderShopItemImages = asyncHandler(async (req, res) => {
  await imageReorderSchema.validate(req.body, { abortEarly: false });

  const item = await ShopItem.findById(req.params.id);
  if (!item) {
    res.status(404);
    throw new Error("Shop item not found");
  }

  const { order } = req.body;
  const existingIds = item.imageCatalog.map((img) => img.id);

  const isSamePermutation =
    order.length === existingIds.length &&
    existingIds.every((id) => order.includes(id)) &&
    new Set(order).size === order.length;

  if (!isSamePermutation) {
    res.status(400);
    throw new Error("order must contain exactly the item's existing image ids");
  }

  const byId = new Map(item.imageCatalog.map((img) => [img.id, img]));
  item.imageCatalog = order.map((id) => byId.get(id));
  await item.save();

  const populatedItem = await ShopItem.findById(item._id)
    .populate(POPULATE_CHAIN)
    .lean();

  res.status(200).json({
    success: true,
    message: "Image order updated successfully",
    data: populatedItem,
  });
});

// @desc   Tag an image with the attribute(s) it belongs to
// @route  PATCH /api/shop-items/:id/images/:imageId/tags
// @access Private (admin/super_admin)
const tagShopItemImage = asyncHandler(async (req, res) => {
  await imageTagSchema.validate(req.body, { abortEarly: false });

  const item = await ShopItem.findById(req.params.id);
  if (!item) {
    res.status(404);
    throw new Error("Shop item not found");
  }

  const image = item.imageCatalog.find((img) => img.id === req.params.imageId);
  if (!image) {
    res.status(404);
    throw new Error("Image not found in catalog");
  }

  const { attrTag = [] } = req.body;
  const ownAttributeIds = new Set(
    item.attributes.map((a) => a.Attribute.toString()),
  );
  const invalidIds = attrTag.filter((id) => !ownAttributeIds.has(id));

  if (invalidIds.length > 0) {
    res.status(400);
    throw new Error(
      `attrTag references attribute(s) not on this item: ${invalidIds.join(", ")}`,
    );
  }

  image.attrTag = attrTag;
  await item.save();

  const populatedItem = await ShopItem.findById(item._id)
    .populate(POPULATE_CHAIN)
    .lean();

  res.status(200).json({
    success: true,
    message: "Image tags updated successfully",
    data: populatedItem,
  });
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
    .populate("package", PACKAGE_POPULATE_FIELDS)
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
    data: toPublicShopItem(item),
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
    { path: "package", select: PACKAGE_POPULATE_FIELDS },
    {
      path: "attributes.Attribute",
      select: "name value type display",
    },
  ]);

  res.json({
    success: true,
    total: populatedItems.length,
    data: populatedItems.map(toPublicShopItem),
  });
});

module.exports = {
  getShopItems,
  createShopItem,
  updateShopItem,
  deleteShopItem,
  getShopItemById,
  getRelatedShopItems,
  addShopItemImages,
  removeShopItemImage,
  reorderShopItemImages,
  tagShopItemImage,
};
