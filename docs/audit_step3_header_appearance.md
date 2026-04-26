# Audit — Step 3: Header Shell & Header Nav Appearance Controls

## Verdict: **Sound plan, with findings below.**

The plan is well-scoped and correctly aligned with the existing architecture. All core data paths, backend sanitization, and frontend utilities it depends on are already in place. Below are the findings organized by severity.

## Implementation Update (`2026-04-26`)

The Step 3 implementation now resolves the audit findings that were actionable in code. The appearance editor helpers were extracted into `admin/page-builder/appearance-editor.js` with only reusable data/UI helper logic shared; button-specific and header-specific event binding remain local to their editors. Header appearance resolver exports now live in `admin/page-builder/header-config.js`, including an explicit cross-branch resolver for `header.appearance.navItemDefaults` plus `header.nav.items[*].appearance`.

The admin canvas and reader runtime now consume the same header appearance resolvers. The reader installs a single passive scroll listener, applies top/scrolled shell appearance, clears controlled inline styles when navigating to a page without appearance data, removes `data-header-appearance-state` when inactive, and naturally excludes `#adminNavLink` because styles are only applied while creating author-managed nav links. Dedicated coverage lives in `tests/header-appearance.test.js`.

Verification completed with `npm run lint`, `npm test`, `npm run test:backend`, touched-file Prettier check, and a production Vite build. The build output under `dist/` was regenerated locally but remains ignored by git.

---

## ✅ Confirmed Correct

### Backend Sanitization Already Complete

The plan correctly states no backend work is needed. Verified:

- [sanitize_header_shell_appearance](file:///srv/bw-quality/backend/app/builder_security.py#L677-L687) sanitizes `top`, `scrolled`, and `navItemDefaults` via `sanitize_appearance`.
- [sanitize_header_nav_items](file:///srv/bw-quality/backend/app/builder_security.py#L515-L533) sanitizes per-item `appearance` via `sanitize_appearance`.
- [sanitize_header_meta](file:///srv/bw-quality/backend/app/builder_security.py#L488-L512) correctly attaches the shell appearance.
- Round-trip tests exist in [test_page_builder_routes.py](file:///srv/bw-quality/backend/tests/test_page_builder_routes.py#L392-L529).

### Data Contract Matches

The persisted field paths in the plan match the normalizer:

- `page.meta.header.appearance.top` ✓ ([header-config.js:122](file:///srv/bw-quality/admin/page-builder/header-config.js#L122))
- `page.meta.header.appearance.scrolled` ✓ ([header-config.js:123](file:///srv/bw-quality/admin/page-builder/header-config.js#L123))
- `page.meta.header.appearance.navItemDefaults` ✓ ([header-config.js:124](file:///srv/bw-quality/admin/page-builder/header-config.js#L124))
- `page.meta.header.nav.items[*].appearance` ✓ ([link-utils.js:69](file:///srv/bw-quality/admin/page-builder/link-utils.js#L69))

### Existing Utility Readiness

- [mergeAppearance](file:///srv/bw-quality/admin/page-builder/appearance-utils.js#L125-L156) — leaf-level merge logic ready for both shell `top→scrolled` and `navItemDefaults→item.appearance`.
- [appearanceToInlineStyle](file:///srv/bw-quality/admin/page-builder/appearance-utils.js#L158-L210) — inline style emission ready; handles gradient, opacity, border-none, and radius.
- [normalizeAppearance](file:///srv/bw-quality/admin/page-builder/appearance-utils.js#L109-L111) — already used in both button and header nav normalizers.
- [normalizeHeaderShellAppearance](file:///srv/bw-quality/admin/page-builder/header-config.js#L116-L127) — propagated through `normalizeHeaderConfig` → `resolvePageHeaderState`.

### Scroll Merge Semantics

The plan defines: `scrolled state = mergeAppearance(appearance.top, appearance.scrolled)`. This uses the existing `mergeLeaf` which returns override when non-null, otherwise base. This is correct for "scrolled is a sparse overlay on top."

---

## ⚠️ Issues & Recommendations

### 1. Extraction of Appearance Editor Helpers — Scope Creep Risk

**Severity: Medium**

The plan says: _"Extract reusable appearance editor helpers from the buttons editor into a shared admin helper."_

Currently [button-editor.js](file:///srv/bw-quality/admin/page-builder/button-editor.js) contains these **internal** helper functions (lines 9–181, 206–274):

- `APPEARANCE_GROUPS`, `APPEARANCE_FIELDS`
- `getAppearanceLeaf`, `setAppearanceLeaf`, `pruneEmptyBranches`, `removeAppearanceLeaf`
- `toSparseAppearance`, `removeAppearanceProperty`
- `renderAppearanceInput`, `renderAppearanceControls`

And these **event-binding** helpers (lines 458–596):

- `resolveAppearanceTarget`, `updateAppearanceTarget`, `removeAppearanceFromTarget`, `getAppearanceInput`

> [!IMPORTANT]
> The plan must define exactly which helpers move into the shared file vs. stay in button-editor.js. The event-binding helpers (`resolveAppearanceTarget`, `updateAppearanceTarget`, etc.) use **button-editor-specific** normalization patterns (`normalizeButtonsConfig`) and DOM query patterns (`el.pbModuleEditor`). They are **not directly reusable** for the header editor, which uses `normalizeHeaderConfig` and has a different commit/state model.
>
> **Recommendation:** Extract only the pure data helpers (`APPEARANCE_GROUPS`, `APPEARANCE_FIELDS`, `getAppearanceLeaf`, `setAppearanceLeaf`, `pruneEmptyBranches`, `removeAppearanceLeaf`, `toSparseAppearance`) and the UI renderer helpers (`renderAppearanceInput`, `renderAppearanceControls`). Leave the event-binding helpers in button-editor.js and re-implement header-specific variants in header-editor.js.

### 2. `normalizeHeaderShellAppearance` Not Exported

**Severity: Low**

[normalizeHeaderShellAppearance](file:///srv/bw-quality/admin/page-builder/header-config.js#L116-L127) is currently a **private** function — it is NOT in the export list at the bottom of `header-config.js` (lines 426–444). The plan says _"Add header appearance resolver exports in the header config layer."_

This is fine as new work, but the plan should explicitly mention that `normalizeHeaderShellAppearance` either gets exported or new resolver functions are created alongside it.

### 3. `#adminNavLink` Exclusion Needs Specifics

**Severity: Low**

The plan states: _"Runtime-only `#adminNavLink` keeps its current special styling and does not inherit author nav item defaults."_

Currently in [reader/header-layout.js:66-69](file:///srv/bw-quality/reader/header-layout.js#L66-L69), the admin link is preserved during nav rebuilds. But the plan doesn't specify **how** the nav item appearance application will exclude it. The simplest approach: only apply inline styles during the `forEach` loop that creates new `.nav-link` elements (lines 73-85), since `#adminNavLink` is never in that loop. This is already the natural boundary — but it should be explicitly called out in the implementation.

### 4. Scroll Listener Lifecycle

**Severity: Medium**

The plan says: _"install one passive scroll listener."_

> [!WARNING]
> The reader's `applySharedHeaderLayout` ([header-layout.js:88-128](file:///srv/bw-quality/reader/header-layout.js#L88-L128)) can be called **multiple times** during a session (page transitions within the SPA). The plan must specify:
>
> 1. How the scroll listener is installed only once (or de-registered before re-installing).
> 2. How inline appearance styles are **cleared** when navigating to a page without header appearance (already mentioned but needs implementation detail — clearing `topbar.style` or `topbar.removeAttribute('style')`).
> 3. The `data-header-appearance-state` attribute lifecycle: set on entry, removed when appearance is absent.

### 5. Canvas Preview — Missing `mergeAppearance` Import Path

**Severity: Low**

The plan says the canvas should _"preview top-state shell appearance and merged nav chip appearance."_

Currently [canvas-renderer.js](file:///srv/bw-quality/admin/page-builder/canvas-renderer.js) does **not** import from `appearance-utils.js`. It will need:

```js
import { appearanceToInlineStyle, mergeAppearance } from './appearance-utils.js';
```

This is trivial but should be noted as part of the diff.

### 6. Header Editor State Model Difference

**Severity: Medium**

The header editor's commit model ([header-editor.js:370-389](file:///srv/bw-quality/admin/page-builder/header-editor.js#L370-L389)) differs from the button editor's:

- Header: `state = { header, copy }` → `setDraftState(cloneValue(state))` → `markDirty('header')`
- Button: `config` → `setDraftConfig(config)` → `markDirty('module')`

The plan says appearance edits write into `activeHeaderDraft.header.appearance` and `activeHeaderDraft.header.nav.items[*].appearance`. This is correct, but the implementation must:

- Add `appearance` handling into the header editor's `commit()` flow, ensuring `normalizeHeaderConfig` is called with the appearance data intact.
- Verify that `normalizeHeaderConfig` → `normalizeHeaderShellAppearance` correctly round-trips through the state cycle (it does — confirmed at [header-config.js:141](file:///srv/bw-quality/admin/page-builder/header-config.js#L141)).

### 7. Test File Coverage — Missing Test File For Header Appearance

**Severity: Low**

The test plan lists extending existing test files, but the implementation is significant enough that it may warrant a dedicated test file (e.g., `tests/header-appearance.test.js`) for:

- Shell resolver (top / scrolled merge)
- Nav item defaults → per-item merge
- Reader scroll state transitions
- Canvas preview with appearance

The plan's test commands reference existing files (`appearance-utils.test.js`, `admin-page-builder-shell.test.js`, `reader-data-builder.test.js`) which is fine for extension, but a new file would keep the new tests better organized.

### 8. CSS File Naming

**Severity: Informational**

The plan says: _"Add CSS in the existing admin page-builder controls/canvas files and reader header CSS."_

The relevant CSS files are:

- [admin/css/page-builder/controls.css](file:///srv/bw-quality/admin/css/page-builder/controls.css) (3.4KB)
- [admin/css/page-builder/canvas.css](file:///srv/bw-quality/admin/css/page-builder/canvas.css) (13.2KB)
- Reader header CSS — no dedicated file currently exists; header styles are in the main `index.html` `<style>` block.

The plan should confirm whether new reader header appearance styles go into an existing CSS file bundled through Vite or require a new file.

---

## Cross-Branch Merge Comment

The plan requests: "Add an explicit comment/resolver near the header normalizer explaining the cross-branch merge: defaults live under `header.appearance.navItemDefaults`, while overrides live under `header.nav.items[*].appearance`."

This is a good call. The two branches are:

```
header.appearance.navItemDefaults  ← base for all nav items
header.nav.items[N].appearance     ← per-item override
```

Resolved at render time as: `mergeAppearance(navItemDefaults, item.appearance)`. This is structurally identical to the buttons module pattern (`config.defaults.appearance` + `buttons[N].appearance`), which provides a good parallel reference.

---

## Summary

| Area                                          | Status                                    |
| --------------------------------------------- | ----------------------------------------- |
| Backend sanitization                          | ✅ Already complete                       |
| Data contract                                 | ✅ Matches existing normalizers           |
| `mergeAppearance` / `appearanceToInlineStyle` | ✅ Ready to use                           |
| Helper extraction from button-editor          | ⚠️ Scope the extraction carefully         |
| Scroll listener lifecycle                     | ⚠️ Specify de-registration / cleanup      |
| Header editor state integration               | ⚠️ Note the different commit model        |
| `normalizeHeaderShellAppearance` export       | ⚠️ Currently unexported; plan should note |
| `#adminNavLink` exclusion                     | ✅ Naturally excluded, but call it out    |
| Canvas import path                            | ✅ Trivial addition                       |
| Test organization                             | ℹ️ Consider dedicated test file           |
| CSS placement for reader                      | ℹ️ Confirm target file                    |
| Build step                                    | ✅ `npm run build` correctly specified    |
