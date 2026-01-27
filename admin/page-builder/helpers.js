export function normalizeFit(value) {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "contain" ? "contain" : "cover";
}

export function parseFocus(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw || raw === "center") return { x: 50, y: 50 };
  if (raw.includes("%")) {
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const x = parseFloat(parts[0]);
      const y = parseFloat(parts[1]);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
      }
    }
  }
  const map = {
    top: [50, 0],
    bottom: [50, 100],
    left: [0, 50],
    right: [100, 50],
    "top left": [0, 0],
    "left top": [0, 0],
    "top right": [100, 0],
    "right top": [100, 0],
    "bottom left": [0, 100],
    "left bottom": [0, 100],
    "bottom right": [100, 100],
    "right bottom": [100, 100],
  };
  if (map[raw]) {
    const [x, y] = map[raw];
    return { x, y };
  }
  return { x: 50, y: 50 };
}

export function formatFocus({ x, y }) {
  const safeX = Math.max(0, Math.min(100, Math.round(Number(x) || 50)));
  const safeY = Math.max(0, Math.min(100, Math.round(Number(y) || 50)));
  return `${safeX}% ${safeY}%`;
}

export function resolveAssetUrl(path = "") {
  if (!path) return "";
  const raw = String(path || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/")) return raw;
  const cleaned = raw.replace(/^assets\//, "");
  return `/assets/${cleaned}`;
}

export function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function escapeAttr(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
