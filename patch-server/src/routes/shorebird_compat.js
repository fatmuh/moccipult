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

// ─── Helpers ───────────────────────────────────────────────────────────────
const NOW = () => new Date().toISOString();

// Fake IDs
const FAKE_USER_ID = 1;
const FAKE_ORG_ID = 1;

// GET /api/v1/users/me — Return current (fake) user
// PrivateUser expects: id, email, name, memberships (list of {organization, role})
router.get("/users/me", (req, res) => {
  const now = NOW();
  res.json({
    id: FAKE_USER_ID,
    email: "dev@moccipult.local",
    display_name: "Moccipult Developer",
    jwt_issuer: "moccipult",
    has_active_subscription: true,
    stripe_customer_id: null,
    patch_overage_limit: null,
    memberships: [
      {
        organization: {
          id: FAKE_ORG_ID,
          name: "Moccipult",
          organization_type: "personal",
          created_at: now,
          updated_at: now,
        },
        role: "owner",
      },
    ],
  });
});

// ===========================================================
// POST /api/v1/users — Create user (no-op, return fake)
// ===========================================================
router.post("/users", (req, res) => {
  const { name } = req.body || {};
  const now = NOW();
  res.json({
    id: FAKE_USER_ID,
    email: "dev@moccipult.local",
    name: name || "Moccipult Developer",
    memberships: [
      {
        organization: {
          id: FAKE_ORG_ID,
          name: "Moccipult",
          organization_type: "personal",
          created_at: now,
          updated_at: now,
        },
        role: "owner",
      },
    ],
  });
});

// ===========================================================
// GET /api/v1/organizations — List fake organizations
// ===========================================================
router.get("/organizations", (req, res) => {
  const now = new Date().toISOString();
  res.json({
    organizations: [
      {
        organization: {
          id: 1,
          name: "Moccipult",
          organization_type: "personal",
          created_at: now,
          updated_at: now,
        },
        role: "owner",
      },
    ],
  });
});

// NOTE: POST /api/v1/apps is handled by apps.js (which now supports both formats)

// GET /api/v1/apps — List apps (Shorebird AppMetadata format)
router.get("/apps", (req, res) => {
  const db = getDb();
  const apps = db.prepare("SELECT * FROM apps ORDER BY created_at DESC").all();
  const isoDate = (d) => d ? d.replace(' ', 'T') + 'Z' : d;
  res.json({
    apps: apps.map((app) => ({
      app_id: app.id,
      display_name: app.name,
      latest_release_version: null,
      latest_patch_number: null,
      created_at: isoDate(app.created_at),
      updated_at: isoDate(app.updated_at),
    })),
  });
});

// POST /api/v1/apps is handled by apps.js (registered first)
// We don't add a duplicate here to avoid conflicts.

// GET /api/v1/apps/:appId/releases — List releases (Shorebird Release format)
router.get("/apps/:appId/releases", (req, res) => {
  const db = getDb();
  const { appId } = req.params;

  let releases = db
    .prepare("SELECT * FROM releases WHERE app_id = ? ORDER BY created_at DESC")
    .all(appId);

  res.json({
    releases: releases.map((r) => ({
      id: toNumericId(r.id),
      app_id: appId,
      version: r.version,
      flutter_revision: r.flutter_revision || "0000000000000000000000000000000000000000",
      flutter_version: r.flutter_version || null,
      display_name: r.display_name || r.version,
      platform_statuses: { android: "active" },
      created_at: r.created_at,
      updated_at: r.updated_at || r.created_at,
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
      `INSERT INTO releases (id, app_id, version, platform, channel, flutter_revision, flutter_version, display_name, created_at, updated_at)
       VALUES (?, ?, ?, 'android', 'stable', ?, ?, ?, ?, ?)`
    ).run(
      id,
      appId,
      version,
      flutter_revision || "0000000000000000000000000000000000000000",
      flutter_version || null,
      display_name || version,
      NOW(),
      NOW()
    );

    const now = NOW();
    const release = {
      id: toNumericId(id),
      app_id: appId,
      version,
      flutter_revision: flutter_revision || "0000000000000000000000000000000000000000",
      flutter_version: flutter_version || null,
      display_name: display_name || version,
      platform_statuses: { android: "active" },
      created_at: now,
      updated_at: now,
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

  // Find release by numeric ID
  let releases = db.prepare("SELECT * FROM releases WHERE app_id = ?").all(appId);
  let release = releases.find((r) => toNumericId(r.id) === parseInt(releaseId));
  if (!release) release = releases[0];

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
      channel: "stable",
      artifacts: [],
      is_rolled_back: p.status === "rolled_back",
      notes: null,
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
// POST /api/v1/apps/:appId/releases/:releaseId/artifacts — Presign artifact
// Two-step upload: step 1 = presign (no file), step 2 = upload to presigned URL
// ===========================================================
router.post(
  "/apps/:appId/releases/:releaseId/artifacts",
  upload.single("file"),
  async (req, res) => {
    const { appId, releaseId } = req.params;
    const db = getDb();

    // If file is in the request (legacy/curl flow), store it directly
    if (req.file) {
      return storeArtifact(req, res, appId, releaseId);
    }

    // Otherwise: presign step. Generate a presigned URL and return CreateReleaseArtifactResponse.
    let releases = db.prepare("SELECT * FROM releases WHERE app_id = ?").all(appId);
    let release = releases.find((r) => toNumericId(r.id) === parseInt(releaseId));
    if (!release) release = releases[0];

    if (!release) {
      return res.status(404).json({ message: "Release not found" });
    }

    const arch = req.body.arch || "arm64";
    const platform = req.body.platform || "android";
    const hash = req.body.hash || "";
    const size = parseInt(req.body.size) || 0;

    // Presigned URL that the client will POST the file to
    const uploadToken = crypto.randomBytes(16).toString("hex");
    const presignedUrl = `${req.protocol}://${req.get("host")}/api/v1/uploads/${uploadToken}?appId=${appId}&releaseId=${releaseId}&arch=${arch}&platform=${platform}&hash=${encodeURIComponent(hash)}&size=${size}`;

    const artifactId = Date.now();
    res.json({
      id: artifactId,
      release_id: parseInt(releaseId),
      arch: arch,
      platform: platform,
      hash: hash,
      size: size,
      url: presignedUrl,
    });
  }
);

// ===========================================================
// POST /api/v1/uploads/:token — Receive file from presigned URL
// ===========================================================
router.post(
  "/uploads/:token",
  upload.single("file"),
  async (req, res) => {
    const { appId, releaseId, arch, platform, hash, size } = req.query;

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // Mimic req.body for the storeArtifact helper
    req.body = { arch, platform, hash, size };
    return storeArtifact(req, res, appId, releaseId, /*fromPresigned*/ true);
  }
);

// Helper to store an artifact (file already in req.file)
async function storeArtifact(req, res, appId, releaseId, fromPresigned = false) {
  const db = getDb();

  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  let releases = db.prepare("SELECT * FROM releases WHERE app_id = ?").all(appId);
  let release = releases.find((r) => toNumericId(r.id) === parseInt(releaseId));
  if (!release) release = releases[0];

  if (!release) {
    try { fs.unlinkSync(req.file.path); } catch {}
    return res.status(404).json({ message: "Release not found" });
  }

  const arch = req.body.arch || "arm64";
  const platform = req.body.platform || "android";
  const hash = req.body.hash || "";
  const size = parseInt(req.body.size) || req.file.size;
  const storageKey = `${release.id}/release_${releaseId}_${arch}.bin`;

  try {
    const result = await storage.upload(storageKey, req.file.path);
    try { fs.unlinkSync(req.file.path); } catch {}

    if (fromPresigned) {
      return res.json({ success: true, url: result.url });
    }

    res.json({
      id: Date.now(),
      release_id: parseInt(releaseId),
      arch: arch,
      platform: platform,
      hash: hash || "",
      size: size,
      url: result.url,
    });
  } catch (err) {
    try { fs.unlinkSync(req.file.path); } catch {}
    res.status(500).json({ message: err.message });
  }
}

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

      // Return in CreatePatchArtifactResponse format
      res.json({
        id: Date.now(),
        patch_id: parseInt(patchId),
        arch: arch,
        platform: platformName,
        hash: fileHash,
        size: fileSize,
        url: result.url,
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
