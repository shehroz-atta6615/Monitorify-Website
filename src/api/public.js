const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";
const USE_MOCK = String(import.meta.env.VITE_USE_MOCK).toLowerCase() === "true";

console.log("USE_MOCK =", import.meta.env.VITE_USE_MOCK);

function mockGenerate(url) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const projectId = crypto.randomUUID();
      resolve({
        projectId,
        apiKey: "guest_" + crypto.randomUUID().replaceAll("-", ""),
        websiteUrl: url,
        endpoints: [
          { name: "Meta Scrape", path: "/api/meta-scrape", method: "POST" },
          { name: "Screenshot", path: "/api/screenshot", method: "POST" },
          { name: "URL to PDF", path: "/api/url2pdf", method: "POST" },
        ],
      });
    }, 700);
  });
}

export async function generateProject({ url }) {
  if (USE_MOCK) return mockGenerate(url);

  const res = await fetch(`${API_BASE}/public/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `Request failed (${res.status})`);
  }

  return res.json();
}
