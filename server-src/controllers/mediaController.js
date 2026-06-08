const asyncHandler = require("express-async-handler");
const path = require("path");
const {
  uploadHandler,
  deleteFile,
  getFiles,
  deleteAllFiles,
} = require("../helpers/fileManager");

// @desc   Get media files by type
// @route  GET /api/media?type=pictures|videos
// @access Private (super_admin)
const getMedia = asyncHandler(async (req, res) => {
  const { type } = req.query;

  if (!["pictures", "videos"].includes(type)) {
    res.status(400);
    throw new Error("Invalid media type");
  }

  const files = await getFiles(type);

  res.json({
    success: true,
    type,
    count: files.length,
    data: files,
  });
});

// @desc   Upload media files
// @route  POST /api/media?type=pictures|videos
// @access Private (super_admin)
const uploadMedia = asyncHandler(async (req, res) => {
  const { type } = req.query;

  if (!["pictures", "videos"].includes(type)) {
    res.status(400);
    throw new Error("Invalid media type");
  }
  const allowedTypes =
    type === "pictures" ? ["image/jpeg", "image/png"] : ["video/mp4"];

  const result = await uploadHandler({
    req,
    allowedTypes,
  });

  res.status(201).json({
    success: true,
    uploaded: result.results,
    errors: result.errorLogs,
  });
});

// @desc   Delete one or all media files
// @route  DELETE /api/media
// @access Private (super_admin)
const deleteMedia = asyncHandler(async (req, res) => {
  const { method, url, type } = req.body;

  if (!["pictures", "videos"].includes(type)) {
    res.status(400);
    throw new Error("Invalid media type");
  }

  if (method === "delete-all") {
    const deleted = await deleteAllFiles(type);

    return res.json({
      success: true,
      deleted,
    });
  }

  if (method === "delete-one") {
    if (!url) {
      res.status(400);
      throw new Error("Media url required");
    }

    const fileName = path.basename(url);

    const filePath = path.join(
      type === "pictures" ? PICTURES_DIR : VIDEOS_DIR,
      fileName,
    );

    const deleted = await deleteFile(filePath);

    if (!deleted) {
      res.status(404);
      throw new Error("Media file not found");
    }

    return res.json({
      success: true,
      deleted: fileName,
    });
  }

  res.status(400);
  throw new Error("Invalid delete method");
});

module.exports = {
  getMedia,
  uploadMedia,
  deleteMedia,
};
