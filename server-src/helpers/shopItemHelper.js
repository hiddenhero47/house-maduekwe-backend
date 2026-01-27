const normalizeData = (payload = {}) => {
  const normalized = { ...payload };

  // Normalize classTags
  if (Array.isArray(normalized.classTags)) {
    normalized.classTags = [
      ...new Set(
        normalized.classTags
          .map(tag =>
            typeof tag === "string"
              ? tag.toLowerCase().trim()
              : tag
          )
          .filter(Boolean)
      ),
    ];
  }

  // Normalize highlights (trim only, keep case)
  if (Array.isArray(normalized.highlights)) {
    normalized.highlights = normalized.highlights
      .map(h =>
        typeof h === "string" ? h.trim() : h
      )
      .filter(Boolean);
  }

  return normalized;
};

const parseClassTagsFilter = (input) => {
  if (!input || typeof input !== "string") return null;

  // Split OR groups
  const orGroups = input.split("+").map(group =>
    group
      .split("*")
      .map(tag => tag.toLowerCase().trim())
      .filter(Boolean)
  ).filter(group => group.length > 0);

  if (orGroups.length === 0) return null;

  // Convert to MongoDB $or / $all
  return {
    $or: orGroups.map(tags => ({
      classTags: { $all: tags },
    })),
  };
};


module.exports = { normalizeData, parseClassTagsFilter };
