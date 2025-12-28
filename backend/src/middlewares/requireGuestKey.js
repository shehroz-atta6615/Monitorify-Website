import crypto from "crypto";
import GuestProject from "../models/GuestProject.js";

function hashApiKey(apiKey) {
  const salt = process.env.API_KEY_SALT || "default_salt";
  return crypto.createHash("sha256").update(apiKey + salt).digest("hex");
}

function stripWww(host) {
  return (host || "").toLowerCase().replace(/^www\./, "");
}

export async function requireGuestKey(req, res, next) {
  try {
    const key = req.header("x-api-key");
    if (!key || !key.startsWith("guest_")) {
      return res.status(401).send("Invalid or expired API key");
    }

    const apiKeyHash = hashApiKey(key);
    const project = await GuestProject.findOne({ apiKeyHash }).lean();

    if (!project) return res.status(401).send("Invalid or expired API key");

    if (project.expiresAt && new Date(project.expiresAt).getTime() <= Date.now()) {
      return res.status(401).send("Invalid or expired API key");
    }

    req.guestProject = project;
    req.guestApiKey = key;
    next();
  } catch (e) {
    console.error("requireGuestKey error:", e);
    return res.status(500).send("Server error");
  }
}

export function enforceAllowedUrl(req, res, next) {
  try {
    const inputUrl = req.body?.url;
    if (!inputUrl) return res.status(400).send("url is required");

    const target = new URL(inputUrl);
    const allowed = new URL(req.guestProject.websiteUrl);

    const targetHost = stripWww(target.hostname);
    const allowedHost = stripWww(allowed.hostname);

    if (targetHost !== allowedHost) {
      return res
        .status(403)
        .send(`URL domain not allowed. Allowed: ${allowedHost}`);
    }

    next();
  } catch {
    return res.status(400).send("Invalid URL format");
  }
}
