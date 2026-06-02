const express = require("express");
const router = express.Router();
const path = require("path");

// Serve documentation at root
router.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "docs", "index.html"));
});

module.exports = router;
