const express = require("express");
const router = express.Router();
const { identifyVerse } = require("../controllers/verseController");
const upload = require("../config/multer");

router.post("/", upload.single("audio"), identifyVerse);

module.exports = router;
