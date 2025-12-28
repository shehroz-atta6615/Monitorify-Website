import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { validateHttpUrl } from "../utils/validateUrl.js";

const LS_KEY = "siterelic_guest_project";

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
      printBackground:
        p?.pdf?.printBackground ?? DEFAULT_OPTS.pdf.printBackground,
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
    return {
      primary: tech[0] || "—",
      list: tech.filter(Boolean).map(String),
    };
  }

  // object style: { primary, detected: [...] }
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

export default function ProjectPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const apiBase =
    import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

  const [copied, setCopied] = useState("");
  const [project, setProject] = useState(null);

  useEffect(() => {
    const p = loadProjectFromLS();
    setProject(p);
  }, [projectId]);

  // Meta scrape test states
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
  }, [project?.projectId]);

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

  const allowedDomain =
    project?.allowedDomain || safeHostname(project?.websiteUrl || "");
  const expiresAtMs = project?.expiresAt
    ? new Date(project.expiresAt).getTime()
    : 0;
  const remaining = expiresAtMs ? expiresAtMs - now : 0;

  const isExpired = serverExpired || (!!expiresAtMs && remaining <= 0);
  const apiDisabled = isExpired;

  // Change URL states
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
          if (!fileUrl) throw new Error("Job done but no fileUrl");
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
      <div style={styles.wrap}>
        <div style={styles.card}>
          <h2 style={{ marginTop: 0 }}>No project found</h2>
          <p style={{ opacity: 0.85 }}>
            Go back and generate a guest API key first.
          </p>
          <Link to="/" style={styles.link}>
            ← Back to home
          </Link>
        </div>
      </div>
    );
  }

  // Extract fields safely
  const loadMs = testResult?.perf?.pageLoadMs ?? null;
  const { primary: techPrimary, list: techList } = normalizeTechnology(
    testResult?.technology
  );
  const score = testResult?.pageSpeed?.score ?? null;

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0 }}>Your Guest API</h2>

            <div style={{ opacity: 0.8, marginTop: 6 }}>
              Project: <code>{project.projectId}</code>
            </div>

            <div style={{ opacity: 0.8, marginTop: 6 }}>
              Allowed domain: <code>{allowedDomain}</code>
            </div>

            <div style={{ opacity: 0.8, marginTop: 6 }}>
              Expires in:{" "}
              <code>
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

          {/* Top-right links */}
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Link to={`/p/${project.projectId}/monitors`} style={styles.link}>
              Monitors
            </Link>

            <Link to="/" style={styles.link}>
              Generate another
            </Link>
          </div>
        </div>

        {isExpired ? (
          <div style={styles.toast}>
            <div style={{ fontWeight: 800 }}>This guest API key has expired.</div>
            <div style={{ opacity: 0.9, marginTop: 6 }}>
              Generate a fresh key for the same URL.
            </div>
            <button
              onClick={regenerateKey}
              style={{ ...styles.btnSmall, marginTop: 10 }}
            >
              Generate New Key
            </button>
          </div>
        ) : null}

        {/* Change URL */}
        <div style={styles.section}>
          <div style={styles.label}>Change website URL (new project)</div>

          <div style={styles.optsWrap}>
            <div style={{ display: "grid", gap: 10 }}>
              <input
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                placeholder="https://example.com"
                style={styles.smallInput}
                autoComplete="off"
              />

              <div style={{ opacity: 0.85, fontSize: 13 }}>
                New allowed domain:{" "}
                <code style={styles.codeInline}>{draftDomain || "—"}</code>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  onClick={generateForNewUrl}
                  disabled={urlLoading}
                  style={styles.btnSmall}
                >
                  {urlLoading ? "Generating..." : "Generate for new URL"}
                </button>

                <button
                  onClick={() => {
                    setUrlDraft(project.websiteUrl || "");
                    setUrlError("");
                  }}
                  style={styles.btnGhost}
                >
                  Reset
                </button>
              </div>

              {urlError ? <div style={styles.toast}>{urlError}</div> : null}
            </div>
          </div>
        </div>

        {/* API Key */}
        <div style={styles.section}>
          <div style={styles.row}>
            <div>
              <div style={styles.label}>API Key</div>
              <code style={styles.code}>{project.apiKey}</code>
            </div>

            <button
              onClick={() => copy(project.apiKey, "API Key copied")}
              style={styles.btnSmall}
            >
              Copy
            </button>
          </div>

          {copied ? <div style={styles.toast}>{copied}</div> : null}
        </div>

        {/* Saved options */}
        <div style={styles.section}>
          <div style={styles.label}>Saved options</div>

          <div style={styles.optsWrap}>
            <div style={styles.optsGrid}>
              <div style={styles.optsCard}>
                <div style={styles.optsTitle}>Screenshot</div>

                <label style={styles.checkRow}>
                  <input
                    type="checkbox"
                    checked={!!opts.screenshot.fullPage}
                    onChange={(e) =>
                      setOpts((p) => ({
                        ...p,
                        screenshot: { ...p.screenshot, fullPage: e.target.checked },
                      }))
                    }
                  />
                  <span>Full page</span>
                </label>

                <div style={styles.twoCols}>
                  <div>
                    <div style={styles.smallLabel}>Width</div>
                    <input
                      type="number"
                      value={opts.screenshot.width}
                      onChange={(e) =>
                        setOpts((p) => ({
                          ...p,
                          screenshot: {
                            ...p.screenshot,
                            width: Number(e.target.value || 0),
                          },
                        }))
                      }
                      style={styles.smallInput}
                    />
                  </div>

                  <div>
                    <div style={styles.smallLabel}>Height</div>
                    <input
                      type="number"
                      value={opts.screenshot.height}
                      onChange={(e) =>
                        setOpts((p) => ({
                          ...p,
                          screenshot: {
                            ...p.screenshot,
                            height: Number(e.target.value || 0),
                          },
                        }))
                      }
                      style={styles.smallInput}
                    />
                  </div>
                </div>
              </div>

              <div style={styles.optsCard}>
                <div style={styles.optsTitle}>PDF</div>

                <div>
                  <div style={styles.smallLabel}>Format</div>
                  <select
                    value={opts.pdf.format}
                    onChange={(e) =>
                      setOpts((p) => ({
                        ...p,
                        pdf: { ...p.pdf, format: e.target.value },
                      }))
                    }
                    style={styles.select}
                  >
                    <option value="A4">A4</option>
                    <option value="Letter">Letter</option>
                  </select>
                </div>

                <label style={styles.checkRow}>
                  <input
                    type="checkbox"
                    checked={!!opts.pdf.landscape}
                    onChange={(e) =>
                      setOpts((p) => ({
                        ...p,
                        pdf: { ...p.pdf, landscape: e.target.checked },
                      }))
                    }
                  />
                  <span>Landscape</span>
                </label>

                <label style={styles.checkRow}>
                  <input
                    type="checkbox"
                    checked={!!opts.pdf.printBackground}
                    onChange={(e) =>
                      setOpts((p) => ({
                        ...p,
                        pdf: { ...p.pdf, printBackground: e.target.checked },
                      }))
                    }
                  />
                  <span>Print background</span>
                </label>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              <button style={styles.btnSmall} onClick={() => persistOptions(opts)}>
                Save Options
              </button>

              <button
                style={styles.btnGhost}
                onClick={() => {
                  setOpts(DEFAULT_OPTS);
                  persistOptions(DEFAULT_OPTS);
                }}
              >
                Reset to defaults
              </button>
            </div>
          </div>
        </div>

        {/* Endpoints */}
        <div style={styles.section}>
          <div style={styles.label}>Endpoints</div>

          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            {project.endpoints?.map((ep) => (
              <div key={ep.path} style={styles.epCard}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <strong>{ep.name}</strong>
                  <code>
                    {ep.method} {ep.path}
                  </code>
                </div>
                <div style={{ marginTop: 8, opacity: 0.85 }}>
                  Body:{" "}
                  <code>{`{ "url": "${project.websiteUrl || "https://example.com"}" }`}</code>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Meta scrape */}
        <div style={styles.section}>
          <div style={styles.label}>Try Meta Scrape (from UI)</div>

          <button
            onClick={runMetaScrape}
            disabled={apiDisabled || testLoading}
            style={styles.btnSmall}
          >
            {testLoading ? "Running..." : "Run Meta Scrape"}
          </button>

          {testError ? <div style={styles.toast}>{testError}</div> : null}

          {testResult ? (
            <>
              <div style={styles.metricsGrid}>
                <div style={styles.metricCard}>
                  <div style={styles.metricLabel}>Page load time</div>
                  <div style={styles.metricValue}>{msPretty(loadMs)}</div>
                  <div style={styles.metricHint}>
                    DCL: {msPretty(testResult?.perf?.domContentLoadedMs)} • TTFB:{" "}
                    {msPretty(testResult?.perf?.ttfbMs)}
                  </div>
                </div>

                <div style={styles.metricCard}>
                  <div style={styles.metricLabel}>Technology</div>
                  <div style={styles.metricValue}>{techPrimary}</div>
                  <div style={styles.metricHint}>
                    {techList.length ? techList.join(", ") : "—"}
                  </div>
                </div>

                <div style={styles.metricCard}>
                  <div style={styles.metricLabel}>PageSpeed score</div>
                  <div style={styles.metricValue}>{scorePretty(score)}</div>
                  <div style={styles.metricHint}>
                    LCP: {msPretty(testResult?.pageSpeed?.lcpMs)} • FCP:{" "}
                    {msPretty(testResult?.pageSpeed?.fcpMs)}
                  </div>
                </div>
              </div>

              <pre style={styles.pre}>{JSON.stringify(testResult, null, 2)}</pre>
            </>
          ) : null}
        </div>

        {/* Screenshot */}
        <div style={styles.section}>
          <div style={styles.label}>Screenshot (Job)</div>

          <button
            onClick={requestScreenshot}
            disabled={apiDisabled || shotLoading}
            style={styles.btnSmall}
          >
            {shotLoading ? "Generating..." : "Request Screenshot"}
          </button>

          {shotJobId ? <div style={styles.toast}>Job ID: {shotJobId}</div> : null}
          {shotStatus ? <div style={styles.toast}>Status: {shotStatus}</div> : null}
          {shotError ? <div style={styles.toast}>{shotError}</div> : null}

          {shotUrl ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <a href={shotUrl} target="_blank" rel="noreferrer" style={styles.link}>
                  Open Screenshot
                </a>
                <button
                  onClick={() => copy(shotUrl, "Screenshot URL copied")}
                  style={styles.btnGhost}
                >
                  Copy link
                </button>
              </div>

              <div style={{ marginTop: 10 }}>
                <img
                  src={shotUrl}
                  alt="Screenshot"
                  style={{
                    width: "100%",
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.10)",
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>

        {/* PDF */}
        <div style={styles.section}>
          <div style={styles.label}>URL to PDF (Job)</div>

          <button
            onClick={requestPdf}
            disabled={apiDisabled || pdfLoading}
            style={styles.btnSmall}
          >
            {pdfLoading ? "Generating..." : "Generate PDF"}
          </button>

          {pdfJobId ? <div style={styles.toast}>Job ID: {pdfJobId}</div> : null}
          {pdfStatus ? <div style={styles.toast}>Status: {pdfStatus}</div> : null}
          {pdfError ? <div style={styles.toast}>{pdfError}</div> : null}

          {pdfUrl ? (
            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a href={pdfUrl} target="_blank" rel="noreferrer" style={styles.link}>
                Open PDF
              </a>
              <button
                onClick={() => copy(pdfUrl, "PDF URL copied")}
                style={styles.btnGhost}
              >
                Copy link
              </button>
            </div>
          ) : null}
        </div>

        {/* curl */}
        <div style={styles.section}>
          <div style={styles.label}>Example request (curl)</div>
          <pre style={styles.pre}>
{`curl -X POST ${apiBase}/api/meta-scrape \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${project.apiKey}" \\
  -d '{"url":"${project.websiteUrl || "https://example.com"}"}'`}
          </pre>
        </div>
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    minHeight: "100vh",
    padding: 24,
    background: "#0b0f17",
    color: "#e8eefc",
    display: "grid",
    placeItems: "start center",
  },
  card: {
    width: "min(900px, 100%)",
    background: "#121a2a",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: 22,
  },
  section: { marginTop: 18 },
  label: { fontSize: 13, opacity: 0.75, marginBottom: 8 },
  code: {
    display: "inline-block",
    padding: "8px 10px",
    borderRadius: 12,
    background: "#0f1625",
    border: "1px solid rgba(255,255,255,0.10)",
  },
  codeInline: {
    padding: "4px 8px",
    borderRadius: 10,
    background: "#0f1625",
    border: "1px solid rgba(255,255,255,0.10)",
  },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  btnSmall: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "none",
    cursor: "pointer",
    background: "#4a7dff",
    color: "#fff",
    fontWeight: 700,
  },
  btnGhost: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    cursor: "pointer",
    background: "transparent",
    color: "#e8eefc",
    fontWeight: 700,
  },
  epCard: {
    padding: 14,
    borderRadius: 14,
    background: "#0f1625",
    border: "1px solid rgba(255,255,255,0.10)",
  },
  pre: {
    marginTop: 10,
    padding: 14,
    borderRadius: 14,
    background: "#0f1625",
    border: "1px solid rgba(255,255,255,0.10)",
    overflowX: "auto",
    lineHeight: 1.5,
  },
  link: { color: "#8fb0ff", textDecoration: "none", fontWeight: 700 },
  toast: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    background: "rgba(74,125,255,0.16)",
    border: "1px solid rgba(74,125,255,0.25)",
    fontSize: 13,
  },
  optsWrap: {
    padding: 14,
    borderRadius: 14,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  optsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  optsCard: {
    padding: 14,
    borderRadius: 14,
    background: "#0f1625",
    border: "1px solid rgba(255,255,255,0.10)",
  },
  optsTitle: { fontWeight: 800, marginBottom: 10 },
  checkRow: { display: "flex", gap: 8, alignItems: "center", marginTop: 10 },
  twoCols: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    marginTop: 10,
  },
  smallLabel: { fontSize: 13, opacity: 0.7, marginBottom: 6, marginTop: 10 },
  smallInput: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#0b0f17",
    color: "#e8eefc",
    outline: "none",
  },
  select: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#0b0f17",
    color: "#e8eefc",
    outline: "none",
  },

  // NEW UI styles for meta cards
  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 10,
    marginTop: 12,
  },
  metricCard: {
    padding: 14,
    borderRadius: 14,
    background: "#0f1625",
    border: "1px solid rgba(255,255,255,0.10)",
  },
  metricLabel: { fontSize: 13, opacity: 0.75 },
  metricValue: { fontWeight: 900, fontSize: 18, marginTop: 6 },
  metricHint: {
    opacity: 0.75,
    fontSize: 12,
    marginTop: 6,
    lineHeight: 1.35,
  },
};
