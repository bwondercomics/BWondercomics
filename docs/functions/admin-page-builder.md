# Admin Page Builder Logic

This document describes the current builder runtime under `admin/page-builder/` and `admin/page-builder.js`.

## Table of Contents

- [💡 Scope & Canonical Entry](#-scope--canonical-entry)
- [💾 Current Data Model](#-current-data-model)
- [⚙️ Current Builder Flow](#️-current-builder-flow)
- [🔌 Builder Orchestrator (admin/page-builder.js)](#-builder-orchestrator-adminpage-builderjs)
- [📐 Layout Utilities (layout.js)](#-layout-utilities-layoutjs)
- [📝 Draft Manager (draft-manager.js)](#-draft-manager-draft-managerjs)
- [🚚 Page Actions (page-actions.js)](#-page-actions-page-actionsjs)
- [🧱 Canvas Mutations (canvas-mutations.js)](#-canvas-mutations-canvas-mutationsjs)
- [👁️ Preview Manager (preview-manager.js)](#️-preview-manager-preview-managerjs)
- [💾 Data API (data.js)](#-data-api-datajs)
- [🏗️ Header Configuration (header-config.js)](#️-header-configuration-header-configjs)
- [📝 Header Editor (header-editor.js)](#-header-editor-header-editorjs)
- [🎨 Theme Editor (theme-editor.js)](#-theme-editor-theme-editorjs)
- [🎛️ Inspector Shell (editor-panel.js)](#️-inspector-shell-editor-paneljs)
- [📂 Sidebar Rail (sidebar-panel.js)](#-sidebar-rail-sidebar-paneljs)
- [🖌️ Canvas Renderer (canvas-renderer.js)](#️-canvas-renderer-canvas-rendererjs)
- [🖱️ Canvas Events (canvas-events.js)](#️-canvas-events-canvas-eventsjs)
- [🧩 Base Module Editor (module-editor.js)](#-base-module-editor-module-editorjs)
- [🔘 Button Editor (button-editor.js)](#-button-editor-button-editorjs)
- [➖ Divider Editor (divider-editor.js)](#-divider-editor-divider-editorjs)
- [🖼️ Gallery Editor (gallery-editor.js)](#️-gallery-editor-gallery-editorjs)
- [🎬 Video Editor (video-editor.js)](#-video-editor-video-editorjs)
- [📚 Entry Gallery Editor (entry-gallery-editor.js)](#-entry-gallery-editor-entry-gallery-editorjs)
- [🦋 Social Editor (social-editor.js)](#-social-editor-social-editorjs)
- [🎠 Promo Editor (promo-editor.js)](#-promo-editor-promo-editorjs)
- [🏭 Shared Renderers (shared-renderers.js)](#-shared-renderers-shared-renderersjs)
- [👁️ Preview Renderers (preview-renderers.js)](#️-preview-renderers-preview-renderersjs)
- [🎡 Promo Renderer (promo-renderer.js)](#-promo-renderer-promo-rendererjs)
- [🔢 Constants Registry (constants.js)](#-constants-registry-constantsjs)
- [🛠️ Shared Helpers (helpers.js)](#️-shared-helpers-helpersjs)
- [🛡️ Sanitization Layer (sanitize.js)](#️-sanitization-layer-sanitizejs)
- [🔗 Link Utilities (link-utils.js)](#-link-utilities-link-utilsjs)
- [📖 Current Module Catalog](#-current-module-catalog)
- [📜 Important Accuracy Notes](#-important-accuracy-notes)
- [📚 Related Docs](#-related-docs)

## 💡 Scope & Canonical Entry

The builder is the admin authoring surface for series-scoped pages backed by `BuilderPage`, `BuilderSection`, and `BuilderModule`. It is not a freeform visual editor. The builder works with explicit page, section, and module records plus page-level metadata in `page.meta`.

### Canonical Entry

The canonical builder route is the admin shell route:

- `admin/index.html?view=designer&series=<id>&page=<slug>&surface=header`

Current routing behavior:

- `admin/page-builder.js` owns the builder lifecycle inside the main admin shell.
- `admin/designer.html` remains only as a redirect bridge into the shell route.
- The builder can deep-link to a specific page slug and initial surface such as `header`.

## 💾 Current Data Model

### Page

Current page-level fields include: `slug`, `title`, `pageType`, `isPublished`, `isHomepage`, `sortIndex`, and `meta`.
Current page-level `meta` ownership: `meta.header`, `meta.theme`, `meta.panelBackgrounds`, and `meta.panelSpacing`.

### Section

Sections currently own: `layout`, `sortIndex`, and `settings`.

### Module

Modules currently own: `moduleType`, `columnIndex`, `sortIndex`, and `config`.

## ⚙️ Current Builder Flow

1. `admin/page-builder.js` loads the page list for the active series with `fetchPages(...)`.
2. The selected page is resolved from the route or first available page.
3. The active page detail is loaded with `fetchPage(...)`.
4. The full-page shell hides normal admin chrome and renders the top toolbar plus unified side
   panel.
5. The side panel is rendered by `sidebar-panel.js` and exposes Pages, Modules, Layers, Settings,
   and Styles.
6. The default canvas is the live iframe preview rendered by `preview-manager.js`.
7. The structural canvas is still rendered by `canvas-renderer.js` as the temporary
   **Structure Debug** fallback.
8. User actions call `data.js` mutators, update local state, then rerender affected surfaces.

There is no separate long-lived client-side draft store in `data.js`. `admin/page-builder.js` still owns the top-level mutable builder state and composition root, while focused factories now own specific workflows: `draft-manager.js` handles draft normalization/save-discard flows, `page-actions.js` handles page lifecycle actions, `canvas-mutations.js` handles structural section/module mutations, and `preview-manager.js` handles the iframe preview handshake/render path.

Fallback-retirement readiness is a separate developer workflow, not part of the normal editor boot path: the page list from `fetchPages(...)` is intentionally summary-only, so any runtime-fallback audit must hydrate each page with `fetchPage(...)` or use `loadFallbackRetirementGate(...)` before calling `auditPagesFallbacks(...)`.

## 🔌 Builder Orchestrator (admin/page-builder.js)

This is the main coordinator. It owns the remaining top-level mutable builder state and wires together the rail, canvas, inspector, and extracted manager modules.
Its responsibilities include:

- loading page lists and the active page
- keeping the current series and selected page in sync with the route
- tracking selected surface, selected module, active section, and insertion targets
- storing the builder-wide state consumed by the extracted factories, including current page, selection state, dirty scope, canvas mode, and active preview width
- instantiating `createDraftManager(...)`, `createPageActions(...)`, `createCanvasMutations(...)`, and `createPreviewManager(...)`
- `normalizeHeaderDraft` resolves normal headers with `pageConfig: null` and tags a `source` field (`page-meta-v3`, `page-meta-stale`, `legacy-import`) so migration-only badges can flag non-canonical header records
- delegating draft saves/discards, publish/page actions, structural mutations, and preview synchronization to those focused factories
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
  available through **Structure Debug** and is also kept as a hidden fallback surface so existing
  module/section editing flows remain reachable until direct live-canvas selection lands.
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

## 📝 Draft Manager (draft-manager.js)

This factory owns the explicit local-draft lifecycle for builder surfaces that save intentionally rather than immediately.

Current responsibilities:

- normalize theme and header draft state from the active page
- initialize drafts for modules, theme, header, page settings, and section settings
- clear selected module / active section draft state when selection changes
- save and discard module drafts through `updateModule(...)`
- save and discard theme, header, and page-settings drafts through `updatePage(...)`
- reset theme drafts back to the default theme token set

The draft manager does not own the canonical source of truth for builder state; it receives state and setters from `admin/page-builder.js` and mutates them through the injected action contract.

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

## 👁️ Preview Manager (preview-manager.js)

This factory owns the admin side of the iframe-based reader preview.

Current responsibilities:

- build iframe URLs with `builderPreview=1`, the active page slug/id, and the current preview session token
- derive preview identity from the active series/page/draft state
- clone the current page into a preview snapshot and merge the active local dirty draft when needed
  through the internal snapshot helper
- send `SNAPSHOT` messages to the reader iframe and answer `REQUEST_SNAPSHOT`
- validate inbound `ACK`, `ERROR`, and `METRICS` messages through `validatePreviewEnvelope(...)`
- apply exact preset width/height styles to both `.pb-preview-frame` and `.pb-preview-iframe`
- store responsive metrics on `.pb-preview-frame.dataset`, including inner dimensions, branch flags, and overflow offenders
- render the admin-side preview debug overlay when metrics are present and debug mode is enabled
- update `.pb-preview-frame` dataset attributes and `.pb-preview-status` copy
- render the default live canvas and rerender the preview frame whenever live mode, dirty draft, or
  viewport state changes

The snapshot merge path covers the dirty scopes owned by the explicit-save editor model:
`module`, `theme`, `header`, `page-settings`, and `section`. It always works on a cloned page
snapshot so previewing unsaved changes does not mutate `currentPage`.

`admin/page-builder.js` still owns the top-level `canvasMode` and `previewWidth` state, but the preview handshake/render logic itself is no longer inlined there.

## 💾 Data API (data.js)

This is the backend API layer for builder records. Current fetchers and mutators include:

- `fetchPages(seriesId)`, `fetchPage(pageId)`
- `createPage`, `deletePage`, `reorderPages`, `updatePage`
- `addSection`, `updateSection`, `deleteSection`, `reorderSections`
- `addModule`, `updateModule`, `moveModule`, `reorderModules`, `deleteModule`
- `fetchAssets`, `uploadAsset`

Because `fetchPages(seriesId)` returns page summaries without hydrated `sections`/`modules`, it is not sufficient input for `auditPagesFallbacks(...)` when validating runtime-fallback retirement.

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

## 📂 Sidebar Rail (sidebar-panel.js)

This file renders the unified side panel. Current responsibilities:

- page list rendering and selection
- page drag/drop reorder
- module palette rendering (palette excludes `header`)
- layer tree rendering for page settings, page header, sections, and modules
- Pages, Modules, Layers, Settings, and Styles tab switching
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
iframe; Structure Debug keeps existing module/section editing reachable until the later
live-canvas selection and overlay phases replace those interactions.

## 🖱️ Canvas Events (canvas-events.js)

Coordinates all user interactions within the `#pbCanvas` through a factory pattern.

- **`createCanvasEventBinder`**: Returns a `bindCanvasEvents` function. Detaches business logic from DOM events by delegating operations.
- **Section/Module Management**: Handles drag & drop reordering, layout changes, module selection clicks, target deletion.
- **Global Selection**: Hooks up buttons for selecting the Page Header and Page Settings from the canvas.

## 🧩 Base Module Editor (module-editor.js)

This is the shared module inspector renderer and binder. Generic field rendering exists for modules that do not have a dedicated editor, and dedicated editors are delegated based on the config. A raw JSON config card exists as a fallback.

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

- `PREVIEW_VIEWPORTS` and `PREVIEW_VIEWPORT_ORDER` — canonical Desktop, Tablet, and Mobile presets with exact iframe dimensions (`1280x900`, `768x1024`, `375x812`)
- `PREVIEW_MEDIA_QUERIES` — named responsive `matchMedia(...)` probes used for parity metrics (`aspectMax7By5`, `aspectMax5By7`, `maxWidth768`, `maxWidth480`)
- `BUILDER_PREVIEW_SNAPSHOT_VERSION` — version marker for builder preview payloads
- `BUILDER_PREVIEW_SOURCES` — `saved` for hydrated API pages and `working` for cloned snapshots that include an active local draft
- `BUILDER_PREVIEW_MESSAGE_TYPES` — `REQUEST_SNAPSHOT`, `SNAPSHOT`, `ACK`, `ERROR`, `METRICS`; the full `postMessage` type registry shared by sender and receiver
- `DEFAULT_BUILDER_PREVIEW_SIDE_EFFECTS` — default preview policy for disabling or stubbing mutating reader behavior
- `getPreviewViewport(...)`, `isPreviewViewportId(...)`, `isPreviewSource(...)`, `isPreviewMessageType(...)`, and `getPreviewStatusCopy(...)` — small validation/copy helpers
- `buildPreviewSnapshotMessage(snapshot, previewSession)` — constructs the typed `SNAPSHOT` envelope sent from the admin to the iframe
- `buildPreviewControlMessage(type, details)` — constructs `REQUEST_SNAPSHOT`, `ACK`, or `ERROR` envelopes sent from the iframe back to the admin
- `buildPreviewMetricsMessage(metrics, details)` — constructs the typed `METRICS` envelope sent from the reader iframe back to the admin
- `validatePreviewSnapshotPayload(snapshot, expected)` — validates snapshot shape, version, source, draftMode, page structure, and identity fields
- `validatePreviewMetricsPayload(metrics, expected)` — validates viewport identity, exact preset dimensions, branch-flag booleans, and overflow offender structure
- `validatePreviewEnvelope(message, expected)` — validates any inbound `postMessage` data: unknown types are rejected, session/identity fields are checked, `SNAPSHOT` messages are forwarded to `validatePreviewSnapshotPayload`, and `METRICS` messages are forwarded to `validatePreviewMetricsPayload`

`preview-manager.js` now uses the full message-type registry to drive the iframe handshake and responsive verification loop: it listens for `REQUEST_SNAPSHOT` from the iframe and responds with a `SNAPSHOT` message; it handles `ACK` by marking the frame ready, `ERROR` by surfacing the error in the preview status bar, and `METRICS` by persisting the latest responsive measurements onto the frame dataset for optional debug display. A new preview session token (`previewSession`) is minted on page/series identity change to prevent stale message acceptance.

## 🎡 Promo Renderer (promo-renderer.js)

The specialized renderer for the Promo module. Converts complex slide drafts into high-performance, CSS-driven HTML. Features a neon styling engine (hex to rgba), dynamic slide layouts, and defensive clamps on transition timing constraints.

## 🔢 Constants Registry (constants.js)

Registries include `MODULE_TYPES`, `LAYOUT_OPTIONS`, and theme tokens like `THEME_COLORS`. `MODULE_TYPES` is consumed by the picker palette.

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
- `resolveLinkTargetHref`, `shouldOpenLinkInNewTab`, `buildReaderPageHref` — routing / href resolution
- `normalizeButtonItem` — normalizes a `buttons` module item, including `style: 'primary' | 'secondary'` plus optional shared `appearance`
- `normalizeHeaderNavItem` / `normalizeHeaderNavItems` — normalizes a header nav item; includes `style: 'primary' | 'secondary'` plus optional shared `appearance`, making header nav items structurally compatible with the button module's variant + appearance model
- `normalizeButtonsConfig` — normalizes a full `buttons` module config, including `defaults.appearance` while preserving unrelated config fields

## 📖 Current Module Catalog

The builder currently recognizes these module types:
`header`, `text`, `image`, `gallery`, `video`, `social`, `email-signup`, `promo`, `buttons`, `spacer`, `divider`, `reader`, `entry-gallery`, `feed`, `html`.

Again: `header` is compatibility-only in the catalog and is not part of the normal insertable palette.

## 📜 Important Accuracy Notes

- The builder's mutable UI state is still primarily coordinated in `admin/page-builder.js`, not in `data.js`, but major workflow clusters now live in focused factories: `draft-manager.js`, `page-actions.js`, `canvas-mutations.js`, and `preview-manager.js`.
- Header editing is page-scoped through `page.meta.header`, not primarily through a normal `header` module.
- The admin canvas is an editing surface with builder chrome. Preview mode now renders through a real reader iframe (`index.html?builderPreview=1`) for full reader-shell parity, not through a constrained div or the direct `preview-renderers.js` path.
- Shared renderer parity exists at the module/section/page HTML level through `shared-renderers.js`. The iframe preview approach means real viewport dimensions, real media queries, and real reader-side JavaScript all run in preview.
- The iframe preview bridge (`reader/preview-bridge.js`) and the `postMessage` protocol defined in `preview-contract.js` are implemented. The snapshot merge path covers module config, theme metadata, normalized header metadata, page settings, and section spacing without mutating `currentPage`.
- Phase 5 responsive parity instrumentation is also implemented: the iframe now keeps exact preset dimensions, the admin preview canvas scrolls instead of shrinking those presets, and preview metrics now verify breakpoint branches, two-page mode expectations, and horizontal overflow risks.
- Legacy `page-config` and legacy `header` module content still exist as migration/backfill inputs. Normal reader startup and page-builder header editing resolve V3 page headers with `pageConfig: null`; stored legacy `header` modules are later cleanup debt once V3 metadata exists.

## 📚 Related Docs

- [docs/BUILDER_PLAN.md](/srv/bw-quality/docs/BUILDER_PLAN.md)
- [docs/functions/admin-core.md](/srv/bw-quality/docs/functions/admin-core.md)
- [docs/functions/admin-page-builder-styles.md](/srv/bw-quality/docs/functions/admin-page-builder-styles.md)
- [docs/functions/reader-core.md](/srv/bw-quality/docs/functions/reader-core.md)
