const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const uuidv4 = () => crypto.randomUUID();
const axios = require("axios");
async function FileType(buffer) {
  const { fileTypeFromBuffer } = await import("file-type");
  return await fileTypeFromBuffer(buffer);
}

// 📂 Base folders
const PUBLIC_DIR = path.join(__dirname, "../public");
const PICTURES_DIR = path.join(PUBLIC_DIR, "pictures");
const VIDEOS_DIR = path.join(PUBLIC_DIR, "videos");

fs.mkdirSync(PICTURES_DIR, { recursive: true });
fs.mkdirSync(VIDEOS_DIR, { recursive: true });

/**
 * 🔒 Validate file type using magic numbers
 */
async function validateFileType(
  buffer,
  allowed = ["image/jpeg", "image/png", "video/mp4"]
) {
  const type = await FileType(buffer);
  if (!type) throw new Error("Unable to determine file type");
  if (!allowed.includes(type.mime)) {
    return null;
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
  const results = [];
  const errorLogs = [];

  // ✅ Validate request body with Yup if schema is provided
  if (schema) {
    try {
      await schema(req);
    } catch (err) {
      const message = err.inner
        ? err.inner.map(e => e.message).join("; ")
        : err.message;
      errorLogs.push(`Upload validation warning (continued anyway): ${message}`);
      return { results, errorLogs };
    }
  }

  // 🎯 Single file (multer -> req.file)
  if (req.file) {
    try {
      const type = await validateFileType(req.file.buffer, allowedTypes);
      if (type) {
        results.push(
          await saveBuffer(req.file.buffer, req.file.originalname, type.mime)
        );
      } else {
        errorLogs.push(`Unsupported file type: ${req.file.originalname}`);
      }
    } catch (err) {
      errorLogs.push(
        `Error processing file ${req.file.originalname}: ${err.message}`
      );
    }
  }

  // 🎯 Multiple files (multer -> req.files)
  if (req.files && Array.isArray(req.files)) {
    for (const f of req.files) {
      try {
        const type = await validateFileType(f.buffer, allowedTypes);
        if (type) {
          results.push(await saveBuffer(f.buffer, f.originalname, type.mime));
        } else {
          errorLogs.push(`Unsupported file type: ${f.originalname}`);
        }
      } catch (err) {
        errorLogs.push(
          `Error processing file ${f.originalname}: ${err.message}`
        );
      }
    }
  }

  // 🎯 Base64 files (req.body.base64)
  if (req.body?.base64) {
    const base64s = Array.isArray(req.body.base64)
      ? req.body.base64
      : [req.body.base64];
    for (const base64 of base64s) {
      try {
        const matches = base64.match(/^data:(.+);base64,(.+)$/);
        if (!matches) throw new Error("Invalid base64 format");

        const mime = matches[1];
        const buffer = Buffer.from(matches[2], "base64");
        const type = await validateFileType(buffer, allowedTypes || [mime]);

        if (type) {
          results.push(
            await saveBuffer(buffer, `base64file.${type.ext}`, type.mime)
          );
        } else {
          errorLogs.push(`Unsupported base64 file type: ${mime}`);
        }
      } catch (err) {
        errorLogs.push(`Error processing base64 file: ${err.message}`);
      }
    }
  }

  // 🎯 Remote URL (req.body.url)
  if (req.body?.url) {
    const urls = Array.isArray(req.body.url) ? req.body.url : [req.body.url];
    for (const url of urls) {
      try {
        const response = await axios.get(url, { responseType: "arraybuffer" });
        const mime =
          response.headers["content-type"] || "application/octet-stream";
        const type = await validateFileType(
          response.data,
          allowedTypes || [mime]
        );

        if (type) {
          results.push(
            await saveBuffer(response.data, path.basename(url), type.mime)
          );
        } else {
          errorLogs.push(`Unsupported file type from URL: ${url}`);
        }
      } catch (err) {
        errorLogs.push(`Error fetching file from URL ${url}: ${err.message}`);
      }
    }
  }

  return { results, errorLogs };
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
async function updateFile({ oldFilePath, req, schema, allowedTypes }) {
  const results = [];
  const errorLogs = [];
  // Early validation gate — only proceed if validation passes
  if (schema) {
    try {
      await schema(req);  // your validateAvatar function
    } catch (err) {
      const message = err.inner
        ? err.inner.map(e => e.message).join("; ")
        : err.message;

      errorLogs.push(`Validation failed: ${message}`);
      // Do NOT delete old file
      // Do NOT attempt upload
      return { results, errorLogs };
    }
  }
  await deleteFile(oldFilePath);
  return await uploadHandler({ req, schema, allowedTypes });
}

module.exports = {
  uploadHandler,
  deleteFile,
  updateFile,
};
