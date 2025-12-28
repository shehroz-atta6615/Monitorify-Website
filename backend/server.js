import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import path from "path";
import fs from "fs";

import publicRoutes from "./src/routes/publicRoutes.js";
import apiRoutes from "./src/routes/apiRoutes.js";
import { startScreenshotWorker } from "./src/workers/screenshotWorker.js";
import { startUrl2PdfWorker } from "./src/workers/url2pdfWorker.js";
import { startCleanupWorker } from "./src/workers/cleanupWorker.js";
import monitorRoutes from "./src/routes/monitorRoutes.js";
// import monitorRoutes from "./routes/monitorRoutes.js";
import { startMonitorWorker } from "./src/workers/monitorWorker.js";




dotenv.config();

const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const app = express();

// Security / headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.disable("x-powered-by");

// Body parsing
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// CORS
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN,
    credentials: false,
  })
);

// Rate limit for public endpoint (guest users)
app.use(
  "/public",
  rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Serve uploads
app.use(
  "/uploads",
  (req, res, next) => {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  express.static(uploadsDir)
);

// Health
app.get("/health", (req, res) => res.json({ ok: true }));

// Routes
app.use("/public", publicRoutes);
app.use("/api", apiRoutes);
app.use("/api/monitors", monitorRoutes);

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected");

    // Start worker loop
    startScreenshotWorker();
    startCleanupWorker();
    startUrl2PdfWorker();
    startMonitorWorker();

    app.listen(PORT, () => console.log(`Server running on ${PORT}`));
  } catch (err) {
    console.error("Server start error:", err.message);
    process.exit(1);
  }
}

start();
