const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
require("dotenv").config();

const { initDatabase } = require("./database");
const appsRouter = require("./routes/apps");
const patchesRouter = require("./routes/patches");
const downloadsRouter = require("./routes/downloads");

const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || "0.0.0.0";

// ─── Global error handlers (prevent crash) ──────────────────────────────
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err.message);
  // Don't crash — keep running
});

process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled Rejection:", reason);
  // Don't crash — keep running
});

// Initialize database
let dbReady = false;
try {
  initDatabase();
  dbReady = true;
} catch (err) {
  console.error("❌ Database init failed:", err.message);
  console.error("   Server will start but database features won't work.");
}

const app = express();

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(morgan("combined"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "Moccipult Patch Server",
    version: "1.0.0",
    storage: process.env.STORAGE_TYPE || "local",
    database: dbReady ? "ok" : "error",
    endpoints: {
      register_app: "POST /api/v1/apps",
      list_apps: "GET /api/v1/apps",
      create_release: "POST /api/v1/releases",
      list_releases: "GET /api/v1/releases?app_id=...",
      upload_patch: "POST /api/v1/patches/upload",
      check_patch: "POST /api/v1/patches/check",
      list_patches: "GET /api/v1/patches?release_id=...",
      update_status: "PATCH /api/v1/patches/:id/status",
      download: "GET /downloads/:release_id/:filename",
    },
  });
});

// API Routes
app.use("/api/v1", appsRouter);
app.use("/api/v1", patchesRouter);
app.use("/", downloadsRouter);

// Error handler
app.use((err, req, res, _next) => {
  console.error("Unhandled error:", err);

  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "File too large" });
  }

  res.status(500).json({ error: "Internal server error" });
});

// Start server
const server = app.listen(PORT, HOST, () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║                                                  ║
║    __  _______  ____________________  __  ____    ║
║   /  |/  / __ / ____/ ____/  _/ __ / / / / /   ║
║  / /|_/ / / / / /   / /    / // /_/ / / / / /    ║
║ / /  / / /_/ / /___/ /____/ // ____/ /_/ / /     ║
║/_/  /_/____/____/____/___/_/    ____/__/     ║
║                                                  ║
║    Patch Server v1.0.0                           ║
║    Server:  http://${HOST}:${PORT}                 ║
║    API:     http://${HOST}:${PORT}/api/v1          ║
║    Storage: ${process.env.STORAGE_TYPE || "local"}                                  ║
║                                                  ║
║    Ready to receive patch requests!              ║
╚══════════════════════════════════════════════════╝
  `);
});

server.on("error", (err) => {
  console.error("❌ Server error:", err.message);
  if (err.code === "EADDRINUSE") {
    console.error(`   Port ${PORT} is already in use.`);
  }
  // Don't exit — let Docker handle restart
});

module.exports = app;
