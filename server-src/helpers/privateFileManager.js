const fs = require("fs");
const path = require("path");

// Sibling to server-src/public/ — deliberately never passed to
// express.static anywhere. The only way to read a file under here is
// through an authenticated controller (see shipmentController.js).
const PRIVATE_DIR = path.join(__dirname, "../private");
const SHIPMENTS_DIR = path.join(PRIVATE_DIR, "shipments");

// Saves a buffer under private/shipments/<shipmentId>/<filename>, creating
// directories as needed. Returns the relative path (relative to
// PRIVATE_DIR) to store on the Shipment document — never the absolute path.
const saveShipmentFile = ({ shipmentId, buffer, filename }) => {
  const shipmentDir = path.join(SHIPMENTS_DIR, String(shipmentId));
  fs.mkdirSync(shipmentDir, { recursive: true });

  const absolutePath = path.join(shipmentDir, filename);
  fs.writeFileSync(absolutePath, buffer);

  return path.join("shipments", String(shipmentId), filename);
};

// Reads a file by the relative path stored on the Shipment document. Throws
// if it's missing — callers decide whether that's a 404 or a
// fallback-to-label-recovery situation.
const readPrivateFile = (relativePath) => {
  const absolutePath = path.join(PRIVATE_DIR, relativePath);

  // Guard against a path escaping PRIVATE_DIR (e.g. "../../..") — relativePath
  // always comes from our own DB records, but this is a cheap, free check.
  if (!absolutePath.startsWith(PRIVATE_DIR)) {
    throw new Error("Invalid file path");
  }

  return fs.readFileSync(absolutePath);
};

// Wipes the whole per-shipment folder in one shot — used once a shipment is
// DELIVERED (see helpers/shipmentHelper.js), so any file kind added later
// (not just the label) gets cleaned up the same way for free.
const deleteShipmentFiles = (shipmentId) => {
  const shipmentDir = path.join(SHIPMENTS_DIR, String(shipmentId));
  fs.rmSync(shipmentDir, { recursive: true, force: true });
};

module.exports = {
  PRIVATE_DIR,
  saveShipmentFile,
  readPrivateFile,
  deleteShipmentFiles,
};
