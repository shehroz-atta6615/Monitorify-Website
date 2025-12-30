import { chromium } from "playwright";

function median(values) {
  const nums = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : Math.round((nums[mid - 1] + nums[mid]) / 2);
}

async function getNavTiming(page) {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    if (!nav) return null;

    return {
      ttfbMs: nav.responseStart - nav.requestStart,
      domContentLoadedMs: nav.domContentLoadedEventEnd,
      loadEventMs: nav.loadEventEnd,
    };
  });
}

/**
 * Returns median timings across runs (more repeatable + closer to "accurate")
 */
export async function measurePagePerformance(url, opts = {}) {
  const runs = Number(opts.runs ?? process.env.PERF_RUNS ?? 3);
  const timeoutMs = Number(opts.timeoutMs ?? 45000);
  const viewport = opts.viewport ?? { width: 1366, height: 768 };

  let browser;
  const results = [];

  try {
    browser = await chromium.launch({ headless: true });

    for (let i = 0; i < runs; i++) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();

      // reduce caching impact (still not perfect, but helps)
      await page.setExtraHTTPHeaders({
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      });

      // Try full load; if site never "load"s (some SPAs), fallback
      try {
        await page.goto(url, { waitUntil: "load", timeout: timeoutMs });
      } catch {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      }

      const timing = await getNavTiming(page);
      results.push({
        ttfbMs: timing?.ttfbMs ? Math.round(timing.ttfbMs) : null,
        domContentLoadedMs: timing?.domContentLoadedMs ? Math.round(timing.domContentLoadedMs) : null,
        pageLoadMs: timing?.loadEventMs ? Math.round(timing.loadEventMs) : null,
      });

      await context.close();
    }

    return {
      runs,
      pageLoadMs: median(results.map((r) => r.pageLoadMs)),
      domContentLoadedMs: median(results.map((r) => r.domContentLoadedMs)),
      ttfbMs: median(results.map((r) => r.ttfbMs)),
      allRuns: results, // optional, but useful for debugging/accuracy
    };
  } finally {
    if (browser) {
      try { await browser.close(); } catch {}
    }
  }
}


