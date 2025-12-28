import fs from "fs/promises";
import path from "path";
import GuestProject from "../models/GuestProject.js";
import Job from "../models/Job.js";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

// how often cleanup runs
const CLEAN_EVERY_MS = 60 * 60 * 1000; // 1 hour

// orphan file sweep (files older than this get removed)
const ORPHAN_MAX_AGE_MS = 48 * 60 * 60 * 1000; // 48 hours

function isUploadsFileUrl(fileUrl) {
  return typeof fileUrl === "string" && fileUrl.startsWith("/uploads/");
}

async function deleteUploadByFileUrl(fileUrl) {
  if (!isUploadsFileUrl(fileUrl)) return false;

  // security: only keep filename (prevents ../ attacks)
  const filename = path.basename(fileUrl);
  const absPath = path.join(UPLOADS_DIR, filename);

  try {
    await fs.unlink(absPath);
    return true;
  } catch {
    return false;
  }
}

async function cleanupExpiredGuestProjects() {
  const now = new Date();

  const expired = await GuestProject.find(
    { expiresAt: { $lte: now } },
    { _id: 1 }
  ).lean();

  if (!expired.length) return { deletedProjects: 0, deletedJobs: 0, deletedFiles: 0 };

  const ids = expired.map((d) => d._id);

  // collect fileUrls from related jobs
  const jobs = await Job.find(
    { guestProjectId: { $in: ids } },
    { result: 1 }
  ).lean();

  let deletedFiles = 0;
  for (const j of jobs) {
    const fileUrl = j?.result?.fileUrl;
    if (fileUrl) {
      const ok = await deleteUploadByFileUrl(fileUrl);
      if (ok) deletedFiles += 1;
    }
  }

  const delJobs = await Job.deleteMany({ guestProjectId: { $in: ids } });
  const delProjects = await GuestProject.deleteMany({ _id: { $in: ids } });

  return {
    deletedProjects: delProjects.deletedCount || 0,
    deletedJobs: delJobs.deletedCount || 0,
    deletedFiles,
  };
}

async function cleanupOrphanOldUploads() {
  let entries = [];
  try {
    entries = await fs.readdir(UPLOADS_DIR);
  } catch {
    return 0;
  }

  const now = Date.now();
  let deleted = 0;

  for (const name of entries) {
    // only touch files we generate
    const looksLikeOurs =
      name.startsWith("shot_") ||
      name.startsWith("pdf_") ||
      name.startsWith("preview_");

    if (!looksLikeOurs) continue;

    const abs = path.join(UPLOADS_DIR, name);

    try {
      const st = await fs.stat(abs);
      const age = now - st.mtimeMs;

      if (age > ORPHAN_MAX_AGE_MS) {
        await fs.unlink(abs);
        deleted += 1;
      }
    } catch {
      // ignore
    }
  }

  return deleted;
}

async function runCleanupOnce() {
  const a = await cleanupExpiredGuestProjects();
  const orphanDeleted = await cleanupOrphanOldUploads();

  const didAnything =
    a.deletedProjects || a.deletedJobs || a.deletedFiles || orphanDeleted;

  if (didAnything) {
    console.log(
      `[cleanup] projects=${a.deletedProjects}, jobs=${a.deletedJobs}, files=${a.deletedFiles}, orphanFiles=${orphanDeleted}`
    );
  }
}

export function startCleanupWorker() {
  // run once on boot
  runCleanupOnce().catch((e) => console.error("[cleanup] boot error:", e?.message));

  // then on interval
  setInterval(() => {
    runCleanupOnce().catch((e) => console.error("[cleanup] error:", e?.message));
  }, CLEAN_EVERY_MS);
}
