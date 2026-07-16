# Builder Incremental Improvement Plan

Status: Completed — Items 1–3 implemented and verified by 2026-06-24.
Created: 2026-06-20
Revised: 2026-06-20 (folded in contract-review findings on Items 1-3)
Supersedes (as the operative plan): `docs/LIVE_CANVAS_EDITOR_CORRECTIVE_PLAN.md`

## Why this plan exists

The corrective plan (`docs/LIVE_CANVAS_EDITOR_CORRECTIVE_PLAN.md`) is an accurate diagnosis but an
8-phase near-rewrite. We are not running it as a program. The current builder architecture — a
typed page model (`BuilderPage`/`BuilderSection`/`BuilderModule`) rendered into an iframe with an
editor overlay — is sound and worth building on.

This plan keeps the site running and fixes the three highest-value, lowest-risk gaps **one at a
time**. Each item ships independently. The corrective plan is retained only as a reference / future
north star, not a to-do list.

## Working principles

- The site stays live throughout. No change uproots the current model or rendering.
- Each item is independent and shippable on its own. Finish and ship one before starting the next.
- Reuse the existing model, endpoints, sanitization, and validation. No new architecture.
- Each item lands with targeted tests that prove the fix and a clear rollback (revert one change).
- No item is allowed to weaken or delete an existing passing test without explicitly documenting why.

## Order of work

1. **Stop the silent page-end fallback** — smallest, safest, biggest trust win.
2. **Enable module duplicate** — medium; users expect it and it's isolated. (Section duplicate is
   deferred — see Item 2.)
3. **Make empty columns and panels droppable** — largest; do empty columns first, then panels.

Do them in this order. Each is a complete, releasable unit.

---

## Item 1 — Stop the silent page-end fallback

### Problem

A drop into invalid or ambiguous space does not cancel. It silently mutates a different part of the
page: the resolver snaps to the nearest target by distance, and if nothing qualifies it inserts at
page end (which lands _below_ the reader on reader pages). This is the single most trust-destroying
editor behavior.

### What must NOT change (existing tested behavior)

Two existing tests assert intentional behavior and must stay green:

- Dropping the first block onto a **genuinely empty page** (no sections) resolves to a page-end
  placement — `tests/live-drop-placement.test.js` (`falls back to page-end placement for empty
pages`, ~line 151) and `tests/admin-page-builder-shell.test.js` (`creates a section and module
when dragging a block onto an empty live canvas`, ~line 3879).
- A drop over an explicitly invalid target already returns `null`
  (`tests/live-drop-placement.test.js`, ~line 140).

### Where

- `admin/page-builder/live-drop-placement.js`
  - `getCandidateTarget` falls back to nearest-by-distance when the pointer is inside nothing
    (lines ~106-110).
  - `resolveLiveDropPlacement` calls `resolvePagePlacement` (page-end) whenever there is no valid
    containing target (lines ~207, ~215, ~223).
- `runDrop` already treats a `null` placement as a clean no-op, but previously preferred the cached
  drag-over placement over recalculating from the final drop point
  (`admin/page-builder/structural-commands.js`, lines ~259-274).

### The fix

- Keep page-end **only when the page has zero sections** (preserves the tested empty-page first-block
  workflow).
- When sections exist but the pointer is over no valid target, return `null` instead of page-end.
  Remove the nearest-by-distance snap for module insert/move drags.
- Replace the silent "add section at the end of a non-empty page" behavior with an **explicit,
  bounded page-end drop zone** rendered below the final section, so adding a trailing section is a
  deliberate target rather than an inferred fallback.
- Recalculate placement from the final drop coordinates and target geometry; cached drag-over state
  is guide-only and cannot authorize a mutation.
- Preserve legitimate **section reordering**, including moving a section to the end.

### Acceptance

- Dropping a block/module over blank or invalid canvas space (on a page that already has sections)
  performs no network request and no structure change.
- Dropping the first block onto a genuinely empty page still creates a section + module (existing
  tests stay green).
- Adding a trailing section happens via the explicit end zone, not by dropping in dead space.
- Moving from a valid drag-over target into dead space before dropping performs no mutation.
- Dropping over a valid target, and section reorder (including to the end), still work.

### Risk & rollback

- Low. The downstream no-op path already exists. Risk is over-restricting a valid drop or allowing
  the editor-only target to affect preview layout — covered by valid-target, empty-page, stale-drop,
  and visual-parity tests. Rollback: revert the resolver/command and end-zone affordance changes.

### Completed 2026-06-21

- Removed nearest-target snapping and restricted implicit page-end placement to genuinely empty
  pages.
- Added an editor-only `page-end` preview surface with a layout-neutral 40px target and bounded drag
  guide for deliberate trailing insertion on normal and reader-shell pages.
- Made final drop coordinates authoritative so a cached valid drag-over cannot execute after the
  pointer moves into invalid space.
- Verified with `git diff --check`, `npm run format:check`, `npm run lint`, `npm test` (557 passed, 1
  skipped), `npm run build`, and `npm run test:visual` (19 passed).

---

## Item 2 — Enable module duplicate (section duplicate deferred)

### Problem

Duplicate is advertised in the toolbar/commands but stubbed out
(`'Duplicate is not implemented yet.'` in `admin/page-builder/commands.js` ~line 85 and
`admin/page-builder/structural-commands.js` ~line 346), and is shown for every module
(`admin/page-builder/preview-manager.js` ~line 117).

### Eligibility guards (required before enabling)

Duplicate cannot be offered for every target:

- The **Comic Reader** module is a singleton on bound pages — the bound reader page must contain
  _exactly one_ (`backend/app/page_store.py` ~line 297). Duplicating it would make the page
  unpublishable, even though the create path itself permits a second module
  (`backend/app/page_store.py` ~line 905).
- Therefore: **reject duplicate** for the Comic Reader module, and for any module/target that is
  subject to a singleton constraint, _before_ the command runs. The toolbar must not offer duplicate
  for ineligible targets.

### Section duplicate is deferred

Composing section duplication from existing operations (create section → create modules → reorder)
is **not atomic**. The current insertion path can persist a module and then fail reordering
(`admin/page-builder/canvas-mutations.js` ~line 106), so a partial section clone could survive a
failure. We will **not** ship section duplicate as a composed multi-request sequence. It is deferred
until there is an atomic backend clone operation (or a transaction that guarantees all-or-nothing).
A section containing a Comic Reader module would also be ineligible per the guards above.

### The fix (module only, no new backend)

- Duplicate a module by reading its sanitized config, deep-cloning it, assigning fresh IDs, and
  inserting the copy immediately after the original in the same section/column via the existing
  create-module path.
- Reuse existing sanitization so the clone goes through the same contract as a normal insert.

### Acceptance

- Selecting an **eligible** module and choosing Duplicate produces an identical copy directly after
  it, selectable and editable, that survives reload.
- The copy has its own IDs (editing the copy does not change the original).
- Duplicate is **not offered** for the Comic Reader module (or other singleton-constrained targets),
  and choosing it on an ineligible target is rejected cleanly with a status message.
- Section duplicate remains unavailable and is documented as deferred (no half-built clones).

### Risk & rollback

- Medium. Risks are ID collisions / shared references in the cloned config (covered by the
  "editing the copy doesn't change the original" test) and offering duplicate where it would break
  publishability (covered by the eligibility tests). Rollback: re-stub the command.

### Completed 2026-06-21

- Enabled module duplicate through the existing create/reorder APIs with fresh backend module IDs,
  deep-cloned config, exact same-column adjacency, and selection of the successfully placed copy.
- Made current-page module records authoritative for eligibility so missing or spoofed iframe target
  types cannot bypass the Comic Reader singleton guard; section duplicate remains unavailable.
- Added compensating deletion when reorder fails, authoritative page reconciliation when cleanup
  fails, and a fail-visible local fallback when neither cleanup nor reconciliation succeeds.
- Added focused command, canvas-mutation, toolbar, rollback, persistence, and config-independence
  coverage.
- Verified with `git diff --check`, `npm run format:check`, `npm run lint`, targeted Vitest (126
  passed), `npm test` (571 passed, 1 skipped), `npm run test:backend` (81 passed), `npm run build`,
  and `npm run test:visual` (19 passed).

---

## Item 3 — Make empty columns and panels droppable

### Problem

Empty columns and empty left/right reader panels are not reliable drop targets, so authors can't
compose into them from the canvas. (This is the gap behind the Pyre reader-page workflow.)

### Corrected diagnosis

Empty columns are **not** missing as targets:

- Every structural column is already rendered, including empty ones
  (`admin/page-builder/shared-renderers.js`, the per-column render loop ~line 538).
- The bridge already collects and measures `[data-builder-column-index]` markers
  (`reader/preview-bridge.js` ~line 274).

The real gap is **geometry**: an empty `.pb-column` has no editor minimum height, so it collapses to
zero/near-zero height and produces non-visible geometry that the resolver and guide can't use. The
existing `resolveColumnPlacement` already handles an empty column once it has usable geometry
(`admin/page-builder/live-drop-placement.js` ~line 156).

### Panels map to existing reader-section columns (no new persisted entity)

`findPanelModules` in `reader/data.js` (~lines 1000-1021) partitions modules into left/right purely
by `columnIndex` within the reader section (`leftIndex = 0`, `rightIndex = colCount - 1`). Panels are
already reader-section columns, so panel drops resolve to those existing columns.

### Panel invariant (decided)

For a **single-column** reader section, there is no real right-hand column (`leftIndex === rightIndex
=== 0`), and the public path rejects that ownership (`reader/data.js` ~line 1000):

- **Right-panel drops are disabled until the reader section has 2+ columns.** No implicit
  layout/structure change occurs on drop. The author adds a column first.
- Ownership must resolve **identically in edit and public mode** (today the partition forks on
  `builderEditing` and degenerates on single-column layouts), so a panel drop that looks right in the
  editor also renders correctly when published.

### The fix (two sub-steps, separate commits)

1. **Empty columns first** (smaller): give empty structural columns a bounded editor min-height /
   drop affordance in edit mode so they produce visible geometry. Existing target collection and
   `resolveColumnPlacement` then handle the drop. No public-layout change.
2. **Panels second**: resolve left/right panel drops to the reader section's structural columns; add
   panel surface recognition where the bridge currently only knows `page-header`
   (`reader/preview-bridge.js` ~line 43); enforce the right-panel-disabled-until-2-columns invariant;
   unify left/right ownership across edit and public mode.

### Acceptance

- Dropping a block into an empty normal column inserts it there and survives reload.
- Dropping a block (e.g. Feed) into an empty **left** panel inserts into the reader section's left
  column — **without creating a new section** — and survives reload.
- On a 2+ column reader section, the equivalent **right** panel drop works; on a single-column reader
  section, the right-panel drop is rejected (no mutation).
- Public render of the panel matches the editor after reload (no bottom-page gap), and empty
  columns/panels show no editor-only markers in public output.

### Risk & rollback

- Higher than items 1-2 because it touches the shared renderer and the public/edit boundary. Ship
  empty columns and panels as separate commits so either can roll back alone. Rollback: revert the
  affordance/bridge changes; columns/panels return to current behavior.

### Completed 2026-06-24

- Empty structural columns are droppable: the shared renderer floors an empty column to an
  editor-only min-height in builder-editing mode (`buildColumnInlineStyle` + `minHeightFloor` /
  `EDITOR_EMPTY_COLUMN_MIN_HEIGHT` in `admin/page-builder/shared-renderers.js`), producing visible
  drop geometry. Because it is emitted inline it also overrides an authored/responsive
  `min-height: 0`. Public output is unchanged.
- Empty reader panels are droppable by rendering the existing `.pb-builder-panel-column` markers for
  empty panels in edit mode and resolving the drop through the existing column-target path — no new
  bridge surface and no new section. The right panel is droppable only once the reader section has
  2+ columns, gated on the stable `section.layout` (not the device layout).
- Left/right panel ownership in `findPanelModules` resolves identically in edit and public mode, so a
  panel composed in the editor renders the same way when published.
- Panel render eligibility is aligned with the live-drop gate: `divider` now renders in panels (a
  dropped divider no longer persists then disappears), guarded by a drift-guard test that fails if a
  future insertable section-column module is omitted from `PANEL_MODULE_TYPES` (only `reader` is
  intentionally excluded).
- Shipped on `builder-incremental-improvement` as commits `90b1aef` (empty columns) and `3b6fb95`
  (panels + ownership), plus follow-up changes in the same branch addressing the
  divider-eligibility and authored-`min-height: 0` review findings.
- Verified with `npm run format:check`, `npm run lint`, `npm test` (584 passed, 1 skipped),
  `npm run build`, and `npm run test:visual` (19 passed). `npm run test:backend` not run — no backend
  changes.
- Manual Pyre reader-page QA (verification step 6): **PENDING — not yet performed.**

---

## How we verify

For each item, before shipping, run the targeted tests below plus the standard gate.

### Targeted contract tests (per item)

- **Item 1** — `live-drop-placement` + structural commands: empty-page page-end preserved; non-empty
  page over dead space returns `null`; nearest-snap removed; explicit end-zone resolves; final-drop
  revalidation blocks stale placement; section reorder-to-end intact.
- **Item 2** — structural commands / preview-manager: eligible module duplicates with fresh IDs;
  Comic Reader and singleton-constrained targets are rejected and not offered; section duplicate
  unavailable.
- **Item 3** — `live-drop-placement` + `preview-bridge` + reader panel rendering: empty-column drop;
  left-panel drop resolves to the reader column without a new section; right-panel disabled on
  single-column / enabled on 2+ columns; edit/public ownership parity.

### Standard gate

1. The item's targeted tests pass.
2. `npm run format:check` and `npm run lint`.
3. `npm test` and `npm run test:backend` (the latter only if backend changes — items here aim to
   avoid backend changes).
4. `npm run build`.
5. `npm run test:visual` — required for Item 3 (renderer/affordance changes); recommended for
   Items 1-2.
6. Manual check on a real reader page (use Pyre for Item 3).

No phase gates. One item, its targeted tests + the gate, ship.

## Relationship to the corrective plan

`docs/LIVE_CANVAS_EDITOR_CORRECTIVE_PLAN.md` stays in the repo as reference. Its diagnosis informed
these
items. We are deliberately **not** executing its 8-phase program (canonical target tree rewrite,
unified selection state, atomic mutation endpoint, structural undo/redo). If a future need justifies
that scope — for example, an atomic backend mutation endpoint to unblock section duplicate — it can
be reconsidered then, as a separate, explicit decision.
