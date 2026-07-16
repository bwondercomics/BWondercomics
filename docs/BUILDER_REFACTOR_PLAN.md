# Builder Refactor Plan — Structural Cleanup of the Page Builder

Status: **Implementation complete through Phase G** (updated 2026-07-16). Phases A–E are
committed in `84a5a1c`, Phase F is committed in `e2f1dc9`, and the verified Phase G package is
applied in the working tree pending commit.

- Phase A note: the store was added as the confirmed plain-object design;
  `previewWidth`, `selectedTarget`, `builderOpen`, and `linkablePages` are computed getters on
  the store; `editor-panel.js` now reads `state.linkablePages` where its bag previously
  supplied `pages`.
- Phase B note: draft-manager now owns the five drafts plus `activeModuleDraftId` and
  `activeSectionId`, the dirty scope, and the undo stack (constructed internally from
  `undo-stack.js`, whose contract is unchanged). The store exposes them as read-only getters,
  so all `state.*` reads still work; writes go through the manager API. The shell keeps thin
  delegates (`markDirty`, `clearDirty`, save/discard/undo/redo) so no factory wiring contract
  changed. Shell-owned side effects (footer UI, inline-edit sync, preview snapshot refresh,
  section save/discard) are draft-manager actions. `markDirty(scope, { fromInlineIframe })`
  absorbs the old `markInlineModuleDraftDirty` variant.
- Phase C note: all four slices extracted, full suite green after each —
  `inline-edit.js` (227 lines, owns `inlineEditState`), `chrome-mode.js` (240, owns
  `canvasMode`/`editorChromeMode`/restore state), `section-settings-editor.js` (421, mutates
  the manager-owned section draft in place), `selection.js` (388; selection fields stay raw
  on the store because several bags write them — the controller writes via setter actions).
  **Deviation:** the shell landed at ~1,790 lines, not the ~800 this phase targeted — the
  four slices removed ~1,010 lines but ~640 lines of factory wiring bags plus bootstrap
  (`initPageBuilder`), page templates, reader-binding updates, delete flows, and canvas
  render orchestration remain. The ~800 figure was optimistic; remaining candidates if
  further shrink is wanted: page-template application, reader-binding update flow, the
  add-page modal block inside `initPageBuilder`, and the canvas render trio.
- Phase D note: `module-editor.js` went 1,747 → 807 lines and dispatches through
  `module-editor-registry.js` (entry contract documented there); no editor-kind switches
  remain. Nine new editor files (`header-module-editor`, `text-editor`, `image-editor`,
  `spacer-editor`, `html-editor`, `email-signup-editor`, `feed-editor`,
  `media-gallery-editor`, `shell-chrome-editor`) plus entries added to the eight existing
  ones. The stranded promo/social draft binders moved into their editor files, and the
  **dead legacy binders** there (`bindPromoEditorEvents`/`collectPromoConfig`,
  `bindSocialEditorEvents`/`collectSocialConfig` — pre-draft-lifecycle, zero consumers)
  were deleted. Small deviation from the acceptance wording: adding a module type touches
  descriptor + editor file **+ one registration line** in the registry map.
  `inspector-sections.js` gained the `renderInspectorCard` shorthand the new files share.
- Phase E note: the recomputed closure matched the audit exactly (13 files) and moved to
  `shared/page-builder/`; 57 importers across `admin/`, `reader/`, and `tests/` were
  rewritten mechanically. `tests/shared-kernel-boundary.test.js` now enforces both
  boundaries (shared→admin/reader and reader→admin). The lint script gained `shared/`.
  Verified with the full vitest suite, `npm run build`, and both visual specs (21
  playwright tests) against the running backend. Other docs' file references to
  `admin/page-builder/<kernel file>` paths (e.g. the polish backlog's reading map) are
  now stale — re-verify per those docs' own instructions. Deployment correction
  (2026-07-16): Caddy now serves `/shared/page-builder/*` from repo source so the source-served
  admin can load the moved kernel; `tests/shared-kernel-boundary.test.js` guards that route, and a
  live headless login smoke test confirmed the admin submits to `/api/login` again.
- Phase F note: `builder_security` is now a nine-module package (primitives, links, html,
  appearance, reader, responsive, structure, header, modules — a verified DAG; the split
  moved `sanitize_section_responsive` into structure and `sanitize_module_responsive` into
  modules to break two cycles) whose `__init__` re-exports every prior name, so no importer
  changed. `reader_bindings.py` owns the page-scope/binding-role vocabulary,
  `PageBuilderValidationError`, and the reader-binding invariants; `page_store.py`
  (1,168 → 985 lines) re-exports them. The parity fixture is a single file,
  `tests/fixtures/builder-config-parity.json` (not a directory as planned): 18 module-config
  cases with Python-sanitized expected outputs, 17 HTML sanitizer samples byte-identical
  across both implementations (one entity-re-escaping sample dropped — happy-dom's
  innerHTML serializer under-escapes text nodes; real browsers match Python), plus the
  module-type/device-id/HTML-allowlist contracts. `shared/page-builder/sanitize.js` now
  exports its tag sets for the JS test. Verified: 131 backend tests, 665 vitest tests,
  lint, API container restarted and healthy.
- Phase G note (2026-07-16): item 1 was already present at implementation time — the shell's
  `runCommand` delegates only to `commandRegistry`, and all structural command IDs are registered
  there as adapter-backed definitions. Item 2 moved the pure placement API to
  `header-placement.js`; the DOM editor no longer exports model mutations. Item 3 moved the shared
  shell harness to `tests/helpers/admin-page-builder-shell.js` and split all 116 unchanged tests
  across eight behavior-focused shell suites; roadmap-phase describe names were replaced with
  behavior names. The item 4 live audit was clean for `02`, `battle-bros`, and `prisonplanet`.
  It also found an inactive series whose ID and title were literally `null`, containing only
  isolated test data. After a fresh database backup, exact dependency-count preconditions, and a
  comment/filesystem check, that series and its cascaded test records were permanently deleted;
  post-delete verification left only the three real series. Normal reader startup fallback
  branches were already retired by Builder Plan Phase 8, so the audit found no reader source
  deletion remaining for this phase.
  Verified: targeted Phase G suites (158 tests), full Vitest suite (666 passed, 1 skipped),
  `npm run lint`, `npm run build`, targeted Prettier check, and `git diff --check`.
  Created: 2026-07-14. Implemented on `builder-incremental-improvement`; cited discovery-time
  line numbers below are retained as historical context, while the completion notes describe the
  final file layout.

Phases are **lettered (A–G)** to avoid collision with the numbered phases in
`docs/POLISH_BACKLOG_PLAN.md` — "refactor Phase B" and "polish Phase 2" are different things.

Related docs:

- `docs/POLISH_BACKLOG_PLAN.md` — the feature/fix backlog. Polish phases may interleave with
  this plan; see **Sequencing against the polish backlog** below for conflict notes.
- `docs/BUILDER_CUSTOMIZATION_ROADMAP.md` — completed roadmap whose phases produced today's
  file layout (descriptor registry, per-module editors, command layer). This plan finishes
  several migrations that roadmap started.
- `docs/ROADMAP_TO_1.0.md` — §10 flags `admin/index.html` (~2,500 lines) as a candidate for a
  later SPA refactor; that is **out of scope** here.
- `docs/DEVELOPER_QUICK_REFERENCE.md` — pre-commit checklist; run the relevant gates per phase.

## Purpose

Behavior-preserving structural refactor of the page builder. **No user-visible changes in any
phase.** The proof standard for the frontend phases is that the existing shell integration
suite (`tests/admin-page-builder-shell.test.js`, 117 tests pinning behavior at the shell
boundary) passes unchanged — test edits limited to import paths are allowed, assertion changes
are not (except where a phase explicitly says otherwise).

## Audit summary

Inventory (2026-07-14): ~27k source lines — `admin/page-builder.js` (3,055) + 58 modules under
`admin/page-builder/` (~18k) + ~3k builder CSS + ~3.7k backend Python — and ~20k test lines.

The module layer is in better shape than the file count suggests: the import graph is cleanly
layered with no cycles, `module-descriptors.js` is a real registry (18 module types),
`shared-renderers.js` renders identically for admin preview and the live reader, and parity is
test-enforced. The debt is concentrated:

| #   | Finding                                                                                                                                                                                                    | Phase |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 1   | `createPageBuilder` god closure: ~45 mutable closure vars, ~120 inner functions, and seven hand-rolled `getState` bags (one per factory) that drift when state is added                                    | A, C  |
| 2   | Draft management split-brain: `draft-manager.js` exists, but the shell still owns snapshots, dirty tracking, undo/redo, and five separate `active*Draft` vars                                              | B     |
| 3   | `module-editor.js` (1,747 lines): editor-registry migration stopped halfway — 18-case switch remains, and promo/social bind functions are stranded outside their editor files                              | D     |
| 4   | Shared kernel lives under `admin/`: the reader imports 7 builder modules (13 with transitive deps) from `../admin/page-builder/` with nothing marking the boundary                                         | E     |
| 5   | `backend/app/builder_security.py` (1,761 lines, ~90 sanitizers) mirrors the JS config schemas with no cross-language parity test; HTML allowlists duplicated in `sanitize.js` can drift silently           | F     |
| 6   | Smaller: dual command entry points, pure header-placement model mixed into a DOM module, reader-binding invariants buried in `page_store.py`, phase-named test describes, pending legacy-header retirement | F, G  |

## Confirmed decisions

| Date       | Decision                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------ |
| 2026-07-14 | Phase F uses **no schema codegen** for JS↔Python config duplication; the shared JSON parity fixture catches drift. |
| 2026-07-14 | Phase A uses a **plain object + explicit update helpers**, with no framework or pub/sub layer.                     |
| 2026-07-15 | Phase E uses `shared/page-builder/` for the reader/admin shared kernel, enforced by a boundary test.               |

## Compatibility rules (apply to every phase)

- **Zero behavior change.** Published pages (`battle-bros`, `prisonplanet`, PYRE `02`) must
  render byte-identically; admin workflows must behave identically.
- Shell suite passes unchanged (import-path edits only) for Phases A–D; Phase E additionally
  touches import paths across reader tests.
- `shared-renderers.js` stays the single markup source for admin preview and reader — parity
  guarded by `tests/shared-renderers-parity.test.js` and
  `tests/visual/builder-preview-parity.spec.js`.
- Reader imports from `admin/page-builder/` must keep resolving until Phase E moves them; no
  other phase may move or rename a reader-imported file.
- No DB schema changes anywhere in this plan.
- No API contract changes; backend phases are internal file moves plus added tests.

## Sequencing against the polish backlog

- Phases A–C rewrite large spans of `admin/page-builder.js`; polish phases that touch the
  shell (polish 10, 11) should land **before A starts or after C lands**, not in between.
- Phase D rewrites `module-editor.js` internals; polish 5 (feed transparency controls) adds
  feed-editor fields there — coordinate whichever goes second.
- Phase E renames files imported by nearly everything; schedule it when no other branch is
  mid-flight.
- Phases F–G are independent of the polish backlog.

## Reading map

| Area                        | Files                                                                                                                                                                                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shell closure + wiring      | `admin/page-builder.js` (state vars 108–154, factory wiring 170–728)                                                                                                                                                                                                                       |
| Draft lifecycle             | `admin/page-builder/draft-manager.js`, shell draft/undo functions `admin/page-builder.js:950-1166`, `admin/page-builder/undo-stack.js`                                                                                                                                                     |
| Feature slices to extract   | inline edit `admin/page-builder.js:1168-1365`, chrome/preview mode `:1739-1876`, section settings `:1922-2317`, selection `:2318-2596`                                                                                                                                                     |
| Module editor registry      | `admin/page-builder/module-descriptors.js`, `admin/page-builder/module-editor.js:948` (switch), per-module editors (`button-editor.js`, `promo-editor.js`, `social-editor.js`, `reader-editor.js`, `gallery-editor.js`, `divider-editor.js`, `video-editor.js`, `entry-gallery-editor.js`) |
| Shared kernel (reader-used) | `shared-renderers.js`, `helpers.js`, `header-config.js`, `appearance-utils.js`, `reader-config.js`, `responsive-overrides.js`, `responsive-css.js` + transitive: `layout-utils.js`, `link-utils.js`, `promo-renderer.js`, `sanitize.js`, `module-descriptors.js`, `preview-contract.js`    |
| Command layer               | `admin/page-builder/commands.js`, `structural-commands.js`, registry-only shell delegate in `admin/page-builder.js`                                                                                                                                                                        |
| Header placement model      | `admin/page-builder/header-placement.js` (pure placement lookup/mutations); `admin/page-builder/header-editor.js` (DOM rendering/event binding)                                                                                                                                            |
| Backend validation          | `backend/app/builder_security.py`, `admin/page-builder/sanitize.js` (allowlists both sides)                                                                                                                                                                                                |
| Backend store               | `backend/app/page_store.py` (reader-binding invariants ~253–390)                                                                                                                                                                                                                           |
| Test harness                | eight `tests/admin-page-builder-*-shell.test.js` suites, `tests/helpers/admin-page-builder-shell.js`, `tests/helpers/admin-fixture.js`, `tests/helpers/contracts.js`                                                                                                                       |

---

## Phase A — Central state store in the shell

**Finding 1 (wiring half).** `createPageBuilder` declares ~45 mutable closure variables
(`admin/page-builder.js:108-154`). Lines 170–728 wire seven factories (`draftManager`,
`renderEditorPanel`, `canvasMutations`, `bindCanvasEvents`, `pageActions`, `previewManager`,
`structuralCommands`), each receiving its own hand-picked `getState: () => ({ ... })` snapshot
plus an `actions` bag of callbacks (example: `admin/page-builder.js:592-628`). Adding one state
field means auditing seven bags for drift; several fields are aliased (`previewWidth` mirrors
`activeDeviceId`).

**Approach.**

1. Introduce a single `state` object holding today's closure variables, with a thin accessor
   (`getState()` returning the object, plus targeted setters only where factories currently
   receive them, e.g. `setActiveDeviceId`). Plain object — no framework, no subscriptions.
2. Convert closure-variable reads/writes inside the shell mechanically (`selectedModuleId` →
   `state.selectedModuleId`).
3. Pass the **same** store to every factory; delete the per-factory snapshot bags. Factories
   already treat `getState()` results as read-only snapshots, so widening what they can see is
   safe; the `actions` bags stay as-is in this phase.
4. Remove the `previewWidth`/`activeDeviceId` alias in the process (keep the setter shim if the
   preview manager depends on the name).

**Files.** `admin/page-builder.js` (dominant); factory signatures in `draft-manager.js`,
`editor-panel.js`, `canvas-mutations.js`, `canvas-events.js`, `page-actions.js`,
`preview-manager.js`, `structural-commands.js` only if their destructuring needs adjusting.

**Acceptance criteria.**

- No per-factory `getState` object literals remain in `admin/page-builder.js`.
- Shell suite, preview suite, and structural-commands suite pass with zero assertion changes.

**Test plan.** `npm test` unchanged is the gate; one manual builder session (select, edit,
undo, device switch, save) on a scratch page. Size: **M**.

---

## Phase B — Draft lifecycle consolidation into draft-manager

**Finding 2.** Draft state has two owners. `createDraftManager` (`draft-manager.js`, 453
lines) stages structural edits, but the shell still owns `getDraftSnapshot` /
`setDraftSnapshot` / `applyDraftHistorySnapshot` / `markDirty` / `clearDirty` / undo-redo
plumbing (`admin/page-builder.js:950-1166`) and five parallel draft variables
(`activeModuleDraft`, `activeThemeDraft`, `activeHeaderDraft`, `activePageSettingsDraft`,
`activeSectionDraft`). Dirty-tracking bugs require reasoning across both files.

**Approach.**

1. Extend draft-manager to own a scope-keyed draft map (`module` / `theme` / `header` /
   `page-settings` / `section`), the dirty scope, and the undo-stack integration
   (`undo-stack.js` plugs in here).
2. Move the shell's draft/history functions into draft-manager; the shell keeps only thin
   delegating calls where UI code (footer buttons, keymaps) needs them.
3. The five `active*Draft` state fields become reads through the draft-manager API; delete the
   raw fields from the Phase A store once no direct writes remain.

**Files.** `admin/page-builder/draft-manager.js`, `admin/page-builder.js`,
`admin/page-builder/undo-stack.js`; `tests/admin-page-builder-draft-manager.test.js` gains the
moved coverage (new unit tests allowed and encouraged here — the shell suite still pins
end-to-end behavior).

**Acceptance criteria.**

- Exactly one owner of draft snapshots, dirty state, and undo history.
- Shell suite passes unchanged, including the "Phase 10 — command, keymap, and draft undo
  foundation" describe block (`tests/admin-page-builder-shell.test.js:6811`).

**Test plan.** `npm test`; manual: edit module → undo → redo → discard → save across module,
header, theme, and section scopes; verify dirty-guard prompts fire exactly as today.
Size: **M–L**. Depends on **A**.

---

## Phase C — Extract feature slices from the shell

**Finding 1 (bulk half).** With the store (A) and draft ownership (B) settled, the remaining
shell functions fall into extractable clusters, already visible as contiguous ranges:

- Inline text editing — `admin/page-builder.js:1168-1365` (~200 lines): iframe payload
  validation, stale-payload guard, draft sync, commit/cancel.
- Chrome/preview mode — `:1739-1876` (~140 lines): editor mode, sidebar mode, device switch,
  enter/exit chrome preview with restore state.
- Section settings editing — `:1922-2317` (~400 lines): section draft fields, column
  count/ratio/field updates, save/discard. This is editor logic living in the shell; it
  belongs beside `editor-panel.js`'s section inspector.
- Selection + canvas targeting — `:2318-2596` (~280 lines): select module/section/column/
  header, relative-target navigation, pending insert targets.

**Approach.** One extraction per PR, in the order above (smallest risk first). Each new module
follows the existing factory convention (`createX({ el, getState, actions, deps })`) using the
Phase A store. The shell shrinks toward wiring + routing + top-level render orchestration;
target under ~800 lines.

**Files.** `admin/page-builder.js`; new `admin/page-builder/inline-edit.js`,
`chrome-mode.js`, `section-settings-editor.js`, `selection.js` (names indicative).

**Acceptance criteria.**

- `admin/page-builder.js` under ~800 lines; each extracted module under ~450.
- Shell suite passes unchanged after every individual extraction, not just at phase end.

**Test plan.** `npm test` after each extraction; `npm run test:visual`
(builder-authoring-workflows spec) at phase end; manual inline-edit and section-column editing
passes. Size: **L** (shippable slice-by-slice). Depends on **A, B**.

---

## Phase D — Finish the module editor registry

**Finding 3.** `module-descriptors.js` defines 18 module types with an `editorKind` field, and
eight per-module editor files exist — but `renderModuleEditorContent`
(`module-editor.js:948`) still switches over 18 editor kinds with header, text, image, spacer,
email-signup, feed, and html editors inlined. `bindPromoDraftEvents` (`module-editor.js:517`)
and `bindSocialDraftEvents` (`:709`) are stranded in module-editor.js even though
`promo-editor.js` and `social-editor.js` exist. `shared-renderers.js` already shows the target
pattern with its `MODULE_RENDERERS` map.

**Approach.**

1. Define an editor-registry map (`editorKind` → `{ renderContent, bindEvents, renderStyle?,
bindStyle? }`), either attached to descriptors or as a sibling registry keyed the same way.
2. Move each inlined case into its own editor file (`header`, `text`, `image`, `spacer`,
   `email-signup`, `feed`, `html`, plus any generic fallback), reusing the shared cards
   (`renderSectionCard`, `collectGenericModuleDraft`, `inspector-sections.js`).
3. Move the stranded promo/social bind functions into their editor files.
4. `renderModuleEditorContent` / `bindModuleEditorEvents` become thin dispatchers; the switch
   is deleted. Shared plumbing (responsive scope card, device-override sections, raw-config
   card) stays in module-editor.js.

**Files.** `admin/page-builder/module-editor.js` (shrinks from 1,747 to a few hundred lines),
`module-descriptors.js`, existing and new per-module editor files.

**Acceptance criteria.**

- No `switch` over editor kinds anywhere; adding a module type requires touching only its
  descriptor + its editor file.
- Shell suite and `tests/module-descriptors.test.js` pass unchanged.

**Test plan.** `npm test`; manual: open every one of the 18 module types in the inspector,
edit one field each, confirm preview updates and save round-trips. Size: **M**. Independent of
A–C (coordinate merge order if C is mid-flight).

---

## Phase E — Move the shared kernel out of `admin/`

**Finding 4.** `reader/data.js` and `reader/page-renderer.js` import seven modules from
`../admin/page-builder/`. Nothing marks these files as dual-use: an admin-only import added to
any of them silently lands in (or breaks) the reader bundle. The transitive closure — the true
kernel — is 13 files: the seven direct imports (`shared-renderers`, `helpers`,
`header-config`, `appearance-utils`, `reader-config`, `responsive-overrides`,
`responsive-css`) plus `layout-utils`, `link-utils`, `promo-renderer`, `sanitize`,
`module-descriptors`, `preview-contract`. Note `module-descriptors` and `preview-contract`
being pulled in via `responsive-overrides` — worth knowing regardless of this phase.

**Approach.**

1. Recompute the transitive closure at implementation time (imports will have shifted).
2. Move the closure to `shared/page-builder/`; update imports in `admin/`, `reader/`, and
   `tests/` (mechanical, codemod-able).
3. Add a guard test asserting no file under `shared/page-builder/` imports from `admin/` or
   `reader/` — this is the boundary the move exists to create.
4. Verify both bundles/pages load; check any build or static-serving config that references
   paths (e.g. `deploy/Caddyfile` rules, script tags in HTML entry points).

**Files.** 13 module moves + import-path updates across `admin/`, `reader/`, `tests/`; possibly
`deploy/Caddyfile` and HTML entry points.

**Acceptance criteria.**

- Reader has zero imports from `admin/`; guard test enforces the new boundary.
- Full suite + both visual specs pass; published pages render identically.

**Test plan.** `npm test`, `npm run test:visual` (both specs — this phase is exactly what
`builder-preview-parity.spec.js` exists for), manual load of a published page and the builder.
Size: **M** (mechanical, wide blast radius). Independent, but schedule when no other branch is
open.

---

## Phase F — Backend split + JS↔Python schema parity fixture

**Finding 5 (+ part of 6).** `builder_security.py` is 1,761 lines / ~90 `sanitize_*` functions
mirroring the JS config shapes. Every new module field is defined three times (JS descriptor
default, JS editor collect/normalize, Python sanitizer). Rendering parity is tested; **schema
parity is not** — the HTML tag allowlists in `admin/page-builder/sanitize.js` and
`_BuilderHtmlSanitizer` (`builder_security.py:392`) can drift with no failing test. Separately,
`page_store.py` (1,168 lines) buries the reader-binding invariants (~lines 253–390, with their
own warning codes) inside general CRUD.

**Approach.**

1. Split `builder_security.py` into a `backend/app/builder_security/` package by domain:
   `primitives` (coercers/clamps), `html`, `links`, `header`, `appearance`, `responsive`,
   `reader`, `modules`, `structure` (layout/section validation). Re-export the public names
   from `__init__.py` so `page_store.py` and routes are untouched.
2. Extract reader-binding logic from `page_store.py` into `reader_bindings.py`.
3. Add a shared parity fixture: one JSON file of sample configs per module type (valid +
   attack cases: script tags, bad URLs, out-of-range numbers). A vitest test runs them through
   the JS sanitizers, a pytest test through the Python ones, both asserting against the same
   expected outputs committed in the fixture. Drift in either allowlist now fails a test.

**Files.** `backend/app/builder_security.py` → package; `backend/app/page_store.py` →
`reader_bindings.py` extraction; new `tests/fixtures/builder-config-parity/*.json`; new tests
in `tests/` and `backend/tests/`.

**Acceptance criteria.**

- `backend/tests/test_page_builder_routes.py` passes unchanged (imports may be updated).
- Parity fixture covers all 18 module types plus header/theme/appearance/responsive, and both
  suites consume the identical file.

**Test plan.** `npm run test:backend`, `npm test`; restart the API container
(`docker restart bwondercomics-bwondercomics-api-1`); save a page of each template type via
the builder against the running backend. Size: **M–L**. Independent.

---

## Phase G — Cleanups

Small, independent cleanup items implemented as one verified Phase G working-tree package.

**Completion note (2026-07-16).** All code work, the live audit, and the audited removal of the
inactive `null` test series are complete. No operational follow-up remains. See the phase note at
the top of this document for exact scope and verification.

1. **Single command entry point.** `runCommand` (`admin/page-builder.js:156-168`) falls back
   from `commandRegistry` to `structuralCommands`. Make the registry the only entry, register
   structural commands into it during init, delete the fallback. Size: **S**.

   **Outcome:** already satisfied at implementation time. The shell delegates only to
   `commandRegistry`; all structural IDs are adapter-backed registry definitions. A focused test
   now guards complete registration.

2. **Header placement model split.** `header-editor.js` (929 lines) mixes pure placement
   functions (`findBlockPlacement:33`, `moveBlockToPlacement:515`,
   `moveBlockAcrossRegions:529`, `moveBlockAcrossRows:543` — imported directly by the shell)
   with DOM rendering (`renderHeaderEditorContent:461`, `bindHeaderEditorEvents:605`). Extract
   the pure model to `header-placement.js`. Size: **S**.

   **Outcome:** complete. `header-placement.js` owns the four pure lookup/mutation functions;
   `header-editor.js` owns DOM rendering and event binding.

3. **Shell test split.** After Phase C, split `tests/admin-page-builder-shell.test.js`
   (7,076 lines) along the new feature seams, and rename the roadmap-phase describes
   ("Phase 6 Step 3 — …" at `:6512`, "Phase 10 — …" at `:6811`) to behavior names. No
   assertion changes. Size: **M**. Depends on **C**.

   **Outcome:** complete. The unchanged 116 shell assertions are distributed across eight
   behavior-focused suites backed by `tests/helpers/admin-page-builder-shell.js`; roadmap-phase
   describe names were replaced with behavior names.

4. **Legacy header retirement.** `fallback-retirement-gate.js` +
   `tests/admin-page-builder-audit.test.js` define when legacy header fallbacks may be
   deleted: every audit bucket at count 0 across all builder pages. Run `auditPagesFallbacks`
   against the **live DB** (backend scripts via
   `docker exec bwondercomics-bwondercomics-api-1 …`) — if clean, delete the reader-side
   fallback branches per the gate's contract; if not, migrate the flagged pages first.
   Negative-line-count refactoring, but gated on production data. Size: **S–M**, plus
   migration time if the audit is dirty.

   **Outcome:** the live audit is complete. `02`, `battle-bros`, and `prisonplanet` are clean.
   The separate inactive `null` series contained isolated test entries and a legacy reader page;
   it was backed up, deleted with audited cascade preconditions, and verified absent afterward.
   Reader startup fallback branches had already been retired by Builder Plan Phase 8, so no
   additional reader code was eligible for deletion.

---

## Historical implementation order

```
Land builder-incremental-improvement
  → A (store)
  → B (drafts)
  → C (slices, one PR each)      D (editor registry) and F (backend) in parallel with A–C
  → G3 (test split)              E (kernel move) in a quiet window
  → G1, G2, G4 anytime
```

A → B → C was the load-bearing sequence. D and F landed alongside that work, E moved the shared
kernel after the main shell/editor refactors, and G closed the remaining independent cleanup.

## Verification gates (per phase)

- Frontend: `npm test` (vitest), `npm run lint`; `npm run test:visual` for Phases C, E, and
  any phase touching `shared-renderers.js`.
- Backend (Phase F): `npm run test:backend`; restart the API container after backend changes
  (`docker restart bwondercomics-bwondercomics-api-1`).
- Phases A–D: the shell suite must pass with **zero assertion changes** — that is the
  behavior-preservation proof, and any needed assertion edit is a signal the phase changed
  behavior and needs review.
- Cross-cutting: pre-commit checklist in `docs/DEVELOPER_QUICK_REFERENCE.md` per committed
  phase.
- Every phase: manual before/after on one published page (`battle-bros` or `prisonplanet`).

## Resolved decisions

1. **Store shape (Phase A):** plain shared object with explicit update helpers and existing
   render callbacks; no subscriptions.
2. **Schema parity (Phase F):** shared JSON parity fixture; no schema code generation.
3. **Kernel directory (Phase E):** `shared/page-builder/`, protected by the shared-kernel
   boundary test.
4. **Legacy-header audit (Phase G):** completed 2026-07-16. The three real series are clean; the
   inactive `null` test series was removed after backup and dependency verification.
