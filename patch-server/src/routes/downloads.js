const express = require("express");
const fs = require("fs");
const path = require("path");
const { getDb } = require("../database");

require("dotenv").config();

const storage = require("../storage");
const STORAGE_TYPE = (process.env.STORAGE_TYPE || "local").toLowerCase();

const router = express.Router();

// =============================================
// GET /downloads/:release_id/:filename — Download a patch file
// =============================================
router.get("/downloads/:release_id/:filename", async (req, res) => {
  const { release_id, filename } = req.params;

  const db = getDb();

  // Verify patch exists and is active
  const patch = db
    .prepare(
      `SELECT * FROM patches
       WHERE release_id = ? AND download_url LIKE ?
       AND status = 'active'
       LIMIT 1`
    )
    .get(release_id, `%${filename}%`);

  if (!patch) {
    return res.status(404).json({ error: "Patch file not found or not active" });
  }

  const key = `${release_id}/${filename}`;

  if (STORAGE_TYPE === "s3") {
    // S3: Redirect to the public object URL
    const url = storage.getUrl(key);
    return res.redirect(url);
  }

  // Local: Stream file from disk
  const filePath = storage.getFilePath(key);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found on disk" });
  }

  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Length", patch.file_size);
  res.setHeader("X-Patch-Hash", patch.file_hash);
  res.setHeader("X-Patch-Number", patch.patch_number);

  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);
});

module.exports = router;
