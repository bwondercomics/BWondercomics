# Reader + Builder QA Worksheet (`0.8.0`)

Use this worksheet for the `0.8.0` reader + builder lock pass. The goal is not to explore new features. The goal is to prove the current reader-first + builder-first shape is stable enough to carry into `1.0.0`.

## Prep

- Run the automated baseline first:
  - `npm test`
  - `npm run test:backend`
  - `npm run lint`
  - `npm run format:check`
  - `npm run lint:py`
  - `npm run format:py:check`
  - `npm run build`
- Test with:
  - Guest session
  - Admin session
  - Premium-capable session if available
  - At least one published builder page
  - At least one draft builder page
  - At least one external/store entry
  - At least one premium/locked entry

## Reader Flows

- [ ] First-load sanity
  - Open the default reader as a guest.
  - Confirm the initial entry, page image, title, status text, and latest update load without visible fallback glitches.
- [ ] Saved progress restore
  - Read forward, refresh, and confirm the reader restores the last entry/page.
  - Switch entries, refresh again, and confirm restoration still targets the right entry.
- [ ] Entry switching
  - Change entries from the custom picker and the native select fallback.
  - Confirm locked entries stay visibly locked for guests.
  - Confirm entry labels and numbering match the active series.
- [ ] Store / external entries
  - Select a store entry.
  - Confirm it opens externally and the reader restores the prior active entry instead of getting stuck on the external item.
- [ ] Premium gating
  - As guest: confirm locked entries are hidden or locked as intended.
  - As premium/admin: confirm premium entries become readable without stale guest UI state.
- [ ] Comments flow
  - Open comments, sign in if needed, and confirm the thread targets the active entry correctly.
  - Change entries and verify the comment target changes with the reader.
- [ ] Gallery and latest update
  - Open the cover gallery and verify visible entries, locked state, and click-through behavior.
  - Confirm the latest update widget renders current data and its feed/media links work.
- [ ] Analytics tracking sanity
  - Navigate pages and entries, then confirm analytics/tracking requests fire without reader errors.
- [ ] Desktop/mobile behavior
  - Desktop: verify fixed-height frame, zoom, fit, fullscreen, and keyboard shortcuts.
  - Mobile/narrow width: verify stacked flow, touch navigation, overlays, and controls visibility.

## Page Builder Flows

- [ ] Page selection and identity
  - Switch between pages in the current series.
  - Confirm the header shows slug, type, homepage state, and published/draft state correctly.
- [ ] Draft / publish / open-reader flow
  - Save a page as draft.
  - Confirm the header warns that `Open Reader` is using the draft preview.
  - Open the reader from the builder and confirm the URL includes `draft=1`.
  - Publish the page and confirm the warning clears and the reader link goes back to the public route.
- [ ] Homepage behavior
  - Mark the intended page as homepage.
  - Confirm only one homepage exists for the series and the page list/header reflect it.
- [ ] Structure editing
  - Add, remove, and reorder sections.
  - Add, move, and reorder modules across columns.
  - Confirm the canvas updates immediately and stays in sync after reload.
- [ ] Explicit-save editing
  - Modify a module, theme settings, and section settings.
  - Confirm dirty-state blocking works and `Save`/`Discard` do what they claim.
- [ ] Page header editing
  - Open both an existing page and a newly created page.
  - Click the header surface in the canvas and change the title, subtitle, and at least one navigation button.
  - Save the header, reload the builder, and confirm the edited values persist in the header editor and the canvas preview.
  - Open the reader from the builder and confirm the same title/subtitle/buttons render there.
- [ ] Builder-page links from the header
  - Add a header button that targets another builder page in the same series.
  - Open the reader and confirm the button routes to `?page=<slug>` for the selected series.
  - Repeat with a URL target and an anchor target to confirm all three link modes still behave correctly.
- [ ] Open-reader verification
  - From a published non-reader page, open the reader and confirm the selected page renders.
  - Repeat for a draft page and confirm the builder warning matches the actual reader route.
- [ ] Series isolation
  - Switch to another series.
  - Confirm page list, homepage state, and builder edits remain scoped to the active series only.

## Issue Log

For each problem found, capture:

- Area: reader, builder, admin, docs, or analytics
- Flow: the checklist item that exposed it
- Severity: blocker, major, minor
- Repro steps: shortest reliable path
- Expected vs actual behavior
- Fix status: open, in progress, fixed, verified

## Exit Criteria

- No blocker remains in reader bootstrap, entry navigation, premium gating, comments, latest update, or builder draft/publish/open-reader flow.
- The worksheet is completed against the current baseline and any discovered issues are either fixed or logged into the roadmap with clear follow-up.
