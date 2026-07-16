# GrapesJS-Class Live Canvas Editor Corrective Plan

Status: Proposed
Created: 2026-06-20
Owner surfaces: `admin/page-builder/`, `reader/`, shared builder renderers, builder backend routes,
and builder tests

## Purpose

The current live builder is not yet a dependable visual editor. It renders the real reader in an
iframe and supports a subset of selection, drag/drop, inspector, and inline-edit behavior, but the
editor contract is incomplete:

- empty panels and empty columns are not reliable targets;
- panel containers are not first-class selectable components;
- column selection is collapsed into section selection;
- a missing or invalid drop target can silently become a page-end insertion;
- duplication is advertised but disabled;
- structural undo/redo is not implemented;
- browser coverage proves a narrow set of successful paths rather than the complete authoring
  experience.

This plan corrects that architecture and establishes a hard release definition for a
**GrapesJS-class editor experience over BWonderComics' typed page model**.

The goal is not to imitate GrapesJS vocabulary or appearance. The goal is to deliver the behavior
authors expect from a real component editor:

- the rendered page is the editing canvas;
- every editable component and container can be selected;
- empty containers remain usable;
- drag/drop lands exactly where the guide says it will;
- canvas, Layers, toolbar, and inspector share one selected component;
- content can be edited through an appropriate direct action or trait inspector;
- structural actions support real undo/redo;
- failed or invalid operations never mutate a different part of the page;
- saved output matches the editor after reload.

This is a corrective replacement for the incomplete live-editor claims in
`completed-builder-plans/INTERACTIVE_LIVE_PREVIEW_BUILDER_PLAN.md` and
`completed-builder-plans/INTERACTIVE_LIVE_PREVIEW_BUILDER_PLAN_P2.md`. Those documents remain
implementation history, but
their completion notes are not sufficient evidence that the editor meets this plan's acceptance
criteria.

## Product Definition and Honesty Boundary

### What “GrapesJS-class” means here

The BWonderComics editor must provide the following capabilities for its supported typed
components:

1. **Component model**
   - Page, header, reader panels, sections, columns, reader stage, and modules have stable editor
     identities.
   - The persisted builder records remain the source of truth.
   - The iframe DOM is an editor view, never the canonical document model.

2. **Canvas interaction**
   - Single click selects the most specific editable target.
   - Hover, selection, insertion, and resize affordances stay aligned with the rendered component.
   - Empty components remain visible and interactive in edit mode.

3. **Blocks and composition**
   - Every insertable descriptor can be dragged into every valid destination.
   - Invalid destinations reject the drag instead of redirecting it.
   - Existing components can be moved and reordered with the same placement rules.

4. **Layers and hierarchy**
   - Layers are a direct representation of the canonical component tree.
   - Selection, hover, visibility, naming, ordering, and nesting stay synchronized with the canvas.

5. **Traits and styles**
   - Selecting a target opens settings that belong to that exact target.
   - Style controls appear only where frontend normalization, backend validation, and shared
     rendering exist.
   - Responsive editing preserves the global structural model.

6. **Commands and history**
   - Canvas, toolbar, Layers, inspector, and keyboard actions call the same commands.
   - Add, move, reorder, duplicate, delete, and layout changes have tested undo/redo behavior.
   - Command failures restore or preserve the previous canonical state.

7. **Persistence**
   - Saving and reloading preserves structure, settings, responsive overrides, and ordering.
   - Public rendering remains free of editor-only markers and placeholders.

### What this plan does not promise

- It does not add unrestricted arbitrary HTML/CSS editing to normal modules.
- It does not add freeform absolute positioning.
- It does not make responsive devices separate page structures.
- It does not make iframe DOM order or content the saved source of truth.
- It does not add the GrapesJS package as a second canonical component/storage model.

Using the GrapesJS runtime would still require custom components, traits, storage adapters, reader
shell adapters, protected-media handling, and migration between GrapesJS project JSON and the
existing `BuilderPage`/`BuilderSection`/`BuilderModule` records. This plan instead applies the
relevant GrapesJS component-editor contracts directly to the existing typed model.

If Phase 0 proves that the current iframe/overlay architecture cannot meet the interaction and
browser acceptance gates without surface-specific exceptions, implementation must stop and produce
an explicit GrapesJS-runtime migration proposal. It must not continue accumulating marker patches
while calling the result complete.

## Trusted References

Checked-in GrapesJS documentation under `docs/website-references/grapesjs-dev` is the architecture
reference:

- `docs/modules/Components.md`
  - the component/model is canonical;
  - the canvas DOM is a view;
  - custom component views may add editor-only interaction without changing exported output.
- `docs/modules/Blocks.md`
  - blocks create typed component definitions;
  - drag/drop restrictions belong to component capabilities, not rendered block HTML.
- `docs/modules/Layers.md`
  - Layers directly represent loaded components;
  - hover, selection, visibility, naming, and sorting are synchronized component state.
- `docs/modules/Traits.md`
  - settings belong to the selected component and can be specialized by component type.
- `docs/modules/Style-manager.md`
  - style controls are restricted by component capabilities.
- `docs/modules/Commands.md`, `docs/api/undo_manager.md`, and `docs/api/canvas.md`
  - commands centralize actions;
  - undo tracks real model changes;
  - canvas spots, coordinates, drag events, refresh, and scrolling are editor concerns.

Current BWonderComics source remains authoritative for persisted data, security, rendering, and
runtime behavior:

- `admin/page-builder/preview-contract.js`, `preview-manager.js`, and `commands.js`;
- `reader/preview-bridge.js` and `reader/data.js`;
- `admin/page-builder/module-descriptors.js`, `sidebar-panel.js`, and `canvas-mutations.js`;
- `backend/app/page_store.py`, `builder_security.py`, and page-builder routes;
- current unit, backend, and Playwright builder tests.

## Current Contract Gaps

These are known implementation gaps that this plan must correct:

1. `BUILDER_PREVIEW_TARGET_KINDS` has page, header, section, column, and module, but no panel target.
2. Reader panel containers receive `data-builder-surface="left-panel|right-panel"`, but the preview
   bridge recognizes only `page-header`.
3. Empty panels have no section/column child marker, so pointer and drop resolution falls through to
   the enclosing page.
4. `resolveLiveDropPlacement(...)` selects the nearest target and uses page-end when no valid target
   exists.
5. Page-end insertion creates a new one-column section, which becomes below-reader content when the
   reader section precedes it.
6. Column selection routes to section selection, so the inspector cannot represent a selected
   column independently.
7. The selected target is reconstructed from several compatibility variables rather than stored as
   one canonical selection.
8. Relative target navigation excludes empty columns and panels.
9. Structural duplicate is disabled.
10. Undo/redo covers explicit local drafts but not persisted structural changes.
11. Existing Playwright drag/drop coverage drops beside an existing text module; it does not prove
    empty panels, empty columns, invalid targets, module movement, rollback, or target-specific
    editing.

## Architecture

### Canonical component tree

Build one editor component tree from the current page snapshot:

```text
page
├── header
├── section
│   ├── column
│   │   └── module
│   ├── reader-stage -> reader module
│   ├── panel:left -> structural left column
│   │   └── module
│   └── panel:right -> structural right column
│       └── module
└── section
    └── column
        └── module
```

Panels and the reader stage are editor roles over canonical section/module records. They do not
introduce a new persisted entity:

- a panel target maps to the reader section plus a stable structural column;
- the reader-stage target maps to the effective reader module;
- modules remain owned by their section and global `columnIndex`;
- device-specific reflow does not change panel or module ownership.

### Canonical target reference

Replace ad hoc target reconstruction with one validated target shape:

```js
{
  kind: 'page' | 'header' | 'section' | 'column' | 'panel' | 'module',
  key: string,
  pageId: string,
  parentKey: string | null,
  sectionId?: string,
  columnIndex?: number,
  panelSide?: 'left' | 'right',
  surface?: 'page-header' | 'reader-stage' | 'left-panel' | 'right-panel',
  moduleId?: string,
  moduleType?: string,
  capabilities: {
    selectable: boolean,
    droppable: boolean,
    draggable: boolean,
    editable: boolean,
    stylable: boolean,
    duplicatable: boolean,
    removable: boolean
  }
}
```

Canonical keys:

- `page:<pageId>`
- `header:<pageId>`
- `section:<sectionId>`
- `column:<sectionId>:<columnIndex>`
- `panel:<sectionId>:left`
- `panel:<sectionId>:right`
- `module:<moduleId>`

The target tree is generated from the page model first. The rendered iframe then associates each
target with an editor-view element for geometry. DOM discovery must not decide whether the target
exists.

### Editor-only views

When `builderEditing` is true:

- render selectable wrappers for every structural column, including empty columns;
- render panel wrappers carrying their reader section and structural column identity;
- render a bounded empty-state drop affordance inside empty panels and columns;
- render an empty-section affordance with select, add-block, move, duplicate, and delete actions;
- preserve module markers for hidden-on-device placeholders;
- remove all editor-only wrappers, placeholders, and markers outside builder editing.

Editor-only views must not affect public page height, panel spacing, responsive layout, or
accessibility tree.

### One selection state

`selectedTarget` becomes the canonical selection. Compatibility fields such as
`selectedModuleId`, `selectedCanvasSurface`, and `activeSectionId` may be derived temporarily while
existing editors are migrated, but no action may update them independently.

Selection rules:

- click resolves to the most specific target under the pointer;
- clicking blank space selects its container rather than a distant ancestor;
- selecting from Layers, canvas, toolbar, breadcrumbs, or keyboard calls `builder:select`;
- hover state is shared between Layers and canvas;
- selection remains stable after rerender if the key still exists;
- if a selected target is removed, selection moves to its nearest surviving parent;
- dirty-draft guards block selection consistently regardless of input source.

### Drop placement contract

Use explicit placements:

```text
before-module
after-module
inside-empty-column
column-start
column-end
inside-panel
section-before
section-after
explicit-page-end
```

Rules:

- a placement exists only when the pointer is inside an explicit valid target or insertion zone;
- panel placement always resolves to the reader section and its structural column;
- an explicit page-end zone is rendered separately below the final section;
- absence of a valid placement returns `null`;
- `null` never mutates the page;
- the visible insertion guide and submitted placement are the same immutable object;
- descriptor `allowedParents` and target capabilities validate both guide rendering and mutation;
- dropping after targets become stale cancels and requests fresh geometry.

### Structural command and undo contract

Replace multi-request structural sequences with an atomic admin mutation endpoint:

```text
POST /api/admin/pages/{pageId}/structure/mutate
```

Request:

```js
{
  operation:
    'insert-module' |
    'move-module' |
    'duplicate-module' |
    'delete-module' |
    'insert-section' |
    'move-section' |
    'duplicate-section' |
    'delete-section' |
    'update-section-layout',
  payload: {}
}
```

Response:

```js
{
  page: {},
  inverse: {
    operation: string,
    payload: {}
  }
}
```

Requirements:

- execute each operation in one database transaction;
- reuse current authorization, reader-binding, layout, module-config, and column validation;
- return the fully serialized canonical page;
- return a validated inverse operation sufficient for session undo;
- preserve stable IDs when restoring deleted modules or sections;
- rollback the complete operation on any failure;
- never require the client to repair partial reorder state.

The builder records successful operation/inverse pairs in a structural history stack. Undo submits
the inverse operation; redo submits the original operation. Structural history is session-local and
clears when page identity changes or an external reload replaces the page.

## Component Editing Behavior

Every target follows the same base interaction:

- single click selects;
- double click runs the descriptor's primary edit action;
- the selected toolbar exposes only supported commands;
- Settings and Styles show controls belonging to the selected target;
- Save/Discard semantics remain explicit where a draft is required.

Required behavior by target/module:

| Target or module | Primary canvas action                                                                 |
| ---------------- | ------------------------------------------------------------------------------------- |
| Page             | Select page; Settings edits metadata; Styles edits theme                              |
| Header           | Select header; title/subtitle support inline editing; nav/placement use inspector     |
| Section          | Select, move, duplicate, delete, add block, edit layout/spacing                       |
| Column           | Select, add block, edit ratio/padding/alignment/appearance/visibility                 |
| Left/right panel | Select, add block, edit enabled state/background/fit/focus/opacity/module spacing     |
| Reader stage     | Select the effective Reader module and open Reader settings                           |
| Text             | Inline rich-text editing synchronized with the module draft                           |
| Image            | Double click opens asset picker; inspector edits alt text, caption, and appearance    |
| Gallery          | Double click opens gallery item manager; inspector edits columns and item metadata    |
| Video            | Double click opens URL/media settings; public playback stays blocked while editing    |
| Buttons          | Canvas item selection supports label/link editing; inspector handles full appearance  |
| Social           | Canvas item selection opens the corresponding social-link settings                    |
| Email Signup     | Selectable preview; primary action opens copy/form settings; submission stays blocked |
| Promo            | Select carousel item from canvas; edit its image/copy/link through the item editor    |
| Feed             | Selectable dynamic preview; inspector edits source/display labels/style               |
| Entry Gallery    | Selectable preview; inspector edits source/filter/columns/labels                      |
| Media Gallery    | Selectable preview; inspector edits source/filter/columns/captions                    |
| Comic Reader     | Select reader stage; inspector edits display, controls, stage, panels, and comments   |
| Spacer           | Selected resize handle adjusts height with draft undo                                 |
| Divider          | Selected quick controls edit style; full controls remain in inspector                 |
| HTML             | Selectable but inspector-only; no unrestricted inline execution/editing               |

Dynamic/public actions such as navigation, form submission, video activation, feed links, and comic
reader controls remain blocked while editing unless the author explicitly enters chrome-collapsed
Preview.

## Phased Implementation

### Phase 0 - Contract Audit and Browser Baseline

Goal: establish measurable truth before changing behavior.

Implementation:

- Inventory every target and insertable module descriptor against the component behavior table.
- Add a diagnostic target-tree view that compares model targets with rendered geometry targets.
- Record current failures for empty left/right panels, empty columns, empty sections, nested module
  selection, invalid drop areas, duplicate, and structural undo.
- Add failing Playwright workflows for the required release scenarios before implementation.
- Confirm the Pyre page is a permanent manual and automated regression fixture for panel behavior.

Acceptance:

- The target-tree diagnostic reports missing, duplicate, stale, and geometry-less targets.
- Each known failure has a reproducible browser test.
- No later phase starts by weakening or deleting these tests.
- If the architecture cannot represent all required targets without hard-coded pointer exceptions,
  stop and produce the GrapesJS-runtime migration proposal described above.

### Phase 1 - Complete Model-Backed Target Graph

Goal: every editable component and empty container exists as a stable target.

Implementation:

- Extend the preview contract with panel targets, parent keys, surfaces, and capabilities.
- Generate the complete target tree from the page model.
- Render editor-only views for empty sections, columns, and panels.
- Associate model targets with iframe elements and emit geometry for all visible targets.
- Make public rendering omit empty section spacing when a section has no effective modules.
- Clear obsolete markers and geometry on snapshot, identity, device, and shell-state changes.

Acceptance:

- Empty and populated left/right panels are independently selectable.
- Every global structural column is represented even when empty or visually reflowed.
- Empty sections are selectable in edit mode and consume no public layout height.
- Target identity remains stable across Desktop, Tablet, Phone, and working-draft rerenders.
- Public output contains no editor markers or placeholders.

### Phase 2 - Unified Selection, Layers, and Inspector

Goal: canvas, Layers, breadcrumbs, toolbar, keyboard, and inspector operate on one target.

Implementation:

- Introduce canonical `selectedTarget` state and migrate all selection commands.
- Implement exact panel and column selection instead of section fallback.
- Add parent/child/sibling relationships to the target tree.
- Add breadcrumbs and complete Select Parent/Next/Previous behavior.
- Rebuild Layers from the same target tree, including panels, empty columns, reader stage, and empty
  sections.
- Synchronize hover and selection bidirectionally between canvas and Layers.
- Route inspector Settings and Styles by target kind and capabilities.
- Add panel-specific and column-specific inspector contexts.

Acceptance:

- Selecting any target from any editor surface produces the same key, outline, breadcrumb, Layers
  row, toolbar, and inspector.
- Clicking blank panel/column/section space selects that exact container.
- Relative selection traverses the visible canonical tree deterministically.
- Dirty drafts block all selection sources consistently.
- Device switching preserves selection when the target remains valid.

### Phase 3 - Deterministic Composition and Drag/Drop

Goal: blocks and existing modules can be composed entirely from the live canvas without accidental
mutations.

Implementation:

- Replace nearest-target fallback with explicit placement-zone resolution.
- Render insertion zones for module edges, column start/end, empty columns, panels, section edges,
  and explicit page end.
- Resolve left/right panel drops to the reader section's structural columns.
- Validate placements from descriptor capabilities before displaying a guide.
- Freeze the accepted placement from drag-over through drop.
- Cancel stale or invalid drops and show a concise status message.
- Support moving modules between panels, columns, and normal sections.
- Support moving and reordering sections through canvas and Layers using the same commands.
- Keep device-specific layouts reflow-only; drag/drop never rewrites placement for only one device.

Acceptance:

- Dropping Feed into an empty Pyre left panel changes no section count and inserts Feed into the
  reader section's left structural column.
- Equivalent right-panel behavior passes.
- Dropping into invalid space performs no request and no mutation.
- The guide always matches the persisted destination and index.
- Drag cancellation, iframe scroll, admin scroll, zoom/scale, device switch, and stale target refresh
  do not produce unintended inserts.
- Canvas and Layers moves persist and reload identically.

### Phase 4 - Component-Appropriate Direct Editing

Goal: the canvas behaves as an editor rather than only a selection screenshot.

Implementation:

- Add descriptor fields for primary edit action, direct-edit fields, toolbar commands, target
  capabilities, and inspector sectors.
- Implement the component behavior table above.
- Extend inline editing from Text to header title/subtitle and safe button/promo label fields.
- Add asset-picker activation for Image and Gallery targets.
- Add item-level selection for composed modules such as Buttons, Social, Promo, Gallery, and header
  navigation without turning nested public DOM into persisted components.
- Add selected resize behavior for Spacer.
- Keep dynamic module interactions blocked in Edit and functional in Preview.
- Ensure side-panel and canvas edits update the same draft and undo history.

Acceptance:

- Every insertable descriptor has a tested primary action.
- Double clicking any supported module performs the documented action.
- Canvas and inspector edits remain synchronized without cursor loss or stale commit overwrite.
- Save persists through existing sanitized module/header contracts; Discard restores hydrated data.
- Unsupported direct editing is explicit and opens the correct inspector instead of doing nothing.

### Phase 5 - Atomic Structural Commands, Duplicate, and Undo/Redo

Goal: structural editing is complete and recoverable.

Implementation:

- Add the atomic structural mutation endpoint and frontend adapter.
- Route add, move, reorder, duplicate, delete, and layout changes through it.
- Implement module and section duplication with deep-cloned sanitized configs/settings and fresh IDs.
- Add structural undo/redo operation and inverse stacks.
- Preserve stable IDs when undo restores deleted records.
- Add command availability and descriptions from selected-target capabilities.
- Remove disabled or misleading toolbar actions.
- Update local state only from the canonical page returned by the mutation.

Acceptance:

- Add, move, duplicate, delete, section reorder, and layout change each undo and redo successfully.
- Multi-record operations are atomic under forced backend failure.
- Undo/redo restores target selection and requests fresh geometry.
- Structural history clears safely on page switch or external page reload.
- No successful command leaves client and backend page structure different.

### Phase 6 - Interaction Quality, Accessibility, and Resilience

Goal: make the editor usable under real pointer, keyboard, viewport, and content conditions.

Implementation:

- Add keyboard navigation through the canonical target tree.
- Add accessible names, roles, focus rings, and status announcements for targets and toolbar actions.
- Add pointer/touch drag thresholds and cancellation behavior.
- Keep overlays and toolbars clamped and reachable at iframe edges.
- Preserve canvas scroll and selected-target visibility across inspector changes.
- Handle long pages, nested content, image/font loading, dynamic module updates, and browser zoom.
- Add visible loading/error states for failed target refreshes and structural commands.

Acceptance:

- Core selection, insertion, movement, editing, Save/Discard, undo, and redo are keyboard reachable.
- Focus never enters blocked public interactions while editing.
- Overlays remain aligned after iframe/admin scrolling, resize, scale, and dynamic content changes.
- Touch/pointer workflows do not trigger accidental navigation or mutation.
- Errors are visible and actionable; the editor never fails silently.

### Phase 7 - Release Gates and Documentation Correction

Goal: prove the complete author workflow before calling the live canvas complete.

Implementation:

- Run the complete unit, backend, integration, visual, and manual QA matrices.
- Use real reader pages with left/right panels, including Pyre, in addition to deterministic fixtures.
- Audit all previous live-builder completion notes against this plan's evidence.
- Add corrective notes to the split live-preview plan identifying which earlier claims were
  incomplete.
- Update durable admin, reader, function, test, and QA docs to describe only verified behavior.
- Keep Structure Debug until this phase passes; after passing, retain it only as a diagnostic view,
  not an authoring requirement.

Acceptance:

- An author can create and edit a complete reader page without using Structure Debug.
- Every release workflow below passes in Chromium at Desktop, Tablet, and Phone.
- The public reader matches the saved editor state after reload.
- No known P0/P1 editor defect remains open.
- The plan receives a dated completion note containing exact verification results and known residual
  limitations.

## Required Browser Workflows

The following Playwright workflows are release blockers:

1. Select page, header, section, empty column, left panel, right panel, reader stage, and module from
   the canvas and verify exact Layers/inspector synchronization.
2. Repeat selection from Layers and verify the canvas outline and scroll-to-target behavior.
3. Drag every insertable descriptor into an empty normal column and verify selection plus reload.
4. Drag Feed into an empty left panel and an empty right panel without creating a section.
5. Move modules between normal columns and reader panels, then reload.
6. Drop over invalid canvas space and verify no network mutation and no structure change.
7. Add, move, duplicate, delete, undo, redo, and reload modules and sections.
8. Edit Text inline; edit header title/subtitle inline; replace an Image through the asset picker;
   edit Button and Promo item content; resize Spacer.
9. Save and discard the same field alternately from canvas and inspector without stale overwrite.
10. Switch Desktop/Tablet/Phone during selection, drag, direct editing, undo, and dirty drafts.
11. Scroll a long iframe and admin canvas while dragging and selecting; verify geometry.
12. Force each structural API failure and verify atomic rollback, visible error, and preserved
    selection.
13. Enter chrome-collapsed Preview and verify public interactions work while editing affordances are
    absent; restore and recover the same selection.
14. Verify empty public sections consume no height and editor-only placeholders never appear
    publicly.
15. Complete the Pyre workflow: remove all left-panel modules, drag Feed into the empty left panel,
    edit it, save, publish, reload the public page, and verify placement and no bottom-page gap.

## Test Matrix

### Contract and unit tests

- target-tree generation for every target kind and parent relationship;
- preview target validation, capabilities, panel fields, and stale identity rejection;
- geometry association for empty and populated targets;
- explicit drop placement and invalid-target rejection;
- descriptor capability and primary-action completeness;
- selection traversal and fallback after target removal;
- command availability and structural history behavior;
- responsive reflow preserving global ownership;
- editor-only placeholder omission from public rendering.

### Backend tests

- authorization and validation for every structural mutation operation;
- atomic rollback on each failure point;
- duplicate sanitization and fresh-ID behavior;
- inverse generation and stable-ID restoration;
- reader-binding safety;
- column/layout validation;
- complete canonical page response after mutation;
- no partial reorder persistence.

### Integration tests

- working-draft target generation;
- canvas/Layers/inspector synchronization;
- module draft and inline-edit synchronization;
- asset picker and composed-item selection;
- target refresh after structural mutation and undo/redo;
- public/editor rendering separation;
- failed-command state preservation.

### Full verification gate

Run in this order:

1. targeted tests for the current phase;
2. `npm run format:check`;
3. `npm run lint`;
4. `npm run format:py:check`;
5. `npm run lint:py`;
6. `npm test`;
7. `npm run test:backend`;
8. `npm run build`;
9. `npm run test:visual`;
10. `git diff --check`;
11. manual Pyre QA.

Passing unit tests without the required browser workflows is not sufficient to complete a phase.

## Completion Rules

- Do not mark a phase complete before its acceptance criteria and browser workflows pass.
- Do not use “implemented” to mean that a button, marker, or command exists without proving the
  author workflow.
- Do not replace a failed target with page-end, section-end, or another valid-looking mutation.
- Do not hide unsupported behavior behind disabled controls without documenting the remaining work.
- Do not remove Structure Debug as a fallback until the live canvas can complete the same structural
  tasks.
- Record failures and residual limitations explicitly in completion notes.
- Treat author-observed failures on real pages as release evidence, not as edge cases dismissed by
  fixture tests.

The corrective program is complete only when the live canvas is the practical editor for the full
supported BWonderComics component model, not merely a rendered preview with selected overlays.
