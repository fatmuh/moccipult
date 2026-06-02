/**
 * Storage Adapter Interface
 * 
 * All storage backends must implement these methods:
 * - upload(key, filePath) → { url, size }
 * - download(key) → stream
 * - delete(key) → void
 * - exists(key) → boolean
 * - getUrl(key) → string
 */

class StorageAdapter {
  async upload(key, filePath) {
    throw new Error("Not implemented");
  }

  async download(key) {
    throw new Error("Not implemented");
  }

  async delete(key) {
    throw new Error("Not implemented");
  }

  async exists(key) {
    throw new Error("Not implemented");
  }

  getUrl(key) {
    throw new Error("Not implemented");
  }
}

module.exports = StorageAdapter;
