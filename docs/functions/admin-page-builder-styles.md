# Page Builder Visual Framework

This document provides a technical map of the modular CSS architecture within `admin/css/page-builder/`. It defines the layout systems, componentry, and interaction feedback that drive the V3 Modular Builder authoring experience.

## Table of Contents
- [🎨 Design System & Tokens](#-design-system--tokens)
- [🏗️ Layout Orchestration (layout.css)](#️-layout-orchestration-layoutcss)
- [📂 Sidebar (sidebar.css)](#-sidebar-sidebarcss)
- [🖌️ Canvas (canvas.css)](#-canvas-canvascss)
- [🔍 Inspector (inspector.css)](#-inspector-inspectorcss)
- [🎮 Controls (controls.css)](#-controls-controlscss)
- [⚡ Insertions & Feedback (insertions.css)](#-insertions--feedback-insertionscss)
- [🌈 Theme & Responsive](#-theme--responsive)

---

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
  - **Default State**: 3 columns: `var(--pb-sidebar-width)` (200px), `1fr`, and `var(--pb-editor-width)` (320px).
  - **Attributes**:
    - `[data-editor-mode='docked']`: Expands the editor to 520px for complex module editing.
    - `[data-editor-mode='overlay']`: Remaps the editor to `position: absolute`, floating over the canvas for tablet viewports.
    - `[data-viewport-band='stacked']`: Triggers a vertical 1-column stack for mobile authoring.
    - `[data-canvas-mode='preview']`: Hides all side panels to provide a 100% width canvas preview.

### Visual Architecture
- **Glassmorphism**: Panels use a combination of linear gradients (`rgba(255, 255, 255, 0.04)`) and backdrop filters to create a layered, modern aesthetic.
- **Rail Toggles**: `pb-editor-rail-toggle` and `pb-sidebar-rail-toggle` are absolute-positioned triggers that float between panels, allowing users to collapse workspaces with sub-pixel precision.

---

## 📂 Sidebar (sidebar.css)

Manages the persistent left-side panel for page navigation and the module library.

### Principal Components
- **Collapsed Mode**: When the shell has `[data-sidebar-mode='collapsed']`, the main body hides and `.pb-sidebar-collapsed-copy` displays its rotated `writing-mode: vertical-rl` text.
- **Tabs**: `.pb-sidebar-tabs` and `.pb-sidebar-tab` toggle between Pages and Modules, utilizing gradient lighting and a box shadow for the active state.
- **Page List**: Features `.pb-page-item` blocks containing structural badges (`.pb-page-status`) reflecting `published`, `draft`, or `homepage` routing states.
- **Palette**: The `.pb-module-palette` grid formats `.pb-module-type` draggable buttons that react to `:hover` and `:active` cursor changes (`grab` and `grabbing`).

---

## 🖌️ Canvas (canvas.css)

The staging environment where the actual page layout is constructed and previewed.

### Principal Components
- **Canvas Header**: `.pb-canvas-header` houses the page title and status indicators (`.pb-page-title-note[data-status='warning']` etc). Also holds "Publish" and view toggles.
- **Page Meta Surface**: `.pb-page-header-surface` provides a clickable block representing the global page heading/metadata.
- **Section Grid Layout**: `.pb-section-columns` drives horizontal layout via `data-layout` attributes (e.g. `1-1`, `1-2`, `1-3-1`) determining how CSS Grid distributes `.pb-column` children.
- **Target Selections**: `.pb-section` and `.pb-module` use `.selected` classes to render cyan highlight borders when targeted by the right-hand Inspector.
- **Preview Scaling**: Provides width restraints (`.pb-preview-frame[data-width='...']`) limiting layout bounds to `desktop`, `tablet`, or `mobile` constraints.

---

## 🔍 Inspector (inspector.css)

The right-side properties panel responding dynamically to the active section/module selection.

### Principal Components
- **Sticky Regions**: Implements `position: sticky` on `.pb-editor-header` and `.pb-editor-footer` combined with intense background blur `backdrop-filter: blur(18px)` to ensure controls are always available while scrolling property fields.
- **Footer Status**: Updates `.pb-editor-footer-status` with dataset states (`success`, `warning`, `danger`) to report API save failures or drafted states.
- **Empty & Feedback States**: Uses customized `.pb-editor-empty-card` for messaging when no modules are selected.
- **Structurals**: Features accordion blocks (`.pb-editor-accordion`), draggable sort-blocks (`.pb-header-block`), and internal layout switchers (`.pb-header-layout-card`).

---

## 🎮 Controls (controls.css)

The atomic input form fields embedded across the inspector panels.

### Principal Components
- **Form Base**: `.pb-editor-input`, `.pb-editor-textarea`, and `.pb-editor-select`. On `:focus`, injects the `var(--primary)` outline border and box shadow.
- **Modifiers**: Distinct inputs like `.pb-editor-textarea--code` which switch layout context to a monospaced font over a 220px block.
- **Layout Flow**: Combines labels and inputs in horizontal `.pb-editor-field--row` groups with `.pb-editor-hint` text descriptions below complex elements.
- **Promo Pickers**: Dedicated slider (`.pb-promo-style-range`) and color picker bounds (`.pb-promo-style-color`) adjusting visual presentation constraints.

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
