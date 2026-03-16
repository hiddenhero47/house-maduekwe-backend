const asyncHandler = require("express-async-handler");
const ItemGroup = require("../models/itemGroupModel");
const ShopItem = require("../models/shopItemModel");

// @desc    Get all item groups
// @route   GET /api/item-groups
// @access  Public or Private (depending on your app)
const getItemGroups = asyncHandler(async (req, res) => {
  const { search, groupId, shopItemId, page = 1, limit = 10 } = req.query;

  const query = {};

  // 🔎 Search by group name
  if (search) {
    query.groupName = { $regex: search, $options: "i" };
  }

  // 🔎 Search by ItemGroup ID
  if (groupId && mongoose.Types.ObjectId.isValid(groupId)) {
    query._id = groupId;
  }

  // 🔎 Search by ShopItem ID inside group
  if (shopItemId && mongoose.Types.ObjectId.isValid(shopItemId)) {
    query.shopItems = shopItemId;
  }

  const skip = (page - 1) * limit;

  const [groups, total] = await Promise.all([
    ItemGroup.find(query)
      .populate({
        path: "shopItems",
        populate: [
          { path: "category", select: "name" },
          {
            path: "attributes.Attribute",
            select: "name value type display",
          },
        ],
      })
      .skip(skip)
      .limit(Number(limit))
      .sort({ createdAt: -1 }),

    ItemGroup.countDocuments(query),
  ]);

  res.json({
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / limit),
    },
    data: groups,
  });
});

// @desc    Create a new item group
// @route   POST /api/item-groups
// @access  Private (Admin)
const createItemGroup = asyncHandler(async (req, res) => {
  const { groupName, shopItems = [] } = req.body;

  // ✅ Validate that groupName exists
  if (!groupName) {
    res.status(400);
    throw new Error("Group name is required");
  }

  // ✅ Validate that all shopItems exist (if provided)
  if (shopItems.length > 0) {
    const foundItems = await ShopItem.find({ _id: { $in: shopItems } });
    if (foundItems.length !== shopItems.length) {
      res.status(400);
      throw new Error("One or more shop items do not exist");
    }
  }

  const newGroup = await ItemGroup.create({ groupName, shopItems });
  const populatedGroup = await newGroup.populate("shopItems");

  res.status(201).json(populatedGroup);
});

// @desc    Update an existing item group
// @route   PUT /api/item-groups/:id
// @access  Private (Admin)
const updateItemGroup = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { groupName, shopItems } = req.body;

  const group = await ItemGroup.findById(id);
  if (!group) {
    res.status(404);
    throw new Error("Item group not found");
  }

  if (groupName) group.groupName = groupName;

  if (Array.isArray(shopItems)) {
    // ✅ Validate that all shopItems exist
    const foundItems = await ShopItem.find({ _id: { $in: shopItems } });
    if (foundItems.length !== shopItems.length) {
      res.status(400);
      throw new Error("One or more shop items do not exist");
    }

    group.shopItems = shopItems;
  }

  await group.save();
  const populatedGroup = await group.populate("shopItems");

  res.json(populatedGroup);
});

// @desc    Delete an item group
// @route   DELETE /api/item-groups/:id
// @access  Private (Admin)
const deleteItemGroup = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const group = await ItemGroup.findById(id);
  if (!group) {
    res.status(404);
    throw new Error("Item group not found");
  }

  await group.deleteOne();

  res.json({ message: "Item group removed successfully" });
});

module.exports = {
  getItemGroups,
  createItemGroup,
  updateItemGroup,
  deleteItemGroup,
};
