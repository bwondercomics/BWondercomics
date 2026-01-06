import { API_ENDPOINT } from "./config.js";

// Sanitize rich-text HTML from the blog editor before saving to DB.
function sanitizeHtml(input = "") {
  const parser = new DOMParser();
  const doc = parser.parseFromString(input, "text/html");
  const allowedTags = new Set([
    "b",
    "strong",
    "i",
    "em",
    "u",
    "a",
    "p",
    "br",
    "ul",
    "ol",
    "li",
    "span",
    "img",
    "h1",
    "h2",
    "h3",
    "h4",
    "blockquote",
  ]);

  const cleanUrl = (url = "") => {
    const trimmed = url.trim();
    if (!trimmed) return "";
    const lowered = trimmed.toLowerCase();
    if (lowered.startsWith("javascript:")) return "";
    return trimmed;
  };

  const sanitizeNode = (node) => {
    [...node.children].forEach((child) => {
      if (!allowedTags.has(child.tagName.toLowerCase())) {
        child.replaceWith(...child.childNodes);
      } else {
        // strip unwanted attributes
        [...child.attributes].forEach((attr) => {
          const name = attr.name.toLowerCase();
          const tag = child.tagName.toLowerCase();
          const allowedAttrs =
            tag === "a"
              ? ["href", "title", "target", "rel"]
              : tag === "img"
                ? ["src", "alt", "title"]
                : [];
          if (!allowedAttrs.includes(name)) {
            child.removeAttribute(attr.name);
          }
        });

        if (child.tagName.toLowerCase() === "a") {
          const href = cleanUrl(child.getAttribute("href") || "");
          if (!href) {
            child.removeAttribute("href");
          } else {
            child.setAttribute("href", href);
            child.setAttribute("target", "_blank");
            child.setAttribute("rel", "noopener noreferrer");
          }
        }
        if (child.tagName.toLowerCase() === "img") {
          const src = cleanUrl(child.getAttribute("src") || "");
          if (!src) {
            child.remove();
            return;
          }
          child.setAttribute("src", src);
          const alt = child.getAttribute("alt") || "";
          child.setAttribute("alt", alt);
        }
        sanitizeNode(child);
      }
    });
  };

  sanitizeNode(doc.body);
  return doc.body.innerHTML.trim();
}

function showError(message) {
  // Fallback to alert to keep UX functional even if a banner is missing
  alert(`ERROR: ${message}`);
}

function showSuccess(message) {
  alert(`SUCCESS: ${message}`);
}

// Persist admin data via /api/save (DB-backed on the server).
async function saveToServer(filename, content) {
  const response = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, content }),
  });

  if (!response.ok) {
    let message = `Failed to save ${filename}`;
    try {
      const data = await response.json().catch(() => null);
      const errorText = data && typeof data === "object" ? data.error : null;
      if (errorText) {
        message += `: ${errorText}`;
        if (response.status === 403 && /admin/i.test(String(errorText))) {
          message += " (Sign in to comments as an admin, then retry.)";
        }
      }
    } catch (err) {
      console.error("Error reading save response", err);
    }
    throw new Error(message);
  }

  return true;
}

export { sanitizeHtml, showError, showSuccess, saveToServer };
