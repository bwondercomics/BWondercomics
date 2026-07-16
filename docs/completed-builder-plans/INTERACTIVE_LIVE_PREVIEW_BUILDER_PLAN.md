# Full-Page Live Builder Plan, Part 1 of 2

Consolidated with completed builder plans: 2026-07-16.

Status: Complete - Phases 1-5 implemented; companion Part 2 Phases 6-12 are also complete
Plan state: This file is complete for its scoped phases. Phases 1, 2, 3, 4, and 5 have dated
completion notes below and should be treated as current Part 1 behavior unless a later corrective
note says otherwise. Part 2 phases 6-12 also have dated completion/corrective notes and should be
treated as the shipped continuation of this plan.
Scope of this file: shared direction, references, target model, and Phases 1-5.
Companion file: [Part 2 - Phases 6-12, risks, and implementation order](INTERACTIVE_LIVE_PREVIEW_BUILDER_PLAN_P2.md)
Reference source: `docs/website-references/grapesjs-dev`
Owner surface: `admin/page-builder/`, `reader/`, shared builder renderers, builder backend routes, and builder tests

## Reading Map

This document is Part 1 of one two-part plan. Read it before Part 2 when implementing the feature,
because later phases depend on the product direction, data contracts, and iframe-editing assumptions
defined here.

Part 1 contains:

- [Purpose](#purpose)
- [Product Direction](#product-direction)
- [Trusted References](#trusted-references)
- [Reference Conclusions](#reference-conclusions)
- [Target Experience and Current State](#target-experience-and-current-state)
- [Page and Module Model Direction](#page-and-module-model-direction)
- [Phase 1 - Full-Page Builder Shell](#phase-1---full-page-builder-shell)
- [Phase 2 - Live Canvas as the Editor](#phase-2---live-canvas-as-the-editor)
- [Phase 3 - Canvas Interaction Bridge and Overlays](#phase-3---canvas-interaction-bridge-and-overlays)
- [Phase 4 - Device Modes and Per-Device Overrides](#phase-4---device-modes-and-per-device-overrides)
- [Phase 5 - Side Panel as Blocks, Layers, Traits, and Styles](#phase-5---side-panel-as-blocks-layers-traits-and-styles)

Part 2 contains:

- [Phase 6 - Drag/drop and toolbar actions](INTERACTIVE_LIVE_PREVIEW_BUILDER_PLAN_P2.md#phase-6---drag-drop-move-and-inline-toolbar-actions)
- [Phase 7 - Preview Chrome Collapse](INTERACTIVE_LIVE_PREVIEW_BUILDER_PLAN_P2.md#phase-7---preview-chrome-collapse)
- [Phase 8 - Page Scope and Routing Migration](INTERACTIVE_LIVE_PREVIEW_BUILDER_PLAN_P2.md#phase-8---page-scope-and-routing-migration)
- [Phase 9 - Special CMS Modules](INTERACTIVE_LIVE_PREVIEW_BUILDER_PLAN_P2.md#phase-9---special-cms-modules)
- [Phase 10 - Commands, keymaps, and undo](INTERACTIVE_LIVE_PREVIEW_BUILDER_PLAN_P2.md#phase-10---command-keymap-and-undo-foundation)
- [Phase 11 - Inline Editing](INTERACTIVE_LIVE_PREVIEW_BUILDER_PLAN_P2.md#phase-11---inline-editing)
- [Phase 12 - Testing and Release Gates](INTERACTIVE_LIVE_PREVIEW_BUILDER_PLAN_P2.md#phase-12---testing-and-release-gates)
- [Risks and Guardrails](INTERACTIVE_LIVE_PREVIEW_BUILDER_PLAN_P2.md#risks-and-guardrails)
- [Suggested Implementation Order](INTERACTIVE_LIVE_PREVIEW_BUILDER_PLAN_P2.md#suggested-implementation-order)

## Developer and LLM Notes

- Treat both files as one completed implementation history for the full-page live builder. Part 1
  defines the foundation; Part 2 records the later authoring, routing, command, inline-editing, and
  release-gate work.
- Treat historical phase bodies as the original plan and dated completion/corrective notes plus
  current source as the behavior record. Test plans and acceptance criteria in old phase bodies are
  implementation history, not proof that a gate passed on a later date.
- For new implementation after the completed split plan, start from the current source and the
  relevant follow-up plan, such as
  `docs/completed-builder-plans/READER_BLOCK_AND_LAYOUT_CUSTOMIZATION_PLAN.md`, unless the
  user explicitly asks for an audit or corrective patch to an earlier phase.
- Keep the saved builder records as the source of truth. Browser DOM, iframe output, and overlays
  are views or editing affordances only.
- When closing a phase, add concrete completion notes and verification results instead of replacing
  the phase history.

## Purpose

This plan adapts the useful parts of GrapesJS into the BWonderComics builder as a full-page live
editor. The completed Part 1 work establishes the live page canvas as the primary authoring surface:
the builder opens as a full-page workspace with a top toolbar and side panel, and authors select and
inspect the rendered page directly instead of relying on a separate preview panel.

Part 2 completed the transition. Structural insertion/movement now happens on the live canvas,
editor chrome can collapse for preview mode, explicit page scopes and CMS modules exist, and command
routing, guarded keymaps, local draft undo, release gates, and text-module inline editing are in
place.

The plan keeps BWonderComics' custom CMS behavior. Modules such as reader, feed, entry picker, and
media gallery must continue to connect to the entry-management system, series data, protected media,
and feed behavior. The direction is to make comic page, feed page, and media gallery page behaviors
available as modules that can be placed inside normal builder pages.

## Product Direction

Through Phase 5, the editor is closer to GrapesJS than the original builder shell:

- the builder takes over the whole admin page when opened
- the top toolbar owns page actions, device mode, live/structure toggle, save/publish, and menu
  visibility
- the side panel owns pages, descriptor-backed blocks, layers, settings, styles, and selected-target
  controls
- the center canvas is the real page render and supports direct hover/selection overlays, target
  synchronization, and selected-target toolbar chrome
- desktop, tablet, and phone display modes are first-class editing targets
- each display mode can have element-level overrides where the data contract supports them

Part 2 keeps these target behaviors planned, but not yet implemented:

- live drag/drop insertion and module movement on the iframe canvas
- preview mode that hides editor chrome and restores it with a small menu button
- centralized commands, keymaps, undo/redo, and inline editing

The target content model remains broader than the current series-scoped page model:

- every series still has an attached reader page
- site pages can exist outside a specific series
- comic/reader, feed, and media gallery behaviors are structured modules that can be placed inside
  pages where the module catalog supports them
- authors can still create dedicated reader, feed, or gallery pages by building a page around the
  corresponding module

## Trusted References

Local GrapesJS reference:

- `docs/website-references/grapesjs-dev/docs/README.md` - GrapesJS is a builder framework for
  HTML-like structures, which supports using BWonderComics' structured module tree instead of
  arbitrary saved HTML.
- `docs/website-references/grapesjs-dev/docs/modules/Components.md` - Components separate the
  source-of-truth model from the canvas view. BWonderComics should keep `BuilderPage`,
  `BuilderSection`, and `BuilderModule` as canonical records while the live canvas is only the view.
- `docs/website-references/grapesjs-dev/docs/modules/Canvas.md` and
  `packages/core/src/canvas/model/CanvasSpot.ts` - Canvas spots are overlay elements for hover,
  selection, target, spacing, and resize UI. This maps to admin-only overlays on top of the reader
  iframe/live canvas.
- `packages/core/src/commands/view/SelectComponent.ts` - GrapesJS centralizes hover/select handling
  inside the canvas frame, recalculates geometry on scroll/resize/update, and separates local hover
  tools from selected-component tools.
- `docs/website-references/grapesjs-dev/docs/modules/Blocks.md` - Blocks are reusable component
  templates. The BWonderComics descriptor-backed module palette now acts as the block manager.
- `docs/website-references/grapesjs-dev/docs/modules/Traits.md` - Traits are selected-component
  settings. BWonderComics' existing module editors now act as selected-module settings panels.
- `docs/website-references/grapesjs-dev/docs/modules/Style-manager.md` - Style sectors and
  properties provide a reference for constrained appearance controls.
- `docs/website-references/grapesjs-dev/docs/modules/Commands.md`,
  `docs/website-references/grapesjs-dev/docs/api/undo_manager.md`, and
  `packages/core/src/keymaps/config.ts` - Commands, undo/redo, and keymaps should be centralized
  before the live editor exposes broad shortcuts.
- `packages/core/src/device_manager/model/Device.ts` and
  `packages/core/src/device_manager/index.ts` - Device selection changes the canvas frame size.
  BWonderComics already has Desktop, Tablet, and Mobile preview dimensions, but this plan promotes
  them from preview presets to editable device targets.

Current BWonderComics reference:

- `docs/functions/admin-page-builder.md` - Current builder architecture, explicit draft lifecycle,
  preview handshake, live target overlays, shared renderers, responsive overrides, descriptor-backed
  blocks, layers, settings, styles, and module catalog.
- `docs/completed-builder-plans/BUILDER_PLAN.md` - Current implementation snapshot: pages are
  series-scoped, preview uses a
  same-origin reader iframe, and the builder recognizes `reader`, `entry-gallery`, and `feed`
  modules.
- `backend/app/models.py`, `backend/app/page_store.py`, and `backend/app/routes/page_builder.py` -
  Current backend stores builder pages with `series_id`, `page_type`, sections, and modules.
- `admin/page-builder/shared-renderers.js` and `reader/page-renderer.js` - Shared module/page
  rendering path that must remain the source of live page output.
- `reader/data.js` and `reader/app.js` - Reader-side page loading and DOM application for builder
  pages.

## Reference Conclusions

1. Use GrapesJS as an architecture reference, not as a runtime dependency for the canonical page
   model.
2. Do not preserve the structural canvas as the long-term editor. It remains as a temporary fallback
   for structural flows until Phase 6, but the live canvas is now the primary editor.
3. Keep BWonderComics modules structured and backend-sanitized. The page is still built from typed
   modules, not arbitrary DOM saved from the browser.
4. Desktop, Tablet, and Phone have been promoted from preview-only viewports into editable device
   contexts.
5. Do not flatten custom comic behavior into static pages. Reader, feed, entry picker, and gallery
   modules must remain connected to series entries, media, permissions, and existing feed logic.
6. Change the page model deliberately. Moving from series-scoped pages to site pages plus
   series-attached reader pages requires backend schema, routing, admin UX, and migration work.

## Target Experience and Current State

Current Part 1 behavior when the builder opens:

- the admin shell gives the builder the full page
- a top toolbar remains fixed above the canvas
- a side panel can switch between Pages, Blocks, Layers, Settings, and Styles
- the canvas shows the live page render at the selected device size
- clicking a rendered element selects it and opens its controls in the side panel
- selected elements show GrapesJS-style hover/selection outlines and compact selected-target toolbar
  chrome
- Save/Publish remains explicit unless a later autosave policy is intentionally designed
- **Structure Debug** remains as the fallback surface for structural insertion, ordering, and delete
  flows that Phase 6 moves onto the live canvas

Device editing:

- Desktop, Tablet, and Phone are toolbar modes
- each mode changes the canvas frame dimensions
- authors can select the same module in any device mode
- module and section controls can store per-device overrides only for supported fields
- unsupported fields remain global and clearly apply to every device
- render resolution uses this order: device override -> global module/section/page setting ->
  theme/default

Preview:

- the current live canvas stays inside editor chrome and uses the same reader iframe path as the
  saved page output
- editor overlays appear only while `builderEditing` is active
- chrome-free preview collapse and the restore-menu button remain Part 2 Phase 7 work
- preview side effects remain disabled in builder preview sessions

## Page and Module Model Direction

### Page Scope

Current state:

- `BuilderPage` is scoped by `series_id`
- public page routes are shaped around `/api/pages/{series_id}/{slug}`
- admin page lists are loaded by `series_id`

Target state:

- site pages can be global and not tied to a series
- series-attached pages still exist where series context is required
- each series has one attached reader page, either as a series-owned page or a global page with a
  series binding
- page links can target global pages or series-attached pages without ambiguity

Proposed page fields:

- `scope`: `site` or `series`
- `seriesId`: required only for `scope=series`
- `slug`, `title`, `pageType`, `isPublished`, `isHomepage`, `sortIndex`, `meta`
- optional `bindings` for route roles such as `reader`, `feed`, or `gallery`

### Special Modules

Reader, feed, and entry-gallery are already structured builder modules. Part 2 keeps the broader CMS
module work planned for comic page, feed page, media gallery page, and page-scope routing:

- `comic-reader` or current `reader` module: renders the comic reading experience for a selected
  or active series
- `feed` module: renders updates/feed content, with configurable source, range, layout, and entry
  linking
- `media-gallery` module: renders media library/gallery content with access-aware image behavior
- `entry-gallery` remains an entry-picker/gallery module and can share source controls with the
  reader/feed/gallery modules

These modules must support:

- active series context when the page is series-bound
- explicit series selection when placed on a global page
- existing entry-management data
- premium/protected media behavior
- existing feed-page behavior
- draft/preview safety

## Phase 1 - Full-Page Builder Shell

Goal: Make the builder own the full admin viewport and establish the GrapesJS-style chrome.

Implementation:

- Add a full-page builder route/state that hides normal admin dashboard chrome while active.
- Replace the current split builder layout with:
  - top toolbar
  - collapsible side panel
  - canvas viewport
  - overlay layer
- Move current page actions, save/publish, device controls, preview toggle, and page status into
  the top toolbar.
- Move page list, module palette, selected target controls, layers, settings, and styles into the
  side panel.
- Keep current sidebar/inspector code only as migration input; the target UI should not feel like
  the old structural canvas with a preview bolted on.

Acceptance criteria:

- Opening the builder fills the page.
- The top toolbar and side panel are the only editor chrome.
- Existing page selection, save, publish, and module editing controls remain reachable.
- The old structural canvas can be hidden behind a temporary debug/fallback affordance, but it is
  not the primary authoring surface.

Detailed implementation plan:

Summary:

- Convert the existing admin page builder into a full-viewport editor shell: normal admin header/nav
  hidden, a fixed builder toolbar on top, one collapsible side panel, a central live canvas viewport,
  and an empty overlay layer reserved for later selection/hover UI.
- Use the existing `view=designer` route as the full-page route; do not add backend APIs or schema
  changes.

Important public interface/type changes:

- No backend API, database schema, or saved builder-record contract changes.
- Add builder-shell DOM affordances for `pbBuilderToolbar`, `pbBuilderSidePanel`,
  `pbCanvasViewport`, and `pbCanvasOverlay`.
- Keep existing `pbCanvas`, `pbPageTitle`, `pbViewToggles`, `pbWidthToggles`, `pbSaveDraft`,
  `pbPublish`, `pbPageList`, `pbModulePalette`, and `pbModuleEditor` roles reachable so existing
  event binding can migrate without changing save/publish behavior.

Key changes:

- Update the shell markup so `pbBuilderToolbar` owns page title/status, Add Page, device controls,
  Live/Structure Debug toggle, Save Draft, Publish, side-panel toggle, and an Exit/Back control.
- Change `showPageBuilderSection()` so it activates full-shell state by default:
  - keep `admin-page-builder-open` as the shell class
  - hide normal admin header/nav via CSS while active
  - keep route shape as `admin/index.html?view=designer&series=...&page=...&surface=header`
  - make Exit return to the dashboard through an injected callback rather than relying on admin nav
    visibility
- Make the live iframe preview the primary canvas view for Phase 1, using the existing
  `preview-manager.js` path and always-visible device controls.
- Keep the structural canvas behind a small `Structure Debug` fallback affordance only.
- Replace the old left-sidebar/right-inspector split with one side panel:
  - Pages uses the existing page list renderer
  - Blocks uses the module palette; after Phase 5 this is descriptor-backed and grouped by category
  - Layers renders a simple current-page tree from sections/modules and can select a module, header,
    or page settings
  - Settings renders the existing selected target editor
  - Styles renders the existing theme/style controls
- Update layout CSS to use a full-viewport grid with toolbar row and workspace row, no section-card
  border/padding around the builder, side-panel collapse to a narrow rail on desktop, drawer-style
  behavior on small screens, and an overlay layer above the canvas with `pointer-events: none` until
  later phases.

Test plan:

- Update builder shell tests to cover:
  - builder route opens full-page and hides admin header/nav
  - toolbar contains page actions, status, save/publish, view/device controls
  - side-panel tabs expose Pages, Blocks, Layers, Settings, Styles
  - structural canvas is not default and only appears through fallback
  - live preview iframe remains same-origin with existing `builderPreview=1` behavior
- Add responsive assertions for desktop and narrow viewport side-panel collapse.
- Run targeted shell tests first: `npm test -- tests/admin-page-builder-shell.test.js`.
- Final gate: `npm test`, `npm run test:visual`, `npm run build`, `git diff --check`.

Assumptions:

- Phase 1 does not implement direct iframe selection, drag/drop overlays, inline editing, or
  chrome-free preview restore; those remain later phases.
- GrapesJS remains an architecture reference only; no runtime dependency is added.
- Existing builder records remain the source of truth; DOM/iframe output is still a rendered view.
- Active series changes from inside the full-page builder are out of scope; the toolbar shows series
  context, and changing series happens after exiting the builder.

Completion note (`2026-05-30`):

Phase 1 is implemented for the full-page builder shell. The admin page builder now opens with
normal admin header/nav hidden behind `admin-page-builder-open`, renders a top toolbar with page
status/actions, save/publish, live/structure toggle, exact device controls, side-panel toggle, and an
Exit action, and uses a single side panel for Pages, Blocks, Layers, Settings, and Styles. The live
same-origin iframe preview is now the default canvas using the existing `builderPreview=1` /
`previewSession` path; the structural canvas remains available through `Structure Debug` and is kept
as a hidden fallback surface while live mode is active so structural insertion, ordering, and delete
flows remain reachable until Phase 6 moves them onto the live canvas. `pbBuilderToolbar`,
`pbCanvasViewport`, and `pbCanvasOverlay` are present as planned shell anchors. No backend API,
database schema, public route, or saved builder-record contract changed.

Verification completed for this phase:

- `npm test -- tests/admin-page-builder-shell.test.js` - passed (`46` tests).
- `npm test` - passed (`45` files, `337` passed, `1` skipped).
- `npm run lint` - passed.
- `npm run format:check` - passed.
- `npm run build` - passed with the existing Vite fullscreen chunk warning.
- `npm run test:visual` - passed (`3` Playwright tests). The visual test now asserts the new default
  live canvas, then recreates the iframe through `Structure Debug` -> `Live` before screenshot
  capture to keep timing-sensitive parity screenshots stable.
- `git diff --check` - passed.

## Phase 2 - Live Canvas as the Editor

Goal: Use the real page render as the editable canvas.

Implementation:

- Make the current reader-iframe preview path the default canvas renderer for edit mode.
- Add preview markers to shared page render output when builder editing is active:
  - page: `data-builder-page-id`
  - sections: `data-builder-section-id`, `data-builder-section-index`, `data-builder-layout`
  - columns: `data-builder-column-index`
  - modules: `data-builder-module-id`, `data-builder-module-type`
- Add reader-header markers in the reader header runtime for page-header selection.
- Keep marker emission out of normal public reader output unless a public use is intentionally
  added.
- Preserve the existing preview snapshot merge path so unsaved drafts can render before save.

Acceptance criteria:

- The live canvas renders through the same reader/shared-renderer path used by public pages.
- Every editable module, section, column, and header surface has a stable target identity.
- Public reader output outside builder sessions does not gain admin-only markers.

Detailed implementation plan:

Summary:

- Treat Phase 2 as dependent on Phase 1 being completed first.
- Make the builder edit canvas use the existing same-origin reader iframe path, while preserving the
  preview snapshot merge flow for unsaved drafts.
- Add opt-in builder target markers only when the iframe is rendering an active builder editing
  session.

Trusted references:

- Current preview architecture: `docs/functions/admin-page-builder.md`,
  `docs/completed-builder-plans/BUILDER_PREVIEW_PARITY_PLAN.md`, and `docs/README.md`.
- Current implementation entrypoints: `admin/page-builder.js`,
  `admin/page-builder/preview-manager.js`, `reader/app.js`, `reader/data.js`,
  `reader/header-layout.js`, and `admin/page-builder/shared-renderers.js`.
- GrapesJS reference remains architectural only: canvas iframe editing, model/view separation, and
  iframe event constraints.

Important public interface/type changes:

- No backend API, database schema, or saved builder-record changes.
- Extend preview snapshot options with `builderEditing: true | false`; default false.
- Extend reader application options with `builderEditing`, passed only from validated builder
  preview snapshots.
- Extend shared renderers with an opt-in marker flag; public/default rendering must not emit
  `data-builder-*`.

Key changes:

- Update the builder canvas render path so normal edit mode uses
  `previewManager.renderPreview({ builderEditing: true })` instead of the structural canvas
  renderer. Keep the structural canvas only as the Phase 1 debug/fallback affordance.
- Keep `builderPreview=1`, preview session identity, viewport sizing, `REQUEST_SNAPSHOT`/`SNAPSHOT`
  validation, metrics, and dirty-draft snapshot merging unchanged.
- Add marker emission in the shared renderer when `builderEditing` is true:
  - page: `data-builder-page-id`
  - section: `data-builder-section-id`, `data-builder-section-index`, `data-builder-layout`
  - column: `data-builder-column-index`
  - module: `data-builder-module-id`, `data-builder-module-type`
- Ensure unknown module wrappers also receive module markers when an id/type exists.
- Add reader-shell markers in `applyBuilderPageToDOM(...)` and `renderPanelStack(...)` for the
  actual iframe path, because live preview currently applies pages through the reader shell rather
  than only `renderPage(...)`.
- Add header selection markers in `applySharedHeaderLayout(...)` on `header.topbar#topbar`, using
  `data-builder-page-id` plus `data-builder-surface="page-header"` when `builderEditing` is true.
- Remove or avoid stale marker attributes whenever `builderEditing` is false, including after
  subsequent snapshot updates.
- Do not add Phase 3 behavior here: no hover bridge, click selection, overlay geometry, link
  interception expansion, drag/drop, or inline toolbar.

Test plan:

- Update shared renderer tests to prove markers are absent by default and present only with the
  marker flag.
- Update reader page-renderer/data tests to cover page, section, column, module, panel, and header
  markers in builder editing mode, plus marker cleanup in normal public mode.
- Update reader app/preview bridge tests to prove `snapshot.options.builderEditing` is passed into
  `applyBuilderPageToDOM(...)`.
- Update builder shell tests so edit mode defaults to the reader iframe and the structural canvas is
  not the normal edit surface.
- Run targeted tests first: `npm test -- tests/shared-renderers-parity.test.js
tests/reader-page-renderer.test.js tests/reader-data-builder.test.js tests/reader-app.test.js
tests/admin-page-builder-shell.test.js`.
- Final gate for implementation: `npm test`, `npm run test:visual`, `npm run build`,
  `git diff --check`.

Assumptions:

- Phase 1 creates the full-page shell and keeps a temporary structure-debug fallback.
- Existing page, section, and module ids from the backend are the stable identities; Phase 2 does
  not synthesize or persist new ids.
- Admin-only marker attributes are allowed inside validated builder iframe sessions, but public
  reader output outside those sessions must remain free of `data-builder-*`.

Completion note (`2026-05-30`): Phase 2 is implemented. The default live builder canvas now calls
`previewManager.renderPreview({ builderEditing: true })`, and the versioned preview snapshot carries
`options.builderEditing` through the existing `builderPreview=1` / `previewSession` handshake. The
reader preview bridge exposes the validated flag to `reader/app.js`, which passes it into
`applyBuilderPageToDOM(...)`. Shared renderers and the reader shell now emit admin-only
`data-builder-*` target markers for page, section, column, module, and page-header surfaces only
inside builder editing sessions. Normal public reader output and normal snapshot reapplication clean
those markers back out. Unknown module wrappers also carry module id/type markers when editing is
enabled. The saved builder-page API shape, database schema, public routes, side-effect guard model,
dirty-draft merge path, metrics path, and viewport sizing contract did not change.

Verification completed for this phase:

- `node --check admin/page-builder/shared-renderers.js` - passed.
- `node --check admin/page-builder/preview-manager.js` - passed.
- `node --check reader/data.js` - passed.
- `node --check reader/page-renderer.js` - passed.
- `node --check reader/preview-bridge.js` - passed.
- `node --check reader/app.js` - passed.
- `npm test -- tests/shared-renderers-parity.test.js tests/reader-page-renderer.test.js
tests/reader-data-builder.test.js tests/reader-preview-bridge.test.js tests/reader-app.test.js
tests/admin-page-builder-preview-contract.test.js tests/admin-page-builder-shell.test.js` -
  passed (`7` files, `98` tests).
- `npm test` - passed (`45` files, `342` passed, `1` skipped).
- `npm run format:check` - passed.
- `npm run lint` - passed.
- `npm run build` - passed with the existing Vite fullscreen chunk warning.
- `npm run test:visual` - passed (`3` Playwright tests).
- `git diff --check` - passed.

## Phase 3 - Canvas Interaction Bridge and Overlays

Goal: Add GrapesJS-style selection, hover, toolbar, and insert overlays.

Implementation:

- Extend `admin/page-builder/preview-contract.js` with target interaction messages:
  - `TARGETS`
  - `TARGET_HOVER`
  - `TARGET_SELECT`
  - `TARGET_ACTION`
- Add validators for target payloads and preserve existing preview session/page identity checks.
- Add a reader-side interaction bridge that:
  - collects marked targets
  - measures target rectangles
  - sends target geometry after render, scroll, resize, and snapshot changes
  - captures hover/click events inside the iframe
  - blocks unsafe links/forms while editing
- Add an admin overlay layer above the iframe:
  - hover outline
  - selected outline
  - compact selected toolbar
  - drop/insert target lines
  - stale-target cleanup
- Keep overlay elements admin-only and `pointer-events: none` by default, with toolbar/drop controls
  opting into pointer events.

Acceptance criteria:

- Hovering live page elements shows accurate outlines.
- Clicking a module selects it in the side panel.
- Clicking the header selects header settings.
- Overlay geometry remains correct after scrolling, resizing, device switching, and rerendering.

Detailed implementation plan:

Summary:

- Add live-canvas hover, selection, and insertion overlays on top of the reader iframe, using the
  Phase 2 marker contract as the target source.
- Treat Phase 3 as dependent on Phase 1 and Phase 2. If target markers are absent, the overlay stays
  empty and fails quietly.
- Extend the existing preview manager and preview bridge instead of adding a second message channel.

Trusted references:

- GrapesJS Canvas Spots: https://grapesjs.com/docs/modules/Canvas.html - select, hover, and target
  overlays live above the canvas and keep pointer events off by default.
- GrapesJS Canvas API: https://grapesjs.com/docs/api/canvas.html - spots update on canvas changes
  and can be filtered by type.
- MDN `postMessage`: https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage - keep
  exact-origin messaging plus sender/source validation.
- MDN `getBoundingClientRect`:
  https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect - target rects are
  viewport-relative and must refresh after scroll.
- MDN `pointer-events`: https://developer.mozilla.org/en-US/docs/Web/CSS/pointer-events - the
  overlay container can pass through pointer events while toolbar controls opt in.

Important public interface/type changes:

- No backend API, database schema, or saved builder-record changes.
- Extend `BUILDER_PREVIEW_MESSAGE_TYPES` with `TARGETS`, `TARGET_HOVER`, `TARGET_SELECT`, and
  `TARGET_ACTION`.
- Add target payload builders and validators to `admin/page-builder/preview-contract.js`; every
  target message must keep the existing `origin`, `source`, `previewSession`, `snapshotVersion`,
  `seriesId`, `pageId`, and `pageSlug` checks.
- Standardize target references as:
  `{ kind, key, pageId, sectionId?, columnIndex?, moduleId?, moduleType?, surface? }`, where `kind`
  is `page`, `header`, `section`, `column`, or `module`.
- Standardize geometry messages as iframe viewport CSS pixels:
  `{ target, rect: { top, left, right, bottom, width, height }, visible, order, label }`.
- Use `TARGET_ACTION` only for admin-to-reader interaction requests such as `refresh-targets`,
  `clear-hover`, and `scroll-into-view`. Toolbar mutations remain admin-side and call existing
  builder actions directly.

Key changes:

- Add a reader-side target bridge owned by `reader/preview-bridge.js`. It starts only after a
  validated snapshot has `options.builderEditing === true`, and stops otherwise.
- Collect Phase 2 markers from the rendered reader document, measure them with
  `getBoundingClientRect()`, deduplicate nested targets, and emit `TARGETS` after initial render,
  snapshot updates, scroll, resize, image/load events, and DOM mutations.
- Capture pointer movement and clicks in the iframe. Hover changes emit `TARGET_HOVER`; clicks emit
  `TARGET_SELECT`, prevent normal reader/link behavior, and prefer the most specific target in this
  order: module, header, column, section, page.
- Block unsafe iframe interactions while editing: anchor navigation, form submit, store redirects,
  and other interactive controls must be prevented before they trigger public-reader side effects.
- Extend `admin/page-builder/preview-manager.js` to store latest targets, hovered target, selected
  target, and a target sequence number. Ignore stale target messages from older sessions or older
  sequences.
- Render an admin-only overlay layer inside `.pb-preview-frame`, above `.pb-preview-iframe`. The
  overlay container uses `pointer-events: none`; selected toolbar buttons and insert controls use
  `pointer-events: auto`.
- Draw a hover outline, selected outline, compact selected toolbar, and insert/drop guide lines from
  the latest target geometry. Clamp toolbar placement inside the iframe frame so it stays reachable
  near edges.
- Map `TARGET_SELECT` through one centralized builder action, such as `selectCanvasTarget(targetRef)`:
  modules call existing module selection, header calls existing header selection, page calls page
  settings, section opens section settings, and column is used for insert guidance only.
- Use existing dirty-workspace guards before switching selection. If selection is blocked by unsaved
  changes, keep the current selection and show the existing editor status warning.
- Render insert lines from target geometry but keep
  [Phase 6 drag/drop](INTERACTIVE_LIVE_PREVIEW_BUILDER_PLAN_P2.md#phase-6---drag-drop-move-and-inline-toolbar-actions)
  out of scope. In Phase 3, insert controls may open the existing module picker for before/after
  module and empty-column insertion.
- Clear overlays on iframe reload, preview session reset, page identity change, target timeout, and
  device switch until fresh `TARGETS` arrive.

Test plan:

- Add preview-contract tests for the new message registry, valid target geometry, invalid target
  kinds/actions, non-finite rects, overlong strings, bad sessions, and page identity mismatches.
- Add reader bridge tests for target collection, hover/click message emission, link/form blocking,
  scroll/resize refresh scheduling, snapshot-update refresh, and disabled behavior when
  `builderEditing` is false.
- Add admin preview-manager/shell tests for overlay creation, stale cleanup, hover outline
  rendering, selected outline rendering, toolbar pointer-event opt-in, `TARGET_SELECT` mapping to
  module/header/page/section actions, and dirty-guard blocking.
- Add or extend visual coverage to verify overlay alignment at Desktop, Tablet, and Mobile,
  including after scroll, device switch, and rerender.
- Run targeted tests first: `npm test -- tests/admin-page-builder-preview-contract.test.js
tests/reader-preview-bridge.test.js tests/admin-page-builder-shell.test.js`.
- Final gate for implementation: `npm test`, `npm run test:visual`, `npm run build`,
  `git diff --check`.

Assumptions:

- Phase 1 provides the full-page builder shell and preview frame surface.
- Phase 2 provides opt-in `builderEditing` snapshots and stable `data-builder-*` markers for page,
  header, sections, columns, and modules.
- GrapesJS remains an architecture reference only; no runtime dependency is added.
- Phase 3 does not implement inline text editing, arbitrary DOM editing, full drag/drop composition,
  undo/redo, or per-device overrides.

Completion note (`2026-06-02`): Phase 3 is implemented. The preview contract now includes
validated `TARGETS`, `TARGET_HOVER`, `TARGET_SELECT`, and `TARGET_ACTION` envelopes with standardized
target refs, iframe viewport CSS-pixel geometry, sequence handling, and target action validation.
`reader/preview-bridge.js` now starts a builder-editing-only target bridge after validated snapshots
are applied. It collects Phase 2 `data-builder-*` markers, measures page/header/section/column/module
targets, emits target geometry after render/layout changes, emits hover/select events from iframe
pointer interaction, blocks iframe links/forms/controls while editing, and accepts non-mutating target
actions such as refresh, clear-hover, and scroll-into-view. `admin/page-builder/preview-manager.js`
stores latest target geometry, ignores stale target lists, clears overlays on reload/session/device
changes, and renders admin-only hover outlines, selected outlines, selected-target toolbar chrome, and
insert guide lines above the iframe with pointer events disabled except for toolbar controls.
`admin/page-builder.js` now routes live-canvas target selection through `selectCanvasTarget(...)`, so
module, header, page, section, and column selections reuse existing dirty-workspace guards and
inspector flows. Section targets now open the existing section spacing draft in the side-panel
inspector. The durable admin/reader docs were updated to describe live target geometry and overlays as
current behavior. Phase 3 intentionally does not implement inline editing, full drag/drop, arbitrary
DOM editing, undo/redo, or per-device overrides.

Verification completed for this phase:

- `node --check admin/page-builder/preview-contract.js` - passed.
- `node --check reader/preview-bridge.js` - passed.
- `node --check admin/page-builder/preview-manager.js` - passed.
- `node --check admin/page-builder.js` - passed.
- `node --check admin/page-builder/editor-panel.js` - passed.
- `npm test -- tests/admin-page-builder-preview-contract.test.js tests/reader-preview-bridge.test.js
tests/reader-app.test.js tests/admin-page-builder-shell.test.js` - passed (`4` files, `66` tests).
- `npm test` - passed (`45` files, `349` passed, `1` skipped).
- `npm run test:visual` - passed (`3` Playwright tests) with the existing Vite public-directory
  path warnings.
- `node ./node_modules/vite/bin/vite.js build` - passed with the existing fullscreen
  dynamic/static import warning.
- `npm run lint` - passed.
- `npm run format:check` - passed.
- `git diff --check` - passed.

Corrective patch note (`2026-06-02`): Phase 3 live target safeguards were tightened after audit.
`reader/preview-bridge.js` now blocks reader keyboard shortcuts and activation keys while the
builder-editing target bridge is active, so iframe navigation, zoom, help, Escape, Enter, and Space
cannot bypass the live canvas interaction guard. `admin/page-builder/preview-manager.js` now starts a
target freshness timeout after same-session builder-editing preview refreshes and clears stale hover,
selected, toolbar, insert-guide, target-count, hovered-key, and selected-key state if newer target
geometry never arrives.

Additional verification passed for the corrective patch:

- `node --check reader/preview-bridge.js`
- `node --check admin/page-builder/preview-manager.js`
- `npm test -- tests/reader-preview-bridge.test.js tests/admin-page-builder-shell.test.js`
- `npm test`
- `npm run test:visual`
- `npm run format:check`
- `npm run lint`
- `npm run build`
- `git diff --check`

## Phase 4 - Device Modes and Per-Device Overrides

Goal: Let authors edit Desktop, Tablet, and Phone versions of the same page.

Implementation:

- Promote `PREVIEW_VIEWPORTS` into editor device presets:
  - Desktop
  - Tablet
  - Phone
- Store active device mode in builder state and reflect it in the top toolbar.
- Extend page/section/module config contracts with a sparse responsive override shape, for example:
  - `responsive.desktop`
  - `responsive.tablet`
  - `responsive.mobile`
- Define supported override categories before UI exposure:
  - section spacing and layout
  - column/module gap
  - module visibility per device
  - module width/alignment where renderer support exists
  - appearance fields that already have sanitizer and renderer support
- Add resolver helpers that merge global config with the active device override.
- Update shared renderers and reader runtime to apply the selected device context in builder edit
  mode without changing public responsive CSS behavior unintentionally.

Acceptance criteria:

- Device buttons change the editable canvas size.
- Selecting a module in any device mode edits the same module identity.
- Supported fields can be overridden per device.
- Unsupported fields remain global.
- Saving and reloading preserves global and per-device settings separately.

Detailed implementation plan:

Summary:

- Treat Phase 4 as dependent on Phases 1-3 for the live iframe edit canvas, builder target markers,
  and overlay selection bridge.
- Promote the existing viewport presets into editor device presets. Keep the saved/API ids as
  `desktop`, `tablet`, and `mobile`, but label `mobile` as `Phone` in the toolbar.
- Add sparse per-device overrides to the existing JSON-backed records without a database migration:
  `page.meta.responsive`, `section.settings.responsive`, and `module.config.responsive`.
- Apply responsive overrides in builder edit/device context first. Public reader output keeps the
  existing global config plus CSS media-query behavior unless public device resolution is designed
  intentionally in a later pass.

Trusted references:

- GrapesJS Device Manager: https://grapesjs.com/docs/api/device_manager.html - device selection
  updates the canvas frame size, matching this phase's toolbar/device-frame behavior.
- MDN media queries: https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_media_queries/Using_media_queries -
  existing public responsive behavior should remain viewport/CSS driven unless deliberately changed.
- MDN `postMessage`: https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage - keep
  exact-origin iframe messaging and sender validation when sending device context through snapshots.
- MDN deep copy: https://developer.mozilla.org/en-US/docs/Glossary/Deep_copy - snapshot merges must
  avoid mutating the active builder page while previewing unsaved per-device drafts.

Important public interface/type changes:

- Add builder-device exports in `admin/page-builder/preview-contract.js`, reusing
  `PREVIEW_VIEWPORTS` dimensions while preserving the current preview exports for compatibility.
- Rename the builder state concept from `previewWidth` to `activeDeviceId`; keep a compatibility
  alias only where Phase 1-3 code still expects `previewWidth`.
- Extend preview snapshots with `options.deviceId` and keep `options.viewport` as the exact iframe
  frame dimensions.
- Whitelist responsive override fields before exposing UI:
  - section: `layout`, `moduleGap`, `columnGap`, `sectionGap`, `paddingTop`, `paddingBottom`,
    `backgroundColor`
  - module: `hidden`, text `alignment`, gallery/entry-gallery `columns`, spacer `height`, and
    existing sanitized `appearance` branches for `buttons`
  - page/header: existing sanitized header appearance branches only
- Drop unsupported responsive fields in frontend normalizers and backend sanitizers.

Key changes:

- Add a responsive utility module that normalizes sparse override maps, resolves
  `device override -> global value -> renderer/default`, prunes empty branches, and exposes helpers
  for page, section, and module resolution.
- Update `backend/app/builder_security.py` so page meta, section settings, and module configs
  preserve only whitelisted `responsive.desktop`, `responsive.tablet`, and `responsive.mobile`
  fields.
- Update shared renderers to accept `{ deviceId, builderEditing }` options and resolve effective
  section settings/module config before rendering.
- Update reader preview application so validated builder snapshots pass the selected device context
  into shared renderers only for builder editing sessions.
- Render modules hidden on the active device as selectable placeholders in builder edit mode; omit
  them from visible output when not in builder edit mode.
- Make device switching resize the iframe/frame, update toolbar active state, preserve selected
  page/section/module identity, clear stale Phase 3 overlay geometry, and request fresh targets.
- Update section/module/header editors so only whitelisted fields expose a Global vs Current Device
  control. Global edits save to the existing fields; current-device edits save to
  `responsive[activeDeviceId]`.
- Keep module order, `columnIndex`, and structural placement global in Phase 4. Section layout
  overrides affect the rendered grid only; renderers must keep enough column wrappers to avoid
  dropping modules whose global `columnIndex` is greater than the active layout column count.

Test plan:

- Add responsive utility tests for merge precedence, sparse pruning, invalid device ids,
  unsupported fields, and empty override cleanup.
- Add backend tests proving responsive overrides round-trip through page, section, and module
  sanitizers while unsupported keys are removed.
- Extend preview-contract tests for device ids, toolbar labels, snapshot `options.deviceId`, and
  viewport compatibility.
- Extend shell tests for device buttons in edit mode, iframe resize without page identity loss,
  selected module persistence across device switches, and save/reload separation between global and
  per-device values.
- Extend renderer/reader tests proving default public output is unchanged, builder device context
  applies overrides, hidden modules behave correctly, and existing responsive CSS still stacks at
  viewport breakpoints.
- Run targeted tests first: `npm test -- tests/admin-page-builder-preview-contract.test.js
tests/admin-page-builder-shell.test.js tests/reader-page-renderer.test.js
tests/shared-renderers-parity.test.js`.
- Final gate for implementation: `npm test`, `npm run test:visual`, `npm run test:backend`,
  `npm run build`, `git diff --check`.

Assumptions:

- Phase 4 does not implement per-device drag/drop placement, per-device module ordering, public
  viewport auto-selection for saved overrides, or new styling fields without existing sanitizer and
  renderer support.
- The saved responsive key remains `mobile` for compatibility with current `PREVIEW_VIEWPORTS`;
  only UI copy changes to `Phone`.
- Phase 4 was implemented after the Phase 1-3 completion notes; future adaptations should keep
  those current contracts authoritative over earlier planning assumptions.

Completion note (`2026-06-02`): Phase 4 is implemented. The builder now treats the existing
Desktop/Tablet/Mobile viewport presets as editable devices, labels `mobile` as `Phone` in the
builder toolbar, stores the active device in builder state, and includes `options.deviceId` in live
preview snapshots while preserving `options.viewport` compatibility. Sparse responsive overrides are
supported in `page.meta.responsive`, `section.settings.responsive`, and `module.config.responsive`
without schema changes. The shared responsive utility normalizes/prunes device branches, resolves
effective section/module values only for builder-editing device context, and keeps public reader
rendering on global values. Backend sanitizers now preserve only whitelisted responsive page/header,
section, and module fields.

The inspector exposes Global vs Current Device scope controls for section spacing/layout and module
fields with renderer support. Current-device edits save whitelisted fields to
`responsive[activeDeviceId]`; unsupported fields and structural placement stay global. Text
alignment, gallery and entry-gallery columns, spacer height, module hidden state, and buttons
appearance branches are covered. Device-hidden modules render as selectable placeholders in the live
builder canvas. Device switching resizes the iframe, updates toolbar state, preserves selection
identity, refreshes snapshots with the active device, and reuses the Phase 3 stale-overlay cleanup.

Verification passed:

- Individual `node --check` runs for `admin/page-builder/responsive-overrides.js`,
  `admin/page-builder/preview-contract.js`, `admin/page-builder/preview-manager.js`,
  `admin/page-builder.js`, editor modules, shared renderers, reader preview files, and the updated
  targeted JS tests.
- `python3 -m py_compile backend/app/builder_security.py backend/tests/test_page_builder_routes.py`
- `npm test -- tests/responsive-overrides.test.js
tests/admin-page-builder-preview-contract.test.js tests/admin-page-builder-shell.test.js
tests/reader-page-renderer.test.js tests/shared-renderers-parity.test.js`
- `./.venv/bin/python -m unittest backend.tests.test_page_builder_routes`
- `npm test`
- `npm run test:backend`
- `npm run build`
- `npm run test:visual`
- `git diff --check`

Corrective patch note (`2026-06-03`): Phase 4 audit findings are fixed. Current Device module
scope is now override-only: unsupported content, media, list, link, style, raw JSON, and structural
controls are hidden or ignored, while supported module overrides continue to save sparsely. Header
editing now carries a sparse `activeHeaderDraft.responsive` branch, exposes Current Device controls
only for sanitized header shell appearance (`top`, `scrolled`, and `navItemDefaults`), includes
dirty header responsive branches in live preview snapshots, and saves device appearance without
replacing global `meta.header`. Reader-shell live preview panel routing now uses global structural
placement for left/right membership during builder editing, so right-panel modules remain visible and
selectable when the active device layout collapses columns.

Additional verification passed for the corrective patch:

- `node --check admin/page-builder/module-editor.js admin/page-builder/button-editor.js
admin/page-builder/header-editor.js admin/page-builder/gallery-editor.js
admin/page-builder/entry-gallery-editor.js reader/data.js`
- `node --check tests/admin-page-builder-shell.test.js tests/reader-data-builder.test.js
admin/page-builder.js admin/page-builder/editor-panel.js admin/page-builder/draft-manager.js`
- `npm test -- tests/admin-page-builder-shell.test.js tests/reader-data-builder.test.js
tests/reader-page-renderer.test.js tests/shared-renderers-parity.test.js
tests/responsive-overrides.test.js`
- `npm test`
- `npm run test:backend`
- `npm run build`
- `npm run test:visual`
- `git diff --check`

## Phase 5 - Side Panel as Blocks, Layers, Traits, and Styles

Goal: Make the side panel the only editor, using GrapesJS concepts mapped to local modules.

Implementation:

- Turn the current module palette into a block panel backed by the existing module registry.
- Add or formalize a module descriptor registry with:
  - module label/category/icon
  - default config
  - editor component
  - allowed parent/drop behavior
  - quick toolbar actions
  - supported responsive overrides
  - supported appearance sectors
  - required page or series context
- Add a layers panel that reflects page -> sections -> columns -> modules.
- Treat existing module editors as trait panels for selected modules.
- Treat `appearance-editor.js` and `appearance-utils.js` as the constrained style manager.
- Do not expose arbitrary CSS except through explicitly sanitized modules such as `html`.

Acceptance criteria:

- The side panel can switch between blocks, layers, selected settings, and styles.
- Selected live-canvas targets and side-panel selection stay in sync.
- Module capabilities come from a single descriptor source.
- Styling controls only appear for fields with frontend normalization, backend sanitization, and
  shared renderer support.

Detailed implementation plan:

Summary:

- Treat Phase 5 as dependent on Phases 1-4 for the full-page shell, live-canvas target markers,
  selection bridge, and device override contract.
- Convert the side panel into the single editing surface for Blocks, Layers, selected Settings, and
  constrained Styles.
- Keep BWonderComics pages/modules as the canonical model. GrapesJS concepts guide the UX, but no
  arbitrary DOM/CSS model is introduced.

Trusted references:

- GrapesJS Blocks: https://grapesjs.com/docs/modules/Blocks - blocks are reusable component
  templates and can use a custom UI.
- GrapesJS Layers: https://grapesjs.com/docs/modules/Layers.html - layers represent loaded
  components as a tree.
- GrapesJS Traits: https://grapesjs.com/docs/modules/Traits.html - traits are selected-component
  settings and support custom managers.
- GrapesJS Style Manager: https://grapesjs.com/docs/modules/Style-manager.html - style sectors and
  properties can be constrained per component.

Important interface/type changes:

- Add a descriptor-backed module registry that becomes the single source for module label,
  category, icon, insertability, default config, editor render/bind handlers, allowed drop targets,
  quick actions, required context, responsive overrides, and appearance sectors.
- Derive the old `MODULE_TYPES`, `getDefaultConfig`, `getModuleLabel`, palette data, inline picker
  data, and selected-module editor behavior from the descriptor registry.
- Add side-panel state for `blocks`, `layers`, `settings`, and `styles`; keep any Phase 1 Pages tab
  intact if already present.
- Add a unified selected target shape, such as `page`, `header`, `section`, or `module`, with
  compatibility bridges to existing `selectedModuleId`, `selectedCanvasSurface`, and
  `activeSectionId`.

Key changes:

- Blocks: replace the current module palette with a descriptor-driven block panel grouped by
  category. Exclude non-insertable descriptors such as `header`, and use descriptor default config
  for insertions.
- Layers: render a tree from current page data: page -> header/sections -> columns -> modules.
  Layer clicks select the matching live-canvas target and open Settings; reordering remains
  [Phase 6](INTERACTIVE_LIVE_PREVIEW_BUILDER_PLAN_P2.md#phase-6---drag-drop-move-and-inline-toolbar-actions)
  scope.
- Traits/Settings: treat existing module editors as selected-module trait panels. Move
  descriptor-specific render/bind functions out of the hard-coded switch over time, while preserving
  current draft/save/discard behavior.
- Styles: use `appearance-editor.js` and `appearance-utils.js` as the constrained style manager.
  Show style sectors only when the descriptor field is backed by frontend normalization, backend
  sanitization, and shared renderer output.
- Security: keep raw CSS unavailable. The `html` module remains a sanitized advanced content
  module, not a style-manager escape hatch.

Test plan:

- Add descriptor tests proving every supported module has one descriptor, insertable blocks exclude
  `header`, default configs match current behavior, and unknown modules fall back safely.
- Extend side-panel shell tests for tab switching, block grouping, layer tree rendering, and
  layer-to-canvas/canvas-to-layer selection sync.
- Extend editor tests proving module settings still render and bind through descriptors,
  dirty-state guards still block unsafe selection changes, and existing raw JSON exceptions do not
  expand.
- Add style-manager tests proving unsupported modules do not show style controls and supported
  appearance fields round-trip through frontend normalization, backend sanitization, and shared
  renderer parity.
- Run targeted tests first: `npm test -- tests/admin-page-builder-shell.test.js
tests/admin-page-builder-preview.test.js tests/appearance-utils.test.js
tests/shared-renderers-parity.test.js`.
- Final implementation gate: `npm test`, `npm run test:visual`, `npm run test:backend`,
  `npm run build`, `git diff --check`.

Assumptions:

- Phase 5 does not implement live drag/drop movement, inline toolbars, undo/redo, or inline text
  editing; those stay in later phases.
- Phase 5 does not add new styling fields unless all three contracts exist: frontend normalizer,
  backend sanitizer, and shared renderer support.
- Phase 5 is implemented after the Phase 1-4 completion contracts; future adaptations should keep
  current runtime behavior and completion notes authoritative over older planning assumptions.

Completion note (`2026-06-03`): Phase 5 is implemented after the completed Phase 1-4 contracts.
Module metadata now comes from a descriptor-backed registry that drives compatibility module types,
labels, icons, categories, insertability, default configs, editor dispatch, responsive override
fields, and constrained style sectors. The side panel now exposes Blocks instead of the old module
palette label, groups insertable descriptors by category, excludes non-insertable header blocks, and
keeps existing insert/default-config behavior descriptor-backed. Layers now render page/header,
sections, columns, and modules, including overflow columns needed for builder selection, and layer
selection stays synchronized with the live-canvas/module inspector selection.

Settings continue to use the existing page/header/section/module draft and save flows, but module
settings dispatch through descriptor editor kinds. Styles now route by selected target: page styles
use the existing theme editor, header styles reuse sanitized shell/nav-default appearance controls,
supported module style sectors expose only constrained style controls, and unsupported sections or
modules show an empty state instead of raw CSS or global-only content controls. No backend schema,
saved record contract, reader public behavior, preview message contract, GrapesJS dependency, live
drag/drop movement, inline toolbar, undo/redo, or inline editing changes were added.

Verification passed:

- `node --check` on touched admin builder JS files and updated tests.
- `npm test -- tests/module-descriptors.test.js tests/admin-page-builder-shell.test.js
tests/admin-page-builder-preview.test.js tests/appearance-utils.test.js
tests/shared-renderers-parity.test.js tests/responsive-overrides.test.js`
- `npm run format:check`
- `npm run lint`
- `npm test`
- `npm run format:py:check`
- `npm run lint:py`
- `npm run test:backend`
- `npm run build`
- `npm run test:visual`
- `git diff --check`

Continue in [Part 2 - Phases 6-12, risks, and implementation order](INTERACTIVE_LIVE_PREVIEW_BUILDER_PLAN_P2.md).
