# Polish Backlog Plan — Tweaks, Fixes, and Small Features

Status: **Proposed — not started** (recorded 2026-07-14; requests 10–12 added same day).
Created: 2026-07-14
Branch context: written on `builder-incremental-improvement` while the Builder Customization
Roadmap closeout work is still uncommitted in the working tree. Phases here assume that work
lands first; re-verify cited line numbers at implementation time.

Related docs:

- `docs/BUILDER_CUSTOMIZATION_ROADMAP.md` — Phases 6 and 5 here extend its appearance-schema
  work (column chrome, feed-style sector).
- `docs/ROADMAP_TO_1.0.md` — §2.5 chose "polish media.html in place" for 1.0; Phase 8 here is
  additive curation inside that direction. §2.1's builder UX goals cover Phase 1.
- `docs/DEVELOPER_QUICK_REFERENCE.md` — pre-commit checklist; run the relevant gates per phase.

## Purpose

Turn a 12-item backlog of user-requested tweaks and fixes into independently executable
phases. Each phase stands alone (no phase depends on another unless stated), ordered quick
wins → features. The backlog spans six surfaces: the reader feed (static right panel + the
builder `feed` module), builder inspector chrome, the builder canvas/preview, the admin asset
library, the media page, and the reader's touch navigation.

## Traceability: request → phase

| # | Request                                                                                   | Phase | Size |
| - | ----------------------------------------------------------------------------------------- | ----- | ---- |
| 1 | Customizable/togglable glow columns                                                        | 6     | M    |
| 2 | Option to change transparency for feed block elements                                      | 5     | M    |
| 3 | Make the 2 feed buttons animated, and put a line between the 2 buttons                     | 2     | S    |
| 4 | Make feed drop down fit better for tablet and phone                                        | 3     | S–M  |
| 5 | When the feed is made shorter, shorten the post summary before clipping into elements      | 4     | M    |
| 6 | Builder drop-down options unreadable unless hovered (blend into background)                | 1     | S    |
| 7 | Make it possible to delete images uploaded for page builder use                            | 7     | M    |
| 8 | Hero cards in media (larger tiles for the best images), organizable                        | 8     | M    |
| 9 | Make it so an entry can be shared with a link                                              | 9     | M    |
| 10 | Desktop builder preview should fill the whole webpage, not sit in the middle of the page  | 10    | S–M  |
| 11 | Column height actually editable; selection should wrap the whole column, border and all   | 11    | M    |
| 12 | Scrolling the page on phone must not also change the comic page (tablet fine, phone broken) | 12  | S–M  |

Suggested batching: Phases 1 and 12 first (both are daily-use bugs). Phases 2–5 are one feed
cluster and can ship as a group. Phases 6–11 are independent in any order; Phases 10–11 are
both builder-canvas work and pair well together.

## Confirmed decisions

| Date       | Decision                                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------------------------- |
| 2026-07-14 | Phase 11: **no new column height field** — fix the existing `minHeight` so it visibly sizes the bordered shell panel. |
| 2026-07-14 | Phase 10: exit stays the existing top-left **Edit** button (`#pbRestorePreviewChrome`) — no new exit chrome; it must keep working when the preview fills the whole window. |
| 2026-07-14 | Phase 2: the divider between the two feed buttons is a **transparent gap** — the background shows through; no colored line, no new config. |
| 2026-07-14 | Phase 4: container-queries vs `ResizeObserver` is an in-phase implementation choice — identical visible behavior either way. |
| 2026-07-14 | Phase 5: transparency sliders pair with every feed **background** and **border** color; text colors stay opaque. |
| 2026-07-14 | Phase 6: glow supports **inside and/or outside** placement, with **intensity, spread, and color** controls. Scope stays shell panels first. |
| 2026-07-14 | Phase 7: **usage tracking is in scope** — show where each asset is used in the picker, and list referencing pages on delete. |
| 2026-07-14 | Phase 8: hero ordering via **up/down** buttons — no drag-and-drop for now. |
| 2026-07-14 | Phase 9: the share control is **a button in the reader controls bar** only. |

## Compatibility rules (apply to every phase)

- Published pages (`battle-bros`, `prisonplanet`, PYRE `02`) must render unchanged by default:
  every new config/appearance key is optional and its default reproduces today's rendering.
- Feed CSS classes are shared between the legacy static right panel (`index.html` +
  `reader/latest.js`) and the builder `feed` module (`admin/page-builder/shared-renderers.js`).
  Any change to those classes gets QA'd on **both** surfaces.
- `shared-renderers.js` is the single source for feed markup in admin preview and reader — keep
  parity (guarded by `tests/shared-renderers-parity.test.js`).
- No DB schema changes except Phase 8, which must first confirm the repo's column-migration
  pattern.
- Admin-only endpoints stay behind `_require_admin` + `safe_path`
  (`backend/app/routes/files.py`).
- Animations added anywhere must respect `prefers-reduced-motion`.

## Reading map

| Area                         | Files                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| Feed CSS                     | `assets/css/main.core.10b-right-panel-feed.css`, `assets/css/main.responsive.css`          |
| Feed markup + behavior       | `admin/page-builder/shared-renderers.js:485` (feed renderer), `reader/feed-panel.js`, `reader/latest.js` |
| Feed module config           | `admin/page-builder/module-descriptors.js:230-264`, feed editor in `admin/page-builder/module-editor.js` |
| Column/panel chrome          | `assets/css/main.core.09-side-panels.css`, column inspector in `admin/page-builder/editor-panel.js`, `reader/data.js` |
| Builder inspector controls   | `admin/css/page-builder/controls.css`, `admin/css/page-builder/inspector.css`              |
| Asset library                | `admin/image-picker.js`, `admin/page-builder/data.js:209`, `backend/app/routes/files.py:494-605` |
| Builder preview + selection  | `admin/page-builder/preview-contract.js`, `admin/page-builder/preview-manager.js`, `admin/css/page-builder/canvas.css`, `reader/preview-bridge.js` |
| Reader touch navigation      | `reader/pointer.js`, `reader/config.js`, `reader/app.js` (edge-zone clicks), `assets/css/main.core.11-viewport.css`, `assets/css/main.core.14-edge-zones.css` |
| Media page                   | `media.html`, `backend/app/models.py:201` (`MediaItem`), `backend/app/content_store.py`, `admin/media.js` |
| Reader URL/state             | `reader/series.js`, `reader/app.js`, `reader/gallery.js`, `reader/controls.js`             |

---

## Phase 1 — Builder select-option legibility (bug fix)

**Request 6.** Drop-down options in the page builder are invisible unless hovered — the option
text blends into the popup background.

**Current state.** `.pb-editor-select` styles the closed control dark-translucent with light
text (`admin/css/page-builder/controls.css:75-96`), but the *open* option list is native UA
chrome: no `option` styling exists and nothing in `admin/` declares `color-scheme` (verified
2026-07-14). On dark OS/browser combinations the UA paints a light popup while the options
inherit light text — unreadable until hover highlights a row.

**Approach.**

1. Declare `color-scheme: dark` at the admin root (e.g. `:root`/`body` in
   `admin/css/page-builder/theme.css` or the admin base stylesheet) so native select popups,
   scrollbars, and form chrome render dark.
2. Belt-and-braces explicit option styling: `select option { background-color: <dark>; color: <light>; }`
   for the browsers that honor it.
3. Audit *all* selects in the admin (builder inspector, toolbar, and non-builder tabs — Posts,
   Media, Users use selects too), not just `.pb-editor-select`.

**Files.** `admin/css/page-builder/theme.css` and/or `admin/css/page-builder/controls.css`;
possibly a shared admin base stylesheet.

**Acceptance criteria.**

- Every admin select's open option list is readable without hovering, in Chrome and Firefox,
  regardless of OS light/dark preference.
- Closed-control appearance unchanged.

**Test plan.** Manual matrix: Chrome + Firefox × OS light/dark, spot-check builder inspector
dropdowns (module type, appearance sectors, source mode) plus one select on a non-builder tab.
No unit-test surface. Size: **S**.

---

## Phase 2 — Feed action buttons: divider + animation

**Request 3.** Animate the two feed buttons ("Open feed" / "Media") and put a visible line
between them.

**Current state.**

- The two buttons are `.latest-link--left` / `--right` inside the `.latest-actions` grid
  (`main.core.10b-right-panel-feed.css:138-184`); they join with `border-radius: 0` on the
  inner corners and two half-borders of `rgba(10, 10, 18, 0.35)` (lines 174-184) — a divider
  that's nearly invisible against the button fill.
- Hover today only swaps colors (`:hover` at lines 155-159) — and on builder pages the fill is
  an **inline style** (`btnStyle`, `shared-renderers.js:534-535`), which overrides the CSS
  hover background, so builder-configured buttons currently have no visible hover at all.
- In-file animation precedent: `.feed-exit-btn` hover lift + glow (lines 206-230).

**Approach.**

1. **Divider (decided 2026-07-14): a transparent gap.** Remove the two half-borders and open a
   small `gap` (2–4px) on the `.latest-actions` grid (and its bar variant) so the panel/bar
   background shows through between the buttons. No colored line, no new config key. Keep the
   squared inner corners so the pair still reads as one split control.
2. Add motion that survives inline background styles: `transition` +
   `transform: translateY(-1px)` + `box-shadow` glow + `filter: brightness()` on hover/active —
   mirroring `.feed-exit-btn`. Wrap in `@media (prefers-reduced-motion: reduce)` opt-out.
3. Apply to both placements: the panel body `.latest-actions` and the feed-mode top bar
   variant (`.right-panel-feed-bar .latest-link`, lines 242-250).

**Files.** `assets/css/main.core.10b-right-panel-feed.css` only (classes shared by static panel
and feed module). No markup change expected; if markup changes, update
`shared-renderers.js` + `reader/latest.js` together.

**Acceptance criteria.**

- A transparent gap separates the two buttons at rest — the background shows through — with
  default and custom `buttonBgColor` values.
- Hover/focus animates (lift/glow/brighten) on both legacy panel and builder feed module,
  including buttons with builder-configured colors.
- `prefers-reduced-motion` disables the motion.

**Test plan.** `npm test` (`tests/shared-renderers-parity.test.js` if markup touched); manual
QA on a legacy page and a builder page with custom button colors. Size: **S**.

---

## Phase 3 — Feed dropdown fit on tablet and phone

**Request 4.** The feed dropdown doesn't fit well on tablet and phone.

**Current state.** The feed has two expandable surfaces: the collapsed "BWC FEED" heading
toggle that opens the latest-post dropdown (`.pb-feed-latest` / `.latest-update`,
`shared-renderers.js:538-546`) and the full feed panel (`.right-panel-feed`,
`shared-renderers.js:549+`). Responsive handling lives in the aspect-ratio stacked layout
(`main.responsive.css:1` `@media (max-aspect-ratio: 7/5)`; feed resets at lines 128-143 force
`height: auto; overflow: visible`), the portrait branch (`main.responsive.css:179`
`@media (max-aspect-ratio: 5/7)`), and width breakpoints from line 276 down. Fixed dimensions
that fight small screens: 110px thumb column (`10b:338`), 120px item media height (`10b:366-372`),
`padding-bottom: 60px` on the scroll body (`10b:331`), 46px bar with 3-column grid (`10b:192-204`).

**Approach.**

1. Reproduce first: audit at real viewports (tablet portrait ~768×1024, phone ~390×844 —
   `playwright.config.js` device profiles) on a builder page and a legacy page; catalog what
   overflows/misfits (item width, dropdown height, dead padding, touch-target size).
2. Fix in the responsive layers: cap the open dropdown to the viewport
   (`max-height` + internal scroll instead of unbounded `height: auto`), let the thumb column
   shrink (`minmax`/smaller fixed width at narrow widths), remove the 60px dead padding on
   stacked layouts, keep toggle/exit targets ≥ 44px.
3. Verify feed-mode (panel takeover) separately — it has its own stacked-layout resets
   (`main.responsive.css:128-143`).

**Files.** `assets/css/main.responsive.css`, `assets/css/main.core.10b-right-panel-feed.css`.

**Acceptance criteria.**

- At tablet and phone viewports, opening the feed dropdown never overflows the viewport
  horizontally and scrolls internally rather than growing past the screen.
- No regression at desktop aspect ratios (side-by-side layout).

**Test plan.** Manual viewport pass (or `npm run test:visual` if a snapshot spec is added);
`npm test` stays green. Size: **S–M**.

---

## Phase 4 — Adaptive summary clamping when the feed is short

**Request 5.** When the feed is made shorter, shorten the post summary first instead of
clipping whole elements.

**Current state.** Preview text is clamped at a fixed 3 lines (`.feed-item-preview`
`-webkit-line-clamp: 3`, `10b:449-457`; same pattern for `.latest-preview`). The feed module
accepts a builder-set height (`layout` responsive override, `module-descriptors.js:260`;
layout style applied at `shared-renderers.js:626`), and feed-mode hides overflow
(`10b:292-297`) while the item list scrolls (`10b:326-334`). Net effect: shrinking the module
keeps 3-line summaries and clips/scrolls whole items.

**Approach.** Make the clamp respond to available height, stepping 3 → 2 → 1 lines (and
optionally hiding previews entirely) before any item clips:

- Preferred: CSS container queries — make the feed module a size container and step
  `-webkit-line-clamp` at height thresholds (e.g. `@container (max-height: 420px)` → 2,
  `(max-height: 320px)` → 1). Validate that `container-type: size` coexists with the module's
  flex sizing (`10b:260-309`); this is the phase's main technical risk.
- Fallback: a `ResizeObserver` in `reader/feed-panel.js` setting
  `data-feed-density="cozy|compact|minimal"` on the module root, with CSS keyed to it.

Which mechanism ships is an internal implementation choice made in-phase (confirmed
2026-07-14 — both produce identical visible behavior, so there is nothing to decide at the
product level). Whichever lands, items must end at a clean boundary: summaries shrink first,
then the list scrolls; nothing renders half-cut.

**Files.** `assets/css/main.core.10b-right-panel-feed.css`; `reader/feed-panel.js` only if the
observer fallback is needed.

**Acceptance criteria.**

- Dragging the feed module shorter in the builder visibly reduces summary line count before any
  item is clipped.
- At minimum clamp, further shrinking scrolls the list; no mid-element clipping.
- Full-height feeds keep today's 3-line previews.

**Test plan.** Manual in builder preview at several module heights; a vitest for the density
helper if the JS route is taken; `npm test`. Size: **M**.

---

## Phase 5 — Transparency controls for feed block elements

**Request 2.** Option to change transparency of feed block elements.

**Current state.** The feed style schema is 9 opaque hex colors
(`module-descriptors.js:247-257`) applied inline by the shared renderer
(`shared-renderers.js:485-556`) and `reader/feed-panel.js` (e.g. `itemBorderColor`). Surface
*backgrounds*, however, are hardcoded rgba in CSS: bar `rgba(10,10,18,0.78)` (`10b:202`),
item `rgba(10,10,18,0.75)` (`10b:343`), expanded body `rgba(10,10,18,0.6)`, toggle
`rgba(10,10,18,0.75)` (`10b:374-379`). Native `<input type="color">` can't express alpha.
Precedent for a paired opacity control: the panel background image opacity
(`--panel-bg-opacity`, `main.core.09-side-panels.css:22`).

**Approach.**

1. **Scope (decided 2026-07-14): every background and border color gets a transparency
   slider.** Pair a 0–100 opacity slider with each background color (heading background,
   button background, item background, bar background, dropdown/panel body background) and
   each border color (item border, outer border). Text colors stay opaque. Defaults = today's
   exact rendered values.
2. Renderer converts color+opacity → rgba and emits CSS custom properties on the module root
   (e.g. `--feed-item-bg`); CSS consumes the vars with today's values as fallbacks. Keep the
   admin preview and reader identical by doing the conversion in `shared-renderers.js` and
   `reader/feed-panel.js`'s shared path.
3. Wire the new fields into the feed editor (`module-editor.js`, `feed-style` appearance
   sector, `module-descriptors.js:261`).

**Files.** `admin/page-builder/module-descriptors.js`, `admin/page-builder/module-editor.js`,
`admin/page-builder/shared-renderers.js`, `reader/feed-panel.js`,
`assets/css/main.core.10b-right-panel-feed.css`.

**Acceptance criteria.**

- Every feed background and border color's transparency is adjustable from the feed editor and
  previews live; text colors are unaffected.
- A feed module saved before this phase renders pixel-identical (defaults reproduce current
  rgba values).
- Admin preview and reader render identically.

**Test plan.** `npm test` — extend `tests/shared-renderers-parity.test.js` and the feed cases
in the admin builder suites; manual before/after on an existing published page. Size: **M**.

---

## Phase 6 — Customizable/togglable column glow

**Request 1.** Make the neon glow on columns togglable and customizable.

**Current state.** The glow is stock `.side-panel` chrome:
`box-shadow: 0 0 20px rgba(0,217,255,0.4), inset 0 4px 0 rgba(0,217,255,0.1), 0 8px 0 rgba(0,0,0,0.3)`
(`main.core.09-side-panels.css:10-14`), plus the top accent strip `::before` (lines 25-34,
already suppressible via `.side-panel--custom-chrome`, lines 36-40). There is a working
precedent for a builder glow toggle: reader controls set
`data-reader-controls-glow='off'` from `controls.style.glow === false`
(`reader/data.js:857` → `main.core.15-controls.css:209-218`). Column appearance already flows
through the column/panel inspector (`editor-panel.js`, e.g. background path at line 333) into
`reader/data.js`, which sets the `--panel-bg-*` vars.

**Approach.**

1. Add to the column appearance schema (control set decided 2026-07-14): glow on/off (default
   **on**), **placement** — outside, inside (inset), or both — plus **color**, **intensity**
   (blur radius, optionally with alpha), and **spread** (spread radius). Maps directly to
   `box-shadow: 0 0 <intensity> <spread> <color>` with an `inset` variant for inside glow;
   defaults reproduce the stock shadow stack exactly.
2. Reader applies it where panel chrome is applied in `reader/data.js`: a
   `data-panel-glow='off'` attribute for the toggle and a `--panel-glow-shadow` custom property
   for customization; `main.core.09-side-panels.css` consumes the var with the stock shadow as
   fallback.
3. Scope: the two shell columns (left/right `.side-panel`) first — they're the only elements
   with stock glow. Offering additive glow on inner section columns is a stretch goal, not
   required.
4. Mirror in the builder preview so canvas matches reader (shared appearance plumbing from the
   Builder Customization Roadmap phases).

**Files.** `admin/page-builder/editor-panel.js` (column inspector),
`admin/page-builder/appearance-editor.js` / `appearance-utils.js` (if the shared schema hosts
it), `reader/data.js`, `assets/css/main.core.09-side-panels.css`,
`admin/page-builder/shared-renderers.js` or preview equivalent.

**Acceptance criteria.**

- Column inspector shows the glow controls (toggle, inside/outside placement, color,
  intensity, spread); turning it off removes the neon box-shadow on that column only.
- Default-on preserves today's exact shadow — existing pages unchanged.
- Builder preview matches the reader.

**Test plan.** `npm test` — `tests/reader-data-builder.test.js` (config → DOM attributes/vars),
admin builder suites for the inspector field; manual on/off on a copy of a published page.
Size: **M**.

---

## Phase 7 — Delete uploaded builder images

**Request 7.** Make it possible to delete images uploaded for page builder use.

**Current state.** The backend is already complete: uploads land in `assets/uploads/`
(`POST /api/admin/assets/upload`, `files.py:517`), listing exists
(`GET /api/admin/assets`, `files.py:494`), and a generic admin-gated
`POST /api/delete-image` (`files.py:560`) deletes any `safe_path` file — including
`assets/uploads/` (its media-DB cleanup only triggers for `media/` paths). What's missing is
UI: the shared picker (`admin/image-picker.js:24`, `openImagePicker`) has upload
(`allowUpload`/`uploadHandler`) but no delete affordance.

**Approach.**

1. Add `allowDelete` + `deleteHandler` options to `openImagePicker`; render a per-item delete
   (trash) control in the list pane with an inline confirm step.
2. Add `deleteAsset(path)` next to `uploadAsset` in `admin/page-builder/data.js:209`, calling
   `/api/delete-image`.
3. Enable delete **only** where the item source is the asset library (builder pickers wired in
   `page-actions.js` / `editor-panel.js:1234` / gallery/promo/social/module/header editors) —
   not for entry-image pickers in `admin/posts.js`.
4. **Usage tracking (in scope — decided 2026-07-14):** a backend reference scan that reports
   where each asset is used — string-match asset paths across the serialized page config JSON
   (sections/columns/modules via `page_store`), returned either per-item in
   `GET /api/admin/assets` or from a companion usage endpoint. The picker shows it as extra
   info per asset ("Used on: home, about" / "Unused"), and the delete confirm lists the
   referencing pages explicitly instead of a generic warning.
5. On delete: refresh the item list; if the deleted item was the current selection, clear it.

**Files.** `admin/image-picker.js`, `admin/page-builder/data.js`,
`admin/page-builder/page-actions.js` (+ the editor call sites passing the new flag);
`backend/app/routes/files.py` + `backend/app/page_store.py` for the usage scan.

**Acceptance criteria.**

- From any builder image picker, an uploaded asset can be deleted after a confirm; it
  disappears from the list and from `GET /api/admin/assets`.
- Each asset in the picker shows where it is used; deleting an in-use asset first warns with
  the list of referencing pages.
- Entry-image pickers (Posts) show no delete control.
- Non-admin sessions cannot delete (endpoint already enforces this — verify).

**Test plan.** `npm run test:backend` — extend with usage-scan cases (asset referenced by a
page, unused asset); add a vitest for `deleteAsset` and picker option plumbing if practical;
manual delete + re-upload round trip. Size: **M**.

---

## Phase 8 — Media hero cards, organizable

**Request 8.** Hero cards on the media page — larger tiles for the best images — with the
ability to organize them.

**Current state.** `media.html` renders a uniform card grid (card creation at
`media.html:684-736`, card CSS at 218-305) from `media.json`, which is served from the DB
(`files.py:128`; items normalized in `content_store.py:185-230`). `MediaItem`
(`backend/app/models.py:201-217`) has path/tags/access/premium fields but **no** hero flag and
**no** manual ordering (list is path-sorted). Admin curation lives in `admin/media.js` +
`admin/uploads.js`. `docs/ROADMAP_TO_1.0.md` §2.5 chose "polish media.html in place" pre-1.0 —
this phase is additive curation, not a rebuild, and any card work should keep the future
builder `media-gallery` module parity in mind.

**Approach.**

1. Data: add `hero: bool` (default false) and `sort_index: int` to `MediaItem`; expose both in
   the `media.json` payload and tolerate their absence in `_normalize_media_items`.
   **In-phase check:** find the repo's existing column-migration pattern before touching the
   model (SQLAlchemy `create_all` won't ALTER existing tables; the live DB runs in the Docker
   container).
2. Admin (`admin/media.js`): per-item hero toggle; hero ordering via **up/down** buttons
   (decided 2026-07-14 — no drag-and-drop) persisting `sort_index`.
3. Media page (`media.html`): heroes render first (by `sort_index`), spanning 2×2 grid cells
   (`grid-column: span 2; grid-row: span 2;` + `grid-auto-flow: dense` so the mosaic stays
   tight); premium blur behavior must keep working on hero-sized previews.

**Files.** `backend/app/models.py`, `backend/app/content_store.py`,
`backend/app/routes/files.py` (payload), `admin/media.js`, `media.html`.

**Acceptance criteria.**

- Admin can mark/unmark any media item as hero and reorder heroes; order survives reload.
- Media page shows heroes as larger tiles, first, in the chosen order; non-hero grid unchanged.
- Premium items as heroes still blur/gate correctly.
- With no heroes set, the page renders exactly as today.

**Test plan.** `npm run test:backend` (extend media payload tests); manual grid QA at desktop
and phone widths (heroes must not break the responsive grid). Size: **M**.

---

## Phase 9 — Shareable entry links

**Request 9.** An entry can be shared with a link.

**Current state.** Reader deep-links cover series and page only (`?series=`, `?page=`,
`reader/series.js:22-36`); the entry is pure client state — `state.currentEntry` defaults to
the first entry (`reader/app.js:307-330`) and changes via gallery clicks
(`reader/gallery.js:161-165` → `changeEntryFromOverlays`) or the entry select. Nothing reads or
writes an entry URL param, and there's no share affordance. Entries are keyed by display name
(may contain spaces/case).

**Approach.**

1. **Read:** support `?entry=<name>` — a `getRequestedEntry()` helper in `reader/series.js`
   (decode + trim); on load, after entries resolve, match exact name first, then a
   slug-normalized comparison; apply before first render. If the entry is missing or
   premium-locked for the viewer, fall back to the default entry and let the existing gating
   UX (`applyPremiumGating`) speak.
2. **Write:** keep the URL in sync on entry change via `history.replaceState` (no history
   spam), preserving other params. Skip entirely in builder preview
   (`isBuilderPreviewRequested`, `series.js:55`) so the preview iframe never mutates its URL.
3. **Share affordance (placement decided 2026-07-14):** a share button in the **reader
   controls bar** only — no gallery-card control. `navigator.clipboard.writeText` with a
   fallback, `navigator.share` when available (mobile), confirmed via the existing
   toast/status pattern. The button inherits the controls bar's builder styling (button
   shape/colors, glow toggle) like the existing controls.
4. Note in docs: links carry the entry *name*; renaming an entry breaks old links (accepted for
   now — stable slugs are out of scope).

**Files.** `reader/series.js`, `reader/app.js`, `reader/controls.js` + the controls-bar markup
(`index.html`), possibly `reader/utils.js` (clipboard helper).

**Acceptance criteria.**

- Opening `index.html?series=X&entry=Y` lands directly on entry Y of series X (page 1).
- Changing entries updates the URL without adding history entries; builder preview URLs never
  change.
- The share button in the reader controls bar copies a working link; locked entries degrade to
  the default entry + existing premium messaging.

**Test plan.** Vitest for the entry-param resolution/matching helper (`tests/` alongside the
reader suites); manual: copy link → open in a private window (logged-out premium case
included). Size: **M**.

---

## Phase 10 — Desktop preview fills the whole webpage

**Request 10.** When the desktop preview option is pressed, the preview should take up the
whole webpage instead of rendering in the middle of the page.

**Current state.** All three preview viewports are fixed device rects — desktop is
1920×1080 (`admin/page-builder/preview-contract.js:1-8`). The preview frame is sized to those
exact pixels (`preview-manager.js:309-330`) and then scaled down to fit the canvas area
(`calculatePreviewScale` / `applyPreviewFrameScale`, `preview-manager.js:363-408`), inside
`.pb-preview-container`'s 20px padding (`admin/css/page-builder/canvas.css:146-152`). Net
result: "desktop" renders as a shrunken fixed-ratio box floating in the middle of the canvas
with builder chrome (sidebar, inspector, toolbar) still around it. Existing hooks to build on:
`.page-builder[data-chrome-mode='preview']` already strips canvas padding/background
(`canvas.css:178-181`), and the preview toolbar already has a `hide-device` action
(`preview-manager.js:142`, handled at 581).

**Approach.**

1. Treat `desktop` as **fluid full-bleed** instead of a fixed 1920×1080 rect: frame takes 100%
   of the available width/height, scale locked to 1 (no shrink-to-fit). Tablet/mobile keep
   their fixed device rects and scaling — unchanged. Fluid is also more faithful: the reader's
   breakpoints are aspect-ratio driven, so the preview then matches the admin's real window.
2. Expand to the whole page: while desktop preview is active, collapse the builder chrome
   (reuse/extend `data-chrome-mode='preview'` to hide the sidebar + inspector, not just canvas
   padding) so the frame occupies the full browser viewport.
3. **Exit control (decided 2026-07-14):** keep the existing top-left **Edit** button —
   `#pbRestorePreviewChrome` (`admin/index.html:833-840`), shown in preview chrome mode by
   `syncChromeModeUi` (`admin/page-builder.js:882-896`) and already floated
   `position: absolute; top: 10px; left: 10px; z-index: 30`
   (`admin/css/page-builder/layout.css:105-112`). No new exit chrome. It must stay visible and
   clickable when the preview truly fills the window — verify its stacking context sits above
   the full-bleed frame/iframe and that the iframe never captures its clicks.
4. Keep the measurement/overlay math honest: `frame.dataset.viewportWidth/Height` feed
   coordinate transforms (`preview-manager.js:93-94`, 127) — with a fluid frame these must fall
   back to live `clientWidth/clientHeight` (the fallback already exists; verify every
   consumer, including the debug/target overlays and `applyPreviewIframeSize` at 411).
5. Responsive-override bindings key off `deviceId`, not pixel width — confirm the
   `desktop` binding still resolves identically (`tests/admin-page-builder-preview.test.js`,
   `admin/page-builder/responsive-overrides.js`).

**Files.** `admin/page-builder/preview-contract.js`, `admin/page-builder/preview-manager.js`,
`admin/css/page-builder/canvas.css`, possibly the chrome-mode toggle in
`admin/page-builder.js`.

**Acceptance criteria.**

- Pressing desktop preview fills the entire browser window with the preview (no centered box,
  no visible builder chrome) except the top-left **Edit** button, which stays visible above the
  frame; pressing it restores the editing layout exactly.
- Tablet and mobile previews behave exactly as today (fixed rect, scaled, centered).
- Selection/hover overlays and drop targeting stay pixel-accurate in fluid desktop mode.

**Test plan.** `npm test` — update `tests/admin-page-builder-preview.test.js` viewport/scale
expectations; manual: enter/exit desktop preview at several window sizes via the Edit button,
verify overlays align. Size: **S–M**.

---

## Phase 11 — Column height editable; selection wraps the whole column

**Request 11.** Make the height of a column actually editable. The selection logic treats the
column as a box *inside* the column — the selection should go around the whole column, border
and all.

**Current state.** The user's diagnosis is literally how it's built:

- For reader-owned panels, appearance (background/border — the visible bordered "column") is
  painted on the `<aside>` shell via `applyPanelShellAppearance`, while the builder markers and
  inline layout style (padding/min-height/alignment) go on an **inner wrapper**
  (`renderPanelColumnWrapper`, `reader/data.js:1136-1180` — the comment states the shell "is
  what the user sees as 'the panel'").
- The preview bridge resolves and measures column targets by that inner marker
  (`[data-builder-column-index]`, `reader/preview-bridge.js:373-374`;
  `measureTarget`/`getBoundingClientRect` at 273-293). So the selection box hugs the inner
  wrapper — inside the shell's 4px border — exactly "a box inside the column".
- Height editing has the same split: the only control is per-column `minHeight`
  (`admin/page-builder/editor-panel.js:244`, plus section `minHeight` at 487-488), and it lands
  on the inner wrapper, while the shell itself is `height: 100%`
  (`assets/css/main.core.09-side-panels.css:66-69`) — so editing the value doesn't visibly
  resize the bordered panel.

**Approach.**

1. **Selection bounds:** when a column target belongs to a reader-owned shell panel, measure
   and outline the shell — e.g. resolve the visual element as
   `markerEl.closest('.side-panel') ?? markerEl` in the bridge's measure path (section columns
   have no shell and keep current behavior). Apply the same mapping to hit-testing
   (`findTargetFromEventTarget`, `preview-bridge.js:295+`) so clicking the border/edge region
   of the shell selects the column instead of falling through to the section/page.
2. **Height that works (decided 2026-07-14):** no new inspector field — fix the existing
   `minHeight` so it drives the *visible* column. For reader-owned panels, forward the resolved
   column `minHeight` onto the `<aside>` shell (alongside `applyPanelShellAppearance`); an
   authored value then grows the bordered panel past its stock `height: 100%` (min-height wins
   over height). An empty value keeps today's stretch behavior exactly. In-phase check: verify
   the forwarded value composes with the section-min-height + column-alignment path from the
   consolidation plan ("panels shorter than the section") rather than fighting it.
3. Keep the drop-placement and droppable-panel invariants intact (markers stay where the
   structural commands expect them; only the *visual* resolution changes).
4. Verify the responsive-override path (per-device column settings,
   `getEffectiveColumnSettings`) forwards the per-device `minHeight` to the shell too.

**Files.** `reader/preview-bridge.js`, `reader/data.js` (shell styling application),
`assets/css/main.core.09-side-panels.css` if the shell sizing rule changes;
`admin/page-builder/editor-panel.js` only if the min-height hint text needs updating (no new
field).

**Acceptance criteria.**

- Selecting a shell column draws the outline around the full bordered panel (border included),
  and clicking anywhere on the panel — border region included — selects it.
- Editing the existing column min-height visibly resizes the bordered panel in preview and on
  the published page; clearing it restores today's stretch behavior. No new inspector field.
- Section (non-shell) columns keep current selection behavior; drop targeting and the
  right-panel-droppable invariant are unregressed.

**Test plan.** `npm test` — `tests/reader-data-builder.test.js` (height lands on the shell),
`tests/admin-page-builder-canvas-mutations.test.js` / structural-commands suite for targeting;
manual: select/resize both shell panels and a middle section column on a copy of a published
page. Size: **M**.

---

## Phase 12 — Phone page-scroll must not turn comic pages (bug fix)

**Request 12.** Scrolling up or down the page on a phone also changes the comic page. It
already works correctly on tablet but is broken on phone.

**Current state.** Page turns can fire from three touch-adjacent paths:

- **Swipe classifier** on pointer release (`reader/pointer.js:202-216`): ≥ 50px horizontal
  delta, horizontally dominant (`|dx| > |dy|`), within 500ms
  (`CONFIG.SWIPE_THRESHOLD`/`SWIPE_TIMEOUT`, `reader/config.js:68-71`) → `prevPage`/`nextPage`.
  A true vertical scroll should fail the dominance check — see next bullet for why it may not.
- **`pointercancel` is routed to the same `onPointerUp` handler** (`pointer.js:46`). The stage
  and viewport declare `touch-action: pan-y` (`main.core.12-stage-pages.css:22`,
  `main.core.11-viewport.css:17`), so when the browser takes over a vertical page scroll it
  ends the pointer stream with `pointercancel` — whose coordinates are implementation-defined
  (some engines report the last position, others `0,0`). With zeroed coordinates, a scroll
  that started right of the stage's left edge computes as a fast "horizontal swipe" and turns
  the page. **Prime suspect**, and consistent with the phone/tablet split: on the phone's
  stacked layout the document is scrollable and the stage fills most of the first screen, so
  scrolls routinely start on the stage; plus phone/tablet browsers differ in cancel-event
  coordinates. Reproduction must confirm.
- **Edge-zone tap buttons** (`el.edgeLeftBtn`/`edgeRightBtn` click → `prevPage`/`nextPage`,
  `reader/app.js:790-803`), 12% of viewport width each (`EDGE_ZONE_THRESHOLD`,
  `reader/config.js:65`; 18% wide on stacked layouts, `main.responsive.css:173-175`). The
  buttons declare no `touch-action` of their own (`main.core.14-edge-zones.css:2`), and
  click-after-scroll suppression on them is unverified.

**Approach.**

1. Reproduce first on a real phone (or DevTools touch emulation) with temporary logging to
   identify which path actually fires. Then harden **all three** regardless:
2. Treat `pointercancel` as gesture **abort**: give it its own handler that clears pointer
   state and never runs the tap/swipe logic, instead of aliasing it to `onPointerUp`.
3. Add a scrolled-document guard: record `window.scrollY` (and the nearest scroll container's
   offset) at `touchStart`; on release, if the page scrolled more than a few px during the
   gesture, skip swipe and tap handling entirely.
4. Declare `touch-action: pan-y` on the edge-zone buttons and verify no synthetic click fires
   after a scroll that starts on them.
5. Only if reproduction shows genuine diagonal-flick misfires: tighten dominance for coarse
   pointers (e.g. require `|dx| > 1.5 × |dy|`). Not otherwise — don't make deliberate swipes
   harder.

**Files.** `reader/pointer.js`, `reader/app.js` (edge-zone click guard, if needed),
`assets/css/main.core.14-edge-zones.css`.

**Acceptance criteria.**

- On a phone (stacked portrait layout), vertical scrolling that starts anywhere over the
  reader — stage, viewport, or edge zones — scrolls the page and never changes the comic page.
- Deliberate horizontal swipes still turn pages on both phone and tablet; edge-zone taps still
  work; double-tap fit, pinch zoom, and fullscreen tap behavior are unregressed.
- Tablet and desktop behavior unchanged.

**Test plan.** Extract the release-gesture classification into a pure helper and cover it with
vitest (vertical-scroll release, cancel-with-zero-coords, scrolled-document guard); manual
on-device pass on phone and tablet; `npm test`. Size: **S–M**.

---

## Verification gates (per phase)

- Frontend: `npm test` (vitest), `npm run lint`; visual passes via `npm run test:visual` where
  a spec exists.
- Backend phases (7, 8): `npm run test:backend`; restart the API container after backend
  changes (`docker restart bwondercomics-bwondercomics-api-1`).
- Cross-cutting: the pre-commit checklist in `docs/DEVELOPER_QUICK_REFERENCE.md` when a phase
  is committed.
- Every phase: manual before/after on one published page (`battle-bros` or `prisonplanet`) to
  prove the no-default-change rule.

## Open questions

None — the 2026-07-14 answers resolved all of them; see **Confirmed decisions** and the dated
notes inside each phase. One standing default worth restating: Phase 6's glow controls apply
to the shell panels first (they're the only columns with stock glow); the same schema can
extend to inner section columns later if wanted.
