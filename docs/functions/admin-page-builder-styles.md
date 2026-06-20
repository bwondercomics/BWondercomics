# Page Builder Visual Framework

This document provides a technical map of the modular CSS architecture within `admin/css/page-builder/`. It defines the layout systems, componentry, and interaction feedback that drive the V3 Modular Builder authoring experience.

## Table of Contents

- [📦 Source Import Manifest](#-source-import-manifest)
- [🎨 Design System & Tokens](#-design-system--tokens)
- [🏗️ Layout Orchestration (layout.css)](#️-layout-orchestration-layoutcss)
- [📂 Sidebar (sidebar.css)](#-sidebar-sidebarcss)
- [🖌️ Canvas (canvas.css)](#-canvas-canvascss)
- [🔍 Inspector (inspector.css)](#-inspector-inspectorcss)
- [🎮 Controls (controls.css)](#-controls-controlscss)
- [⚡ Insertions & Feedback (insertions.css)](#-insertions--feedback-insertionscss)
- [🌈 Theme & Responsive](#-theme--responsive)
- [🧭 Maintenance Rule](#-maintenance-rule)

---

## 📦 Source Import Manifest

`admin/css/admin.page-builder.css` is the source-of-truth bridge manifest for these files. Current
imports:

`page-builder/layout.css`, `page-builder/sidebar.css`, `page-builder/canvas.css`,
`page-builder/insertions.css`, `page-builder/inspector.css`, `page-builder/controls.css`,
`page-builder/theme.css`, and `page-builder/responsive.css`.

## 🎨 Design System & Tokens

The Page Builder inherits the global "Cyberpunk/V3" tokens defined in `admin.core.css` but specializes them for high-fidelity interactive use.

### Color Palette

- **Primary**: `#00d9ff` (Cyan) - Used for selection rings, active tabs, and primary action buttons.
- **Secondary**: `#ff00ea` (Magenta) - Used for destructive actions and secondary accents.
- **Accent**: `#ffed00` (Yellow) - Used for "Unsaved Changes" and "Draft" status badges.
- **Background**: `rgba(10, 10, 18, 0.98)` (Navy) - The primary panel surface, often enhanced with `backdrop-filter: blur(18px)`.

### Typography

- **Technical Copy**: Inter / Righteous (Dual weighting).
- **Control Labels**: 0.75rem - 0.85rem, often with `text-transform: uppercase` and `letter-spacing: 0.12em` for high-density legibility.

---

## 🏗️ Layout Orchestration (layout.css)

The `layout.css` module defines the top-level shell. It uses a **Data-Attribute Driven Grid** to manage the lifecycle of the three primary panels.

### Principal Containers

- **`.page-builder-layout`**: The master grid.
  - **Default State**: 2 columns: `var(--pb-sidebar-width)` (280px) and `minmax(0, 1fr)`, with `--pb-editor-width` controlled by the full-page shell and side-panel/editor state.
  - **Attributes**:
    - `[data-editor-mode='docked']`: Expands the editor to 520px for complex module editing.
    - `[data-editor-mode='overlay']`: Remaps the editor to `position: absolute`, floating over the canvas for tablet viewports.
    - `[data-viewport-band='stacked']`: Triggers a vertical 1-column stack for mobile authoring.
    - `[data-sidebar-mode='collapsed']`: Shrinks the side panel to the compact 72px rail.
    - `[data-canvas-mode='structure']`: Hides the iframe preview host while Structure Debug is visible.
    - `[data-canvas-mode='preview']`: Hides all side panels so the iframe preview host has the
      full available admin canvas width.

### Visual Architecture

- **Glassmorphism**: Panels use a combination of linear gradients (`rgba(255, 255, 255, 0.04)`) and backdrop filters to create a layered, modern aesthetic.
- **Rail Toggles**: `pb-editor-rail-toggle` and `pb-sidebar-rail-toggle` are absolute-positioned triggers that float between panels, allowing users to collapse workspaces with sub-pixel precision.

---

## 📂 Sidebar (sidebar.css)

Manages the persistent left-side panel for page navigation and the block/module library.

### Principal Components

- **Collapsed Mode**: When the shell has `[data-sidebar-mode='collapsed']`, the main body hides and `.pb-sidebar-collapsed-copy` displays its rotated `writing-mode: vertical-rl` text.
- **Tabs**: `.pb-sidebar-tabs` and `.pb-sidebar-tab` toggle between Pages, Blocks, Layers, Settings, and Styles, utilizing gradient lighting and a box shadow for the active state.
- **Page List**: Features `.pb-page-item` blocks containing structural badges (`.pb-page-status`) reflecting `published`, `draft`, or `homepage` routing states.
- **Blocks**: The `.pb-module-palette` container groups descriptor-backed `.pb-module-type` draggable buttons by category; block buttons react to `:hover` and `:active` cursor changes (`grab` and `grabbing`).

---

## 🖌️ Canvas (canvas.css)

The staging environment where the page layout is edited and where the iframe preview host is
rendered.

### Principal Components

- **Canvas Header**: `.pb-canvas-header` houses the page title and status indicators (`.pb-page-title-note[data-status='warning']` etc). Also holds "Publish" and view toggles.
- **Page Meta Surface**: `.pb-page-header-surface` provides a clickable block representing the global page heading/metadata.
  - Features structural badges (`.pb-page-header-badge--import` / `--stale`)
  - The `nav` region displays representing chips: standard `.pb-page-header-chip` (`pb-page-header-chip--primary`) or outline-only `.pb-page-header-chip--secondary` for secondary buttons.
  - Empty regions display a `.pb-page-header-empty-region` indicator.
- **Section Grid Layout**: `.pb-section-columns` renders 1-6 stable global `.pb-column` nodes. The
  generalized ratio layout (for example `1`, `1-1`, `1-2-1`, or `2-1-1-2`) becomes the CSS Grid
  template; responsive device layouts reflow visible tracks without changing module ownership.
- **Column Styling**: sparse column appearance, padding, alignment, minimum height, and visibility
  are emitted on the stable column elements. Hidden responsive columns remain structural DOM nodes
  with `display: none` and do not reserve grid tracks.
- **Target Selections**: `.pb-section` and `.pb-module` use `.selected` classes to render cyan highlight borders when targeted by the right-hand Inspector.
- **Preview Host**: `.pb-preview-frame` and `.pb-preview-iframe` receive exact dimensions from the
  shared `PREVIEW_VIEWPORTS` contract (`desktop`, `tablet`, or `mobile`), while
  `.pb-preview-scale-shell` owns the admin-visible scaled footprint when a preset is larger than the
  available editor viewport.

---

## 🔍 Inspector (inspector.css)

The right-side properties panel responding dynamically to the active section/module selection.

### Principal Components

- **Sticky Regions**: Implements `position: sticky` on `.pb-editor-header` and `.pb-editor-footer` combined with intense background blur `backdrop-filter: blur(18px)` to ensure controls are always available while scrolling property fields.
- **Footer Status**: Updates `.pb-editor-footer-status` with dataset states (`success`, `warning`, `danger`) to report API save failures or drafted states.
- **Empty & Feedback States**: Uses customized `.pb-editor-empty-card` for messaging when no modules are selected.
- **Structurals**: Features accordion blocks (`.pb-editor-accordion`), draggable sort-blocks (`.pb-header-block`), and the header **placement board** (`.pb-header-layout-grid` → `.pb-header-layout-row` → `.pb-header-region--board` → two-line `.pb-header-layout-card`), whose region grid is single-column at rail width and splits into columns via a container query when space allows.

---

## 🎮 Controls (controls.css)

The atomic input form fields embedded across the inspector panels.

### Principal Components

- **Form Base**: `.pb-editor-input`, `.pb-editor-textarea`, and `.pb-editor-select`. On `:focus`, injects the `var(--primary)` outline border and box shadow.
- **Modifiers**: Distinct inputs like `.pb-editor-textarea--code` which switch layout context to a monospaced font over a 220px block.
- **Layout Flow**: Combines labels and inputs in horizontal `.pb-editor-field--row` groups with `.pb-editor-hint` text descriptions below complex elements.
- **Promo Pickers**: Dedicated slider (`.pb-promo-style-range`) and color picker bounds (`.pb-promo-style-color`) adjusting visual presentation constraints.
- **Buttons Appearance Controls**: `controls.css` now includes a small button-appearance layer for the buttons module editor:
  - `.pb-button-appearance-card` for nested default/override cards inside the inspector
  - `.pb-button-appearance-row` and `.pb-button-appearance-toggle` for checkbox-gated sparse appearance leaves
  - `.pb-button-appearance-input:disabled` to dim inherited fields instead of inventing fake null values for color/range controls
  - `.pb-editor-section-head--compact` to keep nested appearance card headings visually consistent without duplicating full section spacing
- **Section/Column Controls**: section inspector controls use the shared form and appearance-card
  patterns for global/device column count, ratios, per-column appearance, padding, alignment,
  min-height, and inherit/visible/hidden state.
- **Inspector density layer**: a `.page-builder`-scoped token set — `--pb-inspector-font` (~0.78rem),
  `--pb-control-pad-y`/`--pb-control-pad-x`, `--pb-row-gap`, and `--pb-icon-btn-size` (28px) — drives
  the compact, icon-first inspector. Reusable components built on it:
  - `.pb-icon-btn` — 28px square transparent icon button (hover, `:focus-visible` ring via
    `var(--primary)`, and disabled states) that replaces CTA-weight `.btn-secondary` inside inspector menus
  - `.pb-field-row` — label-left (`flex: 0 0 38%`) / control-right row with a truncating label, for
    compact single-line fields
  - `.pb-truncate` and `.pb-sr-only` — shared ellipsis-truncation and visually-hidden utilities
  - `.pb-seg`/`.pb-seg-item` — a segmented radio control ported from GrapesJS `.gjs-radio-item`;
    shipped as a component, but existing `<select>` conversions remain deferred

---

## ⚡ Insertions & Feedback (insertions.css)

Classes related to drag-and-drop structural manipulation and interactive context menus.

### Principal Components

- **Drop Zones**: `.pb-drop-zone` and `.pb-section-insert`. When a drag crosses paths (`.drag-over`), colors flash from dashed white/gray borders to solid `var(--primary)` with cyan backgrounds.
- **Inline Menus**: `.pb-inline-picker` generates an absolute floating context menu offering up structural insert options via a grid of `.pb-inline-picker-item` choices.

---

## 🌈 Theme & Responsive (theme.css & responsive.css)

### Theme Customizer

- **Theme Options**: Maps styles for global theme adjustments (colors, layout presets), organizing color pickers in `.pb-theme-color-row` layouts with accompanying `.pb-theme-preset-btn` macro choices.

### Responsive Degrade

- **Sub-1199px**: Flattens out `2-column` and `3-column` controls in the Inspector into a unified `1fr` grid stack.
- **Sub-1099px**: Relaxes max-height limits on the `.page-builder-sidebar` when stacked in tablet mode.
- **Sub-720px**: Mobile squashing constraint. Stretches footer action buttons `.btn-primary` and `.btn-secondary` out to `100%` widths, and breaks horizontal layout flows in the inspector down into vertical stacks.

## 🧭 Maintenance Rule

Update this document when `admin/css/admin.page-builder.css` imports change, a file under
`admin/css/page-builder/` is added or removed, page-builder shell data attributes change, preview
frame/scale behavior changes, or inspector/sidebar/canvas component ownership moves between CSS
files.
