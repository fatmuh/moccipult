/**
 * Local Filesystem Storage Adapter
 * Stores patch files on the local disk.
 */

const fs = require("fs");
const path = require("path");
const StorageAdapter = require("./adapter");

class LocalStorage extends StorageAdapter {
  constructor(storagePath, serverUrl) {
    super();
    this.storagePath = storagePath || "./patches-storage";
    this.serverUrl = (serverUrl || "http://localhost:3000").replace(/\/+$/, "");

    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  async upload(key, filePath) {
    const finalDir = path.join(this.storagePath, path.dirname(key));
    if (!fs.existsSync(finalDir)) {
      fs.mkdirSync(finalDir, { recursive: true });
    }

    const finalPath = path.join(this.storagePath, key);
    // Use copy+delete instead of rename to handle cross-device (C: → D: on Windows)
    fs.copyFileSync(filePath, finalPath);
    try { fs.unlinkSync(filePath); } catch {}

    const stat = fs.statSync(finalPath);
    return {
      url: `${this.serverUrl}/downloads/${key}`,
      size: stat.size,
      storedPath: finalPath,
    };
  }

  async download(key) {
    const filePath = path.join(this.storagePath, key);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return fs.createReadStream(filePath);
  }

  async delete(key) {
    const filePath = path.join(this.storagePath, key);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  async exists(key) {
    return fs.existsSync(path.join(this.storagePath, key));
  }

  getUrl(key) {
    return `${this.serverUrl}/downloads/${key}`;
  }

  getFilePath(key) {
    return path.join(this.storagePath, key);
  }
}

module.exports = LocalStorage;
