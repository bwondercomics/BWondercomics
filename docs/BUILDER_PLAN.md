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
- legacy `page-config` header data and legacy `header` modules are still used only as fallback inputs for older pages

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

Important current reality:

- the reader still contains legacy fallback behavior through `page-config` loading for some flows
- the earlier "no fallback UI in dev" goal has not actually been fully achieved

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

1. Keep header fallback only until older pages are migrated.
2. Keep `page-config` fallback only while the reader still depends on unmigrated surfaces.
3. Track which surfaces are still legacy-backed.
4. Remove fallback paths only after the builder is complete enough that authors are not forced back into code.

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
- builder output is safe by default
- authors can trust what they preview
- page saves do not silently overwrite each other
- legacy fallback paths are small, intentional, and temporary
- the builder remains simpler than the site it serves
