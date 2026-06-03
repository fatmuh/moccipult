const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const { getDb } = require("../database");

// =============================================
// POST /api/v1/apps — Register a new app
// =============================================
router.post("/apps", (req, res) => {
  // Support both Moccipult format {name, package_name} and Shorebird format {display_name, organization_id}
  const name = req.body.name || req.body.display_name || req.body.displayName;
  const { package_name, platform, organizationId, display_name } = req.body;

  if (!name) {
    return res.status(400).json({ error: "App name is required" });
  }

  const db = getDb();
  const id = uuidv4();

  try {
    db.prepare(
      `INSERT INTO apps (id, name, package_name, platform) VALUES (?, ?, ?, ?)`
    ).run(id, name, package_name || null, platform || "android");

    const app = db.prepare("SELECT * FROM apps WHERE id = ?").get(id);
    // Return in both Moccipult and Shorebird formats
    res.status(201).json({
      ok: true,
      app,
      // Shorebird CodePushClient expects: { id, displayName }
      // but AppMetadata expects: { app_id, display_name, created_at, updated_at }
      id: app.id,
      displayName: app.name,
      app_id: app.id,
      display_name: app.name,
      created_at: app.created_at,
      updated_at: app.updated_at,
    });
  } catch (err) {
    console.error("Error creating app:", err);
    res.status(500).json({ error: "Failed to create app" });
  }
});

// =============================================
// GET /api/v1/apps — List all apps
// =============================================
router.get("/apps", (req, res) => {
  const db = getDb();
  const apps = db.prepare("SELECT * FROM apps ORDER BY created_at DESC").all();
  // Return in Shorebird-compatible format: { apps: [...] }
  res.json({
    ok: true,
    apps: apps.map((app) => ({
      ...app,
      id: app.id,
      displayName: app.name,
    })),
  });
});

// =============================================
// GET /api/v1/apps/:id — Get app details
// =============================================
router.get("/apps/:id", (req, res) => {
  const db = getDb();
  const app = db.prepare("SELECT * FROM apps WHERE id = ?").get(req.params.id);

  if (!app) {
    return res.status(404).json({ error: "App not found" });
  }

  res.json({ ok: true, app });
});

// =============================================
// POST /api/v1/releases — Create a release
// =============================================
router.post("/releases", (req, res) => {
  const { app_id, version, platform, channel } = req.body;

  if (!app_id || !version) {
    return res.status(400).json({ error: "app_id and version are required" });
  }

  const db = getDb();
  const id = uuidv4();

  try {
    db.prepare(
      `INSERT INTO releases (id, app_id, version, platform, channel)
       VALUES (?, ?, ?, ?, ?)`
    ).run(id, app_id, version, platform || "android", channel || "stable");

    const release = db.prepare("SELECT * FROM releases WHERE id = ?").get(id);
    res.status(201).json({ ok: true, release });
  } catch (err) {
    if (err.message.includes("UNIQUE constraint failed")) {
      return res.status(409).json({ error: "Release already exists for this app/version/platform/channel" });
    }
    console.error("Error creating release:", err);
    res.status(500).json({ error: "Failed to create release" });
  }
});

// =============================================
// GET /api/v1/releases?app_id=... — List releases
// =============================================
router.get("/releases", (req, res) => {
  const db = getDb();
  const { app_id } = req.query;

  let releases;
  if (app_id) {
    releases = db
      .prepare("SELECT * FROM releases WHERE app_id = ? ORDER BY created_at DESC")
      .all(app_id);
  } else {
    releases = db.prepare("SELECT * FROM releases ORDER BY created_at DESC").all();
  }

  res.json({ ok: true, releases });
});

module.exports = router;
