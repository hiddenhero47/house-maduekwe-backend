const fs = require("fs");
const {
  PRIVATE_DIR,
  saveShipmentFile,
  readPrivateFile,
  deleteShipmentFiles,
} = require("../../server-src/helpers/privateFileManager");

const testShipmentId = "test-shipment-id-privatefilemanager";

afterEach(() => {
  deleteShipmentFiles(testShipmentId);
});

describe("privateFileManager", () => {
  it("saves a file under private/shipments/<id>/ and returns a relative path", () => {
    const relativePath = saveShipmentFile({
      shipmentId: testShipmentId,
      buffer: Buffer.from("hello label"),
      filename: "label.pdf",
    });

    expect(relativePath).toBe(`shipments/${testShipmentId}/label.pdf`);
    expect(fs.existsSync(`${PRIVATE_DIR}/${relativePath}`)).toBe(true);
  });

  it("readPrivateFile returns the exact bytes written", () => {
    const relativePath = saveShipmentFile({
      shipmentId: testShipmentId,
      buffer: Buffer.from("round trip"),
      filename: "label.pdf",
    });

    const buffer = readPrivateFile(relativePath);
    expect(buffer.toString()).toBe("round trip");
  });

  it("rejects a path that tries to escape PRIVATE_DIR", () => {
    expect(() => readPrivateFile("../../../etc/passwd")).toThrow(
      "Invalid file path",
    );
  });

  it("deleteShipmentFiles removes the whole per-shipment folder", () => {
    const relativePath = saveShipmentFile({
      shipmentId: testShipmentId,
      buffer: Buffer.from("x"),
      filename: "label.pdf",
    });

    deleteShipmentFiles(testShipmentId);

    expect(fs.existsSync(`${PRIVATE_DIR}/${relativePath}`)).toBe(false);
    expect(fs.existsSync(`${PRIVATE_DIR}/shipments/${testShipmentId}`)).toBe(false);
  });

  it("deleteShipmentFiles on a non-existent shipment doesn't throw", () => {
    expect(() => deleteShipmentFiles("never-existed")).not.toThrow();
  });
});
