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

  const attributeIds = [
    ...new Set(attributes.map((a) => a.Attribute?.toString()).filter(Boolean)),
  ];

  const attributeDocs = await Attribute.find({
    _id: { $in: attributeIds },
  })
    .select("_id type")
    .lean();

  const typeMap = new Map(
    attributeDocs.map((doc) => [doc._id.toString(), doc.type]),
  );

  sanitized = sanitized.map((attr) => ({
    ...attr,
    type: typeMap.get(attr.Attribute.toString()),
  }));

  return sanitized;
};

const mergeUnique = (existing, incoming, limit) => {
  const map = new Map();

  // add existing items first
  for (const item of existing) {
    map.set(String(item._id), item);
  }

  // add new items if not already present
  for (const item of incoming) {
    if (!map.has(String(item._id))) {
      map.set(String(item._id), item);
    }

    if (map.size >= limit) break;
  }

  return Array.from(map.values()).slice(0, limit);
};

module.exports = {
  normalizeData,
  parseClassTagsFilter,
  sanitizeAttributes,
  parseMultipartData,
  mergeUnique,
};
