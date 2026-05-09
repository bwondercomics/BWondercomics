# Builder Plan

Status note (`2026-04`): this document replaces large parts of the older "unified modules" plan. The builder has shipped materially since that draft, and several earlier assumptions are now incorrect.

## Product direction

The goal is not to build a Squarespace clone.

The goal is to build a lightweight page builder for the comic CMS that is configurable for any comic, series, or site running on it:

- secure enough to trust on a public site
- useful enough that common page work does not require code edits
- simple enough to maintain without turning into a second product

Benchmark takeaway from stronger builders like Squarespace, WordPress Site Editor, and GrapesJS:

- We do not need their full feature set.
- We do need a few of the basics they get right:
  - safe content handling
  - trustworthy preview
  - reusable structured controls instead of raw JSON everywhere
  - some protection against destructive overwrite or silent drift

Non-goals for this builder:

- freeform drag-anywhere layout editing
- real-time multi-user collaboration
- AI generation features
- ecommerce/platform complexity
- deep design-system tooling beyond what the site actually needs

## Current implementation snapshot

### Data model

The current backend model is stable and already useful:

- `BuilderPage`
- `BuilderSection`
- `BuilderModule`

Current page-level fields and behavior:

- pages are scoped per series
- each page has `slug`, `title`, `pageType`, `isPublished`, `isHomepage`, `sortIndex`, `meta`
- one homepage per series is enforced by the backend

Current page-level `meta` ownership:

- `meta.header`
- `meta.theme`
- `meta.panelBackgrounds`
- `meta.panelSpacing`

Current section ownership:

- `layout`
- `sortIndex`
- `settings` for spacing controls

Current module ownership:

- `moduleType`
- `columnIndex`
- `sortIndex`
- `config`

### Current page header architecture

This is the biggest difference from the earlier plan.

The primary header path is now page-scoped and stored in `page.meta.header` (`version: 3`).

That means:

- the header is not primarily treated as a normal insertable module anymore
- page-level header editing is already shipped
- `page.meta.header` is the only intended authoring source of truth for header editing
- legacy `page-config` header data and legacy `header` modules are still used only as temporary fallback inputs for older pages and should not remain part of the steady-state editor UX

### Current module catalog

The builder currently recognizes these module types:

- `header`
- `text`
- `image`
- `gallery`
- `video`
- `social`
- `email-signup`
- `promo`
- `buttons`
- `spacer`
- `divider`
- `reader`
- `entry-gallery`
- `feed`
- `html`

`header` is not part of the normal insertable palette because page-level header editing supersedes it.

### Current editing UX

Shipped behavior in the admin builder:

- page list by series
- module palette
- section insertion
- section drag/drop reorder
- module drag/drop reorder
- section layout switching
- section spacing settings
- page-scoped header editor
- page theme editor
- explicit module draft editing
- explicit `Save Draft` and `Publish Changes`
- page status badges in the page list and page header
- "Open Reader" / draft preview link

The current canvas is an edit surface, not a true live page preview.

What the canvas currently does well:

- shows page structure
- shows section layout
- shows module ordering
- supports insertion and reordering efficiently

What it does not do yet:

- render the actual page as the user will see it on the public reader

### Current editor coverage

Structured editors exist today for:

- page header
- theme
- `text`
- `image`
- `email-signup`
- `promo`
- `social`
- `buttons`
- `spacer`
- `reader`
- `feed`
- `html` via dedicated code textarea

Common modules still missing good first-class editors:

- `gallery`
- `video`
- `divider`
- `entry-gallery`

Those still fall back to raw JSON-oriented editing instead of a polished control surface.

### Current rendering behavior

Current runtime behavior:

- public reader pages are served from `/api/pages/{series_id}/{slug}`
- admin draft pages are available through `/api/admin/pages/by-slug/{series_id}/{slug}`
- the reader can load draft pages when the user is an admin
- the public reader is served from `dist/`, so source edits do not change live runtime behavior until the frontend bundle is rebuilt

Important current reality:

- the reader still contains legacy fallback behavior through `page-config` loading for some flows
- the earlier "no fallback UI in dev" goal has not actually been fully achieved

Release-discipline rule for builder work:

- if a change affects public reader behavior, header rendering, shared builder/reader helpers, public HTML, or shared assets, `dist/` must be rebuilt before claiming the fix works
- this applies even when the edited file lives under `admin/`, because some builder modules are shared by the reader runtime
- source-level tests are necessary, but they are not proof that the live site changed until the built assets are regenerated

There is also duplicated render logic:

- `reader/page-renderer.js` renders live page output
- `admin/page-builder/preview-renderers.js` renders admin preview output

That duplication is manageable right now, but it is a future drift risk.

### Current page and button model

The older plan's shared button model is stale.

What is actually implemented today is closer to:

```json
{
  "id": "btn-123",
  "text": "About",
  "enabled": true,
  "style": "primary",
  "link": {
    "kind": "builder-page",
    "pageSlug": "about",
    "url": "",
    "hash": "",
    "openInNewTab": false
  }
}
```

Current supported link kinds:

- `builder-page`
- `url`
- `anchor`

Current scope:

- used by the button module
- used by page-header nav editing

Not currently implemented:

- overlay action model
- toggle action model

If those are needed later, they should be added intentionally and validated carefully instead of being assumed by the schema.

## What changed since the older version of this document

The earlier draft is now stale in these important ways:

- The page header is now a page-level editor backed by `page.meta.header`, not the "single header module" approach the older doc assumed.
- Explicit draft/publish actions are shipped.
- Status badges and reader-preview links are shipped.
- Theme editing is shipped and page-scoped.
- Section drag/drop and spacing controls are shipped.
- Button, social, promo, feed, and email module editors are shipped.
- The builder still does not have a true live preview in the main editing surface.
- The reader still has fallback behavior in some paths, so "no fallback in dev" is not currently true.
- Page creation still uses prompt dialogs.
- Page reordering exists in the backend API but does not yet exist in the builder UI.
- The old "shared button model" section no longer matches the current implementation.
- The old document talked about showing page ID in the UI; the current UI is more focused on slug, page type, publish state, and homepage state.

## Audit summary

### Strengths

The current builder already has a strong base:

- the page/section/module model is clear
- page header and theme state are split in a sensible way
- explicit save points reduce accidental mutation
- draft vs published behavior is understandable
- series scoping is clear
- automated coverage already exists for builder data, shell flows, preview rendering, reader rendering, and backend routes

This is already beyond a toy admin form.

### High-risk issues

#### 1. Content safety is not strong enough yet

Today the builder can store and the reader can render raw HTML from:

- `text` module content
- `html` module code

It also preserves arbitrary URL strings for some links.

That means the current builder is flexible, but too trusting.

This is the most important gap from the audit. A lightweight builder can still be secure, but only if it enforces a small, explicit content model.

#### 2. No revision history or conflict protection

Current behavior is explicit save, but still effectively last-write-wins.

Missing today:

- revision history
- optimistic locking
- conflict messages when another save has happened since load
- any recovery path stronger than "save carefully"

This does not need enterprise collaboration, but it does need basic overwrite protection.

#### 3. The builder is still more structural than visual

The current canvas is efficient for arranging modules, but it is not a trustworthy preview of the actual page.

That makes authoring less confident than it should be, especially compared to the useful preview loops in stronger builders.

#### 4. Several common modules still depend on weak editor coverage

The builder is strongest where there are structured controls.

It is weakest where authors have to fall back to raw JSON for common modules. That is not a good steady-state authoring experience.

#### 5. Preview/live renderer drift is possible

Because admin preview rendering and live reader rendering are duplicated, changes can diverge over time.

That is a maintenance problem, not just a polish problem.

## Updated priorities

The priorities below are intentionally biased toward lightweight, secure, and useful.

### P0 - Secure and stabilize what already exists

These are still the highest-value priorities, but the first security pass is now in place.

1. Keep the new sanitization boundary as the canonical save/read path for builder content.
2. Keep the `html` module admin-usable, but only under the stricter sanitizer now in place.
3. Expand server-side validation over time where it prevents broken pages, especially for:
   - allowed `moduleType` values
   - valid section `layout` values
   - allowed link shapes
   - numeric bounds for common config fields
   - future module-specific config coverage
4. Add optimistic concurrency protection using `updatedAt` or a revision token.
5. Keep automated coverage for:
   - XSS attempts
   - `javascript:` links
   - unsafe HTML/event-handler stripping
   - invalid structural payloads
6. Add save-conflict handling tests once optimistic concurrency exists.

### P1 - Make the builder more useful without making it heavy

1. Add a real preview mode inside the builder.
2. Keep the current structural canvas for drag/drop and page assembly.
3. Use a lightweight preview approach:
   - page or section preview using real render output
   - desktop/mobile width toggles
   - no full freeform WYSIWYG canvas
4. Replace `prompt()` page creation with a proper modal or form.
5. Add UI for:
   - page title editing
   - slug editing
   - page type editing
   - homepage assignment
6. Add page reorder UI using the endpoint that already exists.

### P2 - Improve editor coverage and reduce maintenance drift

1. Add structured editors for:
   - `gallery`
   - `video`
   - `divider`
   - `entry-gallery`
2. Add a better asset picker flow for plain image editing.
3. Reduce preview/live duplication by sharing renderer logic where practical.
4. Add targeted validation/warnings only where they prevent broken pages.
5. Add duplication helpers where cheap and useful:
   - duplicate page
   - duplicate section
   - duplicate module

### P3 - Reduce legacy fallback over time

1. Remove UI-level fallback first so the page designer always opens the real page-scoped header editor.
2. Keep runtime header fallback only until older pages are migrated to `page.meta.header.version = 3`.
3. Keep `page-config` fallback only while the reader still depends on unmigrated surfaces.
4. Track which surfaces are still legacy-backed with an explicit audit gate.
5. Remove runtime fallback paths only after migration is complete and authors are not forced back into code.

## Concrete near-term plan

### Phase 1 - Security pass

Status: implemented

Implemented in this pass:

- added a backend builder security boundary in `backend/app/builder_security.py`
- sanitize `text` module HTML on save and on defensive read
- keep `html` enabled, but under a stricter sanitizer instead of raw passthrough
- sanitize promo CTA HTML and builder link targets
- add URL/protocol allowlists for links, media assets, panel backgrounds, and videos
- add backend validation for `moduleType`, `layout`, `sectionType`, `sortIndex`, and `columnIndex`
- sanitize page meta used by the builder, including header nav links and panel background paths
- harden reader and preview renderers so legacy unsafe data is still rendered defensively
- add security-focused backend and frontend tests for XSS, bad URLs, and invalid structure

Deliberately not in this phase:

- optimistic concurrency / revision tokens
- a one-off stored-data backfill script
- a full schema system for every module

### Phase 2 - Useful preview pass ✅

- wire a real preview surface into the builder
- prefer shared render logic over a third rendering path
- add mobile/desktop width toggles

**Implemented (2026-04-13):**

- Extracted `admin/page-builder/shared-renderers.js` — the single source of truth for module HTML output, replacing the two previously duplicated renderer implementations (~450-line and ~620-line files each cut by 70-75%)
- Rewrote `reader/page-renderer.js` and `admin/page-builder/preview-renderers.js` to delegate to the shared factory via a three-option interface (`resolveImageUrl`, `getSeriesId`, `showMountPlaceholders`)
- Added Edit/Preview canvas mode toggle to the builder toolbar; preview mode renders `renderPreviewPage(currentPage)` wrapped in a centred `.pb-preview-frame` using the shared renderer — the public `main.core.18-page-builder.css` was already in the admin head, so preview output is visually identical to the reader
- Added Desktop (1280px) / Tablet (768px) / Mobile (375px) width presets sourced from the site's `variables.css` breakpoints; width changes update the frame `data-width` attribute in-place with a CSS `max-width` transition, no re-render
- Enhanced preview to utilize the full viewport width by injecting `data-canvas-mode='preview'` into the CSS grid, automatically collapsing the sidebar and inspector elements globally to prevent the preview frame from being constrained inside the gutter
- Added 7 new tests (5 parity + 2 integration); full suite: 36 files, 207 passing, 0 regressions

### Phase 3 - Page management pass ✅

**Implemented (2026-04-17):**

- Replaced legacy `prompt()`-based page creation with a newly integrated `#addPageModal` matching the Builder's internal layout scheme.
- Added a "Page Settings" editor view to the Builder panel, allowing live metadata edits (title, slug, page type, isHomepage) seamlessly synced via the API.
- Integrated vanilla HTML5 drag-and-drop mechanics into the sidebar page list, allowing users to drag elements and persist sequences via `/api/admin/pages/reorder`.

### Phase 4 - Editor coverage pass ✅

**Implemented (2026-04-17):**

- Added structured editors for `gallery`, `video`, `divider`, and `entry-gallery` modules.
- Replaced the generic raw JSON fallback editor with intuitive UI controls (such as list manipulation, native color pickers, and select drop-downs).
- Extracted isolated component files (`gallery-editor.js`, `video-editor.js`, `divider-editor.js`, `entry-gallery-editor.js`) applying the unified `draftConfig` pattern mapped consistently into `admin/page-builder/module-editor.js`.
- Expanded semantic module previews for canvas item labels, and grew Vitest specs asserting data-synchronization within bindings.

### Phase 5 - Fallback cleanup pass ✅

**Implemented (2026-04-17):**

- Added `auditPageFallbacks` and `auditPagesFallbacks` to inventory remaining legacy fallback dependencies (`missingHeader`, `staleHeaderVersion`, `headerOverrides`, `legacyHeaderModule`).
- Removed the generic `Advanced` raw JSON card from modules whose current editor path should not advertise a generic fallback, including the fully-structured modules (gallery, video, divider, entry-gallery) and dedicated-binder modules (promo, social, buttons).
- Marked `source: 'legacy'` and the `pb-no-fallback` flag as deprecated in `reader/data.js`, documenting that removal requires a clean series-level audit including a published `reader` page.
- Expanded the test suite with comprehensive audit coverage to act as the source of truth for safe branch removal.

### Phase 6 - Header builder canonicalization pass ✅

Status: Complete for the current header-builder canonicalization scope (`2026-04-18`); runtime fallback removal remains gated by the series-level fallback audit and is deferred to a later cleanup pass.

**Implemented (`2026-04-18`):**

- Completed Step 1, making the integrated admin page builder the only real Page Designer shell.
- Added a canonical admin deep-link contract for designer entry:
  - `admin/index.html?view=designer&series=<id>&page=<slug>&surface=header`
- Updated the admin shell so Page Designer entry opens the builder directly in page-header editing mode instead of routing through the legacy iframe path.
- Kept designer-mode routing in sync as authors switch pages in the builder rail or switch series in the admin shell.
- Replaced legacy `admin/designer.html` with a redirect bridge into the integrated builder.
- Removed the legacy designer iframe host from the admin shell and updated tests/docs to reflect the new route contract.

Goal: make the page designer show the real page-scoped header builder by default instead of behaving like a migration/fallback layer.

#### Product target

- the integrated admin page builder is the canonical home of header editing
- the header editor must feel like a first-class UI editor, not a fallback inspector
- the canvas header preview, inspector, preview mode, and reader must all reflect the same normalized header state
- legacy `designer.html` must become a bridge into the integrated builder instead of remaining a separate editing surface

#### Scope and desired behavior

1. Make every page-designer entry point land on the integrated builder surface.
2. Make clicking the header surface open the structured header editor every time.
3. Seed legacy pages from `createEffectivePageHeader(...)`, but save back only to `page.meta.header.version = 3`.
4. Keep the header structured around the current built-in block registry:
   - `brand`
   - `patron`
   - `status`
   - `entryControls`
   - `nav`
5. Do not add raw JSON fallback to the header editor.
6. Do not add arbitrary freeform header blocks in this pass.

#### Step 1 - Canonicalize the designer route ✅

- treat the integrated builder as the only real page-designer shell
- update the remaining legacy designer path so `designer.html` acts only as a redirect/bridge into the builder
- support a stable deep-link contract for opening the builder in designer mode with a specific series selected
- keep the current nav button and series-level designer links aligned with that same route

#### Step 2 - Make `page.meta.header` the visible editing source of truth ✅

**Implemented (2026-04-18):**

- `normalizeHeaderDraft()` now resolves a `source` field (`'page-meta-v3'` | `'page-meta-stale'` | `'legacy-import'` | `'default'`) so the editor and canvas renderer know the provenance of the active draft without changing save behavior.
- The header editor shows a migration warning banner when a page is missing canonical V3 header metadata (`legacy-import`) or uses an older stored format (`page-meta-stale`), prompting authors to save V3 page metadata.
- The canvas header surface shows migration/upgrade status chips alongside the existing Unsaved/Click-to-edit badge so rare non-canonical records are visible before opening the editor.
- The banner disappears after saving — `saveActiveHeaderDraft` writes normalized V3 data and re-initializes the draft from the server response, so the source becomes `'page-meta-v3'` and the banner is suppressed on the next render.
- Added 4 new shell tests: migration banner present for legacy pages, absent for V3 pages, cleared after save, and canvas chip visible for legacy sources. Full suite: 37 files, 231 passing, 0 regressions.

#### Step 3 - Upgrade the header editor UX to feel like an official builder tool ✅

**Implemented (2026-04-18):**

- Removed the Advanced raw JSON accordion from the header editor — the editor is now fully structured with no JSON fallback path, matching BUILDER_PLAN.md line 460.
- Upgraded the placement board to support direct drag-and-drop reordering between `left`, `center`, and `right` regions; each block card is `draggable="true"` with a visible grip handle.
- Kept keyboard/button-based Move Left, Right, Up, Down as the accessible fallback path.
- Removed the orphaned region `<select>` dropdown (superseded by drag + buttons).
- Strengthened the canvas header preview: `patron`, `status`, and `entryControls` now render block-specific representative chips instead of generic definition text; `nav` empty state shows an actionable hint; empty regions show an "Empty region" placeholder instead of rendering nothing.
- Updated the Placement section description to reflect drag-first workflow copy.
- Updated the editor-panel subtitle for the header editor shell to workflow-oriented language.
- Added 5 new shell tests: absence of raw JSON textarea, draggable attributes on placement cards, block-specific canvas chips for patron/status/entryControls, empty-region indicator, drag-first section copy. Full suite: 37 files, 236 passing, 0 regressions.

#### Step 4 - Bring header buttons onto the shared button model ✅

**Implemented (2026-04-18):**

- Added a `style` field (`'primary'` | `'secondary'`) to `normalizeHeaderNavItem()` in `link-utils.js`, giving header nav items the same variant concept as the `buttons` module. Unknown values fall back to `'primary'`, preserving existing visual behaviour for all stored data.
- Added a **Style** dropdown (Primary / Secondary) to each header nav item card in `header-editor.js`. The existing `.pb-header-nav-input` event handler picks it up automatically — no extra binding code required.
- Updated `canvas-renderer.js` so nav-block chips carry `pb-page-header-chip--primary` or `pb-page-header-chip--secondary` modifier classes, giving authors an at-a-glance distinction in the placement board.
- Updated `reader/header-layout.js` to apply `nav-link--primary` or `nav-link--secondary` to each dynamically rendered header link.
- Added `.nav-link--secondary` (outline/transparent treatment) to `main.core.04-header.css`. The existing `.nav-link` styles remain the primary treatment.
- Added `.pb-page-header-chip--secondary` (outline chip) to the admin canvas CSS.
- No per-button custom color system introduced; only the two existing shared button variants are reused.
- Added 6 new tests (1 unit in link-utils, 5 shell): style select presence, secondary draft persistence, primary default for new items, chip variant classes, and round-trip save. Full suite: 37 files, 242 passing, 0 regressions.

#### Step 5 - Keep renderer parity and migration explicit ✅

**Implemented (2026-04-18):**

- Added `resolvePageHeaderState(...)` in `admin/page-builder/header-config.js` as the shared Step 5 header-state helper. The admin canvas header surface and the reader now consume the same normalized header object instead of resolving copy and layout through separate paths.
- Updated `admin/page-builder/canvas-renderer.js` to render the page-header surface from that shared resolved state.
- Updated `reader/data.js` to resolve the effective header once, apply copy from that resolved object, and pass the same state into `reader/header-layout.js` for DOM placement and nav rendering.
- Updated backend header sanitization so `page.meta.header.nav.items[*].style` now persists the same `'primary' | 'secondary'` contract already used by the frontend button model; save, reload, reader render, and backfill now preserve button variants.
- Added `python -m backend.app.backfill_page_headers --series <series-id> [--write]` as a CLI-first migration path. It dry-runs by default, backfills older builder pages to canonical `meta.header.version = 3`, and clears `meta.headerOverrides` when writing.
- Tightened the runtime-fallback audit semantics so `legacyHeaderModule` only blocks readiness when a page still depends on legacy copy fallback. Once V3 `meta.header` exists, stored legacy header modules are treated as later cleanup debt rather than a blocker for runtime fallback removal.
- Documented and aligned the removal order explicitly:
  1. remove UI fallback behavior
  2. backfill older pages
  3. verify the audit is clean
  4. remove runtime fallback in a later cleanup pass
- Added targeted frontend and backend coverage for shared reader/admin parity, persisted header button styles, audit readiness semantics, and dry-run/write backfill behavior. Full targeted suites passed during implementation.

#### Acceptance criteria

- opening the page designer always reveals the integrated header builder, never the legacy fallback UI
- the header editor is clearly first-class and fully structured
- authors can move header parts between regions and reorder them without touching JSON
- authors can add, remove, reorder, enable, disable, and restyle header buttons from the UI
- saving a legacy page writes `page.meta.header.version = 3` and stops the admin editor from depending on fallback state for that page
- header preview in admin and the live reader header stay in parity for layout, visible blocks, and button variants
- the series-level fallback audit remains the gate for runtime fallback removal

**Completion note (`2026-05-02`):** Phase 6 acceptance is satisfied for its current scope. Runtime fallback removal remains future cleanup after the series-level fallback audit is clean.

### Phase 7 - Header and Button Appearance Customization Pass ✅

Status: Complete for the current header/button appearance scope (`2026-04-25` - `2026-05-02`). Steps 1-5 are implemented and verified; later hover/focus/active state editing, per-block header styling, and broader module style unification remain out of scope.

This phase adds structured styling controls for the page header shell, header nav items, and the standalone `buttons` module. The model should follow the useful parts of stronger builders such as Wix, Squarespace, Webflow, and Shopify: token-driven defaults, structured controls, and optional per-item overrides instead of freeform CSS.

#### Scope and defaults

- scope is limited to header shell + header nav + `buttons` module
- styling uses inheritance: `page.meta.theme` tokens -> existing `style` preset -> header/module defaults -> per-item overrides
- new styling fields are optional and backward compatible
- no per-state hover/focus editor in this pass; preserve current CSS-driven interaction states

#### Important Interface Changes

Keep the existing `style` field on header nav items and button items for backward compatibility.

Add these new optional interfaces:

- `page.meta.header.appearance`
  - `top`: header container background/text/border appearance when the page is at the top
  - `scrolled`: header container background/text/border appearance after scroll
  - `navItemDefaults`: default appearance for header nav buttons
- `page.meta.header.nav.items[*].appearance`
- `buttons` module config `defaults.appearance`
- `buttons` module config `buttons[*].appearance`

Use one shared `appearance` shape for both header nav items and buttons:

- `background`: `type` (`solid` | `gradient`), `color`, `secondaryColor`, `angle`, `opacity`
- `text`: `color`
- `border`: `width`, `style` (`solid` | `dashed` | `dotted`), `color`, `opacity`, `radius`

Do not add raw CSS fields, arbitrary class names, or freeform JSON editing for this feature.

#### Step 1 - Define the shared appearance contract

- Shipped in the shared data contract layer. The builder and backend now accept, normalize, sanitize, and round-trip sparse `appearance` data for header shell state, header nav items, button items, and `buttons.defaults.appearance`.
- The new frontend helper lives in `admin/page-builder/appearance-utils.js` and exports `normalizeAppearance`, `mergeAppearance`, `appearanceToInlineStyle`, and `isAppearanceEmpty`.
- Resolution approach is locked to JS-side merge, not CSS-variable fallback. Step 1 does not consume the merge helper yet in renderers, but it establishes the contract and the future emission helper.
- The contract is sparse by design: empty `appearance` values are omitted from stored JSON, and omitted leaves remain `null` in normalized/sanitized data until a later render-time resolution step applies defaults.
- Old pages keep current behavior because no reader/admin renderer consumes `appearance` yet when it is absent.
- Backend sanitization now explicitly owns `appearance`; the old `sanitize_page_meta(...)` `_deepcopy` fallthrough is no longer relied on for these fields.

Functions in the normalize/resolve/sanitize chain that must carry `appearance` through:

- `normalizeHeaderConfig` in `admin/page-builder/header-config.js` — now passes header-shell `appearance` through a local `normalizeHeaderShellAppearance(...)`
- `createPageHeaderMeta` in `admin/page-builder/header-config.js` — now carries normalized `appearance` into returned V3 meta
- `resolvePageHeaderState` in `admin/page-builder/header-config.js` — now preserves `appearance` on both `meta` and normalized `header`
- `sanitize_header_meta` in `backend/app/builder_security.py` — now calls `sanitize_header_shell_appearance(...)` and includes the result only when non-empty
- `normalizeHeaderNavItem` in `admin/page-builder/link-utils.js` — now passes through an optional normalized `appearance` field
- `normalizeButtonItem` in `admin/page-builder/link-utils.js` — now passes through an optional normalized `appearance` field
- `normalizeButtonsConfig` in `admin/page-builder/link-utils.js` — now preserves unrelated config while normalizing `defaults.appearance`
- `sanitize_header_nav_items` in `backend/app/builder_security.py` — now sanitizes per-item `appearance`
- `sanitize_module_config` for `buttons` in `backend/app/builder_security.py` — now sanitizes per-button `appearance` and module-level `defaults.appearance`

Backend validation bounds for the `appearance` shape:

- `background.angle` must be clamped 0–360 via `_clamp_int`
- `background.opacity` and `border.opacity` must be clamped 0.0–1.0 via `_clamp_float`
- `border.width` must be clamped 0–20 via `_clamp_int`
- `border.radius` must be clamped 0–200 via `_clamp_int`
- all color fields must pass through `sanitize_color`
- `background.type` must be validated against `{'solid', 'gradient'}`
- `border.style` must be validated against `{'solid', 'dashed', 'dotted'}`

Step 1 verification baseline:

- Added frontend unit coverage for appearance normalization, merge semantics, inline-style emission, and empty-state detection.
- Added builder normalizer coverage for header nav items, button items, button defaults, and header-state parity passthrough.
- Added backend route coverage for appearance save/read round-trip, clamping/rejection, and omission of empty `appearance` keys.
- Verification completed with targeted Vitest coverage, backend route tests via the repo's `unittest` runner, and a `dist/` rebuild.

#### Step 2 - Add appearance controls to the `buttons` module

- Extend the `buttons` module editor with a module-level defaults card plus per-button appearance controls.
- Keep the current link editor and preset selector; appearance overrides are additive, not a replacement for the existing flow.
- Render customized buttons through the shared renderer path so admin preview and reader output stay aligned.
- Use the same precedence everywhere: theme tokens, then preset, then module defaults, then button override.
- The button renderer in `shared-renderers.js` currently emits pure class-based output (`pb-btn--primary`, `pb-btn--secondary`) with no inline styles. This step must transition it to class + inline-style (or CSS-variable) output when `appearance` data is present, while preserving pure-class output when it is absent.
- Any new CSS for button appearance variants must be added to the appropriate CSS files and included in the `dist/` build.

**Implemented (`2026-04-25`):**

- Added structured sparse appearance controls to the `buttons` module editor for module defaults and per-button overrides.
- Kept the existing `style` preset and link editor model intact; appearance values are additive and only emit inline styles when configured.
- Updated the shared renderer path so admin preview and reader output merge `defaults.appearance` with `buttons[*].appearance` using the same precedence.
- Preserved class-only rendering for legacy buttons with no `appearance` data.
- Added targeted editor and renderer coverage for default overrides, per-button overrides, merge behavior, and backward-compatible output.

#### Step 3 - Add header shell and header nav appearance controls

- Extend the page header editor with a header-shell appearance section covering `top` and `scrolled` states.
- Add header nav default appearance controls plus per-nav-item appearance controls.
- Keep the existing header layout/placement workflow unchanged; this phase is styling only, not a new header block system.
- Do not include per-block styling for `brand`, `patron`, `status`, or `entryControls` in this pass.
- The reader header (`header.topbar`) is `position: sticky` but has no scroll-aware JS today. This step must add a scroll listener (in `reader/header-layout.js` or `reader/app.js`) that toggles between `top` and `scrolled` appearance on the header shell element.
- Note that `navItemDefaults` lives under `header.appearance` while per-item overrides live under `header.nav.items[*].appearance`. The merge logic must reach across these two branches — call this out explicitly in the normalizer so implementers don't miss the cross-branch resolution.
- Any new CSS for header-shell scrolled state or nav-item appearance must be added to the appropriate CSS files and included in the `dist/` build.

**Implemented (`2026-04-26`):**

- Extracted shared structured appearance editor helpers into `admin/page-builder/appearance-editor.js`, leaving button-specific and header-specific event binding local to their editors.
- Added page-header shell controls for `appearance.top` and `appearance.scrolled`, plus header nav defaults and per-item override controls.
- Added exported header appearance resolvers in `header-config.js`, including the cross-branch merge from `header.appearance.navItemDefaults` to `header.nav.items[*].appearance`.
- Updated the admin canvas header surface to preview top-state shell appearance and merged nav chip appearance through the shared resolvers.
- Updated the reader header runtime to apply top/scrolled shell appearance, install one passive scroll listener, clear controlled inline styles when appearance is absent, and keep the runtime-only `#adminNavLink` outside author nav styling.
- Added reader header CSS transitions and scrolled-state styling in `assets/css/main.core.04-header.css`.
- Added dedicated `tests/header-appearance.test.js` coverage for shell merge semantics, nav default/item merge precedence, header editor draft persistence, reader scroll behavior, cleanup on pages without appearance, `#adminNavLink` exclusion, and canvas preview output.

#### Step 4 - Keep runtime parity explicit

- Update the reader header runtime to resolve header-shell and nav-item appearance from the same shared header-state helper used by the admin surface.
- Apply customized button/nav appearance through shared CSS-variable or inline-style generation rather than separate one-off render paths.
- Preserve current reader behavior when no appearance data is present.
- Require `dist/` rebuild before claiming live reader changes work, because this phase affects shared reader/builder rendering.

**Implemented for the current pass (`2026-04-26`):**

- Header appearance resolution is centralized through `resolveHeaderShellTopAppearance(...)`, `resolveHeaderShellScrolledAppearance(...)`, and `resolveHeaderNavItemAppearance(...)`.
- The reader DOM application and admin canvas preview both consume the same normalized header state and inline-style emission helper.
- Customized buttons continue to use the shared renderer path, so reader and admin preview output stay aligned without a separate button render branch.
- Pages without appearance data keep the previous class-based visuals, and generated author nav links only receive inline styles when appearance data resolves.

#### Step 5 - Verification and acceptance

- Add unit coverage for appearance normalization, sanitization, and merge precedence.
- Add editor tests for draft persistence, save/reload round-trip, and backward compatibility with old pages that only use `style`.
- Add renderer parity tests so admin preview/canvas and live reader produce the same customized header/button output.
- Add reader tests for top-vs-scrolled header shell styling and customized button/nav rendering.

**Verification baseline (`2026-04-26`):**

- `npm run lint` passed with no warnings.
- `npm test` passed: 40 frontend test files, 282 passing, 1 skipped.
- `npm run test:backend` passed: 58 backend tests.
- Touched-file Prettier check passed for all files in this change set.
- `node ./node_modules/vite/bin/vite.js build` completed successfully; `dist/` is ignored by git, so rebuilt assets are not committed.

**Closeout verification (`2026-05-02`):**

- `npm run format:check` passed: all JS/HTML/CSS/MD files use Prettier code style.
- `npm run format:py:check` passed: 45 Python files already formatted.
- `npm run lint` passed with no warnings.
- `npm run lint:py` passed: Ruff reported all checks passed.
- `npm test` passed: 40 frontend test files, 285 passing, 1 skipped.
- `npm run test:backend` passed: 63 backend tests.
- `npm run build` completed successfully; `dist/` is ignored by git, so rebuilt assets are not committed.
- `git diff --check` passed with no whitespace errors.

#### Acceptance Criteria

- authors can customize header container background and border for top and scrolled states without touching JSON
- authors can customize button and header-nav background, text color, border, and radius from structured controls
- theme changes still cascade unless a more specific header/module/item override is set
- old pages that only use `primary` / `secondary` keep their current visual behavior
- admin preview and the live reader stay in parity for customized header and button rendering

**Acceptance completion (`2026-05-02`):** Criteria are satisfied for the current header shell, header nav, and `buttons` appearance scope. Hover/focus/active state editors, per-block header styling, and broader style unification for social, promo, feed, and email module style objects remain deferred.

#### Implementation notes from audit

Relationship to existing module style objects:

- The `appearance` shape is intentionally a new shared contract for header + buttons. It diverges from the existing per-module `style` objects used by `social` (`sanitize_social_style`), `email-signup` (`sanitize_email_style`), `feed` (`sanitize_feed_style`), and `promo` (`sanitize_promo_item_style`).
- Those existing per-module style objects are not migrated to the `appearance` contract in this pass.
- Future unification of module style objects under a single appearance contract is a separate consideration and is not assumed by this phase.

Test baseline expectations:

- Step 5 should assert a specific test count as a regression gate, consistent with the convention established in earlier phases (e.g., Phase 6 Step 4: "37 files, 242 passing, 0 regressions").

#### Assumptions

- No migration or backfill is required because all new fields are optional.
- This phase does not expand to social, promo, feed, or other modules.
- This phase does not add per-block header styling.
- Hover/focus/active state editors are deferred to a later pass if needed.

#### Benchmark References

- Wix header customization: https://support.wix.com/en/article/wix-editor-customizing-your-site-header
- Wix button design customization: https://support.wix.com/en/article/wix-editor-customizing-the-design-of-your-buttons
- Squarespace button styling: https://support.squarespace.com/hc/en-us/articles/206544727-Styling-buttons
- Webflow state model: https://help.webflow.com/hc/en-us/articles/33961301727251-States
- Shopify theme settings model: https://help.shopify.com/en/manual/online-store/themes/customizing-themes/theme-editor/theme-settings

### Phase 8 - Runtime Fallback Retirement Pass

Status: proposed next pass.

Goal: retire the remaining legacy runtime fallback paths now that the integrated builder, page-scoped header model, and appearance contract are stable. This phase is cleanup and migration hardening, not a new styling or editor-feature pass.

#### Scope and defaults

- remove runtime dependence on legacy header/page-config fallback only after audit gates are clean
- keep stored legacy data readable during migration, but stop using it as normal reader/admin runtime behavior once canonical builder data exists
- include both reader startup paths: `reader/data.js` and the separate legacy customization IIFE in `reader/customization.js`
- treat `reader/safe-mode.js` as a separate legacy page-config consumer, not the main reader fallback path; review it during this phase but do not block runtime fallback retirement on it unless it affects normal startup
- do not remove the structured header editor, `page.meta.header.version = 3`, or the appearance contract added in Phase 7
- do not expand hover/focus/active editing, per-block header styling, or broader module appearance unification in this pass
- do not make authors hand-edit JSON to complete migration

#### Step 1 - Establish the fallback inventory gate

- Treat `auditPagesFallbacks(pages)` in `admin/page-builder/header-config.js` as the source of truth for retirement readiness.
- Confirm the audit is run against the complete admin page list for each series, not only the active page.
- The audit must be clean before runtime fallback removal is claimed:
  - no `missingHeader`
  - no `staleHeaderVersion`
  - no `headerOverrides`
  - no blocking `legacyHeaderModule`
  - a published builder page with slug `reader`
- Keep the current nuance that stored legacy `header` modules are inert cleanup debt once canonical V3 `meta.header` exists; they should not block runtime removal unless the page still depends on legacy copy fallback.
- Confirm existing tests still exercise the series-level `missingPublishedReaderPage` gate and mixed-page aggregation; add coverage only for any gate behavior not already protected.

**Completion note (`2026-05-08`):** Added `loadFallbackRetirementGate(seriesId, deps)` as a developer-facing gate that loads full page details before calling `auditPagesFallbacks(...)`, because page-summary lists do not include sections/modules and cannot prove the `legacyHeaderModule` bucket is clean.

#### Step 2 - Backfill and verify canonical page headers

- Use `python -m backend.app.backfill_page_headers --series <series-id>` as the dry-run migration report for each series.
- Run the same command with `--write` only after reviewing the dry-run output and confirming it will write `page.meta.header.version = 3` and clear obsolete `page.meta.headerOverrides`.
- Backfill should preserve the effective author-visible header state generated from `createEffectivePageHeader(...)`; it must not silently discard nav items, hidden block choices, placement, or button styles.
- After write mode, reload admin pages and rerun `auditPagesFallbacks(...)` to confirm the relevant series is clean.
- Add backend coverage where needed for any missing backfill edge case discovered during dry-run review.

**Completion note (`2026-05-09`):** The backend backfill now preserves Phase 7 header appearance data while upgrading stale headers to canonical V3 meta. `backend/app/backfill_page_headers.py` sanitizes and carries forward shell-level `appearance` (`top`, `scrolled`, `navItemDefaults`) plus per-nav-item `appearance`, writes that data into `page.meta.header`, and exposes additive `pageReports` details in dry-run/write summaries so migration review can inspect versions, override cleanup, disabled blocks, regions, nav styles, and appearance presence per changed page. Backend coverage now explicitly asserts hidden-block persistence (`status.enabled == false` after override cleanup) and sanitized legacy appearance retention during `--write`.

#### Step 3 - Remove legacy reader fallback branches

- In `reader/data.js`, remove the normal `source: 'legacy'` path from `loadPageConfigWithFallback(...)` once every supported series has a clean audit and published builder `reader` page.
- Remove the transitional `localStorage.pb-no-fallback` branch at the same time as the legacy branch, because it exists only to test fallback-free behavior.
- Keep `source: 'builder'` for successful builder pages and `source: 'none'` for missing unpublished/draft/non-reader pages.
- In `reader/customization.js`, remove or hard-disable the legacy `page-config.json` customization fetch so `source: 'none'` cannot re-enter the old reader shell after `source: 'legacy'` is removed.
- Update `reader-customization.test.js` so the current `source: 'legacy'` behavior is replaced with the post-retirement expectation.
- Decide whether the unconditional `fetchPageConfig(sid)` call in `loadPageConfigWithFallback(...)` is still needed after customization retirement; keep it only if builder-page subtitle/header layout behavior still depends on it, otherwise make it lazy or remove it from normal startup.
- Update reader tests so missing builder pages no longer load legacy `page-config.json` as reader content; they should produce the intended empty/error-safe state instead.
- Preserve defensive sanitization and URL safety for legacy data that may still exist on disk, but do not keep legacy fallback as the primary reader startup path.

**Completion note (`2026-05-09`):** Normal reader startup no longer fetches legacy `page-config.json` or returns `source: 'legacy'`. `loadPageConfigWithFallback(...)` now returns only `source: 'builder'` with a builder page or `source: 'none'` for missing builder pages, and the transitional `pb-no-fallback` runtime branch is gone. `reader/customization.js` is retained only as a no-op compatibility module, so `source: 'none'` cannot re-enter the old reader shell. Builder header/subtitle resolution now uses `createEffectivePageHeader(page, null)` during startup; lower-level helpers still accept optional legacy config for direct migration/safety tests. `reader/safe-mode.js` remains the intentional separate `/page-config.json` runtime consumer.

#### Step 4 - Remove admin/header runtime compatibility hooks that are no longer needed

- Remove or downgrade admin UI/runtime behavior whose only purpose is to route authors through legacy header fallback after canonical V3 page headers are universal.
- Keep migration/audit affordances that help inspect old data until a separate stored-data cleanup pass removes inert legacy modules.
- Revisit `createEffectivePageHeader(...)` and `resolvePageHeaderState(...)` only after the reader branch is gone; keep them as active helpers if admin preview, backfill, or tests still need them, and document the reason instead of forcing deletion.
- Review `reader/safe-mode.js` and document whether its direct `/page-config.json` fetch remains an intentional recovery-only path or should move to builder page data in a later pass.
- Update any user-facing copy that still implies fallback is an active authoring mode instead of historical migration debt.

**Completion note (`2026-05-09`):** The page builder no longer loads series `page-config.json` as a normal header-editing dependency. Admin header draft/save and canvas preview resolution now use `createEffectivePageHeader(page, null, ...)` / `resolvePageHeaderState(... pageConfig: null ...)` for the steady-state V3 path, while the optional legacy `pageConfig` helper input remains for migration, backfill, and direct safety tests. Provenance UI copy now describes missing/stale header metadata as rare migration state, not an active fallback authoring mode. `reader/safe-mode.js` remains unchanged as the intentional recovery-only `/page-config.json` consumer; stored legacy `header` modules remain later cleanup debt.

#### Step 5 - Verification and acceptance

- Add focused frontend coverage for:
  - clean audit readiness with a published `reader` page
  - blocked audit readiness when any fallback bucket remains
  - reader startup without legacy `source: 'legacy'`
  - `reader/customization.js` no longer fetching legacy `page-config.json` for `source: 'none'`
  - admin/header parity after backfilled V3 headers
- Add backend coverage for any new backfill behavior or migration edge case found during dry-run/write review.
- Run the full gate before marking Phase 8 complete:
  - `npm run format:check`
  - `npm run format:py:check`
  - `npm run lint`
  - `npm run lint:py`
  - `npm test`
  - `npm run test:backend`
  - `npm run build`
  - `git diff --check`

#### Acceptance Criteria

- every supported series has a published builder `reader` page or is explicitly documented as not ready for fallback retirement
- `auditPagesFallbacks(fullSeriesPages)` reports `clean: true` for every retired series
- the reader no longer returns `source: 'legacy'` during normal startup
- `reader/customization.js` no longer reintroduces legacy `page-config.json` customization after fallback retirement
- `pb-no-fallback` is removed with the legacy reader branch
- `fetchPageConfig(sid)` is removed, made lazy, or explicitly documented as still required for builder-page subtitle/header layout compatibility
- backfilled pages preserve author-visible header layout, nav items, button styles, and Phase 7 appearance data
- admin preview and live reader remain in parity for backfilled V3 headers
- remaining legacy header modules, if any, are documented as inert stored-data cleanup debt rather than active runtime dependencies
- `reader/safe-mode.js` is documented as intentionally separate recovery behavior or queued for a later builder-backed recovery pass

#### Assumptions

- Phase 8 should retire runtime fallback before adding more appearance-editor surface area.
- Runtime fallback removal may be staged by series if any series cannot pass the published-`reader` and clean-audit gates immediately.
- A separate cleanup pass can physically delete inert stored legacy header modules after runtime fallback is gone and verified.

## Keep / change / avoid

### Keep

- explicit save model
- page-scoped header editor
- page-scoped theme editor
- series scoping
- drag/drop sections and modules
- lightweight section settings

### Change

- unsafe HTML and URL handling
- raw JSON dependence for common modules

### Avoid

- trying to become a generic site builder
- adding complex features before security and preview are trustworthy
- introducing more duplicated render logic
- over-engineering a schema for features the site does not actually need

## Verification coverage

Current automated coverage already exists for:

- builder data API wrappers
- builder shell interactions
- builder preview rendering
- reader page rendering
- reader builder-page loading
- backend page/section/module routes

Coverage still missing from the audit perspective:

- optimistic concurrency tests

## Implemented security notes

The current builder security model is intentionally lightweight:

- sanitize on save
- store the cleaned value
- sanitize again on read as defense in depth
- reject invalid structural payloads with `400`

The current policies are:

- `text` keeps basic editorial HTML only
- `html` remains available, but scripts, inline event handlers, forms, embeds, and unsafe URLs are stripped
- builder links and media URLs allow only safe protocols and safe relative paths
- invalid section layouts, module types, column indexes, and similar structural violations are rejected instead of silently stored

This is enough to make the builder materially safer without turning it into a heavyweight schema-driven system. The next meaningful security step is conflict protection, not more raw feature complexity.

## Working definition of done

This builder is in a good place when all of the following are true:

- common page work can be done without code edits
- the page designer always exposes the real page-scoped header builder instead of a fallback header path
- header layout and header buttons are fully editable from structured controls
- builder output is safe by default
- authors can trust what they preview
- page saves do not silently overwrite each other
- legacy fallback paths are small, intentional, and temporary
- the builder remains simple and effective
