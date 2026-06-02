/**
 * Storage Factory
 * 
 * Gracefully handles missing config — falls back to local if S3 fails.
 */

const LocalStorage = require("./local");
const S3Storage = require("./s3");

const STORAGE_TYPE = (process.env.STORAGE_TYPE || "local").toLowerCase();

let storage;

switch (STORAGE_TYPE) {
  case "s3": {
    const missing = [];
    if (!process.env.S3_ENDPOINT) missing.push("S3_ENDPOINT");
    if (!process.env.S3_BUCKET) missing.push("S3_BUCKET");
    if (!process.env.S3_ACCESS_KEY) missing.push("S3_ACCESS_KEY");
    if (!process.env.S3_SECRET_KEY) missing.push("S3_SECRET_KEY");

    if (missing.length > 0) {
      console.error(`❌ S3 storage enabled but missing: ${missing.join(", ")}`);
      console.error("   Falling back to local storage.");
      storage = new LocalStorage(
        process.env.STORAGE_PATH || "./patches-storage",
        process.env.SERVER_URL || "http://localhost:3000"
      );
      console.log(`📦 Storage: Local (fallback)`);
    } else {
      try {
        storage = new S3Storage();
        console.log(`📦 Storage: S3 (${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET})`);
      } catch (err) {
        console.error(`❌ S3 storage init failed: ${err.message}`);
        console.error("   Falling back to local storage.");
        storage = new LocalStorage(
          process.env.STORAGE_PATH || "./patches-storage",
          process.env.SERVER_URL || "http://localhost:3000"
        );
        console.log(`📦 Storage: Local (fallback)`);
      }
    }
    break;
  }

  case "local":
  default:
    storage = new LocalStorage(
      process.env.STORAGE_PATH || "./patches-storage",
      process.env.SERVER_URL || "http://localhost:3000"
    );
    console.log(`📦 Storage: Local (${process.env.STORAGE_PATH || "./patches-storage"})`);
    break;
}

module.exports = storage;
