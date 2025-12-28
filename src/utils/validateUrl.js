export function validateHttpUrl(input) {
  if (!input) return { ok: false, message: "Please enter a URL." };

  const trimmed = input.trim();

  if (!/^https?:\/\//i.test(trimmed)) {
    return { ok: false, message: "URL must start with http:// or https://." };
  }

  try {
    const u = new URL(trimmed);

    // Basic hostname check
    if (!u.hostname || u.hostname.includes(" ")) {
      return { ok: false, message: "Invalid URL hostname." };
    }

    return { ok: true, normalized: u.toString() };
  } catch {
    return { ok: false, message: "Invalid URL format." };
  }
}
