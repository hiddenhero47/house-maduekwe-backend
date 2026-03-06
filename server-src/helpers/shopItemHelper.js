const { Attribute } = require("../models/attributeModel");

const parseMultipartData = (req) => {
  try {
    return req.body.data ? JSON.parse(req.body.data) : {};
  } catch (err) {
    const error = new Error("Invalid JSON format in 'data' field.");
    error.statusCode = 400;
    throw error;
  }
};

const normalizeData = (payload = {}) => {
  const normalized = { ...payload };

  // Normalize classTags
  if (Array.isArray(normalized.classTags)) {
    normalized.classTags = [
      ...new Set(
        normalized.classTags
          .map((tag) =>
            typeof tag === "string" ? tag.toLowerCase().trim() : tag,
          )
          .filter(Boolean),
      ),
    ];
  }

  // Normalize highlights (trim only, keep case)
  if (Array.isArray(normalized.highlights)) {
    normalized.highlights = normalized.highlights
      .map((h) => (typeof h === "string" ? h.trim() : h))
      .filter(Boolean);
  }

  return normalized;
};

const parseClassTagsFilter = (input) => {
  if (!input || typeof input !== "string") return null;

  // Split OR groups
  const orGroups = input
    .split("+")
    .map((group) =>
      group
        .split("*")
        .map((tag) => tag.toLowerCase().trim())
        .filter(Boolean),
    )
    .filter((group) => group.length > 0);

  if (orGroups.length === 0) return null;

  // Convert to MongoDB $or / $all
  return {
    $or: orGroups.map((tags) => ({
      classTags: { $all: tags },
    })),
  };
};

const sanitizeAttributes = async (attributes = [], removeImages = []) => {
  if (!Array.isArray(attributes) || attributes.length === 0) {
    return attributes;
  }

  let sanitized = [...attributes];

  // ============================================
  // 1️⃣ REMOVE DELETED IMAGES FROM ATTRIBUTES
  // ============================================
  if (Array.isArray(removeImages) && removeImages.length > 0) {
    const removeSet = new Set(
      removeImages
        .flatMap((img) => [img.id, img.path, img.url, img.fileName])
        .filter(Boolean),
    );

    sanitized = sanitized.map((attr) => {
      if (!Array.isArray(attr.images)) return attr;

      return {
        ...attr,
        images: attr.images.filter((img) => {
          return !(
            removeSet.has(img.id) ||
            removeSet.has(img.path) ||
            removeSet.has(img.url) ||
            removeSet.has(img.fileName)
          );
        }),
      };
    });
  }

  // ============================================
  // 2️⃣ ENFORCE SINGLE DEFAULT PER TYPE
  // ============================================

  // Skip if no attribute has isDefault true
  if (!sanitized.some((attr) => attr.isDefault)) {
    return sanitized;
  }

  // Collect unique attribute ids
  const attributeIds = [
    ...new Set(sanitized.map((a) => a.Attribute.toString())),
  ];

  // Fetch types
  const attributeDocs = await Attribute.find({
    _id: { $in: attributeIds },
  })
    .select("_id type")
    .lean();

  const typeMap = {};
  attributeDocs.forEach((doc) => {
    typeMap[doc._id.toString()] = doc.type;
  });

  // Group by type
  const grouped = {};

  sanitized.forEach((attr) => {
    const type = typeMap[attr.Attribute.toString()];
    if (!type) return;

    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(attr);
  });

  // Enforce rule
  Object.values(grouped).forEach((group) => {
    const defaults = group.filter((a) => a.isDefault);

    if (defaults.length > 1) {
      // Turn ALL off if conflict
      group.forEach((a) => {
        a.isDefault = false;
      });
    }
  });

  return sanitized;
};

module.exports = {
  normalizeData,
  parseClassTagsFilter,
  sanitizeAttributes,
  parseMultipartData,
};
