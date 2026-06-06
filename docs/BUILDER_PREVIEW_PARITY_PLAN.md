# Builder Preview Parity Plan

Status: Complete through Phase 9 release-gate verification (`2026-05-14`). Phase 2 and Phase 3
iframe preview synchronization landed on `2026-05-11`; Phase 3.5 refactor extraction, Phase 4
parity hardening, Phase 5 responsive parity instrumentation, Phase 6 visual verification, Phase 7
manual QA, Phase 8 documentation cleanup, and Phase 9 release-gate verification are complete.

Goal: make the page builder preview a trustworthy representation of the page as it will render in
the public reader at desktop, tablet, and mobile sizes.

This plan is intentionally focused on preview fidelity. It does not expand the builder into a
freeform visual editor, and it does not change the existing explicit save/publish model unless a
preview snapshot needs to include local unsaved draft state.

## Baseline Audit Follow-Up

The baseline code audit for this plan verified the original diagnosis:

- the old builder preview used a `max-width` div frame, so viewport media queries were not exact
- the old builder preview rendered module/page HTML, not the full reader shell
- the live reader applies page data through `applyBuilderPageToDOM(...)`, which also controls
  header, theme, panels, and runtime module initialization

Phase 8 corrected the known stale documentation called out by that audit:

- `docs/BUILDER_PLAN.md` now distinguishes the structural edit canvas from the current iframe
  preview path.
- `docs/admin-overview.md` now describes the same-origin iframe preview, exact viewport presets,
  `postMessage` snapshot bridge, and responsive metrics rather than the old frame clamp.
- Compact context notes now match the active Edit/Preview toggle.

## Original Problem Statement

At the start of this parity work, the builder had two useful but incomplete preview surfaces:

- Edit mode: `admin/page-builder/canvas-renderer.js` renders an authoring canvas with structural
  controls, insert zones, and a representative page-header surface.
- Preview mode: `admin/page-builder.js` calls `renderPreviewPage(currentPage)` from
  `admin/page-builder/preview-renderers.js`, which delegates module HTML output to
  `admin/page-builder/shared-renderers.js`.

That shared renderer work was valuable, but the old preview was not exact enough:

- The desktop/tablet/mobile toggle changed `.pb-preview-frame[data-width]` with `max-width`.
  CSS media queries still evaluate against the browser viewport, not that inner frame. A 375px
  preview inside a wide admin window can therefore fail to trigger the same mobile CSS that the
  reader uses on a real 375px viewport.
- The preview renders only a `.pb-page` body. The live reader applies the page through
  `reader/data.js` via `applyBuilderPageToDOM(...)`, which also updates `header.topbar`,
  `#leftPanel`, `#rightPanel`, theme CSS variables, panel backgrounds, panel visibility, reader
  controls, and mounted modules.
- The old preview used preview-only placeholders for some live mounts. That was fine for a
  structural preview, but it is not the same as the final page.
- The original tests proved shared renderer structure and shell toggle behavior. They did not prove
  viewport media-query behavior, full reader shell parity, scroll/header state, or visual parity
  between builder preview and the reader route.

## Product Target

The author should be able to open the builder, switch to Preview, choose Desktop, Tablet, or
Mobile, and see the same layout they would see by opening the reader page at that viewport.

The preview must include:

- the same reader shell CSS and markup context
- the same page-scoped header state from `page.meta.header`
- the same page theme variables and panel backgrounds
- the same left/right panel module placement and panel visibility rules
- the same responsive breakpoints and viewport-dependent JavaScript behavior
- the same asset URL resolution
- the same published/draft page data, and a clearly defined behavior for unsaved local edits

Primary data strategy:

- The iframe loads the real root reader entry point, `index.html`, in a same-origin preview mode so
  it gets the real reader shell, CSS, session cookies, and read-only runtime context.
- The page being previewed is supplied by the builder through a validated `postMessage` page
  snapshot. The iframe must not rely on its own builder-page API fetch as the source of truth for
  preview content, because the builder must be able to preview unsaved working drafts.
- Same-origin API requests may still be used for session checks, entry data, latest/feed data, and
  protected asset access, but the page snapshot from the admin builder is authoritative.

## Definition Of Exact

"Exact" means the builder preview and the reader route render from the same page snapshot through
the same reader layout path at the same CSS viewport dimensions.

Acceptable differences:

- Browser font rasterization and sub-pixel anti-aliasing may differ slightly between machines.
- Mutating actions such as email signup submission, analytics, tracking, comments posting, and
  external navigation can be stubbed or disabled in preview mode.
- Dynamic remote content may use a stable test fixture in automated visual tests.

Not acceptable:

- A preview architecture where the iframe independently fetches a different saved page while the
  admin builder is showing unsaved working changes.
- A mobile preview that does not trigger the mobile reader CSS.
- A preview that shows module order but omits the reader header, panels, controls, or theme.
- A preview that uses admin-only CSS to approximate public reader behavior.
- A preview that silently displays published data when the builder says it is showing draft data.
- A preview that ignores active local drafts when the UI claims it is showing the working page.

## Recommended Architecture

Use an iframe-based reader preview host instead of a constrained `div`.

Reasoning:

- An iframe has a real viewport width and height, so media queries and viewport-dependent reader
  JavaScript evaluate the same way they do in the browser.
- It isolates admin CSS from public reader CSS.
- It allows the preview to run the same reader shell and layout code rather than maintaining a
  second full-page renderer in the admin bundle.
- It gives us a clean boundary for disabling side effects in preview mode.

Rejected primary approaches:

- Keep the current `max-width` frame and add more CSS. This cannot make viewport media queries
  exact.
- Duplicate the reader shell inside the admin preview. This would reintroduce the renderer drift
  problem the shared renderer work was meant to reduce.
- Convert all reader CSS to container queries as the first step. Container queries may be useful
  later for modules, but the reader shell currently includes viewport-based CSS and JS behavior.

## Preview Viewports

Define viewport presets in one shared registry, not scattered literals:

- Desktop: `1920 x 1080`
- Tablet: `768 x 1024`
- Mobile: `375 x 812`

The current labels can remain Desktop, Tablet, and Mobile, but the implementation must resize the
iframe viewport, not only the visible wrapper.

Later additions can include tablet landscape, mobile landscape, and custom width. Those should not
block the first parity pass.

## Multi-Step Implementation Plan

### Phase 0 - Baseline Audit

1. Document the current preview path:
   - `admin/page-builder.js::renderPreview()`
   - `admin/page-builder/preview-renderers.js`
   - `admin/page-builder/shared-renderers.js`
   - `reader/page-renderer.js`
   - `reader/data.js::applyBuilderPageToDOM(...)`
2. Capture the current parity gaps with a fixture page that includes:
   - page-scoped V3 header metadata
   - custom header/nav/button appearance
   - page theme overrides
   - panel backgrounds and panel spacing
   - one-column, two-column, and three-column sections
   - `text`, `image`, `gallery`, `video`, `social`, `email-signup`, `promo`, `buttons`,
     `spacer`, `divider`, `reader`, `entry-gallery`, `feed`, and `html` modules
3. Verify and record the current responsive mismatch:
   - open the admin builder on a desktop viewport
   - switch preview to Mobile
   - confirm public mobile media queries do not necessarily activate because the browser viewport
     is still desktop-sized
4. Add this audit note to the implementation PR before changing code so future reviewers know why
   an iframe is required.

Deliverable: short audit section in the PR or a docs addendum with screenshots or DOM notes.

### Phase 1 - Preview Contract

1. Add a shared `PREVIEW_VIEWPORTS` contract, likely under `admin/page-builder/constants.js` or a
   small new helper such as `admin/page-builder/preview-constants.js`.
2. Store width and height for every preset.
3. Define the preview data contract:
   - `seriesId`
   - `pageId`
   - `pageSlug`
   - `draftMode`
   - `snapshotVersion`
   - normalized page snapshot
   - preview options, including side-effect stubs and active scroll state
4. Define when the preview uses saved data versus working draft data:
   - Saved preview: render the current persisted draft/published page from the API.
   - Working preview: merge active local drafts into `currentPage` and send that snapshot to the
     preview iframe.
5. Make the dirty-state policy explicit before implementation:
   - if any builder `dirtyScope` is active and the user switches to Preview, the default behavior
     should be a working preview that includes the dirty state
   - saved-only preview can exist later as an explicit secondary mode, but it must not be the silent
     default while there are unsaved changes
   - the preview status must say whether it is showing persisted API data or an unsaved merged
     snapshot
6. Make the UI copy explicit:
   - "Previewing saved draft" when it is API-backed.
   - "Previewing unsaved working changes" when a local draft snapshot is merged in.

Deliverable: constants plus documented data contract before the iframe is wired in.

Phase 1 contract addendum:

- The implementation contract lives in `admin/page-builder/preview-contract.js`.
- `PREVIEW_VIEWPORTS` defines the first iframe-ready presets:
  - Desktop: `1920 x 1080`
  - Tablet: `768 x 1024`
  - Mobile: `375 x 812`
- `PREVIEW_VIEWPORT_ORDER` is `desktop`, `tablet`, `mobile`; at this Phase 1 checkpoint, the
  then-current div preview still wrote that id to `.pb-preview-frame[data-width]` until the iframe
  phase replaced the frame.
- Preview snapshot payloads use `snapshotVersion: 1` and include `seriesId`, `pageId`, `pageSlug`,
  `draftMode`, `source`, `page`, and `options`.
- `draftMode` is `draft` when `currentPage.isPublished === false`, otherwise `published`.
- `source` is `saved` when no builder draft is dirty and `working` when `dirtyScope` is set.
- `dirtyScope` is a scalar, so a working snapshot merges only the one active local draft:
  - `module`: selected module config
  - `theme`: theme tokens, panel backgrounds, and panel spacing
  - `header`: normalized `page.meta.header` with `headerOverrides` removed
  - `page-settings`: slug, title, page type, and homepage flag
  - `section`: section spacing settings using the existing section-save semantics
- Preview UI status copy is:
  - `Previewing saved draft`
  - `Previewing unsaved working changes`
- Phase 1 only defines and consumes the contract in the existing preview surface. It does not add the
  iframe, reader preview bridge, or `postMessage` transport.

### Phase 2 - Reader Preview Host

Recommended path: use the real root reader entry point in an iframe with a preview mode query
parameter.

1. Add a reader preview mode gate, for example:
   - `/index.html?series=<id>&page=<slug>&draft=1&builderPreview=1`
2. Treat root `index.html` as the canonical iframe entry point. The reader currently boots from the
   root page on `DOMContentLoaded`; the preview implementation should make that relationship
   explicit rather than assuming a separate reader HTML file exists.
3. Add a small reader-side preview bridge, for example `reader/preview-bridge.js`, loaded only when
   the query parameter is present.
   - The bridge should be dynamically imported or otherwise conditionally loaded from preview mode.
   - It must not add normal-reader startup weight or behavior when `builderPreview=1` is absent.
   - If the build still ships the bridge file, normal runtime must not execute it outside preview
     mode.
4. In builder preview mode, the reader startup should wait for or request a page snapshot from the
   parent admin window instead of treating `loadPageConfigWithFallback(...)` as the preview content
   source. That avoids the ambiguity between iframe session/API draft loading and the builder's
   local unsaved working state.
5. The bridge should:
   - verify `event.origin` against the current same-origin admin page
   - validate the message type, shape, `snapshotVersion`, series id, page id/slug, and expected
     preview session token
   - ignore messages from unknown origins, unknown message types, or stale snapshot versions
   - accept the normalized page snapshot as the authoritative preview page
   - send acknowledgement/error messages back to the admin builder with the same validation discipline
   - let the admin builder validate response message origin and shape before updating UI state
6. After accepting a snapshot, call the same reader layout application path used at runtime:
   - `applyBuilderPageToDOM(page, { seriesId, previewMode: true })`
7. Disable or stub side effects that should not fire in builder preview.
8. Side effects to disable or stub:
   - email POSTs
   - analytics/tracking writes
   - comments submission
   - external link navigation from accidental clicks
   - fullscreen requests
9. Side effects that may remain read-only:
   - loading entry data needed by reader/entry-gallery modules
   - loading latest post/feed data if the live page would load it
   - loading protected assets only when the current admin session is allowed
10. The iframe document must load the same public CSS as the reader:
    - `assets/css/variables.css`
    - `assets/css/main.css`
    - `reader/comic-comments.css`

11. Avoid creating a second static copy of the reader shell. If a dedicated preview HTML file
    becomes necessary, first extract shared reader shell markup or explain why duplication is
    temporary.

Deliverable: an iframe-loadable reader preview host that can render a posted builder page snapshot.

**Completion note (`2026-05-11`):** Phase 2 is implemented. `reader/preview-bridge.js` is the new reader-side handshake module, lazy-imported by `reader/app.js` only when `?builderPreview=1` is present. It sends `REQUEST_SNAPSHOT`, validates the `SNAPSHOT` reply with `validatePreviewEnvelope(...)` from `preview-contract.js`, sends `ACK` on success or `ERROR` on failure, and resolves with `{ source: 'builder', page, previewMode: true, snapshot }`. The full side-effect guard list from step 8 is implemented: analytics (`initReaderAnalytics`), live tracking (`initLiveTracking`), email form submission (`initEmailSignupForm` + `initEmailForms` on page-renderer and data paths), comments write operations (login/register/postComment/moderateComment in `comic-comments.js`), chat SSO (`chat-sso.js` exits at startup), safe-mode redirect (`safe-mode.js` returns immediately), user-settings overlay (`user-settings.js` disables the open button), fullscreen (`fullscreen.js` `toggleFullscreen` returns immediately), and all link/navigation clicks via a capture-phase `click` suppressor in `attachEventHandlers`. The `index.html` analytics loader also bails out on `?builderPreview=1` before injecting the script tag. Test coverage lives in `tests/reader-preview-bridge.test.js` and `tests/reader-preview-side-effects.test.js`.

### Phase 3 - Iframe Preview Synchronization

1. Replace the current preview `innerHTML` path in `admin/page-builder.js::renderPreview()` with an
   iframe-backed reader preview.
2. The iframe synchronization path owns:
   - iframe creation and teardown
   - viewport preset changes
   - basic ready/error state
   - `postMessage` synchronization
3. Build a `createPreviewPageSnapshot()` helper that merges active local draft state into
   `currentPage`:
   - active module draft
   - active section settings draft
   - active theme draft
   - active header draft
   - active page settings draft
4. The snapshot helper must not mutate `currentPage`.
5. If no local draft is dirty, the snapshot should be byte-stable against the current hydrated page
   as much as practical.
6. Width buttons should update:
   - iframe CSS width
   - iframe CSS height
   - active button state
   - accessible label/title text
   - preview status text
7. The preview should survive normal builder operations:
   - switching pages
   - switching series
   - saving a module
   - publishing/unpublishing
   - discarding a draft
   - changing the active viewport preset
8. The old shared-renderer preview path may be kept behind a short-lived fallback flag only if a
   concrete rollback need appears during verification. The current implementation replaced it
   directly and does not include a `pb-preview-legacy` fallback.

Deliverable: admin preview mode renders a real reader iframe and keeps it synchronized with the
current page snapshot.

**Completion note (`2026-05-11`):** Phase 3 iframe synchronization is implemented. The admin builder now renders preview mode through a same-origin reader iframe instead of the old `preview-renderers.js` div path. The preview sender logic has since been extracted into `admin/page-builder/preview-manager.js`, which now owns iframe URL construction, `previewSession` / identity checks, `REQUEST_SNAPSHOT` / `SNAPSHOT` / `ACK` / `ERROR` handshake handling, working-draft snapshot construction, frame dataset updates, and preview rendering. `createPreviewPageSnapshot()` still clones `currentPage`, merges the active local dirty draft when needed, includes viewport/options metadata, and avoids mutating the hydrated page. Width buttons still update iframe dimensions and repost the current snapshot through the shared preview contract. Current limitations remain the same: high-frequency draft updates are not debounced; loading state is limited to basic ready/error dataset handling; and no `pb-preview-legacy` fallback exists because the old div path was replaced directly.

### Phase 3.5 - Admin Page Builder Refactor

1. Keep this follow-up separate from the completed Phase 3 iframe synchronization work.
2. Use `docs/temp_admin_page-builder_refactor_plan.md` as the source plan for decomposing
   `admin/page-builder.js`.
3. Extract the preview synchronization code into `admin/page-builder/preview-manager.js` when the
   refactor begins.
4. Optionally add debounce timing for repeated working-draft snapshot posts if manual or automated
   verification shows iframe updates are too chatty.
5. Optionally improve preview loading status beyond the current basic ready/error dataset handling.
6. Do not add `pb-preview-legacy` retroactively unless Phase 4 or Phase 5 verification finds a
   concrete rollback need.

**Completion note (`2026-05-11`, closed `2026-05-14`):** This refactor pass is complete for the
preview-parity scope. `admin/page-builder.js` remains the composition root, but the previous
monolithic closure is now split across `admin/page-builder/preview-manager.js`, `draft-manager.js`,
`page-actions.js`, `canvas-mutations.js`, and `layout.js`. `preview-manager.js` handles iframe
preview synchronization, `draft-manager.js` owns explicit draft normalization/save/discard flows,
`page-actions.js` owns page activation/publish/delete/reorder flows, `canvas-mutations.js` owns
structural section/module mutations, and `layout.js` owns responsive editor/sidebar mode helpers.
`helpers.js` also now carries the shared clone/default-config/display helpers those modules reuse.
Debounce timing for repeated working-draft posts and richer loading-state polish remain
non-blocking enhancement candidates only; they are not required for preview parity unless future
manual or automated verification shows a concrete user-facing issue.

### Phase 4 - Full Reader Shell Parity

1. Ensure preview output includes:
   - `header.topbar`
   - `.viewerWrap`
   - `#leftPanel`
   - `#mainContent`
   - `#viewport`
   - `#controls`
   - `#rightPanel`
2. Confirm `applyBuilderPageToDOM(...)` is the only path that applies page-level data to that shell
   in preview and runtime.
3. Confirm `loadPageConfigWithFallback(...)` remains constrained to `source: 'builder'` and
   `source: 'none'` for normal reader startup. The preview bridge should not reintroduce retired
   legacy `page-config.json` fallback behavior.
4. Confirm page header parity:
   - same `resolvePageHeaderState(...)` input
   - same nav item rendering
   - same shell top/scrolled appearance rules
   - same admin-link exclusion behavior
5. Confirm theme parity:
   - page theme CSS variables apply to the iframe document root
   - default theme values remain untouched when no page override is set
   - theme reset/discard in the builder updates preview state correctly
6. Confirm panel parity:
   - left and right panel module selection follows the same column mapping as runtime
   - panel backgrounds use the same URL normalization
   - panel spacing uses the same CSS variable
   - empty-panel behavior matches runtime
7. Confirm module parity:
   - modules use `shared-renderers.js` through the reader path
   - dynamic modules initialize through the same reader initializers where possible
   - preview-only stubs are limited to mutating behavior, not layout behavior

Deliverable: preview iframe and live reader route are applying the same page snapshot through the
same shell-level functions.

**Completion note (`2026-05-11`):** Phase 4 shell-parity hardening is implemented. `reader/data.js`
now clears the controlled builder theme CSS variable set before applying each snapshot, clears the
controlled panel background variable set before reapplying panel backgrounds, and resets left/right
panel visibility before evaluating the next snapshot's `panelEnabled` settings. That closes the
sequential-snapshot stale-state gaps the audit called out for theme overrides, panel background
opacity, and hidden panel display state. Coverage also expanded in
`tests/reader-data-builder.test.js` to assert the real reader shell contract plus theme/panel reset
behavior, and in `tests/admin-page-builder-shell.test.js` to assert that builder theme reset and
discard flows send the correct working-versus-saved preview snapshots back through the iframe
bridge.

### Phase 5 - Responsive Parity

1. Treat the iframe dimensions as the source of truth for responsive testing.
2. At Desktop, verify:
   - side panels sit beside the viewport as they do in the reader
   - header regions have the same placement and wrapping
   - two-page reader mode behavior matches the public route when the reader module is present
3. At Tablet, verify:
   - the same reader breakpoints and aspect-ratio rules activate
   - side panels, controls, and header wrapping match the public route
   - overlay/collapsed admin panels do not affect iframe layout
4. At Mobile, verify:
   - mobile media queries activate inside the iframe
   - multi-column builder sections collapse exactly as they do in the reader
   - controls remain reachable
   - no horizontal overflow is introduced by modules, header nav, buttons, or custom HTML
5. Add a debug-only overlay or dev console output that reports:
   - preset name
   - iframe CSS width and height
   - iframe `window.innerWidth` and `window.innerHeight`
   - page slug and snapshot version
6. Do not use browser zoom to simulate mobile. Use iframe CSS pixels.

Deliverable: desktop/tablet/mobile modes trigger the same CSS and JavaScript branches as the live
reader at those viewport sizes.

**Completion note (`2026-05-11`):** Phase 5 responsive parity instrumentation is implemented. The
admin preview now gives the iframe exact preset CSS pixel dimensions from `PREVIEW_VIEWPORTS` and
scrolls the real preview canvas instead of shrinking the iframe to the admin canvas. The preview
contract now includes `builder-preview:metrics`, explicit media-query branch names, metrics payload
validation, and reader-to-admin metrics messages. The reader bridge stores the active preview
snapshot context, emits metrics after snapshot application and debounced resize renders, reports
two-page mode, branch flags, iframe inner dimensions, and element-level overflow offenders, and
keeps listening for follow-up preview snapshots. The admin preview manager validates metrics,
stores them on `.pb-preview-frame.dataset`, and exposes an admin-frame debug overlay enabled by
`?previewDebug=1` or `localStorage.pb-preview-debug = "1"`. Focused coverage now verifies metrics
contract validation, exact iframe sizing, preview response handling, two-page expectations for all
presets, branch flags, and overflow offender reporting.

### Phase 6 - Visual Verification

Decision: Playwright is adopted for this pass. Manual screenshot QA remains a supplemental Phase 7
release activity, not the temporary substitute for missing browser coverage.

1. Keep existing Vitest coverage for shared renderer contracts, admin preview shell behavior,
   reader DOM application, header appearance parity, viewport constants, postMessage validation,
   responsive metrics, and preview side-effect guards.
2. Add focused Vitest coverage for the remaining contract gaps:
   - dirty `header`, `page-settings`, and `section` preview snapshots merge the draft shape
   - preview snapshot merging does not mutate `currentPage`
   - `chat-sso.js`, `safe-mode.js`, and `comic-comments.js` stay inert/read-only in builder preview
3. Add Playwright as the browser visual test tool:
   - `@playwright/test` dev dependency
   - `npm run test:visual`
   - `npm run test:visual:update`
   - `playwright.config.js` on a dedicated strict Vite port, `127.0.0.1:3107`
4. Add `tests/visual/builder-preview-parity.spec.js` to compare:
   - builder preview iframe at Desktop vs reader route at Desktop
   - builder preview iframe at Tablet vs reader route at Tablet
   - builder preview iframe at Mobile vs reader route at Mobile
5. Stabilize visual tests by:
   - using `tests/fixtures/contract-fixtures.json`
   - mocking reader/admin boot endpoints (`/api/session`, `/series.json`, `/data.json`,
     page-builder APIs, post/feed APIs, `/media.json`, `/api/track/visitor`, and admin dashboard
     support endpoints)
   - intercepting gitignored media/protected image paths with deterministic PNGs
   - disabling animations/transitions, freezing time, and waiting for fonts/images before screenshots
6. Add non-screenshot browser assertions:
   - iframe `innerWidth` equals selected preset width
   - no horizontal overflow at Mobile
   - expected media-query branch metrics are active
   - stable reader shell/module selectors exist in preview and reader
7. The admin route must be exercised like the product:
   - open `/admin/index.html?view=designer&series=battle-bros&page=reader&surface=header`
   - mock an admin session
   - wait for Edit mode
   - click `#pbViewPreview`
   - select the requested `[data-width]` preset
   - wait for `.pb-preview-frame[data-preview-ready="true"]`, surfacing `previewError` diagnostics
     if the iframe handshake fails

Deliverable: repeatable Playwright evidence that preview and reader match at all three required
viewport classes.

**Completion note (`2026-05-11`):** Phase 6 adopts Playwright and adds visual parity coverage for
Desktop, Tablet, and Mobile using the same seeded builder fixture for public reader and admin iframe
preview. The Playwright suite runs against a strict Vite server on `127.0.0.1:3107`, mocks the
actual reader/admin boot endpoints, stubs media/protected images, freezes visual timing, compares
iframe-internal screenshots to the reader route baseline, and asserts iframe width, branch metrics,
mobile overflow, and key shell/module selectors. Focused Vitest coverage now also verifies dirty
header/page-settings/section preview snapshot merges without mutating the source page, plus
preview-mode chat SSO, safe-mode, and comments write guards. Run `npx playwright install chromium`
once after dependency install before using `npm run test:visual`; on Linux hosts missing browser
runtime libraries, run `npx playwright install-deps chromium` with system package privileges.

### Phase 7 - Manual QA

Run the manual pass with at least:

- one published builder page
- one unpublished draft page
- one page with unsaved local module edits
- one page with unsaved local header/theme edits
- one page with all common module types
- one canonical V3 page header
- one page with customized button/header-nav appearance

Checklist:

- Desktop preview matches the reader route.
- Tablet preview matches the reader route.
- Mobile preview matches the reader route.
- Mobile mode actually reports `window.innerWidth === 375` inside the iframe.
- Header title, subtitle, visible blocks, nav links, and nav appearance match.
- Left/right panels match, including backgrounds and empty states.
- Builder page links route to the same series/page targets.
- Draft preview matches the admin draft reader route.
- Unsaved working preview updates without saving, and the UI labels it as unsaved.
- Email/comment/analytics side effects do not fire from preview mode.
- External links are either disabled or clearly require an intentional open action.

Deliverable: completed QA notes, with every mismatch classified as blocker, major, or minor.

**Completion note (`2026-05-14`):** Phase 7 manual-QA evidence is recorded in
`docs/BUILDER_PREVIEW_PHASE7_QA.md`. The pass used the local rebuilt bundle plus the Chromium visual
parity suite and focused preview contract tests to cover published reader preview parity, draft
routing, unsaved working snapshot labels, common module renderer coverage, mobile iframe metrics,
and preview side-effect guards. No blocker, major, or minor mismatches were found. Verification run:
`npm run build`, `npm run test:visual`, focused preview Vitest coverage, and focused
module-renderer/admin-preview Vitest coverage.

### Phase 8 - Documentation And Cleanup

1. Update `docs/BUILDER_PLAN.md` to replace the older preview-pass note with the new source of
   truth once implemented.
2. Update `docs/admin-overview.md` with the new iframe preview behavior.
3. Update `docs/functions/admin-page-builder.md` for:
   - preview manager
   - viewport constants
   - snapshot merge helper
4. Update `docs/functions/reader-core.md` for:
   - reader preview bridge
   - preview side-effect stubs
   - actual preview query parameters (`builderPreview=1`, `previewSession`, `page`, `pageId`, and
     optional `draft=1`)
5. Remove stale statements that say either:
   - preview is only a structural canvas
   - preview is exact when it still uses max-width framing
   - preview toggle is removed, if that is no longer true
   - `.pb-preview-frame` width switching is the intended long-term preview mechanism
6. Specifically audit:
   - the "visually identical to the reader" preview claim in `docs/BUILDER_PLAN.md`
   - the `.pb-preview-frame` / no-rerender width-toggle description in `docs/admin-overview.md`
   - any compact context notes that still say the preview toggle was removed
7. Remove the old div-based preview path after the iframe path is stable.

Deliverable: docs describe the actual preview architecture without contradictory notes.

**Completion note (`2026-05-14`):** Phase 8 documentation cleanup is implemented. The builder plan
now treats the edit canvas as structural and the current Preview mode as the iframe-based
reader-shell preview. Admin overview, builder function docs, reader function docs, style docs, and
compact context notes now describe `preview-manager.js`, `reader/preview-bridge.js`, exact
`PREVIEW_VIEWPORTS` sizing, validated `postMessage` snapshots, responsive metrics, and preview-mode
side-effect stubs. The stale `exact-preview` wording was resolved as documentation debt; the
implemented query flag remains `builderPreview=1`. `admin/page-builder/preview-renderers.js` was
not removed because direct renderer tests still import it; docs now describe it as a retained
direct-render support path, not the active live preview implementation.

### Phase 9 - Release Gate

Before claiming the preview parity work is complete, run:

```bash
npm run format:check
npm run format:py:check
npm run lint
npm run lint:py
npm test
npm run test:visual
npm run test:backend
npm run build
git diff --check
```

Because this work affects the public reader runtime, shared builder modules, public CSS, and public
HTML behavior, `dist/` must be rebuilt before browser verification or release claims.

**Completion note (`2026-05-14`):** Phase 9 passed in the required order. Verification run:
`npm run format:check`; `npm run format:py:check` (`45` Python files already formatted);
`npm run lint`; `npm run lint:py`; `npm test` (`45` files passed, `329` tests passed, `1`
skipped); `npm run test:visual` (`3` Chromium visual parity tests passed); `npm run test:backend`
(`66` tests passed); `npm run build` (`113` modules transformed); and `git diff --check`. Known
warnings were non-failing: Playwright's Vite server repeated the existing public-directory root-path
asset warnings, and the production build repeated the existing `reader/fullscreen.js`
dynamic/static import chunking warning.

## Acceptance Criteria

The plan is complete because the Phase 9 gate verifies all of these criteria:

- Preview mode renders through an iframe or equivalent real viewport, not a `max-width` div.
- Desktop, Tablet, and Mobile presets set real iframe viewport dimensions.
- Mobile preview triggers the same mobile CSS and reader JavaScript branches as the live reader.
- Preview uses the same reader shell context as the public page.
- The authoritative preview page data comes from a validated admin-sent page snapshot, so unsaved
  working changes can be represented without relying on iframe API fetch timing or auth state.
- Preview and reader apply page data through the same `applyBuilderPageToDOM(...)` path or a
  directly shared equivalent.
- Header, theme, panel backgrounds, panel spacing, panel visibility, modules, and button/nav
  appearance match between preview and reader.
- Unsaved local changes are either included in preview through a clearly labeled working snapshot
  or explicitly excluded with clear UI copy.
- Preview mode does not submit forms, write analytics/tracking events, post comments, or accidentally
  navigate the admin away.
- Automated tests cover snapshot merging, viewport selection, postMessage validation, and reader
  shell application.
- Manual or automated browser verification covers Desktop, Tablet, and Mobile.
- Documentation no longer contradicts the implemented preview behavior.

## Risks And Mitigations

- Risk: iframe preview is slower than direct HTML injection.
  Mitigation: reuse a single iframe per page, debounce snapshot updates, and reload only when series,
  page, or route-level context changes.
- Risk: preview mode accidentally fires reader side effects.
  Mitigation: centralize a `previewMode` flag in reader startup and test every side-effect boundary.
- Risk: admin draft auth behaves differently inside the iframe.
  Mitigation: make the admin-sent snapshot authoritative for preview page content, use same-origin
  cookies only for session/read-only runtime context, and keep explicit error states for 403/404
  responses from supporting API calls.
- Risk: `postMessage` preview sync creates a loose security boundary.
  Mitigation: validate message origin, type, shape, series/page identity, preview session token, and
  `snapshotVersion` on both sides; ignore unknown or stale messages; never execute code from
  messages.
- Risk: full shell preview exposes existing reader responsive bugs.
  Mitigation: treat those as real bugs. The preview should reveal them, not mask them.
- Risk: custom HTML can create overflow that is hard to constrain.
  Mitigation: add mobile overflow checks and keep sanitizer restrictions in place.
- Risk: screenshot tests become flaky.
  Mitigation: freeze animations, seed data, wait for assets, and use DOM assertions for critical
  layout facts before relying on image diffs.
- Risk: browser-level visual tooling becomes stale after future reader or builder UI changes.
  Mitigation: keep `npm run test:visual` in the release gate for preview, parity, responsive, and
  reader-facing UI work; update committed Playwright screenshots only after reviewing real visual
  diffs.

## File Impact Map

Implemented and verified areas:

- `admin/page-builder.js`
- `admin/page-builder/preview-manager.js`
- `admin/page-builder/preview-contract.js`
- `admin/page-builder/shared-renderers.js`
- `admin/page-builder/header-config.js`
- `admin/css/page-builder/canvas.css`
- `admin/css/page-builder/layout.css`
- `index.html`
- `reader/app.js`
- `reader/data.js`
- `reader/page-renderer.js`
- `reader/preview-bridge.js`
- `assets/css/main.core.18-page-builder.css`
- `assets/css/main.core.17-responsive.css`
- `assets/css/main.responsive.css`

Verified test coverage:

- `tests/admin-page-builder-shell.test.js`
- `tests/admin-page-builder-preview.test.js`
- `tests/admin-page-builder-preview-contract.test.js`
- `tests/reader-data-builder.test.js`
- `tests/reader-page-renderer.test.js`
- `tests/reader-preview-bridge.test.js`
- `tests/reader-preview-metrics.test.js`
- `tests/reader-preview-side-effects.test.js`
- `tests/header-appearance.test.js`
- `tests/shared-renderers-parity.test.js`
- `tests/visual/builder-preview-parity.spec.js`

Updated docs:

- `docs/BUILDER_PLAN.md`
- `docs/admin-overview.md`
- `docs/functions/admin-page-builder.md`
- `docs/functions/reader-core.md`
- `docs/BUILDER_PREVIEW_PHASE7_QA.md`
- `docs/TEST_DOCUMENTATION.md`
