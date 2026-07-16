# Builder Customization Roadmap

Status: **Finished — Phases 0–7 and the 0.8.5 QA corrective closeout are complete** (updated
2026-07-16). All six corrective contracts are implemented and the authenticated physical-device,
save/reload, and published-page QA is complete. Header glow remains a separately deferred
enhancement and is not a completion gate for this roadmap.
Created: 2026-07-05
Branch context: `builder-incremental-improvement` — roadmap implementation was committed through
`e423f75`; the 0.8.5 corrective implementation followed in `0dadb22`, and final authenticated
manual QA closed on 2026-07-16.

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
the blocks inside them fully customizable from the builder, keep the global theming ("Fast Start"
presets + palette) as defaults that element-level colors override (scope revised 2026-07-07), and
convert remaining hardcoded reader-shell chrome into placeable blocks. All of it without changing
how any existing published page renders (battle-bros, prison planet, Pyre).

Terminology used throughout: a **panel is a column** (official since the consolidation plan — left
panel = reader-section column 0; right panel = last column, exists iff the layout has ≥2 columns).
**Blocks** are modules. This roadmap finishes aligning the UI language with that model.

## Traceability: request → phase

| Request                                                                                              | Phase                                                                         |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| "Section column settings do nothing" (column count, track ratio, gaps, spacing)                      | 0 (verify + fix), 1 (real width control)                                      |
| Panel border color / thickness / roundness / transparency / on-off                                   | 0 (exists since consolidation — verify + add explicit toggle)                 |
| Panel background image + framing                                                                     | 0 (verify), 1 (expose framing on all columns)                                 |
| Panel size vs neighbors; make reader take more/less space                                            | 1                                                                             |
| Section longer; panels shorter than the section                                                      | 0 (alignment), 1 (section min-height)                                         |
| Add another section below with more columns                                                          | Already works (`+ Add Section` insert bars) — confirmed in the Phase 0 matrix |
| Resize blocks and move them more freely                                                              | 2                                                                             |
| Reader controls: text style/color, button shape/size/colors, bar background/transparency             | 3                                                                             |
| Turn the end-of-entry popup on/off (and style it)                                                    | 3                                                                             |
| Header block movement "borderline nonsensical"                                                       | 4                                                                             |
| Secondary color / angle confusion in background settings                                             | 4                                                                             |
| Custom logo letters (not static "BWC"), custom header text                                           | 5                                                                             |
| Entry selector customizable like everything else                                                     | 5                                                                             |
| Gear (Account Settings) button becomes a block instead of fixed right-panel chrome                   | 6                                                                             |
| Palette is defaults only; element color options override it (Fast Start stays — rescoped 2026-07-07) | 7                                                                             |
| Columns-vs-panels naming confusion                                                                   | 0                                                                             |
| Nothing breaks on existing pages                                                                     | Compatibility rules + every phase's gates                                     |

## Confirmed decisions (2026-07-05 session)

| Decision              | Choice                                                                                                                                                                                                                        |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header fix direction  | **Edit in place on the live canvas.** Keep the 5 fixed blocks and the saved `layoutRows` model; retire the abstract placement board. (Header-as-a-real-section was considered and rejected — bigger rewrite, migration risk.) |
| "Gear options button" | The **Account Settings** button — `#userSettingsBtn` (`index.html:392`), the SVG gear at the bottom of the right `<aside>` that opens the account overlay (`reader/user-settings.js`). Becomes a placeable module.            |
| GrapesJS              | **Architecture reference only**, never a dependency (AGENTS.md standing rule).                                                                                                                                                |
| Theme scope           | **Revised 2026-07-07:** Fast Start presets and palette editing stay. The palette provides defaults; any element-level color option overrides it (verified — this already holds by architecture, see Phase 7).                 |

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
- [x] Perform the consolidation plan's Verification list plus the incremental plan Item 3 step 6
      on the Pyre reader page. Authenticated builder, save/reload, and published-page QA completed
      during final closeout on 2026-07-16.
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

### Completed 2026-07-05; final manual QA closed 2026-07-16

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

**Manual QA closeout (2026-07-16):** the authenticated interactive pass was completed on Pyre,
including panel/column controls, save/reload behavior, and the published-page check. This closes
the manual verification originally handed back on 2026-07-05.

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

### Corrective note 2026-07-06 (Size & Alignment card was dead in the editor — fixed)

- User QA found the card "superficial": the render/save/sanitize pipeline was fine, but the
  editor never collected the fields. Two defects in `module-editor.js`:
  1. `bindGenericModuleDraftEvents` listened on `[data-key]/[data-style-key]/[data-source-key]`
     only — `[data-layout-key]` fields had **no listener**, so layout edits on generic modules
     (text/image/spacer/email-signup/feed) only reached the draft when another field changed.
  2. Modules with dedicated editors (promo, social, buttons, gallery, video, divider,
     entry-gallery) never ran the generic collector at all, and some of their normalizers rebuild
     the config from a fixed shape (`normalizeVideoConfig` → `{url}`), so unrelated edits could
     **erase** a saved `config.layout`.
- Fix: layout collection extracted to `collectModuleLayoutFromFields`; the generic binder now
  listens on `[data-layout-key]`; `bindModuleEditorEvents` routes every dedicated-editor commit
  through a layout bridge that re-reads the fields (making the card live for those types and
  layout erasure impossible). The Align select's default option now uses an explicit `stretch`
  sentinel value instead of `""`.
- Tests: layout-only edits update the draft for a generic module (feed) and a dedicated-editor
  module (video); unrelated edits preserve `config.layout` (`tests/admin-page-builder-preview.test.js`).

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
- [x] **Button typography**: extend the shared appearance schema with an optional **text group**
      (font size, weight, transform, color) — reused later by header/entry-selector phases. Wire
      `controls.style.defaults/primary` text tokens to new `--reader-control-font-*` vars consumed
      by `main.core.15-controls.css`.
- [x] **Granular shape/size**: `controls.style.defaults.padding` (+ radius already available via
      border.radius); the compact/medium/large size select stays and provides the padding/font
      fallbacks (the preset rules are now var-driven, so explicit values always win).
- [x] **Custom labels**: `config.controls.labels { prev, next, help, fit, zoomIn, zoomOut,
fullscreen }` (length-capped, sanitized); applied at mount; defaults = current hardcoded
      text so unset pages are unchanged.
- [x] **End-of-entry popup**: `config.endOfEntry = { enabled: true, title?, body?, appearance? }`.
      `showEndOfEntry()` consults the resolved reader shell settings and no-ops when disabled;
      appearance applies to `.entry-end-content`; text fields override the dynamic defaults.
      Builder UI: a "Completion Popup" accordion in the reader editor.

### Completion note 2026-07-08 (typography, padding, labels shipped — phase closed)

- **Shared appearance text group** (used by every appearance editor, not just the reader):
  `text.size` (8–72 px), `text.weight` (400–900 keyword), `text.transform`
  (none/uppercase/lowercase/capitalize) added to `appearance-utils.js` (normalize/merge/
  inline-style emission), the editor field group (`appearance-editor.js`), and
  `sanitize_appearance` (`builder_security.py`). Controlled-props appliers extended so the new
  inline tokens clear correctly (panel shell + controls bar in `reader/data.js`, header
  shell/blocks/logo in `reader/header-layout.js`) — header blocks and the logo got typography
  styling for free.
- **Reader control fonts**: `applyReaderControlAppearanceVars` now emits
  `--reader-control-font-size/-font-weight/-text-transform` (+ primary variants, which fall
  back to the defaults' values); `main.core.15-controls.css` and the page indicator
  (`main.core.16-status-progress.css`) consume them with stock fallbacks. The
  compact/medium/large preset rules are var-driven too, so an explicit font size wins over
  the preset instead of being overridden by its higher-specificity rule.
- **Granular padding**: `controls.style.defaults.padding` (0–48 px, sparse) →
  `--reader-control-padding-x`, consumed by `.btn`/`.btn.primary` at every preset size;
  "Button Padding (px)" input in the reader editor (blank = preset default). Draft plumbing
  preserves it (`removeNullAppearanceBranches` restructured).
- **Custom labels**: `controls.labels { prev, next, help, fit, zoomIn, zoomOut, fullscreen }`
  (≤24 chars, sparse; `_sanitize_reader_controls_labels`), "Button Labels" section in the
  reader editor, applied at mount by `applyReaderControlLabels` (`reader/data.js`) with
  first-run capture of the hardcoded text for restore; `reader/fullscreen.js` restores the
  authored label (via `data-reader-label`) instead of hardcoded "FULL" when exiting
  fullscreen.
- Tests: appearance text-group normalize/emit + junk clamps (`tests/appearance-utils.test.js`),
  labels/padding normalization (`tests/reader-config.test.js`), end-to-end mount apply/restore
  (`tests/reader-data-builder.test.js`), backend typography/padding/labels
  (`backend/tests/test_builder_security.py`); existing exact-shape appearance assertions
  updated for the new text leafs.
- Verified: `npm test` (637 passed, 1 skipped), `npm run test:backend` (123), `npm run lint`,
  `npm run format:check`, `format:py`/`lint:py`, `npm run build`, `npm run test:visual` (20
  passed; one flaky run passed clean on the rerun). API container restarted + live sanitizer
  smoke-checked. Manual check for the user: restyle a button font + rename a label on a live
  page and save/reload.

### Completed 2026-07-05 (typography, labels, and granular padding deferred — since closed above)

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

- [x] Emit per-block edit-mode markers in the header
      (`data-builder-header-block="brand|patron|status|entryControls|nav"`) from
      `header-layout.js`; extend the bridge to collect/measure them and post
      `{ kind:'header-block', blockId }` targets.
- [x] Click a header block in the live canvas → selects it; inspector shows that block's settings
      (placement + per-block settings that exist today; appearance arrives in Phase 5).
- [x] On-canvas **drag between rows/regions** with insertion guides, reusing the strict
      drop-resolution rules (no nearest-snap; invalid pointer position = clean no-op — the
      incremental plan's Item 1 contract). Drops call the existing `moveBlockToPlacement` model
      code and save through the existing header draft.
- [x] Selected-block toolbar arrows (left/right region, up/down row) reusing
      `moveBlockAcrossRegions/Rows`; edges resolve as clean status no-ops (same contract as the
      module step-move arrows).
- [x] Retire the placement board UI once canvas parity is confirmed (same session, after the
      above ships); the saved `layoutRows` schema does not change.
- [x] **Gradient UX fix** in `appearance-editor.js` (benefits every appearance user): show
      Secondary Color + Angle only when Background type = Gradient; relabel "Gradient end color"
      and "Direction (degrees)"; when type = Solid they are hidden, not dead.

### Progress note 2026-07-05 (selection + gradient shipped; drag/arrows/board remain)

- **Gradient UX**: appearance fields gained a `visibleWhen` predicate; "Gradient End Color" and
  "Direction (degrees)" render only when Background type = Gradient, everywhere appearance is
  edited. Hidden values persist (sparse leafs untouched). Three tests updated to the conditional
  contract (`tests/header-appearance.test.js`, `tests/admin-page-builder-shell.test.js`,
  `tests/visual/builder-authoring-workflows.spec.js`).
- **Header block selection on the canvas**: `header-layout.js` marks each placed block with
  `data-builder-header-block` in edit mode; `reader/preview-bridge.js` collects/measures those
  markers and posts HEADER targets carrying `blockId`; `selectCanvasTarget` (`page-builder.js`)
  opens the header editor and highlights + scrolls to that block's placement card
  (`.is-canvas-selected`, `admin/css/page-builder/inspector.css`). Clicking a block in the
  preview now maps 1:1 to its card — the "which card is which" guesswork is gone.
- **Remaining** (unchecked above): on-canvas drag between rows/regions, selected-block toolbar
  arrows, and the board retirement (explicitly contingent on drag parity). The board stays
  until then.
- Verified: `npm test` (618 passed, 1 skipped), `npm run lint`, `npm run format:check`,
  `npm run build`, `npm run test:visual` (21 passed). No backend changes in this slice.

### Completion note 2026-07-06 (drag + arrows shipped, board retired — phase closed)

- **Selected-block toolbar arrows**: selecting a header block on the canvas now shows a toolbar
  with ↑↓←→ + a draggable Move handle. Arrows dispatch the new structural command
  `builder:move-header-block` (`structural-commands.js`, registered in `commands.js`), which
  calls `stepHeaderBlockPlacement` in `page-builder.js` — edge moves come back as clean status
  rejections. Moves mutate the **header draft** (`markDirty('header')`), so they follow the
  normal save/discard lifecycle and preview instantly.
- **On-canvas drag between rows/regions**: in edit mode `header-layout.js` renders all 3×3
  cells (`data-builder-header-cell` + `data-builder-header-row`); the bridge collects/measures
  them as HEADER targets carrying `rowId`/`region`. `resolveLiveDropPlacement` gained a
  dedicated `header-block` source that resolves **only** to a cell containing the pointer (no
  nearest-snap; dead space = clean no-op), producing the new `header-cell` placement. Drops call
  `moveHeaderBlockToCell` → `moveBlockToPlacement` through the header draft. The drop guide is
  the whole cell box (`.pb-preview-drop-guide--header-cell`).
- **Visual parity preserved**: empty rows/cells are `display: none` at rest and revealed only
  while a header drag is active, via new bridge target actions
  `header-drag-start`/`header-drag-end` (`preview-contract.js`) toggling
  `html[data-builder-header-dragging]` inside the iframe. The at-rest edit preview stays
  pixel-identical to the published page (`builder-preview-parity` suite still green).
- **Board retired**: `renderPlacementEditor` + its drag/button handlers are gone from
  `header-editor.js`; the pure placement model (`findBlockPlacement`, `moveBlockToPlacement`,
  `moveBlockAcrossRegions/Rows`) is now exported and canvas-driven. Canvas click-to-select
  highlights the block's **Parts** row (`data-block-id` on `.pb-header-toggle-row`); Parts copy
  points at the on-canvas workflow. Board-only CSS removed from `inspector.css`/`responsive.css`.
  The saved `layoutRows` schema is unchanged; no backend changes.
- Tests: board DOM tests rewritten as model-function tests (`tests/header-appearance.test.js`),
  new bridge cell-collection test, header-cell placement tests
  (`tests/live-drop-placement.test.js`), structural command tests (arrows + drag/drop contract),
  edit-mode cell rendering test, and a rewritten Playwright workflow test that moves a block by
  arrows and by drag onto a revealed empty cell, then saves and checks `layoutRows`.
- Verified: `npm test` (625 passed, 1 skipped), `npm run lint`, `npm run format:check`,
  `npm run build`, `npm run test:visual` (20 passed). Manual QA on a real page (drag feel and
  hidden-block behavior) was completed as part of the 2026-07-16 closeout.

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

- [x] **Brand block content**: `meta.header.brand = { logoText (default "BWC"), logoImage?,
logoAppearance? }` alongside the existing title/subtitle keys (extend, never rename).
      Runtime: `header-layout.js` swaps logo text / renders the image; hardcoded markup stays as
      the fallback for unset pages.
- [x] **Per-block appearance**: `meta.header.blocks[blockId].appearance` (shared schema; the
      Phase-3 text group remains a Phase-3 deferred item — the schema's text color is included)
      applied as controlled inline props on each block wrapper at layout time.
- [x] **Entry selector**: convert `main.core.05-entry-select.css` hardcoded colors/borders to
      CSS vars whose defaults equal the current values (`--entry-select-bg/text/border-*/radius`);
      the `entryControls` block appearance sets those vars (trigger, menu, options).
- [x] Sanitizers + normalization + draft plumbing for every new `meta.header` field; tolerant of
      unknown keys as the page-meta path already is.

### Completion note 2026-07-07 (phase implemented)

- **Brand logo**: `meta.header.brand { logoText (≤24 chars), logoImage (asset path),
logoAppearance }`, normalized sparsely in `header-config.js` (`normalizeHeaderBrand`), edited
  in a new "Logo" inspector card (`header-editor.js`, `.pb-header-brand-input`), applied by
  `applyBrandLogo` in `header-layout.js` (captures the built-in "BWC" letters on first run and
  restores them for unset pages; image path renders `<img class="logo-image">` inside the 50px
  logo box — new rule in `main.core.04-header.css`).
- **Per-block styling**: `meta.header.blocks[blockId].appearance` (shared schema), edited under
  a new "Block Styling" section (one appearance group per block, scopes `block-<id>` +
  `brand-logo` wired into `resolveAppearanceTarget`). Runtime applies via controlled-props
  clear-then-apply on each block element (same discipline as the topbar shell), so scripted
  display toggling is never clobbered and removed styling clears on the next page.
- **Entry picker**: `main.core.05-entry-select.css` chrome converted to
  `--entry-select-bg/text/border-width/border-style/border-color/radius` with defaults equal to
  the previous hardcoded values (pixel parity for untouched pages, verified by the visual
  parity suite). The `entryControls` block appearance is delivered as these vars
  (`applyEntryControlsAppearance`) instead of inline props so the trigger, menu, options, and
  dropdown arrow all pick it up.
- **Backend**: `sanitize_header_meta` gained `brand`, per-block `appearance`, and —
  **corrective** — `layoutRows` persistence (`_sanitize_header_layout_rows`, mirroring the
  client normalizer; regions kept in sync by flattening). layoutRows was previously dropped
  entirely on save, silently collapsing multi-row header placements back to the top row — the
  Phase 4 canvas moves would not have survived a real save/reload without this.
- Tests: backend layoutRows round-trip/junk/legacy-regions + brand + block appearance
  (`backend/tests/test_builder_security.py`); runtime logo swap/fallback + inline block props +
  entry vars + clear-on-next-page; editor brand/block-appearance commits
  (`tests/header-appearance.test.js`).
- Verified: `npm test` (630 passed, 1 skipped), `npm run test:backend` (117), `npm run lint`,
  `npm run format:check`, `npm run format:py`/`lint:py`, `npm run build`, `npm run test:visual`
  (20 passed — parity intact), API container restarted and live sanitizer smoke-checked.
- Deferred: image-picker UI for the logo (path input for now); menu/option hover colors beyond
  the schema slots; the appearance text group (font size/weight) stays with Phase 3.

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

- [x] New module types **`account`** and **`links-grid`** with config
      `{ appearance?, iconColor? }` (gear keeps its yellow default): sanitizers, renderers
      (emitting the same gear/9-dot button markup with a stable class), picker entries,
      `PANEL_MODULE_TYPES` additions + drift-guard test update.
- [x] Refactor `user-settings.js` (and links-grid wiring) from id-bound to **delegated/class-based
      binding** so module-rendered instances anywhere on the page open the same overlays; multiple
      instances are allowed and all open the same overlay.
- [x] **Shell coordination with zero-change default**: when the rendered page contains an
      `account` module, hide the hardcoded shell button (same for `links-grid`); pages without the
      module keep today's fixed buttons. No migration required.
- [x] Follow-up note (out of scope here): the remaining hardcoded right/left-panel content (book
      promo, comicnet list, banner) can be recreated with existing `promo` / `html` / `image`
      modules; document the recipe rather than adding module types. **Recipe**: book promo →
      `promo` module (one item, image + link); comicnet list → `html` module (copy the shell
      markup, swap links); banner art → `image` module or the panel's background-image setting.

### Completion note 2026-07-07 (phase implemented)

- **Module types**: `account` (gear → Account Settings overlay) and `links-grid` (9-dot →
  right-panel links view) registered end to end — descriptors + picker entries
  (`module-descriptors.js`, category "special"), shared renderers emitting the shell markup
  with module-scoped classes `pb-account-btn` / `pb-links-grid-btn` (`shared-renderers.js`;
  the shell classes are absolutely positioned, so the module CSS in
  `main.core.18-page-builder.css` replicates the 44px look statically), `PANEL_MODULE_TYPES`
  additions (drift-guard consciously satisfied), backend sanitizer branches
  (`iconColor` color + sparse `appearance` via the shared schema).
- **Behavior binding**: `user-settings.js` now binds triggers by class delegation
  (`.user-settings-btn, .pb-account-btn`) with the overlay as the only hard requirement;
  `feed-panel.js` likewise delegates `.links-grid-btn, .pb-links-grid-btn`. Every instance
  opens the same overlay / links view; builder previews stay inert (`builderPreview` early
  return unchanged).
- **Shell coordination**: `syncShellChromeModules` in `reader/data.js` hides the fixed
  `#userSettingsBtn` / `#linksGridBtn` (inline display, which also beats the feed-mode CSS)
  when the rendered page places the matching module, and restores them on pages without it —
  zero-change default, no migration.
- **Editor**: both types get a structured settings card (behavior copy + Icon Color) through
  the generic draft binder, the shared Size & Alignment card, and a raw-config card for the
  optional `appearance` key (a structured appearance UI remains the Phase 2 deferred item).
- Tests: renderer parity (classes, icon color, appearance style, 9 dots), panel render +
  shell-button hide/restore (`tests/reader-data-builder.test.js`), delegated overlay open
  without the shell button (`tests/reader-user-settings.test.js`, new), module links-grid
  click exits feed mode (`tests/reader-feed-panel.test.js`), backend registration/round-trip
  (`backend/tests/test_builder_security.py`).
- Verified: `npm test` (633 passed, 1 skipped), `npm run test:backend` (120), `npm run lint`,
  `npm run format:check`, `format:py`/`lint:py`, `npm run build`, `npm run test:visual` (20
  passed; one flaky parity run passed on retry), API container restarted + live sanitizer
  smoke-checked. The live account-flow check through the module-rendered gear was completed as
  part of the 2026-07-16 manual QA closeout.

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

## Phase 7 — Palette precedence: element colors override the theme (Size: S — reduced scope 2026-07-07)

### Scope change (2026-07-07 session)

The original phase removed Fast Start and reduced the palette to a page-background control. The
user revised this: **keep Fast Start and palette editing exactly as they are** — the requirement
is only that any individual module/element color option overrides the palette.

**Verified 2026-07-07: this precedence already holds by architecture.** `applyPageTheme`
(`reader/data.js` ~:405) writes `page.meta.theme` as CSS variables on the document root; the
stylesheets consume them as _defaults_ (`var(--token, fallback)` chains). Every per-element color
control built in Phases 0–6 applies as inline styles or inline CSS vars **on the element**
(panel/column appearance, section/column backgrounds, header shell + per-block styling, logo box,
entry-picker vars, reader-control vars, module style systems, gear/links icon color), and inline
styles always beat stylesheet var lookups. No color rule uses `!important`. So: palette = defaults,
customized elements win, later palette edits only repaint uncustomized surfaces.

### Problem (remaining)

The precedence contract is implicit — nothing guards it, and a few surfaces still have **no
individual color control**, so the palette is their only knob: the title `h1` gradient text
(`main.core.04-header.css` ~:318), the COVERS button (hardcoded cyan, not even palette —
`main.core.05-entry-select.css` `.entry-covers-btn`), the status cursor, and reader-button
typography (the Phase 3 deferred item).

### Steps

- [x] **Precedence regression test**: apply a page theme (e.g. `primary`) and an element-level
      color to the same surface (a panel border or the entry picker), assert the element value
      wins in the rendered DOM and survives a theme change (extend
      `tests/reader-data-builder.test.js` theme tests).
- [x] **Builder copy note**: one line in the theme tab ("Palette colors are defaults — anything
      styled on an element keeps its own colors."), so authors understand why a preset doesn't
      repaint customized elements.
- [x] Fold the **no-control surfaces** into the deferred backlog rather than this phase: title
      gradient styling and COVERS button color (candidates for the Phase 5 brand/entry-picker
      editors), reader-button typography (already tracked as the Phase 3 deferred item).

### Completion note 2026-07-07 (phase implemented — all roadmap phases closed)

- **Precedence regression test** ("keeps element-level colors over the palette across theme
  changes", `tests/reader-data-builder.test.js`): themes `--primary` on the document root,
  styles the entry picker's border at the element level, asserts the inline element value wins
  and survives a palette change while an uncustomized block (status) keeps following the
  palette. Fails if palette application ever clobbers element colors (inline theme writes on
  elements, `!important` color rules).
- **Theme tab copy**: the Palette / Color System card now states the contract — palette colors
  are defaults; anything styled directly on an element keeps its own colors
  (`theme-editor.js`). Fast Start presets and palette editing unchanged.
- **Deferred backlog** (palette-only surfaces, candidates for future slices): title `h1`
  gradient styling (brand editor), COVERS button color (entry-picker editor — hardcoded cyan
  today, not even palette-driven), reader-button typography (Phase 3 deferred).
- Verified: `npm test` (634 passed, 1 skipped), `npm run lint`, `npm run format:check`,
  `npm run build`, `npm run test:visual` (20 passed). No backend changes.

### Acceptance

- The regression test fails if any future change makes palette application clobber an
  element-level color (e.g. someone applies theme tokens as inline element styles or adds
  `!important` color rules).
- Fast Start presets and the palette editor keep working unchanged.

### Risk & rollback

Low — test + copy only; no behavior changes. Rollback: remove the test/copy.

### Test plan

The new precedence regression test, `npm test`, standard gate (no visual-suite impact expected).

---

## 0.8.5 QA corrective closeout (completed 2026-07-16)

Authenticated QA on Pyre found six corrective bugs/UX contract gaps. They were release-blocking
corrections to the completed roadmap, not new product directions. All six are implemented and
verified in the builder and public page.

### Required corrections

- [x] **Panel Hidden hides the panel shell.** Effective reader-panel visibility applies to the
      owning `<aside>` and collapses its layout space. The builder/layers path remains available
      so the panel can be selected and restored.
- [x] **Reader-column border styles the reader frame.** The Comic Reader module's owning-column
      border applies to the outer viewport. An authored border suppresses the stock page-frame
      border; clearing it restores `stage.frameBorder`. Column text/background do not style the
      reader stage.
- [x] **Column/Panel padding inputs stay readable.** Top, Right, Bottom, and Left use labelled
      two-column number inputs that preserve keyboard entry, bounds, and accessible names.
- [x] **Reader controls support sparse Tablet/Phone appearance and padding.** Device branches
      retain only `hidden` and the supported control-bar/default/primary appearance and button
      padding. Editor, client normalization, backend sanitation, preview merge, save response,
      page refetch, and public output must agree.
- [x] **Feed wrapper layout works per device and publicly.** Tablet/Phone branches may override
      Feed width, max width, height, and alignment without changing the Desktop/global fallback.
- [x] **Arrow moves and publication actions have explicit persistence.** Popup-arrow module moves
      remain in a page-wide structure draft until Save; Discard restores the captured placement
      set. The atomic placements endpoint validates the full page before updating. **Save Page**
      preserves publication state; only Publish or confirmed Unpublish changes visibility.

### Implemented responsive contract

- One fixed builder preview exists per authoring scope: Desktop `1920×1080`, Tablet `768×1024`,
  and Phone `375×812`. Selecting a preview chooses the matching sparse JSON branch; preview size
  is not saved page data.
- Public portrait/stacked layout uses the Phone branch at widths `<=480px` and Tablet otherwise.
  Viewports wider than the original `7/5` aspect-ratio boundary return to Desktop layout, including
  phones and tablets rotated to landscape.
- Portrait Tablet/Phone readers use stable width containment and do not enter the circular dynamic
  frame calculation. Landscape/Desktop keeps the established bounded-parent dynamic sizing.
- Public Section, Column, Panel, Spacer, Feed, reader-control, and reader-stage overrides share the
  same ratio-banded media contract. The fixed preview dimensions naturally select the matching
  band; public pages switch bands on resize or orientation without a second JavaScript classifier.
- Authenticated `GET /api/admin/page-builder/runtime` reports the responsive contract version,
  process start time, and capabilities with `Cache-Control: no-store`. The builder blocks module
  saves against an incompatible API while preserving the dirty draft.
- After a module PUT, the builder compares the allowed responsive branch returned by the API with
  the branch it sent. A dropped or changed branch remains dirty and surfaces an incompatibility
  error instead of reporting a successful save.
- Public page API responses use `Cache-Control: no-store`; `/admin/*` revalidates through Caddy so
  an old admin script or backend process cannot silently masquerade as the current contract.

### Deferred enhancement (not a roadmap completion gate)

- **Header glow authoring:** a future small header-specific control for top-bar and individual
  block glow, using controlled CSS variables and the stock glow as the unset default. Preserve
  keyboard focus indication; do not expand this into a generic arbitrary-shadow editor. This did
  not ship in this roadmap and does not hold its completed status open.

### Verification and closeout

- Automated coverage must include panel-shell collapse, reader border precedence/restoration,
  narrow padding controls, distinct saved Desktop/Tablet/Phone Spacer/Feed/reader values, public
  computed styles, structure Save/Discard, atomic placement rollback, and publication-state
  preservation.
- Run `npm run format:check`, `npm run lint`, `npm test`, `npm run format:py:check`,
  `npm run lint:py`, `npm run test:backend`, `npm run build`, and `npm run test:visual` on the final
  tree. Record only the final results here; superseded intermediate builds are not release proof.
- Rebuild the public bundle, restart the API after Python contract changes, and reload Caddy only
  when its configuration changed. Verify the authenticated runtime contract belongs to that same
  deployment generation.
- On physical Phone and Tablet hardware, save distinct responsive values, reload the builder, and
  verify the published Pyre page in portrait. Rotate each device and confirm it returns to Desktop
  layout. Navigate multiple comic pages and scroll for at least five seconds; the reader must fit
  the screen without progressive shrinkage or size changes caused by browser chrome.
- Verify panel hide/unhide, reader border, arrow Save/Discard, Save Page, and Publish/Unpublish on
  Pyre. Close each checkbox only after its corresponding manual check passes, then refresh
  `docs/ROADMAP_TO_1.0.md` §2.1 before the version bump and merge. Header glow is deferred above
  and is not part of this closeout gate.

Automated verification on 2026-07-14: `npm run lint`, `npm test` (657 passed, 1 skipped),
`npm run format:py:check`, `npm run lint:py`, `npm run test:backend` (125 passed), `npm run build`,
and `npm run test:visual` (21 passed). `npm run format:check` checks every task file clean but remains
blocked by the pre-existing untracked `docs/POLISH_BACKLOG_PLAN.md`, which this pass did not edit.
Final manual closeout on 2026-07-16 completed the authenticated Pyre save/reload and published-page
checks, panel hide/unhide, reader border, arrow Save/Discard, Save Page, Publish/Unpublish, and the
Phone/Tablet responsive and rotation checks. All required corrective and QA gates in this roadmap
are closed.

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
