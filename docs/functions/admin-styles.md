# Admin Styles Framework

This document provides a highly detailed map of the foundational CSS architecture under `admin/css/` (excluding the dedicated `page-builder/` sub-system). This framework establishes the "Cyberpunk/V3" aesthetic, drives the responsive architectural grid, and orchestrates complex UI components embedded within the Single Page Application (SPA).

## Table of Contents

- [📦 Source Import Manifest](#-source-import-manifest)
- [🎨 Core Aesthetics & Properties](#-core-aesthetics--properties)
- [🏗️ Layout & Responsiveness](#️-layout--responsiveness)
- [🪟 Modals & Global Overlays](#-modals--global-overlays)
- [📊 Feature Workspaces](#-feature-workspaces)
- [🖼️ Dedicated Components](#️-dedicated-components)
- [🔗 Page Builder Bridges](#-page-builder-bridges)
- [🧭 Maintenance Rule](#-maintenance-rule)

---

## 📦 Source Import Manifest

`admin/admin.css` is the source-of-truth manifest for this stylesheet group. Current imports:

`admin.core.css`, `admin.layout.css`, `admin.dashboard-cards.css`, `admin.social.css`,
`admin.moderation.css`, `admin.entries.css`, `admin.media.css`, `admin.editor-modal.css`,
`admin.image-picker.css`, `admin.preview.css`, `admin.designer.css`, `admin.image-upload.css`,
`admin.unsaved.css`, `admin.confirmation.css`, `admin.responsive.css`,
`admin.page-builder.css`, and `admin.promo-editor.css`.

`admin.page-builder.css` is documented here only as the bridge import; the dedicated files it imports
from `admin/css/page-builder/` are covered in `admin-page-builder-styles.md`.

## 🎨 Core Aesthetics & Properties

### ⚙️ Core Token Registry (`admin.core.css`)

This is the root stylesheet of the entire admin interface. It establishes global resets and defines the overarching visual language via CSS variables on the `:root` pseudo-class.

**Color Palette:**

- `--primary`: `#00d9ff` (Cyan) - Used for primary actions, active input borders, and primary typography.
- `--secondary`: `#ff00ea` (Magenta) - Used for secondary actions, accents, and drop-shadows on interactive elements.
- `--accent`: `#ffed00` (Yellow) - Used for high-visibility warnings, "Draft" indicators, and the image-picker focal targeting UI.
- `--danger`: `#ff3838` (Red) - Used for catastrophic action feedback and deletion buttons.
- `--success`: `#00ff88` (Green) - Used for successful server-write confirmations.
- `--bg-dark`: `#0a0a12` (Deep Navy) - The baseline HTML body background.
- `--bg-panel`: `#1a1a2e` (Muted Navy) - The background overlay used for raised elements like Modals and Workspaces.

**Global Animations:**

- `@keyframes glitchText`: A chromatic aberration text-shadow cycle oscillating between Cyan and Magenta. Applied to main titles like `.admin-title`.
- `@keyframes neonPulse`: An alternating box-shadow glow applied to active form fields (`.form-input:focus`).
- `@keyframes scanline`: A vertical translation animation tied to the `body::before` pseudo-element to simulate a slow CRT scanline. This can be disabled globally by adding the `.admin-scanlines-off` class to the body.
- `@keyframes shimmy`: An up-and-down shaking motion applied to the `.just-moved` class to visually confirm a successful entry/page reorder against the database.

**Typography & Base Elements:**

- Primary typeface is `Righteous` for data readability.
- Secondary typeface is `Bebas Neue` for high-impact structural headers.
- Standardizes `.btn-primary`, `.btn-secondary`, and `.btn-danger` buttons with universal inset paddings, transitions, and hover-lift transformations.

### 🔴 Unsaved State (`admin.unsaved.css`)

Styles the ephemeral safety-net UI. It governs the floating banner that appears pinned to the bottom of the viewport when `state.hasUnsavedChanges` is true, ensuring users do not accidentally navigate away and lose unsaved drafts. It also manages the `.dirty-dot` style used inside navigation rails to denote unsaved forms.

---

## 🏗️ Layout & Responsiveness

### 📐 Master Shell (`admin.layout.css`)

The architectural foundation of the SPA router. This file drives the layout engine via CSS Grid (`display: grid`) applied to the `.admin-shell` wrapper.

**Dynamic Orientations:**
The shell reorganizes itself heavily based on classes applied by `nav.js`:

- `.admin-layout--left`: Renders a standard left-side vertical nav rail (240px width).
- `.admin-layout--right`: Flips the grid-template columns to place the nav rail strictly on the right side.
- `.admin-layout--top`: Converts the vertical rail into a horizontal segmented navbar stacked below the header.

**Header Physics:**
The header supports dual physical states controlled via `.header-sticky` and `.header-hidden`:

- **Default Stack**: The header pushes the content down linearly.
- **Sticky Mode**: Drops the header to `position: fixed; top: 0` with an elevated z-index, while the `nav` rail and `content` blocks inherit a top-offset identical to the header's height.
- **Hidden Mini-Mode**: Reduces the header's padding, hides secondary labels, shrinks the height variable `var(--admin-header-mini-height)` down to 52px, and acts as an "unobtrusive" breadcrumb tracker.

**Floating Control Panels:**
Manages the absolute positioning logic for `.admin-settings-panel` and `.admin-innernet-panel`, automatically recalculating their `top/bottom/left/right` constraints based on which `.admin-layout--[mode]` is currently active.

### 📱 Responsive Constraints (`admin.responsive.css`)

Contains the media queries that manage graceful degradation.

- **Sub-1024px**: Eliminates `.admin-layout--right` behavior, forcing navigation into standard stacks, and begins collapsing `.dashboard-grid` 2-column tracks into `1fr` linear stacks.
- **Mobile Viewports**: Hides `.header-series` elements in the UI and squashes buttons into full-width tap targets.

---

## 🪟 Modals & Global Overlays

### 🔲 Confirmation Modal (`admin.confirmation.css`)

Manages the high-stakes `.confirm-modal`.

- **Backdrop**: Uses `rgba(10, 10, 18, 0.98)` to completely obscure the underlying SPA, violently refocusing user attention.
- **Box Model**: Uses a centralized `flex` container with a maximum width clamping to guarantee readability on ultra-wide monitors.

### 📝 Editor Modal (`admin.editor-modal.css`)

Provides the CSS for floating form configuration overlays that don't warrant a full-page reroute (e.g., Updating User details, creating Series objects). Integrates heavily with the `.form-row` input groupings and standardized action footers.

---

## 📊 Feature Workspaces

### 🗂️ Dashboard Layout (`admin.dashboard-cards.css`)

Uses dense `CSS Grid` structures to orchestrate the "Mission Control" page.

- **Metric Grids**: `.dashboard-metrics` and `.dashboard-metric-card` create auto-fitting 170px tiles for 24h reads, entry totals, and signups.
- **Activity Feeds**: `.dashboard-item` tracks. Uses conditional border-coloring modifiers (`--warn`, `--success`, `--danger`) to immediately contextualize log entries.
- **Trend Visualizations**: `.weekly-digest-grid` and `.change-indicator`. Organizes side-by-side metric comparisons and formats the positive/negative/neutral growth badges with ultra-low alpha backgrounds.

### 📚 Entries Workspace (`admin.entries.css`)

Specialized layout for the Entry Manager.

- **The Tactile Rail**: Defines `.page-reorder-shell` and `.page-list`. Supports heavy interactivity by styling `cursor: grab` and `.page-item.dragging` states.
- **Sub-pixel Insertion**: Implements `.insert-caret`, an absolute positioned zero-width border triangle that provides high-fidelity visual indication of drop-zones, augmented with a neon pulse `box-shadow`.
- **Live Previews**: Controls the `.page-preview` image pane that dynamically renders the active thumbnail of whatever item is currently targeted by mouse hover during reordering operations.

### 🖼️ Media Library (`admin.media.css`)

Orchestrates the dense image grid and branding-assignment interfaces.

- **Grid View**: `.media-gallery-grid` dynamically maps out 170px thumbnail columns (`auto-fill`).
- **Active Selection**: Enforces a `border-color: var(--accent)` ring along with a strong yellow drop-shadow for the currently clicked `.media-card`.
- **Preview Inspector**: Drives the fixed `.media-preview` overlay, segmenting it into an 80vh constrained image block (`1.7fr`) and an accompanying metadata info-bar (`1fr`) containing URLs and tag editors.

### 🛡️ Moderation Tables (`admin.moderation.css`)

Optimized for high-throughput scanning. Formats the data grids for blocked IPs and user bans, ensuring `.moderation-search` filters sit perfectly flush with the data lists.

### 🦋 Social Dash (`admin.social.css`)

Defines the Bluesky feed integration aesthetics. Rounds profile pictures, formats the nested Thread layout structures, and styles the modal used for inputting user handles and App Passwords securely.

### 👁️ Reader Preview (`admin.preview.css`)

Embeddable iframe styling. It formats the `.preview-frame` containing the standalone JSON database auditor pane, ensuring scrollbars are constrained inside the builder window without bleeding over the admin navigation rail.

### 🖌️ Designer Bridge (`admin.designer.css`)

A minimal stub stylesheet used specifically for formatting the "Deprecated Redirect" visual warning when users hit old Page Designer routes instead of the native Builder.

---

## 🖼️ Dedicated Components

### 🎯 Image Picker (`admin.image-picker.css`)

One of the most complex DOM assemblies in the suite. Defines the `.ip-modal` used across every subsystem for selecting assets.

- **Layout Split**: Distributes layout into `.ip-list-pane` (Library Grid) and `.ip-editor-pane` (Selected Config properties).
- **The Focal Engine**: Drives the focal-point visualizer.
  - `.ip-focus-dot`: Target crosshair absolutely positioned over the active image.
  - `.ip-crop-box`: Selectable frame wrapper utilizing a massive `box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.35)` to physically "black out" the non-selected outer regions of the image.
  - `.ip-crop-handle`: Implements multi-directional `nesw-resize` and `nwse-resize` cursors for manual boundary dragging.

### ☁️ Upload Zone (`admin.image-upload.css`)

Styles the drag-and-drop ingestion areas.

- **Drop Tunnels**: Applies tight dashed borders and manages `.is-dragover` pseudo-classes to pulse the background when files hover over the browser window, visually directing the user toward the upload target.
- **Progress Tracking**: Supplies the CSS needed for indeterminate loader bars during high-latency base64 API uploads.

---

## 🔗 Page Builder Bridges

These files act as specific injection vectors allowing features built primarily for the global Admin SPA to function properly or inherit styles when summoned from within the isolated V3 Builder Canvas mode.

### 🛠️ Page Builder Link (`admin.page-builder.css`)

Small overrides ensuring modal configurations (like inserting a new Builder Page) correctly override specific sizing restraints when launched over the massive builder backdrop interface.

### 🎠 Promo Editor Config (`admin.promo-editor.css`)

Specifically houses the legacy styles used to represent Carousel Slide rows inside the standard Editor shell, retaining CSS layout rules for Promo Module data management decoupled from the V3 inline canvas builder logic.

## 🧭 Maintenance Rule

Update this document when `admin/admin.css` imports change, a non-page-builder stylesheet under
`admin/css/` is added or removed, a stylesheet takes ownership of a new admin workspace/component,
or shared visual tokens/layout conventions move between files.
