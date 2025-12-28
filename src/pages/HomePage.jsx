import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { validateHttpUrl } from "../utils/validateUrl.js";
import { generateProject } from "../api/public.js";

const LS_KEY = "siterelic_guest_project";

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

function loadProjectFromLS() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.projectId) return null;
    return data;
  } catch {
    return null;
  }
}

export default function HomePage() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [now, setNow] = useState(Date.now());
  const [lastProject, setLastProject] = useState(null);

  // ✅ server sync flag (same idea as ProjectPage)
  const [serverExpired, setServerExpired] = useState(false);

  const navigate = useNavigate();

  const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";
  const useMock = String(import.meta.env.VITE_USE_MOCK || "").toLowerCase() === "true";

  // ✅ load saved project into state
  useEffect(() => {
    setLastProject(loadProjectFromLS());
  }, []);

  // ✅ ticking clock (always)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // ✅ ping to sync expiresAt from DB (so Compass edit reflects)
  useEffect(() => {
    if (!lastProject?.apiKey) return;

    let cancelled = false;

    async function pingOnce() {
      try {
        const res = await fetch(`${apiBase}/api/ping`, {
          method: "GET",
          headers: { "x-api-key": lastProject.apiKey },
        });

        // If key invalid / project deleted => expired state
        if (!res.ok) {
          if (!cancelled) setServerExpired(true);
          return;
        }

        const data = await res.json();

        const next = {
          ...lastProject,
          projectId: data?.projectId || lastProject.projectId,
          websiteUrl: data?.websiteUrl || lastProject.websiteUrl,
          allowedDomain: data?.allowedDomain || lastProject.allowedDomain,
          expiresAt: data?.expiresAt || lastProject.expiresAt,
        };

        if (!cancelled) {
          localStorage.setItem(LS_KEY, JSON.stringify(next));
          setLastProject(next);
          setServerExpired(false);
        }
      } catch {
        // ignore network errors (don’t flip UI)
      }
    }

    pingOnce();
    const t = setInterval(pingOnce, 10000);

    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastProject?.apiKey]);

  const lastAllowedDomain =
    lastProject?.allowedDomain || safeHostname(lastProject?.websiteUrl || "");

  const expiresAtMs = lastProject?.expiresAt
    ? new Date(lastProject.expiresAt).getTime()
    : 0;

  const remaining = expiresAtMs ? expiresAtMs - now : 0;

  // ✅ if server says expired OR time passed
  const isExpired = serverExpired || (!!expiresAtMs && remaining <= 0);

  function onContinue() {
    if (!lastProject?.projectId) return;
    navigate(`/p/${lastProject.projectId}`);
  }

  function onClearSaved() {
    localStorage.removeItem(LS_KEY);
    setLastProject(null);
    setServerExpired(false);
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError("");

    const v = validateHttpUrl(url);
    if (!v.ok) {
      setError(v.message);
      return;
    }

    setLoading(true);
    try {
      const data = await generateProject({ url: v.normalized });

      localStorage.setItem(LS_KEY, JSON.stringify(data));
      setLastProject(data);
      setServerExpired(false);

      navigate(`/p/${data.projectId}`);
    } catch (err) {
      setError(err?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.stack}>
        {/* Continue block (only if saved) */}
        {lastProject ? (
          <div style={styles.card}>
            <div style={styles.topRow}>
              <div>
                <div style={styles.kicker}>Saved project</div>
                <h2 style={styles.h2}>Continue where you left off</h2>
              </div>

              <button onClick={onClearSaved} style={styles.btnGhost} type="button">
                Clear saved
              </button>
            </div>

            <div style={styles.meta}>
              <div style={styles.metaRow}>
                <span style={styles.metaKey}>URL</span>
                <code style={styles.codeInline}>{lastProject.websiteUrl}</code>
              </div>

              <div style={styles.metaRow}>
                <span style={styles.metaKey}>Allowed domain</span>
                <code style={styles.codeInline}>{lastAllowedDomain || "—"}</code>
              </div>

              <div style={styles.metaRow}>
                <span style={styles.metaKey}>Expires in</span>
                <code style={styles.codeInline}>
                  {lastProject.expiresAt
                    ? (isExpired ? "Expired" : msToTime(remaining))
                    : (isExpired ? "Expired" : "—")}
                </code>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <button onClick={onContinue} style={styles.button} type="button">
                Continue
              </button>

              {isExpired ? (
                <div style={styles.pill}>
                  Expired — open project to regenerate key
                </div>
              ) : (
                <div style={styles.pill}>Ready</div>
              )}
            </div>
          </div>
        ) : null}

        {/* Generate new */}
        <div style={styles.card}>
          <h1 style={styles.h1}>Site API Generator (MVP)</h1>
          <p style={styles.p}>
            Paste your website URL and we’ll generate a guest API key + endpoints.
          </p>

          <form onSubmit={onSubmit} style={styles.form}>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              style={styles.input}
              autoComplete="off"
            />
            <button disabled={loading} style={styles.button} type="submit">
              {loading ? "Generating..." : "Generate API"}
            </button>
          </form>

          {error ? <div style={styles.error}>{error}</div> : null}

          <div style={styles.note}>
            <div>
              <strong>Mode:</strong> {useMock ? "Mock (no backend)" : "Live backend"}
            </div>
            <div style={{ marginTop: 6 }}>
              <strong>API Base:</strong> <code style={styles.codeInline}>{apiBase}</code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: 24,
    background: "#0b0f17",
    color: "#e8eefc",
  },
  stack: {
    width: "min(840px, 100%)",
    display: "grid",
    gap: 14,
  },
  card: {
    background: "#121a2a",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: 22,
  },
  topRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "start",
  },
  kicker: { fontSize: 12, opacity: 0.7, marginBottom: 6 },
  h1: { margin: 0, fontSize: 26 },
  h2: { margin: 0, fontSize: 20 },
  p: { marginTop: 8, opacity: 0.85, marginBottom: 0 },
  form: { display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" },
  input: {
    flex: 1,
    minWidth: 240,
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#0f1625",
    color: "#e8eefc",
    outline: "none",
  },
  button: {
    padding: "12px 14px",
    borderRadius: 12,
    border: "none",
    cursor: "pointer",
    background: "#4a7dff",
    color: "#fff",
    fontWeight: 800,
    minWidth: 160,
    opacity: 1,
  },
  btnGhost: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    cursor: "pointer",
    background: "transparent",
    color: "#e8eefc",
    fontWeight: 800,
  },
  error: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    background: "rgba(255, 67, 67, 0.12)",
    border: "1px solid rgba(255, 67, 67, 0.25)",
  },
  note: {
    marginTop: 14,
    opacity: 0.85,
    fontSize: 13,
    padding: 12,
    borderRadius: 12,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  meta: {
    marginTop: 12,
    display: "grid",
    gap: 10,
  },
  metaRow: {
    display: "grid",
    gridTemplateColumns: "140px 1fr",
    gap: 10,
    alignItems: "center",
  },
  metaKey: { fontSize: 13, opacity: 0.75 },
  codeInline: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: 12,
    background: "#0f1625",
    border: "1px solid rgba(255,255,255,0.10)",
  },
  pill: {
    padding: "10px 12px",
    borderRadius: 999,
    background: "rgba(74,125,255,0.16)",
    border: "1px solid rgba(74,125,255,0.25)",
    fontSize: 13,
    fontWeight: 700,
    alignSelf: "center",
  },
};
