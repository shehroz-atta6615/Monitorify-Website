// export function detectTechnology({ url = "", html = "", headers = {} }) {
//   const h = {};
//   for (const [k, v] of Object.entries(headers || {})) {
//     h[String(k).toLowerCase()] = String(v);
//   }

//   const hay = `${url}\n${html}\n${Object.entries(h).map(([k, v]) => `${k}:${v}`).join("\n")}`.toLowerCase();

//   const tech = [];

//   // WordPress
//   if (
//     hay.includes("wp-content") ||
//     hay.includes("wp-includes") ||
//     hay.includes('name="generator"') && hay.includes("wordpress")
//   ) tech.push("WordPress");

//   // Shopify
//   if (hay.includes("cdn.shopify.com") || hay.includes("x-shopid") || hay.includes("shopify")) tech.push("Shopify");

//   // Next.js
//   if (hay.includes("__next_data__") || hay.includes("/_next/")) tech.push("Next.js");

//   // React (generic SPA)
//   if (hay.includes("data-reactroot") || hay.includes("react-dom") || hay.includes("__react_devtools_global_hook__")) tech.push("React");

//   // Vue / Nuxt
//   if (hay.includes("data-v-") || hay.includes("__vue__")) tech.push("Vue");
//   if (hay.includes("__nuxt") || hay.includes("/_nuxt/")) tech.push("Nuxt");

//   // PHP (generic)
//   if (h["x-powered-by"]?.toLowerCase().includes("php") || hay.includes(".php")) tech.push("PHP");

//   // Laravel
//   if (hay.includes("laravel_session") || hay.includes("x-powered-by: laravel")) tech.push("Laravel");

//   // ASP.NET
//   if (hay.includes("x-aspnet-version") || hay.includes("asp.net")) tech.push("ASP.NET");

//   const unique = [...new Set(tech)];
//   const primary = unique[0] || "Unknown";

//   return { primary, detected: unique };
// }

// detectTechnology.js
// More accurate, score-based detection (reduces false positives like "shopify" text)

// export function detectTechnology({ url = "", html = "", headers = {} }) {
//   // normalize headers
//   const h = {};
//   for (const [k, v] of Object.entries(headers || {})) {
//     h[String(k).toLowerCase()] = Array.isArray(v) ? v.join(", ") : String(v);
//   }

//   const urlLower = String(url || "").toLowerCase();
//   const htmlLower = String(html || "").toLowerCase();

//   const headerLines = Object.entries(h)
//     .map(([k, v]) => `${k}:${String(v).toLowerCase()}`)
//     .join("\n");

//   // main searchable haystack
//   const hay = `${urlLower}\n${htmlLower}\n${headerLines}`;

//   // helpers
//   const scores = new Map();
//   const evidence = new Map();

//   function add(tech, points, reason) {
//     scores.set(tech, (scores.get(tech) || 0) + points);
//     if (!evidence.has(tech)) evidence.set(tech, []);
//     evidence.get(tech).push(reason);
//   }

//   function hasHeader(name) {
//     return h[name.toLowerCase()] !== undefined;
//   }

//   function headerIncludes(name, needle) {
//     const v = h[name.toLowerCase()];
//     if (!v) return false;
//     return String(v).toLowerCase().includes(String(needle).toLowerCase());
//   }

//   function anyHeaderKeyStartsWith(prefix) {
//     const p = prefix.toLowerCase();
//     return Object.keys(h).some((k) => k.startsWith(p));
//   }

//   function cookieHas(rx) {
//     const sc = (h["set-cookie"] || "").toLowerCase();
//     return rx.test(sc);
//   }

//   // ---------------------------
//   // WordPress (+ WooCommerce)
//   // ---------------------------
//   if (/(\/wp-content\/|\/wp-includes\/)/i.test(hay)) add("WordPress", 8, "wp-content/wp-includes");
//   if (/wp-emoji-release\.min\.js/i.test(hay)) add("WordPress", 4, "wp emoji script");
//   if (/\/wp-json\/|rel=["']https:\/\/api\.w\.org\//i.test(hay)) add("WordPress", 4, "wp-json/api.w.org");
//   if (/<meta[^>]+name=["']generator["'][^>]+wordpress/i.test(html)) add("WordPress", 6, "meta generator wordpress");
//   if (hasHeader("x-pingback") || /xmlrpc\.php/i.test(hay)) add("WordPress", 3, "pingback/xmlrpc");

//   // WooCommerce (only if WP is also likely)
//   if (/woocommerce/i.test(hay) && (scores.get("WordPress") || 0) >= 6) {
//     add("WooCommerce", 6, "woocommerce signals + WP");
//   }

//   // ---------------------------
//   // Shopify (STRICT)
//   // IMPORTANT: do NOT detect Shopify by plain word "shopify"
//   // ---------------------------
//   // Ultra-strong / store-level signals
//   if (anyHeaderKeyStartsWith("x-shopify-")) add("Shopify", 10, "x-shopify-* headers");
//   if (hasHeader("x-shopid")) add("Shopify", 10, "x-shopid header");
//   if (hasHeader("x-sorting-hat-shopid")) add("Shopify", 10, "x-sorting-hat-shopid header");
//   if (cookieHas(/_shopify_|secure_customer_sig|cart_sig|tracked_start_checkout|shopify_pay/i)) {
//     add("Shopify", 10, "shopify cookies");
//   }

//   // Strong HTML/runtime signals
//   // (use original html to catch casing patterns too)
//   if (/\bwindow\.Shopify\b|\bShopify\.theme\b|\bShopifyAnalytics\b/i.test(html)) {
//     add("Shopify", 8, "window.Shopify / Shopify.theme / ShopifyAnalytics");
//   }

//   // Storefront / admin domains
//   if (/\.myshopify\.com/i.test(hay)) add("Shopify", 9, "myshopify domain present");
//   if (/storefrontapi\.com|\/api\/\d{4}-\d{2}\/graphql\.json/i.test(hay)) {
//     add("Shopify", 7, "Shopify Storefront API");
//   }

//   // Asset CDN signals (NOT enough alone)
//   if (/cdn\.shopify\.com\/shopifycloud\//i.test(hay)) add("Shopify", 4, "shopifycloud assets");
//   if (/cdn\.shopify\.com\/s\/files\//i.test(hay)) add("Shopify", 4, "shopify theme assets");
//   if (/cdn\.shopify\.com\/extensions\//i.test(hay)) add("Shopify", 3, "shopify extensions assets");

//   // Meta generator "Shopify" (only meaningful if some other Shopify signal exists)
//   const hasShopifyGenerator = /<meta[^>]+name=["']generator["'][^>]+shopify/i.test(html);
//   if (hasShopifyGenerator) add("Shopify", 3, "meta generator shopify");

//   // final Shopify sanity: require strong confidence
//   // (prevents false positives from blog text like “we build Shopify stores”)
//   const shopifyScore = scores.get("Shopify") || 0;
//   const shopifyStrong =
//     anyHeaderKeyStartsWith("x-shopify-") ||
//     hasHeader("x-shopid") ||
//     hasHeader("x-sorting-hat-shopid") ||
//     cookieHas(/_shopify_|secure_customer_sig|cart_sig|tracked_start_checkout|shopify_pay/i) ||
//     /\bwindow\.Shopify\b|\bShopify\.theme\b|\bShopifyAnalytics\b/i.test(html) ||
//     /\.myshopify\.com/i.test(hay) ||
//     /storefrontapi\.com|\/api\/\d{4}-\d{2}\/graphql\.json/i.test(hay);

//   // If only weak CDN/meta exists, don't claim Shopify as platform
//   if (!shopifyStrong && shopifyScore > 0) {
//     // downgrade/remove Shopify (treat as embedded asset mention)
//     scores.delete("Shopify");
//     evidence.delete("Shopify");
//   }

//   // ---------------------------
//   // Next.js
//   // ---------------------------
//   if (/__next_data__|\/_next\/static\//i.test(hay)) add("Next.js", 8, "__NEXT_DATA__ / _next/static");
//   if (headerIncludes("x-powered-by", "next.js")) add("Next.js", 6, "x-powered-by next.js");
//   if (/next-router-state-tree|next-route-announcer/i.test(hay)) add("Next.js", 3, "next runtime hints");

//   // ---------------------------
//   // React (generic)
//   // ---------------------------
//   if (/data-reactroot|__react_devtools_global_hook__|react-dom/i.test(hay)) {
//     add("React", 6, "react root/devtools/react-dom");
//   }

//   // ---------------------------
//   // Vue / Nuxt
//   // ---------------------------
//   if (/data-v-|__vue__|vue\.runtime/i.test(hay)) add("Vue", 6, "vue runtime markers");
//   if (/__nuxt|\/_nuxt\//i.test(hay)) add("Nuxt", 8, "__nuxt/_nuxt");

//   // ---------------------------
//   // PHP + Laravel
//   // ---------------------------
//   if (headerIncludes("x-powered-by", "php") || /\.php(\b|[?#])/i.test(hay)) add("PHP", 4, "x-powered-by php or .php");
//   if (cookieHas(/laravel_session|xsrf-token/i) || headerIncludes("x-powered-by", "laravel") || /laravel/i.test(headerLines)) {
//     add("Laravel", 7, "laravel cookies/headers");
//   }

//   // ---------------------------
//   // ASP.NET
//   // ---------------------------
//   if (hasHeader("x-aspnet-version") || hasHeader("x-aspnetmvc-version")) add("ASP.NET", 9, "aspnet headers");
//   if (cookieHas(/asp\.net_sessionid/i) || /asp\.net/i.test(hay)) add("ASP.NET", 6, "asp.net cookie/text");

//   // ---------------------------
//   // Thresholds (tuned to reduce false positives)
//   // ---------------------------
//   const THRESHOLD = {
//     "WordPress": 6,
//     "WooCommerce": 6,
//     "Shopify": 9,     // strict: needs strong store-level signals
//     "Next.js": 6,
//     "React": 5,
//     "Vue": 5,
//     "Nuxt": 6,
//     "Laravel": 6,
//     "ASP.NET": 6,
//     "PHP": 3,
//   };

//   // build detected list
//   const ranked = Array.from(scores.entries()).sort((a, b) => b[1] - a[1]);

//   const detected = ranked
//     .filter(([name, sc]) => sc >= (THRESHOLD[name] ?? 5))
//     .map(([name]) => name);

//   const primary = detected[0] || "Unknown";

//   return {
//     primary,
//     detected,
//     // Helpful during debugging; safe to keep (front-end won't break)
//     confidence: ranked.reduce((acc, [k, v]) => {
//       acc[k] = v;
//       return acc;
//     }, {}),
//     // uncomment if you want reasons in dev
//     // evidence: Object.fromEntries(Array.from(evidence.entries())),
//   };
// }


export function detectTechnology({ url = "", html = "", headers = {} }) {
  // normalize headers to lowercase keys
  const h = {};
  for (const [k, v] of Object.entries(headers || {})) {
    h[String(k).toLowerCase()] = String(v);
  }

  const urlL = String(url || "").toLowerCase();
  const htmlL = String(html || "").toLowerCase();
  const headersDump = Object.entries(h)
    .map(([k, v]) => `${k}:${v}`)
    .join("\n")
    .toLowerCase();

  // IMPORTANT: Do NOT rely on plain text "shopify" in body.
  const hay = `${urlL}\n${headersDump}\n${htmlL}`;

  const hits = [];

  const add = (name, score) => hits.push({ name, score });

  const hasHeader = (key) => Object.prototype.hasOwnProperty.call(h, key);
  const headerStartsWith = (prefix) =>
    Object.keys(h).some((k) => k.startsWith(prefix));
  const headerValIncludes = (key, needle) =>
    String(h[key] || "").toLowerCase().includes(String(needle).toLowerCase());

  // -----------------------
  // CMS / Site builders
  // -----------------------

  // Webflow (DEV SINC)
  if (hay.includes("website-files.com")) add("Webflow", 10);
  if (hay.includes("webflow.js")) add("Webflow", 9);
  if (hay.includes("data-wf-site") || hay.includes("data-wf-page")) add("Webflow", 8);
  if (hay.includes("w-webflow-badge") || hay.includes("w-nav") || hay.includes("w-inline-block"))
    add("Webflow", 6);
  if (hay.includes('name="generator"') && hay.includes("webflow")) add("Webflow", 7);

  // WordPress
  if (hay.includes("wp-content") || hay.includes("wp-includes")) add("WordPress", 10);
  if (hay.includes("/wp-json/")) add("WordPress", 7);
  if (hay.includes('name="generator"') && hay.includes("wordpress")) add("WordPress", 8);

  // Wix
  if (hay.includes("wixsite.com") || hay.includes("wixstatic.com")) add("Wix", 10);

  // Squarespace
  if (hay.includes("squarespace.com") || hay.includes("static.squarespace.com")) add("Squarespace", 10);

  // Framer
  if (hay.includes("framerusercontent.com") || hay.includes("framer.com/m/")) add("Framer", 10);

  // Shopify (STRICT signals only)
  const shopifyStrong =
    hay.includes("cdn.shopify.com") ||
    hay.includes("myshopify.com") ||
    hay.includes("shopifycloud.com") ||
    /<meta[^>]+name=["']shopify-/.test(hay) ||
    /window\.shopify|shopify\.theme|shopify\.routes/.test(hay) ||
    headerStartsWith("x-shopify-") ||
    headerValIncludes("server", "shopify") ||
    headerValIncludes("via", "shopify");

  if (shopifyStrong) add("Shopify", 12);

  // Magento
  if (hay.includes("mage/cookies") || hay.includes("magento")) add("Magento", 9);

  // BigCommerce
  if (hay.includes("cdn.bc0a.com") || hay.includes("bigcommerce")) add("BigCommerce", 9);

  // -----------------------
  // Frameworks
  // -----------------------

  // Next.js
  if (hay.includes("__next_data__") || hay.includes("/_next/")) add("Next.js", 9);
  if (hay.includes("next-head-count")) add("Next.js", 6);

  // Nuxt
  if (hay.includes("__nuxt") || hay.includes("/_nuxt/")) add("Nuxt", 8);

  // Gatsby
  if (hay.includes("gatsby") && (hay.includes("webpackchunk") || hay.includes("__gatsby"))) add("Gatsby", 7);

  // React (generic)
  if (hay.includes("data-reactroot") || hay.includes("react-dom") || hay.includes("__react_devtools_global_hook__"))
    add("React", 6);

  // Vue
  if (hay.includes("data-v-") || hay.includes("__vue__")) add("Vue", 6);

  // SvelteKit
  if (hay.includes("sveltekit") || hay.includes("/_app/immutable/")) add("SvelteKit", 8);

  // -----------------------
  // Backend hints
  // -----------------------
  if (headerValIncludes("x-powered-by", "php") || hay.includes(".php")) add("PHP", 4);
  if (hay.includes("laravel_session") || headerValIncludes("x-powered-by", "laravel")) add("Laravel", 7);
  if (hasHeader("x-aspnet-version") || hay.includes("asp.net")) add("ASP.NET", 7);

  // -----------------------
  // Decide primary by score
  // -----------------------
  const bestByName = new Map();
  for (const hit of hits) {
    const prev = bestByName.get(hit.name);
    if (!prev || hit.score > prev.score) bestByName.set(hit.name, hit);
  }

  const unique = Array.from(bestByName.values())
    .sort((a, b) => b.score - a.score)
    .map((x) => x.name);

  const primary = unique[0] || "Unknown";
  return { primary, detected: unique };
}

