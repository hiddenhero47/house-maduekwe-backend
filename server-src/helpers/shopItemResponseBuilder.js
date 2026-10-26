// Shapes a ShopItem document for public-facing responses — strips internal
// bookkeeping fields that have no business being sent over the wire.
// First instance of a response-builder pattern in this codebase; admin-
// facing responses (create/update) stay full since the admin manages these
// fields directly.
const toPublicShopItem = (item) => {
  if (!item) return item;

  const { isDeleted, deletedAt, __v, ...publicItem } = item;
  return publicItem;
};

module.exports = { toPublicShopItem };
