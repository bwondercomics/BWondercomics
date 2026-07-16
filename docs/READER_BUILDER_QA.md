# Reader + Builder QA Worksheet (`0.8.5`)

Use this worksheet for the reader, builder-customization, responsive-contract, and refactor lock.
The goal is not to explore new features. The goal is to prove the shipped paged/vertical reader,
removable reader shell, responsive layout authoring, and builder-first architecture remain stable
after the 0.8.5 branch merges.

## 0.8.5 Merge Closeout Evidence

The targeted authenticated closeout was completed on Pyre on 2026-07-16 and is recorded in
`docs/completed-builder-plans/BUILDER_CUSTOMIZATION_ROADMAP.md`:

- [x] Panel hide/unhide collapses and restores the real shell.
- [x] Reader-column borders target the outer reader frame and restore the stock frame when cleared.
- [x] Distinct Tablet/Phone reader-control and Feed settings survive save, refetch, and public
      rendering; portrait hardware and rotation back to Desktop layout were checked.
- [x] Popup-arrow placement Save/Discard, Save Page, Publish, and confirmed Unpublish preserve their
      documented persistence/publication boundaries.
- [x] Builder refactor Phases A–G retain the same UI/runtime contracts under the split shell,
      editor registry, shared kernel, backend sanitizer package, and behavior-focused test suites.

The broader unchecked worksheet below remains useful regression coverage; it is not a claim that
every optional 1.0 workflow was manually repeated during the 0.8.5 closeout.

## Prep

- Run the automated baseline first:
  - `npm test`
  - `npm run test:backend`
  - `npm run lint`
  - `npm run format:check`
  - `npm run lint:py`
  - `npm run format:py:check`
  - `npm run build`
  - `npm run test:visual`
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
- [ ] No-reader custom page
  - Open a published custom page with no Comic Reader module.
  - Confirm authored content/header render without stage, controls, comments, side panels, entry
    controls, reader analytics, or reader interaction handlers becoming active.
- [ ] Vertical reader mode
  - Set a reader module to Vertical Scroll and verify all pages render in order on desktop, tablet,
    and phone.
  - Confirm scrolling updates page progress/comments/analytics targets and restores near the saved
    position after reload.
  - Confirm zoom, pan, swipe page turns, and fullscreen remain disabled while entry navigation still
    works.
- [ ] Publication states
  - Confirm drafts never appear publicly.
  - Confirm a future scheduled entry is selectable as Coming Soon but exposes no pages.
  - Confirm the same entry becomes published with pages available after its release time.

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
- [ ] Reader lifecycle and authored content around it
  - On a non-bound page, add/remove a Comic Reader module normally.
  - On the bound reader page, verify deleting/hiding the only active reader warns and publish/binding
    validation rejects an invalid result.
  - Add normal sections above and below the reader module and confirm both admin preview and public
    output preserve the same order without treating them as side panels.
- [ ] Section and column customization
  - Exercise 1, 2, 3, and 4+ column layouts, edit ratios, and style individual columns.
  - Change Tablet/Phone reflow and column visibility while confirming module ownership remains in
    the original global columns.
  - Try to shrink the global column count while a removed column still owns modules and confirm the
    save is rejected with instructions to move/delete them first.
  - Clear the removed columns and confirm the same shrink then succeeds without dropping panel
    settings or module placement silently.
- [ ] Reader customization
  - Save controls placement/size/appearance, stage fit/gap/frame/max-width, panel visibility,
    comments visibility, and display mode.
  - Verify global and Current Device overrides match in the live iframe and public reader.
- [ ] Explicit-save editing
  - Modify a module, theme settings, and section settings.
  - Confirm dirty-state blocking works and `Save`/`Discard` do what they claim.
- [ ] Page header editing
  - Open both an existing page and a newly created page.
  - Click the header surface in the canvas and change the title, subtitle, and at least one navigation button.
  - For a canonical V3 page, confirm no migration banner/chip appears in the editor or canvas.
  - For a known legacy/stale header record, confirm the builder shows the migration warning state, save once, and confirm the warning clears after reload.
  - Save the header, reload the builder, and confirm the edited values persist in the header editor and the canvas preview.
  - Open the reader from the builder and confirm the same title/subtitle/buttons render there.
- [ ] Builder-page links from the header
  - Add a header button that targets another builder page in the same series.
  - Open the reader and confirm the button routes to `?page=<slug>` for the selected series.
  - Repeat with a URL target and an anchor target to confirm all three link modes still behave correctly.
- [ ] Open-reader verification
  - From a published non-reader page, open the reader and confirm the selected page renders.
  - Repeat for a draft page and confirm the builder warning matches the actual reader route.
- [ ] Runtime fallback retirement checks
  - Open a published builder homepage or published `reader` page and confirm the reader renders builder content without any visible legacy-shell flash.
  - Load a missing builder page slug and confirm the reader stays in the intended empty/error-safe state instead of repainting from legacy `page-config.json`.
  - Verify a series with a published `reader` page reports clean audit readiness only when no fallback buckets remain; confirm a series without a published `reader` page still reports the expected blocking state.
- [ ] Backfilled V3 header parity
  - Open a page that was migrated into canonical `page.meta.header.version = 3`.
  - Confirm builder canvas preview and live reader match for title, subtitle, placement, disabled blocks, and navigation button styling.
- [ ] Series isolation
  - Switch to another series.
  - Confirm page list, homepage state, and builder edits remain scoped to the active series only.
- [ ] Inspector density & 280px rail
  - Click the header surface and confirm the retired placement board is absent. Header Parts should
    show five compact visibility rows with copy directing placement edits to the live canvas.
  - Select a header part in the preview, move it with the selected-target toolbar arrows or live
    drag/drop, and confirm the footer reports unsaved changes until saved.
  - Check Pages, Blocks, and Layers tabs for compact rows, visible actions, preserved drag affordances,
    and ellipsis truncation on long page, block, or layer labels.
  - Check Page Settings, Section Settings, Header Settings, Module Settings, Styles, theme panel
    backgrounds, and Appearance rows at the 280px rail; native selects/inputs should remain visible,
    focusable, and bound to their saved values without horizontal overflow.
  - Resize to ≤720px and confirm the footer action buttons still stack full-width while keeping their
    Save/Discard/Publish wiring.
  - Resize to a ≤1099px drawer width and confirm the Placement controls still fit without horizontal overflow.
- [ ] Collapsed-rail behavior (≥1100px)
  - At a wide viewport (the 72px collapse is disabled in the ≤1099px stacked band, which forces the
    sidebar expanded), collapse the sidebar.
  - Confirm the inspector body and its controls are absent from layout and not reachable by keyboard while collapsed.
  - Expand the sidebar and confirm the inspector returns intact and operable.

## Issue Log

For each problem found, capture:

- Area: reader, builder, admin, docs, or analytics
- Flow: the checklist item that exposed it
- Severity: blocker, major, minor
- Repro steps: shortest reliable path
- Expected vs actual behavior
- Fix status: open, in progress, fixed, verified

## Exit Criteria

- No blocker remains in reader bootstrap, shell activation, paged/vertical navigation, publication
  states, premium gating, comments, latest update, responsive columns, or builder
  draft/publish/open-reader flow.
- The worksheet is completed against the current baseline and any discovered issues are either fixed or logged into the roadmap with clear follow-up.
