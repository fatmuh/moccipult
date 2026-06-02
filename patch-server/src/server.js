const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
require("dotenv").config();

const { initDatabase } = require("./database");
const appsRouter = require("./routes/apps");
const patchesRouter = require("./routes/patches");
const downloadsRouter = require("./routes/downloads");

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";

// Initialize database
initDatabase();

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
app.listen(PORT, HOST, () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║                                                  ║
║    __  _______  ____________________  __  ____    ║
║   /  |/  / __ \/ ____/ ____/  _/ __ \/ / / / /   ║
║  / /|_/ / / / / /   / /    / // /_/ / / / / /    ║
║ / /  / / /_/ / /___/ /____/ // ____/ /_/ / /     ║
║/_/  /_/\____/\____/\____/___/_/    \____/__/     ║
║                                                  ║
║    Patch Server v1.0.0                           ║
║    Server:  http://${HOST}:${PORT}                 ║
║    API:     http://${HOST}:${PORT}/api/v1          ║
║    Storage: ${process.env.STORAGE_PATH || "./patches-storage"}
║                                                  ║
║    Ready to receive patch requests!              ║
╚══════════════════════════════════════════════════╝
  `);
});

module.exports = app;
