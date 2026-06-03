/**
 * Shorebird Compatibility Layer
 * 
 * Implements the API endpoints that the Shorebird CLI (CodePushClient) expects.
 * This acts as a bridge between the official Shorebird CLI protocol and our
 * simpler patch server.
 * 
 * Key endpoints:
 *   GET  /api/v1/users/me          → Return a fake authenticated user
 *   GET  /api/v1/organizations      → Return a fake org
 *   GET  /api/v1/apps               → List apps (Shorebird format)
 *   POST /api/v1/apps               → Create app (Shorebird format)
 *   GET  /api/v1/apps/:id/releases  → List releases
 *   POST /api/v1/apps/:id/releases  → Create release
 *   GET  /api/v1/apps/:id/patches   → List patches
 *   POST /api/v1/apps/:id/patches   → Create patch
 *   POST /api/v1/apps/:id/releases/:rid/artifacts  → Upload release artifact
 *   POST /api/v1/apps/:id/patches/:pid/artifacts   → Upload patch artifact
 *   PATCH /api/v1/apps/:id/releases/:rid            → Update release status
 */
const express = require("express");
const router = express.Router();
const multer = require("multer");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const { getDb } = require("../database");
const storage = require("../storage");

const upload = multer({
  dest: path.join(require("os").tmpdir(), "moccipult-shorebird-uploads"),
  limits: { fileSize: 500 * 1024 * 1024 },
});

// ─── Helper: Generate a numeric ID from UUID ────────────────────────────
function toNumericId(uuid) {
  const hash = crypto.createHash("sha256").update(uuid).digest();
  return parseInt(hash.readUInt32BE(0), 10);
}

// ─── Fake authenticated user ─────────────────────────────────────────────
const FAKE_USER = {
  id: 1,
  email: "dev@moccipult.local",
  name: "Moccipult Developer",
};

const FAKE_ORG = {
  id: 1,
  name: "Moccipult",
};

// ===========================================================
// GET /api/v1/users/me — Return current (fake) user
// ===========================================================
router.get("/users/me", (req, res) => {
  res.json(FAKE_USER);
});

// ===========================================================
// POST /api/v1/users — Create user (no-op, return fake)
// ===========================================================
router.post("/users", (req, res) => {
  const { name } = req.body || {};
  res.json({ ...FAKE_USER, name: name || FAKE_USER.name });
});

// ===========================================================
// GET /api/v1/organizations — List fake organizations
// ===========================================================
router.get("/organizations", (req, res) => {
  res.json({
    organizations: [
      {
        organization: FAKE_ORG,
        role: "admin",
      },
    ],
  });
});

// ===========================================================
// GET /api/v1/apps — List apps (Shorebird format)
// ===========================================================
router.get("/apps", (req, res) => {
  const db = getDb();
  const apps = db.prepare("SELECT * FROM apps ORDER BY created_at DESC").all();
  res.json({
    apps: apps.map((app) => ({
      id: app.id,
      displayName: app.name,
      // Shorebird uses int IDs for release/patch, but string UUID for app
    })),
  });
});

// ===========================================================
// POST /api/v1/apps — Create app (Shorebird format)
// ===========================================================
router.post("/apps", (req, res) => {
  const { displayName, organizationId } = req.body || {};
  if (!displayName) {
    return res.status(400).json({ message: "displayName is required" });
  }

  const db = getDb();
  const id = uuidv4();

  try {
    db.prepare(
      `INSERT INTO apps (id, name, platform) VALUES (?, ?, 'android')`
    ).run(id, displayName);

    res.json({ id, displayName });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ===========================================================
// GET /api/v1/apps/:appId/releases — List releases
// ===========================================================
router.get("/apps/:appId/releases", (req, res) => {
  const db = getDb();
  const { appId } = req.params;
  const { sideloadable } = req.query;

  let releases = db
    .prepare("SELECT * FROM releases WHERE app_id = ? ORDER BY created_at DESC")
    .all(appId);

  res.json({
    releases: releases.map((r) => ({
      id: toNumericId(r.id),
      version: r.version,
      platform: { name: r.platform || "android" },
      channel: { name: r.channel || "stable", id: 1 },
      displayName: r.version,
      sideloadable: true,
      status: { name: "active" },
      createdAt: r.created_at,
      updatedAt: r.created_at,
    })),
  });
});

// ===========================================================
// POST /api/v1/apps/:appId/releases — Create release
// ===========================================================
router.post("/apps/:appId/releases", (req, res) => {
  const db = getDb();
  const { appId } = req.params;
  const { version, flutter_revision, flutter_version, display_name } = req.body || {};

  if (!version) {
    return res.status(400).json({ message: "version is required" });
  }

  const id = uuidv4();
  try {
    db.prepare(
      `INSERT INTO releases (id, app_id, version, platform, channel)
       VALUES (?, ?, ?, 'android', 'stable')`
    ).run(id, appId, version);

    const release = {
      id: toNumericId(id),
      version,
      platform: { name: "android" },
      channel: { name: "stable", id: 1 },
      displayName: display_name || version,
      sideloadable: true,
      status: { name: "active" },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    res.json({ release });
  } catch (err) {
    if (err.message.includes("UNIQUE")) {
      return res.status(409).json({ message: "Release already exists" });
    }
    res.status(500).json({ message: err.message });
  }
});

// ===========================================================
// PATCH /api/v1/apps/:appId/releases/:releaseId — Update release
// ===========================================================
router.patch("/apps/:appId/releases/:releaseId", (req, res) => {
  // Accept any status update, no-op for now
  res.json({ ok: true });
});

// ===========================================================
// GET /api/v1/apps/:appId/releases/:releaseId/patches — List patches
// ===========================================================
router.get("/apps/:appId/releases/:releaseId/patches", (req, res) => {
  const db = getDb();
  const { appId, releaseId } = req.params;

  // releaseId might be numeric (from our toNumericId), find the actual release
  let releases = db
    .prepare("SELECT * FROM releases WHERE app_id = ?")
    .all(appId);

  // Try to match by numeric id
  let release = releases.find((r) => toNumericId(r.id) === parseInt(releaseId));
  if (!release) {
    release = releases[0]; // fallback to first
  }

  if (!release) {
    return res.json({ patches: [] });
  }

  const patches = db
    .prepare("SELECT * FROM patches WHERE release_id = ? ORDER BY patch_number DESC")
    .all(release.id);

  res.json({
    patches: patches.map((p) => ({
      id: toNumericId(p.id),
      number: p.patch_number,
      channel: { name: "stable", id: 1 },
      status: { name: p.status === "active" ? "active" : "disabled" },
      createdAt: p.created_at,
      updatedAt: p.created_at,
    })),
  });
});

// ===========================================================
// GET /api/v1/apps/:appId/releases/:releaseId/artifacts — List artifacts
// ===========================================================
router.get("/apps/:appId/releases/:releaseId/artifacts", (req, res) => {
  // Return empty artifacts for now
  res.json({ artifacts: [] });
});

// ===========================================================
// POST /api/v1/apps/:appId/releases/:releaseId/artifacts — Upload artifact
// ===========================================================
router.post(
  "/apps/:appId/releases/:releaseId/artifacts",
  upload.single("file"),
  async (req, res) => {
    const { appId, releaseId } = req.params;
    const db = getDb();

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // Find release
    let releases = db.prepare("SELECT * FROM releases WHERE app_id = ?").all(appId);
    let release = releases.find((r) => toNumericId(r.id) === parseInt(releaseId));

    if (!release) {
      try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(404).json({ message: "Release not found" });
    }

    // Store the artifact
    const arch = req.body.arch || "arm64";
    const platform = req.body.platform || "android";
    const hash = req.body.hash || "";
    const size = req.body.size || req.file.size;
    const storageKey = `${release.id}/release_${releaseId}_${arch}.bin`;

    try {
      const result = await storage.upload(storageKey, req.file.path);
      try { fs.unlinkSync(req.file.path); } catch {}

      // Return a presigned-style URL for upload confirmation
      res.json({
        url: `${result.url}?upload=true`,
        artifact: {
          id: Date.now(),
          arch,
          platform,
          hash,
          size: parseInt(size),
          url: result.url,
        },
      });
    } catch (err) {
      try { fs.unlinkSync(req.file.path); } catch {}
      res.status(500).json({ message: err.message });
    }
  }
);

// ===========================================================
// POST /api/v1/apps/:appId/patches — Create patch
// ===========================================================
router.post("/apps/:appId/patches", (req, res) => {
  const db = getDb();
  const { appId } = req.params;
  const { releaseId, metadata } = req.body || {};

  // Find the release by numeric ID
  let releases = db.prepare("SELECT * FROM releases WHERE app_id = ?").all(appId);
  let release = releases.find((r) => toNumericId(r.id) === parseInt(releaseId));

  if (!release) {
    return res.status(404).json({ message: "Release not found" });
  }

  // Get next patch number
  const maxPatch = db
    .prepare("SELECT MAX(patch_number) as max FROM patches WHERE release_id = ?")
    .get(release.id);
  const patchNumber = (maxPatch.max || 0) + 1;

  const patchId = uuidv4();
  const numericPatchId = toNumericId(patchId);

  db.prepare(
    `INSERT INTO patches (id, release_id, patch_number, download_url, file_hash, file_size, file_path, status)
     VALUES (?, ?, ?, '', '', 0, '', 'active')`
  ).run(patchId, release.id, patchNumber);

  res.json({
    id: numericPatchId,
    number: patchNumber,
    channel: { name: "stable", id: 1 },
    status: { name: "active" },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
});

// ===========================================================
// POST /api/v1/apps/:appId/patches/:patchId/artifacts — Upload patch artifact
// ===========================================================
router.post(
  "/apps/:appId/patches/:patchId/artifacts",
  upload.single("file"),
  async (req, res) => {
    const { appId, patchId } = req.params;
    const db = getDb();

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // Find patch by numeric ID
    const allPatches = db.prepare("SELECT * FROM patches").all();
    const patch = allPatches.find((p) => toNumericId(p.id) === parseInt(patchId));

    if (!patch) {
      try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(404).json({ message: "Patch not found" });
    }

    const arch = req.body.arch || "arm64";
    const platformName = req.body.platform || "android";
    const hash = req.body.hash || "";
    const size = req.body.size || req.file.size;
    const storageKey = `${patch.release_id}/patch_${patch.patch_number}_${arch}.bin`;

    try {
      const fileBuffer = fs.readFileSync(req.file.path);
      const fileHash = hash || crypto.createHash("sha256").update(fileBuffer).digest("hex");
      const fileSize = parseInt(size) || req.file.size;

      const result = await storage.upload(storageKey, req.file.path);
      try { fs.unlinkSync(req.file.path); } catch {}

      // Update patch record with actual data
      db.prepare(
        `UPDATE patches SET download_url = ?, file_hash = ?, file_size = ?, file_path = ? WHERE id = ?`
      ).run(result.url, fileHash, fileSize, storageKey, patch.id);

      // Return upload URL for the artifact
      res.json({
        url: `${result.url}?upload=true`,
      });
    } catch (err) {
      try { fs.unlinkSync(req.file.path); } catch {}
      res.status(500).json({ message: err.message });
    }
  }
);

// ===========================================================
// POST /api/v1/apps/:appId/patches/promote — Promote patch
// ===========================================================
router.post("/apps/:appId/patches/promote", (req, res) => {
  res.json({ ok: true });
});

// ===========================================================
// GET /api/v1/apps/:appId/channels — List channels
// ===========================================================
router.get("/apps/:appId/channels", (req, res) => {
  res.json([
    { id: 1, name: "stable", appId: req.params.appId },
  ]);
});

// ===========================================================
// POST /api/v1/apps/:appId/channels — Create channel
// ===========================================================
router.post("/apps/:appId/channels", (req, res) => {
  const { channel } = req.body || {};
  res.json({ id: Date.now(), name: channel || "stable" });
});

// ===========================================================
// GET /api/v1/diagnostics/* — Speed test endpoints
// ===========================================================
router.get("/diagnostics/gcp_upload", (req, res) => {
  const serverUrl = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3000}`;
  res.json({ upload_url: `${serverUrl}/health` });
});

router.get("/diagnostics/gcp_download", (req, res) => {
  const serverUrl = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3000}`;
  res.json({ download_url: `${serverUrl}/health` });
});

module.exports = router;
