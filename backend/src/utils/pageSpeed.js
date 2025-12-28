import lighthouse from "lighthouse";
import { launch } from "chrome-launcher";
import os from "os";
import fs from "fs";
import path from "path";
import { chromium as pwChromium } from "playwright";

function median(values) {
  const nums = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : Math.round((nums[mid - 1] + nums[mid]) / 2);
}

function pickAudit(lhr, id) {
  const v = lhr?.audits?.[id]?.numericValue;
  return Number.isFinite(v) ? Math.round(v) : null;
}

export async function getPageSpeedScore(url, opts = {}) {
  const runs = Number(opts.runs ?? process.env.LH_RUNS ?? 3);

  const scores = [];
  const lcp = [];
  const fcp = [];
  const tbt = [];
  const cls = [];
  const tti = [];

  for (let i = 0; i < runs; i++) {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "monitorify-lh-"));
    let chrome;

    try {
      // Use Playwright’s Chromium for consistency (same engine you already use)
      const chromePath = pwChromium.executablePath();

      chrome = await launch({
        chromePath,
        userDataDir,
        chromeFlags: [
          "--headless=new",
          "--no-sandbox",
          "--disable-gpu",
          "--disable-dev-shm-usage",
          "--no-first-run",
          "--no-default-browser-check",
        ],
      });

      const result = await lighthouse(
        url,
        {
          port: chrome.port,
          logLevel: "error",
          output: "json",
          onlyCategories: ["performance"],

          // More PSI-like stability
          throttlingMethod: "simulate",
          formFactor: "mobile",
        }
      );

      const lhr = result?.lhr;
      const scoreRaw = lhr?.categories?.performance?.score;
      const score = Number.isFinite(scoreRaw) ? Math.round(scoreRaw * 100) : null;

      scores.push(score);
      lcp.push(pickAudit(lhr, "largest-contentful-paint"));
      fcp.push(pickAudit(lhr, "first-contentful-paint"));
      tbt.push(pickAudit(lhr, "total-blocking-time"));
      cls.push(lhr?.audits?.["cumulative-layout-shift"]?.numericValue ?? null);
      tti.push(pickAudit(lhr, "interactive"));
    } catch {
      // keep run empty; median will ignore invalid values
    } finally {
      if (chrome) {
        try { await chrome.kill(); } catch {}
      }
      try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
    }
  }

  const clsNums = cls
    .map((v) => (Number.isFinite(v) ? Number(v) : null))
    .filter((v) => v !== null)
    .sort((a, b) => a - b);

  const clsMedian =
    clsNums.length === 0
      ? null
      : clsNums.length % 2
      ? clsNums[Math.floor(clsNums.length / 2)]
      : (clsNums[clsNums.length / 2 - 1] + clsNums[clsNums.length / 2]) / 2;

  return {
    runs,
    score: median(scores),
    lcpMs: median(lcp),
    fcpMs: median(fcp),
    tbtMs: median(tbt),
    cls: clsMedian === null ? null : Number(clsMedian.toFixed(3)),
    ttiMs: median(tti),

    // optional debug (helps you verify accuracy)
    allRuns: { scores, lcp, fcp, tbt, cls, tti },
  };
}
