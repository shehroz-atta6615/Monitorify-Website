import crypto from "crypto";
import GuestProject from "../models/GuestProject.js";

function hashApiKey(apiKey) {
  const salt = process.env.API_KEY_SALT || "default_salt";
  return crypto.createHash("sha256").update(apiKey + salt).digest("hex");
}

export async function apiKeyAuth(req, res, next) {
  const apiKey = req.header("x-api-key");
  if (!apiKey) return res.status(401).send("Missing x-api-key");

  const apiKeyHash = hashApiKey(apiKey);

  const project = await GuestProject.findOne({
    apiKeyHash,
    expiresAt: { $gt: new Date() },
  });

  if (!project) return res.status(401).send("Invalid or expired API key");

  req.guestProject = project;
  next();
}
