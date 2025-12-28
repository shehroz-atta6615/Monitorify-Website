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

async function processOnePdfJob() {
  const job = await Job.findOneAndUpdate(
    { type: "url2pdf", status: "queued" },
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

    const filename = `pdf_${crypto.randomBytes(10).toString("hex")}.pdf`;
    const filepath = path.join(uploadsDir, filename);

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();

    // Optional viewport (some pages render differently)
    await page.setViewport({
      width: job.payload.width || 1366,
      height: job.payload.height || 768,
    });

    await page.goto(job.payload.url, { waitUntil: "networkidle2", timeout: 45000 });

    await page.pdf({
      path: filepath,
      format: job.payload.format || "A4",
      printBackground: job.payload.printBackground ?? true,
      landscape: job.payload.landscape ?? false,
      preferCSSPageSize: true,
      margin: job.payload.margin || {
        top: "12mm",
        right: "12mm",
        bottom: "12mm",
        left: "12mm",
      },
    });

    await browser.close();

    job.status = "done";
    job.result = { fileUrl: `/uploads/${filename}` };
    job.finishedAt = new Date();
    await job.save();
  } catch (err) {
    job.status = "error";
    job.error = { message: err?.message || "PDF failed" };
    job.finishedAt = new Date();
    await job.save();
  }
}

export function startUrl2PdfWorker() {
  setInterval(() => {
    processOnePdfJob().catch(() => {});
  }, 2000);

  console.log("URL2PDF worker started");
}
