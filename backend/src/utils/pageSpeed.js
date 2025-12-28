import lighthouse from "lighthouse";
import { launch } from "chrome-launcher";

const cache = new Map(); // url -> { at, data }
const TTL_MS = 5 * 60 * 1000; // 5 min cache

export async function getPageSpeedScore(url) {
  const now = Date.now();
  const cached = cache.get(url);
  if (cached && now - cached.at < TTL_MS) return cached.data;

  let chrome;
  try {
    chrome = await launch({
      chromeFlags: [
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
      ],
    });

    const options = {
      port: chrome.port,
      logLevel: "error",
      onlyCategories: ["performance"],
    };

    const config = {
      extends: "lighthouse:default",
      settings: {
        formFactor: "mobile",
      },
    };

    const result = await lighthouse(url, options, config);

    const scoreRaw = result?.lhr?.categories?.performance?.score ?? null;
    const score = scoreRaw === null ? null : Math.round(scoreRaw * 100);

    const audits = result?.lhr?.audits || {};
    const data = {
      score,
      lcpMs: audits["largest-contentful-paint"]?.numericValue ?? null,
      fcpMs: audits["first-contentful-paint"]?.numericValue ?? null,
      tbtMs: audits["total-blocking-time"]?.numericValue ?? null,
      cls: audits["cumulative-layout-shift"]?.numericValue ?? null,
      ttiMs: audits["interactive"]?.numericValue ?? null,
    };

    cache.set(url, { at: now, data });
    return data;
  } catch {
    return { score: null, lcpMs: null, fcpMs: null, tbtMs: null, cls: null, ttiMs: null };
  } finally {
    if (chrome) {
      try { await chrome.kill(); } catch {}
    }
  }
}
