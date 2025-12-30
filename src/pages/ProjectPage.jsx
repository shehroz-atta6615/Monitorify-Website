// ProjectPage.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { validateHttpUrl } from "../utils/validateUrl.js";
import "../designPages/ProjectPage.css";

const LS_KEY = "siterelic_guest_project";

// ✅ avoid auto-run twice in React StrictMode dev
let __autoMetaRanKey = "";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function safeHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function msToTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${m}m ${sec}s`;
}

function msPretty(ms) {
  if (ms === null || ms === undefined) return "—";
  const n = Number(ms);
  if (!Number.isFinite(n)) return "—";
  if (n < 1000) return `${Math.round(n)} ms`;
  return `${(n / 1000).toFixed(2)} s`;
}

function scorePretty(score) {
  if (score === null || score === undefined) return "—";
  const n = Number(score);
  if (!Number.isFinite(n)) return "—";
  return `${Math.round(n)}/100`;
}

function statusPretty(status) {
  if (status === null || status === undefined) return "—";
  const n = Number(status);
  if (!Number.isFinite(n)) return "—";

  const map = {
    200: "OK",
    201: "Created",
    204: "No Content",
    301: "Moved Permanently",
    302: "Found",
    304: "Not Modified",
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    500: "Server Error",
    502: "Bad Gateway",
    503: "Service Unavailable",
  };

  const label =
    map[n] ||
    (n >= 200 && n < 300
      ? "Success"
      : n >= 300 && n < 400
      ? "Redirect"
      : n >= 400 && n < 500
      ? "Client error"
      : n >= 500 && n < 600
      ? "Server error"
      : "Status");

  return `${n} ${label}`;
}

// ✅ one-line status highlight text (no box) + include final host if available
function deriveStatusLine(status, fetchedUrl) {
  const code = Number(status);
  const finalHost = fetchedUrl ? safeHostname(fetchedUrl) : "";
  const finalBit = finalHost ? ` Final host: ${finalHost}.` : "";

  if (!Number.isFinite(code)) {
    return {
      tone: "neutral",
      text: "No HTTP status detected yet — run Meta Scrape to confirm your website response.",
    };
  }

  if (code >= 200 && code < 300) {
    return {
      tone: "ok",
      text: `Your website is OK — ${statusPretty(code)}.${finalBit}`,
    };
  }

  if (code >= 300 && code < 400) {
    return {
      tone: "warm",
      text: `Your website is reachable but redirected — ${statusPretty(code)}.${finalBit}`,
    };
  }

  if (code >= 400 && code < 500) {
    return {
      tone: "danger",
      text: `Your website returned ${statusPretty(code)} (client-side issue).${finalBit}`,
    };
  }

  if (code >= 500 && code < 600) {
    return {
      tone: "danger",
      text: `Your server returned ${statusPretty(code)} (server-side issue).${finalBit}`,
    };
  }

  return {
    tone: "warm",
    text: `Your website returned ${statusPretty(code)}.${finalBit}`,
  };
}

const DEFAULT_OPTS = {
  screenshot: { fullPage: true, width: 1366, height: 768 },
  pdf: { format: "A4", landscape: false, printBackground: true },
};

function mergeOpts(saved) {
  const p = saved || {};
  return {
    screenshot: {
      fullPage: p?.screenshot?.fullPage ?? DEFAULT_OPTS.screenshot.fullPage,
      width: Number(p?.screenshot?.width ?? DEFAULT_OPTS.screenshot.width),
      height: Number(p?.screenshot?.height ?? DEFAULT_OPTS.screenshot.height),
    },
    pdf: {
      format: p?.pdf?.format || DEFAULT_OPTS.pdf.format,
      landscape: !!p?.pdf?.landscape,
      printBackground: p?.pdf?.printBackground ?? DEFAULT_OPTS.pdf.printBackground,
    },
  };
}

function loadProjectFromLS() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeTechnology(tech) {
  if (!tech) return { primary: "—", list: [] };

  if (typeof tech === "string") {
    return { primary: tech || "—", list: tech ? [tech] : [] };
  }

  if (Array.isArray(tech)) {
    return { primary: tech[0] || "—", list: tech.filter(Boolean).map(String) };
  }

  const primary =
    (tech?.primary && String(tech.primary)) ||
    (Array.isArray(tech?.detected) && tech.detected[0]) ||
    "—";

  const list = Array.isArray(tech?.detected)
    ? tech.detected.filter(Boolean).map(String)
    : primary && primary !== "—"
    ? [primary]
    : [];

  return { primary, list };
}

/* =========================
   Mini game shown while meta-scrape is running
   ========================= */
const SRP_GAME_BEST_KEY = "siterelic_meta_minigame_best";

function MiniClickGame({ active }) {
  const ARENA_SECONDS = 20;

  const arenaRef = useRef(null);
  const hopTimerRef = useRef(null);
  const tickTimerRef = useRef(null);
  const tipTimerRef = useRef(null);

  const tips = useMemo(
    () => [
      "Loading tip: websites love drama right when you’re watching.",
      "Loading tip: if it takes long, it’s probably doing real work.",
      "Loading tip: keep clicking, your score is basically ‘patience XP’.",
      "Loading tip: this is the healthiest thing to do while waiting.",
      "Loading tip: meta-scrape is shy. Stare less. Click more.",
    ],
    []
  );

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => {
    const n = Number(localStorage.getItem(SRP_GAME_BEST_KEY) || 0);
    return Number.isFinite(n) ? n : 0;
  });
  const [timeLeft, setTimeLeft] = useState(ARENA_SECONDS);
  const [tipIdx, setTipIdx] = useState(0);
  const [orb, setOrb] = useState({ x: 14, y: 14 });
  const [spark, setSpark] = useState({ show: false, x: 0, y: 0, id: 0 });

  const hop = useCallback(() => {
    const el = arenaRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const size = 46;
    const pad = 10;

    const maxX = Math.max(pad, rect.width - size - pad);
    const maxY = Math.max(pad, rect.height - size - pad);

    const x = pad + Math.random() * Math.max(1, maxX - pad);
    const y = pad + Math.random() * Math.max(1, maxY - pad);

    setOrb({ x, y });
  }, []);

  const stopAll = useCallback(() => {
    if (hopTimerRef.current) clearInterval(hopTimerRef.current);
    if (tickTimerRef.current) clearInterval(tickTimerRef.current);
    if (tipTimerRef.current) clearInterval(tipTimerRef.current);
    hopTimerRef.current = null;
    tickTimerRef.current = null;
    tipTimerRef.current = null;
  }, []);

  const start = useCallback(() => {
    stopAll();
    setScore(0);
    setTimeLeft(ARENA_SECONDS);
    setTipIdx(0);
    hop();

    hopTimerRef.current = setInterval(() => {
      hop();
    }, 650);

    tickTimerRef.current = setInterval(() => {
      setTimeLeft((t) => t - 1);
    }, 1000);

    tipTimerRef.current = setInterval(() => {
      setTipIdx((i) => (i + 1) % tips.length);
    }, 2400);
  }, [ARENA_SECONDS, hop, stopAll, tips.length]);

  useEffect(() => {
    if (active) start();
    else stopAll();

    return () => stopAll();
  }, [active, start, stopAll]);

  useEffect(() => {
    if (!active) return;
    if (timeLeft > 0) return;

    stopAll();

    setBest((prev) => {
      const nextBest = Math.max(prev, score);
      try {
        localStorage.setItem(SRP_GAME_BEST_KEY, String(nextBest));
      } catch {}
      return nextBest;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, active]);

  const progress = Math.max(0, Math.min(100, (timeLeft / ARENA_SECONDS) * 100));

  function onHit(e) {
    if (!active) return;
    if (timeLeft <= 0) return;

    setScore((s) => {
      const next = s + 1;
      if (next > best) {
        setBest(next);
        try {
          localStorage.setItem(SRP_GAME_BEST_KEY, String(next));
        } catch {}
      }
      return next;
    });

    const rect = arenaRef.current?.getBoundingClientRect();
    if (rect) {
      const x = (e?.clientX ?? rect.left) - rect.left;
      const y = (e?.clientY ?? rect.top) - rect.top;
      setSpark((p) => ({ show: true, x, y, id: p.id + 1 }));
      setTimeout(() => {
        setSpark((p) => ({ ...p, show: false }));
      }, 520);
    }

    hop();
  }

  return (
    <div className="srp-waitWrap">
      <div className="srp-waitHead">
        <div>
          <div className="srp-waitTitle">Running meta scrape</div>
          <div className="srp-waitSub">
            Mini game: click the orb before it hops. It resets every run.
          </div>
        </div>

        <div className="srp-loaderDots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>

      <div className="srp-game">
        <div className="srp-gameTop">
          <div className="srp-gameStat">
            <span className="srp-gameK">Time</span>
            <span className="srp-gameV">{Math.max(0, timeLeft)}s</span>
          </div>
          <div className="srp-gameStat">
            <span className="srp-gameK">Score</span>
            <span className="srp-gameV">{score}</span>
          </div>
          <div className="srp-gameStat">
            <span className="srp-gameK">Best</span>
            <span className="srp-gameV">{best}</span>
          </div>

          <button
            type="button"
            className="srp-btn srp-btn--ghost srp-gameRestart"
            onClick={start}
            disabled={!active}
          >
            Restart
          </button>
        </div>

        <div className="srp-gameBar" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>

        <div
          ref={arenaRef}
          className="srp-gameArena"
          role="group"
          aria-label="Mini game area"
        >
          <button
            type="button"
            className="srp-gameOrb"
            style={{ transform: `translate3d(${orb.x}px, ${orb.y}px, 0)` }}
            onClick={onHit}
            aria-label="Click orb"
          />
          {spark.show ? (
            <div
              key={spark.id}
              className="srp-gameSpark"
              style={{ left: spark.x, top: spark.y }}
              aria-hidden="true"
            >
              +1
            </div>
          ) : null}

          <div className="srp-gameHint">
            {timeLeft > 0 ? tips[tipIdx] : "Time’s up. If it’s still loading, hit Restart."}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProjectPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

  const [copied, setCopied] = useState("");
  const [project, setProject] = useState(null);

  useEffect(() => {
    const p = loadProjectFromLS();
    setProject(p);
  }, [projectId]);

  // Meta scrape states
  const [testLoading, setTestLoading] = useState(false);
  const [testError, setTestError] = useState("");
  const [testResult, setTestResult] = useState(null);

  // Screenshot job states
  const [shotLoading, setShotLoading] = useState(false);
  const [shotError, setShotError] = useState("");
  const [shotJobId, setShotJobId] = useState("");
  const [shotStatus, setShotStatus] = useState("");
  const [shotUrl, setShotUrl] = useState("");

  // PDF job states
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [pdfJobId, setPdfJobId] = useState("");
  const [pdfStatus, setPdfStatus] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");

  // Options state (synced from saved project)
  const [opts, setOpts] = useState(DEFAULT_OPTS);

  useEffect(() => {
    if (!project) return;
    setOpts(mergeOpts(project?.opts));
  }, [project?.projectId, project?.opts]);

  function persistOptions(nextOpts) {
    if (!project) return;
    const nextProject = { ...project, opts: nextOpts };
    localStorage.setItem(LS_KEY, JSON.stringify(nextProject));
    setProject(nextProject);
  }

  async function copy(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(""), 900);
    } catch {
      setCopied("Copy failed");
      setTimeout(() => setCopied(""), 900);
    }
  }

  // Expiry countdown
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Server sync (expiresAt)
  const [serverExpired, setServerExpired] = useState(false);

  useEffect(() => {
    if (!project?.apiKey) return;

    let cancelled = false;

    async function pingOnce() {
      try {
        const res = await fetch(`${apiBase}/api/ping`, {
          method: "GET",
          headers: { "x-api-key": project.apiKey },
        });

        if (!res.ok) {
          if (!cancelled) setServerExpired(true);
          return;
        }

        const data = await res.json();

        const next = {
          ...project,
          projectId: data?.projectId || project.projectId,
          websiteUrl: data?.websiteUrl || project.websiteUrl,
          allowedDomain: data?.allowedDomain || project.allowedDomain,
          expiresAt: data?.expiresAt || project.expiresAt,
        };

        if (!cancelled) {
          localStorage.setItem(LS_KEY, JSON.stringify(next));
          setProject(next);
          setServerExpired(false);
        }
      } catch {
        // ignore network errors
      }
    }

    pingOnce();
    const t = setInterval(pingOnce, 10000);

    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.apiKey]);

  const allowedDomain = project?.allowedDomain || safeHostname(project?.websiteUrl || "");
  const expiresAtMs = project?.expiresAt ? new Date(project.expiresAt).getTime() : 0;
  const remaining = expiresAtMs ? expiresAtMs - now : 0;

  const isExpired = serverExpired || (!!expiresAtMs && remaining <= 0);
  const apiDisabled = isExpired;

  // Change URL states (kept for later, currently commented in UI)
  const [urlDraft, setUrlDraft] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState("");

  useEffect(() => {
    if (project?.websiteUrl) setUrlDraft(project.websiteUrl);
  }, [project?.websiteUrl]);

  const draftDomain = useMemo(() => safeHostname(urlDraft), [urlDraft]);

  async function generateForNewUrl() {
    if (!project) return;

    setUrlError("");
    const v = validateHttpUrl(urlDraft);
    if (!v.ok) {
      setUrlError(v.message);
      return;
    }

    if (v.normalized === project.websiteUrl) {
      setUrlError("Same URL already saved.");
      return;
    }

    setUrlLoading(true);
    try {
      const res = await fetch(`${apiBase}/public/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: v.normalized }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Request failed (${res.status})`);
      }

      const data = await res.json();

      const preservedOpts = project?.opts || DEFAULT_OPTS;
      const next = { ...data, opts: preservedOpts };

      localStorage.setItem(LS_KEY, JSON.stringify(next));
      setProject(next);
      setServerExpired(false);
      navigate(`/p/${data.projectId}`, { replace: true });
    } catch (e) {
      setUrlError(e?.message || "Failed to update URL");
    } finally {
      setUrlLoading(false);
    }
  }

  async function regenerateKey() {
    if (!project) return;

    setTestError("");
    setShotError("");
    setPdfError("");

    try {
      const res = await fetch(`${apiBase}/public/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: project.websiteUrl }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Request failed (${res.status})`);
      }

      const data = await res.json();
      const preservedOpts = project?.opts || DEFAULT_OPTS;
      const next = { ...data, opts: preservedOpts };

      localStorage.setItem(LS_KEY, JSON.stringify(next));
      setProject(next);
      setServerExpired(false);

      __autoMetaRanKey = "";
      navigate(`/p/${data.projectId}`, { replace: true });
    } catch (e) {
      setTestError(e?.message || "Failed to regenerate key");
    }
  }

  async function runMetaScrape() {
    if (!project || apiDisabled) return;

    setTestLoading(true);
    setTestError("");
    setTestResult(null);

    try {
      const res = await fetch(`${apiBase}/api/meta-scrape`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": project.apiKey,
        },
        body: JSON.stringify({ url: project.websiteUrl }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Request failed (${res.status})`);
      }

      const data = await res.json();
      setTestResult(data);
    } catch (e) {
      setTestError(e?.message || "Test failed");
    } finally {
      setTestLoading(false);
    }
  }

  // ✅ AUTO-RUN meta scrape on page open (once per apiKey)
  useEffect(() => {
    if (!project || apiDisabled) return;
    const key = project?.apiKey || "";
    if (!key) return;

    if (__autoMetaRanKey === key) return;
    __autoMetaRanKey = key;

    runMetaScrape();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.apiKey, apiDisabled]);

  async function requestScreenshot() {
    if (!project || apiDisabled) return;

    setShotLoading(true);
    setShotError("");
    setShotUrl("");
    setShotJobId("");
    setShotStatus("queued");

    try {
      const res = await fetch(`${apiBase}/api/screenshot`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": project.apiKey,
        },
        body: JSON.stringify({
          url: project.websiteUrl,
          fullPage: !!opts.screenshot.fullPage,
          width: Number(opts.screenshot.width || 0),
          height: Number(opts.screenshot.height || 0),
        }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Request failed (${res.status})`);
      }

      const data = await res.json();
      const jobId = data?.jobId;
      if (!jobId) throw new Error("No jobId returned");

      setShotJobId(jobId);

      for (let i = 0; i < 30; i++) {
        await sleep(1500);

        const jr = await fetch(`${apiBase}/api/jobs/${jobId}`, {
          method: "GET",
          headers: { "x-api-key": project.apiKey },
        });

        if (!jr.ok) continue;

        const jdata = await jr.json();
        const status = jdata?.job?.status || "";
        setShotStatus(status);

        if (status === "done") {
          const fileUrl = jdata?.job?.result?.fileUrl;
          if (!fileUrl) throw new Error("Job done but no fileUrl");
          setShotUrl(`${apiBase}${fileUrl}`);
          return;
        }

        if (status === "error") {
          throw new Error(jdata?.job?.error?.message || "Screenshot failed");
        }
      }

      throw new Error("Screenshot is taking too long. Try again.");
    } catch (e) {
      setShotError(e?.message || "Screenshot failed");
      setShotStatus("error");
    } finally {
      setShotLoading(false);
    }
  }

  async function requestPdf() {
    if (!project || apiDisabled) return;

    setPdfLoading(true);
    setPdfError("");
    setPdfUrl("");
    setPdfJobId("");
    setPdfStatus("queued");

    try {
      const res = await fetch(`${apiBase}/api/url2pdf`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": project.apiKey,
        },
        body: JSON.stringify({
          url: project.websiteUrl,
          format: opts.pdf.format,
          landscape: !!opts.pdf.landscape,
          printBackground: !!opts.pdf.printBackground,
        }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Request failed (${res.status})`);
      }

      const data = await res.json();
      const jobId = data?.jobId;
      if (!jobId) throw new Error("No jobId returned");

      setPdfJobId(jobId);

      for (let i = 0; i < 30; i++) {
        await sleep(1500);

        const jr = await fetch(`${apiBase}/api/jobs/${jobId}`, {
          method: "GET",
          headers: { "x-api-key": project.apiKey },
        });

        if (!jr.ok) continue;

        const jdata = await jr.json();
        const status = jdata?.job?.status || "";
        setPdfStatus(status);

        if (status === "done") {
          const fileUrl = jdata?.job?.result?.fileUrl;
          if (!fileUrl) throw new Error("PDF done but no fileUrl");
          setPdfUrl(`${apiBase}${fileUrl}`);
          return;
        }

        if (status === "error") {
          throw new Error(jdata?.job?.error?.message || "PDF failed");
        }
      }

      throw new Error("PDF is taking too long. Try again.");
    } catch (e) {
      setPdfError(e?.message || "PDF failed");
      setPdfStatus("error");
    } finally {
      setPdfLoading(false);
    }
  }

  if (!project) {
    return (
      <div className="srp-page">
        <div className="srp-bg" aria-hidden="true">
          <div className="srp-bg__grid" />
          <div className="srp-bg__orb srp-bg__orb--a" />
          <div className="srp-bg__orb srp-bg__orb--b" />
          <div className="srp-bg__orb srp-bg__orb--c" />
          <div className="srp-bg__noise" />
        </div>

        <div className="srp-shell">
          <div className="srp-card srp-animate-in">
            <h2 className="srp-h2">No project found</h2>
            <p className="srp-p">Go back and generate a guest API key first.</p>
            <Link to="/" className="srp-link">
              ← Back to home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Extract fields safely
  const loadMs = testResult?.perf?.pageLoadMs ?? null;
  const { primary: techPrimary, list: techList } = normalizeTechnology(testResult?.technology);
  const score = testResult?.pageSpeed?.score ?? null;
  const httpStatus = testResult?.status ?? null;

  // ✅ status highlight line content (URL-aware)
  const statusLine = deriveStatusLine(httpStatus, testResult?.fetchedUrl);

  return (
    <div className="srp-page">
      <div className="srp-bg" aria-hidden="true">
        <div className="srp-bg__grid" />
        <div className="srp-bg__orb srp-bg__orb--a" />
        <div className="srp-bg__orb srp-bg__orb--b" />
        <div className="srp-bg__orb srp-bg__orb--c" />
        <div className="srp-bg__noise" />
      </div>

      <div className="srp-shell">
        <header className="srp-header srp-animate-in">
          <div className="srp-brand">
            <div className="srp-logo" aria-hidden="true">
              <span className="srp-logo__dot" />
            </div>

            <div className="srp-brand__text">
              <div className="srp-kicker">SiteRelic</div>
              <div className="srp-title">Your Guest API</div>
            </div>
          </div>

          <div className="srp-header__actions">
            <Link to={`/p/${project.projectId}/monitors`} className="srp-link srp-link--pill">
              Monitors
            </Link>

            <button
              type="button"
              onClick={requestScreenshot}
              disabled={apiDisabled || shotLoading}
              className={`srp-pillBtn ${shotLoading ? "srp-isLoading" : ""}`}
              aria-label="Request Screenshot"
            >
              <span
                className={`srp-pillBtn__dot ${
                  shotError ? "srp-pillBtn__dot--danger" : shotUrl ? "srp-pillBtn__dot--ok" : ""
                }`}
                aria-hidden="true"
              />
              {shotLoading ? "Requesting..." : "Request Screenshot"}
            </button>

            <button
              type="button"
              onClick={requestPdf}
              disabled={apiDisabled || pdfLoading}
              className={`srp-pillBtn ${pdfLoading ? "srp-isLoading" : ""}`}
              aria-label="Generate PDF"
            >
              <span
                className={`srp-pillBtn__dot ${
                  pdfError ? "srp-pillBtn__dot--danger" : pdfUrl ? "srp-pillBtn__dot--ok" : ""
                }`}
                aria-hidden="true"
              />
              {pdfLoading ? "Generating..." : "Generate PDF"}
            </button>

            <Link to="/" className="srp-link srp-link--pill">
              Generate another
            </Link>
          </div>
        </header>

        <main className="srp-stack">
          {/* Summary */}
          <section className="srp-card srp-card--lift srp-animate-in">
            <div className="srp-summary">
              <div className="srp-summary__left">
                <div className="srp-kicker">Project Overview</div>

                <div className="srp-line">
                  <span className="srp-line__k">Project</span>
                  <code className="srp-code">{project.projectId}</code>
                </div>

                <div className="srp-line">
                  <span className="srp-line__k">Allowed domain</span>
                  <code className="srp-code">{allowedDomain}</code>
                </div>

                <div className="srp-line">
                  <span className="srp-line__k">Expires in</span>
                  <code className={`srp-code ${isExpired ? "srp-code--danger" : ""}`}>
                    {project.expiresAt
                      ? isExpired
                        ? "Expired"
                        : msToTime(remaining)
                      : isExpired
                      ? "Expired"
                      : "—"}
                  </code>
                </div>
              </div>

              <div className="srp-summary__right">
                <div className={`srp-pill ${isExpired ? "srp-pill--danger" : "srp-pill--ok"}`}>
                  {isExpired ? "Expired" : "Ready"}
                </div>
              </div>
            </div>

            {isExpired ? (
              <div className="srp-alert srp-alert--danger" role="status">
                <div className="srp-alert__title">This guest API key has expired.</div>
                <div className="srp-alert__body">Generate a fresh key for the same URL.</div>
                <button onClick={regenerateKey} className="srp-btn srp-btn--primary srp-mt10">
                  <span className="srp-btn__shine" aria-hidden="true" />
                  Generate New Key
                </button>
              </div>
            ) : null}
          </section>

          {/* Meta scrape */}
          <section className="srp-card srp-animate-in">
            <div className="srp-row srp-row--top">
              <div>
                <div className="srp-kicker">Diagnostics</div>
                <div className="srp-h3">Try Meta Scrape (from UI)</div>
              </div>

              <button
                onClick={runMetaScrape}
                disabled={apiDisabled || testLoading}
                className={`srp-btn srp-btn--primary ${testLoading ? "srp-isLoading" : ""}`}
              >
                <span className="srp-btn__shine" aria-hidden="true" />
                {testLoading ? "Running..." : "Run Meta Scrape"}
              </button>
            </div>

            {testError ? <div className="srp-alert srp-alert--danger">{testError}</div> : null}

            {/* While loading, show engaging activity */}
            {testLoading && !testResult ? <MiniClickGame active={testLoading} /> : null}

            {testResult ? (
              <>
                {/* ✅ 2x2 metrics */}
                <div className="srp-metrics">
                  <div className="srp-metricCard">
                    <div className="srp-metricLabel">Page load time</div>
                    <div className="srp-metricValue">{msPretty(loadMs)}</div>
                    <div className="srp-metricHint">
                      DCL: {msPretty(testResult?.perf?.domContentLoadedMs)} • TTFB:{" "}
                      {msPretty(testResult?.perf?.ttfbMs)}
                    </div>
                  </div>

                  <div className="srp-metricCard">
                    <div className="srp-metricLabel">HTTP status</div>
                    <div className="srp-metricValue">{statusPretty(httpStatus)}</div>
                    <div className="srp-metricHint">
                      Final URL: {safeHostname(testResult?.fetchedUrl || project.websiteUrl)}
                    </div>
                  </div>

                  <div className="srp-metricCard">
                    <div className="srp-metricLabel">Technology</div>
                    <div className="srp-metricValue">{techPrimary}</div>
                    <div className="srp-metricHint">{techList.length ? techList.join(", ") : "—"}</div>
                  </div>

                  <div className="srp-metricCard">
                    <div className="srp-metricLabel">PageSpeed score</div>
                    <div className="srp-metricValue">{scorePretty(score)}</div>
                    <div className="srp-metricHint">
                      LCP: {msPretty(testResult?.pageSpeed?.lcpMs)} • FCP:{" "}
                      {msPretty(testResult?.pageSpeed?.fcpMs)}
                    </div>
                  </div>
                </div>

                {/* ✅ ONE-LINE status highlight (no box) */}
                <div className={`srp-statusLine srp-statusLine--${statusLine.tone}`}>
                  <span
                    className={`srp-statusDot srp-statusDot--${statusLine.tone}`}
                    aria-hidden="true"
                  />
                  <span className="srp-statusText" title={statusLine.text}>
                    {statusLine.text}
                  </span>
                </div>

                {/* ✅ JSON output with scroll */}
                <pre className="srp-pre srp-pre--scroll">{JSON.stringify(testResult, null, 2)}</pre>
              </>
            ) : null}
          </section>

          {/* Jobs Activity */}
          <section className="srp-card srp-animate-in">
            <div className="srp-row srp-row--top">
              <div>
                <div className="srp-kicker">Jobs</div>
                <div className="srp-h3">Recent outputs</div>
              </div>
            </div>

            <div className="srp-jobsGrid">
              {/* Screenshot */}
              <div className="srp-jobBox srp-jobBox--scroll">
                <div className="srp-jobTop">
                  <div className="srp-jobTitle">Screenshot</div>
                  <div
                    className={`srp-jobBadge ${
                      shotStatus === "done"
                        ? "srp-jobBadge--ok"
                        : shotStatus === "error"
                        ? "srp-jobBadge--danger"
                        : shotStatus
                        ? "srp-jobBadge--warm"
                        : ""
                    }`}
                  >
                    {shotLoading ? "running" : shotStatus || "idle"}
                  </div>
                </div>

                {shotJobId ? (
                  <div className="srp-jobMeta">
                    Job ID: <code className="srp-code srp-code--tight">{shotJobId}</code>
                  </div>
                ) : null}

                {shotError ? <div className="srp-alert srp-alert--danger">{shotError}</div> : null}

                {shotUrl ? (
                  <div className="srp-preview srp-mt12">
                    <div className="srp-preview__actions">
                      <a href={shotUrl} target="_blank" rel="noreferrer" className="srp-link">
                        Open Screenshot
                      </a>
                      <button
                        type="button"
                        onClick={() => copy(shotUrl, "Screenshot URL copied")}
                        className="srp-btn srp-btn--ghost"
                      >
                        Copy link
                      </button>
                    </div>

                    <div className="srp-imgWrap srp-imgWrap--sm srp-imgWrap--scroll">
                      <img src={shotUrl} alt="Screenshot" className="srp-img" />
                    </div>
                  </div>
                ) : (
                  <div className="srp-jobHint">
                    Click <strong>Request Screenshot</strong> from the header — the output will be displayed here.
                  </div>
                )}
              </div>

              {/* PDF */}
              <div className="srp-jobBox srp-jobBox--scroll">
                <div className="srp-jobTop">
                  <div className="srp-jobTitle">PDF</div>
                  <div
                    className={`srp-jobBadge ${
                      pdfStatus === "done"
                        ? "srp-jobBadge--ok"
                        : pdfStatus === "error"
                        ? "srp-jobBadge--danger"
                        : pdfStatus
                        ? "srp-jobBadge--warm"
                        : ""
                    }`}
                  >
                    {pdfLoading ? "running" : pdfStatus || "idle"}
                  </div>
                </div>

                {pdfJobId ? (
                  <div className="srp-jobMeta">
                    Job ID: <code className="srp-code srp-code--tight">{pdfJobId}</code>
                  </div>
                ) : null}

                {pdfError ? <div className="srp-alert srp-alert--danger">{pdfError}</div> : null}

                {pdfUrl ? (
                  <div className="srp-preview__actions srp-mt12">
                    <a href={pdfUrl} target="_blank" rel="noreferrer" className="srp-link">
                      Open PDF
                    </a>
                    <button
                      type="button"
                      onClick={() => copy(pdfUrl, "PDF URL copied")}
                      className="srp-btn srp-btn--ghost"
                    >
                      Copy link
                    </button>
                  </div>
                ) : (
                  <div className="srp-jobHint">
                    Click <strong>Generate PDF</strong> from the header — the output will be displayed here.
                  </div>
                )}
              </div>
            </div>

            {copied ? <div className="srp-toast">{copied}</div> : null}
          </section>

          {/* curl */}
          <section className="srp-card srp-animate-in">
            <div className="srp-kicker">Developer</div>
            <div className="srp-h3">Example request (curl)</div>
            <pre className="srp-pre">
{`curl -X POST ${apiBase}/api/meta-scrape \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${project.apiKey}" \\
  -d '{"url":"${project.websiteUrl || "https://example.com"}"}'`}
            </pre>
          </section>
        </main>
      </div>
    </div>
  );
}
