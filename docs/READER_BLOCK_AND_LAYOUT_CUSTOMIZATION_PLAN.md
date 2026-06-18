# Reader Block and Layout Customization Plan

Status: Planned post-Phase-12 work
Created: 2026-06-06

## Purpose

Turn the comic reader into an authorable page-builder block instead of a permanent fixture on every
builder page. A canonical series reader page still needs one active reader block, but ordinary
series pages and global pages should be able to omit the reader entirely, place content above or
below it, or build custom pages without forced reader chrome. Bound reader pages should also support
normal authored sections and columns below the required reader block.

This plan also covers two related authoring gaps:

- Reader customization: control reader display mode, controls styling/size, stage behavior, panels,
  and comments from the reader module.
- Layout customization: control section column count and per-column/panel styling through structured,
  sanitized builder data.

## Current Source Of Truth

- `docs/functions/reader-core.md` describes the current reader runtime, preview side-effect policy,
  builder-page loading, and reader bridge behavior.
- `docs/admin-overview.md` and `docs/functions/admin-page-builder.md` describe the full-page builder,
  live iframe preview, module ownership, commands, and explicit draft workflow.
- `admin/page-builder/module-descriptors.js` defines the current `reader` descriptor. Today it only
  stores source, `showPanels`, and `showComments`.
- `admin/page-builder/shared-renderers.js` is the shared renderer factory used by public reader output
  and admin preview. Its current `reader` renderer emits a `.pb-reader-mount`.
- `admin/page-builder/module-editor.js` owns the reader module editor controls.
- `reader/data.js` currently applies builder pages to the existing static reader shell and routes
  non-reader modules into left/right panels from section columns.
- `reader/render.js`, `reader/controls.js`, and `reader/transform.js` own paged image rendering,
  page navigation, zoom/pan, fullscreen fitting, and dynamic frame sizing.
- `backend/app/builder_security.py` and `backend/app/page_store.py` own allowed module types,
  layout validation, column validation, reader source normalization, and sanitization.

## Product Model

- The `reader` module becomes the only source of visible reader stage, page images, reader controls,
  comments, and reader side panels on builder pages.
- Pages without a `reader` module render normal builder content without forcing `.viewerWrap`,
  `.stageWrap`, `.controls`, comments, or side panels into view.
- A bound series reader page must contain exactly one active, non-hidden `reader` module. Missing,
  duplicate, or hidden reader modules should produce admin warnings and block publish or binding
  updates where practical.
- A bound series reader page may contain normal builder sections and columns before or after the
  required reader module. Under-reader columns are ordinary page content and must not invalidate the
  reader binding.
- Global pages may contain a reader module that targets a specific series, but they are not valid
  `reader` bindings for a series.
- The reader DOM remains a view. Saved builder page/section/module records remain canonical.

## Proposed Data Contracts

### Reader Module Config

Extend `reader` module config with a structured, sparse contract:

```json
{
  "source": { "mode": "active-page-series", "seriesId": "" },
  "displayMode": "paged",
  "showPanels": true,
  "showComments": true,
  "controls": {
    "placement": "below",
    "size": "medium",
    "style": {
      "defaults": { "appearance": null },
      "primary": { "appearance": null }
    }
  },
  "stage": {
    "fit": "dynamic-frame",
    "pageGap": 8,
    "frameBorder": true,
    "maxWidth": null
  },
  "panels": {
    "left": { "enabled": true },
    "right": { "enabled": true }
  },
  "responsive": {}
}
```

Rules:

- `displayMode` is `paged` or `vertical-scroll`.
- `paged` keeps current one-page/two-page spread behavior.
- `vertical-scroll` renders all pages for the selected entry in a continuous vertical strip.
- Reader controls use structured options and existing appearance sanitizers. Do not add arbitrary
  CSS, raw HTML, or style strings.
- Series pages force `source.mode = "active-page-series"` for reader modules. Global reader modules
  use `specific-series`.
- Device overrides may expose only safe reader settings: visibility, display mode, controls size,
  controls placement, panel visibility, comments visibility, page gap, and fit behavior.

### Section And Column Layout Config

Evolve section layout from fixed preset strings into an authorable but sanitized column contract.
Keep the existing `layout` string for compatibility during migration.

```json
{
  "layout": "1-1",
  "settings": {
    "columnGap": 24,
    "moduleGap": 16,
    "columns": [
      {
        "index": 0,
        "width": 1,
        "appearance": null,
        "padding": { "top": 0, "right": 0, "bottom": 0, "left": 0 },
        "alignment": "stretch",
        "hidden": false
      }
    ]
  }
}
```

Rules:

- Support 1-6 columns.
- Preserve legacy layouts (`1`, `1-1`, `1-2`, `2-1`, `1-1-1`, `1-3-1`) by mapping them to column
  width ratios.
- Validate module `columnIndex` against the effective column count before save, move, reorder, and
  render.
- Sections after a reader module remain valid on bound reader pages and render as normal page
  content below the reader stage, not inside reader side panels or the reader mount.
- Per-column styling uses sanitized appearance, spacing, width ratio, alignment, and visibility
  fields only.
- Panel-specific styling remains structured. Reuse or migrate `meta.panelBackgrounds` and
  `meta.panelSpacing` where it represents side-panel surfaces, but do not overload it for generic
  content columns.

## Phase 1 - Audit And Decouple Permanent Reader Shell

Goal: Make generic builder pages render without forced reader chrome.

Implementation:

- Audit `index.html`, `reader/app.js`, `reader/data.js`, `reader/render.js`, `reader/controls.js`,
  `reader/transform.js`, comments, fullscreen, pointer handlers, and preview bridge assumptions
  about static `.viewerWrap`, `.stageWrap`, `.controls`, side panels, and comments.
- Add a reader-shell state resolver that detects whether the active builder page has an effective
  reader module.
- When no reader module exists, hide or detach reader-only chrome deterministically after builder
  page application and avoid initializing reader-only side effects.
- Preserve header rendering, normal builder sections/modules, links, feed/media/entry-gallery
  modules, preview metrics, and admin target markers for non-reader pages.
- Keep same-origin builder preview and public reader route behavior aligned.

Acceptance criteria:

- A global or series custom page with no reader module shows only authored builder content.
- Reader controls, comments, stage, side panels, pointer handlers, fullscreen controls, and page
  navigation do not appear or run on no-reader pages.
- The public reader and admin live preview remain in parity.

Completion note (`2026-06-12`): Phase 1 is implemented. `reader/shell-state.js` now publishes the
active/inactive reader-shell contract from effective `reader` modules only, and `reader/data.js`
renders no-reader pages into `#builderPageContent` while hiding the static reader shell. `reader/app.js`
resolves builder pages before loading entry data so no-reader pages skip reader analytics, gallery,
latest-panel, pointer, fullscreen, keyboard navigation, and render startup. Standalone live tracking,
comments, and inline comment toggles now wait for or check the shell state before running. Coverage
was added for no-reader DOM rendering, builder target markers, app boot, side-effect suppression, and
public/admin preview browser behavior. Verification passed: `git diff --check`,
`npm run format:check`, `npm run lint`, `npm test` (`459` passed, `1` skipped),
`npm run build`, and `npm run test:visual` (`7` passed). Backend gates were not run because this
phase did not change backend code or API payload contracts.

Fix addendum (`2026-06-12`): Phase 1 audit findings are fixed. Inactive no-reader pages now also
hide/inert reader-owned topbar controls (`.entry-controls`, `#entry`, and `#statusPanel`) while
preserving normal header brand/nav/auth surfaces. Reader navigation, zoom, pointer, entry, and resize
handlers now check the current shell state so active-to-inactive preview snapshots cannot keep reader
actions live. Comments subscribe to shell-state changes and initialize once when a later preview
snapshot becomes active. Verification passed: `git diff --check`, `npm run format:check`,
`npm run lint`, `npm test` (`465` passed, `1` skipped), `npm run build`, and
`npm run test:visual` (`7` passed). Backend gates were not run because this fix did not change backend
code or API payload contracts.

## Phase 2 - Reader Module Lifecycle And Binding Rules

Goal: Make the reader block authoritative while preserving series reader guarantees.

Implementation:

- Update descriptors and template behavior so the reader is a normal insertable block where allowed,
  not a permanent page fixture.
- Add admin validation/warnings for bound series reader pages:
  - missing reader module
  - duplicate reader modules
  - reader module hidden on the active default device
  - reader module targeting the wrong source
- Block publish or reader-binding save for invalid bound reader pages where the backend can enforce
  it safely.
- Keep ordinary pages free to add or remove reader modules.
- Make delete/hide flows warn when they would invalidate the bound series reader page.
- Ensure reader template creation inserts one reader module and binds only when no reader binding
  exists, matching the current template principle.

Acceptance criteria:

- Authors can remove the reader from non-bound pages.
- Bound series reader pages cannot silently lose their only active reader module.
- Bound series reader pages can still add, remove, and style normal sections/columns below the
  required reader module without breaking the binding.
- Existing series reader routes keep working after migration.

Completion note (`2026-06-14`): Phase 2 is implemented. Series reader bindings now require an
actual valid reader module lifecycle: the bound page must be series-scoped, target the same series,
contain exactly one reader module, keep it visible on the canonical default `desktop` device, and use
the active page series source. Backend binding saves and publishes now reject invalid bound reader
pages with stable warning/error codes, and public/homepage bound-reader resolution no longer treats
slug, page type, or stale bindings as sufficient. Admin authoring now validates reader-binding saves,
keeps the Reader template inserting one reader module, and warns before deleting, section-deleting, or
hiding the only bound reader module while still allowing confirmed draft edits. Docs for the admin
builder, reader runtime assumptions, and API warning payloads were updated. Verification passed:
`git diff --check`, `npm run format:check`, `npm run lint`, `npm test` (`475` passed, `1` skipped),
`npm run format:py:check`, `npm run lint:py`, `npm run test:backend` (`73` passed),
`npm run build`, and `npm run test:visual` (`7` passed).

Fix addendum (`2026-06-14`): Phase 2 audit follow-ups are applied. Invalid bound-reader publish
validation now runs before page metadata mutation and structured validation failures roll back the
route session before returning `400`. Admin binding-save failures from the backend now surface in the
editor status and page-list warning area. Reader-module hide warnings now distinguish the backend
Desktop binding rule from current-device authoring advice: hiding the bound reader on Desktop remains
blocking, while Tablet/Phone hide actions show advisory copy and do not claim publish or binding
saves will be blocked.

## Phase 3 - Reader Module Customization

Goal: Expose reader display and controls settings through the module editor.

Implementation:

- Extend the reader module descriptor default config and backend sanitizer with `displayMode`,
  `controls`, `stage`, and `panels`.
- Add structured reader editor controls:
  - display mode: paged or vertical scroll
  - controls placement: above, below, overlay, hidden
  - controls size: compact, medium, large
  - controls button appearance using the existing appearance contract
  - stage fit: dynamic frame, width, height, natural
  - page gap and frame border
  - side panel visibility and comments visibility
- Render these settings through shared renderer data attributes so admin preview and public reader
  runtime consume the same contract.
- Add device-scope overrides for the safe reader fields listed above.
- Keep save/discard/undo behavior on the existing explicit module draft path.

Acceptance criteria:

- Reader controls can be restyled and resized without custom CSS.
- Paged reader behavior remains unchanged when new config is absent.
- Device overrides affect preview and public runtime consistently.

Completion note (`2026-06-15`): Phase 3 is implemented for the existing paged reader shell. The
reader descriptor and backend sanitizer now normalize `displayMode`, `controls`, `stage`, `panels`,
legacy `showPanels`, `showComments`, and safe device overrides. The reader module editor exposes
structured source, controls placement/size, controls appearance, stage fit/gap/frame/max-width,
panel visibility, and comments visibility controls; the Vertical Scroll option is stored-compatible
but disabled in the editor until Phase 4. Shared builder rendering emits normalized
`.pb-reader-mount` data attributes, and `reader/data.js` resolves the effective reader module config
before applying controls, stage, panel, and comments settings to the static shell. Visual coverage now
includes a separate customized paged reader route in both public reader and admin live preview.
Verification passed: `git diff --check`, `npm run format:check`, `npm run lint`, `npm test`
(`477` passed, `1` skipped), `npm run format:py:check`, `npm run lint:py`,
`npm run test:backend` (`74` passed), `npm run build`, and `npm run test:visual` (`8` passed).

## Phase 4 - Vertical Comic Mode

Goal: Add Webtoon-style vertical scrolling as a reader display mode.

Implementation:

- Add a reader runtime branch for `displayMode: "vertical-scroll"`.
- Render all accessible pages for the current entry in document order inside the reader module mount.
- Disable one-page/two-page spread layout, pan transforms, and page-turn slide animations in vertical
  mode.
- Adapt controls to entry-level navigation, jump-to-page, restart, next entry, previous entry, and
  optional compact progress.
- Use scroll position and page visibility to update progress, analytics, comments target, and
  reading position.
- Preserve premium gating, scheduled/empty entry states, preload behavior, safe-mode redirects, and
  preview side-effect suppression.
- Decide fullscreen behavior explicitly: either disable fullscreen in vertical mode for v1 or enter a
  scroll-focused fullscreen container without pan/zoom.

Acceptance criteria:

- Vertical mode scrolls all pages naturally on desktop, tablet, and phone.
- Progress resumes near the saved page/scroll position.
- Analytics still records visible pages and entry completion accurately enough for reader
  engagement reporting.
- Paged mode remains regression-free.

Completion note (`2026-06-15`): Phase 4 is implemented. The runtime now honors the authored display
mode (`getReaderRuntimeConfig` no longer pins `paged`) and the module editor exposes a selectable
Vertical Scroll option. A new `reader/display-mode.js` helper publishes the active mode and a new
`reader/vertical.js` renders every entry page into a dedicated `#verticalStrip` inside `#viewport`
(the paged `#stageWrap` and its cached nodes are hidden, never destroyed, so paged/vertical preview
switches repaint cleanly). `render()` branches on the mode; `updateUI()` is mode-aware (entry-level
prev/next disabled state, single-page indicator/progress). An IntersectionObserver over the strip
derives `state.pageIndex` from scroll position, driving page-view analytics and last-page completion;
`getVisiblePageIndexes()` is mode-aware so vertical mode never reports the two-page phantom pair.
Progress save/load gained an additive `scrollRatio` for resume; pointer pan/zoom/swipe/edge gestures,
zoom/fullscreen controls, and zoom/fullscreen keyboard shortcuts are disabled in vertical mode (per v1
decisions: fullscreen disabled, zoom/pan disabled). Boot order was fixed so the effective reader shell
settings (and therefore the display mode) apply before the first `render()` on both the public and
preview paths, and a `readerDisplayModeChanged` event re-renders preview snapshots that switch modes
without leaving stale observers. CSS adds the vertical layout and control-hiding rules; the page-gap
var is also published on `#viewport` so the strip inherits it. Coverage adds `reader-vertical`,
`reader-vertical-analytics`, and a `vertical-scroll` visual route asserting public/admin parity at
desktop, tablet, and phone. Verification passed: `git diff --check`, `npm run format:check`,
`npm run lint`, `npm test` (`515` passed, `1` skipped), `npm run format:py:check`, `npm run lint:py`,
`npm run test:backend` (`75` passed), `npm run build`, and `npm run test:visual` (`11` passed).
Corrective patch (`2026-06-15`): inactive reader-shell transitions now deterministically tear down
vertical observers and remove stale `#verticalStrip` DOM, and saved vertical scroll restore is now
one-shot, image-load/error settled, and canceled by real user scroll so late image events cannot snap
the viewport back.

## Phase 5 - Section, Column, And Panel Styling

Goal: Let authors control page columns and individual column/panel styling.

Implementation:

- Add a layout editor that supports selecting 1-6 columns and width ratios.
- Migrate fixed layout presets into the new column settings model while still serializing compatible
  `layout` strings until all consumers are updated.
- Add live-canvas insertion paths for adding a normal section below the selected reader module on a
  bound reader page, then editing that section's column count and per-column styles.
- Add per-column controls for background, text color where applicable, border, radius, padding,
  alignment, minimum height, hidden state, and responsive overrides.
- Update shared renderers to emit column styles from sanitized column settings.
- Update live drop placement, module move validation, layers, overlays, and target geometry so they
  use the effective column count and stable column identities.
- Keep panel styling distinct from generic section columns. If side panels remain reader surfaces,
  style them through reader module `panels` settings or page-level panel settings with explicit
  precedence.

Acceptance criteria:

- Authors can create and style layouts with 1-6 columns.
- Modules and normal sections/columns can be inserted above and below reader modules like any other
  block, including below the required reader module on bound reader pages.
- A styled under-reader column on a bound reader page renders below the reader in admin preview and
  public reader output.
- Existing pages with fixed layout strings render the same after migration.
- Per-device layout changes do not corrupt global module placement.

Completion note (`2026-06-18`): Phase 5 is implemented. The section `layout` string is generalized
to a 1-6 segment ratio contract (each segment a positive integer 1-12; legacy presets are a strict
subset) and is the single source of truth for column count and width ratios; `validate_layout`,
`parse_layout_ratios`, and `layout_column_count` in `backend/app/builder_security.py` enforce it. A
new `sanitize_column_settings` +
`sanitize_column_responsive` sanitize sparse per-column styling (appearance, padding, alignment,
min-height, hidden, per-device overrides) through the existing appearance contract, wired into
`sanitize_section_settings`. `update_section` now rehomes modules orphaned by a column-count
reduction to the last column in the same commit (atomic, no dropped modules) instead of rejecting the
change. Shared rendering (`shared-renderers.js`) keeps every global structural column in stable index
order, emits per-column inline styles, and treats responsive layouts as grid-track reflow without
rewriting module ownership. Device overrides now apply on the public runtime via scoped `@media` CSS
emitted by `responsive-css.js` (banded desktop/tablet/phone queries), not just in the admin preview.
Bound reader pages render sections before/after the reader module into new `#builderAboveReader` /
`#builderBelowReader` surfaces (`reader/data.js`), and reader panels are now fed only from the reader's
own section. The section inspector gained a column-count selector (1-6), per-column width-ratio inputs,
the shared sanitized appearance editor, and device-specific reflow/style controls saved atomically
(layout + settings.columns) through the existing section draft. Pure layout helpers live in
`admin/page-builder/layout-utils.js` (shared by the public bundle and admin).

Corrective addendum (`2026-06-18`): Phase 5 audit findings are fixed. Dirty section snapshots now
copy normalized draft `layout` and settings into the iframe before Save. The shared effective-column
resolver drives admin rendering and public responsive CSS, keeps global column nodes/module ownership
stable, restricts device tracks to the global count, and removes hidden columns from effective grid
templates. Current Device authoring exposes reflow ratios plus sparse appearance, padding, alignment,
minimum-height, and visibility overrides for every global column; visibility can explicitly inherit,
show, or hide. Global shrink persistence retains the last surviving column's modules first, appends
orphans by original column/sort order, and resequences the merged destination contiguously. The visual
fixture again preserves authored sections around the reader and now covers styled four-/six-column
sections, responsive reflow, hidden columns, and public/live-preview parity at all three device
widths. Verification passed: `git diff --check`, `npm run format:check`, `npm run lint`, `npm test`
(`534` passed, `1` skipped), `npm run format:py:check`, `npm run lint:py`,
`npm run test:backend` (`76` passed), `npm run build`, and `npm run test:visual` (`14` passed).

## Phase 6 - Regression And Release Gates

Goal: Prove the reader-block and layout contracts work across backend, admin, reader runtime, and
visual parity.

Required tests:

- Backend tests:
  - reader module config sanitizer accepts valid `displayMode`, controls, stage, panels, and
    responsive overrides
  - invalid reader configs are pruned or rejected
  - bound series reader pages require exactly one active reader module
  - global pages cannot become series reader bindings
  - section layout validation accepts new column contracts and rejects invalid column indexes
  - per-column styles are sanitized

- Frontend builder tests:
  - authors can add/remove reader blocks on non-bound pages
  - bound reader page delete/hide/remove flows warn or block correctly
  - reader template creates one reader module and binding behavior stays stable
  - reader customization controls save through module drafts and respect dirty guards
  - column count and per-column styles save/discard/undo correctly
  - bound reader pages can add and style a section/column below the required reader module without
    losing the reader binding
  - live drag/drop can place blocks above and below reader modules

- Reader/runtime tests:
  - pages without reader modules do not initialize or show reader chrome
  - paged reader pages still mount stage, controls, panels, comments, entry select, fullscreen, and
    navigation
  - vertical mode renders all entry pages in order
  - vertical mode updates progress, comments target, and analytics
  - under-reader sections render after the reader mount on bound reader pages
  - premium, scheduled, draft/unpublished, and empty entry states remain safe
  - preview mode keeps side-effect suppression

- Shared renderer/parity tests:
  - admin preview and public reader render the same reader mount attributes
  - per-column styles render identically in shared renderer output
  - responsive overrides apply consistently to reader and columns

- Playwright visual coverage:
  - no-reader custom page
  - paged reader page
  - vertical-scroll reader page
  - blocks above and below a reader module
  - a bound reader page with a styled column below the reader
  - styled 1, 2, 3, and 4+ column layouts
  - desktop 1920x1080, tablet 768x1024, and phone 375x812 public/admin preview
    captures against the same committed baselines

Final gate:

- `git diff --check`
- `npm run format:check`
- `npm run lint`
- `npm test`
- `npm run test:coverage`
- `npm run format:py:check`
- `npm run lint:py`
- Ruff format check for changed backend tests
- `npm run test:backend`
- `npm run build`
- `npm run test:visual`

Completion note (`2026-06-18`): Phase 6 is complete after a corrective security, persistence,
atomicity, and parity pass. Every `/admin/*` and `/api/admin/*` series-data read now requires an
authenticated admin and successful responses use `Cache-Control: no-store`. Entry saves validate and
persist `status` + `publishAt`, normalize future published entries to scheduled, normalize due
scheduled entries to published, and promote due database rows before public/admin payloads are built.
Public payloads omit drafts, advertise future scheduled entries as COMING SOON with pages withheld,
and expose pages after release; authenticated admin payloads retain every entry, raw publication
metadata, and complete pages. The optional `comingSoon` field was removed from admin/reader behavior
because scheduled status is authoritative.

`update_module` now validates and sanitizes the complete proposed type, column, sort order, and config
before mutating the SQLAlchemy object, and module mutation routes roll back on validation errors.
Regression coverage proves a composite rejected update cannot persist earlier valid field changes.
Phase 5 visual coverage now captures both public output and the matching admin iframe against the
same desktop/tablet/mobile baselines for styled 1/2/3/4+ column layouts. The "Open Product Decisions"
section was resolved (see "Resolved Product Decisions"). Corrective verification passed:
`git diff --check`, `npm run format:check`, `npm run lint`, `npm test` (`543` passed, `1` skipped),
`npm run test:coverage` (`543` passed, `1` skipped), `npm run format:py:check`, `npm run lint:py`,
`ruff format --check backend/tests/test_page_builder_routes.py backend/tests/test_series_contracts.py`,
`npm run test:backend` (`81` passed), `npm run build`, and `npm run test:visual` (`14` passed). Per the
migration note, legacy static reader DOM is intentionally left in place; its removal remains a
separate follow-up.

## Migration And Compatibility Notes

- Existing pages keep working because missing reader config defaults to current paged behavior.
- Existing fixed section layouts remain supported during the transition.
- No arbitrary CSS editor is introduced.
- If a backend migration is needed, it should be additive and backfill only normalized defaults.
- The implementation should not delete legacy static reader DOM until the no-reader page path,
  paged reader path, vertical reader path, and builder preview path all pass release gates.

## Resolved Product Decisions

- Vertical-scroll fullscreen: disabled in v1 — zoom, pan, and fullscreen are all turned off in
  vertical mode (Phase 4).
- Controls placement `overlay`: shipped in v1 (Phase 3; exercised by the `custom-reader` visual
  route and paged-reader customization assertions).
- Bound reader page validation: strict — invalid bound pages block publish and reader-binding saves
  with stable warning/error codes (Phase 2).
- Side panels: reader-owned surfaces fed from the reader module's own section and styled through the
  reader module `panels` settings; generic content columns use section/column styling instead and are
  never overloaded as panel surfaces (Phase 5).
- Non-published entry publication (Phase 6): the public series payload hides `draft` entries entirely
  and advertises `scheduled` entries as COMING SOON (`status` + `publishAt`, page images withheld
  until `publish_at`). Due scheduled entries are promoted to published before payload generation.
  Admin series-data endpoints require an authenticated admin, disable caching, and stay unfiltered so
  the entry editor keeps drafts, raw publication metadata, and full pages.
