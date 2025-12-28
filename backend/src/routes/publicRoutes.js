// import express from "express";
// import crypto from "crypto";
// import net from "net";
// import GuestProject from "../models/GuestProject.js";

// const router = express.Router();

// function isBlockedHost(hostname) {
//   const host = (hostname || "").toLowerCase();

//   // Basic localhost blocks
//   if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1") return true;

//   // If hostname is an IP, block private/reserved ranges (basic SSRF prevention)
//   const ipType = net.isIP(host);
//   if (ipType === 4) {
//     const parts = host.split(".").map((n) => parseInt(n, 10));
//     const [a, b] = parts;

//     // 10.0.0.0/8
//     if (a === 10) return true;

//     // 172.16.0.0/12
//     if (a === 172 && b >= 16 && b <= 31) return true;

//     // 192.168.0.0/16
//     if (a === 192 && b === 168) return true;

//     // 169.254.0.0/16 (link-local)
//     if (a === 169 && b === 254) return true;
//   }

//   return false;
// }

// function normalizeAndValidateUrl(input) {
//   if (!input || typeof input !== "string") {
//     return { ok: false, message: "URL is required." };
//   }

//   let trimmed = input.trim();
//   if (!trimmed) return { ok: false, message: "URL is required." };

//   // Allow users to send "example.com" (no protocol) — default to https
//   if (!/^https?:\/\//i.test(trimmed)) {
//     trimmed = `https://${trimmed}`;
//   }

//   try {
//     const u = new URL(trimmed);

//     if (!u.hostname) return { ok: false, message: "Invalid hostname." };
//     if (u.protocol !== "http:" && u.protocol !== "https:") {
//       return { ok: false, message: "Only http/https URLs are allowed." };
//     }

//     if (isBlockedHost(u.hostname)) {
//       return { ok: false, message: "This host is not allowed." };
//     }

//     // Clean up
//     u.hash = ""; // remove fragment
//     u.username = "";
//     u.password = "";

//     return { ok: true, normalized: u.toString() };
//   } catch {
//     return { ok: false, message: "Invalid URL format." };
//   }
// }

// function hashApiKey(apiKey) {
//   const salt = process.env.API_KEY_SALT || "default_salt";
//   return crypto.createHash("sha256").update(apiKey + salt).digest("hex");
// }

// router.post("/generate", async (req, res) => {
//   const { url } = req.body;

//   const v = normalizeAndValidateUrl(url);
//   if (!v.ok) return res.status(400).send(v.message);

//   const apiKey = "guest_" + crypto.randomBytes(24).toString("hex");
//   const apiKeyHash = hashApiKey(apiKey);

//   // Guest expiry (e.g., 24 hours)
//   const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

//   const doc = await GuestProject.create({
//     websiteUrl: v.normalized,
//     apiKeyHash,
//     expiresAt,
//   });

//   const allowedDomain = new URL(v.normalized).hostname;

//   res.json({
//     projectId: String(doc._id),
//     apiKey,
//     websiteUrl: v.normalized,
//     allowedDomain,
//     expiresAt: doc.expiresAt.toISOString(),
//     endpoints: [
//       { name: "Meta Scrape", path: "/api/meta-scrape", method: "POST" },
//       { name: "Screenshot (Job)", path: "/api/screenshot", method: "POST" },
//       { name: "URL to PDF (Job)", path: "/api/url2pdf", method: "POST" },
//       { name: "Job Status", path: "/api/jobs/:jobId", method: "GET" },
//     ],
//   });
// });

// export default router;



import express from "express";
import crypto from "crypto";
import GuestProject from "../models/GuestProject.js";

const router = express.Router();

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

    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") {
      return { ok: false, message: "Localhost URLs are not allowed." };
    }

    u.hash = "";
    return { ok: true, normalized: u.toString() };
  } catch {
    return { ok: false, message: "Invalid URL format." };
  }
}

function hashApiKey(apiKey) {
  const salt = process.env.API_KEY_SALT || "default_salt";
  return crypto.createHash("sha256").update(apiKey + salt).digest("hex");
}

router.post("/generate", async (req, res) => {
  try {
    const { url } = req.body;

    const v = normalizeAndValidateUrl(url);
    if (!v.ok) return res.status(400).send(v.message);

    const apiKey = "guest_" + crypto.randomBytes(24).toString("hex");
    const apiKeyHash = hashApiKey(apiKey);

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const doc = await GuestProject.create({
      websiteUrl: v.normalized,
      apiKeyHash,
      expiresAt,
    });

    const allowedDomain = new URL(v.normalized).hostname;

    res.json({
      projectId: String(doc._id),
      apiKey,
      websiteUrl: v.normalized,
      allowedDomain,
      expiresAt: doc.expiresAt.toISOString(),
      endpoints: [
        { name: "Meta Scrape", path: "/api/meta-scrape", method: "POST" },
        { name: "Screenshot (Job)", path: "/api/screenshot", method: "POST" },
        { name: "URL to PDF (Job)", path: "/api/url2pdf", method: "POST" },
        { name: "Job Status", path: "/api/jobs/:jobId", method: "GET" },
      ],
    });
  } catch (e) {
    console.error("generate error:", e);
    return res.status(500).send("Server error");
  }
});

export default router;

