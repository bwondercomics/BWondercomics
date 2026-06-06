# Full-Page Live Builder Plan, Part 2 of 2

Status: Complete - Phases 6-12 implemented, audited, corrected, and release-gated
Plan state: Completed continuation of [Part 1](INTERACTIVE_LIVE_PREVIEW_BUILDER_PLAN.md). All
scoped phases have dated completion or corrective notes; current source plus those notes are the
behavior record.
Scope of this file: Phases 6-12, risks, guardrails, and suggested implementation order.
Start here only after reading Part 1, because these phases depend on the shell, iframe canvas,
target marker, overlay, device, and side-panel contracts defined there.

## Reading Map

This document is Part 2 of one two-part plan. It keeps the shared purpose, product direction,
reference conclusions, and early implementation contracts centralized in
[Part 1](INTERACTIVE_LIVE_PREVIEW_BUILDER_PLAN.md), while later phases include their own
phase-specific references.

Part 1 contains:

- [Purpose](INTERACTIVE_LIVE_PREVIEW_BUILDER_PLAN.md#purpose)
- [Product Direction](INTERACTIVE_LIVE_PREVIEW_BUILDER_PLAN.md#product-direction)
- [Trusted References](INTERACTIVE_LIVE_PREVIEW_BUILDER_PLAN.md#trusted-references)
- [Reference Conclusions](INTERACTIVE_LIVE_PREVIEW_BUILDER_PLAN.md#reference-conclusions)
- [Target Experience](INTERACTIVE_LIVE_PREVIEW_BUILDER_PLAN.md#target-experience-and-current-state)
- [Page and Module Model Direction](INTERACTIVE_LIVE_PREVIEW_BUILDER_PLAN.md#page-and-module-model-direction)
- [Phase 1 - Full-Page Builder Shell](INTERACTIVE_LIVE_PREVIEW_BUILDER_PLAN.md#phase-1---full-page-builder-shell)
- [Phase 2 - Live Canvas as the Editor](INTERACTIVE_LIVE_PREVIEW_BUILDER_PLAN.md#phase-2---live-canvas-as-the-editor)
- [Phase 3 - Interaction bridge and overlays](INTERACTIVE_LIVE_PREVIEW_BUILDER_PLAN.md#phase-3---canvas-interaction-bridge-and-overlays)
- [Phase 4 - Device modes and overrides](INTERACTIVE_LIVE_PREVIEW_BUILDER_PLAN.md#phase-4---device-modes-and-per-device-overrides)
- [Phase 5 - Side panel](INTERACTIVE_LIVE_PREVIEW_BUILDER_PLAN.md#phase-5---side-panel-as-blocks-layers-traits-and-styles)

Part 2 contains:

- [Phase 6 - Drag, Drop, Move, and Inline Toolbar Actions](#phase-6---drag-drop-move-and-inline-toolbar-actions)
- [Phase 7 - Preview Chrome Collapse](#phase-7---preview-chrome-collapse)
- [Phase 8 - Page Scope and Routing Migration](#phase-8---page-scope-and-routing-migration)
- [Phase 9 - Special CMS Modules](#phase-9---special-cms-modules)
- [Phase 10 - Command, Keymap, and Undo Foundation](#phase-10---command-keymap-and-undo-foundation)
- [Phase 11 - Inline Editing](#phase-11---inline-editing)
- [Phase 12 - Testing and Release Gates](#phase-12---testing-and-release-gates)
- [Risks and Guardrails](#risks-and-guardrails)
- [Suggested Implementation Order](#suggested-implementation-order)

## Developer and LLM Notes

- Treat both files as one completed implementation history. Do not interpret a historical phase body
  without checking its dated completion/corrective notes and the current source.
- Phase dependencies are cumulative. If an earlier behavior changes during follow-up work, revisit
  later contracts before coding against stale assumptions.
- Preserve custom CMS behavior while generalizing pages. Reader, feed, entry picker, media gallery,
  series bindings, permissions, and protected media behavior remain first-class requirements.
- New post-0.8.2 reader/layout work belongs in the follow-up plan at
  `docs/READER_BLOCK_AND_LAYOUT_CUSTOMIZATION_PLAN.md` unless the user explicitly asks for a
  corrective patch to this completed plan.

## Phase 6 - Drag, Drop, Move, and Inline Toolbar Actions

Goal: Make live-page composition happen directly on the canvas.

Implementation:

- Drag modules from the blocks panel to the live canvas.
- Use target geometry from the iframe bridge to show deterministic insert lines:
  - before/after module
  - start/end of column
  - before/after section
- Translate drops into existing mutation operations:
  - `insertModuleAt(sectionId, columnIndex, insertIndex, moduleType)`
  - `moveModuleToTarget(moduleId, sectionId, columnIndex, insertIndex)`
  - `insertSectionAt(insertIndex)` when section-level insertion is enabled
- Add inline toolbar actions for:
  - edit/settings
  - duplicate when implemented
  - move
  - delete
  - insert before/after
  - hide on current device when responsive visibility exists
- Keep destructive actions behind current confirmations until undo has real coverage.

Acceptance criteria:

- Authors can build page structure without returning to the old structural canvas.
- Drag/drop uses existing backend mutations and error handling.
- Inline toolbar actions and side-panel actions call the same command layer.

Detailed implementation plan:

Summary:

- Add live-canvas drag/drop for descriptor-backed blocks and existing modules, using Phase 3 target
  geometry as the source for drop placement.
- Keep the saved builder records as the canonical model. Drag/drop updates `BuilderSection` and
  `BuilderModule` records through existing mutation flows; it must not persist browser DOM order.
- Treat GrapesJS block dragging, canvas target spots, and component model/view separation as the UX
  and architecture reference, while keeping BWonderComics' typed section/module records.

Trusted references:

- GrapesJS Blocks: https://grapesjs.com/docs/modules/Blocks.html - blocks are reusable component
  templates with drag/drop support and custom UI hooks.
- GrapesJS Canvas: https://grapesjs.com/docs/modules/Canvas.html - target spots and placeholder
  indicators map to the planned live insert guides.
- GrapesJS Canvas API: https://grapesjs.com/docs/api/canvas.html - canvas drag events and custom
  drag lifecycle are the reference for a controlled drag source.
- GrapesJS Components: https://grapesjs.com/docs/modules/Components.html - component model/view
  separation reinforces that the iframe DOM is only the view.
- [Part 1 Phase 3](INTERACTIVE_LIVE_PREVIEW_BUILDER_PLAN.md#phase-3---canvas-interaction-bridge-and-overlays)
  - live target refs, target geometry, and admin overlay behavior.
- [Part 1 Phase 5](INTERACTIVE_LIVE_PREVIEW_BUILDER_PLAN.md#phase-5---side-panel-as-blocks-layers-traits-and-styles)
  - descriptor-backed blocks, layers, traits, styles, and allowed drop behavior.
- [Admin page builder docs](functions/admin-page-builder.md#-canvas-mutations-canvas-mutationsjs)
  - current structural mutation owner.

Important interface/type changes:

- No backend schema change is required for Phase 6. New UI flows call the existing section/module
  APIs through the local data layer and `canvas-mutations.js`.
- Add a live drag state shape owned by the builder shell, for example:
  `{ dragId, source, moduleType?, moduleId?, originTarget?, currentTarget?, effect }`, where
  `source` is `block`, `module`, or `section`, and `effect` is `insert`, `move`, or
  `insert-section`.
- Extend the Phase 3 target ref with a drop placement result:
  `{ target, placement, sectionId?, columnIndex?, insertIndex?, reason? }`, where `placement` is
  `before`, `after`, `start`, `end`, `inside-empty-column`, `section-before`, or `section-after`.
- Add or reserve structural command IDs used by blocks, overlays, and the side panel:
  `builder:drag-start`, `builder:drag-over`, `builder:drop`, `builder:insert`,
  `builder:move`, `builder:insert-section`, `builder:delete-selected`,
  `builder:duplicate-selected`, and `builder:hide-on-device`.
- If the full Phase 10 command registry has not landed yet, Phase 6 should introduce only the
  structural command adapter needed for live drag/drop and toolbar actions. Phase 10 later expands
  the same registry for global shortcuts and undo.

Key changes:

- Start block drags from the Phase 5 block panel. The drag payload comes from the descriptor
  registry, not from rendered block HTML, and includes the intended module type plus a fresh default
  config created at drop time.
- Start module moves from the selected toolbar, layer row, or canvas handle. The drag payload carries
  the existing module id and origin placement so cancelled drops can leave state unchanged.
- Reuse Phase 3 iframe target geometry for drop ranking. Prefer the most specific valid target in
  this order: module edge, empty column, column edge, section edge, page end.
- Reject invalid placements before showing an insert line. Examples: dropping a module into a
  column that does not exist for the current global section layout, inserting a non-insertable
  descriptor such as `header`, or moving a module into a context that its descriptor forbids.
- Render insert guides as admin overlays above the iframe. Guides use `pointer-events: none`; drop
  controls that must be clickable opt into pointer events explicitly.
- Translate accepted drops into existing mutation operations:
  `insertModuleAt(sectionId, columnIndex, insertIndex, moduleType)`,
  `moveModuleToTarget(moduleId, sectionId, columnIndex, insertIndex)`, and
  `insertSectionAt(insertIndex)` when section-level insertion is enabled.
- Keep structural mutations immediate, matching the current builder behavior, but use existing
  dirty-workspace guards before switching selection away from an unsaved explicit draft.
- After a successful drop, rerender the live snapshot, select the inserted or moved module, request
  fresh target geometry, and keep the side panel on Settings for the selected target.
- Add inline toolbar actions for edit/settings, duplicate, delete, insert before/after, move, and
  hide on the current device when Phase 4 responsive visibility exists. Duplicate stays disabled
  until the duplicate operation is implemented.
- Keep delete and other destructive actions behind the current confirmation behavior until Phase 10
  undo has tested structural transaction coverage.

Test plan:

- Add unit tests for drop target ranking, invalid placement rejection, empty-column insertion, page
  end insertion, and stale target cleanup after iframe reload/device switch.
- Add shell tests proving block drags call the same insert path as the block panel, module moves call
  the same move path as side-panel/layer actions, and failed mutations preserve local state.
- Add command/adapter tests for toolbar delete/insert/move/hide actions, including dirty-workspace
  guards and disabled duplicate behavior.
- Add visual/browser coverage for dragging a block into an empty page, moving a module between
  columns, inserting before/after a module, scrolling during drag, and cancelling a drag.
- Final implementation gate for this phase: `npm test`, `npm run test:visual`,
  `npm run test:backend`, `npm run build`, and `git diff --check`.

Assumptions:

- Phases 1-5 have supplied the full-page shell, live iframe canvas, target markers, overlay layer,
  device context, side panel, block descriptors, and selected-target sync.
- Phase 6 does not implement freeform absolute positioning, arbitrary DOM dragging, per-device
  module order, or broad undo/redo.
- Browser DOM order is never accepted as canonical saved state.

Completion note (`2026-06-03`): Phase 6 is implemented as a corrective live-canvas structural pass
on top of the completed Part 1 contracts. The builder now owns a small internal structural command
adapter for live drag/drop, insert, move, section insertion/reorder, delete, current-device hide,
and disabled duplicate actions. Blocks and layer rows can start live drags; the selected-target
toolbar exposes Settings, Move, Insert, Hide on Current Device, Delete, and disabled Duplicate
where applicable. The admin overlay becomes the drop surface only while a live drag is active,
ranks Phase 3 target geometry through `live-drop-placement.js`, renders one active drop guide, and
translates accepted placements into existing `canvas-mutations.js` section/module mutation flows.
Page-end and section-edge module drops create a new one-column section before inserting or moving
the module into column `0`. Structure Debug remains available, but its insert/move/delete actions
now route through the same command adapter.

Phase 6 deliberately did not add backend schema changes, public reader behavior changes, saved
record contract changes, preview message contract changes, freeform DOM positioning, per-device
module order, or a Phase 10 undo/command registry. Duplicate remains visible but disabled until a
real duplicate mutation exists.

Corrective patch note (`2026-06-03`): The Phase 6 audit follow-up tightened structural mutation
success reporting so failed module/section reorder calls no longer select targets or show success,
added admin-overlay fallback geometry so page-end/no-target drops render a visible drop guide, and
expanded shell coverage for failed reorder paths, page-end guides, toolbar Delete, and disabled
Duplicate.

Verification refreshed for this phase:

- `node --check admin/page-builder/live-drop-placement.js`
- `node --check admin/page-builder/structural-commands.js`
- `node --check admin/page-builder/preview-manager.js`
- `node --check admin/page-builder.js`
- `node --check admin/page-builder/sidebar-panel.js`
- `node --check admin/page-builder/canvas-mutations.js`
- `node --check tests/live-drop-placement.test.js`
- `node --check tests/admin-page-builder-shell.test.js`
- `npm test -- tests/live-drop-placement.test.js tests/admin-page-builder-shell.test.js`
- `npm test -- tests/live-drop-placement.test.js tests/admin-page-builder-shell.test.js tests/module-descriptors.test.js tests/responsive-overrides.test.js tests/admin-page-builder-preview-contract.test.js`
- `npm test`
- `npm run test:backend`
- `npm run build`
- `npm run test:visual`
- `git diff --check`

## Phase 7 - Preview Chrome Collapse

Goal: Make preview a page display without editor menus.

Implementation:

- Add preview mode to the top toolbar.
- When preview is active:
  - hide top toolbar
  - hide side panel
  - hide canvas overlays
  - keep the page display at the selected device size or a fit-to-window mode
  - show a small top-left restore button
- The restore button exits preview and brings back the editor menus.
- Maintain preview side-effect suppression:
  - email submissions stubbed
  - analytics writes disabled
  - comment submissions disabled
  - external navigation disabled unless explicitly opened
  - fullscreen disabled

Acceptance criteria:

- Preview visually reads as the page, not the editor.
- The only editor UI in preview is the small restore button.
- Restoring returns to the same page, selected device, and selected target.

Detailed implementation plan:

Summary:

- Make Preview a chrome-collapsed state over the same live reader iframe, not a second renderer.
- Reuse the existing `builderPreview=1`, `previewSession`, exact viewport presets, snapshot
  validation, and reader side-effect suppression documented by the preview parity work.
- Keep the restore control intentionally small and singular so preview reads as the page.

Trusted references:

- GrapesJS Commands: https://grapesjs.com/docs/modules/Commands.html - preview/chrome toggles
  should be command-addressable rather than separately wired buttons.
- GrapesJS Canvas: https://grapesjs.com/docs/modules/Canvas.html - editor-only canvas spots are
  separate from page content and can be hidden without changing the rendered page.
- [Builder Preview Parity Plan](BUILDER_PREVIEW_PARITY_PLAN.md) - current iframe preview contract,
  exact viewport sizing, side-effect guards, and metrics behavior.
- [Admin overview](admin-overview.md#page-builder-workflow) - current Edit/Preview toggle,
  `builderPreview=1`, snapshot bridge, and `.pb-canvas[data-mode='preview']` scroll behavior.
- [Part 1 Target Experience](INTERACTIVE_LIVE_PREVIEW_BUILDER_PLAN.md#target-experience) - preview
  hides editor chrome and exposes only a restore-menu button.

Important interface/type changes:

- No backend API, database schema, or saved builder-record changes.
- Add a builder UI state for chrome visibility, such as `editorChromeMode: 'edit' | 'preview'`.
  This is distinct from the page's published/draft state and from the reader iframe's preview
  session.
- Add or reserve `builder:toggle-preview`, `builder:enter-preview`, and `builder:exit-preview`
  commands. The top toolbar, restore button, and later keymaps must call these commands.
- Keep `options.builderEditing` or equivalent snapshot metadata false while in chrome-collapsed
  preview so the reader-side edit bridge does not emit target/select/inline-edit behavior.
- If fit-to-window is added, represent it as a presentation mode around the iframe. The iframe CSS
  pixel viewport remains the selected Desktop/Tablet/Phone dimensions so media queries stay exact.

Key changes:

- Add a Preview control to the full-page builder toolbar. Activating it hides the top toolbar, side
  panel, live overlays, insert guides, layer highlights, and inline toolbar.
- Keep the iframe URL and snapshot transport aligned with the existing preview parity contract:
  `/index.html?...&builderPreview=1&previewSession=...`, validated `REQUEST_SNAPSHOT`/`SNAPSHOT`
  messages, and the same `applyBuilderPageToDOM(...)` reader path.
- Preserve the selected device by default. Desktop, Tablet, and Phone preview use exact iframe CSS
  dimensions from the shared viewport registry; optional fit-to-window scales the frame visually
  without changing iframe viewport pixels.
- Render one restore button in the top-left editor overlay. It must be outside the iframe, keyboard
  reachable, and the only visible editor control in preview.
- Exiting preview restores the previous selected page, selected device, scroll position where
  practical, selected target, and side-panel tab. It then requests fresh target geometry before
  showing overlays.
- Maintain the current reader-side side-effect policy: analytics and live tracking disabled, email
  submissions stubbed, comments writes disabled, chat SSO disabled, fullscreen disabled, safe-mode
  redirects disabled, and unsafe navigation blocked unless a future explicit open-new-tab command is
  designed.
- Suppress editing affordances in preview. Clicks inside the iframe should behave like safe preview
  clicks, not select modules, open inline editing, or mutate builder state.

Test plan:

- Add shell tests for entering preview, hiding toolbar/panel/overlays, rendering the restore button,
  and restoring the previous selected page/device/target.
- Extend preview-manager tests to prove the iframe URL, `previewSession`, exact viewport dimensions,
  and snapshot identity behavior remain unchanged by chrome collapse.
- Extend reader preview tests to prove editing target messages and inline-edit messages are not
  active while chrome-collapsed preview is showing.
- Add visual/browser coverage for Desktop, Tablet, and Phone preview collapse and restore, including
  a scrolled page and a selected module before entering preview.
- Final implementation gate for this phase: `npm test`, `npm run test:visual`,
  `npm run test:backend`, `npm run build`, and `git diff --check`.

Assumptions:

- Preview collapse is a UI chrome state, not a new public page mode.
- Existing preview side-effect guards remain authoritative and must not be weakened.
- Browser zoom is not used for responsive parity. Exact iframe CSS pixels remain authoritative.

Completion note (`2026-06-03`): Phase 7 is implemented as a chrome-collapsed Preview state over the
existing live reader iframe. The builder now has command-addressable `builder:enter-preview`,
`builder:exit-preview`, and `builder:toggle-preview` behavior through local shell commands, a
toolbar Preview button, and a single top-left Edit restore button. Collapsed Preview preserves the
current iframe URL, `previewSession`, selected Desktop/Tablet/Phone dimensions, working/saved
snapshot source, and dirty draft merge path while sending `options.builderEditing: false` so target
geometry and inline editor chrome stop. Restoring returns to the prior Live or Structure Debug mode,
keeps the side-panel tab and selected target state, requests fresh target geometry, and redraws the
selected overlay only after a fresh target list arrives. No backend API, database schema, saved
builder record, public reader output, or preview message contract changed.
A corrective stale-target patch preserves the last accepted target sequence while chrome is
collapsed, so old queued `TARGETS` messages remain ignored after restore while visible overlay state
is still cleared.

Verification refreshed for this phase:

- `node --check admin/page-builder.js`
- `node --check admin/page-builder/preview-manager.js`
- `node --check admin/dom.js`
- `node --check tests/admin-page-builder-shell.test.js`
- `node --check tests/reader-preview-bridge.test.js`
- `node --check tests/visual/builder-preview-parity.spec.js`
- `npm test -- tests/admin-page-builder-shell.test.js tests/reader-preview-bridge.test.js tests/reader-preview-side-effects.test.js tests/admin-page-builder-preview-contract.test.js`
- `npm run format:check`
- `npm run lint`
- `npm test`
- `npm run test:backend`
- `npm run build`
- `npm run test:visual`
- `git diff --check`

## Phase 8 - Page Scope and Routing Migration

Goal: Support global site pages plus series-attached reader pages.

Implementation:

- Design and add backend schema for page scope:
  - `scope`
  - nullable `series_id` or equivalent binding table
  - route role/bindings for reader/feed/gallery where needed
- Preserve existing series pages through migration.
- Add APIs for:
  - global page list
  - series page list
  - global page by slug
  - series page by slug
  - page bindings for reader/feed/gallery roles
- Update admin page list UI so authors understand whether a page is global or series-attached.
- Update link selectors so builder-page links can target global pages or series pages.
- Keep every series attached to a reader page. Missing reader attachments should be treated as a
  setup warning, not silently substituted with legacy config.

Acceptance criteria:

- Existing series-scoped pages still load after migration.
- New global pages can be created and published without selecting a series.
- Each series can identify its attached reader page.
- Public routing resolves global pages and series-attached pages unambiguously.

Detailed implementation plan:

Summary:

- Expand the current series-scoped page model into explicit page scopes while preserving every
  existing page as a series page after migration.
- Add global pages for site-wide content, but keep reader guarantees series-specific through an
  explicit reader-page binding.
- Use the GrapesJS Pages concept as a reference for managing multiple pages, while keeping
  BWonderComics routing, publication, permissions, and CMS behavior.

Trusted references:

- GrapesJS Pages: https://grapesjs.com/docs/modules/Pages.html - pages are a first-class manager
  concept with custom UI expected around the API.
- GrapesJS Components: https://grapesjs.com/docs/modules/Components.html - page content should
  remain model-backed, not DOM-derived.
- [Admin page builder data model](functions/admin-page-builder.md#-current-data-model) - current
  `BuilderPage`, `BuilderSection`, and `BuilderModule` ownership.
- [Builder plan audit](BUILDER_PLAN.md#audit-summary) - current strengths, series scoping, reader
  fallback retirement, and routing notes.
- [Admin overview data paths](admin-overview.md#data-paths-and-persistence) - current admin and
  public page-builder routes.

Important interface/type changes:

- Add a planned `scope` field to builder page records with values `series` and `global`.
- Migrate existing rows to `scope='series'` and keep their existing `series_id`.
- Allow `series_id` to be nullable only for `scope='global'`. For `scope='series'`, `series_id`
  remains required and sanitized.
- Add a page binding table or equivalent normalized model for role bindings:
  `{ seriesId, role, pageId }`, where `role` starts with `reader` and may later include `feed` and
  `gallery`.
- Enforce uniqueness with separate rules:
  - series pages: unique `(scope, series_id, slug)`
  - global pages: unique `(scope, slug)` with `series_id` null
  - bindings: unique `(series_id, role)`
- Extend serialized page payloads with `scope`, nullable `seriesId`, and optional binding summary
  where the API response is specifically about series page setup.
- Add separate admin APIs for global and series contexts. The current series endpoint may remain as
  a compatibility path, but new UI should call explicit scope-aware fetchers.
- Keep public routing explicit. A global-page route must not silently shadow or replace the existing
  series page route.

Key changes:

- Add a database migration that introduces page scope, adjusts the `series_id` nullability policy,
  creates role bindings, backfills all existing pages as series pages, and backfills each series'
  reader binding to the published or configured `reader` page when available.
- Update backend page-store queries so global page list/get/create/update/delete flows never fall
  back to `DEFAULT_SERIES_ID`, and series page flows never return global rows unless a future API
  explicitly asks for mixed results.
- Update public resolution so `/api/pages/{series_id}/{slug}` or its successor resolves only
  series pages for that series, while the chosen global route resolves only global pages.
- Treat missing reader bindings as setup warnings in admin and as explicit not-ready state in
  validation. Do not silently substitute legacy config or an arbitrary page.
- Update the admin page list to show scope clearly. Authors should be able to switch between Global
  Pages and Series Pages without changing the active series accidentally.
- Update page creation so global pages can be created without selecting a series, while series pages
  still require a series context.
- Update link selectors so builder links can target global pages, active-series pages, or a specific
  series page when the author has enough context to choose one.
- Keep route-role fields and page templates separate. `pageType` can remain useful display metadata,
  but canonical reader/feed/gallery behavior should come from bindings plus modules rather than
  hardcoded page types.

Test plan:

- Add migration tests for existing rows becoming `scope='series'`, global pages allowing null
  `series_id`, uniqueness rules, reader binding backfill, and failure/warning behavior when a series
  lacks a reader page.
- Add backend route tests for global list/get/create/update/delete, series list/get/create/update/
  delete, admin draft reads, public published reads, ambiguous slug handling, and permission checks.
- Add page-store tests proving global queries do not use `DEFAULT_SERIES_ID` and series queries do
  not leak global pages.
- Add admin shell/data tests for page-scope tabs, page creation, link selector targets, series
  reader binding warnings, and dirty-workspace guards during scope switches.
- Add visual/browser coverage for creating a global page, creating a series page, selecting a reader
  binding warning, and linking from one page to another across scopes.
- Final implementation gate for this phase: `npm test`, `npm run test:visual`,
  `npm run test:backend`, `npm run build`, and `git diff --check`.

Assumptions:

- Global pages do not replace the requirement that every series has a reader page.
- Existing series routes and current reader-page behavior must continue to work after migration.
- This phase may require a coordinated DB migration and deployment window because public routing and
  persisted page identity are affected.

Completion note (`2026-06-03`): Phase 8 is implemented with explicit `series` and `global` page
scopes, nullable global `seriesId`, and normalized `builder_page_bindings` route-role records.
Existing compatibility routes remain series-only, while new explicit admin endpoints cover global
pages, series pages, scoped reordering, and page bindings. The public global route is
`/api/pages/global/by-slug/<slug>`, and existing public series routes keep resolving only series
pages. Series homepage fallback now uses the explicit `reader` binding instead of silently selecting
an arbitrary `reader` slug. The admin builder sidebar exposes Global Pages and Series Pages,
shows reader-binding warnings, and can bind a series reader page with the normal dirty-workspace
guard. Builder-page links now carry `pageScope` and render global URLs as
`index.html?pageScope=global&page=<slug>` while legacy links default to series scope. No GrapesJS
dependency was added.

Corrective note (`2026-06-04`): Phase 8 audit fixes tightened reader bindings so the `reader`
role only accepts same-series pages, preserved `seriesId` when authoring series builder-page links
from button/header editors, and made scoped page reorders reject invalid, stale, duplicate, or
wrong-scope page ID lists before mutating sort order.

Verification refreshed for this phase:

- `node --check admin/page-builder.js admin/page-builder/data.js admin/page-builder/sidebar-panel.js admin/page-builder/link-utils.js admin/page-builder/button-editor.js admin/page-builder/header-editor.js reader/app.js reader/data.js reader/page-renderer.js reader/series.js tests/admin-page-builder-data.test.js tests/admin-page-builder-shell.test.js tests/reader-data-builder.test.js tests/shared-renderers-parity.test.js tests/button-editor.test.js tests/visual/builder-preview-parity.spec.js`
- `python3 -m py_compile backend/app/models.py backend/app/page_store.py backend/app/routes/page_builder.py backend/alembic/versions/0017_page_scope_bindings.py backend/tests/helpers.py backend/tests/test_page_builder_routes.py`
- `npm run format:check`
- `npm run lint`
- `npm run format:py:check`
- `npm run lint:py`
- `npm test -- tests/admin-page-builder-data.test.js tests/admin-page-builder-shell.test.js tests/reader-data-builder.test.js tests/shared-renderers-parity.test.js tests/button-editor.test.js`
- `npm run test:backend`
- `npm test`
- `npm run build`
- `npm run test:visual`
- `git diff --check`

## Phase 9 - Special CMS Modules

Goal: Convert comic/reader, feed, and media gallery page behavior into reusable modules.

Implementation:

- Keep or rename the current `reader` module as the comic reader module.
- Add or formalize:
  - `feed` module as the feed page behavior
  - `media-gallery` module for media/gallery page behavior
  - `entry-gallery` module for selectable entry lists/grids
- Add source configuration:
  - use active page series
  - choose a specific series
  - all series where allowed
  - filter by entry label, status, tag, date, or access where supported
- For Phase 9, keep feed and media-gallery site-wide over the existing post/media data until a
  future content ownership phase adds series assignment.
- Ensure modules continue to use existing entry-management and media-access systems.
- Add page templates that create dedicated pages around these modules:
  - reader page template
  - feed page template
  - media gallery page template
- Make these templates optional conveniences, not separate hardcoded page types.

Acceptance criteria:

- A global page can contain a feed, media gallery, or selected series module.
- A series reader page can contain the reader module and still behave as the canonical reader for
  that series.
- Dedicated feed/gallery/reader pages can be created by composing normal pages with these modules.
- Existing feed, reader, and entry-gallery behavior is not regressed.

Detailed implementation plan:

Summary:

- Formalize CMS-backed modules as descriptor-backed builder modules rather than special hardcoded
  page types.
- Keep the current `reader`, `feed`, and `entry-gallery` behavior connected to entries, series,
  permissions, and protected media.
- Add a dedicated `media-gallery` CMS module for media-library output so it is distinct from the
  existing manually configured `gallery` image-grid module.

Trusted references:

- GrapesJS Components: https://grapesjs.com/docs/modules/Components.html - module descriptors map
  to component definitions whose model stays canonical.
- GrapesJS Blocks: https://grapesjs.com/docs/modules/Blocks.html - templates and reusable modules
  map to insertable blocks.
- GrapesJS Traits: https://grapesjs.com/docs/modules/Traits.html - source filters and display
  options belong in selected-module settings.
- [Part 1 Phase 5](INTERACTIVE_LIVE_PREVIEW_BUILDER_PLAN.md#phase-5---side-panel-as-blocks-layers-traits-and-styles)
  - descriptor registry, blocks, settings, and styles.
- [Admin page builder module catalog](functions/admin-page-builder.md#-current-module-catalog) -
  current modules and editor ownership.
- [Builder plan updated priorities](BUILDER_PLAN.md#updated-priorities) - current module coverage,
  preview/live parity, and safety priorities.

Important interface/type changes:

- Add or formalize descriptors for `reader`, `feed`, `media-gallery`, and `entry-gallery`.
- Keep `gallery` as the manually configured image gallery module. Add `media-gallery` only for
  dynamic media-library/gallery behavior.
- Add a shared source config shape for CMS modules, for example:
  `{ mode, seriesId?, filters?, limit?, sort? }`, where `mode` is `active-page-series`,
  `specific-series`, or `all-series`.
- Define allowed modes per module:
  - `reader`: active page series or specific series; all-series is not valid.
  - `feed`: site-wide only over existing post/feed data in Phase 9.
  - `entry-gallery`: active page series, specific series, or all-series where entry filters allow.
  - `media-gallery`: site-wide only over existing `/media.json` data in Phase 9, with private
    media filtered from public output.
- Extend backend sanitizers and frontend normalizers so unsupported source/filter fields are dropped
  per module.
- Add template definitions that create normal pages with sections and modules. Templates do not
  create new hardcoded page runtime types.

Key changes:

- Rename only if needed in UI copy. The stored `reader` module type can remain stable while its label
  becomes `Comic Reader` or similar.
- Ensure the reader module resolves its effective series from the active page binding first, then
  from explicit module source config when allowed. A canonical series reader page must have exactly
  one active reader module unless a later multi-reader design is explicitly approved.
- Keep feed module rendering tied to existing feed/latest-update systems and side-effect guards. Do
  not replace protected access or reader-side dynamic behavior with static builder HTML.
- Add the `media-gallery` module through the same media-library and protected media access rules used
  by admin media management and public media output.
- Keep `entry-gallery` connected to entry data and access-aware thumbnails. Filters for label,
  status, tag, date, and access should be introduced only where backend and renderer support exists.
- Add source/filter settings to the side panel as traits. Show only options that are valid for the
  current page scope and series context.
- Add page templates for reader, feed, media gallery, and entry gallery pages. A template creates
  normal page data: title, slug suggestion, sections, modules, and optional binding suggestion.
- Update shared renderers so admin preview and public reader output use the same module config
  normalization and mount behavior.

Test plan:

- Add descriptor tests proving special modules are present, insertability is correct, invalid source
  modes are rejected, and default configs are stable.
- Add backend sanitizer tests for each CMS module's source config, filters, limits, and unsupported
  keys.
- Add renderer tests for active-page-series resolution, specific-series resolution, all-series
  rejection where invalid, empty states, access-aware output, and preserved legacy behavior.
- Add admin shell/editor tests for source selectors, scope-aware option visibility, template
  creation, and binding warnings on reader templates.
- Add visual/browser coverage for a global feed page, global media gallery page, series reader page,
  and entry gallery with filters.
- Final implementation gate for this phase: `npm test`, `npm run test:visual`,
  `npm run test:backend`, `npm run build`, and `git diff --check`.

Assumptions:

- Special CMS modules remain structured modules. They do not save arbitrary fetched HTML into page
  records.
- Templates are authoring conveniences only and must not create separate rendering paths.
- Entry/media access checks remain owned by the existing CMS systems.

Completion note (`2026-06-04`): Phase 9 is implemented with descriptor-backed `reader`, `feed`,
`entry-gallery`, and `media-gallery` modules. CMS modules now persist a sanitized optional
`config.source` branch; legacy configs remain valid and normalize on read/save. Reader modules
support active-page-series or specific-series sources and the reader shell resolves that source
before initializing visible entry state. Entry-gallery supports active/specific/all series source
modes, and feed/media-gallery remain site-wide over existing `/api/posts` and `/media.json` data.
The new `media-gallery` module renders through shared builder/reader markup and reader-side mount
code that filters private media and preserves protected media URLs. Add Page now offers Blank,
Reader, Feed, Media Gallery, and Entry Gallery templates that create normal page, section, and
module records; the Reader template is series-only and auto-binds the series reader role only when
no reader binding exists. No backend schema, public route, or GrapesJS dependency was added.

Corrective note (`2026-06-04`): Phase 9 audit fixes made Entry Gallery template modules render
through the live reader shell, tightened reader module source authoring and backend normalization so
series pages always use their own series while global reader pages use a selected series, and
refreshed live preview snapshot handling so reader source changes reload entry data before the
snapshot is applied. No schema, saved record shape, public route, or preview message contract
changed.

Verification (`2026-06-04`): `node --check` on touched admin/reader/test JS passed;
`python3 -m py_compile backend/app/page_store.py backend/app/builder_security.py
backend/tests/test_page_builder_routes.py` passed; targeted frontend suites passed
(`tests/reader-data-builder.test.js`, `tests/reader-app.test.js`,
`tests/admin-page-builder-preview.test.js`, `tests/admin-page-builder-shell.test.js`,
`tests/reader-cms-modules.test.js`, `tests/reader-page-renderer.test.js`);
`./.venv/bin/python -m unittest backend.tests.test_page_builder_routes -v` passed; `npm run
format:check` passed; `npm test` passed (`49` files, `411` passed, `1` skipped); `npm run
test:backend` passed (`71` tests); `npm run build` passed; `npm run test:visual` passed (`3`
tests); `git diff --check` passed.

## Phase 10 - Command, Keymap, and Undo Foundation

Goal: Centralize editor actions before broad shortcuts and undo are advertised.

Implementation:

- Add a command registry, for example `admin/page-builder/commands.js`, with IDs such as:
  - `builder:select`
  - `builder:select-parent`
  - `builder:select-next`
  - `builder:select-prev`
  - `builder:insert`
  - `builder:move`
  - `builder:delete-selected`
  - `builder:duplicate-selected`
  - `builder:set-device`
  - `builder:toggle-preview`
  - `builder:toggle-menus`
- Route top toolbar, side panel, inline toolbar, and keymaps through commands.
- Add keymaps only after focus guards are solid for inputs, textareas, selects, contenteditable
  regions, and media pickers.
- Treat undo/redo as staged:
  - local draft undo first
  - structural undo only after reversible transaction records exist
  - delete undo only after restoration semantics are explicit

Acceptance criteria:

- Toolbar and keyboard actions call the same commands.
- Shortcuts do not fire while typing in controls.
- Undo/redo UI only appears for implemented and tested scopes.

Detailed implementation plan:

Summary:

- Centralize editor actions into a command registry before expanding keyboard shortcuts or undo UI.
- Use GrapesJS Commands, Keymaps, and UndoManager as the design reference, adapted to
  BWonderComics' explicit save and backend mutation model.
- Stage undo deliberately: local draft undo first, structural undo only after reversible transaction
  records exist, and delete undo only after restoration semantics are tested.

Trusted references:

- GrapesJS Commands: https://grapesjs.com/docs/modules/Commands.html - commands centralize reusable
  editor actions and can be stateful.
- GrapesJS Keymaps API: https://grapesjs.com/docs/api/keymaps.html - keymaps bind shortcuts to
  command handlers.
- GrapesJS UndoManager API: https://grapesjs.com/docs/api/undo_manager.html - undo/redo is a tracked
  stack with explicit start/stop/skip behavior.
- [Part 1 Trusted References](INTERACTIVE_LIVE_PREVIEW_BUILDER_PLAN.md#trusted-references) -
  earlier command/keymap/undo reference conclusions.
- [Admin page builder docs](functions/admin-page-builder.md#-builder-orchestrator-adminpage-builderjs)
  - current orchestration and extracted managers.

Important interface/type changes:

- Add a command registry module, for example `admin/page-builder/commands.js`, with command
  definitions shaped like `{ id, run, enabled?, visible?, describe?, confirm?, undo? }`.
- Add a command runner contract that receives builder context rather than importing global mutable
  state directly: `{ state, actions, managers, deps }`.
- Standardize command IDs with the `builder:` namespace. Initial ids should include:
  `builder:select`, `builder:select-parent`, `builder:select-next`, `builder:select-prev`,
  `builder:insert`, `builder:move`, `builder:delete-selected`, `builder:duplicate-selected`,
  `builder:set-device`, `builder:toggle-preview`, `builder:toggle-menus`, `builder:save-draft`,
  and `builder:discard-draft`.
- Add a keymap module, for example `admin/page-builder/keymaps.js`, that maps shortcuts to command
  IDs only after focus guards pass.
- Add an undo stack abstraction that can start with local draft snapshots and later accept
  structural transaction records.

Key changes:

- Route top toolbar buttons, side-panel actions, inline toolbar actions, block drag/drop actions,
  layer selection, and future keymaps through `runCommand(id, payload)`.
- Keep command definitions small. Existing owners such as `draft-manager.js`, `page-actions.js`,
  `canvas-mutations.js`, and `preview-manager.js` continue to perform real work behind injected
  action calls.
- Add command availability checks so disabled buttons, hidden toolbar actions, and keymap guards use
  the same rules.
- Add focus guards before any shortcut runs. Shortcuts must not fire from inputs, textareas,
  selects, buttons with active pointer interaction, contenteditable regions, media pickers, modals,
  file upload controls, or any element marked with a builder keymap suppression attribute.
- Start with conservative keymaps: selection navigation, preview toggle, save/discard where safe,
  and delete only when focus is not in text input and the selected target supports delete.
- Implement local draft undo/redo first for explicit-save surfaces. This can restore prior draft
  snapshots before a save, without attempting to roll back already persisted backend mutations.
- Add structural undo only after each mutation writes enough reversible transaction data: operation
  type, affected ids, previous parent/column/index, previous config/settings, and created ids.
- Keep delete undo hidden until deleted sections/modules can be restored with stable ids or a
  documented replacement-id policy.
- Provide command instrumentation hooks for tests and future diagnostics, but do not add user-facing
  history UI before implemented scopes are covered.

Test plan:

- Add command registry tests for duplicate IDs, unknown command handling, enabled/visible rules,
  confirmation behavior, dependency injection, and payload validation.
- Add shell tests proving toolbar, side panel, inline toolbar, and drag/drop call the same command
  IDs for equivalent actions.
- Add keymap tests for Ctrl/Meta variants, focus guards, contenteditable suppression, modal/media
  picker suppression, disabled command handling, and prevent-default behavior.
- Add local draft undo tests for module, header, theme, page settings, and section settings drafts.
- Add structural undo tests only when the reversible transaction format is implemented.
- Final implementation gate for this phase: `npm test`, `npm run test:visual`,
  `npm run test:backend`, `npm run build`, and `git diff --check`.

Assumptions:

- Commands centralize editor intent; they do not replace existing manager modules as business-logic
  owners.
- Undo/redo UI remains scoped to what is actually implemented and tested.
- Keymaps are additive and must never make normal typing, media picking, or inline editing risky.

Completion notes:

- 2026-06-05: Phase 10 implemented the internal builder command registry, guarded admin keymaps,
  and local draft undo/redo for explicit-save module, header, theme, page-settings, and section
  drafts. Existing Phase 6 structural commands and Phase 7 chrome-preview commands now route
  through the registry, while structural/delete undo and persisted transaction history remain out of
  scope.
- 2026-06-05: Corrective Phase 10 patch allows `Escape` to exit chrome preview while the restore
  button has focus, keys draft undo history by responsive edit scope/device for module, header, and
  section drafts, and propagates failed draft saves through `builder:save-draft`. Verification:
  `node --check` passed for touched admin builder modules and updated tests; `npm test --
tests/admin-page-builder-keymaps.test.js tests/admin-page-builder-commands.test.js
tests/admin-page-builder-undo-stack.test.js tests/admin-page-builder-draft-manager.test.js
tests/admin-page-builder-shell.test.js tests/live-drop-placement.test.js
tests/responsive-overrides.test.js tests/admin-page-builder-preview-contract.test.js` passed (`8`
  files, `120` tests); `npm test` passed (`53` files, `437` passed, `1` skipped); `npm run
test:backend` passed (`71` tests); `npm run build` passed; `npm run test:visual` passed (`3`
  tests); `npm run format:check` passed after formatting; `git diff --check` passed.

## Phase 11 - Inline Editing

Goal: Edit text-like content directly in the live canvas when the module data model supports it.

Implementation:

- Start with the `text` module.
- Add a preview-local rich text/contenteditable adapter that writes to `activeModuleDraft`.
- Reuse existing text sanitization.
- Keep the side panel synchronized with inline draft edits.
- Later candidates:
  - button labels
  - promo copy
  - header title/subtitle
  - feed/gallery display labels where data ownership is clear

Acceptance criteria:

- Inline editing updates the draft, not the DOM as canonical state.
- Save/discard behaves the same as side-panel edits.
- Switching targets, devices, or preview mode does not lose or double-apply edits.

Detailed implementation plan:

Summary:

- Add inline editing for the `text` module first, using the live iframe as an editing view over the
  existing explicit draft model.
- Reuse existing frontend normalization and backend sanitization. The iframe DOM is never the saved
  source of truth.
- Keep the rich text toolbar small and defer broader inline editing until data ownership is clear
  for each module field.

Trusted references:

- GrapesJS RichTextEditor API: https://grapesjs.com/docs/api/rich_text_editor.html - rich text
  editing should keep a small toolbar and leave broad styling to the style manager.
- GrapesJS Components: https://grapesjs.com/docs/modules/Components.html - component view behavior
  can support editing while the model remains canonical.
- GrapesJS Traits: https://grapesjs.com/docs/modules/Traits.html - selected settings remain the
  synchronized side-panel representation of editable fields.
- [Part 1 Phase 2](INTERACTIVE_LIVE_PREVIEW_BUILDER_PLAN.md#phase-2---live-canvas-as-the-editor)
  - the live iframe canvas remains the editor view.
- [Part 1 Phase 5](INTERACTIVE_LIVE_PREVIEW_BUILDER_PLAN.md#phase-5---side-panel-as-blocks-layers-traits-and-styles)
  - settings and style controls stay in the side panel.
- [Builder plan audit](BUILDER_PLAN.md#high-risk-issues) - content safety remains a high-risk area
  for text and HTML content.

Important interface/type changes:

- Extend the preview/interaction contract with inline-edit messages only after Phase 3 target
  messages exist, for example: `INLINE_EDIT_START`, `INLINE_EDIT_CHANGE`, `INLINE_EDIT_COMMIT`,
  and `INLINE_EDIT_CANCEL`.
- Add editable field markers to supported renderer output, such as
  `data-builder-edit-field="content"` on the safe editable region of a `text` module.
- Add an inline edit state in the builder shell:
  `{ moduleId, field, initialValue, draftValue, status }`.
- Route inline edit changes into the same module draft shape used by the side panel. For `text`,
  this means updating `activeModuleDraft.config` for the selected module rather than writing
  directly to saved page data.
- Keep sanitization layered: preview-local cleanup for editing ergonomics, frontend normalization for
  draft stability, and backend sanitization on save.

Key changes:

- Enable inline editing only in edit mode, only for selected supported targets, and only when there
  is no incompatible dirty draft already active.
- On edit start, select the module, initialize or reuse its module draft, mark the editable element
  as contenteditable inside the iframe, and position a compact formatting toolbar if basic rich text
  controls are enabled.
- Keep the first toolbar minimal: bold, italic, link where link normalization is ready, and clear
  formatting. Do not expose arbitrary font, color, size, or CSS controls through inline editing.
- Send change messages to the admin shell and update the active module draft. Avoid full iframe
  rerenders on every keystroke so cursor position is not destroyed; rerender on commit, target
  switch, device switch, save, discard, or explicit refresh.
- Keep the side panel synchronized by rendering the current draft value in the text module editor.
  Side-panel edits and inline edits should update the same draft object.
- Save and discard use the existing module draft footer. Save persists through `updateModule(...)`;
  discard restores from the hydrated module config and tells the iframe to cancel the editable view.
- Escape and restore-button flows cancel or commit according to the same dirty-workspace policy used
  by side-panel drafts. Do not silently drop typed content.
- Later inline candidates must be approved field by field: button labels, promo copy, header
  title/subtitle, and feed/gallery display labels only where ownership and sanitization are clear.

Test plan:

- Add preview-contract tests for inline edit message validation, supported field ids, bad sessions,
  bad page identity, overlong values, and unsupported module/field combinations.
- Add reader bridge tests for enabling/disabling contenteditable, change/commit/cancel messages,
  link blocking while editing, and disabled behavior during chrome-collapsed preview.
- Add admin shell/draft tests proving inline edits initialize the module draft, sync with side-panel
  fields, save through `updateModule(...)`, discard correctly, and survive device/target changes
  according to dirty-workspace rules.
- Add sanitizer tests for pasted text, stripped event handlers, unsafe links, empty content, and
  allowed rich text tags for the `text` module.
- Add visual/browser coverage for editing text in Desktop/Tablet/Phone, switching to the side panel
  mid-edit, discarding, saving, and reloading.
- Final implementation gate for this phase: `npm test`, `npm run test:visual`,
  `npm run test:backend`, `npm run build`, and `git diff --check`.

Assumptions:

- Inline editing does not make the live DOM canonical.
- The initial scope is the `text` module only.
- Rich text styling remains constrained; broad visual style controls belong in the Phase 5 style
  manager and Phase 4 responsive override contracts.

Completion note:

- 2026-06-05: Phase 11 implemented text-module inline editing over the live reader iframe without
  making iframe DOM canonical. Shared renderers now emit `data-builder-edit-field="content"` only
  for builder-editing text modules; the preview contract validates internal `INLINE_EDIT_START`,
  `INLINE_EDIT_CHANGE`, `INLINE_EDIT_COMMIT`, and `INLINE_EDIT_CANCEL` messages; the reader bridge
  starts temporary `contenteditable` editing from double-click or admin toolbar requests, posts
  inline draft messages, and keeps normal typing/selection available while blocking reader
  shortcuts. The admin builder routes inline edit commands through the Phase 10 command registry,
  updates `activeModuleDraft.content`, synchronizes the side panel, records local draft undo/redo,
  refreshes preview source metadata without iframe rerenders on each input, and persists only
  through the existing module Save flow. No backend schema, saved record shape, public reader route,
  or public reader rendering contract changed.
- Verification: `node --check` passed for touched admin/reader JS and updated tests; `npm test --
tests/admin-page-builder-preview-contract.test.js tests/reader-preview-bridge.test.js
tests/admin-page-builder-commands.test.js tests/admin-page-builder-shell.test.js
tests/reader-page-renderer.test.js tests/shared-renderers-parity.test.js` passed (`6` files,
  `131` tests); `npm run format:check` passed; `npm run lint` passed; `npm test` passed (`53`
  files, `444` passed, `1` skipped); `npm run test:backend` passed (`71` tests); `npm run build`
  passed; `npm run test:visual` passed (`3` tests); `git diff --check` passed.
- 2026-06-05 corrective patch: inline editing now keeps the admin module draft canonical during
  side-panel/iframe races by syncing sanitized side-panel content back into the active iframe edit
  view and ignoring stale iframe commit/cancel payloads. The reader bridge sanitizes active inline
  DOM on input, paste, and formatting, rejects unsafe inline toolbar links, prevents editable anchor
  activation, and lets its own toolbar receive clicks without triggering target selection. Save,
  Discard, device switches, chrome-preview entry, and transient cancel now send deterministic iframe
  cleanup messages before or with preview refreshes.
- Corrective verification: `node --check` passed for touched admin/reader JS and updated tests;
  `npm test -- tests/reader-preview-bridge.test.js tests/admin-page-builder-shell.test.js
tests/admin-page-builder-preview-contract.test.js tests/shared-renderers-parity.test.js` passed
  (`4` files, `121` tests).

## Phase 12 - Testing and Release Gates

Unit and integration coverage:

- page scope migration and routing
- global page APIs and series-attached page APIs
- special module config normalization and sanitization
- responsive override resolution
- live-canvas target marker emission
- preview-contract target message validation
- reader target collection and geometry payloads
- admin overlay mapping and stale cleanup
- side-panel selection synchronization
- command/keymap focus guards

Visual/browser coverage:

- open builder and confirm full-page editor shell
- switch Desktop, Tablet, and Phone and confirm canvas dimensions
- select live page modules and edit through the side panel
- save per-device overrides and confirm reload behavior
- collapse to preview and restore menus with the top-left button
- drag modules into the live canvas
- create a global page with feed/media-gallery modules
- open a series reader page with the reader module attached

Release verification order:

1. `npm test`
2. `npm run test:visual`
3. `npm run test:backend`
4. `npm run build`
5. `git diff --check`

Detailed implementation plan:

Summary:

- Treat Phase 12 as the release gate for the full live-builder program, not as proof that the plan
  has already passed.
- Keep tests aligned to the feature boundaries in Phases 1-11: shell, iframe editing, overlays,
  devices, side panel, drag/drop, preview collapse, page scope, special modules, commands/keymaps,
  undo, and inline editing.
- Record completion notes with concrete command results when phases close.

Trusted references:

- [Builder Preview Parity Plan](BUILDER_PREVIEW_PARITY_PLAN.md) - prior release-gate style,
  preview exactness definition, and visual verification expectations.
- [Admin overview](admin-overview.md#page-builder-workflow) - current builder workflow and preview
  contract.
- [Admin page builder docs](functions/admin-page-builder.md) - current module ownership and test
  seams.
- [Part 1 Developer and LLM Notes](INTERACTIVE_LIVE_PREVIEW_BUILDER_PLAN.md#developer-and-llm-notes)
  - phase completion notes must be concrete and evidence-backed.

Important interface/type changes:

- No production API or data shape changes are introduced by Phase 12 itself.
- Add or update test fixtures as needed for:
  - global and series page scopes
  - reader page bindings
  - special CMS modules
  - preview target geometry
  - responsive overrides
  - command/keymap focus contexts
  - inline editing sanitization
- Add durable QA documentation only when a phase needs manual evidence that cannot be represented
  well in automated tests.

Key changes:

- Unit coverage should include pure helpers and contracts: preview messages, target refs, drop
  ranking, responsive resolution, module descriptors, source config normalization, command registry,
  keymap guards, undo stack behavior, and inline edit validation.
- Integration coverage should include backend routes, migrations, page-store queries, builder data
  access, draft lifecycle, structural mutations, shared renderers, reader preview bridge, and admin
  preview manager.
- Browser/visual coverage should include the author workflows: open full-page builder, select live
  targets, switch devices, edit side-panel settings, drag/drop modules, collapse/restore preview,
  create global pages, bind series reader pages, use special modules, run key commands, and edit text
  inline.
- Regression coverage should preserve existing behavior from current docs: explicit Save/Discard,
  page publish clarity, header metadata parity, exact iframe viewport sizing, reader side-effect
  suppression, protected media behavior, and fallback-retirement expectations.
- Manual QA should focus on high-risk user experience gaps that automated tests may miss: overlay
  alignment while scrolling, mobile touch/pointer behavior, keyboard navigation, focus restoration,
  long page scroll preservation, and destructive-action confirmations.
- Completion notes should identify the exact phase, summarize what landed, list verification
  commands with pass/fail status, and leave future phases marked planned.

Test plan:

- Phase-level targeted gates should run before broad suites. Each implementation phase should list
  its focused frontend, backend, and visual tests in its completion note.
- Full release verification order remains:
  1. `npm test`
  2. `npm run test:visual`
  3. `npm run test:backend`
  4. `npm run build`
  5. `git diff --check`
- If Playwright creates `test-results/`, clean it after evidence is captured unless the user asks
  to inspect artifacts.
- For documentation-only updates to this section, the minimum verification is `git diff --check`.

Assumptions:

- Phase 12 does not implement missing feature work. It verifies work already completed in earlier
  phases.
- A phase should not be marked complete unless its scoped tests and acceptance criteria have real
  evidence.
- Visual parity means the live builder preview and public reader continue through the shared
  `applyBuilderPageToDOM(...)` path and exact iframe viewport dimensions.

Completion note:

- 2026-06-05: Phase 12 added browser-level release workflow coverage in
  `tests/visual/builder-authoring-workflows.spec.js` alongside the existing visual parity
  screenshots. The new Playwright workflow uses stateful local builder/page route mocks to verify
  full-page builder entry, bound series reader loading, exact Desktop/Tablet/Phone iframe
  dimensions, chrome-preview collapse/restore, side-panel text save and reload, current-device text
  override persistence, inline text Save/Discard behavior, live block drag/drop persistence, and
  global Feed template page creation. During the release-hardening pass, the live target overlay was
  patched so overlay redraws do not register duplicate drag/drop listeners on the same drop surface.
  Testing docs now document the Phase 12 workflow spec, keep frontend coverage percentages
  informational, and record that full release verification remains manual/local while CI continues
  running the existing faster frontend coverage and backend gates.
- Verification: syntax checks passed for `admin/page-builder/preview-manager.js` and
  `tests/visual/builder-authoring-workflows.spec.js`; the targeted Phase 12 Playwright workflow
  passed (`3` tests). Final release-gate results: `git diff --check`, `npm run format:check`,
  `npm run lint`, `npm run format:py:check`, `npm run lint:py`, `npm test`,
  `npm run test:backend`, `npm run build`, and `npm run test:visual` passed.
- 2026-06-06 follow-up: Desktop live preview now uses an exact `1920x1080`
  full-HD iframe preset with an admin-only scale shell so it fits the editor
  without changing iframe CSS pixels. Tablet (`768x1024`) and Phone
  (`375x812`) remain unchanged, and exact iframe pixels remain authoritative
  for preview parity and builder workflow coverage.

## Risks and Guardrails

- Do not make browser DOM the source of truth. The canonical state remains typed builder records and
  drafts.
- Do not lose custom CMS behavior while generalizing pages. Reader, feed, entry picker, and media
  gallery modules must stay connected to entries, series, permissions, and media access.
- Do not expose arbitrary CSS. Device overrides and style controls need explicit data contracts and
  sanitizers.
- Do not remove series reader guarantees. Every series still needs an attached reader page.
- Do not ship per-device editing as visual-only behavior. Overrides must save, reload, and render
  predictably.
- Do not advertise undo/redo beyond implemented transaction coverage.

## Suggested Implementation Order

1. Full-page builder shell
2. Live canvas as the editor
3. Interaction bridge and overlays
4. Device modes and per-device overrides
5. Side panel blocks/layers/traits/styles
6. Live drag/drop and inline toolbar actions
7. Preview chrome collapse and restore button
8. Page scope/routing migration
9. Special CMS modules and page templates
10. Command/keymap/undo foundation
11. Inline editing
12. Full visual and release verification

The first shippable milestone should include Phases 1-4: the builder opens full-page, the live
reader canvas is the editor, elements can be selected from the rendered page, and Desktop/Tablet/
Phone modes are real editable contexts. The page-scope migration and special module work should be
planned early but shipped behind explicit migration tests because it changes public routing and
series behavior.
