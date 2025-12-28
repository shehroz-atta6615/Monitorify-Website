import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  listMonitors,
  createMonitor,
  updateMonitor,
  deleteMonitor,
} from "../api/monitors.js";
import { validateHttpUrl } from "../utils/validateUrl.js";

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
      // auto refresh me spam na ho, but still show latest error once
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

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <div>
            <h2 style={{ margin: 0 }}>Monitors</h2>
            <div style={{ opacity: 0.8, marginTop: 6 }}>
              Allowed domain: <code>{allowedDomain || "—"}</code>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              type="button"
              onClick={() => refresh({ silent: false })}
              style={styles.btnGhost}
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>

            <Link to={`/p/${project.projectId}`} style={styles.link}>
              ← Back to project
            </Link>
          </div>
        </div>

        <div style={styles.section}>
          <div style={styles.label}>Create monitor</div>

          <form onSubmit={onCreate} style={styles.formGrid}>
            <div>
              <div style={styles.smallLabel}>Name</div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Homepage"
                style={styles.input}
              />
            </div>

            <div>
              <div style={styles.smallLabel}>URL (same domain only)</div>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                style={styles.input}
              />
            </div>

            <div style={styles.twoCols}>
              <div>
                <div style={styles.smallLabel}>Interval (sec)</div>
                <input
                  type="number"
                  value={intervalSec}
                  onChange={(e) => setIntervalSec(e.target.value)}
                  style={styles.input}
                  min={60}
                />
              </div>

              <div>
                <div style={styles.smallLabel}>Timeout (ms)</div>
                <input
                  type="number"
                  value={timeoutMs}
                  onChange={(e) => setTimeoutMs(e.target.value)}
                  style={styles.input}
                  min={1000}
                />
              </div>
            </div>

            <label style={styles.checkRow}>
              <input
                type="checkbox"
                checked={followRedirects}
                onChange={(e) => setFollowRedirects(e.target.checked)}
              />
              <span>Follow redirects</span>
            </label>

            <button style={styles.btn} type="submit">
              Add Monitor
            </button>
          </form>

          {err ? <div style={styles.toast}>{err}</div> : null}
        </div>

        <div style={styles.section}>
          <div style={styles.label}>
            Your monitors {loading ? "(loading...)" : `(${items.length})`}
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {items.map((m) => (
              <div key={m._id} style={styles.monCard}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>{m.name || "(no name)"}</div>

                    <div style={{ opacity: 0.85, marginTop: 4 }}>
                      <code>{m.url}</code>
                    </div>

                    <div style={{ opacity: 0.75, marginTop: 6, fontSize: 13 }}>
                      {m.isActive ? "Active" : "Paused"} • Interval: {m.intervalSec}s • Timeout:{" "}
                      {m.timeoutMs}ms • Redirects: {m.followRedirects ? "On" : "Off"}
                    </div>

                    <div style={{ opacity: 0.75, marginTop: 6, fontSize: 13 }}>
                      Last: {m.lastStatus}{" "}
                      {m.lastHttpStatus ? `(${m.lastHttpStatus})` : ""}
                      {m.lastResponseTimeMs ? ` • ${m.lastResponseTimeMs}ms` : ""}
                      {m.lastError ? ` • ${m.lastError}` : ""}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignSelf: "start" }}>
                    <button
                      type="button"
                      onClick={() => toggleActive(m)}
                      style={styles.btnGhost}
                    >
                      {m.isActive ? "Pause" : "Resume"}
                    </button>

                    <button
                      type="button"
                      onClick={() => onDelete(m)}
                      style={styles.btnDanger}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {!loading && items.length === 0 ? (
              <div style={styles.empty}>No monitors yet. Add your first one above.</div>
            ) : null}
          </div>
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
    width: "min(920px, 100%)",
    background: "#121a2a",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: 22,
  },
  section: { marginTop: 18 },
  label: { fontSize: 13, opacity: 0.75, marginBottom: 8 },
  smallLabel: { fontSize: 13, opacity: 0.7, marginBottom: 6, marginTop: 10 },
  link: { color: "#8fb0ff", textDecoration: "none", fontWeight: 700 },
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#0b0f17",
    color: "#e8eefc",
    outline: "none",
  },
  formGrid: {
    display: "grid",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  twoCols: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  checkRow: { display: "flex", gap: 8, alignItems: "center", marginTop: 6 },
  btn: {
    padding: "12px 14px",
    borderRadius: 12,
    border: "none",
    cursor: "pointer",
    background: "#4a7dff",
    color: "#fff",
    fontWeight: 800,
    marginTop: 4,
    width: "fit-content",
    minWidth: 160,
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
  btnDanger: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255, 67, 67, 0.35)",
    cursor: "pointer",
    background: "rgba(255, 67, 67, 0.12)",
    color: "#ffd7d7",
    fontWeight: 800,
  },
  toast: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    background: "rgba(74,125,255,0.16)",
    border: "1px solid rgba(74,125,255,0.25)",
    fontSize: 13,
  },
  monCard: {
    padding: 14,
    borderRadius: 14,
    background: "#0f1625",
    border: "1px solid rgba(255,255,255,0.10)",
  },
  empty: {
    marginTop: 6,
    padding: 12,
    borderRadius: 12,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
    opacity: 0.85,
  },
};
