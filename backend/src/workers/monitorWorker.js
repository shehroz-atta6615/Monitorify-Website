// src/workers/monitorWorker.js
import Monitor from "../models/Monitor.js";

function buildHeaders(h) {
  const out = {
    "User-Agent": "Monitorify/1.0",
    Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  };

  if (!h) return out;

  // h can be plain object or Map-like
  if (typeof h === "object") {
    for (const [k, v] of Object.entries(h)) {
      if (!k) continue;
      out[String(k)] = String(v);
    }
  }

  return out;
}

async function checkOne(m) {
  const started = Date.now();
  const timeoutMs = Number(m.timeoutMs || 30000);

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(m.url, {
      method: (m.method || "GET") === "HEAD" ? "HEAD" : "GET",
      redirect: m.followRedirects ? "follow" : "manual",
      headers: buildHeaders(m.headers),
      signal: controller.signal,
    });

    const rt = Date.now() - started;
    const httpStatus = res.status;

    const isUp = httpStatus === 200; // MVP rule: UP only on 200

    await Monitor.updateOne(
      { _id: m._id, guestProjectId: m.guestProjectId },
      {
        $set: {
          lastStatus: isUp ? "up" : "down",
          lastCheckedAt: new Date(),
          lastResponseTimeMs: rt,
          lastHttpStatus: httpStatus,
          lastError: isUp ? "" : `HTTP ${httpStatus}`,
        },
      }
    );
  } catch (err) {
    const rt = Date.now() - started;
    const msg =
      err?.name === "AbortError"
        ? "Request timed out"
        : err?.message || "Fetch failed";

    await Monitor.updateOne(
      { _id: m._id, guestProjectId: m.guestProjectId },
      {
        $set: {
          lastStatus: "down",
          lastCheckedAt: new Date(),
          lastResponseTimeMs: rt,
          lastHttpStatus: null,
          lastError: msg,
        },
      }
    );
  } finally {
    clearTimeout(t);
  }
}

async function runBatch({ batchLimit = 10, concurrency = 3 } = {}) {
  const now = new Date();

  // Mongo-side "due" selection (handles per-monitor intervalSec)
  const due = await Monitor.aggregate([
    { $match: { isActive: true } },
    {
      $addFields: {
        nextDueAt: {
          $cond: [
            { $eq: ["$lastCheckedAt", null] },
            new Date(0),
            { $add: ["$lastCheckedAt", { $multiply: ["$intervalSec", 1000] }] },
          ],
        },
      },
    },
    { $match: { $expr: { $lte: ["$nextDueAt", now] } } },
    { $sort: { nextDueAt: 1 } },
    { $limit: batchLimit },
  ]);

  if (!due.length) return;

  let i = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, due.length) },
    async () => {
      while (i < due.length) {
        const idx = i++;
        const m = due[idx];
        try {
          await checkOne(m);
        } catch (e) {
          // safety net (checkOne already writes error)
          console.error("monitor check failed:", e?.message || e);
        }
      }
    }
  );

  await Promise.all(workers);
}

let _timer = null;
let _running = false;

export function startMonitorWorker({
  pollMs = 5000,
  batchLimit = 10,
  concurrency = 3,
} = {}) {
  if (_timer) return;

  console.log(
    `Monitor worker started (pollMs=${pollMs}, batchLimit=${batchLimit}, concurrency=${concurrency})`
  );

  _timer = setInterval(async () => {
    if (_running) return;
    _running = true;

    try {
      await runBatch({ batchLimit, concurrency });
    } catch (e) {
      console.error("Monitor worker loop error:", e?.message || e);
    } finally {
      _running = false;
    }
  }, pollMs);
}
