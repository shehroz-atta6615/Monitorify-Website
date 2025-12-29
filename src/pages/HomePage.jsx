import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { validateHttpUrl } from "../utils/validateUrl.js";
import { generateProject } from "../api/public.js";
import '../designPages/HomePage.css'

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
  const useMock =
    String(import.meta.env.VITE_USE_MOCK || "").toLowerCase() === "true";

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

  const statusLabel = isExpired ? "Expired" : "Ready";

  return (
    <div className="sr-home">
      {/* animated background layers */}
      <div className="sr-bg" aria-hidden="true">
        <div className="sr-bg__grid" />
        <div className="sr-bg__orb sr-bg__orb--a" />
        <div className="sr-bg__orb sr-bg__orb--b" />
        <div className="sr-bg__orb sr-bg__orb--c" />
        <div className="sr-bg__noise" />
      </div>

      <div className="sr-shell">
        <header className="sr-header">
          <div className="sr-brand">
            <div className="sr-logo" aria-hidden="true">
              <span className="sr-logo__dot" />
            </div>
            <div className="sr-brand__text">
              <div className="sr-kicker">SiteRelic</div>
              <div className="sr-title">Site API Generator</div>
            </div>
          </div>

          <div className="sr-header__meta">
            <div className="sr-badge">
              <span className="sr-badge__label">Mode</span>
              <span className="sr-badge__value">
                {useMock ? "Mock" : "Live"}
              </span>
            </div>

            <div className="sr-badge sr-badge--wide">
              <span className="sr-badge__label">API Base</span>
              <code className="sr-code">{apiBase}</code>
            </div>
          </div>
        </header>

        <main className="sr-stack">
          {/* Continue block (only if saved) */}
          {lastProject ? (
            <section className="sr-card sr-card--lift sr-animate-in">
              <div className="sr-card__top">
                <div>
                  <div className="sr-kicker">Saved project</div>
                  <h2 className="sr-h2">Continue where you left off</h2>
                </div>

                <button
                  onClick={onClearSaved}
                  className="sr-btn sr-btn--ghost"
                  type="button"
                >
                  Clear saved
                </button>
              </div>

              <div className="sr-meta">
                <div className="sr-meta__row">
                  <span className="sr-meta__key">URL</span>
                  <code className="sr-code sr-code--wrap">
                    {lastProject.websiteUrl}
                  </code>
                </div>

                <div className="sr-meta__row">
                  <span className="sr-meta__key">Allowed domain</span>
                  <code className="sr-code">
                    {lastAllowedDomain || "—"}
                  </code>
                </div>

                <div className="sr-meta__row">
                  <span className="sr-meta__key">Expires in</span>
                  <code className={`sr-code ${isExpired ? "sr-code--danger" : ""}`}>
                    {lastProject.expiresAt
                      ? isExpired
                        ? "Expired"
                        : msToTime(remaining)
                      : isExpired
                      ? "Expired"
                      : "—"}
                  </code>
                </div>
              </div>

              <div className="sr-actions">
                <button
                  onClick={onContinue}
                  className="sr-btn sr-btn--primary"
                  type="button"
                >
                  Continue
                </button>

                <div
                  className={`sr-pill ${
                    isExpired ? "sr-pill--danger" : "sr-pill--ok"
                  }`}
                  role="status"
                  aria-live="polite"
                >
                  {isExpired ? "Expired — open project to regenerate key" : "Ready"}
                </div>
              </div>
            </section>
          ) : null}

          {/* Generate new */}
          <section className="sr-card sr-card--hero sr-animate-in">
            <h1 className="sr-h1">Site API Generator (MVP)</h1>
            <p className="sr-p">
              Paste your website URL and we’ll generate a guest API key + endpoints.
            </p>

            <form onSubmit={onSubmit} className="sr-form">
              <div className="sr-inputWrap">
                <span className="sr-inputIcon" aria-hidden="true">🔗</span>
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="sr-input"
                  autoComplete="off"
                />
                <span className="sr-inputGlow" aria-hidden="true" />
              </div>

              <button
                disabled={loading}
                className={`sr-btn sr-btn--primary ${loading ? "sr-isLoading" : ""}`}
                type="submit"
              >
                <span className="sr-btn__shine" aria-hidden="true" />
                {loading ? "Generating..." : "Generate API"}
              </button>
            </form>

            {error ? (
              <div className="sr-alert sr-alert--danger" role="alert">
                <div className="sr-alert__title">Fix this</div>
                <div className="sr-alert__body">{error}</div>
              </div>
            ) : null}

            <div className="sr-footerNote">
              <div className="sr-mini">
                <span className="sr-mini__k">Status</span>
                <span className={`sr-mini__v ${isExpired ? "sr-mini__v--danger" : "sr-mini__v--ok"}`}>
                  {statusLabel}
                </span>
              </div>

              <div className="sr-divider" />

              <div className="sr-mini">
                <span className="sr-mini__k">Tip</span>
                <span className="sr-mini__v">
                  Your saved project will auto-sync every 10s.
                </span>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
