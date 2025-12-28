import express from "express";
import { chromium } from "playwright";
import * as cheerio from "cheerio";
import Job from "../models/Job.js";
import { requireGuestKey, enforceAllowedUrl } from "../middlewares/requireGuestKey.js";
import { detectTechnology } from "../utils/detectTechnology.js";
import { getPageSpeedScore } from "../utils/pageSpeed.js";

const router = express.Router();

// Guest-only API (attaches req.guestProject)
router.use(requireGuestKey);

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

    // Remove fragment
    u.hash = "";
    return { ok: true, normalized: u.toString(), urlObj: u };
  } catch {
    return { ok: false, message: "Invalid URL format." };
  }
}

// META SCRAPE
// router.post("/meta-scrape", enforceAllowedUrl, async (req, res) => {
//   const inputUrl = req.body?.url || req.guestProject.websiteUrl;

//   const v = normalizeAndValidateUrl(inputUrl);
//   if (!v.ok) return res.status(400).send(v.message);

//   const controller = new AbortController();
//   const timeout = setTimeout(() => controller.abort(), 12000);

//   try {
//     const r = await fetch(v.normalized, {
//       signal: controller.signal,
//       redirect: "follow",
//       headers: {
//         "User-Agent": "MonitorifyMetaScraper/1.0",
//         Accept: "text/html,application/xhtml+xml",
//       },
//     });

//     const html = await r.text();
//     const $ = cheerio.load(html);

//     const title = ($("title").first().text() || "").trim();
//     const description = ($('meta[name="description"]').attr("content") || "").trim();

//     const ogTitle = ($('meta[property="og:title"]').attr("content") || "").trim();
//     const ogDescription = ($('meta[property="og:description"]').attr("content") || "").trim();
//     const ogImage = ($('meta[property="og:image"]').attr("content") || "").trim();

//     const canonical = ($('link[rel="canonical"]').attr("href") || "").trim();
//     const favicon =
//       ($('link[rel="icon"]').attr("href") ||
//         $('link[rel="shortcut icon"]').attr("href") ||
//         "").trim();

//     res.json({
//       ok: true,
//       fetchedUrl: v.normalized,
//       status: r.status,
//       meta: { title, description, ogTitle, ogDescription, ogImage, canonical, favicon },
//     });
//   } catch (err) {
//     const msg =
//       err?.name === "AbortError"
//         ? "Request timed out"
//         : err?.message || "Fetch failed";

//     res.status(500).json({ ok: false, error: msg });
//   } finally {
//     clearTimeout(timeout);
//   }
// });

// router.post("/meta-scrape", enforceAllowedUrl, async (req, res) => {
//   const url = String(req.body?.url || "").trim();
//   if (!url) return res.status(400).json({ ok: false, error: "URL is required" });

//   let browser;
//   try {
//     browser = await chromium.launch({ headless: true });
//     const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });

//     const navStart = Date.now();
//     const response = await page.goto(url, { waitUntil: "load", timeout: 45000 });
//     const navEnd = Date.now();

//     const headers = response?.headers?.() || {};
//     const html = await page.content();

//     // ✅ Meta fields (basic + OG)
//     const meta = await page.evaluate(() => {
//       const pick = (sel, attr = "content") =>
//         document.querySelector(sel)?.getAttribute(attr) || "";

//       return {
//         title: document.title || "",
//         description: pick('meta[name="description"]'),
//         canonical: pick('link[rel="canonical"]', "href"),
//         ogTitle: pick('meta[property="og:title"]'),
//         ogDescription: pick('meta[property="og:description"]'),
//         ogImage: pick('meta[property="og:image"]'),
//       };
//     });

//     // ✅ Navigation timing (more accurate than Date diff if available)
//     const timing = await page.evaluate(() => {
//       const nav = performance.getEntriesByType("navigation")[0];
//       if (!nav) return null;
//       return {
//         ttfbMs: nav.responseStart - nav.requestStart,
//         domContentLoadedMs: nav.domContentLoadedEventEnd,
//         loadEventMs: nav.loadEventEnd,
//       };
//     });

//     const pageLoadMs = timing?.loadEventMs && timing.loadEventMs > 0
//       ? Math.round(timing.loadEventMs)
//       : Math.round(navEnd - navStart);

//     // ✅ Technology detect
//     const technology = detectTechnology({ url, html, headers });

//     // ✅ PageSpeed score (Lighthouse)
//     const pageSpeed = await getPageSpeedScore(url);

//     return res.json({
//       ok: true,
//       meta,
//       perf: {
//         pageLoadMs,
//         ttfbMs: timing?.ttfbMs ? Math.round(timing.ttfbMs) : null,
//         domContentLoadedMs: timing?.domContentLoadedMs ? Math.round(timing.domContentLoadedMs) : null,
//       },
//       technology,
//       pageSpeed,
//     });
//   } catch (e) {
//     return res.status(500).json({ ok: false, error: e?.message || "Meta scrape failed" });
//   } finally {
//     if (browser) {
//       try { await browser.close(); } catch {}
//     }
//   }
// });

router.post("/meta-scrape", enforceAllowedUrl, async (req, res) => {
  const inputUrl = String(req.body?.url || req.guestProject?.websiteUrl || "").trim();
  if (!inputUrl) return res.status(400).json({ ok: false, error: "URL is required" });

  // (Optional but recommended) validate/normalize like old
  const v = normalizeAndValidateUrl(inputUrl);
  if (!v.ok) return res.status(400).json({ ok: false, error: v.message });

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });

    const navStart = Date.now();
    const response = await page.goto(v.normalized, { waitUntil: "load", timeout: 45000 });
    const navEnd = Date.now();

    const status = response?.status?.() ?? null;
    const fetchedUrl = response?.url?.() || v.normalized;

    const headers = response?.headers?.() || {};
    const html = await page.content();

    const meta = await page.evaluate(() => {
      const pickAttr = (sel, attr) => document.querySelector(sel)?.getAttribute(attr) || "";
      const pick = (sel) => pickAttr(sel, "content");

      const favicon =
        pickAttr('link[rel="icon"]', "href") ||
        pickAttr('link[rel="shortcut icon"]', "href") ||
        pickAttr('link[rel="apple-touch-icon"]', "href") ||
        "";

      return {
        title: document.title || "",
        description: pick('meta[name="description"]'),
        canonical: pickAttr('link[rel="canonical"]', "href"),
        ogTitle: pick('meta[property="og:title"]'),
        ogDescription: pick('meta[property="og:description"]'),
        ogImage: pick('meta[property="og:image"]'),
        // favicon,
      };
    });

    const timing = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      if (!nav) return null;
      return {
        ttfbMs: nav.responseStart - nav.requestStart,
        domContentLoadedMs: nav.domContentLoadedEventEnd,
        loadEventMs: nav.loadEventEnd,
      };
    });

    const pageLoadMs =
      timing?.loadEventMs && timing.loadEventMs > 0
        ? Math.round(timing.loadEventMs)
        : Math.round(navEnd - navStart);

    const technology = detectTechnology({ url: fetchedUrl, html, headers });
    const pageSpeed = await getPageSpeedScore(fetchedUrl);

    return res.json({
      ok: true,
      fetchedUrl,
      status, // ✅ old wali cheez wapas
      meta,
      perf: {
        pageLoadMs,
        ttfbMs: timing?.ttfbMs ? Math.round(timing.ttfbMs) : null,
        domContentLoadedMs: timing?.domContentLoadedMs ? Math.round(timing.domContentLoadedMs) : null,
      },
      technology,
      pageSpeed,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "Meta scrape failed" });
  } finally {
    if (browser) {
      try { await browser.close(); } catch {}
    }
  }
});


// SCREENSHOT JOB
router.post("/screenshot", enforceAllowedUrl, async (req, res) => {
  const url = String(req.body?.url || req.guestProject.websiteUrl || "").trim();
  const v = normalizeAndValidateUrl(url);
  if (!v.ok) return res.status(400).send(v.message);

  const fullPage = req.body?.fullPage ?? true;
  const width = Number(req.body?.width ?? 1366);
  const height = Number(req.body?.height ?? 768);

  const job = await Job.create({
    type: "screenshot",
    status: "queued",
    guestProjectId: req.guestProject._id,
    payload: {
      url: v.normalized,
      fullPage: !!fullPage,
      width: Number.isFinite(width) ? width : 1366,
      height: Number.isFinite(height) ? height : 768,
    },
  });

  res.json({ ok: true, jobId: String(job._id) });
});

// PDF JOB
router.post("/url2pdf", enforceAllowedUrl, async (req, res) => {
  const url = String(req.body?.url || req.guestProject.websiteUrl || "").trim();
  const v = normalizeAndValidateUrl(url);
  if (!v.ok) return res.status(400).send(v.message);

  const width = Number(req.body?.width ?? 1366);
  const height = Number(req.body?.height ?? 768);

  const job = await Job.create({
    type: "url2pdf",
    status: "queued",
    guestProjectId: req.guestProject._id,
    payload: {
      url: v.normalized,
      format: req.body?.format || "A4",
      landscape: !!(req.body?.landscape ?? false),
      printBackground: !!(req.body?.printBackground ?? true),
      width: Number.isFinite(width) ? width : 1366,
      height: Number.isFinite(height) ? height : 768,
      margin:
        req.body?.margin || {
          top: "12mm",
          right: "12mm",
          bottom: "12mm",
          left: "12mm",
        },
    },
  });

  res.json({ ok: true, jobId: String(job._id) });
});

// JOB STATUS
router.get("/jobs/:jobId", async (req, res) => {
  const { jobId } = req.params;

  const job = await Job.findById(jobId);
  if (!job) return res.status(404).send("Job not found");

  // Ensure job belongs to this project
  if (String(job.guestProjectId) !== String(req.guestProject._id)) {
    return res.status(403).send("Not allowed");
  }

  res.json({
    ok: true,
    job: {
      id: String(job._id),
      type: job.type,
      status: job.status,
      payload: job.payload,
      result: job.result,
      error: job.error,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
    },
  });
});


// PING (sync expiresAt from DB to frontend)
router.get("/ping", (req, res) => {
  res.json({
    ok: true,
    projectId: String(req.guestProject._id),
    websiteUrl: req.guestProject.websiteUrl,
    allowedDomain: req.guestProject.allowedDomain,
    expiresAt: req.guestProject.expiresAt,
  });
});

export default router;
