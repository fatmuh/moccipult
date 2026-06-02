const express = require("express");
const router = express.Router();
const multer = require("multer");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const { getDb } = require("../database");

require("dotenv").config();

const STORAGE_PATH = process.env.STORAGE_PATH || "./patches-storage";
const SERVER_URL = process.env.SERVER_URL || "http://localhost:3000";

// Ensure storage directory exists
if (!fs.existsSync(STORAGE_PATH)) {
  fs.mkdirSync(STORAGE_PATH, { recursive: true });
}

// Multer config — store temporarily, then we move to final location
const upload = multer({
  dest: path.join(STORAGE_PATH, "tmp"),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
});

// =============================================
// POST /api/v1/patches/upload — Upload a patch
// =============================================
router.post("/patches/upload", upload.single("file"), (req, res) => {
  const { release_id } = req.body;

  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  if (!release_id) {
    return res.status(400).json({ error: "release_id is required" });
  }

  const db = getDb();

  // Verify release exists
  const release = db.prepare("SELECT * FROM releases WHERE id = ?").get(release_id);
  if (!release) {
    // Clean up temp file
    fs.unlinkSync(req.file.path);
    return res.status(404).json({ error: "Release not found" });
  }

  // Calculate file hash (SHA256)
  const fileBuffer = fs.readFileSync(req.file.path);
  const fileHash = crypto.createHash("sha256").update(fileBuffer).digest("hex");
  const fileSize = req.file.size;

  // Get next patch number for this release
  const maxPatch = db
    .prepare("SELECT MAX(patch_number) as max FROM patches WHERE release_id = ?")
    .get(release_id);
  const patchNumber = (maxPatch.max || 0) + 1;

  const patchId = uuidv4();

  // Move file to final location
  const finalDir = path.join(STORAGE_PATH, release_id);
  if (!fs.existsSync(finalDir)) {
    fs.mkdirSync(finalDir, { recursive: true });
  }
  const finalFilename = `patch_${patchNumber}_${patchId}.bin`;
  const finalPath = path.join(finalDir, finalFilename);
  fs.renameSync(req.file.path, finalPath);

  const downloadUrl = `${SERVER_URL}/downloads/${release_id}/${finalFilename}`;

  try {
    db.prepare(
      `INSERT INTO patches (id, release_id, patch_number, download_url, file_hash, file_size, file_path, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`
    ).run(patchId, release_id, patchNumber, downloadUrl, fileHash, fileSize, finalPath);

    const patch = db.prepare("SELECT * FROM patches WHERE id = ?").get(patchId);

    res.status(201).json({
      ok: true,
      patch: {
        id: patch.id,
        release_id: patch.release_id,
        patch_number: patch.patch_number,
        download_url: patch.download_url,
        file_hash: patch.file_hash,
        file_size: patch.file_size,
        status: patch.status,
        created_at: patch.created_at,
      },
    });
  } catch (err) {
    console.error("Error saving patch:", err);
    // Clean up
    if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
    res.status(500).json({ error: "Failed to save patch" });
  }
});

// =============================================
// POST /api/v1/patches/check — Check for updates
// Mimics the Shorebird protocol
// =============================================
router.post("/patches/check", (req, res) => {
  const { release_id, current_patch_number, app_id, version, platform, channel } = req.body;

  const db = getDb();

  let targetReleaseId = release_id;

  // If no release_id provided, look it up by app_id + version + platform
  if (!targetReleaseId && app_id && version) {
    const release = db
      .prepare(
        `SELECT id FROM releases
         WHERE app_id = ? AND version = ? AND platform = ? AND channel = ?
         LIMIT 1`
      )
      .get(app_id, version, platform || "android", channel || "stable");

    if (!release) {
      return res.json({
        ok: true,
        patch_available: false,
        message: "No release found for this app/version",
      });
    }
    targetReleaseId = release.id;
  }

  if (!targetReleaseId) {
    return res.status(400).json({
      error: "Either release_id or (app_id + version) is required",
    });
  }

  // Find the latest active patch for this release
  const latestPatch = db
    .prepare(
      `SELECT * FROM patches
       WHERE release_id = ? AND status = 'active'
       ORDER BY patch_number DESC
       LIMIT 1`
    )
    .get(targetReleaseId);

  if (!latestPatch) {
    return res.json({
      ok: true,
      patch_available: false,
      current_patch_number: current_patch_number || 0,
      message: "No patches available",
    });
  }

  const clientPatch = current_patch_number || 0;

  if (latestPatch.patch_number > clientPatch) {
    return res.json({
      ok: true,
      patch_available: true,
      patch: {
        id: latestPatch.id,
        patch_number: latestPatch.patch_number,
        download_url: latestPatch.download_url,
        file_hash: latestPatch.file_hash,
        file_size: latestPatch.file_size,
      },
    });
  }

  return res.json({
    ok: true,
    patch_available: false,
    current_patch_number: clientPatch,
    message: "Already up to date",
  });
});

// =============================================
// GET /api/v1/patches?release_id=... — List patches
// =============================================
router.get("/patches", (req, res) => {
  const db = getDb();
  const { release_id } = req.query;

  if (!release_id) {
    return res.status(400).json({ error: "release_id query param is required" });
  }

  const patches = db
    .prepare("SELECT * FROM patches WHERE release_id = ? ORDER BY patch_number DESC")
    .all(release_id);

  res.json({ ok: true, patches });
});

// =============================================
// PATCH /api/v1/patches/:id/status — Update patch status
// =============================================
router.patch("/patches/:id/status", (req, res) => {
  const { status } = req.body;

  if (!["active", "disabled", "rolled_back"].includes(status)) {
    return res.status(400).json({ error: "Invalid status. Use: active, disabled, rolled_back" });
  }

  const db = getDb();
  const result = db
    .prepare("UPDATE patches SET status = ? WHERE id = ?")
    .run(status, req.params.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: "Patch not found" });
  }

  res.json({ ok: true, message: `Patch status updated to ${status}` });
});

module.exports = router;
