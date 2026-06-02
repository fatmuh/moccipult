/**
 * End-to-end test for the Shorebird Patch Server
 * Run: node test-server.js
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const BASE = "http://127.0.0.1:3001";

function request(method, urlPath, body, isMultipart = false) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {},
    };

    if (isMultipart) {
      // For multipart, body is a string path
      const boundary = "----TestBoundary" + Date.now();
      const fileData = fs.readFileSync(body);
      const fileName = path.basename(body);

      const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`;
      const footer = `\r\n--${boundary}\r\nContent-Disposition: form-data; name="release_id"\r\n\r\n${body.releaseId}\r\n--${boundary}--\r\n`;

      // Build multipart body
      const parts = [
        Buffer.from(header, "utf8"),
        fileData,
        Buffer.from(footer, "utf8"),
      ];
      const payload = Buffer.concat(parts);

      opts.headers["Content-Type"] = `multipart/form-data; boundary=${boundary}`;
      opts.headers["Content-Length"] = payload.length;

      const req = http.request(opts, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, data: data });
          }
        });
      });
      req.on("error", reject);
      req.write(payload);
      req.end();
    } else {
      opts.headers["Content-Type"] = "application/json";
      const req = http.request(opts, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, data: data });
          }
        });
      });
      req.on("error", reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    }
  });
}

async function runTests() {
  console.log("🧪 Starting End-to-End Tests\n");

  // 0. Health check
  console.log("0️⃣  Health Check...");
  const health = await request("GET", "/");
  console.log(`   Status: ${health.status}`);
  console.log(`   Service: ${health.data.service}`);
  assert(health.data.ok === true, "Health check ok");
  console.log("   ✅ PASS\n");

  // 1. Register App
  console.log("1️⃣  Register App...");
  const appResp = await request("POST", "/api/v1/apps", {
    name: "Test App",
    package_name: "com.test.app",
    platform: "android",
  });
  console.log(`   Status: ${appResp.status}`);
  assert(appResp.status === 201, "App created (201)");
  assert(appResp.data.ok === true, "App ok");
  const appId = appResp.data.app.id;
  console.log(`   App ID: ${appId}`);
  console.log("   ✅ PASS\n");

  // 2. List Apps
  console.log("2️⃣  List Apps...");
  const appsResp = await request("GET", "/api/v1/apps");
  assert(appsResp.data.ok === true, "Apps list ok");
  console.log(`   Found ${appsResp.data.apps.length} app(s)`);
  console.log("   ✅ PASS\n");

  // 3. Create Release
  console.log("3️⃣  Create Release...");
  const relResp = await request("POST", "/api/v1/releases", {
    app_id: appId,
    version: "1.0.0",
    platform: "android",
    channel: "stable",
  });
  console.log(`   Status: ${relResp.status}`);
  assert(relResp.status === 201, "Release created (201)");
  assert(relResp.data.ok === true, "Release ok");
  const relId = relResp.data.release.id;
  console.log(`   Release ID: ${relId}`);
  console.log("   ✅ PASS\n");

  // 4. Check patches (none yet)
  console.log("4️⃣  Check Patches (none expected)...");
  const check1 = await request("POST", "/api/v1/patches/check", {
    app_id: appId,
    version: "1.0.0",
    current_patch_number: 0,
    platform: "android",
    channel: "stable",
  });
  assert(check1.data.ok === true, "Check ok");
  assert(check1.data.patch_available === false, "No patch available");
  console.log(`   Patch available: ${check1.data.patch_available}`);
  console.log("   ✅ PASS\n");

  // 5. Upload Patch (using raw http multipart)
  console.log("5️⃣  Upload Patch...");
  const patchFilePath = path.join(__dirname, "patch-server", "src", "server.js");
  const fileData = fs.readFileSync(patchFilePath);
  const fileHash = require("crypto").createHash("sha256").update(fileData).digest("hex");

  // Build multipart manually
  const boundary = "----PatchBoundary" + Date.now();
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="patch.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`),
    fileData,
    Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="release_id"\r\n\r\n${relId}\r\n--${boundary}--\r\n`),
  ]);

  const uploadResp = await new Promise((resolve, reject) => {
    const url = new URL("/api/v1/patches/upload", BASE);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": payload.length,
      },
    };
    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });

  console.log(`   Status: ${uploadResp.status}`);
  assert(uploadResp.status === 201, "Patch uploaded (201)");
  assert(uploadResp.data.ok === true, "Upload ok");
  console.log(`   Patch number: ${uploadResp.data.patch.patch_number}`);
  console.log(`   File hash: ${uploadResp.data.patch.file_hash.substring(0, 16)}...`);
  console.log(`   File size: ${uploadResp.data.patch.file_size} bytes`);
  console.log("   ✅ PASS\n");

  // 6. Check patches (should find one)
  console.log("6️⃣  Check Patches (patch available)...");
  const check2 = await request("POST", "/api/v1/patches/check", {
    app_id: appId,
    version: "1.0.0",
    current_patch_number: 0,
    platform: "android",
    channel: "stable",
  });
  assert(check2.data.ok === true, "Check ok");
  assert(check2.data.patch_available === true, "Patch available");
  console.log(`   Patch available: ${check2.data.patch_available}`);
  console.log(`   Patch number: ${check2.data.patch.patch_number}`);
  console.log(`   Download URL: ${check2.data.patch.download_url}`);
  console.log("   ✅ PASS\n");

  // 7. Check patches (already up to date)
  console.log("7️⃣  Check Patches (already up to date)...");
  const check3 = await request("POST", "/api/v1/patches/check", {
    app_id: appId,
    version: "1.0.0",
    current_patch_number: 1,
    platform: "android",
    channel: "stable",
  });
  assert(check3.data.patch_available === false, "No newer patch");
  console.log(`   Patch available: ${check3.data.patch_available}`);
  console.log(`   Message: ${check3.data.message}`);
  console.log("   ✅ PASS\n");

  // 8. List patches
  console.log("8️⃣  List Patches for Release...");
  const patchesResp = await request("GET", "/api/v1/patches?release_id=" + relId);
  console.log(`   Response status: ${patchesResp.status}, ok: ${patchesResp.data.ok}`);
  assert(patchesResp.status === 200, "Patches list returns 200");
  assert(patchesResp.data.ok === true, "Patches list ok");
  console.log(`   Found ${patchesResp.data.patches.length} patch(es)`);
  console.log("   ✅ PASS\n");

  // Summary
  console.log("═".repeat(50));
  console.log("  🎉 ALL TESTS PASSED!");
  console.log("═".repeat(50));
}

function assert(condition, message) {
  if (!condition) {
    console.error(`   ❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("❌ Test error:", err.message);
  console.error("\nMake sure the server is running:");
  console.error("  cd patch-server && PORT=3001 node src/server.js &");
  process.exit(1);
});
