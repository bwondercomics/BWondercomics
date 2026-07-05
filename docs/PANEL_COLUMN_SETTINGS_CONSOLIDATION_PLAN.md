# Panel / Column Settings Consolidation Plan

Status: Phase 1 implemented (2026-06-28); Phase 2 implemented (2026-06-30, not
independently shippable until Phase 3 retires the old Theme-editor panel controls);
Phase 3 implemented (2026-07-04, release-gated by migration before authors edit migrated panel
settings); Phase 4 implemented (2026-07-05). Planning complete (review findings incorporated).
Release gates closed 2026-07-05: both migrations run with `--write` for `battle-bros`,
`prisonplanet`, and `02` (0 flagged; DB backed up to `var/backups/db-20260705-143558.sql`) and the
API container restarted — see Phase 0 of `docs/BUILDER_CUSTOMIZATION_ROADMAP.md`, which also
implemented the deferred panel-alignment (`align-self`) follow-up. Interactive builder QA on a
Pyre reader page remains pending.
Created: 2026-06-26

> Second-pass review (2026-06-28) added four corrections, folded into the phases below. To avoid
> collision with the original "Review Findings Addressed" numbering, they are tagged
> **[2nd-pass]** inline: alignment-on-panels (Phase 1), Phase 2/3 shippability + migration entrypoint
> (Phase 2), and the Phase 3/4 ordering of `panels.*` removal (Phases 3–4).

## Review Findings Addressed

A review pass surfaced five gaps in the first draft; each is now folded into the phases below:

1. **Backend rehomes on shrink (High).** `update_section` ([backend/app/page_store.py:824](../backend/app/page_store.py))
   atomically rehomes orphaned modules when the column count drops, asserted by
   [test_page_builder_routes.py:1631](../backend/tests/test_page_builder_routes.py). A client-only block
   is bypassable → **Phase 2 pulled the backend-authority guard forward from Phase 4**
   (reject the shrink) and updates that test.
2. **Second runtime panel-hide (High).** `applyReaderModuleShellSettings` ([reader/data.js:646](../reader/data.js))
   hides `#leftPanel` / `#rightPanel` from reader-module `panels.*` (gated by `hasExplicitPanels`),
   independent of `section.settings.panelEnabled` → **Phase 4 now removes both runtime paths and the
   `normalizeReaderConfig` panel emission together, in a safe order**, with config migration.
3. **Migration had no write path (Medium).** Page meta and section settings save through different drafts/
   endpoints (`saveActiveThemeDraft`→`updatePage` vs `saveSectionSettings`→`updateSection`) → **Phase 2 now
   specifies a concrete backend data migration** (recommended) plus the read-time fallback.
4. **Public responsive parity (Medium).** `columnDeclarations` ([responsive-css.js:59](../admin/page-builder/responsive-css.js))
   already emits public `@media` per-column CSS for normal columns; panels bypass it → **Phase 2 now reuses
   that emission for panel wrappers** so published panels match the builder preview.
5. **Empty panels bypass the wrapper (Medium).** `renderPanelStack` returns at the `isEmptyPanel` branch
   ([reader/data.js:1196](../reader/data.js)) before the module path → **Phase 1 now styles the empty-panel
   wrapper too**, with empty public + builder tests.

## Purpose

The page-builder **column settings menu** (appearance, border, padding, alignment, min-height,
visibility) is effectively **inert** for the reader's side panels: editing it changes neither the
live preview nor the published page. The settings save correctly into `section.settings.columns[i]`,
but the surface the user actually edits — the reader's left/right panels — renders through a separate
path that never applies them.

Beyond that bug, panel-related settings are **scattered across three unrelated menus**. This plan
consolidates every panel/column setting into **one menu reached by clicking the column/panel**, moves
the panel background + spacing onto the **column** data model, drives panel **existence from the
section ratio**, and **decouples panels from the reader module's config** while **keeping the fixed
`<aside>` chrome** (a data-driven change, not a shell rewrite).

This is a builder UI + renderer + data-model plan. It touches saved `section.settings.columns`
records (additively) and retires `page.meta.panelBackgrounds` / `page.meta.panelSpacing` and the
reader-module panel toggles in favor of column data, with a read-time fallback so existing pages keep
working.

## Confirmed Decisions

| Decision                                                     | Choice                                                                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Scope                                                        | **Full consolidation** — rendering fix + unified menu + relocate background/spacing + ratio-driven existence |
| Where panel background + spacing live                        | **On the column** (`section.settings.columns[i]`), legacy `page.meta` kept as read-time fallback             |
| "Decouple from reader"                                       | **Keep the fixed `<aside>` chrome; drive everything from column data** (not an in-place column-grid rewrite) |
| Lowering the column ratio with content in the removed column | **Block** the reduction until the column is cleared (no silent reflow)                                       |

## Current Source Of Truth

Render paths:

- `admin/page-builder/shared-renderers.js:486` `buildColumnInlineStyle()` — turns a column's
  `appearance`/`padding`/`alignment`/`minHeight` into an inline style string.
- `admin/page-builder/shared-renderers.js:517` `renderSection()` — wraps each column's modules in
  `<div class="pb-column" …style>` (line 576). **Normal columns work; panels do not go through here.**
- `admin/page-builder/shared-renderers.js:633` — `createRenderers()` return (does **not** currently
  expose `buildColumnInlineStyle`).
- `reader/data.js:1137` `renderPanelStack()` — injects panel modules into `#leftPanel` / `#rightPanel`.
  Public mode (`:1218`) renders bare modules (`modules.map(({ module }) => renderModule(module))`);
  builder mode calls `renderPanelBuilderEditingStack()` (`:917`) → `renderPanelColumnWrapper()`
  (`:889`), which emits `.pb-builder-panel-column` with **drop markers only, no appearance**.
- `reader/data.js:421` `applyPanelBackgrounds()` — sets `--panel-bg-*` CSS vars on the `<aside>` from
  `page.meta.panelBackgrounds`.
- `reader/data.js:1053` `findPanelModules()` — left = column 0, right = last column (right exists only
  when layout has ≥2 columns).
- `reader/data.js:1196` `renderPanelStack()` **empty-panel early return** — renders empty text (or an
  edit-mode droppable marker) and returns _before_ the module-wrapping path, so empty panels get no
  styled wrapper today.

Runtime panel visibility — **two independent paths**:

- `reader/data.js:1107`–`1126` — hides `#leftPanel`/`#rightPanel` from `section.settings.panelEnabled`.
- `reader/data.js:577` `applyReaderModuleShellSettings()` — _also_ hides the panels from the reader
  module's `panels.{left,right}.enabled` (`:646`–`649`), gated by `hasExplicitPanels`
  (`:573`); config normalized by `getReaderRuntimeConfig`/`normalizeReaderConfig` (`reader-config.js:71`),
  which **always emits `settings.panels`**.

Backend authority (sections / layout):

- `backend/app/page_store.py:804` `update_section()` — on column-count shrink (`:824`) **atomically
  rehomes** orphaned modules to the last surviving column; `sanitize_section_settings` (`:847`) is where
  server-side column sanitization for new fields must be added.
- `backend/tests/test_page_builder_routes.py:1631` asserts the current rehome-on-shrink behavior (this
  test must change if shrink becomes a rejection).

Save paths (note: page meta and section settings are **separate drafts + endpoints**):

- `admin/page-builder/draft-manager.js:93` `initializeSectionDraft()` clones only section settings +
  layout; `:155` `saveActiveThemeDraft()` writes `page.meta.panelBackgrounds/panelSpacing` via
  `updatePage`; `admin/page-builder.js:2157` `saveSectionSettings()` writes via `updateSection`.

Public responsive CSS (already exists for normal columns, bypassed by panels):

- `admin/page-builder/responsive-css.js:59` `columnDeclarations()` + `:86` `sectionHasResponsiveOverrides()`;
  emitted by `renderSection()` at `shared-renderers.js:588` (`buildSectionResponsiveCss`, scoped via
  `data-pb-section` + a `<style>` block).

Column settings resolution / sanitize:

- `admin/page-builder/responsive-overrides.js:143` `getEffectiveColumnSettings(section, columnIndex, opts)`
  and `:132` `COLUMN_RESPONSIVE_FIELDS`.
- `admin/page-builder.js:1980` `cleanupSectionColumnEntry()`, `:1864` `buildSectionSettingsFromDraft()`,
  `:2076` `updateActiveSectionColumnField()`.

Scattered settings UIs:

- `admin/page-builder/theme-editor.js:55` `renderThemeEditorContent()` → `:78` `renderPanelSurfaceCard()`
  (background art) and `:107` `renderPanelSpacingCard()` (module gap); handlers `:252`–`347`.
- `admin/page-builder/reader-editor.js:174` `renderVisibilityControls()` panel on/off toggles;
  `reader-config.js:71` panel normalization.
- `admin/page-builder/editor-panel.js:167` `renderColumnEditorContent()` (the column editor to extend),
  `:112` `renderSectionLayoutEditor()` (ratio/column-count), `:250` `renderSectionSettingsContent()`.

Selection plumbing:

- `admin/page-builder.js:100`-`111` selection state; `:2294` `selectCanvasTarget()` (already accepts
  `kind:'column'` but collapses to `selectSectionFromCanvas`); `:471` `selectColumn` alias.
- `admin/page-builder/canvas-events.js:174` module-click → `actions.selectModule()`.
- `admin/page-builder/preview-manager.js:726` preview → `actions.selectCanvasTarget(message.target)`.
- Edit-mode markers already emitted: `data-builder-section-id`, `data-builder-column-index`
  (`shared-renderers.js:569`), `data-builder-surface="left-panel"/"right-panel"` (`reader/data.js:1174`).

Shell + CSS:

- `index.html:150` `.viewerWrap` → `<aside id="leftPanel">` (`:153`) | `<div id="mainContent">` (`:210`)
  | `<aside id="rightPanel">` (`:306`).
- `assets/css/main.core.08-viewer-layout.css:2` `.viewerWrap` (flex row).
- `assets/css/main.core.09-side-panels.css:2` `.side-panel` (+ `--panel-bg-*` vars `:19`, `::after`
  art `:52`); `:82`–`:105` `.panel-builder` / `.pb-builder-panel-*` flex+gap.
- `assets/css/main.core.18-page-builder.css:104` `.pb-column`, `:121` empty panel-column min-height.

Reusable building blocks:

- `admin/page-builder/inspector-sections.js:3` `renderInspectorSection()` (collapsible accordion).
- `admin/page-builder/appearance-utils.js` `appearanceToInlineStyle` / `normalizeAppearance` /
  `mergeAppearance`.
- `openImagePicker()` (used by theme-editor background picker).
- Backend module rehoming on layout change: `admin/page-builder/canvas-mutations.js:296`
  `changeSectionLayout()`, `admin/page-builder.js:1898` `syncSectionModulesFromUpdate()`.

Tests:

- `tests/shared-renderers-parity.test.js:513`–`767` (column appearance parity on `.pb-column`).
- `tests/appearance-utils.test.js` (appearance normalization + inline style).
- `tests/reader-data-builder.test.js` (panel rendering via `applyBuilderPageToDOM`).

## Problem Statement (Observed)

Editing any column setting (border color, padding, alignment, min-height, visibility, background) for
a reader-section column produces **no visible change** in the live preview or the saved page. The
whole column menu feels dead. Separately, panel settings are split across the Page Theme editor
(backgrounds + spacing), the Reader module editor (on/off), and Section Settings (column appearance),
with no single place to edit a panel.

## Root Cause Analysis

1. **Reader-section columns are the side panels, and the panel render path drops column styling.**
   `renderSection()` applies `buildColumnInlineStyle()` to `.pb-column`, but reader panels are
   rendered by `renderPanelStack()`, which emits modules with no styled column wrapper (public) or a
   marker-only `.pb-builder-panel-column` (builder). So the data exists but never reaches the surface.
2. **Panel concerns are spread across three data locations / three menus** (`page.meta.*`; reader-module
   `config.panels.*`, which drives a runtime hide in `applyReaderModuleShellSettings` _and_ exists
   alongside a second `section.settings.panelEnabled` hide; and `section.settings.columns[i]`), so there
   is no coherent "edit this panel" affordance and two independent mechanisms can hide a panel.
3. **Columns/panels are not independently selectable** — clicking a "column" target collapses to
   selecting its parent section (`selectCanvasTarget` `kind:'column'` branch), so there is no menu
   scoped to a single column/panel.

## Target Architecture

- A **panel is a column.** Left = reader-section column 0; right = last column (exists iff ≥2 columns).
- **All panel settings live on the column** (`section.settings.columns[i]`): existing
  `appearance`/`padding`/`alignment`/`minHeight`/`hidden` **plus new** `panelBackground` and `panelGap`.
- **One column-styling path:** panel content is wrapped in a styled column produced by the **same**
  `buildColumnInlineStyle`; the `<aside>` background art reads the column's `panelBackground` (legacy
  `page.meta` fallback).
- **One inspector:** clicking a column or panel selects that exact column and opens a unified
  Column/Panel menu containing every setting.
- **Ratio is the single existence control:** `<aside>` visibility follows column count; the
  reader-module toggles and `section.settings.panelEnabled` are removed. Reducing the column count is
  blocked while the doomed column still has modules.

## Data Model Changes

Extend `section.settings.columns[i]`:

```js
{
  index, appearance, padding, alignment, minHeight, hidden, responsive, // existing
  panelBackground: { path, fit, focus, opacity, hideEmptyText },        // NEW ← page.meta.panelBackgrounds[side]
  panelGap: number,                                                     // NEW ← page.meta.panelSpacing[side]
}
```

- Sanitize/prune the new fields in `cleanupSectionColumnEntry` (`admin/page-builder.js:1980`) and
  `buildSectionSettingsFromDraft` (`:1864`); mirror in any server-side column sanitizer.
- Settings persist opaquely through the existing `updateSection` path — **no DB schema change
  expected.**
- Keep `panelBackground` / `panelGap` **non-responsive** for now (future: add to
  `COLUMN_RESPONSIVE_FIELDS`).

---

## Phase 1 — Panel columns honor existing column settings (rendering foundation)

Goal: **appearance (background/border), padding, min-height, and visibility (`hidden`)** from
`section.settings.columns[i]` render on the side panels in **both** the live builder preview and the
published page. **This phase fixes the bulk of the "inert settings" complaint.** **[2nd-pass]
Alignment is excluded** — see the alignment note below.

- [x] Lift `buildColumnInlineStyle` (`shared-renderers.js:486`) to module scope and `export` it (it
      already uses only module-level deps). Leave `renderSection`'s call unchanged. **[2nd-pass]** Added
      a backwards-compatible `includeAlignment = true` option that gates the `justify-self` token; also
      exported `EDITOR_EMPTY_COLUMN_MIN_HEIGHT`.
- [x] In `reader/data.js`, resolve panel column settings with
      `getEffectiveColumnSettings(section, columnIndex, { builderEditing, deviceId })` and build the
      inline style with the exported `buildColumnInlineStyle(colSettings, { includeAlignment: false })`;
      apply `pb-column--hidden` when `colSettings.hidden`.
- [x] Unify the public and builder panel paths: group panel modules by `${sectionId}:${columnIndex}`
      (folded the old `renderPanelBuilderEditingStack` grouping into a shared `renderPanelColumnStack`)
      and wrap each group via a `builderEditing`-aware `renderPanelColumnWrapper`. Builder mode keeps
      markers on `.pb-builder-panel-column`; public mode emits the marker-free `.pb-panel-column`.
- [x] **Style the empty-panel path too** (orig. finding #5). The `isEmptyPanel` early return
      (`reader/data.js`) runs before the module path, so it independently emits the styled column
      wrapper: resolve the panel column settings (via the `section` now threaded onto `buildPanelColumn`)
      and wrap the empty-state content (the droppable edit-mode marker _and_ the public empty text) so a
      panel's border/`minHeight` show even with no modules. Empty builder wrappers floor to the
      `EDITOR_EMPTY_COLUMN_MIN_HEIGHT` affordance; public empties use `minHeightFloor: 0` (no phantom
      geometry unless authored). **[2nd-pass follow-up]** The public empty wrapper is additionally guarded
      by explicit panel ownership, so a one-column reader section does **not** leak column 0 styling into
      the empty right panel before that panel exists structurally.
- [x] CSS: extended the `.panel-builder .pb-builder-panel-section, .panel-builder .pb-builder-panel-column`
      rule (`main.core.09-side-panels.css`) to include `.pb-panel-column` so flex + gap (and thus
      inter-module spacing) are preserved on the public wrapper.
- [x] Tests (`tests/reader-data-builder.test.js`): assert the panel column wrapper carries the expected
      inline tokens (background/border/padding-\*/min-height) and `pb-column--hidden`, in
      `builderEditing: true` and public modes, **and for empty panels in both modes**; plus an
      export-contract + `includeAlignment` test in `tests/shared-renderers-parity.test.js`. **[2nd-pass
      follow-up]** Added a one-column public right-panel regression that asserts column 0 styling does not
      leak into the empty right panel.

Reuse: `buildColumnInlineStyle`, `getEffectiveColumnSettings`, `appearanceToInlineStyle`.

Note (responsive): this phase applies the **base/desktop** column settings inline. Device-specific
overrides on the _published_ panel are handled in Phase 2 (orig. finding #4); the builder preview
already JS-merges the active device branch via `getEffectiveColumnSettings`.

Note **[2nd-pass]** (alignment): `buildColumnInlineStyle` emits `justify-self`, a **CSS Grid** property
that works for `.pb-column` (grid tracks) but is **ignored on the flex-based panel wrapper**
(`.side-panel .panel-builder` is `display:flex`). Phase 1 therefore **excludes alignment** from panels
(`includeAlignment: false`); the column alignment control alone stays inert for panels until a
follow-up designs a flex semantic (likely `align-self`, which also changes column width). All other
column settings are live now.

## Phase 2 — Move panel background + spacing onto the column (data + render)

Goal: panel art and module spacing come from the column, not `page.meta`.

> **[2nd-pass] Shippability:** Phase 2 moved render/data authority to the column, but the old Page
> Theme panel controls intentionally stayed live until Phase 3 — they rendered
> `page.meta.panelBackgrounds`/`panelSpacing` (`theme-editor.js:55`) and `saveActiveThemeDraft` still
> wrote them to `page.meta` (`draft-manager.js:155`). Phase 3 retired those controls; if Phase 2 is
> ever isolated from Phase 3, those controls would reintroduce legacy meta and look inert against the
> column-first runtime. Treat Phase 2 + Phase 3 as a single non-separable release.

- [x] Add `panelBackground` + `panelGap` to the column schema, with sanitize/prune + draft plumbing
      (see Data Model Changes).
- [x] Replace `applyPanelBackgrounds(page)` (`reader/data.js:421`) with a read of the reader section's
      column `panelBackground` (col 0 → `#leftPanel`, last col → `#rightPanel`), setting the existing
      `--panel-bg-image/size/position/opacity` vars. **Fallback** to `page.meta.panelBackgrounds[side]`.
- [x] In `renderPanelStack` (`:1183`), source `--pb-panel-gap` from the column's `panelGap` (fallback
      `page.meta.panelSpacing[side]`).
- [x] Move `hideEmptyText` to `panelBackground.hideEmptyText` (`:1211`), same fallback.
- [x] **Public responsive parity (finding #4):** emit scoped `@media` CSS for panel columns by reusing
      `columnDeclarations()` (`responsive-css.js:59`). When `renderPanelStack` runs in public mode and the
      reader section has column responsive overrides (`sectionHasResponsiveOverrides`), emit a scoped
      `<style>` block (mirroring `buildSectionResponsiveCss` at `shared-renderers.js:588`) keyed to the
      panel wrapper, so device-specific hidden/padding/min-height match the builder preview on the
      published page. (Factor the section's `<style>` emission so the panel path can share it.)
- [x] **Migration (finding #3) — concrete write path.** Page meta (`saveActiveThemeDraft`→`updatePage`)
      and section columns (`saveSectionSettings`→`updateSection`) are separate drafts/endpoints, so there
      is no single client save that sees both. Recommended: a **one-time backend data migration** that, per
      page, reads `page.meta.panelBackgrounds/panelSpacing`, writes them into the reader section's
      `columns[0].panelBackground`/`panelGap` (left) and `columns[last]` (right), and clears the page-meta
      keys — in `backend/app/page_store.py` alongside `sanitize_section_settings`, covered by a backend
      migration test. The read-time fallback (above) covers any page not yet migrated. (Alternative if a
      backend migration is undesirable: a client one-shot on builder load that issues both `updateSection`
      and `updatePage` — more moving parts, two round-trips.)
      **[2nd-pass] Entrypoint:** `page_store.py` only handles request-time section updates
      (`update_section:804`), so it is **not** a migration entrypoint on its own. Ship the migration as an
      idempotent standalone script (mirroring `backend/app/backfill_page_headers.py`) or an Alembic data
      migration, with explicit **dry-run** and **write** modes, and test that entrypoint directly (not
      just the per-section sanitizer).
- [x] Tests: background/gap render from column settings; fallback to `page.meta` when the column is
      absent; backend migration copies legacy meta into the reader-section columns and clears the meta keys.

Completion note (2026-06-30): Phase 2 landed the column-level `panelBackground` / `panelGap`
contract, runtime column-first reads with legacy `page.meta` fallback, public panel responsive CSS,
and an idempotent dry-run/write migration script. The destructive-shrink guard from Phase 4 was
pulled forward into this phase so right-panel column data cannot be silently discarded. Do **not**
ship/run the migration standalone before Phase 3; the old Theme-editor panel controls still write
`page.meta` and must be retired in the same release.

## Phase 3 — Unified click-to-edit Column/Panel inspector; retire scattered UIs

Goal: click a column or panel → one menu with everything.

- [x] Add `selectedColumn` state ({ sectionId, columnIndex }) (`admin/page-builder.js:100`). Change the
      `kind === 'column'` branch of `selectCanvasTarget` (`:2294`) to a new
      `selectColumnFromCanvas(sectionId, columnIndex)`; repoint the `selectColumn` alias (`:471`).
- [x] Emit a `{ kind:'column', sectionId, columnIndex }` target on click of a `.pb-column` (canvas) or
      a panel surface, reusing the existing selection channel (`canvas-events.js:174`,
      `preview-manager.js:726`) and the already-emitted markers.
- [x] Promote `renderColumnEditorContent` (`editor-panel.js:167`) into the column inspector for the
      selected column, using `renderInspectorSection` (`inspector-sections.js:3`). Add the **relocated**
      background-art + module-spacing controls (moved from `theme-editor.js` `renderPanelSurfaceCard`
      `:78` / `renderPanelSpacingCard` `:107`), reusing `openImagePicker`. Show panel-specific fields
      when the selected column maps to a panel (col 0 or last col of the reader section).
- [x] Remove the scattered **UIs only**: delete panel cards from `renderThemeEditorContent`
      (`theme-editor.js:55`) + handlers (`:252`–`347`); delete panel toggles from
      `renderVisibilityControls` (`reader-editor.js:174`).
      **[2nd-pass] Do NOT delete `panels.*` normalization (`reader-config.js:71`) in this phase** —
      `reader/data.js:646` still dereferences `settings.panels.left/right.enabled` until Phase 4 removes
      both runtime readers. Keep the tolerant normalization/emission here; the config emission is deleted
      in Phase 4 (line ~299), **after** all consumers are neutralized. Removing the producer before the
      consumers breaks the reader shell.
- [x] Tests: clicking a column/panel selects it and renders the unified inspector; editing each control
      (incl. moved bg/spacing) writes the column and updates the rendered panel; theme/reader editors no
      longer render panel controls.

Completion note (2026-07-04): Phase 3 landed unified canvas/layer selection for columns and reader
panels, a draft-backed Column/Panel inspector with relocated Panel Surface controls, module-to-parent
column escalation, and removal of the retired Theme/Reader panel UIs. Column-owned
`panelBackground`/`panelGap` fields are editable from the inspector. Legacy-only
`page.meta.panelBackgrounds` / `page.meta.panelSpacing` values are display-only fallback marked with
`data-panel-legacy-fallback="true"` and disabled because section save cannot safely clear page meta.
Before authors edit migrated panel settings in a release, run
`python -m backend.app.migrate_panel_settings_to_columns --series <id> --write` for each target
series. Verification: `npm test -- tests/admin-page-builder-shell.test.js
tests/admin-page-builder-preview.test.js tests/reader-editor.test.js`,
`./.venv/bin/python -m unittest backend.tests.test_migrate_panel_settings`, `npm run lint`,
`npm run format:check`, `npm run test:visual`, and `git diff --check`.

## Phase 4 — Ratio-driven panel existence

Goal: the section ratio is the only control over whether a panel exists. **Both** runtime hide paths
must go, and the block must be enforced where it actually persists (the backend).

**Remove runtime panel control (finding #2) — both paths, in a safe order:**

- [x] Drive `<aside>` visibility from column count (left = always; right = layout has ≥2 columns); remove
      the `section.settings.panelEnabled` runtime block + `resetPanelVisibility` (`reader/data.js:1107`–`1126`).
- [x] Remove the **second** hide in `applyReaderModuleShellSettings` (`reader/data.js:646`–`649`) and the
      `hasExplicitPanels` plumbing (`:573`, `:564`) so the reader module no longer hides panels.
- [x] Stop emitting `settings.panels` from `normalizeReaderConfig`/`getReaderRuntimeConfig`
      (`reader-config.js:71`) **only after** both runtime readers above are gone — order matters, or a
      reader that still reads `settings.panels` breaks. Keep tolerant input parsing for old saved configs.
- [x] Sweep other consumers of `settings.panels` / `panelEnabled` (mount + responsive + preview-bridge);
      grep both keys and neutralize each before deleting the producers.

**Block destructive ratio reduction (finding #1) — backend is the authority:**

- [x] **Landed in Phase 2.** In `update_section` (`backend/app/page_store.py:824`), replace the
      rehome-on-shrink branch with a rejection (e.g. HTTP 409/422) when any to-be-removed column
      still has modules; only allow the
      shrink when those columns are empty. This is the real enforcement point — a direct API call must not
      silently move content.
- [x] **Landed in Phase 2.** Update the backend test that asserts rehoming
      (`backend/tests/test_page_builder_routes.py:1631`) to
      assert the rejection instead, plus an allowed-shrink case when the columns are empty.
- [x] **Landed in Phase 2.** Client guard (UX): in `setActiveSectionColumnCount`
      (`admin/page-builder.js` ~`:2008`) /
      `changeSectionLayout` (`canvas-mutations.js:296`), pre-check and surface guidance ("clear this
      column's modules first") so the user sees the block before the request; treat the backend rejection
      as the source of truth and message it.

**Toggle migration + fallback content:**

- [x] Migration for the old toggle: for pages with `panelEnabled[side] === false` or reader-module
      `panels[side].enabled === false`, reconcile to the ratio — drop the empty trailing column to 1; if it
      has modules, leave it and flag for manual review (never silently delete content).
- [x] Note: empty left panels keep the current generic empty-state behavior; the static promo in
      `index.html` (`.left-panel-content`) is not preserved as a fallback.
- [x] Tests: right panel appears/disappears with column count; **backend** rejects reducing a non-empty
      column and allows an empty one; neither runtime path hides a panel once removed; migration maps a
      disabled empty panel to a reduced ratio.

Completion note (2026-07-05): Phase 4 made panel existence column-count-driven in the reader runtime
(`leftPanel` always shown, `rightPanel` shown only when the reader section has 2+ columns), removed both
legacy runtime hide paths, and stopped emitting reader-runtime `panels` / `showPanels` data while keeping
old input tolerant. It added `backend.app.migrate_panel_toggles_to_ratio` as a dry-run-first migration:
disabled empty right panels collapse to layout `1` with reader modules relocated to column 0; disabled
right panels with authored content are flagged and untouched; disabled left panels are cleared and flagged
because the left panel now becomes visible. Legacy `showPanels` is treated as a fallback only when an
explicit `config.panels` object existed, matching the old runtime gate. Verification:
`./.venv/bin/python -m unittest backend.tests.test_migrate_panel_toggles`,
`npm test -- tests/reader-config.test.js tests/reader-data-builder.test.js
tests/responsive-overrides.test.js tests/reader-page-renderer.test.js`, and `git diff --check`.

## Migration & Backward Compatibility

- **Read-time fallback** keeps un-migrated pages correct: column `panelBackground`/`panelGap` fall back
  to `page.meta.panelBackgrounds`/`panelSpacing[side]` until migrated. In Phase 3 UI, fallback-only
  fields are visible but disabled; the required release gate before authors edit migrated panel
  settings is `python -m backend.app.migrate_panel_settings_to_columns --series <id> --write`.
- **Backend data migration** (Phase 2) copies legacy `page.meta` panel values into the reader section's
  columns and clears the meta keys; it never deletes columns or modules. (A client one-shot dual-save is
  the fallback option if a backend migration is undesirable.)
- The old `panelEnabled` / reader-module `config.panels.*` are removed only after both runtime readers are
  gone (Phase 4 ordering); disabled panels with content are flagged for review, not destroyed.

## Risks & Open Points

- **Backend layout-shrink contract change:** Phase 4 flips `update_section` from rehome→reject and rewrites
  an asserted backend test (`test_page_builder_routes.py:1631`). Confirm no other caller relies on the
  rehome behavior (e.g. programmatic layout edits) before changing it.
- **Removing `settings.panels` is order-sensitive:** all runtime/mount/responsive/bridge readers of
  `settings.panels` / `panelEnabled` must be neutralized _before_ the producer is deleted, or the reader
  shell breaks. Grep both keys and sequence the deletions.
- **Preview selection bridge:** confirm panel/column clicks post back through the same channel module
  clicks use (`preview-manager.js:726` → `selectCanvasTarget`); a small click→target mapper may be needed.
- **Responsive emission sharing:** reusing `columnDeclarations` for panels (Phase 2) needs the section's
  scoped `<style>` emission (`shared-renderers.js:588`) factored so the panel path can call it without
  duplicating logic.
- **Spacing regression:** the new public wrapper must replicate `.panel-builder` flex + gap (Phase 1 CSS
  step) or inter-module spacing collapses.
- **Migration safety:** prefer fallbacks + flags over destructive changes.

## Verification

- **Automated (JS):** project test runner over the extended `tests/reader-data-builder.test.js`,
  `tests/shared-renderers-parity.test.js`, `tests/appearance-utils.test.js`, with new panel-specific
  cases per phase (incl. empty public + builder panels, and public `@media` panel CSS).
- **Automated (backend):** `backend/tests/test_page_builder_routes.py` for the layout-shrink rejection +
  empty-shrink-allowed cases and the `page.meta` → reader-section-column migration.
- **Manual (builder):** open a reader page; click the left/right panel → unified Column/Panel menu
  opens for that column; set border color, padding, min-height, background image, module spacing → live
  preview updates; save + reload the public reader → published panel matches.
- **Ratio:** change the reader-section column count → right panel appears/disappears; reducing a
  non-empty column → blocked with guidance.
- **Backend:** restart `bwondercomics-bwondercomics-api-1` after backend changes; Vite dev server on
  `5173` proxies `/api` to `8001`.
