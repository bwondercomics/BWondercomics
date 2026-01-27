export const MODULE_TYPES = [
  { type: "header", label: "Header", icon: "\u{1F4F0}", category: "content" },
  { type: "text", label: "Text", icon: "\u{1F4DD}", category: "content" },
  { type: "image", label: "Image", icon: "\u{1F5BC}", category: "media" },
  { type: "gallery", label: "Gallery", icon: "\u{1F3B4}", category: "media" },
  { type: "video", label: "Video", icon: "\u{1F3AC}", category: "media" },
  { type: "social", label: "Social", icon: "\u{1F517}", category: "engagement" },
  { type: "email-signup", label: "Email", icon: "\u{1F4E7}", category: "engagement" },
  { type: "promo", label: "Promo", icon: "\u{1F3AF}", category: "engagement" },
  { type: "buttons", label: "Buttons", icon: "\u{1F518}", category: "navigation" },
  { type: "spacer", label: "Spacer", icon: "\u2195", category: "layout" },
  { type: "divider", label: "Divider", icon: "\u2796", category: "layout" },
  { type: "reader", label: "Reader", icon: "\u{1F4D6}", category: "special" },
  { type: "entry-gallery", label: "Entries", icon: "\u{1F4DA}", category: "special" },
  { type: "feed", label: "Feed", icon: "\u{1F4F0}", category: "special" },
  { type: "html", label: "HTML", icon: "\u{1F4BB}", category: "advanced" },
];

export const LAYOUT_OPTIONS = [
  { value: "1", label: "1 col" },
  { value: "1-1", label: "1:1" },
  { value: "1-2", label: "1:2" },
  { value: "2-1", label: "2:1" },
  { value: "1-1-1", label: "1:1:1" },
  { value: "1-3-1", label: "1:3:1" },
];

export const THEME_COLORS = [
  { key: "primary", label: "Primary", default: "#00d9ff" },
  { key: "secondary", label: "Secondary", default: "#ff00ea" },
  { key: "accent", label: "Accent", default: "#ffed00" },
  { key: "bgDark", label: "Background Dark", default: "#0a0a12" },
  { key: "bgPanel", label: "Background Panel", default: "#1a1a2e" },
  { key: "text", label: "Text", default: "#ffffff" },
  { key: "danger", label: "Danger", default: "#ff3838" },
];

export const THEME_PRESETS = {
  cyberpunk: {
    name: "Cyberpunk",
    theme: {
      primary: "#00d9ff",
      secondary: "#ff00ea",
      accent: "#ffed00",
      bgDark: "#0a0a12",
      bgPanel: "#1a1a2e",
      text: "#ffffff",
      danger: "#ff3838",
    },
  },
  retro: {
    name: "Retro",
    theme: {
      primary: "#ff6b35",
      secondary: "#f7c59f",
      accent: "#efefd0",
      bgDark: "#004e64",
      bgPanel: "#00a5cf",
      text: "#ffffff",
      danger: "#ff3838",
    },
  },
  minimal: {
    name: "Minimal",
    theme: {
      primary: "#2d3436",
      secondary: "#636e72",
      accent: "#0984e3",
      bgDark: "#ffffff",
      bgPanel: "#f5f5f5",
      text: "#2d3436",
      danger: "#d63031",
    },
  },
  neon: {
    name: "Neon",
    theme: {
      primary: "#39ff14",
      secondary: "#ff00ff",
      accent: "#00ffff",
      bgDark: "#0d0d0d",
      bgPanel: "#1a1a1a",
      text: "#ffffff",
      danger: "#ff0000",
    },
  },
};
