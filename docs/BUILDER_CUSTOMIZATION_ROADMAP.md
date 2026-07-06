# Builder Customization Roadmap

Status: Phases 0–3 implemented (2026-07-05; deferred items — Phase 0 manual builder QA, Phase 1
drag-resize handles, Phase 2 universal module appearance, Phase 3 button typography/labels — are
tracked in the completion notes). Phases 4–7 planned.
Created: 2026-07-05
Branch context: `builder-incremental-improvement` — the Panel/Column Settings Consolidation Plan
(Phases 1–4) is implemented up to HEAD (`c82d986`), but its release gates (data migrations, manual
QA) have not run. Phase 0 of this roadmap closes them out.

Related docs:

- `docs/PANEL_COLUMN_SETTINGS_CONSOLIDATION_PLAN.md` — prerequisite; its closeout is Phase 0 here.
- `docs/BUILDER_INCREMENTAL_IMPROVEMENT_PLAN.md` — complete; its drop-placement and
  droppable-panel work is assumed by Phases 2 and 4.
- `docs/LIVE_CANVAS_EDITOR_CORRECTIVE_PLAN.md` — reference-only north star; this roadmap does not
  execute it.
- `docs/ROADMAP.md` — the release-hardening roadmap; this plan feeds its `0.8.5` "UX and
  Terminology" goals but is tracked separately.

## Purpose

Make the three main page elements — **panels (columns)**, the **reader**, and the **header** — and
the blocks inside them fully customizable from the builder, retire the confusing global theming
("Fast Start" presets, palette-drives-everything), and convert remaining hardcoded reader-shell
chrome into placeable blocks. All of it without changing how any existing published page renders
(battle-bros, prison planet, Pyre).

Terminology used throughout: a **panel is a column** (official since the consolidation plan — left
panel = reader-section column 0; right panel = last column, exists iff the layout has ≥2 columns).
**Blocks** are modules. This roadmap finishes aligning the UI language with that model.

## Traceability: request → phase

| Request                                                                                  | Phase                                                                         |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| "Section column settings do nothing" (column count, track ratio, gaps, spacing)          | 0 (verify + fix), 1 (real width control)                                      |
| Panel border color / thickness / roundness / transparency / on-off                       | 0 (exists since consolidation — verify + add explicit toggle)                 |
| Panel background image + framing                                                         | 0 (verify), 1 (expose framing on all columns)                                 |
| Panel size vs neighbors; make reader take more/less space                                | 1                                                                             |
| Section longer; panels shorter than the section                                          | 0 (alignment), 1 (section min-height)                                         |
| Add another section below with more columns                                              | Already works (`+ Add Section` insert bars) — confirmed in the Phase 0 matrix |
| Resize blocks and move them more freely                                                  | 2                                                                             |
| Reader controls: text style/color, button shape/size/colors, bar background/transparency | 3                                                                             |
| Turn the end-of-entry popup on/off (and style it)                                        | 3                                                                             |
| Header block movement "borderline nonsensical"                                           | 4                                                                             |
| Secondary color / angle confusion in background settings                                 | 4                                                                             |
| Custom logo letters (not static "BWC"), custom header text                               | 5                                                                             |
| Entry selector customizable like everything else                                         | 5                                                                             |
| Gear (Account Settings) button becomes a block instead of fixed right-panel chrome       | 6                                                                             |
| Remove "Fast Start"; palette only drives the page background                             | 7                                                                             |
| Columns-vs-panels naming confusion                                                       | 0                                                                             |
| Nothing breaks on existing pages                                                         | Compatibility rules + every phase's gates                                     |

## Confirmed decisions (2026-07-05 session)

| Decision              | Choice                                                                                                                                                                                                                        |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header fix direction  | **Edit in place on the live canvas.** Keep the 5 fixed blocks and the saved `layoutRows` model; retire the abstract placement board. (Header-as-a-real-section was considered and rejected — bigger rewrite, migration risk.) |
| "Gear options button" | The **Account Settings** button — `#userSettingsBtn` (`index.html:392`), the SVG gear at the bottom of the right `<aside>` that opens the account overlay (`reader/user-settings.js`). Becomes a placeable module.            |
| GrapesJS              | **Architecture reference only**, never a dependency (AGENTS.md standing rule).                                                                                                                                                |
| Theme scope           | Palette editing is removed from the UI; a Page Background control replaces it. Existing `meta.theme` tokens keep being applied at runtime so old pages render identically.                                                    |

## GrapesJS reference mapping (architecture reference only)

Trusted references: <https://grapesjs.com/docs/modules/Components.html>,
`.../Blocks.html`, `.../Style-manager.html`, `.../Traits.html`, `.../Layers.html`,
`.../Canvas.html`. Use these to sanity-check interaction design, not to import code.

| GrapesJS concept                | Local equivalent                                                                                               | Used by phase |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------- |
| Component tree                  | page → section → column/panel → module (DB-backed JSON)                                                        | all           |
| Canvas (real rendered iframe)   | live same-origin reader iframe (`preview-manager.js` + `reader/preview-bridge.js`)                             | 0, 2, 4       |
| Canvas spots / selected toolbar | selection overlay + selected-target toolbar                                                                    | 2, 4          |
| StyleManager (sectors)          | shared appearance schema (`appearance-editor.js` + `appearance-utils.js`) bound to whatever target is selected | 1–7           |
| TraitManager (per-type traits)  | per-module editors (`module-editor.js`, `reader-editor.js`)                                                    | 3, 6          |
| BlockManager (block palette)    | module picker / insert bars                                                                                    | 2, 6          |
| LayerManager                    | builder structure outline (`canvas-renderer.js` surface)                                                       | 4             |
| StorageManager (JSON)           | page JSON + backend sanitizers (`builder_security.py`)                                                         | all           |
| DeviceManager                   | device preview + responsive overrides (`responsive-overrides.js`, `responsive-css.js`)                         | 1–3           |

The single most GrapesJS-like principle this roadmap leans on: **every setting edits a selected
target and is visible immediately in a real render of the page** — no abstract boards, no controls
whose effect can't be seen.

## Current source of truth (shared reading map)

Line numbers drift; treat them as anchors (`~`) and re-verify before editing.

Rendering (one shared path — protect it):

- `admin/page-builder/shared-renderers.js` — `createRenderers()`, `MODULE_RENDERERS`,
  `renderSection()` (~:517), exported `buildColumnInlineStyle()` (~:486), gap CSS vars emission
  (~:547–554), layout → `grid-template-columns` (~:611), reader module mount (~:359).
- `reader/page-renderer.js` — public page mount. `admin/page-builder/preview-renderers.js` — admin
  wrapper. Both consume the same factory.
- `reader/data.js` — reader-shell integration: `findPanelModules()` (~:1053), panel column stacks +
  wrappers, `getEffectiveColumnSettings` reads (~:465), `applyReaderModuleShellSettings()` (~:603),
  `applyBuilderPageToDOM`.
- `assets/css/main.core.18-page-builder.css` — `.pb-section` (`--pb-section-gap` ~:71),
  `.pb-section-columns` (`--pb-column-gap` ~:76), `.pb-column` (~:104), `.pb-module`
  (`--pb-module-gap` ~:126).

Builder UI:

- `admin/page-builder.js` — state + actions (~2400 lines); section drafts, column selection,
  `setActiveSectionColumnCount` (~:2015).
- `admin/page-builder/editor-panel.js` — inspector; `renderColumnEditorContent` (~:167).
- `admin/page-builder/draft-manager.js` — per-surface drafts (section/module/header/theme).
- `admin/page-builder/appearance-editor.js` + `appearance-utils.js` — shared appearance schema:
  background (solid/gradient + `secondaryColor` + `angle` + opacity), text color, border
  (width/style/color/opacity/radius) → `appearanceToInlineStyle()`.
- `admin/page-builder/theme-editor.js` — "Fast Start" presets + "Palette / Color System" cards;
  `admin/page-builder/constants.js` — `THEME_COLORS` (~:30), `THEME_PRESETS` (~:40).
- `admin/page-builder/reader-editor.js` — display mode, controls placement/size, stage settings,
  comments toggle, controls appearance (defaults + primary) (:93–:230).
- `admin/page-builder/header-editor.js` — 3-rows × 3-regions placement board (to be retired),
  move/drag handlers (~:545–:884). `admin/page-builder/header-config.js` — the 5 fixed blocks
  (`brand`, `patron`, `status`, `entryControls`, `nav`), `layoutRows` model.
- `admin/page-builder/preview-manager.js` — live iframe canvas, selection channel (~:726);
  `reader/preview-bridge.js` — target collection/measurement, `page-header` surface (~:43);
  `admin/page-builder/live-drop-placement.js` + `structural-commands.js` — strict drop resolution
  (no nearest-snap; invalid drop = no-op).
- `admin/page-builder/responsive-overrides.js` / `responsive-css.js` — device branches + public
  `@media` emission. `admin/page-builder/inspector-sections.js` — accordion.

Reader shell (fixed chrome in `index.html`):

- Header: `.topbar` :89, logo "BWC" :91, title h1 :93; runtime layout `reader/header-layout.js`
  (`applySharedHeaderLayout` ~:175, `CONTROLLED_TOPBAR_STYLE_PROPS` ~:25, nav inline styles ~:169).
- Entry selector: built in `reader/app.js` (`buildEntrySelectMenu` ~:459); hardcoded colors in
  `assets/css/main.core.05-entry-select.css`.
- Controls: `index.html:261–294` (hardcoded labels "< BACK", "NEXT >", "HELP ?", "FIT", "FULL");
  `assets/css/main.core.15-controls.css` already consumes `--reader-control-bg/-color/-border/-border-radius`
  plus `data-reader-controls-placement/size`.
- End-of-entry popup: `#entryEndOverlay` `index.html:580–590`; shown by `reader/controls.js`
  `showEndOfEntry()` (~:69); buttons bound in `reader/app.js` (~:934); text set ~:382; styled by
  `assets/css/main.core.17-responsive.css:177–227`. **No config hook today.**
- Account gear: `#userSettingsBtn` `index.html:392–404`; links grid `#linksGridBtn` :405–415;
  overlay `#userSettingsOverlay` :432+; logic `reader/user-settings.js`.
- Side panels: `aside#leftPanel` :153, `aside#rightPanel` :306 (feed block, banner, comicnet list,
  gear + links buttons).

Backend:

- `backend/app/routes/page_builder.py` — admin + public endpoints.
- `backend/app/page_store.py` — `update_section` (~:804) **rejects** column shrink while the doomed
  column has modules; serializers.
- `backend/app/builder_security.py` — module-type registry (~:12–29) + per-type config sanitizers +
  section-settings + page-meta sanitizers. **Any new field must be registered here or it is
  silently dropped on save.**
- Migration script pattern (idempotent, `--dry-run` / `--write`):
  `backend/app/migrate_panel_settings_to_columns.py`, `backend/app/migrate_panel_toggles_to_ratio.py`.

Tests / gates: `npm test` (Vitest — `tests/shared-renderers-parity.test.js`,
`tests/reader-data-builder.test.js`, `tests/live-drop-placement.test.js`,
`tests/admin-page-builder-shell.test.js`, `tests/appearance-utils.test.js`,
`tests/reader-config.test.js`, …), `npm run test:backend`, `npm run test:visual` (Playwright),
lint/format, `docs/DEVELOPER_QUICK_REFERENCE.md` pre-commit checklist. Backend runs in Docker
`bwondercomics-bwondercomics-api-1` (restart after backend changes); Vite dev on 5173 proxies
`/api` → 8001.

## Backward-compatibility rules (every phase)

1. **Additive-only schema.** Never rename or repurpose an existing config key. New behavior = new
   key with a default that reproduces today's rendering.
2. **Sanitizer registration checklist** for every new field: backend sanitizer
   (`builder_security.py`) + client normalization + draft cleanup
   (`buildSectionSettingsFromDraft` / module-editor equivalents) + (if responsive)
   `COLUMN_RESPONSIVE_FIELDS`-style registration.
3. **Read-time fallbacks** so unmigrated pages render identically (pattern:
   column `panelBackground` falling back to `page.meta.panelBackgrounds`).
4. **Migrations are standalone, idempotent, dry-run-first scripts** (mirror
   `migrate_panel_settings_to_columns.py`). Never destructive: flag-and-skip instead of delete.
5. **Never delete a config producer before all consumers are neutralized** (the consolidation
   plan's Phase-4 ordering lesson). Grep every reader of a key before removing its writer.
6. **Visual parity is a gate, not a hope**: `npm run test:visual` plus a manual pass on one
   published page per series (battle-bros, prison planet, Pyre) for any phase touching renderers,
   CSS, or theming.
7. Previews/iframes/overlays are **views**; the saved page JSON is canonical (AGENTS.md).

---

## Phase 0 — Close out the consolidation; kill every dead control (Size: M)

### Problem

The consolidation plan that fixes "column settings do nothing" is merged but not released: the two
data migrations have never run, manual QA is pending (including the Pyre check left open by the
incremental plan), and **column alignment is a known dead control on panels** (it emits
`justify-self`, a grid property, but panels are flex — documented Phase-1 exclusion). Separately,
the UI still says "column" where the user thinks "panel", and border on/off requires knowing that
width 0 means off.

### Where

- Migrations: `backend/app/migrate_panel_settings_to_columns.py`,
  `backend/app/migrate_panel_toggles_to_ratio.py`.
- Alignment: `buildColumnInlineStyle` (`shared-renderers.js` ~:486, `includeAlignment` option),
  panel wrapper flex CSS (`assets/css/main.core.09-side-panels.css` ~:82–105), panel stack path in
  `reader/data.js`.
- Labels: `editor-panel.js` (column/section inspectors), `reader-editor.js` copy.

### Steps

- [x] Run both migrations `--dry-run` then `--write` for **every** series with builder pages
      (battle-bros, prison planet, Pyre — confirm exact series ids from the admin series list),
      review flagged pages, restart the API container.
- [ ] Perform the pending manual QA: the consolidation plan's Verification list plus the
      incremental plan Item 3 step 6 (Pyre reader page). _(Remaining: interactive builder QA needs
      an authenticated admin session — see completion note.)_
- [x] Build and record a **six-control verification matrix**: {column count, layout ratio, module
      gap, column gap, section gap, alignment} × {normal multi-column section, reader section with
      panels} × {live builder preview, published page}. Append the pass/fail table to this phase's
      completion note; fix failures inside this phase.
- [x] Implement panel alignment: apply `align-self` (flex semantic) on the panel column wrapper
      when the column is a panel; keep `justify-self` for grid columns. Document that non-stretch
      alignment also narrows/shrinks the panel wrapper (that is what makes "panel shorter than the
      section" possible vertically for column-direction flex).
- [x] Terminology pass: reader-section columns are labeled **Panel** everywhere (inspector titles,
      selection chips, warnings); other columns "Column"; replace jargon labels (e.g. "track
      ratio") with plain words ("Panel widths").
- [x] Add an explicit **Border on/off** toggle to the Column/Panel appearance section (off = width
      0 under the hood; remembers the previous width in the draft for re-enable).

### Acceptance

- Migrations applied on all series; flagged pages reviewed; QA notes recorded.
- Matrix is all-pass: each of the six controls provably changes builder preview **and** published
  output on both section kinds.
- Alignment visibly works on panels; `stretch` remains the default (no layout change for existing
  pages).
- Existing pages render identically except where a control was genuinely broken before.

### Risk & rollback

Low. Migrations are dry-run-first and flag-not-delete. Alignment is gated behind a non-default
value. Rollback: revert renderer/UI commits; migrations need no rollback (they only move data to
the already-authoritative location).

### Test plan

`npm test -- tests/reader-data-builder.test.js tests/shared-renderers-parity.test.js` (+ new
alignment cases builder/public/empty-panel), `./.venv/bin/python -m unittest
backend.tests.test_migrate_panel_settings backend.tests.test_migrate_panel_toggles`, full standard
gate incl. `npm run test:visual`, manual matrix on one page per series.

### Completed 2026-07-05 (one manual QA step handed back)

**Migrations (live DB, backed up first to `var/backups/db-20260705-143558.sql`):**

- Series with builder pages: `battle-bros` (1 page), `prisonplanet` (1), `02` / PYRE (3), plus a
  stray `null` test series (nothing to migrate).
- `migrate_panel_settings_to_columns`: dry-run showed one page per real series moving
  `panelBackgrounds` (battle-bros also `panelSpacing.right`) onto the reader-section columns; no
  conflicts. `--write` applied; re-run dry-run reports 0 pending (idempotent).
- `migrate_panel_toggles_to_ratio`: 0 changes, 0 flagged on every series — no page ever used the
  legacy disable toggles.
- API container restarted (it had been running 12 days on pre-consolidation backend code) and the
  public battle-bros page verified serving column-owned `panelBackground`/`panelGap`.

**Code changes:**

- Panel alignment fixed: `buildColumnInlineStyle` gained an `alignmentProperty` option
  (`justify-self` default, `align-self` for the flex panel wrapper); new
  `alignmentToAlignSelf()` in `layout-utils.js`; panel path in `reader/data.js` now passes
  `align-self`; same treatment in `columnDeclarations` → `buildPanelResponsiveCss`
  (`responsive-css.js`) so `@media` overrides match; the inspector's alignment select is no longer
  hidden for panels (`editor-panel.js`).
- Terminology: "Track N ratio" → "Left/Right panel width" / "Column N width" (with a proportional-
  shares hint), "Reflow track count" → "Columns on this device", "structural columns" jargon
  removed, section summary "N cols" → "N columns" (`editor-panel.js`; panel-aware labels via
  `sectionReaderPanelSide`).
- Border master switch: "Show border" checkbox at the top of the Border group in the Column/Panel
  inspector (`renderAppearanceControls` `borderMaster` option + handler in `editor-panel.js`).
  Off writes explicit `border.width: 0` (already renders `border: none` and survives the backend
  sanitizer); on restores the remembered width (default 2) and fills style/color defaults so the
  border is visible. No schema change.

**Six-control verification matrix** (evidence: unit/parity/shell tests + a live-data render of the
battle-bros page through the real published code path):

| Control                     | Normal section (preview + published)                                             | Reader section / panels (preview + published)                                                                                         | Verdict                 |
| --------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Column count                | grid tracks emitted; non-empty shrink rejected by backend                        | right panel exists iff layout has ≥2 columns (ratio-driven existence)                                                                 | PASS                    |
| Width ratio ("track ratio") | `layout '1-2'` → `grid-template-columns: 1fr 2fr`; live `1-3-1` → `1fr 3fr 1fr`  | controls **existence only** — shell panel width is fixed CSS (`.side-panel` 20vw, 250–400px); real panel width control is **Phase 1** | PASS (limit documented) |
| Module gap                  | `--pb-module-gap` emitted, consumed by `.pb-module`                              | panel stacks use column `panelGap` → `--pb-panel-gap`                                                                                 | PASS                    |
| Column gap                  | `--pb-column-gap` emitted, consumed by grid `gap` (visible with 2+ columns)      | n/a on shell panels (viewer gap is fixed shell CSS)                                                                                   | PASS (limit documented) |
| Section gap                 | `--pb-section-gap` emitted, consumed by `.pb-section` margin (needs 2+ sections) | same emission path                                                                                                                    | PASS                    |
| Alignment                   | `justify-self` inline + `@media`                                                 | **fixed this phase**: `align-self` inline + `@media`                                                                                  | PASS (fixed)            |

**Verification:** `npm run format:check` (edited files), `npm run lint`,
`npm test` (611 passed, 1 skipped), `./.venv/bin/python -m unittest
backend.tests.test_migrate_panel_settings backend.tests.test_migrate_panel_toggles` (18 passed),
`npm run build`, `npm run test:visual` (21 passed), plus a live end-to-end script rendering the
public battle-bros API payload through `createRenderers()` (9/9 checks). One shell test updated to
assert the alignment control now **shows** for panels (was asserting the old exclusion); one new
shell test covers the border master switch.

**Handed back (needs an authenticated admin session):** the interactive builder QA pass — open the
builder on a Pyre reader page, click each panel/column, change each control, save, reload the
published page (the consolidation plan's manual Verification list). Everything automatable was
automated; this last look is human.

**Follow-up fix (2026-07-05, from user QA — "border draws a useless cube inside the panel"):**
panel appearance was painting the inner column wrapper instead of the panel the user actually
sees. The column's appearance (background, border, radius, text color) now styles the
`<aside class="side-panel">` shell itself, overriding the stock chrome (4px primary border + dark
gradient) with clear-then-apply semantics — unset values restore the defaults, so pages without
authored appearance are pixel-identical. While custom chrome is set, the decorative `::before`
accent strip is hidden (`side-panel--custom-chrome`, `main.core.09-side-panels.css`). The inner
wrapper keeps layout styling only (padding / min-height / alignment / gap). Public responsive
`@media` appearance branches are likewise scoped to the aside — `buildPanelResponsiveCss` now
takes `{ wrapperSelector, shellSelector }` (`responsive-css.js`); the builder preview gets the
same result via the device-merged settings. Implementation: `applyPanelShellAppearance()` in
`reader/data.js` (applied in `renderPanelStack`, cleared unconditionally with the panel background
vars); `buildColumnInlineStyle` gained `includeAppearance` (false on the panel path). Verified:
`npm test` (611 passed, 1 skipped), `npm run build`, `npm run test:visual` (21 passed).
Note: panel **width** is still fixed shell CSS — that is Phase 1, not a bug in this fix.

---

## Phase 1 — Panel & section sizing (Size: M)

### Problem

Column widths only come from preset ratio strings; there is no per-panel width control, no way to
give the reader more/less room deliberately, and no way to make a section taller than its content
(so panels can't be "as long as the section is made to be").

### Where

- Layout ratios: `section.layout` string (backend accepts any well-formed `n-n-n`,
  `builder_security.py` ~:45); UI `renderSectionLayoutEditor` (`editor-panel.js` ~:112);
  `setActiveSectionColumnCount` (`page-builder.js` ~:2015); grid emission
  (`shared-renderers.js` ~:611).
- Section settings: `sanitize_section_settings` (backend), section inspector, `renderSection`.
- Panel background framing controls: Column/Panel inspector (from consolidation Phase 3).

### Steps

- [x] **Panel width weights**: in the Section inspector (and mirrored in the Column/Panel
      inspector for the selected column), show one numeric weight input per column (integer 1–12),
      writing the joined `section.layout` string. Reader sections: changing left/right panel
      weights resizes the panels around the reader — call this out in the UI copy.
- [x] Keep the existing column-count control; count changes append weight-1 columns / are blocked
      by the existing non-empty-shrink rejection (backend authority already in place).
- [x] **Section min-height**: new `section.settings.minHeight` (px, optional, responsive-capable)
      — sanitize client+server, emit on `.pb-section` / the section wrapper in `renderSection`,
      add to the section inspector. Panels/columns already have per-column `minHeight`; with
      Phase 0 alignment they can now be shorter than the section.
- [x] **Background framing for all columns**: the column schema already carries
      `panelBackground { path, fit, focus, opacity }` — ensure the inspector exposes
      image + fit + focus + opacity for _every_ column, not only reader panels (rename the UI
      group "Background image").
- [ ] _(Optional, deferred)_ Drag-resize gutter handles on the live canvas that
      write the same weights (editor-only overlay; must not affect public CSS).

### Completed 2026-07-05

- **Reader panel widths are now ratio-driven.** The width inputs already wrote `section.layout`,
  but the reader shell ignored them (fixed `.side-panel` CSS: 20vw, clamped 250–400px). Now, when
  the reader section has **3+ columns**, `applyPanelShellWeights()` (`reader/data.js`) sets
  `--pb-shell-left/center/right-weight` vars + `data-pb-shell-weights` on `.viewerWrap`, and a
  rule in `main.core.09-side-panels.css` shares the row proportionally between the left panel,
  the reader area, and the right panel (middle weights sum into the center). Gated to the
  side-by-side landscape layout via `@media (min-aspect-ratio: 7/5)` — the aspect-ratio reflow in
  `main.responsive.css` keeps its own widths — and the 250px panel `min-width` floor remains.
  With 1–2 columns the stock fixed width applies (there is no center track to weigh against).
  Existing `1-3-1` pages keep essentially the same proportions (≈20% per panel); expect a few px
  drift versus the old viewport-relative `20vw`.
- **Section min-height** end to end: `settings.minHeight` (0–2000, base + per-device) — inspector
  input in the section Spacing panel, draft plumbing (`page-builder.js`), responsive field
  registry, inline emission in `renderSection`, `@media` emission (`responsive-css.js`), and
  backend sanitizer (`builder_security.py`, base + responsive branch).
- **Background image framing on every column**: the surface section of the Column/Panel inspector
  now renders for all columns (titled "Background Image" for non-panels; the panel-only module
  spacing / empty-text fields stay panel-scoped). Normal grid columns render the art as a
  `.pb-column-bg` layer under the modules (fit/focus/opacity inline, CSS in
  `main.core.18-page-builder.css`); reader panels keep their aside-shell art. Existing event
  bindings were already column-generic.
- UI copy: reader-section width hint calls out that 3+ column weights resize the panels around
  the reader.
- Tests: shell-weight apply/clear cases (`tests/reader-data-builder.test.js`), section min-height
  inline + `@media` and column background layer cases (`tests/shared-renderers-parity.test.js`),
  backend min-height clamps (`backend/tests/test_builder_security.py`).
- Verified: `npm run format:check`, `npm run lint`, `npm test` (614 passed, 1 skipped),
  `npm run test:backend` (OK), `ruff format --check` (clean), `npm run build`,
  `npm run test:visual` (21 passed); API container restarted for the sanitizer change.
- Deferred: drag-resize gutter handles (optional step, unchanged scope).

**Follow-up refinements (2026-07-05, from user QA):**

- **Percent-based widths.** Integer weights were too coarse (1→2 doubled a panel). The width
  inputs now edit each column as a **percent of the row** (5% steps, clamped 5–90); on change the
  other columns renormalize proportionally so the weights always sum to 100
  (`updateActiveSectionColumnRatio` in `page-builder.js`). Stored layouts are now percent-scale
  weight strings (e.g. `40-20-20-20`); `MAX_COLUMN_RATIO` raised 12 → 100 on both sides
  (`layout-utils.js`, `builder_security.py`) — legacy ratios like `1-3-1` remain valid and
  display as their percent equivalents. Newly added columns get an average share instead of a
  1-weight sliver. Device-scope reflow edits use the same percent semantics.
- **Stage frame fill.** In Dynamic Frame fit, tall pages are height-bound, so widening the reader
  column only stretched the controls while the frame hugged the pages. New reader stage option
  **Frame Width: Hug Pages (default) / Fill Column** (`stage.frameFill`): under `fill`, the pages
  container spans the reader column like the controls do (pages stay centered at their
  height-limited size). Plumbed through `reader-config.js` (normalize + mount attrs),
  `reader-editor.js` (Stage select), `builder_security.py` (`sanitize_reader_stage`), runtime
  attr in `reader/data.js`, and the frame computation in `reader/transform.js`. Default `hug`
  keeps existing pages pixel-identical. Note: making the _pages themselves_ larger than the
  screen height allows is a different trade — that's the existing Fit Width stage mode
  (vertical scrolling), not a frame option.
- Tests updated to the percent semantics (shell suite) plus new frameFill normalization
  (frontend + backend). Verified: full gate — `npm test` (615 passed, 1 skipped),
  `npm run test:backend` (OK), lint/format, `npm run build`, `npm run test:visual` (21 passed);
  API container restarted for the sanitizer changes.
- **Preview frame refit fix (same day):** the dynamic page frame only re-fit on window `resize`
  or page turns, so editing panel weights in the live builder preview resized the column without
  the frame following (published pages were correct — the frame computes after load). Added a
  `ResizeObserver` on `#mainContent` (`reader/app.js`) funneling into the same debounced reflow,
  so the frame refits whenever the reader column changes width — in the preview and in any live
  reflow without a window resize. Verified: `npm test` (615 passed), `npm run build`,
  `npm run test:visual` (21 passed).

### Acceptance

- Setting weights e.g. `1 / 6 / 1` → published grid is `1fr 6fr 1fr`; reader visibly wider;
  swapping to `2 / 4 / 2` shrinks it. Same result in preview and published page.
- A section with `minHeight: 900` is 900px tall with short content; a panel with
  `alignment: start` + no min-height hugs its content inside it.
- Any column can carry a framed background image.
- Old pages (no new keys) render byte-identical section CSS.

### Risk & rollback

Medium-low. Weight input can produce extreme ratios — clamp 1–12 and preview live. Rollback:
revert UI + renderer emission; saved weights degrade gracefully (layout string was always
free-form).

### Test plan

Renderer parity tests for weights + section min-height (builder/public), backend sanitizer tests
for `minHeight`, `npm run test:visual`, manual on a reader page per series.

---

## Phase 2 — Block sizing & freer movement (Size: M/L)

### Problem

Blocks have no size controls at all (width comes from the column, height from content), and precise
movement relies purely on drag.

### Where

- `shared-renderers.js` `renderModule()` wrapper (`.pb-module`); `builder_security.py` per-type
  sanitizers (add one shared layout/appearance sub-sanitizer); `module-editor.js` inspector;
  selected-target toolbar (`preview-manager.js` ~:117 toolbar actions,
  `structural-commands.js`); move/reorder endpoints already exist
  (`POST /api/admin/modules/{id}/move`, `.../modules/reorder`).

### Steps

- [x] **Universal `config.layout` sub-schema** on every module type:
      `{ widthMode: 'full'|'percent'|'px', width, maxWidth, height: 'auto'|px, align:
'start'|'center'|'end' }` — one shared sanitizer server-side + one client normalizer;
      defaults reproduce today (full width, auto height).
- [ ] **Universal module appearance**: reuse the shared appearance schema (background, border,
      padding) on the module wrapper for types that lack their own (audit per-type editors first
      to avoid double controls). _(Deferred — needs the per-type style-editor audit; see
      completion note.)_
- [x] Apply it as inline style on the `.pb-module` wrapper in `renderModule()` (width/max-width/
      height; `align` via `align-self`/auto-margins in the column flex/grid context).
- [x] Inspector: add a "Layout" accordion to the module editor (base breakpoint first; responsive
      overrides as a follow-up item, registered like column responsive fields).
- [x] **Precision movement**: selected-module toolbar gains up/down (reorder within column) and
      left/right (move across columns/panels) actions calling the existing endpoints; respects the
      same eligibility rules as drag (Comic Reader singleton etc.).

### Completed 2026-07-05 (one step deferred)

- **Shared module layout end to end.** `sanitize_module_layout()` in `builder_security.py`
  (sparse: percent width 5–100 / px width 40–2000, maxWidth 40–2400, height 40–4000, align
  start/center/end; `None` when nothing authored) attached to every module type through the
  `with_responsive` hook in `sanitize_module_config`. Renderer: exported
  `buildModuleLayoutStyle()` in `shared-renderers.js`, applied on the `.pb-module` wrapper in
  `renderModule()` — alignment uses auto margins so it behaves identically in grid columns and
  flex panels; px widths and maxWidth are capped at 100% of the column. Modules without a
  `layout` key emit no style attribute at all (parity-tested).
- **Layout card in the module inspector** (`module-editor.js`): "Size & Alignment" card rendered
  for every structured module type (except the Comic Reader, which has stage sizing); collected
  sparsely into `config.layout` via a new `[data-layout-key]` collector in
  `collectGenericModuleDraft` (blank/default fields delete their key; an empty layout object is
  removed).
- **Toolbar step-moves.** New structural command `builder:move-module-step`
  (`structural-commands.js`, registered in `commands.js`): ↑/↓ reorder within the column, ←/→
  append to the adjacent structural column — panels are columns, so this steps blocks into and
  out of reader panels. Edge positions and unknown directions are clean no-op rejections with a
  status message; the Comic Reader module is excluded (it owns the viewport). Toolbar buttons in
  `preview-manager.js` (hidden for the reader module), dispatched like duplicate/delete.
- **Deferred:** universal module _appearance_ on the wrapper. Several types already carry their
  own sanitized style systems (promo, buttons, email-signup `config.style`, text alignment);
  bolting the shared appearance schema on top without the per-type audit would create double
  controls. It stays an open step of this phase.
- Tests: wrapper layout emission + absence parity (`tests/shared-renderers-parity.test.js`),
  backend layout sanitizer clamps/sparseness (`backend/tests/test_builder_security.py`).
- Verified: `npm run format:check`, `npm run lint`, `npm test` (616 passed, 1 skipped),
  `npm run test:backend` (OK), `npm run build`, `npm run test:visual` (21 passed); API container
  restarted for the sanitizer change.

### Acceptance

- A block in a panel can be set to 60% width, centered, fixed 240px height; identical in preview
  and published page; survives reload.
- Toolbar arrows move a block between panels/columns exactly one step per click; ineligible moves
  are disabled, not silently wrong.
- Modules without `config.layout` render exactly as before (parity tests).

### Risk & rollback

Medium. Touches the shared renderer for every module type — parity tests are the safety net.
Rollback: revert wrapper emission; saved `layout` keys are inert (sanitizers keep them, renderer
ignores them).

### Test plan

`tests/shared-renderers-parity.test.js` additions (with/without layout key, each widthMode),
backend sanitizer tests, toolbar command tests alongside the existing duplicate-command tests,
standard gate + visual.

---

## Phase 3 — Reader controls & end-of-entry popup (Size: M)

### Problem

Reader buttons are only styleable via two sparse appearance slots; the controls bar itself, button
typography, and label text are hardcoded; the end-of-entry popup cannot be disabled or styled.

### Where

- Config: `reader-config.js` (normalize), `reader-editor.js` (UI), reader mount data attributes
  (`getReaderMountDataAttributes`), `applyReaderModuleShellSettings` (`reader/data.js` ~:603).
- Runtime: `assets/css/main.core.15-controls.css` (`--reader-control-*` vars), `index.html`
  controls markup :261–294, `reader/controls.js` `showEndOfEntry()` ~:69, popup markup
  `index.html:580`, popup CSS `main.core.17-responsive.css:177`.
- Sanitizer: reader module config in `builder_security.py`.

### Steps

- [x] **Controls bar appearance**: `config.controls.bar.appearance` (background + opacity, border,
      radius) applied to `.controls` via CSS vars / inline style at mount. Transparency = the
      appearance schema's existing background opacity.
- [ ] **Button typography**: extend the shared appearance schema with an optional **text group**
      (font size, weight, transform, color) — reused later by header/entry-selector phases. Wire
      `controls.style.defaults/primary` text tokens to new `--reader-control-font-*` vars consumed
      by `main.core.15-controls.css`.
- [ ] **Granular shape/size**: `controls.style.defaults.padding` (+ radius already available via
      border.radius); keep compact/medium/large presets as quick-set buttons that fill the same
      fields.
- [ ] **Custom labels**: `config.controls.labels { prev, next, help, fit, zoomIn, zoomOut,
fullscreen }` (length-capped, sanitized); applied at mount; defaults = current hardcoded
      text so unset pages are unchanged.
- [x] **End-of-entry popup**: `config.endOfEntry = { enabled: true, title?, body?, appearance? }`.
      `showEndOfEntry()` consults the resolved reader shell settings and no-ops when disabled;
      appearance applies to `.entry-end-content`; text fields override the dynamic defaults.
      Builder UI: a "Completion Popup" accordion in the reader editor.

### Completed 2026-07-05 (typography, labels, and granular padding deferred)

- **Controls bar appearance** (`config.controls.style.bar.appearance`): third slot alongside
  defaults/primary in `normalizeReaderControlsStyle` (`reader-config.js`),
  `sanitize_reader_controls_style` (`builder_security.py`), the reader editor's appearance
  section ("Controls Bar", scope `readerControlsBar` — mapping added in
  `resolveAppearanceTarget` and `removeNullAppearanceBranches`), applied inline on `#controls`
  with clear-then-apply in `applyReaderModuleShellSettings` (`reader/data.js`). Background
  opacity = bar transparency.
- **Completion popup** (`config.endOfEntry { enabled: true, title, body }`): normalized in
  `reader-config.js`, sanitized via `_sanitize_reader_end_of_entry` (`builder_security.py`),
  "Completion Popup" section in the reader editor (toggle + optional title/message), applied as
  data attributes on `#entryEndOverlay`, and honored by `showEndOfEntry()`
  (`reader/controls.js`) — disabled still records entry completion, only the overlay is
  suppressed; custom copy is applied at show time so it wins over the per-entry defaults.
- **Deferred** (open steps above): button typography (`--reader-control-font-*` + appearance
  text group), custom button labels, and granular padding beyond the size presets — the shared
  appearance text-group extension is a prerequisite for the header/entry-selector phases and
  should land with them.
- Tests: `tests/reader-config.test.js` (endOfEntry defaults/overrides + bar slot),
  `backend/tests/test_builder_security.py` (popup sanitizer + bar appearance slot).
- Verified: `npm run format:check`, `npm run lint`, `npm test` (617 passed, 1 skipped),
  `npm run test:backend` (OK), `npm run build`, `npm run test:visual` (21 passed); API
  container restarted for the sanitizer changes.

**Follow-up (2026-07-05, from user QA — indicator/glow/bar-text):**

- The **page indicator** (`.status`, `main.core.16-status-progress.css`) now consumes the same
  `--reader-control-*` vars as the buttons, so "Controls Defaults" styles it too (stock yellow
  look preserved as fallbacks). Note: "Primary Control" intentionally targets only the FIT
  button (`.btn.primary`); "Controls Defaults" targets every other button + the indicator.
- New **Neon Glow toggle** (`controls.style.glow`, default true): off strips the box/text
  shadows from the bar, buttons, and indicator via
  `.controls[data-reader-controls-glow='off']` rules (`main.core.15-controls.css`). Plumbed
  through `reader-config.js`, the reader editor checkbox, `sanitize_reader_controls_style`
  (sparse: only `false` persists), and `applyReaderModuleShellSettings`.
- Clarified in the editor hint: the bar card's text color has no visible consumers (buttons and
  the indicator carry their own text colors from Controls Defaults) — button/indicator text
  color belongs to Controls Defaults.
- Verified: `npm test` (618 passed, 1 skipped), `npm run test:backend` (OK), lint/format,
  `npm run build`, `npm run test:visual` (21 passed); API restarted.

### Acceptance

- Author can restyle button colors/shape/size/text and make the controls bar semi-transparent;
  published page matches preview.
- Popup toggle off → finishing an entry shows nothing (and "Next entry" flow is still reachable
  via the entry picker); toggle on (default) → today's behavior, byte-identical.
- Pages saved before this phase render identically (all defaults mirror current values).

### Risk & rollback

Medium-low. Pure additive config + CSS-var plumbing. Rollback: revert; saved keys inert.

### Test plan

`tests/reader-config.test.js` (normalization + defaults), mount/data-attribute tests, a
controls.js unit test for the disabled popup, standard gate + visual, manual finish-an-entry check
on battle-bros.

---

## Phase 4 — Header edit-in-place (Size: L)

### Problem

Header blocks are arranged on an abstract 3×3 placement board that doesn't look like the header, so
moving blocks is guesswork. Also, "Secondary color" and "Angle" appear meaningless — they are the
gradient end-color and direction but render even when the background type is Solid.

### Where

- Selection/bridge: `reader/preview-bridge.js` (`page-header` surface ~:43),
  `preview-manager.js` selection channel (~:726), `header-layout.js` (edit-mode markers),
  `live-drop-placement.js` patterns.
- Board to retire: `header-editor.js` placement board (~:280–:884) — **keep** its data mutations
  (`moveBlockToPlacement`, `moveBlockAcrossRegions/Rows`) as the model API.
- Gradient UX: `appearance-editor.js` background group (~:13–:47).

### Steps

- [ ] Emit per-block edit-mode markers in the header
      (`data-builder-header-block="brand|patron|status|entryControls|nav"`) from
      `header-layout.js`; extend the bridge to collect/measure them and post
      `{ kind:'header-block', blockId }` targets.
- [ ] Click a header block in the live canvas → selects it; inspector shows that block's settings
      (placement + per-block settings that exist today; appearance arrives in Phase 5).
- [ ] On-canvas **drag between rows/regions** with insertion guides, reusing the strict
      drop-resolution rules (no nearest-snap; invalid pointer position = clean no-op — the
      incremental plan's Item 1 contract). Drops call the existing `moveBlockToPlacement` model
      code and save through the existing header draft.
- [ ] Selected-block toolbar arrows (left/right region, up/down row) reusing
      `moveBlockAcrossRegions/Rows`, disabled at edges exactly as the board buttons are today.
- [ ] Retire the placement board UI once canvas parity is confirmed (same session, after the
      above ships); the saved `layoutRows` schema does not change.
- [ ] **Gradient UX fix** in `appearance-editor.js` (benefits every appearance user): show
      Secondary Color + Angle only when Background type = Gradient; relabel "Gradient end color"
      and "Direction (degrees)"; when type = Solid they are hidden, not dead.

### Acceptance

- Clicking each of the 5 blocks in the live preview selects it with a visible outline.
- Dragging the entry picker from top-right to bottom-center lands exactly where the guide showed;
  published header matches; dropping over dead space changes nothing.
- The board is gone; every board capability is reachable on-canvas; saved header configs from
  before this phase load and render unchanged.
- Secondary/Angle appear only for gradients, everywhere appearance is edited.

### Risk & rollback

High-ish (bridge + selection surface work). Mitigate by keeping the data model and mutation
functions untouched — this is a view swap. Ship marker/selection first, drag second, board removal
last (separate commits). Rollback: re-show the board; remove markers.

### Test plan

Bridge target-collection tests, drop-placement tests for header rows/regions (mirroring
`tests/live-drop-placement.test.js` contracts), `tests/admin-page-builder-shell.test.js` header
flow, appearance-editor conditional-render test, standard gate + visual, manual drag QA.

---

## Phase 5 — Header content customization (Size: M)

### Problem

The logo is the hardcoded string "BWC" (`index.html:91`); per-block styling doesn't exist; the
entry selector's colors live in hardcoded CSS. Fine for BWC, unusable for anyone else.

### Where

- `page.meta.header` (sanitized in `builder_security.py` page-meta path), `header-config.js`
  normalization, `header-editor.js` per-block panels, runtime `header-layout.js` (nav items
  already take inline styles ~:169; `CONTROLLED_TOPBAR_STYLE_PROPS` ~:25),
  `assets/css/main.core.05-entry-select.css`, `assets/css/main.core.04-header.css` logo rules
  ~:271–:291.

### Steps

- [ ] **Brand block content**: `meta.header.brand = { logoText (default "BWC"), logoImage?,
logoAppearance? }` alongside the existing title/subtitle keys (extend, never rename).
      Runtime: `header-layout.js` swaps logo text / renders the image; hardcoded markup stays as
      the fallback for unset pages.
- [ ] **Per-block appearance**: `meta.header.blocks[blockId].appearance` (shared schema incl. the
      Phase-3 text group) applied as inline style on each block wrapper at layout time — the same
      mechanism nav items already use.
- [ ] **Entry selector**: convert `main.core.05-entry-select.css` hardcoded colors/borders/fonts
      to CSS vars whose defaults equal the current values; the `entryControls` block appearance
      sets those vars (trigger, menu, options, locked state).
- [ ] Sanitizers + normalization + draft plumbing for every new `meta.header` field; tolerant of
      unknown keys as the page-meta path already is.

### Acceptance

- Logo letters changeable (and replaceable with an image); title/subtitle/status/nav/entry picker
  each individually styleable from the block inspector.
- A page that never touched these settings renders the exact current header (fallback chain
  verified by parity tests).

### Risk & rollback

Medium-low. All additive with runtime fallbacks. Rollback: revert appliers; saved keys inert.

### Test plan

Header-layout unit tests (logo text/image fallback, per-block style application), CSS-var default
equivalence check in visual tests, sanitizer tests, standard gate + manual on all three series.

---

## Phase 6 — Shell chrome becomes blocks: Account gear & links grid (Size: M)

### Problem

The Account Settings gear (`#userSettingsBtn`) and the 9-dot links button (`#linksGridBtn`) are
fixed chrome at the bottom of the right `<aside>` — they can't be moved, restyled, or placed like
blocks.

### Where

- Module registry: `builder_security.py` (~:12–29) + config sanitizers; renderers:
  `shared-renderers.js` `MODULE_RENDERERS`; picker + panel eligibility: module picker,
  `PANEL_MODULE_TYPES` (a drift-guard test exists and must be updated deliberately).
- Behavior: `reader/user-settings.js` (currently binds by element id) and the links-grid logic;
  shell coordination in `reader/data.js` `applyBuilderPageToDOM`.

### Steps

- [ ] New module types **`account`** and **`links-grid`** with config
      `{ appearance?, iconColor? }` (gear keeps its yellow default): sanitizers, renderers
      (emitting the same gear/9-dot button markup with a stable class), picker entries,
      `PANEL_MODULE_TYPES` additions + drift-guard test update.
- [ ] Refactor `user-settings.js` (and links-grid wiring) from id-bound to **delegated/class-based
      binding** so module-rendered instances anywhere on the page open the same overlays; multiple
      instances are allowed and all open the same overlay.
- [ ] **Shell coordination with zero-change default**: when the rendered page contains an
      `account` module, hide the hardcoded shell button (same for `links-grid`); pages without the
      module keep today's fixed buttons. No migration required.
- [ ] Follow-up note (out of scope here): the remaining hardcoded right/left-panel content (book
      promo, comicnet list, banner) can be recreated with existing `promo` / `html` / `image`
      modules; document the recipe rather than adding module types.

### Acceptance

- The gear can be placed in any panel/column, restyled, and still opens the full Account Settings
  overlay (login, email prefs, delete account) — manually verify login + a settings change.
- A page with no `account` module is pixel- and behavior-identical to today.
- Drift-guard test consciously updated; dropped gear block persists and renders in panels
  (the divider lesson from the incremental plan).

### Risk & rollback

Medium — touches auth-adjacent UI bindings. Keep overlay logic unchanged; only the trigger binding
generalizes. Rollback: remove module types from picker (sanitizers keep configs; renderer keeps
rendering or degrades to hidden), restore id binding.

### Test plan

Renderer tests for both module types (builder + public), panel-eligibility drift-guard, a
user-settings binding test (delegated trigger opens overlay), backend sanitizer tests, standard
gate + manual account-flow QA.

---

## Phase 7 — Theme scope reduction: palette → page background only (Size: M — **last; depends on 3–6**)

### Problem

"Fast Start" presets and the 7-token palette repaint header, panels, reader, and text globally —
the user wants those surfaces controlled only by their own settings, with the global system
reduced to the page background. This must not change how any existing page looks.

### Where

- `theme-editor.js` (presets card ~:60, palette card ~:34), `constants.js`
  (`THEME_PRESETS` ~:40, `THEME_COLORS` ~:30), `draft-manager.js` theme draft (~:154), runtime
  CSS-var application of `page.meta.theme`, `assets/css/variables.css` +
  `main.core.18-page-builder.css` `var(--token, fallback)` chains.

### Steps

- [ ] Remove the **Fast Start presets** card + handlers + `THEME_PRESETS`.
- [ ] Replace the **Palette / Color System** card with a **Page Background** card editing
      `page.meta.pageBackground = { type: solid|gradient|image, color, secondaryColor?, angle?,
image?, fit?, opacity? }` (reuse the appearance background group + image picker), applied to
      the page surface (body / `.pb-page`) in both preview and public mount. Sanitizer included.
- [ ] **Keep applying `page.meta.theme` tokens as CSS vars at load, unchanged** — existing pages
      keep their exact colors. The palette becomes legacy-frozen: still sanitized, persisted, and
      applied; no longer editable in the UI. Do **not** touch the `var(--primary, fallback)`
      chains in CSS.
- [ ] Sweep builder UI copy: element styling lives on the element (panels → Column/Panel
      inspector, reader → reader editor, header → block inspector); the theme tab is only "Page
      Background".
- [ ] Documentation: mark `meta.theme` legacy in `docs/API_REFERENCE.md` /
      `docs/SYSTEM_OVERVIEW.md` where the theme is described.

### Acceptance

- Presets gone; palette inputs gone; Page Background editable (solid/gradient/image) and visible
  on the published page.
- battle-bros, prison planet, and Pyre pages render **pixel-identical** before/after (visual gate
  - manual) since their `meta.theme` still applies.
- Every surface the palette used to drive is stylable through the per-element controls built in
  Phases 0–6 (spot-check one of each: panel, reader button, header block, module).

### Risk & rollback

Medium — the risk is _perceived_ regression (an author expecting palette edits). Mitigated by
sequencing last and by the legacy-frozen application. Rollback: restore the palette card; nothing
about storage changed.

### Test plan

Theme-editor render tests (cards removed/replaced), pageBackground sanitizer + apply tests,
`npm run test:visual` before/after comparison on all three series, standard gate.

---

## Out of scope

- Adopting GrapesJS (or any builder library) as a dependency.
- Rebuilding the header as a real builder section (explicitly rejected 2026-07-05).
- New reader display modes, multi-site/product abstractions (per `docs/ROADMAP.md` exclusions).
- Converting book-promo/comicnet content into new module types (documented recipe instead —
  Phase 6 note).

## How we verify (standard gate, per phase)

1. The phase's targeted tests (listed in each phase) pass.
2. `npm run format:check` and `npm run lint`.
3. `npm test`; `npm run test:backend` when backend files changed.
4. `npm run build`.
5. `npm run test:visual` — mandatory for any phase touching renderers, CSS, or theming.
6. Manual check on a real published page for each series (battle-bros, prison planet, Pyre);
   `docker restart bwondercomics-bwondercomics-api-1` after backend changes; Vite dev on 5173.
7. Phase closeout per `AGENTS.md`: dated completion note in this file with scope summary and
   verification results.
