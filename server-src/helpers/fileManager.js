const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const axios = require("axios");
const FileType = require("file-type");

// 📂 Base folders
const PUBLIC_DIR = path.join(__dirname, "../public");
const PICTURES_DIR = path.join(PUBLIC_DIR, "pictures");
const VIDEOS_DIR = path.join(PUBLIC_DIR, "videos");

fs.mkdirSync(PICTURES_DIR, { recursive: true });
fs.mkdirSync(VIDEOS_DIR, { recursive: true });

/**
 * 🔒 Validate file type using magic numbers
 */
async function validateFileType(buffer, allowed = ["image/jpeg", "image/png", "video/mp4"]) {
  const type = await FileType.fromBuffer(buffer);
  if (!type) throw new Error("Unable to determine file type");
  if (!allowed.includes(type.mime)) {
    throw new Error(`Unsupported file type: ${type.mime}`);
  }
  return type;
}

/**
 * 📝 Generate file metadata
 */
function generateFileInfo(originalName, mime) {
  const id = uuidv4();
  const extension = path.extname(originalName) || `.${mime.split("/")[1]}`;
  const baseName = path.basename(originalName, extension).replace(/\s+/g, "");
  const uniqueFileName = `${baseName}-${id}${extension}`;

  let subFolder = "";
  if (mime.startsWith("image/")) subFolder = "pictures";
  else if (mime.startsWith("video/")) subFolder = "videos";

  const saveFolder = path.join(PUBLIC_DIR, subFolder);

  return {
    id,
    fileName: uniqueFileName,
    path: path.join(saveFolder, uniqueFileName),
    url: `${process.env.BASE_URL}/${subFolder}/${uniqueFileName}`,
    mime,
  };
}

/**
 * 💾 Save buffer to disk
 */
async function saveBuffer(buffer, originalName, mime) {
  const info = generateFileInfo(originalName, mime);
  await fs.promises.writeFile(info.path, buffer);
  return info;
}

/**
 * 📤 Master upload handler
 */
async function uploadHandler({ req, schema, allowedTypes }) {
  // ✅ Validate request body with Yup if schema is provided
  if (schema) {
    await schema.validate(req.body, { abortEarly: false });
  }

  const results = [];

  // 🎯 Single file (multer -> req.file)
  if (req.file) {
    const type = await validateFileType(req.file.buffer, allowedTypes);
    results.push(await saveBuffer(req.file.buffer, req.file.originalname, type.mime));
  }

  // 🎯 Multiple files (multer -> req.files)
  if (req.files && Array.isArray(req.files)) {
    for (const f of req.files) {
      const type = await validateFileType(f.buffer, allowedTypes);
      results.push(await saveBuffer(f.buffer, f.originalname, type.mime));
    }
  }

  // 🎯 Base64 files (req.body.base64)
  if (req.body?.base64) {
    const base64s = Array.isArray(req.body.base64) ? req.body.base64 : [req.body.base64];
    for (const base64 of base64s) {
      const matches = base64.match(/^data:(.+);base64,(.+)$/);
      if (!matches) throw new Error("Invalid base64 format");

      const mime = matches[1];
      const buffer = Buffer.from(matches[2], "base64");
      const type = await validateFileType(buffer, allowedTypes || [mime]);

      results.push(await saveBuffer(buffer, `base64file.${type.ext}`, type.mime));
    }
  }

  // 🎯 Remote URL (req.body.url) [Optional]
  if (req.body?.url) {
    const response = await axios.get(req.body.url, { responseType: "arraybuffer" });
    const mime = response.headers["content-type"] || "application/octet-stream";
    const type = await validateFileType(response.data, allowedTypes || [mime]);

    results.push(await saveBuffer(response.data, path.basename(req.body.url), type.mime));
  }

  return results;
}

/**
 * 🗑 Delete a file
 */
async function deleteFile(filePath) {
  try {
    await fs.promises.unlink(filePath);
    return true;
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    return false;
  }
}

/**
 * ♻️ Replace an old file with a new one
 */
async function updateFile({oldFilePath, req, schema, allowedTypes}) {
  await deleteFile(oldFilePath);
  return await uploadHandler({ req, schema, allowedTypes });
}

module.exports = {
  uploadHandler,
  deleteFile,
  updateFile,
};
