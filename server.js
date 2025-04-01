const express = require("express");
const cors = require("cors");
require("dotenv").config();

const askRoutes = require("./routes/askRoutes");
const verseRoutes = require("./routes/verseRoutes");

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/ask", askRoutes);
app.use("/api/identify-verse", verseRoutes);

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
