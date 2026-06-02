/**
 * S3-Compatible Object Storage Adapter
 * 
 * Works with:
 *   - AWS S3
 *   - MinIO
 *   - Cloudflare R2
 *   - DigitalOcean Spaces
 *   - Wasabi
 *   - Any S3-compatible storage
 * 
 * Environment Variables:
 *   S3_ENDPOINT       — e.g. https://s3.amazonaws.com or http://minio:9000
 *   S3_REGION         — e.g. us-east-1 (default: auto)
 *   S3_BUCKET         — Bucket name
 *   S3_ACCESS_KEY     — Access key ID
 *   S3_SECRET_KEY     — Secret access key
 *   S3_PUBLIC_URL     — Public URL for downloads (optional, auto-generated if not set)
 *   S3_PREFIX         — Key prefix, e.g. "patches/" (default: "")
 */

const fs = require("fs");
const https = require("https");
const http = require("http");
const StorageAdapter = require("./adapter");

class S3Storage extends StorageAdapter {
  constructor() {
    super();

    this.endpoint = process.env.S3_ENDPOINT;
    this.region = process.env.S3_REGION || "auto";
    this.bucket = process.env.S3_BUCKET;
    this.accessKey = process.env.S3_ACCESS_KEY;
    this.secretKey = process.env.S3_SECRET_KEY;
    this.prefix = (process.env.S3_PREFIX || "").replace(/^\/+|\/+$/g, "");
    this.publicUrl = (process.env.S3_PUBLIC_URL || "").replace(/\/+$/, "");

    if (!this.endpoint || !this.bucket || !this.accessKey || !this.secretKey) {
      throw new Error(
        "S3 storage requires: S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY"
      );
    }

    // Normalize endpoint
    this.endpoint = this.endpoint.replace(/\/+$/, "");

    // Build public URL if not set
    if (!this.publicUrl) {
      this.publicUrl = `${this.endpoint}/${this.bucket}`;
    }
  }

  _fullKey(key) {
    return this.prefix ? `${this.prefix}/${key}` : key;
  }

  async upload(key, filePath) {
    const fileBuffer = fs.readFileSync(filePath);
    const fullKey = this._fullKey(key);
    const contentType = "application/octet-stream";

    await this._s3PutObject(fullKey, fileBuffer, contentType);

    return {
      url: `${this.publicUrl}/${fullKey}`,
      size: fileBuffer.length,
      storedPath: fullKey,
    };
  }

  async download(key) {
    const fullKey = this._fullKey(key);
    // Return redirect URL — the download route will redirect to S3
    return `${this.publicUrl}/${fullKey}`;
  }

  async delete(key) {
    const fullKey = this._fullKey(key);
    await this._s3DeleteObject(fullKey);
  }

  async exists(key) {
    const fullKey = this._fullKey(key);
    try {
      await this._s3HeadObject(fullKey);
      return true;
    } catch {
      return false;
    }
  }

  getUrl(key) {
    const fullKey = this._fullKey(key);
    return `${this.publicUrl}/${fullKey}`;
  }

  // ─── AWS Signature V4 Implementation (zero dependencies) ─────────────

  async _s3PutObject(key, data, contentType) {
    const path_ = `/${this.bucket}/${key}`;
    const contentSha256 = this._sha256Hex(data);

    const headers = {
      "Content-Type": contentType,
      "Content-Length": data.length,
      "Host": this._host(),
      "x-amz-content-sha256": contentSha256,
      "x-amz-date": this._amzDate(),
    };

    headers["Authorization"] = this._sign("PUT", path_, headers, contentSha256);

    return this._request("PUT", path_, headers, data);
  }

  async _s3DeleteObject(key) {
    const path_ = `/${this.bucket}/${key}`;
    const payloadHash = this._sha256Hex(Buffer.alloc(0));

    const headers = {
      "Host": this._host(),
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": this._amzDate(),
    };

    headers["Authorization"] = this._sign("DELETE", path_, headers, payloadHash);

    return this._request("DELETE", path_, headers);
  }

  async _s3HeadObject(key) {
    const path_ = `/${this.bucket}/${key}`;
    const payloadHash = this._sha256Hex(Buffer.alloc(0));

    const headers = {
      "Host": this._host(),
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": this._amzDate(),
    };

    headers["Authorization"] = this._sign("HEAD", path_, headers, payloadHash);

    return this._request("HEAD", path_, headers);
  }

  _host() {
    const url = new URL(this.endpoint);
    return url.host;
  }

  _request(method, path_, headers, body) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.endpoint);
      const mod = url.protocol === "https:" ? https : http;

      const opts = {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: path_,
        method: method,
        headers: headers,
      };

      const req = mod.request(opts, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, headers: res.headers, body: data });
          } else {
            reject(new Error(`S3 ${method} ${path_} failed: ${res.statusCode} ${data}`));
          }
        });
      });

      req.on("error", reject);
      if (body) req.write(body);
      req.end();
    });
  }

  // ─── AWS Sig V4 helpers (minimal, zero-dep) ──────────────────────────

  _sha256Hex(data) {
    const crypto = require("crypto");
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  _hmacSha256(key, data) {
    const crypto = require("crypto");
    return crypto.createHmac("sha256", key).update(data).digest();
  }

  _amzDate() {
    return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  }

  _dateStamp() {
    return new Date().toISOString().substring(0, 10).replace(/-/g, "");
  }

  _sign(method, path_, headers, payloadHash) {
    const amzDate = this._amzDate();
    const dateStamp = this._dateStamp();
    const region = this.region;
    const service = "s3";

    // Update headers with correct date
    headers["x-amz-date"] = amzDate;
    headers["x-amz-content-sha256"] = payloadHash;

    // Canonical request
    const signedHeaderKeys = Object.keys(headers)
      .map((k) => k.toLowerCase())
      .sort();
    const signedHeaders = signedHeaderKeys.join(";");

    const canonicalHeaders = signedHeaderKeys
      .map((k) => `${k}:${headers[Object.keys(headers).find((h) => h.toLowerCase() === k)]}\n`)
      .join("");

    const canonicalRequest = [
      method,
      path_,
      "", // query string
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");

    // String to sign
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      this._sha256Hex(Buffer.from(canonicalRequest)),
    ].join("\n");

    // Signing key
    let signingKey = this._hmacSha256(`AWS4${this.secretKey}`, dateStamp);
    signingKey = this._hmacSha256(signingKey, region);
    signingKey = this._hmacSha256(signingKey, service);
    signingKey = this._hmacSha256(signingKey, "aws4_request");

    // Signature
    const crypto = require("crypto");
    const signature = crypto.createHmac("sha256", signingKey).update(stringToSign).digest("hex");

    return `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  }
}

module.exports = S3Storage;
