# Admin Page Builder Logic

This document describes the current builder runtime under `admin/page-builder/` and `admin/page-builder.js`.

## Table of Contents

- [💡 Scope & Canonical Entry](#-scope--canonical-entry)
- [💾 Current Data Model](#-current-data-model)
- [⚙️ Current Builder Flow](#️-current-builder-flow)
- [🔌 Builder Orchestrator (admin/page-builder.js)](#-builder-orchestrator-adminpage-builderjs)
- [📐 Layout Utilities (layout.js)](#-layout-utilities-layoutjs)
- [📱 Responsive Overrides (responsive-overrides.js)](#-responsive-overrides-responsive-overridesjs)
- [📝 Draft Manager (draft-manager.js)](#-draft-manager-draft-managerjs)
- [⌨️ Command Registry (commands.js)](#️-command-registry-commandsjs)
- [⌨️ Builder Keymaps (keymaps.js)](#️-builder-keymaps-keymapsjs)
- [↩️ Draft Undo Stack (undo-stack.js)](#️-draft-undo-stack-undo-stackjs)
- [🚚 Page Actions (page-actions.js)](#-page-actions-page-actionsjs)
- [🧱 Canvas Mutations (canvas-mutations.js)](#-canvas-mutations-canvas-mutationsjs)
- [🕹️ Structural Commands (structural-commands.js)](#️-structural-commands-structural-commandsjs)
- [📍 Live Drop Placement (live-drop-placement.js)](#-live-drop-placement-live-drop-placementjs)
- [👁️ Preview Manager (preview-manager.js)](#️-preview-manager-preview-managerjs)
- [💾 Data API (data.js)](#-data-api-datajs)
- [🚦 Fallback Retirement Gate (fallback-retirement-gate.js)](#-fallback-retirement-gate-fallback-retirement-gatejs)
- [🏗️ Header Configuration (header-config.js)](#️-header-configuration-header-configjs)
- [📝 Header Editor (header-editor.js)](#-header-editor-header-editorjs)
- [🎨 Theme Editor (theme-editor.js)](#-theme-editor-theme-editorjs)
- [🎛️ Inspector Shell (editor-panel.js)](#️-inspector-shell-editor-paneljs)
- [🧾 Inspector Sections (inspector-sections.js)](#-inspector-sections-inspector-sectionsjs)
- [📂 Sidebar Rail (sidebar-panel.js)](#-sidebar-rail-sidebar-paneljs)
- [🖌️ Canvas Renderer (canvas-renderer.js)](#️-canvas-renderer-canvas-rendererjs)
- [🖱️ Canvas Events (canvas-events.js)](#️-canvas-events-canvas-eventsjs)
- [🧩 Base Module Editor (module-editor.js)](#-base-module-editor-module-editorjs)
- [🧾 Appearance Editor (appearance-editor.js)](#-appearance-editor-appearance-editorjs)
- [🔘 Button Editor (button-editor.js)](#-button-editor-button-editorjs)
- [➖ Divider Editor (divider-editor.js)](#-divider-editor-divider-editorjs)
- [🖼️ Gallery Editor (gallery-editor.js)](#️-gallery-editor-gallery-editorjs)
- [🎬 Video Editor (video-editor.js)](#-video-editor-video-editorjs)
- [📚 Entry Gallery Editor (entry-gallery-editor.js)](#-entry-gallery-editor-entry-gallery-editorjs)
- [🦋 Social Editor (social-editor.js)](#-social-editor-social-editorjs)
- [🎠 Promo Editor (promo-editor.js)](#-promo-editor-promo-editorjs)
- [🏭 Shared Renderers (shared-renderers.js)](#-shared-renderers-shared-renderersjs)
- [👁️ Preview Renderers (preview-renderers.js)](#️-preview-renderers-preview-renderersjs)
- [🧾 Preview Contract (preview-contract.js)](#-preview-contract-preview-contractjs)
- [🎡 Promo Renderer (promo-renderer.js)](#-promo-renderer-promo-rendererjs)
- [🧩 Module Descriptors (module-descriptors.js)](#-module-descriptors-module-descriptorsjs)
- [🔢 Constants Registry (constants.js)](#-constants-registry-constantsjs)
- [🛠️ Shared Helpers (helpers.js)](#️-shared-helpers-helpersjs)
- [🛡️ Sanitization Layer (sanitize.js)](#️-sanitization-layer-sanitizejs)
- [🔗 Link Utilities (link-utils.js)](#-link-utilities-link-utilsjs)
- [📖 Current Module Catalog](#-current-module-catalog)
- [📜 Important Accuracy Notes](#-important-accuracy-notes)
- [🧭 Maintenance Rule](#-maintenance-rule)
- [📚 Related Docs](#-related-docs)

## 💡 Scope & Canonical Entry

The builder is the admin authoring surface for scoped builder pages backed by `BuilderPage`,
`BuilderSection`, `BuilderModule`, and series route-role `BuilderPageBinding` records. It is not a
freeform visual editor. The builder works with explicit page, section, and module records plus
page-level metadata in `page.meta`.

### Canonical Entry

The canonical builder route is the admin shell route:

- `admin/index.html?view=designer&series=<id>&page=<slug>&surface=header`

Current routing behavior:

- `admin/page-builder.js` owns the builder lifecycle inside the main admin shell.
- `admin/designer.html` remains only as a redirect bridge into the shell route.
- The builder can deep-link to a specific page slug and initial surface such as `header`.

## 💾 Current Data Model

### Page

Current page-level fields include: `scope` (`series` or `global`), nullable `seriesId`, `slug`,
`title`, `pageType`, `isPublished`, `isHomepage`, `sortIndex`, and `meta`.
Current page-level `meta` ownership: `meta.header`, `meta.theme`, `meta.panelBackgrounds`, and `meta.panelSpacing`.

Series route roles are stored in `BuilderPageBinding`; Phase 8 requires the `reader` role for each
series, and reader bindings must point at a same-series page. A valid bound reader page also needs
exactly one Comic Reader module that is visible on the default Desktop device and uses the active
page series source. Feed and media/gallery pages are now normal builder pages composed from CMS
modules, while `feed`/`gallery` binding roles remain reserved for later routing work.

### Section

Sections currently own: `layout`, `sortIndex`, and `settings`.

`layout` is a 1-6 segment dash-separated ratio string (each segment a positive integer 1-12); legacy
presets (`1`, `1-1`, `1-2`, `2-1`, `1-1-1`, `1-3-1`) are a strict subset. It is the single source of
truth for column count and width ratios. `settings.columns[]` holds sparse per-column styling keyed by
`index` (sanitized appearance, padding, alignment, min-height, hidden, and a per-column `responsive`
branch); it never carries width. Device track count/ratio rides
`settings.responsive[device].layout`, is limited to the global structural column count, and reflows
the stable global column nodes without changing `module.columnIndex`. When a saved global layout
shrinks, modules already in the last surviving column stay first, orphaned modules append by original
column/sort order, and the merged destination order is resequenced contiguously in the same
transaction.

Panel precedence: reader side panels are reader-owned. They are styled through the reader module's
`panels` settings and the page-level `meta.panelBackgrounds` / `meta.panelSpacing`, and are fed only
from the reader module's own section. Generic section columns use the `settings.columns[]` contract;
the two do not overload each other. On a bound reader page, sections before the reader module render
into the above-reader content surface and sections after it into the below-reader content surface as
ordinary page content (not panels).

### Module

Modules currently own: `moduleType`, `columnIndex`, `sortIndex`, and `config`. CMS-backed modules
may include a sanitized optional `config.source` branch with `{ mode, seriesId?, filters?, limit?,
sort? }`.

Reader modules also carry a sanitized paged-reader customization contract:
`displayMode`, `controls`, `stage`, `panels`, `showPanels`, and `showComments`. The editor exposes
these as structured controls on the normal module draft path. `displayMode: "paged"` is the active
runtime mode; `"vertical-scroll"` is accepted for forward compatibility but remains disabled in the
editor until the vertical renderer phase. Safe device overrides cover hidden state, display mode,
controls placement/size, stage fit/page gap, panel visibility, and comments visibility. Legacy
configs that only contain `showPanels` keep that flag for compatibility, but static reader side-panel
visibility is controlled by an explicit `panels.left/right.enabled` branch so migrated pages with
authored side-panel modules remain visible.

## ⚙️ Current Builder Flow

1. `admin/page-builder.js` loads either global pages or active-series pages through explicit scoped
   endpoints.
2. The selected page is resolved from the route, active scope, or first available scoped page.
3. The active page detail is loaded with `fetchPage(...)`.
4. The full-page shell hides normal admin chrome and renders the top toolbar plus unified side
   panel.
5. The side panel is rendered by `sidebar-panel.js` and exposes Pages, Blocks, Layers, Settings,
   and Styles. The Pages panel switches between Global Pages and Series Pages and shows reader
   binding warnings for the active series.
6. The default canvas is the live iframe preview rendered by `preview-manager.js` with
   `builderEditing: true`, so the reader iframe can emit admin-only target markers and live target
   geometry.
7. Editor intent first routes through the shared command registry, then delegates to focused
   managers such as `structural-commands.js`, `draft-manager.js`, and `preview-manager.js`.
8. Live drops rank iframe target geometry through `live-drop-placement.js`, then call
   `canvas-mutations.js` and the existing data-layer mutators.
9. The structural canvas is still rendered by `canvas-renderer.js` as the **Structure Debug**
   fallback.
10. Guarded builder keymaps call the same command IDs as toolbar and panel controls. `Escape`
    exits chrome preview even when the restore button owns focus, while destructive keys stay
    suppressed inside editing controls.
11. Text-module inline editing treats the reader iframe as an editing view. Inline messages update
    the active module draft, sync the side panel, and persist only through the normal Save command.
12. User actions call `data.js` mutators, update local state, then rerender affected surfaces.

There is no separate long-lived client-side draft store in `data.js`. `admin/page-builder.js` still owns the top-level mutable builder state and composition root, while focused factories now own specific workflows: `commands.js` centralizes editor intent and availability checks, `keymaps.js` guards admin-only shortcuts, `undo-stack.js` tracks local unsaved draft snapshots keyed by draft target plus responsive edit scope/device where applicable, `draft-manager.js` handles draft normalization/save-discard flows, `page-actions.js` handles page lifecycle actions, `canvas-mutations.js` handles structural section/module mutations, `structural-commands.js` routes live structural intent, and `preview-manager.js` handles the iframe preview handshake/render path.

Fallback-retirement readiness is a separate developer workflow, not part of the normal editor boot path: the page list from `fetchPages(...)` is intentionally summary-only, so any runtime-fallback audit must hydrate each page with `fetchPage(...)` or use `loadFallbackRetirementGate(...)` before calling `auditPagesFallbacks(...)`.

## 🔌 Builder Orchestrator (admin/page-builder.js)

This is the main coordinator. It owns the remaining top-level mutable builder state and wires together the rail, canvas, inspector, and extracted manager modules.
Its responsibilities include:

- loading page lists and the active page
- keeping the current series and selected page in sync with the route
- tracking selected surface, selected module, active section, and insertion targets
- storing the builder-wide state consumed by the extracted factories, including current page, selection state, dirty scope, canvas mode, and active preview width
- instantiating `createDraftManager(...)`, `createPageActions(...)`, `createCanvasMutations(...)`,
  `createStructuralCommandAdapter(...)`, `createBuilderCommandRegistry(...)`,
  `createBuilderKeymapManager(...)`, `createDraftUndoStack(...)`, and `createPreviewManager(...)`
- `normalizeHeaderDraft` resolves normal headers with `pageConfig: null` and tags a `source` field (`page-meta-v3`, `page-meta-stale`, `legacy-import`) so migration-only badges can flag non-canonical header records
- delegating draft saves/discards, publish/page actions, command/keymap handling, structural
  commands/mutations, and preview synchronization to those focused factories
- rerendering the side panel, live canvas, structure-debug fallback, and inspector after state
  changes
- rendering status badges and reader-preview links

**Designer Mode Integration**:
The top-level coordinator now owns the canonical designer-entry behavior in addition to the generic builder shell.

- **`showPageBuilderSection(options)`**: Opens the builder in either normal builder mode or designer mode.
  - `entrypoint: 'designer'` activates route-aware header editing.
  - `pageSlug` requests a specific page by slug.
  - `surface: 'header'` opens the structured page-header editor immediately.
  - `historyMode` controls whether route updates use `pushState` or `replaceState`.
- **Full-Page Shell**: Opening the builder adds `admin-page-builder-open`, hides the normal admin
  header/nav through CSS, and uses the top builder toolbar plus one side panel as the only editor
  chrome.
- **Canvas Default**: The live iframe preview is the default canvas. The structural renderer remains
  available through **Structure Debug**, but Blocks drags, layer moves/deletes, selected-target
  toolbar actions, and Structure Debug insert/move/delete controls now route through the same live
  structural command adapter.
- **Builder Editing Markers**: Live builder snapshots set `options.builderEditing: true`. The
  reader iframe applies that flag through `applyBuilderPageToDOM(...)`, shared renderers, and
  header layout code to emit `data-builder-*` markers for page, section, column, module, and
  page-header targets. Public/default reader rendering keeps those attributes absent.
- **Live Target Selection**: The reader iframe measures those markers, sends validated target
  messages through the preview contract, and lets the admin frame render hover/selected overlays
  above the iframe while routing clicks through existing module/header/page/section selection and
  dirty-guard flows.
- **Live Structural Commands**: The builder owns `liveDragState` and translates block, module, and
  section drags into existing section/module mutations. The iframe never receives structural
  mutation commands; it only supplies target geometry and refreshes target measurements.
- **Text Inline Editing**: Text modules can enter a preview-local `contenteditable` mode in live
  builder editing. `admin/page-builder.js` owns `inlineEditState` and routes
  `builder:inline-edit-*` commands into `activeModuleDraft.content`; the iframe DOM is never
  canonical, side-panel edits sync sanitized draft HTML back to the active iframe edit view, stale
  iframe commits cannot overwrite a newer admin draft, and `updateModule(...)` is called only by the
  existing Save flow.
- **Default Page Resolution**: Designer mode resolves pages in this order: requested slug, `reader`, homepage, then first page in sort order.
- **Normal Builder Landing Surface**: Outside designer mode, opening or creating a page now defaults to the `page-settings` surface so slug, title, page type, publish state, and homepage assignment are immediately editable without an extra click.
- **`onSeriesChange()`**: Re-opens the visible builder shell after a series switch and preserves designer-mode routing when applicable.

## 📐 Layout Utilities (layout.js)

This module holds the responsive shell-mode helpers that were extracted from the main builder file.

Current responsibilities:

- define the persisted localStorage keys for shell side-panel mode
- derive the current viewport band (`wide`, `medium`, `stacked`)
- resolve the effective side-panel mode (`expanded`, `collapsed`) from stored preference plus
  viewport size
- compute the side-panel width used by the shell layout

`admin/page-builder.js` still owns the DOM mutations that apply those derived values, but the breakpoint and width math now lives in `layout.js`.

## 📱 Responsive Overrides (responsive-overrides.js)

This helper owns the responsive override contract shared by builder-device rendering and public
responsive CSS generation. It normalizes device ids from the preview contract, prunes empty
responsive branches, exposes the per-module responsive field list from `module-descriptors.js`, and
resolves effective section/module/column state for a specific device.

Current responsibilities:

- `SECTION_RESPONSIVE_FIELDS` defines editable section-level overrides such as layout, gaps,
  padding, and background color
- `setResponsiveOverrideValue(...)` writes sparse per-device branches and removes empty values
- `getEffectiveSectionLayout(...)`, `getEffectiveSectionSettings(...)`, and
  `getEffectiveColumnSettings(...)` merge sparse device overrides for builder rendering or explicit
  public CSS resolution
- `resolveEffectiveColumnLayout(...)` returns global column indexes, visible indexes, effective
  track ratios/grid template, and effective settings for every stable structural column
- `getEffectiveModuleConfig(...)` applies descriptor-backed module overrides, including nested
  button defaults and per-button responsive appearance overrides
- `isModuleHiddenForDevice(...)` gates builder-editing render output for device-hidden modules

## 📝 Draft Manager (draft-manager.js)

This factory owns the explicit local-draft lifecycle for builder surfaces that save intentionally rather than immediately.

Current responsibilities:

- normalize theme and header draft state from the active page
- initialize drafts for modules, theme, header, page settings, and section settings
- clear selected module / active section draft state when selection changes
- save and discard module drafts through `updateModule(...)`, returning truthful success/failure
  results to the command layer
- save and discard theme, header, and page-settings drafts through `updatePage(...)`, returning
  truthful success/failure results to the command layer
- reset theme drafts back to the default theme token set

The draft manager does not own the canonical source of truth for builder state; it receives state and setters from `admin/page-builder.js` and mutates them through the injected action contract.

## ⌨️ Command Registry (commands.js)

This module centralizes named builder intent. Toolbar buttons, keymaps, live target toolbar actions,
and side-panel controls all resolve to command ids before a mutation runs.

Current responsibilities:

- define `BUILDER_COMMANDS` for draft save/discard, preview toggles, navigation, selection, undo,
  redo, and cancel/exit behavior
- adapt structural command ids from `structural-commands.js` into the same registry
- expose `createBuilderCommandRegistry(...)`, which normalizes command results, checks visibility
  and enabled state, and delegates execution to injected actions/managers
- provide command metadata so UI controls can ask whether an action can run before wiring it

## ⌨️ Builder Keymaps (keymaps.js)

This module maps guarded keyboard shortcuts to command ids. It suppresses global shortcuts inside
text inputs, editable surfaces, active modals, and unsafe focus contexts.

Current shortcuts include:

- `Ctrl/Cmd+S`: save the active draft
- `Ctrl/Cmd+Z` and `Ctrl/Cmd+Shift+Z` / `Ctrl/Cmd+Y`: undo and redo the active draft scope
- `Escape`: exit preview or cancel transient builder state
- `Delete` / `Backspace`: delete the selected structural target when focus is safe
- `Alt+Arrow*` and `Alt+P`: selection traversal and preview toggle helpers

## ↩️ Draft Undo Stack (undo-stack.js)

This module stores local undo/redo history for explicit-save drafts. Histories are scoped by draft
target so module, header, theme, page settings, section settings, and responsive-device edits do not
overwrite each other.

Current responsibilities:

- stable-serialize snapshots to avoid duplicate history entries
- enforce a bounded history size
- expose `push`, `undo`, `redo`, `reset`, `canUndo`, `canRedo`, and `getState`
- keep undo state local to the current dirty draft until the normal Save/Discard flow resolves it

## 🚚 Page Actions (page-actions.js)

This factory owns the higher-level page lifecycle flows that were previously inlined into the orchestrator.

Current responsibilities:

- disable/restore the Save Draft and Publish buttons while a page action is in flight
- publish or unpublish the active page through `updatePage(...)`
- load series pages through `fetchPages(...)`
- create pages and upload builder assets through the existing data-layer helpers
- activate a page, including designer-surface routing behavior
- guard page switching and deletion behind `ensureCleanWorkspace(...)`
- reorder and delete pages from the sidebar

## 🧱 Canvas Mutations (canvas-mutations.js)

This factory owns the immediate structural mutations for sections and modules.

Current responsibilities:

- insert modules with default config at an exact section/column/index target
- move modules within a column or across sections/columns
- preserve hidden compatibility-only `header` modules in module-order calculations while excluding them from visible canvas counts
- insert and reorder sections
- update section layout
- apply local order updates after backend reorder calls so the canvas can rerender from the latest in-memory shape
- return the created or moved module/section record so live-canvas commands can select the affected
  target after a successful mutation

## 🕹️ Structural Commands (structural-commands.js)

This factory is the internal command adapter for live structural editing. It stays focused on
structural mutations while the broader command/keymap/undo layers coordinate editor intent.

Current responsibilities:

- own the supported structural command IDs: drag start/over/drop/end, insert, move,
  insert-section, move-section, delete-selected, hide-on-device, and disabled duplicate-selected
- guard structural commands with the existing dirty-workspace checks before changing selection or
  mutating structure
- translate block/module/section drag state into `canvas-mutations.js` calls
- create pending insert targets when toolbar Insert Before/After is clicked, then let a Blocks card
  click complete the insertion
- select the inserted or moved target, switch the side panel back to Settings, request fresh iframe
  target geometry, and clear live drag state after successful commands
- keep Duplicate visible but disabled until an actual duplicate mutation exists

## 📍 Live Drop Placement (live-drop-placement.js)

This pure helper ranks iframe target geometry into structural placements.

Current responsibilities:

- accept block descriptors and reject non-insertable modules such as `header`
- rank targets by specificity and proximity: module edge, column, section, then page
- resolve placements for module before/after, column start/end, empty column, section before/after,
  and page end
- use the global saved section layout and actual module `columnIndex` for structural validity rather
  than device-collapsed layout
- exclude the dragged module or section from placement index calculations so moves land at the
  expected canonical sort position

## 👁️ Preview Manager (preview-manager.js)

This factory owns the admin side of the iframe-based reader preview.

Current responsibilities:

- build iframe URLs with `builderPreview=1`, the active page slug/id, and the current preview session token
- derive preview identity from the active series/page/draft state
- clone the current page into a preview snapshot and merge the active local dirty draft when needed
  through the internal snapshot helper
- set `snapshot.options.builderEditing` when the live builder canvas is rendering an editable iframe
- send `SNAPSHOT` messages to the reader iframe and answer `REQUEST_SNAPSHOT`
- validate inbound `ACK`, `ERROR`, `METRICS`, `TARGETS`, `TARGET_HOVER`, and `TARGET_SELECT`
  messages plus text-module `INLINE_EDIT_*` messages through `validatePreviewEnvelope(...)`
- apply exact preset width/height styles to both `.pb-preview-frame` and `.pb-preview-iframe`
- store responsive metrics on `.pb-preview-frame.dataset`, including inner dimensions, branch flags, and overflow offenders
- render the admin-side preview debug overlay when metrics are present and debug mode is enabled
- store live target geometry on `.pb-preview-frame.dataset`, render hover/selected outlines,
  compact selected-target toolbar chrome, and insert guide lines above the iframe
- render the active live drop guide while dragging and make the admin overlay catch drag/drop events
  only for the duration of a live drag
- route selected-target toolbar actions through the structural command adapter while leaving iframe
  `TARGET_ACTION` messages for non-mutating requests such as target refresh
- route selected text-module toolbar Edit Text through the command registry and post an internal
  inline-edit start request to the same live iframe session
- clear live target geometry and send `builderEditing: false` snapshots when the builder enters
  chrome-collapsed Preview over the same iframe
- clear stale target geometry on iframe reload, page identity changes, preview session reset, and
  device switches until fresh target messages arrive
- update `.pb-preview-frame` dataset attributes and `.pb-preview-status` copy
- refresh preview source/status metadata for inline draft typing without posting a new iframe
  snapshot on every keystroke
- render the default live canvas and rerender the preview frame whenever live mode, dirty draft, or
  viewport state changes

The snapshot merge path covers the dirty scopes owned by the explicit-save editor model:
`module`, `theme`, `header`, `page-settings`, and `section`. It always works on a cloned page
snapshot so previewing unsaved changes does not mutate `currentPage`.

`admin/page-builder.js` still owns the top-level `canvasMode` and `previewWidth` state, but the preview handshake/render logic itself is no longer inlined there.

Reader module rendering uses the shared renderer contract: `.pb-reader-mount` includes normalized
data attributes for source, display mode, controls placement/size, stage fit/gap/frame/max-width,
panel visibility, and comments visibility. Public reader output and admin live preview consume the
same attributes, while active reader shell pages additionally apply the effective reader module
config to the permanent static shell.

## 💾 Data API (data.js)

This is the backend API layer for builder records. Current fetchers and mutators include:

- `fetchPages(seriesId)`, `fetchPage(pageId)`
- `fetchSeriesPages(seriesId)`, `fetchGlobalPages()`, `fetchPage(pageId)`
- `createScopedPage(scope, seriesId, slug, title)`, `deletePage`, `reorderScopedPages`,
  `updatePage`
- `fetchPageBindings(seriesId)`, `updatePageBindings(seriesId, bindings)`
- `addSection`, `updateSection`, `deleteSection`, `reorderSections`
- `addModule`, `updateModule`, `moveModule`, `reorderModules`, `deleteModule`
- `fetchAssets`, `uploadAsset`

Because page-list fetchers return page summaries without hydrated `sections`/`modules`, they are not
sufficient input for `auditPagesFallbacks(...)` when validating runtime-fallback retirement.

## 🚦 Fallback Retirement Gate (fallback-retirement-gate.js)

This helper exists for the Phase 8 runtime-fallback retirement workflow. It loads the summary page list for a series, fetches every page as full detail, then runs `auditPagesFallbacks(...)` on the hydrated records.

Important export:

- `loadFallbackRetirementGate(seriesId, deps?)`

Current contract:

- fails closed when the page list cannot be loaded
- fails closed when any page detail is missing, invalid, or lacks `sections`
- reports `completePageDetails` separately from the audit result so callers can distinguish fetch failures from real fallback debt
- only returns `retirementReady: true` when full detail loading succeeded and the aggregate audit is clean

## 🏗️ Header Configuration (header-config.js)

The primary header authoring source is now `page.meta.header`. The header is edited as page-level metadata, not as a normal insertable module. `header` still exists in the module catalog for compatibility, but it is excluded from the normal insertable palette.

`header-config.js` resolves effective header state from canonical page metadata and keeps legacy inputs available for migration/backfill checks.
Important exports:

- `createEffectivePageHeader(page, pageConfig, normalizeNavItems?)`
- `resolvePageHeaderState({ page, pageConfig, draftState?, normalizeNavItems? })`
- normalization helpers for header copy and layout
- fallback-audit helpers for migration cleanup

Resolution order is effectively:

1. `page.meta.header`
2. migration-only site-level or legacy page-config defaults
3. older override shapes and legacy fallback content for pre-V3 records

Normal admin and reader runtime pass `pageConfig: null`. Non-null `pageConfig` is retained for migration, backfill, and direct safety tests that inspect older records.

Appearance contract update:

- `normalizeHeaderConfig(...)` now carries optional header-shell `appearance` alongside `regions`, `blocks`, and `nav`
- a local `normalizeHeaderShellAppearance(...)` normalizes the three shared branches: `top`, `scrolled`, and `navItemDefaults`
- `createPageHeaderMeta(...)` now persists normalized `appearance` into canonical V3 header metadata
- `resolvePageHeaderState(...)` now preserves that same `appearance` data on both `meta` and normalized `header`
- this is a data-contract pass only; no header editor UI or reader/admin header renderer consumes the new appearance fields yet

`resolvePageHeaderState(...)` is now the shared Step 5 seam for parity work:

- the admin canvas header surface reads `headerState.header` and `headerState.copy`
- the reader resolves once in `reader/data.js`, applies copy from `headerState.meta`, and passes the same state into `reader/header-layout.js`
- this avoids copy/layout drift between admin and reader while canonical V3 header state is normalized through one helper

Audit behavior:

- `missingHeader`, `staleHeaderVersion`, and `headerOverrides` remain the runtime-fallback blockers
- `legacyHeaderModule` is only reported when a page still depends on legacy copy fallback; once canonical V3 `meta.header` exists, stored header modules are later-cleanup debt and do not block runtime fallback removal
- runtime fallback has now been retired from normal reader startup; the audit remains the proof that a series was ready, while stored legacy modules and page-config compatibility are separate cleanup debt

Migration/backfill workflow:

- legacy page saves already write canonical `page.meta.header.version = 3`
- bulk migration is handled by the CLI `python -m backend.app.backfill_page_headers --series <series-id> [--write]`
- the command dry-runs by default, computes effective header state from current page data plus legacy `PageConfig`, writes canonical V3 `meta.header`, clears `meta.headerOverrides`, preserves sanitized header/nav appearance data, and returns additive `pageReports` details for each changed page

## 📝 Header Editor (header-editor.js)

This renders and binds the page-header editor UI used by the inspector.
Current editor responsibilities include:

- showing a migration/upgrade banner if the active header draft is from a non-canonical `source` (e.g., `legacy-import`)
- title and subtitle copy editing
- nav item CRUD: add, remove, reorder, enable/disable, and target editing for every header button
- **Style preset dropdown** per nav item: `Primary` (filled/neon) or `Secondary` (outline-only) — maps to the same variant model used by the `buttons` module
- block visibility toggles
- drag-and-drop left/center/right region placement (with keyboard-accessible buttons as fallback)

Saving header changes writes back through `updatePage(..., { meta: nextMeta })` and clears any import/upgrade banners since the header is upgraded to canonical V3.

## 🎨 Theme Editor (theme-editor.js)

The centralized controller for the visual identity of the page. It manages the global metadata used to theme the reader chrome and panel surfaces.

**Core Systems**

- **Palette Management**: Synchronizes the `THEME_COLORS` token set with dual UI inputs (Color Picker + Hex Text).
- **Preset Engine**: Allows for one-click application of pre-defined color schemes (Presets) from the centralized registry.
- **Surface Engineering**: Manages per-panel background art. Integrates with the image picker to utilize focal point coordinates and object-fit logic for panel backgrounds. Provides direct control over background asset opacity.
- **Structural Rhythm**: Manages `panelSpacing` (the vertical gap between modules) and toggles for empty-state placeholder visibility.

**Logic & State**

- **`renderThemeEditorContent(...)`**: Constructs the four-section editor stack (Presets, Palette, Surfaces, Spacing).
- **`bindThemeEditorEvents(...)`**: Orchestrates a "Soft-Draft" lifecycle, staging changes to a `draftMeta` object to ensure smooth performance during color picking.
- **`cloneThemeDraft(draft)`**: Ensures a deep copy of the theme state to prevent accidental mutations of the working metadata.

## 🎛️ Inspector Shell (editor-panel.js)

This is the inspector shell. It chooses which editor to show based on selected surface and active tab (theme, page header, page settings, selected module editor).

Important behavior:

- it renders the shell layout and footer actions
- it delegates module-specific content to `module-editor.js`
- it invokes delete actions for the currently selected module when appropriate

## 🧾 Inspector Sections (inspector-sections.js)

Small HTML helper for repeated inspector cards. It renders the `<details>` shell used by module,
theme, header, gallery, video, divider, social, and entry-gallery editors. Keeping this wrapper in
one helper makes section cards share the same kicker/title/summary/body structure without each
editor copying the markup.

## 📂 Sidebar Rail (sidebar-panel.js)

This file renders the unified side panel. Current responsibilities:

- page list rendering and selection
- page drag/drop reorder
- descriptor-backed block rendering (blocks exclude non-insertable descriptors such as `header`)
- layer tree rendering for page settings, page header, sections, columns, and modules
- live block drag starts from descriptor data, and block clicks complete pending toolbar insertions
- layer module/section drags and delete buttons route through the structural command adapter
- Pages, Blocks, Layers, Settings, and Styles tab switching
- routing Settings and Styles tabs into the existing `editor-panel.js` inspector shell

## 🖌️ Canvas Renderer (canvas-renderer.js)

Responsible for the **Structure Debug** fallback and the interactive admin-only structural canvas.

- **`renderCanvasSnapshot({ state, helpers })`**: The main orchestration export that returns the full canvas and page title HTML.
- **Page Title Bar**: Renders the context header showing the current page slug, type, and status badges, along with the "Page Settings" access point.
- **Page Header Surface**: A specialized structural preview of the site-wide header. Visualizes brand config as a clickable block, displays representative chips for blocks like patron/status/entryControls, and renders visible "Empty region" indicators when columns are unpopulated.
- **Header-State Parity**: The surface now reads from `resolvePageHeaderState(...)` instead of maintaining its own ad-hoc header summary path, so the same normalized regions, enabled flags, copy, and nav variants drive both the admin preview and the live reader header.
- **Section Controls**: Renders section reorder handles, layout selectors, and spacing settings (Module, Column, Section Gap).
- **Insert Zones**: Manages the placement of `renderModuleInsertBar`, `renderSectionInsertBar`, and the module picker grid.

The structural canvas is no longer the default authoring surface. Live mode uses the real reader
iframe with admin-only target overlays for hover, selection, inline toolbar actions, and live drop
guides. Structure Debug remains available for diagnostic fallback and older visual workflows, but
its structural insert/move/delete actions route through the same command adapter as the live canvas.

## 🖱️ Canvas Events (canvas-events.js)

Coordinates all user interactions within the `#pbCanvas` through a factory pattern.

- **`createCanvasEventBinder`**: Returns a `bindCanvasEvents` function. Detaches business logic from DOM events by delegating operations.
- **Section/Module Management**: Handles Structure Debug drag & drop reordering, layout changes,
  module selection clicks, and target deletion while routing structural mutations through the
  command adapter.
- **Global Selection**: Hooks up buttons for selecting the Page Header and Page Settings from the canvas.

## 🧩 Base Module Editor (module-editor.js)

This is the shared module inspector renderer and binder. Generic field rendering exists for modules that do not have a dedicated editor, and dedicated editors are delegated based on the descriptor `editorKind`. A raw JSON config card exists as a fallback.

The module editor also owns CMS source controls, responsive edit-scope cards, responsive module
override controls, style-manager views for descriptor `appearanceSectors`, and draft event binding
for text, image, spacer, HTML, email signup, feed, media gallery, entry gallery, promo, social,
buttons, divider, gallery, and video modules.

## 🧾 Appearance Editor (appearance-editor.js)

Shared inspector control helper for sparse appearance editing. It renders checkbox-gated background,
text, and border controls for callers such as the buttons and header editors, synchronizes paired
color picker / hex text inputs, and converts normalized appearance state back to sparse storage.

Current responsibilities:

- render reusable appearance input groups for background color/gradient, text color, and border
  width/style/color/opacity/radius
- keep disabled controls from writing fake placeholder values
- validate hex text input and mirror valid picker/text values
- expose low-level helpers such as `setAppearanceLeaf(...)`, `removeAppearanceLeaf(...)`,
  `toSparseAppearance(...)`, and `syncAppearanceColorInputs(...)`

## 🔘 Button Editor (button-editor.js)

Provides the UI and logic for managing lists of interactive buttons.

- `renderButtonsEditor(config, pages)`: form generation.
- `bindButtonsEditorEvents(...)`: Handles add/remove/reorder sync.
- `renderLinkFields`: Sub-fields for jumping between Builder Page, URL, and Anchor link modes.
- `toSparseAppearance(...)` / `toSparseButtonsConfig(...)`: local helpers that convert normalized appearance state back into sparse storage so disabled controls do not write placeholder null branches.

Current behavior:

- the editor renders a module-level **Button Defaults** card before the button list and writes sparse values into `config.defaults.appearance`
- each button renders an **Appearance Overrides** card below preset/link/enabled controls and writes sparse values into `buttons[*].appearance`
- every appearance leaf is checkbox-gated because native color inputs cannot represent `null`; unchecked fields remove the stored leaf and fall back to inherited defaults
- appearance controls are keyed with explicit scopes and paths such as `data-appearance-scope="defaults"` plus `background.color`, `text.color`, `border.width`, and `border.radius`
- enabling or disabling a control rerenders the editor so the correct inputs become active/inactive, while value-only edits continue through the normal draft `commit(...)` path without a full panel refresh

## ➖ Divider Editor (divider-editor.js)

A minimalist editor for horizontal ruling lines. Includes a style selector (Solid, Dashed, Dotted) and a color picker.

## 🖼️ Gallery Editor (gallery-editor.js)

Manages a grid of images with titles and alt text. Combines a Columns setting field with full interactions for openImagePicker, sorting, adding, and removing images.

## 🎬 Video Editor (video-editor.js)

A focused link-entry editor for validating and staging third-party video embeds (enforcing HTTPS YouTube or Vimeo). Contains `normalizeVideoConfig` for config stability.

## 📚 Entry Gallery Editor (entry-gallery-editor.js)

Configures the automatic feed of comic entries within a custom page. Pulls entry thumbnails dynamically from the database and supports column count adjustments.

## 🦋 Social Editor (social-editor.js)

A specialized list editor for managing high-visibility social media buttons. Handles dual-mode icons (text/emoji vs image assets), per-item CSS style overrides, and stable DOM rendering via `generateSocialButtonId`.

## 🎠 Promo Editor (promo-editor.js)

The most complex module, handling carousels, focal points, and rich CTA text. Manages recursive state for multiple slides and generates default glassmorphism slide layouts via `getDefaultPromoItemStyle`.

## 🏭 Shared Renderers (shared-renderers.js)

This is the shared rendering core used by both admin preview output and the public reader. Factory outputs `renderModule`, `renderSection`, and `renderPage`. This establishes true structural parity between the admin canvas and live website.

Section rendering always emits every global structural column in stable index order. Responsive
layouts change only the CSS Grid track template, so module ownership and `data-builder-column-index`
never follow a device reflow. Hidden columns remain in the DOM with `display: none`, and both base
inline rendering and scoped public media CSS derive grid templates from visible columns so hidden
nodes do not reserve empty tracks.

Buttons renderer behavior now uses the shared appearance contract directly:

- the whole buttons module config is normalized through `normalizeButtonsConfig(...)`, not just individual items, so `defaults.appearance` is available at render time
- each button resolves in this order: theme CSS variables from `.pb-btn`, preset class (`pb-btn--primary` / `pb-btn--secondary`), module defaults appearance, then per-button appearance
- `mergeAppearance(...)` produces the resolved appearance object and `appearanceToInlineStyle(...)` serializes it into stable-order inline CSS when any explicit appearance survives normalization
- when the merged appearance is empty, renderer output remains byte-for-byte compatible with the legacy class-only anchor pattern and does not emit a `style` attribute

## 👁️ Preview Renderers (preview-renderers.js)

A direct-render adapter that configures the shared rendering pipeline for the Admin environment.
It is retained for renderer-level tests and any builder-owned non-iframe render helpers, but it is
not the active live preview implementation. Live Preview mode now runs through
`preview-manager.js` on the admin side and `reader/preview-bridge.js` on the reader side.
`preview-renderers.js` still exports `renderPreviewPage`, `renderPreviewModule`,
`initPreviewPromoCarousels`, and `initPreviewEmailForms` for those direct-render contracts.

## 🧾 Preview Contract (preview-contract.js)

Defines the shared contract for the builder's iframe-based reader preview. `admin/page-builder/preview-manager.js` is the current admin-side sender, and `reader/preview-bridge.js` is the receiver.

Key exports:

- `PREVIEW_VIEWPORTS` and `PREVIEW_VIEWPORT_ORDER` — internal Desktop, Tablet, and Mobile viewport registry with exact iframe dimensions (`1920x1080`, `768x1024`, `375x812`). `BUILDER_DEVICES` keeps the same ids and relabels `mobile` as `Phone` for the builder UI. Desktop is full-HD and may be visually scaled by `.pb-preview-scale-shell` in the admin canvas without changing iframe pixels.
- `PREVIEW_MEDIA_QUERIES` — named responsive `matchMedia(...)` probes used for parity metrics (`aspectMax7By5`, `aspectMax5By7`, `maxWidth768`, `maxWidth480`)
- `BUILDER_PREVIEW_SNAPSHOT_VERSION` — version marker for builder preview payloads
- `BUILDER_PREVIEW_SOURCES` — `saved` for hydrated API pages and `working` for cloned snapshots that include an active local draft
- `BUILDER_PREVIEW_MESSAGE_TYPES` — `REQUEST_SNAPSHOT`, `SNAPSHOT`, `ACK`, `ERROR`,
  `METRICS`, `TARGETS`, `TARGET_HOVER`, `TARGET_SELECT`, and `TARGET_ACTION`; the full
  `postMessage` type registry shared by sender and receiver
- `DEFAULT_BUILDER_PREVIEW_SIDE_EFFECTS` — default preview policy for disabling or stubbing mutating reader behavior
- `getPreviewViewport(...)`, `isPreviewViewportId(...)`, `isPreviewSource(...)`, `isPreviewMessageType(...)`, and `getPreviewStatusCopy(...)` — small validation/copy helpers
- `buildPreviewSnapshotMessage(snapshot, previewSession)` — constructs the typed `SNAPSHOT` envelope sent from the admin to the iframe
- `buildPreviewControlMessage(type, details)` — constructs `REQUEST_SNAPSHOT`, `ACK`, or `ERROR` envelopes sent from the iframe back to the admin
- `buildPreviewMetricsMessage(metrics, details)` — constructs the typed `METRICS` envelope sent from the reader iframe back to the admin
- `buildPreviewTargetMessage(type, payload, details)` — constructs typed `TARGETS`,
  `TARGET_HOVER`, `TARGET_SELECT`, and `TARGET_ACTION` envelopes for live-canvas target geometry and
  interaction events
- `validatePreviewSnapshotPayload(snapshot, expected)` — validates snapshot shape, version, source, draftMode, page structure, optional `builderEditing` boolean, and identity fields
- `validatePreviewMetricsPayload(metrics, expected)` — validates viewport identity, exact preset dimensions, branch-flag booleans, and overflow offender structure
- target validators — validate target refs, viewport-relative rectangles, action names, sequence
  numbers, label lengths, and target list size
- `validatePreviewEnvelope(message, expected)` — validates any inbound `postMessage` data: unknown types are rejected, session/identity fields are checked, `SNAPSHOT` messages are forwarded to `validatePreviewSnapshotPayload`, `METRICS` messages are forwarded to `validatePreviewMetricsPayload`, and target messages are forwarded to the target validators

`preview-manager.js` now uses the full message-type registry to drive the iframe handshake,
responsive verification loop, and live target bridge: it listens for `REQUEST_SNAPSHOT` from the
iframe and responds with a `SNAPSHOT` message; it handles `ACK` by marking the frame ready, `ERROR`
by surfacing the error in the preview status bar, `METRICS` by persisting the latest responsive
measurements onto the frame dataset for optional debug display, and `TARGETS`/`TARGET_HOVER`/
`TARGET_SELECT` by rendering live-canvas overlays and routing selection through
`selectCanvasTarget(...)`. A new preview session token (`previewSession`) is minted on page/series
identity change to prevent stale message acceptance.

Working section snapshots copy the normalized draft `layout` and pruned draft `settings` together,
so unsaved structural ratios, responsive reflow, visibility, and column appearance render in the
iframe before Save while persisted page state remains unchanged.

## 🎡 Promo Renderer (promo-renderer.js)

The specialized renderer for the Promo module. Converts complex slide drafts into high-performance, CSS-driven HTML. Features a neon styling engine (hex to rgba), dynamic slide layouts, and defensive clamps on transition timing constraints.

## 🧩 Module Descriptors (module-descriptors.js)

The descriptor registry is the canonical client-side catalog for builder modules. It defines module
labels, icons, palette category, default config, editor kind, insertability, allowed parents, quick
actions, responsive fields, appearance/style sectors, source modes, and preview text.

Current exports:

- `getModuleDescriptors()` and `getModuleDescriptor(type)` expose normalized descriptors
- `getInsertableModuleDescriptors()` feeds the Blocks palette and excludes compatibility-only
  descriptors such as `header`
- `getModuleDefaultConfig(type)` supplies cloned default config for insertions
- `getModuleResponsiveOverrides(type)` and `getModuleStyleSectors(type)` drive responsive and style
  inspector surfaces
- `getModuleSourceModes(type)` and `getModuleEditorKind(type)` decide CMS source UI and
  module-specific editor routing
- `getModulePreviewText(type, config)` renders compact list/layer summaries

## 🔢 Constants Registry (constants.js)

Registries include `MODULE_TYPES`, `LAYOUT_OPTIONS`, and theme tokens like `THEME_COLORS`. `MODULE_TYPES` is derived from `module-descriptors.js` and keeps older consumers aligned with the descriptor catalog.

## 🛠️ Shared Helpers (helpers.js)

Shared helper coverage now includes deep cloning, default module-config generation, page/module display helpers, asset URL resolution, image fit and focal-point helpers, and HTML/attribute escaping logic. These helpers are shared across the extracted builder factories as well as the remaining orchestrator code.

## 🎨 Appearance Utilities (appearance-utils.js)

Shared appearance-contract helper for header shell state, header nav items, and `buttons` module items/defaults.

Key exports:

- `normalizeAppearance` — normalizes sparse `appearance` input into the shared nested shape while preserving omitted leaves as `null`
- `mergeAppearance` — deep-merges two normalized appearance objects for future theme/preset/default/override resolution
- `appearanceToInlineStyle` — converts a resolved appearance object into stable-order inline CSS for shared button rendering
- `isAppearanceEmpty` — recognizes visually empty appearance objects so storage and emission can stay sparse

Current semantics:

- `border.radius` emits whenever it is explicitly set, even when no background or visible border is present
- `border.width === 0` is treated as a meaningful override, survives merge/emptiness checks, and emits `border: none`
- buttons now consume this helper end to end in both admin preview and reader rendering paths, while header-shell appearance remains a stored contract for later UI/rendering work

## 🛡️ Sanitization Layer (sanitize.js)

The builder validation layer. Includes helpers for sanitizing builder HTML, processing URLs, and normalizing numbers/keywords cleanly to prevent data rot.

Backend parity note:

- the matching backend sanitizers now live in `backend/app/builder_security.py` as `sanitize_appearance(...)` and `sanitize_header_shell_appearance(...)`
- stored JSON omits empty `appearance` keys entirely instead of writing explicit `null`

## 🔗 Link Utilities (link-utils.js)

A shared utility library for manipulating and normalizing links across the builder. Key exports:

- `normalizeLinkTarget` — canonicalizes `builder-page`, `url`, and `anchor` link targets; sanitizes unsafe URLs
- `resolveLinkTargetHref`, `shouldOpenLinkInNewTab`, `buildReaderPageHref`,
  `buildGlobalPageHref` — routing / href resolution
- Builder-page link targets use `pageScope`; series targets preserve `seriesId` when known, while
  legacy series targets without `seriesId` resolve against the active/default series.
- `normalizeButtonItem` — normalizes a `buttons` module item, including `style: 'primary' | 'secondary'` plus optional shared `appearance`
- `normalizeHeaderNavItem` / `normalizeHeaderNavItems` — normalizes a header nav item; includes `style: 'primary' | 'secondary'` plus optional shared `appearance`, making header nav items structurally compatible with the button module's variant + appearance model
- `normalizeButtonsConfig` — normalizes a full `buttons` module config, including `defaults.appearance` while preserving unrelated config fields

## 📖 Current Module Catalog

The builder currently recognizes these module types:
`header`, `text`, `image`, `gallery`, `video`, `social`, `email-signup`, `promo`, `buttons`, `spacer`, `divider`, `reader`, `entry-gallery`, `feed`, `media-gallery`, `html`.

CMS-backed modules:

- `reader`: comic reader mount; source can be the active page series or a specific series.
- `entry-gallery`: entry thumbnail grid; source can be active page series, a specific series, or all
  public series data.
- `feed`: site-wide post/feed module using existing `/api/posts` behavior.
- `media-gallery`: site-wide media-library grid using `/media.json`; private media is filtered out
  client-side and protected media URLs keep the existing protected access route.

The Add Page modal provides Blank, Reader, Feed, Media Gallery, and Entry Gallery templates. These
templates create ordinary page, section, and module records; the Reader template is series-only,
inserts one Comic Reader module, and only assigns the reader binding when the active series does not
already have one. Slug `reader`, `pageType: "reader"`, or an existing binding alone is not enough to
make a page a canonical series reader page.

Again: `header` is compatibility-only in the catalog and is not part of the normal insertable palette.

## 📜 Important Accuracy Notes

- The builder's mutable UI state is still primarily coordinated in `admin/page-builder.js`, not in `data.js`, but major workflow clusters now live in focused factories: `draft-manager.js`, `page-actions.js`, `canvas-mutations.js`, and `preview-manager.js`.
- Header editing is page-scoped through `page.meta.header`, not primarily through a normal `header` module.
- The admin canvas is an editing surface with builder chrome. Live mode and chrome-collapsed Preview both render through the same real reader iframe (`index.html?builderPreview=1`) for full reader-shell parity, not through a constrained div or the direct `preview-renderers.js` path.
- Shared renderer parity exists at the module/section/page HTML level through `shared-renderers.js`. The iframe preview approach means real viewport dimensions, real media queries, and real reader-side JavaScript all run in preview.
- The iframe preview bridge (`reader/preview-bridge.js`) and the `postMessage` protocol defined in `preview-contract.js` are implemented. The snapshot merge path covers module config, theme metadata, normalized header metadata, page settings, and section spacing without mutating `currentPage`. Validated live-builder snapshots can opt into `builderEditing` markers; public reader output keeps admin-only `data-builder-*` attributes absent. In builder editing mode, target messages drive admin-only hover/selection overlays and block iframe links/forms before reader side effects can fire. Chrome-collapsed Preview deliberately sends `builderEditing: false`, so target messages stop while the reader stays in builder preview side-effect-suppressed mode.
- Bound reader pages warn before delete, section-delete, or current-device hide actions would leave
  the page without exactly one visible Comic Reader module. Confirmed draft edits can proceed, but
  backend publish and reader-binding saves reject invalid bound reader pages with stable warning
  codes. The backend binding rule is Desktop visibility; hiding the bound reader only on Tablet or
  Phone shows advisory authoring copy instead of a publish/binding-blocking warning.
- Responsive parity instrumentation is also implemented: the iframe keeps exact preset dimensions, the admin preview scale shell can shrink the visible presentation without changing iframe pixels, and preview metrics verify breakpoint branches, two-page mode expectations, and horizontal overflow risks.
- Legacy `page-config` and legacy `header` module content still exist as migration/backfill inputs. Normal reader startup and page-builder header editing resolve V3 page headers with `pageConfig: null`; stored legacy `header` modules are later cleanup debt once V3 metadata exists.

## 🧭 Maintenance Rule

Update this document when `admin/page-builder.js` changes orchestration ownership, a
`admin/page-builder/*.js` module is added or removed, the descriptor catalog changes, the preview
message contract changes, responsive override semantics change, or a builder module gains/removes
public rendering, editing, source, style, or persistence behavior.

## 📚 Related Docs

- [docs/BUILDER_PLAN.md](/srv/bw-quality/docs/BUILDER_PLAN.md)
- [docs/functions/admin-core.md](/srv/bw-quality/docs/functions/admin-core.md)
- [docs/functions/admin-page-builder-styles.md](/srv/bw-quality/docs/functions/admin-page-builder-styles.md)
- [docs/functions/reader-core.md](/srv/bw-quality/docs/functions/reader-core.md)
