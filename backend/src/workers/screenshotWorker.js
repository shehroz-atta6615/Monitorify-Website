import fs from "fs";
import path from "path";
import crypto from "crypto";
import puppeteer from "puppeteer";
import Job from "../models/Job.js";
import GuestProject from "../models/GuestProject.js";

function allowedHost(projectUrl, targetUrl) {
  const pHost = new URL(projectUrl).hostname.toLowerCase();
  const tHost = new URL(targetUrl).hostname.toLowerCase();

  const base = pHost.startsWith("www.") ? pHost.slice(4) : pHost;
  const allowed = new Set([pHost, base, `www.${base}`]);

  return allowed.has(tHost);
}

async function processOneScreenshotJob() {
  const job = await Job.findOneAndUpdate(
    { type: "screenshot", status: "queued" },
    { status: "running", startedAt: new Date() },
    { new: true, sort: { createdAt: 1 } }
  );

  if (!job) return;

  try {
    const project = await GuestProject.findById(job.guestProjectId);
    if (!project) throw new Error("Project not found");

    if (!allowedHost(project.websiteUrl, job.payload.url)) {
      throw new Error("This API key can only be used for the original website domain.");
    }

    const uploadsDir = path.join(process.cwd(), "uploads");
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    const filename = `shot_${crypto.randomBytes(10).toString("hex")}.png`;
    const filepath = path.join(uploadsDir, filename);

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: job.payload.width, height: job.payload.height });

    await page.goto(job.payload.url, { waitUntil: "networkidle2", timeout: 30000 });

    await page.screenshot({
      path: filepath,
      fullPage: job.payload.fullPage,
    });

    await browser.close();

    job.status = "done";
    job.result = { fileUrl: `/uploads/${filename}` };
    job.finishedAt = new Date();
    await job.save();
  } catch (err) {
    job.status = "error";
    job.error = { message: err?.message || "Screenshot failed" };
    job.finishedAt = new Date();
    await job.save();
  }
}

export function startScreenshotWorker() {
  // one job at a time, every 2 seconds
  setInterval(() => {
    processOneScreenshotJob().catch(() => {});
  }, 2000);

  setInterval(() => {
  cleanupUploads();
}, 60 * 60 * 1000); // every hour

  console.log("Screenshot worker started");
}


function cleanupUploads() {
  const uploadsDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) return;

  const now = Date.now();
  const maxAge = 48 * 60 * 60 * 1000; // 48 hours

  for (const f of fs.readdirSync(uploadsDir)) {
    if (!f.startsWith("shot_") || !f.endsWith(".png")) continue;

    const fp = path.join(uploadsDir, f);
    const stat = fs.statSync(fp);

    if (now - stat.mtimeMs > maxAge) {
      fs.unlinkSync(fp);
    }
  }
}
