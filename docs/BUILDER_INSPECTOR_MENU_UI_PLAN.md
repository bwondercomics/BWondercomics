# Builder Inspector Menu UI Plan (GrapesJS-Aligned Density)

Status: Phases 0–3 complete; Phase 3 (Deferred / optional) segmented-control conversions not taken on.
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

Inside the 280px rail (which previously netted out to only **approximately 134px** of measured card
width and now provides **approximately 166px** after Phase 1 — see
[Measured width budget](#measured-width-budget)), the header Placement editor and a few sibling menus
showed:

- Buttons whose text is clipped ("Move Left/Right/Up/Down").
- Cards and pills that wrap onto multiple lines or overflow their column.
- A generally heavy, oversized feel compared to the dense canvas beside them.

## Root Cause Analysis

### Measured width budget

The usable width is not ~248px. Padding nests five levels deep before a placement card is laid out;
every layer is verified in source:

| Layer                        | Rule                                            | Horizontal padding | Running width |
| ---------------------------- | ----------------------------------------------- | ------------------ | ------------- |
| Sidebar rail                 | `--pb-sidebar-width` (`layout.css:119`)         | —                  | **280px**     |
| `.page-builder-sidebar`      | `padding: 12px` (`sidebar.css:7`)               | −24px              | 256px         |
| `.pb-editor-content`         | `padding: 16px 18px 96px` (`inspector.css:126`) | −36px              | 220px         |
| `.pb-inspector-section-body` | `padding: 0 16px 16px` (`inspector.css:302`)    | −32px              | 188px         |
| `.pb-header-layout-row`      | `padding: 12px` (`inspector.css:362`)           | −24px              | 164px         |
| `.pb-header-region`          | `padding: 12px` (`inspector.css:385`)           | −24px              | ≈140px        |

That padding-only estimate omitted the retained row and region borders; the browser-measured
pre-Phase 1 card width was approximately **134px**, not ~248px. Four 28px icon buttons consume 112px
before gaps, so a one-line card cannot fit. Phase 1 reduces row/region padding while retaining both
borders, recovering 32px for an approximately **166px** measured card width.

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

1. **Design for the measured budget, not the rail width.** A placement card had **≈134px** before
   Phase 1 and has **≈166px** after reducing row/region padding while retaining their borders. No
   inspector control may assume more than the
   measured budget at its nesting depth. Verify at the rail width and at the ≤1099px mobile drawer
   width (`layout.css:222`). The collapsed rail is out of scope (it hides the inspector — see
   Acceptance Criteria).
2. **Icon-first, whole-row drag.** The card stays a single draggable surface (current behavior); the
   handle glyph is a visual grip, not a separate drag target. Compact icon buttons are the precise /
   keyboard / a11y path. No multi-word text buttons inside dense menus.
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

- **Responsive region layout + trimmed chrome.** Keep the spatial Top/Main/Bottom rows, but make each
  row's Left/Center/Right regions **stack to a single column at rail width** (`grid-template-columns: 1fr`),
  switching to multi-column only when the container is wide enough (container query / width breakpoint).
  In the stacked state, also reduce row padding and drop region horizontal padding (the section body
  already supplies it) while retaining the row and region borders. This recovers 32px and lifts the
  measured card width from approximately 134px to **approximately 166px**.
- **Two-line cards (not one line).** A one-line card does not fit the measured budget, so each block is
  a **two-line** row modeled on a GrapesJS layer:

  ```
  Line 1:  [⠿ grip]  Block label (ellipsis)           [eye state]
  Line 2:  [◀ left] [▶ right] [▲ up] [▼ down]
  ```

  - The card remains a single draggable surface (whole-row drag, unchanged). The ⠿ grip is a visual
    affordance only — it owns no separate listener.
  - Drop the redundant `TOP / LEFT` pill; the region/row is already labeled by the enclosing cell. A
    tiny muted location caption may be shown only in the single-column stacked view.
  - **Visible/Hidden state stays accessible.** The visual cue is dimming + an eye-off icon
    (`.gjs-layer-hidden` style), while the card is a named `group`: `aria-labelledby` references the
    visible block label and `aria-describedby` references visually hidden "Visible" / "Hidden on this
    page" text.

- **Icon move cluster on line 2.** Replace the four `.btn-secondary` text buttons with four **compact
  icon buttons** (`.pb-icon-btn`, ~28px square, transparent, 1px border, arrow glyph, proper
  `disabled` state, `aria-label` per direction). On line 2 they get the full card width: 4 × 28px +
  3 × 6px gaps ≈ 130px, within the ≈166px budget. They reuse the existing move handlers (drag is
  the other path); they are the keyboard/precise affordance.

### Reusable inspector components (used by Placement and beyond)

1. **`.pb-icon-btn`** — compact square icon button (~26–28px), transparent background, subtle border,
   hover/active/disabled states. Replaces `.btn-secondary` inside inspector menus.
2. **`.pb-seg` / `.pb-seg-item`** — segmented radio control (port of `.gjs-radio-item`): equal-flex
   connected segments with shared borders and a checked state. Introduced as a component in Phase 0 and
   used by **new** markup only. Converting **existing** `<select>`/button controls (alignment,
   display-mode, edit-scope) to it changes element types that browser tests assert against via
   `selectOption()`/`toHaveValue()`, so those conversions are **deferred to Phase 3 (Deferred)** with an
   enumerated renderer + test list — they are not part of the CSS-only Phase 2.
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
  --pb-icon-btn-size: 28px;
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

**Completed 2026-06-19.** Shipped the scoped inspector density tokens, including the implemented 28px
icon-button size, plus reusable icon-button, segmented-control, compact-field-row, visually-hidden,
and truncation styles. Existing controls were not converted to segmented controls. Final
verification passed Prettier, JavaScript syntax checking, ESLint, all 59 Vitest files (544 passed, 1
skipped), all 14 Chromium Playwright tests without snapshot baseline changes, and the production
build.

### Phase 1 — Header Placement editor (the headline fix)

- Rework `renderPlacementEditor()` markup in `admin/page-builder/header-editor.js`:
  - **two-line cards**: line 1 `[⠿ grip] [ellipsis label] [eye state]`, line 2 the four `.pb-icon-btn`
    move buttons,
  - remove the redundant region chip,
  - icon buttons with per-direction `aria-label`s and the existing `disabled` edge logic,
  - expose each card as a named `group`, with `aria-labelledby` referencing the visible block label
    and `aria-describedby` referencing visually hidden Visible/Hidden state text; keep the eye icon
    hidden from assistive technology.
- Rework `.pb-header-layout-*` / `.pb-header-region*` in `admin/css/page-builder/inspector.css`:
  - responsive region grid (single column at rail width, multi-column when wide),
  - **trim chrome in the stacked state**: reduce row padding and drop region horizontal padding while
    retaining both borders, recovering 32px (approximately 134px → approximately 166px card width),
  - compact card chrome and gaps using the new tokens.
- **Drag model:** keep whole-row dragging exactly as today — `draggable="true"` and the `dragstart`/
  `dragend` listeners stay on `.pb-header-layout-card` (`header-editor.js:789`); the ⠿ grip gets no
  separate listener. The move-left/right/up/down logic (`header-editor.js:526-565`) is reused as-is;
  only the trigger markup changes.

**Completed 2026-06-19.** Shipped the responsive single-column placement board, approximately 166px
measured card width with 32px recovered from reduced padding and retained borders, two-line draggable
cards, decorative grip/eye glyphs, unchanged move selectors and handlers, and 28px directional
buttons. Each card is now a named `group` whose visible label and Visible/Hidden description are
connected with stable `aria-labelledby`/`aria-describedby` references. Unit coverage verifies group
references, descriptions, button names, and disabled edges; Chromium verifies accessible names and
descriptions. Final verification passed Prettier, JavaScript syntax checking, ESLint, all 59 Vitest
files (544 passed, 1 skipped), all 14 Chromium Playwright tests without snapshot baseline changes,
and the production build.

### Phase 2 — Density pass on sibling inspector menus (CSS-only, no control-type swaps)

- `renderPartsEditor()` toggle rows → compact `.pb-field-row` layout via CSS + class change; the
  `<input type="checkbox">` element and its `data-block-id`/`data-key` hooks are unchanged.
- Appearance rows (`controls.css` `.pb-appearance-*`) → tighten padding/gaps/font with the new tokens;
  **selects stay `<select>`**.
- Apply the truncation utility to section titles in `renderInspectorSection()`.
- Explicitly **out of Phase 2:** converting any `<select>` or button group to `.pb-seg` (see Phase 3
  Deferred). This keeps Phase 2 within its file scope and leaves existing binding tests green.

**Completed 2026-06-19.** Shipped the compact Parts toggle rows (two-line `.pb-field-row` with a
truncating label + muted description line, an `.pb-sr-only` "Show {label} in header" accessible name,
and the preserved `.pb-header-block-input` / `data-block-id` / `data-key` hooks); the Appearance
density pass — including a **fix for the pre-existing `.pb-appearance-toggle { min-width: 180px }`
overflow** (now `min-width: 0` with a non-shrinking checkbox and a truncating label) — tightening
only the text/select/number appearance inputs (`.pb-editor-input.pb-appearance-input`,
`.pb-editor-select.pb-appearance-input`) via the shared tokens while leaving the color picker, range
slider, and the global `.pb-editor-input` / `.pb-editor-select` sizing untouched; and the truncation
utility plus a full-text `title` on the shared `renderInspectorSection()` titles. No control types
changed — every checkbox and `<select>` is unchanged, and `.pb-seg` conversions remain deferred. Four
contract tests were added (parts accessible name, parts toggle state mutation, section-title
truncation, and Appearance `<select>` preservation).

**Corrective follow-up 2026-06-19.** The Parts row itself is now the checkbox's wrapping label, with
stable `aria-labelledby` / `aria-describedby` references so visible row activation toggles the
control while retaining the concise "Show {label} in header" accessible name and visible
description. Appearance labels now expose their full text with `title`, and the ≤720px stacked-row
rules reset the desktop `flex-basis` values for select, number, color-wrapper, and range controls so
those width budgets cannot become 150–180px control heights. Unit coverage exercises the row
activation and label references; a Chromium regression measures all four Appearance control shapes
below 720px and verifies horizontal containment and compact heights. Final verification passed
Prettier, JavaScript syntax checking, ESLint, all 59 Vitest files (548 passed, 1 skipped), all 15
Chromium Playwright tests without snapshot baseline changes, the production build, and
`git diff --check`. The broader measured-width / drag / focus-ring / contrast regressions and manual
rail-width QA remain Phase 3.

### Phase 3 — QA, accessibility, and docs

- Manual QA at the 280px rail and the ≤1099px mobile drawer (`layout.css:222`). **The collapsed rail
  (72px) is not a layout target** — it hides `.pb-sidebar-body` entirely (`sidebar.css:43`); QA there
  is limited to confirming the inspector body and its controls are not rendered/focusable while
  collapsed, and render correctly after expansion.
- **Measured-width regression** (not visual-only): in `tests/visual/builder-authoring-workflows.spec.js`,
  open the header Placement menu at the 280px rail and assert no overflow using measured geometry —
  e.g. each card/row `scrollWidth <= clientWidth`, and each move button's rendered width ≥ its content
  width (no text/glyph clipping).
- **Drag interaction regression:** assert that dragging a placement card from one region to another
  (whole-row drag) still moves the block, and that the move icon buttons perform the same moves.
- **Accessibility tests:** retain the Phase 1 named-group/name/description/button-edge coverage, then
  add focus-visible-ring and contrast checks.
- Update `docs/functions/admin-page-builder.md` / `docs/functions/admin-page-builder-styles.md`,
  `docs/READER_BUILDER_QA.md`, and add this doc to the `docs/README.md` index.

**Completed 2026-06-19.** Added three Chromium regressions to
`tests/visual/builder-authoring-workflows.spec.js`: a **measured-width** gate (each Placement card,
row, action cluster, and move button satisfies `scrollWidth <= clientWidth`, the four buttons sit on
one line, and the label is `nowrap`/`ellipsis`) checked at both the 280px rail and the ≤1099px drawer
band, with representative Parts and Appearance overflow spot-checks; a **dual-reorder** test proving
both whole-row drag and the icon move buttons move a block — asserting the immediate rerendered DOM and
dirty footer, then a single Save that persists `meta.header.layoutRows` — plus an inert disabled edge;
and an **accessibility** test covering per-direction button names, the keyboard `:focus-visible` ring,
and dependency-free WCAG AA (≥ 4.5:1) contrast for the label, an enabled move-button glyph, and the
region title. The Phase 1 named-group/name/description coverage is retained, and `docs/README.md`
already indexes this plan. Docs updated: `docs/functions/admin-page-builder.md` (placement board),
`docs/functions/admin-page-builder-styles.md` (density tokens + reusable components), and
`docs/READER_BUILDER_QA.md` (rail/drawer + collapsed-rail QA). No builder markup, CSS, or behavior
changed; no snapshot baselines changed.

**Corrective follow-up 2026-06-20.** The measured-width regression now proves its layout preconditions:
the wide-band sidebar is expanded at exactly 280px, while the 1000px stacked-band drawer remains
expanded at exactly 360px before geometry is checked. A dedicated collapsed-rail regression focuses
an inspector control, collapses through the toolbar control, verifies the 72px rail and hidden,
keyboard-inert sidebar body, then expands and proves the 280px Placement inspector and focusable move
controls return intact. Reorder coverage now invokes the native click path on a disabled edge without
dirtying or moving the block, verifies source removal and single-card uniqueness after every button
and drag move, and checks the same source-removal and exactly-once invariants in persisted
`meta.header.layoutRows`. Final verification passed JavaScript syntax checking, Prettier, ESLint, all
59 Vitest files (548 passed, 1 skipped), all 19 Chromium Playwright tests without snapshot baseline
changes, the production build, and `git diff --check`.

### Phase 3 (Deferred / optional) — segmented-control conversions

Converting existing controls to `.pb-seg` is valuable but changes element types that current tests
assert against, so it is scoped separately and only taken on with its tests updated in lockstep. Each
conversion must be enumerated with its renderer **and** its affected test before it ships:

| Control               | Renderer                                                                           | Test(s) using select APIs to migrate                                                                      |
| --------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Text-module alignment | `appearance-editor.js:179` (`renderAppearanceInput`, `inputType: 'select'`)        | `builder-authoring-workflows.spec.js:789-794` (`selectOption`, `toHaveValue` on `[data-key="alignment"]`) |
| Responsive edit scope | `header-editor.js` `renderResponsiveScopeControl` (`[data-responsive-edit-scope]`) | `builder-authoring-workflows.spec.js:788`/`:801` (`selectOption('device')`)                               |
| Reader display mode   | `reader-editor.js:92` (`renderLayoutControls`, `[data-reader-key="displayMode"]`)  | any reader-editor spec asserting `selectOption`/`toHaveValue`                                             |

Until each row above is migrated with its test, those controls remain `<select>` and only receive the
Phase 2 CSS density treatment.

## Files To Touch

- `admin/page-builder/header-editor.js` — `renderPlacementEditor()` (markup), `renderPartsEditor()`.
- `admin/css/page-builder/inspector.css` — `.pb-header-layout-*`, `.pb-header-region*`,
  `.pb-header-toggle-*`.
- `admin/css/page-builder/controls.css` — density tokens + `.pb-icon-btn` / `.pb-seg` / `.pb-field-row`
  / truncation utility.
- `admin/page-builder/inspector-sections.js` — apply truncation class to section titles (optional).
- `tests/visual/builder-authoring-workflows.spec.js` — measured-width, drag-interaction, and a11y
  coverage for the redesigned Placement menu (Phase 3).
- Phase 3 (Deferred) only: `admin/page-builder/appearance-editor.js`,
  `admin/page-builder/reader-editor.js`, and `admin/page-builder/header-editor.js`
  (`renderResponsiveScopeControl`) plus their select-based tests — touched **only** when a row in the
  deferred conversion table is taken on.
- `docs/README.md`, `docs/functions/admin-page-builder*.md`, `docs/READER_BUILDER_QA.md` — references.

## Acceptance Criteria

- At the 280px rail and the ≤1099px drawer, **no inspector menu clips text or overflows horizontally**,
  verified by **measured geometry** (`scrollWidth <= clientWidth`; move-button rendered width ≥ content
  width), not by eyeballing snapshots. The header Placement controls are fully visible and operable.
- The collapsed rail (72px) is explicitly **not** an operability target: its inspector body is hidden
  (`sidebar.css:43`). Acceptance there is that the inspector content is absent from the layout and not
  focusable while collapsed, and returns intact on expand.
- Blocks can be reordered by **both** whole-row drag-and-drop (unchanged behavior) and the icon move
  buttons, verified by an interaction test; icon buttons expose per-direction accessible names and
  correct disabled edges.
- Each placement card is a named `group`; its visible label supplies the accessible name and its
  Visible/Hidden state supplies the accessible description while the eye icon remains decorative.
- Inspector menus share one density scale (font, padding, gaps, icon size) and read as compact and
  icon-first, consistent with the GrapesJS reference.
- No change to saved header/page/module data, the preview contract, or backend validation; existing
  page-builder tests (including the select-based binding tests) pass unchanged.

## Risks, Non-Goals, and Notes

- **Non-goal:** redesigning the canvas, block palette, layer tree, or the global admin button system.
  Only inspector menu density and the Placement editor markup/CSS are in scope.
- **Risk — drag affordance discoverability.** The whole card stays draggable, but the two-line layout
  is denser; the ⠿ grip glyph and the always-visible line-2 icon buttons together ensure reordering
  never depends on discovering the drag surface.
- **Risk — recovered width depends on chrome trimming.** The ≈166px budget assumes Phase 1 reduces
  row padding and removes region horizontal padding in the stacked state. If that trim is descoped,
  the move cluster must fall back to a 2×2 grid (still two-line-safe at the approximately 134px
  baseline); the measured-width test is the gate.
- **Verification note — Phase 3 closeout.** All 19 current Chromium Playwright tests pass without
  baseline changes, including the measured-width, collapsed-rail, dual-reorder, focus-ring, and
  contrast coverage.
- **Note:** our `renderInspectorSection()` already gives us GrapesJS-style collapsible sectors via
  `<details>`, so Phase work focuses on _intra-section_ density rather than re-implementing collapse.
