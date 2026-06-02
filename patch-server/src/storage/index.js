/**
 * Storage Factory
 * 
 * Picks the right storage adapter based on STORAGE_TYPE env var.
 * 
 *   STORAGE_TYPE=local  → Local filesystem (default)
 *   STORAGE_TYPE=s3     → S3-compatible object storage
 * 
 * Environment Variables:
 * 
 * Local:
 *   STORAGE_PATH   — Local directory (default: ./patches-storage)
 *   SERVER_URL     — Server URL for generating download URLs
 * 
 * S3:
 *   S3_ENDPOINT    — e.g. https://s3.amazonaws.com
 *   S3_REGION      — e.g. us-east-1
 *   S3_BUCKET      — Bucket name
 *   S3_ACCESS_KEY  — Access key
 *   S3_SECRET_KEY  — Secret key
 *   S3_PUBLIC_URL  — (optional) Public download URL
 *   S3_PREFIX      — (optional) Key prefix e.g. "patches/"
 */

const LocalStorage = require("./local");
const S3Storage = require("./s3");

const STORAGE_TYPE = (process.env.STORAGE_TYPE || "local").toLowerCase();

let storage;

switch (STORAGE_TYPE) {
  case "s3":
    storage = new S3Storage();
    console.log(`📦 Storage: S3 (${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET})`);
    break;

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
