export function detectTechnology({ url = "", html = "", headers = {} }) {
  const h = {};
  for (const [k, v] of Object.entries(headers || {})) {
    h[String(k).toLowerCase()] = String(v);
  }

  const hay = `${url}\n${html}\n${Object.entries(h).map(([k, v]) => `${k}:${v}`).join("\n")}`.toLowerCase();

  const tech = [];

  // WordPress
  if (
    hay.includes("wp-content") ||
    hay.includes("wp-includes") ||
    hay.includes('name="generator"') && hay.includes("wordpress")
  ) tech.push("WordPress");

  // Shopify
  if (hay.includes("cdn.shopify.com") || hay.includes("x-shopid") || hay.includes("shopify")) tech.push("Shopify");

  // Next.js
  if (hay.includes("__next_data__") || hay.includes("/_next/")) tech.push("Next.js");

  // React (generic SPA)
  if (hay.includes("data-reactroot") || hay.includes("react-dom") || hay.includes("__react_devtools_global_hook__")) tech.push("React");

  // Vue / Nuxt
  if (hay.includes("data-v-") || hay.includes("__vue__")) tech.push("Vue");
  if (hay.includes("__nuxt") || hay.includes("/_nuxt/")) tech.push("Nuxt");

  // PHP (generic)
  if (h["x-powered-by"]?.toLowerCase().includes("php") || hay.includes(".php")) tech.push("PHP");

  // Laravel
  if (hay.includes("laravel_session") || hay.includes("x-powered-by: laravel")) tech.push("Laravel");

  // ASP.NET
  if (hay.includes("x-aspnet-version") || hay.includes("asp.net")) tech.push("ASP.NET");

  const unique = [...new Set(tech)];
  const primary = unique[0] || "Unknown";

  return { primary, detected: unique };
}
