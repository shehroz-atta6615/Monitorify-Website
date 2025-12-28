export async function listMonitors({ apiBase, apiKey }) {
  const res = await fetch(`${apiBase}/api/monitors`, {
    method: "GET",
    headers: { "x-api-key": apiKey },
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `Request failed (${res.status})`);
  }

  return res.json();
}

export async function createMonitor({ apiBase, apiKey, payload }) {
  const res = await fetch(`${apiBase}/api/monitors`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `Request failed (${res.status})`);
  }

  return res.json();
}

export async function updateMonitor({ apiBase, apiKey, id, patch }) {
  const res = await fetch(`${apiBase}/api/monitors/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(patch),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `Request failed (${res.status})`);
  }

  return res.json();
}

export async function deleteMonitor({ apiBase, apiKey, id }) {
  const res = await fetch(`${apiBase}/api/monitors/${id}`, {
    method: "DELETE",
    headers: { "x-api-key": apiKey },
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `Request failed (${res.status})`);
  }

  return res.json();
}
