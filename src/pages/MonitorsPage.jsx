import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  listMonitors,
  createMonitor,
  updateMonitor,
  deleteMonitor,
} from "../api/monitors.js";
import { validateHttpUrl } from "../utils/validateUrl.js";
import '../designPages/MonitorsPage.css'

const LS_KEY = "siterelic_guest_project";

function safeHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export default function MonitorsPage() {
  const { projectId } = useParams();
  const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

  const project = useMemo(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      const p = JSON.parse(raw);
      return p?.projectId ? p : null;
    } catch {
      return null;
    }
  }, [projectId]);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // create form
  const [name, setName] = useState("");
  const [url, setUrl] = useState(project?.websiteUrl || "");
  const [intervalSec, setIntervalSec] = useState(900);
  const [timeoutMs, setTimeoutMs] = useState(30000);
  const [followRedirects, setFollowRedirects] = useState(true);

  useEffect(() => {
    if (project?.websiteUrl) setUrl(project.websiteUrl);
  }, [project?.websiteUrl]);

  const allowedDomain =
    project?.allowedDomain || safeHostname(project?.websiteUrl || "");

  // ✅ prevent overlapping refresh calls + cleanup on unmount
  const refreshTimerRef = useRef(null);
  const refreshingRef = useRef(false);

  async function refresh({ silent = false } = {}) {
    if (!project?.apiKey) return;
    if (refreshingRef.current) return;

    refreshingRef.current = true;
    if (!silent) setLoading(true);
    setErr("");

    try {
      const data = await listMonitors({ apiBase, apiKey: project.apiKey });
      setItems(data?.monitors || []);
    } catch (e) {
      setErr(e?.message || "Failed to load monitors");
    } finally {
      refreshingRef.current = false;
      if (!silent) setLoading(false);
    }
  }

  // initial load + auto refresh every 6s
  useEffect(() => {
    if (!project?.apiKey) return;

    refresh({ silent: false });

    refreshTimerRef.current = setInterval(() => {
      refresh({ silent: true });
    }, 6000);

    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.apiKey]);

  async function onCreate(e) {
    e.preventDefault();
    if (!project?.apiKey) return;

    setErr("");

    const v = validateHttpUrl(url);
    if (!v.ok) {
      setErr(v.message);
      return;
    }

    try {
      await createMonitor({
        apiBase,
        apiKey: project.apiKey,
        payload: {
          name: name.trim(),
          url: v.normalized,
          intervalSec: Number(intervalSec),
          timeoutMs: Number(timeoutMs),
          followRedirects: !!followRedirects,
          isActive: true,
        },
      });

      setName("");
      setUrl(project.websiteUrl || "");
      await refresh({ silent: false });
    } catch (e2) {
      setErr(e2?.message || "Create failed");
    }
  }

  async function toggleActive(m) {
    if (!project?.apiKey) return;

    try {
      const next = !m.isActive;
      const res = await updateMonitor({
        apiBase,
        apiKey: project.apiKey,
        id: m._id,
        patch: { isActive: next },
      });

      const updated = res?.monitor;
      setItems((prev) => prev.map((x) => (x._id === m._id ? updated : x)));
    } catch (e) {
      setErr(e?.message || "Update failed");
    }
  }

  async function onDelete(m) {
    if (!project?.apiKey) return;

    if (!confirm(`Delete monitor "${m.name || m.url}"?`)) return;

    try {
      await deleteMonitor({ apiBase, apiKey: project.apiKey, id: m._id });
      setItems((prev) => prev.filter((x) => x._id !== m._id));
    } catch (e) {
      setErr(e?.message || "Delete failed");
    }
  }

  if (!project) {
    return (
      <div className="srm-page">
        <div className="srm-bg" aria-hidden="true">
          <div className="srm-bg__grid" />
          <div className="srm-bg__orb srm-bg__orb--a" />
          <div className="srm-bg__orb srm-bg__orb--b" />
          <div className="srm-bg__orb srm-bg__orb--c" />
          <div className="srm-bg__noise" />
        </div>

        <div className="srm-shell">
          <div className="srm-card srm-animate-in">
            <h2 className="srm-h2">No project found</h2>
            <p className="srm-p">Go back and generate a guest API key first.</p>
            <Link to="/" className="srm-link">
              ← Back to home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="srm-page">
      <div className="srm-bg" aria-hidden="true">
        <div className="srm-bg__grid" />
        <div className="srm-bg__orb srm-bg__orb--a" />
        <div className="srm-bg__orb srm-bg__orb--b" />
        <div className="srm-bg__orb srm-bg__orb--c" />
        <div className="srm-bg__noise" />
      </div>

      <div className="srm-shell">
        <header className="srm-header srm-animate-in">
          <div className="srm-brand">
            <div className="srm-logo" aria-hidden="true">
              <span className="srm-logo__dot" />
            </div>

            <div className="srm-brand__text">
              <div className="srm-kicker">SiteRelic</div>
              <div className="srm-title">Monitors</div>
            </div>
          </div>

          <div className="srm-header__actions">
            <button
              type="button"
              onClick={() => refresh({ silent: false })}
              className={`srm-btn srm-btn--ghost ${loading ? "srm-isLoading" : ""}`}
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>

            <Link to={`/p/${project.projectId}`} className="srm-link srm-link--pill">
              ← Back to project
            </Link>
          </div>
        </header>

        <main className="srm-stack">
          {/* Overview */}
          <section className="srm-card srm-card--lift srm-animate-in">
            <div className="srm-summary">
              <div className="srm-summary__left">
                <div className="srm-kicker">Scope</div>

                <div className="srm-line">
                  <span className="srm-line__k">Allowed domain</span>
                  <code className="srm-code">{allowedDomain || "—"}</code>
                </div>

                <div className="srm-line">
                  <span className="srm-line__k">Total monitors</span>
                  <code className="srm-code">{items.length}</code>
                </div>
              </div>

              <div className="srm-summary__right">
                <div className={`srm-pill ${loading ? "srm-pill--busy" : "srm-pill--ok"}`}>
                  {loading ? "Syncing" : "Live"}
                </div>
              </div>
            </div>

            {err ? <div className="srm-alert srm-alert--danger">{err}</div> : null}
          </section>

          {/* Create */}
          <section className="srm-card srm-animate-in">
            <div className="srm-sectionHead">
              <div>
                <div className="srm-kicker">Create</div>
                <div className="srm-h3">Add a monitor</div>
              </div>
              <div className="srm-hint">Same domain only</div>
            </div>

            <div className="srm-panel">
              <form onSubmit={onCreate} className="srm-formGrid">
                <div className="srm-field">
                  <div className="srm-smallLabel">Name</div>
                  <div className="srm-inputWrap">
                    <span className="srm-inputIcon" aria-hidden="true">🏷️</span>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Homepage"
                      className="srm-input"
                    />
                    <span className="srm-inputGlow" aria-hidden="true" />
                  </div>
                </div>

                <div className="srm-field">
                  <div className="srm-smallLabel">URL</div>
                  <div className="srm-inputWrap">
                    <span className="srm-inputIcon" aria-hidden="true">🔗</span>
                    <input
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://example.com"
                      className="srm-input"
                    />
                    <span className="srm-inputGlow" aria-hidden="true" />
                  </div>
                </div>

                <div className="srm-twoCols">
                  <div className="srm-field">
                    <div className="srm-smallLabel">Interval (sec)</div>
                    <input
                      type="number"
                      value={intervalSec}
                      onChange={(e) => setIntervalSec(e.target.value)}
                      className="srm-smallInput"
                      min={60}
                    />
                  </div>

                  <div className="srm-field">
                    <div className="srm-smallLabel">Timeout (ms)</div>
                    <input
                      type="number"
                      value={timeoutMs}
                      onChange={(e) => setTimeoutMs(e.target.value)}
                      className="srm-smallInput"
                      min={1000}
                    />
                  </div>
                </div>

                <label className="srm-checkRow">
                  <input
                    type="checkbox"
                    checked={followRedirects}
                    onChange={(e) => setFollowRedirects(e.target.checked)}
                  />
                  <span>Follow redirects</span>
                </label>

                <button className="srm-btn srm-btn--primary" type="submit">
                  <span className="srm-btn__shine" aria-hidden="true" />
                  Add Monitor
                </button>
              </form>
            </div>
          </section>

          {/* List */}
          <section className="srm-card srm-animate-in">
            <div className="srm-row srm-row--top">
              <div>
                <div className="srm-kicker">List</div>
                <div className="srm-h3">
                  Your monitors{" "}
                  <span className="srm-muted">
                    {loading ? "(loading...)" : `(${items.length})`}
                  </span>
                </div>
              </div>
            </div>

            <div className="srm-list">
              {items.map((m) => (
                <div key={m._id} className="srm-monCard">
                  <div className="srm-monTop">
                    <div className="srm-monMain">
                      <div className="srm-monName">{m.name || "(no name)"}</div>

                      <div className="srm-monUrl">
                        <code className="srm-code srm-code--inline">{m.url}</code>
                      </div>

                      <div className="srm-monMeta">
                        <span className={`srm-badge ${m.isActive ? "srm-badge--ok" : "srm-badge--muted"}`}>
                          {m.isActive ? "Active" : "Paused"}
                        </span>
                        <span>Interval: {m.intervalSec}s</span>
                        <span>Timeout: {m.timeoutMs}ms</span>
                        <span>Redirects: {m.followRedirects ? "On" : "Off"}</span>
                      </div>

                      <div className="srm-monMeta srm-monMeta--sub">
                        <span>Last: {m.lastStatus}</span>
                        {m.lastHttpStatus ? <span>({m.lastHttpStatus})</span> : null}
                        {m.lastResponseTimeMs ? <span>• {m.lastResponseTimeMs}ms</span> : null}
                        {m.lastError ? <span className="srm-dangerText">• {m.lastError}</span> : null}
                      </div>
                    </div>

                    <div className="srm-monActions">
                      <button
                        type="button"
                        onClick={() => toggleActive(m)}
                        className="srm-btn srm-btn--ghost"
                      >
                        {m.isActive ? "Pause" : "Resume"}
                      </button>

                      <button
                        type="button"
                        onClick={() => onDelete(m)}
                        className="srm-btn srm-btn--danger"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {!loading && items.length === 0 ? (
                <div className="srm-empty">
                  No monitors yet. Add your first one above.
                </div>
              ) : null}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
