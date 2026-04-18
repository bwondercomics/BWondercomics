DO NOT USE AS REFERENCE, THE LOGIC IS FLAWED.
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
