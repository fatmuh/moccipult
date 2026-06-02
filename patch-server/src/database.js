const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const DB_PATH = process.env.DB_PATH || "./data/patches.db";

// Ensure data directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
  }
  return db;
}

function initDatabase() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS apps (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      package_name TEXT,
      platform TEXT DEFAULT 'android',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS releases (
      id TEXT PRIMARY KEY,
      app_id TEXT NOT NULL,
      version TEXT NOT NULL,
      platform TEXT DEFAULT 'android',
      channel TEXT DEFAULT 'stable',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (app_id) REFERENCES apps(id),
      UNIQUE(app_id, version, platform, channel)
    );

    CREATE TABLE IF NOT EXISTS patches (
      id TEXT PRIMARY KEY,
      release_id TEXT NOT NULL,
      patch_number INTEGER NOT NULL,
      download_url TEXT NOT NULL,
      file_hash TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'disabled', 'rolled_back')),
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (release_id) REFERENCES releases(id)
    );

    CREATE INDEX IF NOT EXISTS idx_patches_release ON patches(release_id);
    CREATE INDEX IF NOT EXISTS idx_patches_number ON patches(patch_number);
    CREATE INDEX IF NOT EXISTS idx_releases_app ON releases(app_id);
  `);

  console.log("✅ Database initialized successfully");
  return db;
}

module.exports = { getDb, initDatabase };
