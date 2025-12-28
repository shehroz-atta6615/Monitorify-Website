import express from "express";
import Monitor from "../models/Monitor.js";
import { requireGuestKey, enforceAllowedUrl } from "../middlewares/requireGuestKey.js";

const router = express.Router();

// Guest-only (attaches req.guestProject)
router.use(requireGuestKey);

const MAX_MONITORS_PER_PROJECT = 5;

function normalizeAndValidateUrl(input) {
  if (!input || typeof input !== "string") {
    return { ok: false, message: "URL is required." };
  }

  const trimmed = input.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return { ok: false, message: "URL must start with http:// or https://." };
  }

  try {
    const u = new URL(trimmed);
    if (!u.hostname) return { ok: false, message: "Invalid hostname." };
    u.hash = "";
    return { ok: true, normalized: u.toString() };
  } catch {
    return { ok: false, message: "Invalid URL format." };
  }
}

function sanitizeHeaders(input) {
  if (!input) return undefined;
  if (typeof input !== "object" || Array.isArray(input)) return undefined;

  const out = {};
  let count = 0;

  for (const [k, v] of Object.entries(input)) {
    const key = String(k || "").trim();
    if (!key) continue;
    if (key.length > 60) continue;

    // allow string/number/boolean
    if (
      typeof v !== "string" &&
      typeof v !== "number" &&
      typeof v !== "boolean"
    ) {
      continue;
    }

    const val = String(v);
    if (val.length > 2000) continue;

    out[key] = val;
    count += 1;
    if (count >= 30) break; // hard limit
  }

  return count ? out : undefined;
}

// only enforceAllowedUrl if req.body.url is present
function enforceAllowedUrlIfUrlPresent(req, res, next) {
  if (!req.body?.url) return next();
  return enforceAllowedUrl(req, res, next);
}

/**
 * GET /api/monitors
 * list monitors for this guest project
 */
router.get("/", async (req, res) => {
  const monitors = await Monitor.find({ guestProjectId: req.guestProject._id })
    .sort({ createdAt: -1 })
    .lean();

  res.json({ ok: true, monitors });
});

/**
 * POST /api/monitors
 * create monitor (domain locked)
 */
router.post("/", enforceAllowedUrl, async (req, res) => {
  const count = await Monitor.countDocuments({ guestProjectId: req.guestProject._id });
  if (count >= MAX_MONITORS_PER_PROJECT) {
    return res.status(400).json({
      ok: false,
      error: `Monitor limit reached (${MAX_MONITORS_PER_PROJECT}).`,
    });
  }

  const v = normalizeAndValidateUrl(req.body?.url);
  if (!v.ok) return res.status(400).json({ ok: false, error: v.message });

  const intervalSec = Number(req.body?.intervalSec ?? 900);
  const timeoutMs = Number(req.body?.timeoutMs ?? 30000);

  const name = String(req.body?.name || "").trim();
  const followRedirects = req.body?.followRedirects ?? true;
  const isActive = req.body?.isActive ?? true;

  const headersObj = sanitizeHeaders(req.body?.headers);

  const monitor = await Monitor.create({
    guestProjectId: req.guestProject._id,
    name: name || new URL(v.normalized).hostname,
    url: v.normalized,
    method: (req.body?.method || "GET").toUpperCase() === "HEAD" ? "HEAD" : "GET",
    intervalSec: Number.isFinite(intervalSec) ? intervalSec : 900,
    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 30000,
    followRedirects: !!followRedirects,
    headers: headersObj,
    isActive: !!isActive,
    lastStatus: !!isActive ? "unknown" : "paused",
  });

  res.status(201).json({ ok: true, monitor });
});

/**
 * GET /api/monitors/:id
 */
router.get("/:id", async (req, res) => {
  const monitor = await Monitor.findOne({
    _id: req.params.id,
    guestProjectId: req.guestProject._id,
  }).lean();

  if (!monitor) return res.status(404).json({ ok: false, error: "Monitor not found" });

  res.json({ ok: true, monitor });
});

/**
 * PATCH /api/monitors/:id
 * update monitor (domain locked if url provided)
 */
router.patch("/:id", enforceAllowedUrlIfUrlPresent, async (req, res) => {
  const monitor = await Monitor.findOne({
    _id: req.params.id,
    guestProjectId: req.guestProject._id,
  });

  if (!monitor) return res.status(404).json({ ok: false, error: "Monitor not found" });

  if (req.body?.url) {
    const v = normalizeAndValidateUrl(req.body.url);
    if (!v.ok) return res.status(400).json({ ok: false, error: v.message });
    monitor.url = v.normalized;
  }

  if (req.body?.name !== undefined) {
    const name = String(req.body.name || "").trim();
    monitor.name = name;
  }

  if (req.body?.method) {
    const m = String(req.body.method).toUpperCase();
    monitor.method = m === "HEAD" ? "HEAD" : "GET";
  }

  if (req.body?.intervalSec !== undefined) {
    const intervalSec = Number(req.body.intervalSec);
    if (Number.isFinite(intervalSec)) monitor.intervalSec = intervalSec;
  }

  if (req.body?.timeoutMs !== undefined) {
    const timeoutMs = Number(req.body.timeoutMs);
    if (Number.isFinite(timeoutMs)) monitor.timeoutMs = timeoutMs;
  }

  if (req.body?.followRedirects !== undefined) {
    monitor.followRedirects = !!req.body.followRedirects;
  }

  if (req.body?.headers !== undefined) {
    monitor.headers = sanitizeHeaders(req.body.headers);
  }

  if (req.body?.isActive !== undefined) {
    const nextActive = !!req.body.isActive;
    monitor.isActive = nextActive;

    if (!nextActive) {
      monitor.lastStatus = "paused";
    } else if (monitor.lastStatus === "paused") {
      monitor.lastStatus = "unknown";
    }
  }

  await monitor.save();

  res.json({ ok: true, monitor });
});

/**
 * DELETE /api/monitors/:id
 */
router.delete("/:id", async (req, res) => {
  const deleted = await Monitor.findOneAndDelete({
    _id: req.params.id,
    guestProjectId: req.guestProject._id,
  });

  if (!deleted) return res.status(404).json({ ok: false, error: "Monitor not found" });

  res.json({ ok: true });
});

export default router;
