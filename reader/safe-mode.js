const DEFAULT_SAFE_URL = "https://safe.bwondercomics.com";

function normalizeSafeUrl(rawUrl) {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) return DEFAULT_SAFE_URL;
  if (!/^https?:\/\//i.test(trimmed)) return DEFAULT_SAFE_URL;
  return trimmed.replace(/\/+$/, "");
}

function getSafeModeUrl(config) {
  if (!config || typeof config !== "object") return null;
  const site = config.site && typeof config.site === "object" ? config.site : {};
  const enabled = site.safeModeRedirect === true || site.safeMode === true;
  if (!enabled) return null;
  return normalizeSafeUrl(site.safeModeUrl || DEFAULT_SAFE_URL);
}

async function checkSafeMode() {
  const host = window.location.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") return;

  try {
    const response = await fetch("/page-config.json", { cache: "no-store" });
    if (!response.ok) return;
    const config = await response.json();
    const safeUrl = getSafeModeUrl(config);
    if (!safeUrl) return;
    const safeOrigin = new URL(safeUrl).origin;
    if (safeOrigin === window.location.origin) return;
    const target = `${safeOrigin}${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.replace(target);
  } catch {
    // Ignore failures and let the site load normally.
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", checkSafeMode);
} else {
  checkSafeMode();
}
