# Builder Inspector Menu UI Plan (GrapesJS-Aligned Density)

Status: Proposed
Created: 2026-06-18

## Purpose

The page-builder inspector menus render inside a fixed **280px** sidebar rail, but several menus —
most visibly the header **Placement** editor — were laid out as if they had full-width space. The
result is bulky, cramped controls whose labels wrap or get clipped because they do not fit. This plan
diagnoses the root causes, captures the relevant UI patterns from the bundled GrapesJS source under
`docs/website-references/grapesjs-dev`, and defines a concrete, phased fix that makes builder menus
dense, icon-first, and overflow-safe like GrapesJS's panels — without changing builder data contracts
or behavior.

This is a UI/CSS + small-markup plan. It does **not** change saved page/section/module records, the
header data model, the preview contract, or any backend validation.

## Current Source Of Truth

- `admin/index.html:972` mounts the inspector (`#pbModuleEditor`, `.pb-module-editor`) **inside the
  280px `.page-builder-sidebar`** (`--pb-sidebar-width: 280px`, `admin/css/page-builder/layout.css:119`).
  Every inspector menu — header, module, theme, section/column, page settings — renders into this rail.
- `admin/page-builder/header-editor.js:263` `renderPlacementEditor()` builds the header layout board.
- `admin/page-builder/header-editor.js:233` `renderPartsEditor()` builds the header parts toggle list.
- `admin/page-builder/inspector-sections.js` `renderInspectorSection()` is the shared collapsible
  `<details>`/`<summary>` section wrapper used by all inspector menus.
- `admin/css/page-builder/inspector.css:355-557` styles the placement board
  (`.pb-header-layout-*`, `.pb-header-region*`) and toggle rows (`.pb-header-toggle-*`).
- `admin/css/page-builder/controls.css` styles shared inspector form controls
  (`.pb-editor-field`, `.pb-editor-label`, `.pb-editor-select`, appearance rows).
- `admin/css/admin.layout.css:319` defines the global `.btn-secondary` reused for the placement
  "Move" buttons.

## Problem Statement (Observed)

Inside the 280px rail (≈248px of usable content width after section padding), the header Placement
editor and a few sibling menus show:

- Buttons whose text is clipped ("Move Left/Right/Up/Down").
- Cards and pills that wrap onto multiple lines or overflow their column.
- A generally heavy, oversized feel compared to the dense canvas beside them.

## Root Cause Analysis

### 1. The Placement board forces a 3-column grid into a 280px rail

`renderPlacementEditor()` renders three rows (Top/Main/Bottom), and each row's regions are laid out as:

```css
/* admin/css/page-builder/inspector.css:377 */
.pb-header-layout-row-cells {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr)); /* Left | Center | Right */
  gap: 12px;
}
```

Three equal columns + two 12px gaps + section padding leaves **≈70–75px per region cell**. Every card
and button below lives inside that ~70px column, so nothing fits.

### 2. Each card stuffs four heavyweight text buttons into that ~70px column

`header-editor.js:285-290` emits four buttons per card (Move Left/Right/Up/Down) in a 2-column grid:

```css
/* inspector.css:500 */
.pb-header-layout-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
```

Each button is the **global `.btn-secondary`**, which is a display/CTA button, not a dense control:

```css
/* admin/css/admin.layout.css:319 */
.btn-secondary {
  padding: 8px 16px; /* 32px of horizontal padding alone */
  font-family: 'Righteous', cursive; /* display font */
  font-size: 0.9rem;
  text-transform: uppercase; /* "MOVE LEFT" */
  border: 2px solid var(--secondary);
}
```

At ~35px per button (half of a ~70px column), uppercase "MOVE LEFT" in a display font cannot render —
it clips. This is the primary cause of the reported symptom.

### 3. A redundant region chip competes for the same width

Each card head also renders a pill chip repeating the cell it already sits in
(`header-editor.js:283`, e.g. `TOP / LEFT`). It duplicates information the surrounding region cell
already conveys and consumes scarce horizontal space, forcing wraps.

### 4. No truncation discipline

Inspector labels/titles do not use `text-overflow: ellipsis`, so long block labels wrap instead of
truncating gracefully.

### 5. The same heavy idiom recurs in sibling menus

`renderPartsEditor()` toggle rows (`.pb-header-toggle-row`) and several appearance rows use full-text
labels and the same CTA-weight controls, so the density problem is not unique to Placement; it is a
system-wide inspector-density gap. The Placement board is just where it breaks most visibly.

## GrapesJS Research Findings

Source: `docs/website-references/grapesjs-dev/packages/core/src/styles/scss/`. GrapesJS runs its
managers in an equally narrow rail (`$leftWidth: 15%`, `_gjs_vars.scss:41`) and survives by being
relentlessly dense and icon-first. The relevant patterns:

### A. Dense design tokens

```scss
/* _gjs_vars.scss */
$fontSize: 0.75rem; // every panel control is ~12px
$inputPadding: 5px; // single-value padding for all inputs
```

### B. Trait rows: fixed-width label, flexible field, ellipsis (`_gjs_traits.scss`)

```scss
.gjs-label-wrp {
  width: 30%;
  min-width: 30%;
} // label column
.gjs-field-wrp {
  flex-grow: 1;
} // control fills the rest
.gjs-trt-trait {
  display: flex;
  padding: 5px 10px;
  gap: 5px;
  align-items: center;
}
.gjs-label {
  text-overflow: ellipsis;
  overflow: hidden;
} // truncate, never clip-wrap
```

### C. Layers: a single row with a drag handle + ellipsis name + tiny icons — no move buttons

GrapesJS reorders by **dragging a 13px handle**, not with text buttons (`_gjs_layers.scss`):

```scss
.gjs-layer-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 10px;
  gap: var(--gjs-flex-item-gap);
}
.gjs-layer-name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.gjs-layer-move {
  width: 13px;
  height: 13px;
  cursor: move;
} // tiny grab handle
.gjs-layer-caret {
  width: 15px;
  height: 15px;
} // collapse toggle
.gjs-layer-vis-on,
.gjs-layer-vis-off {
  width: 13px;
  height: 13px;
} // eye toggle
```

### D. Multiple choices = one segmented radio control, not N buttons (`_gjs_inputs.scss`)

```scss
.gjs-radio-items {
  display: flex;
}
.gjs-radio-item {
  flex: 1 1 auto;
  text-align: center;
  border-left: 1px solid var(--gjs-dark-text-shadow);
}
.gjs-radio-item:first-child {
  border: none;
}
.gjs-radio-item input:checked + .gjs-radio-item-label {
  background-color: rgba(255, 255, 255, 0.2);
}
```

A connected, equal-flex segmented control replaces a cluster of separate buttons and never overflows —
it just divides the available width.

### E. Property grid: 50% by default, full-width only when complex (`_gjs_style_manager.scss`)

```scss
.gjs-sm-property {
  float: left;
  width: 50%;
  padding: 0 5px;
}
.gjs-sm-property--full,
.gjs-sm-property.gjs-sm-composite,
...stack,
...slider,
...color {
  width: 100%;
}
```

Simple props pack two-up; anything that needs room is promoted to full width. Layout adapts to the
control, instead of forcing every control into a fixed multi-column grid.

### F. Collapsible sectors with a caret manage vertical space

(`_gjs_style_manager.scss` `.gjs-sm-sector`, `_gjs_category_general.scss` `.gjs-category-title`):
each group is a `cursor: pointer` header with a rotating caret; closed groups hide their body. (Our
inspector already approximates this with `<details>` in `renderInspectorSection()`.)

### G. Buttons are compact squares (`_gjs_panels.scss`)

```scss
.gjs-pn-btn {
  min-height: 30px;
  min-width: 30px;
  background-color: transparent;
  border: none;
}
```

### Pattern → fix mapping

| Symptom in our builder     | Cause                                  | GrapesJS pattern to adopt                               |
| -------------------------- | -------------------------------------- | ------------------------------------------------------- |
| "Move" text clipped        | 4 × `.btn-secondary` in a ~70px column | Tiny **icon buttons** + **drag handle** (C, G)          |
| Cards/pills wrap           | Forced 3-col grid in 280px             | **Responsive** region layout; promote to full width (E) |
| Long labels wrap/clip      | No truncation                          | `text-overflow: ellipsis` everywhere (B, C)             |
| Heavy, oversized feel      | CTA font/padding in a dense panel      | Density **tokens**: ~0.78rem font, ~6px padding (A)     |
| Multi-option rows too wide | One button per option                  | **Segmented radio control** (D)                         |

## Design Principles Adopted

1. **Design for 280px first.** No inspector menu may assume more than ~248px of content width. Verify
   at the rail width and at the ≤1099px mobile drawer width (`layout.css:222`).
2. **Icon-first, drag-first.** Reordering uses a drag handle (primary) + compact icon buttons
   (precise/a11y fallback). No multi-word text buttons inside dense menus.
3. **Truncate, never clip-wrap.** Labels/titles ellipsis-truncate and expose full text via `title`.
4. **Adapt layout to the control.** Stack to a single column when width is tight; reserve multi-column
   only for controls that genuinely fit.
5. **Tokenize density.** One set of inspector density variables drives font size, control padding,
   gaps, and icon-button size so all menus stay consistent.
6. **No data/behavior change.** Same header model, same drag-and-drop semantics, same keyboard moves,
   same save/discard flow. This is presentation only.

## Proposed UI Redesign

### Headline: the header Placement editor

Replace the cramped 3-column board of multi-button cards with a dense, GrapesJS-style layout:

- **Responsive region layout.** Keep the spatial Top/Main/Bottom rows, but make each row's
  Left/Center/Right regions **stack to a single column at rail width** (`grid-template-columns: 1fr`),
  switching to multi-column only when the container is wide enough (container query / width breakpoint).
  This alone gives each card full row width (~248px) instead of ~70px.
- **Minimal draggable cards.** Each block becomes a single-line row, modeled on a GrapesJS layer:

  ```
  [⠿ handle]  Block label (ellipsis)            [◀] [▶] [▲] [▼]
  ```

  - Drag handle stays as the primary reorder affordance (drag between regions/rows already works).
  - Drop the redundant `TOP / LEFT` pill; the region/row is already labeled by the enclosing cell.
    (Optionally keep a tiny muted location caption only in the single-column collapsed view.)
  - The "Visible / Hidden on this page" sub-label collapses into a muted state on the row (dimmed +
    a small eye-off icon), matching GrapesJS `.gjs-layer-hidden`.

- **Icon move cluster.** Replace the four `.btn-secondary` text buttons with four **compact icon
  buttons** (`.pb-icon-btn`, ~26px square, transparent, 1px border, arrow glyph, proper `disabled`
  state, `aria-label` per direction). Four × 26px ≈ 104px fits comfortably on one line beside an
  ellipsis-truncated label within 248px.

### Reusable inspector components (used by Placement and beyond)

1. **`.pb-icon-btn`** — compact square icon button (~26–28px), transparent background, subtle border,
   hover/active/disabled states. Replaces `.btn-secondary` inside inspector menus.
2. **`.pb-seg` / `.pb-seg-item`** — segmented radio control (port of `.gjs-radio-item`): equal-flex
   connected segments with shared borders and a checked state. Use for region/row choice, alignment,
   display-mode, and any small enumerated option currently rendered as separate buttons or an
   oversized `<select>`.
3. **`.pb-field-row`** — label-left (`min-width` ~38%) / control-right (`flex-grow: 1`) row with an
   ellipsis-truncating label, for compact single-line fields where today the label sits on its own line.
4. **Truncation utility** — shared `overflow:hidden; white-space:nowrap; text-overflow:ellipsis` on
   inspector card/row labels and `renderInspectorSection()` titles.

### Density tokens (scoped to `.page-builder`)

```css
.page-builder {
  --pb-inspector-font: 0.78rem; /* ~12.5px, GrapesJS uses 0.75rem */
  --pb-control-pad-y: 6px;
  --pb-control-pad-x: 8px;
  --pb-row-gap: 8px;
  --pb-icon-btn-size: 26px;
}
```

These replace the ad-hoc `0.9rem` / `8px 16px` values inside inspector menus. Global `.btn-secondary`
elsewhere in the admin app is untouched.

## Phased Implementation Plan

### Phase 0 — Foundations (no visible behavior change)

- Add density tokens to the `.page-builder` scope.
- Add `.pb-icon-btn`, `.pb-seg`/`.pb-seg-item`, `.pb-field-row`, and the truncation utility to
  `admin/css/page-builder/controls.css`.
- Add a small inline-SVG (or CSS-glyph) arrow set for the move icons.

### Phase 1 — Header Placement editor (the headline fix)

- Rework `renderPlacementEditor()` markup in `admin/page-builder/header-editor.js`:
  - minimal single-line cards (handle + ellipsis label + icon move cluster),
  - remove the redundant region chip,
  - icon buttons (`.pb-icon-btn`) with `aria-label`s and the existing `disabled` edge logic,
  - hidden-state styling instead of a verbose sub-label.
- Rework `.pb-header-layout-*` / `.pb-header-region*` in `admin/css/page-builder/inspector.css`:
  - responsive region grid (single column at rail width, multi-column when wide),
  - compact card chrome and gaps using the new tokens.
- Preserve drag-and-drop and keyboard handlers in `header-editor.js` (move-left/right/up/down logic at
  `header-editor.js:526-565` is reused as-is; only the trigger markup changes).

### Phase 2 — Density pass on sibling inspector menus

- `renderPartsEditor()` toggle rows → compact `.pb-field-row` with the toggle on the right.
- Appearance rows (`controls.css` `.pb-appearance-*`) and any option group currently using separate
  buttons or a wide select → adopt `.pb-seg` segmented control where the option set is small and fixed.
- Apply the truncation utility to section titles in `renderInspectorSection()`.

### Phase 3 — QA, accessibility, and docs

- Manual QA at 280px rail, collapsed rail (`72px`, `layout.css:205`), and ≤1099px mobile drawer.
- Accessibility: icon buttons have `aria-label`s; segmented control is keyboard-operable (radio
  semantics); focus-visible rings; contrast check.
- Update/extend visual specs under `tests/visual/` (`builder-authoring-workflows.spec.js`) to cover
  the header Placement menu; add a regression assertion that no inspector menu overflows its rail.
- Update `docs/functions/admin-page-builder.md` / `docs/functions/admin-page-builder-styles.md`,
  `docs/READER_BUILDER_QA.md`, and add this doc to the `docs/README.md` index.

## Files To Touch

- `admin/page-builder/header-editor.js` — `renderPlacementEditor()` (markup), `renderPartsEditor()`.
- `admin/css/page-builder/inspector.css` — `.pb-header-layout-*`, `.pb-header-region*`,
  `.pb-header-toggle-*`.
- `admin/css/page-builder/controls.css` — density tokens + `.pb-icon-btn` / `.pb-seg` / `.pb-field-row`
  / truncation utility.
- `admin/page-builder/inspector-sections.js` — apply truncation class to section titles (optional).
- `tests/visual/builder-authoring-workflows.spec.js` — coverage for the redesigned menus.
- `docs/README.md`, `docs/functions/admin-page-builder*.md`, `docs/READER_BUILDER_QA.md` — references.

## Acceptance Criteria

- At the 280px rail (and the collapsed rail and ≤1099px drawer), **no inspector menu clips text or
  overflows horizontally**; the header Placement controls are fully visible and operable.
- Blocks can be reordered by **both** drag-and-drop and the icon move buttons; icon buttons expose
  accessible labels and correct disabled edges.
- Inspector menus share one density scale (font, padding, gaps, icon size) and read as compact and
  icon-first, consistent with the GrapesJS reference.
- No change to saved header/page/module data, the preview contract, or backend validation; existing
  page-builder tests pass unchanged.

## Risks, Non-Goals, and Notes

- **Non-goal:** redesigning the canvas, block palette, layer tree, or the global admin button system.
  Only inspector menu density and the Placement editor markup/CSS are in scope.
- **Risk — drag affordance discoverability.** Shrinking cards must keep the drag handle obvious; the
  icon move buttons are retained specifically so reordering never depends on discovering drag.
- **Risk — visual snapshot churn.** Existing visual specs will need re-baselining; do this
  deliberately in Phase 3 rather than disabling the specs.
- **Note:** our `renderInspectorSection()` already gives us GrapesJS-style collapsible sectors via
  `<details>`, so Phase work focuses on _intra-section_ density rather than re-implementing collapse.
