# Audit: Phase 4 — Full Reader Shell Parity

## Completion Update (`2026-05-11`)

The implementation gaps identified in this audit are now closed. `reader/data.js` clears the
controlled builder theme CSS variable set before each snapshot, clears the controlled panel
background variable set before each panel background application, and resets left/right panel
visibility before evaluating the next snapshot's `panelEnabled` settings. That removes the stale
theme, stale panel opacity, and stale hidden-panel carryover cases this audit called out.

Coverage also moved from "planned" to "implemented": `tests/reader-data-builder.test.js` now
asserts the real reader shell contract from `index.html`, theme clearing between snapshots, and
sequential panel reset behavior, while `tests/admin-page-builder-shell.test.js` now proves that
theme reset and discard flows post the correct working-versus-saved snapshot state back to the
preview iframe.

The remainder of this file is preserved as the pre-completion audit record that identified those
gaps before the hardening pass landed.

## Overall Assessment

The plan is **structurally sound** and accurately reflects the current codebase architecture. Most claims are verified correct. One section describes work that **does not yet exist** in the codebase (theme variable clearing), which means the plan is correctly identifying it as something to _implement_, not just verify. A follow-up pass also found two panel stale-state risks that belong in the same hardening work: panel visibility can persist between snapshots, and panel background opacity can persist when a later background omits `opacity`. A few naming/selector details need minor corrections.

---

## Section-by-Section Audit

### 1. Shell Contract Coverage

> Add/extend shell contract coverage to prove the iframe loads the real `index.html` shell with `header.topbar`, `.viewerWrap`, `#leftPanel`, `#mainContent`, `#viewport`, `#controls`, and `#rightPanel`.

**Verdict: ✅ Accurate**

All referenced elements exist in [index.html](file:///srv/bw-quality/index.html):

| Plan Reference  | Actual Markup                                           | Line |
| --------------- | ------------------------------------------------------- | ---- |
| `header.topbar` | `<header class="topbar" id="topbar">`                   | L89  |
| `.viewerWrap`   | `<div class="viewerWrap">`                              | L151 |
| `#leftPanel`    | `<aside class="side-panel left" id="leftPanel">`        | L153 |
| `#mainContent`  | `<div class="viewer-content-wrapper" id="mainContent">` | L210 |
| `#viewport`     | `<section class="viewport" id="viewport">`              | L212 |
| `#controls`     | `<div class="controls" id="controls">`                  | L261 |
| `#rightPanel`   | `<aside class="side-panel right" id="rightPanel">`      | L306 |

> [!NOTE]
> `.viewerWrap` is a class-only div (no ID). Tests asserting its presence should use `document.querySelector('.viewerWrap')`, not `getElementById`. The plan's notation `header.topbar` is slightly ambiguous — it's `header#topbar.topbar` in the DOM. Tests should reference `#topbar` or `header.topbar` consistently.

---

### 2. Two-Path Startup Architecture

> Confirm reader startup has only two page-application paths:
>
> - preview mode: `requestPreviewSnapshot(...)` then `applyBuilderPageToDOM(page, { seriesId, previewMode: true })`
> - runtime mode: `loadPageConfigWithFallback(...)` then `applyBuilderPageToDOM(page, { seriesId })`

**Verdict: ✅ Accurate**

Verified in [reader/app.js](file:///srv/bw-quality/reader/app.js) `start()` function:

- **Preview path** (L1062–L1079): `requestPreviewSnapshot()` → `applyBuilderPageToDOM(pageResult.page, { seriesId, previewMode: true })`
- **Runtime path** (L1082–L1094): `loadPageConfigWithFallback()` → `applyBuilderPageToDOM(pageResult.page, { seriesId })`

Both paths call `applyBuilderPageToDOM()` as the shared application function. The preview path correctly skips `loadPageConfigWithFallback()` entirely. Both existing tests in [reader-app.test.js](file:///srv/bw-quality/tests/reader-app.test.js) already assert this at L237–L253.

> [!IMPORTANT]
> One asymmetry to note: the preview path calls `applyBuilderPageToDOM` **after** `init()` (L1071–L1075), while the runtime path calls it after `init()` as well (L1088–L1094) but conditionally (`if pageResult.source === 'builder'`). The preview path has no such guard because it always expects `source: 'builder'`. This is correct behavior but worth documenting in the test assertions.

---

### 3. `loadPageConfigWithFallback` Source Constraint

> Keep `loadPageConfigWithFallback(...)` constrained to `source: 'builder' | 'none'`; preview must never fetch or fall back to retired legacy `page-config.json` behavior.

**Verdict: ✅ Accurate**

In [reader/data.js](file:///srv/bw-quality/reader/data.js) L496–L517, `loadPageConfigWithFallback()` returns only two outcomes:

- `{ source: 'builder', page: builderPage }` (L513)
- `{ source: 'none' }` (L516)

There is no `page-config.json` fetch anywhere in this function. The legacy `loadPageConfig()` / `fetchPageConfig()` functions still exist (L96–L123) but are **not called** from `loadPageConfigWithFallback()` or anywhere in the startup path.

Existing test coverage in [reader-data-builder.test.js](file:///srv/bw-quality/tests/reader-data-builder.test.js) already verifies this at L113–L149 (the `source: 'builder' | 'none'` constraint test) and L145–L148 (asserting no `page-config.json` fetches).

---

### 4. Header Parity

> Preserve header parity by using the same `resolvePageHeaderState({ page, pageConfig: null })` input for normal V3 pages, the same `applySharedHeaderLayout(...)` nav rendering, the same top/scrolled shell appearance state, and the same admin-link exclusion.

**Verdict: ✅ Accurate**

- `applyBuilderPageToDOM()` calls `resolvePageHeaderState({ page, pageConfig: options.pageConfig || null })` at [data.js L316–L319](file:///srv/bw-quality/reader/data.js#L316-L319). For normal V3 runtime, `options.pageConfig` is not passed (defaults to `null`).
- It then calls `applySharedHeaderLayout(options.pageConfig || null, { seriesId, page, headerState })` at L321–L325.
- Admin-link exclusion is in [header-layout.js](file:///srv/bw-quality/reader/header-layout.js) `renderNavItems()` at L147–L152: the `#adminNavLink` is preserved and not re-rendered.
- Top/scrolled appearance states are managed via `syncTopbarAppearanceState()` at L73–L89 with scroll listener at L91–L95.

Existing test coverage in [header-appearance.test.js](file:///srv/bw-quality/tests/header-appearance.test.js) already covers:

- Top/scrolled toggle (L449–L525)
- Admin-link exclusion (L514)
- Appearance clearing between pages (L527–L568)

---

### 5. Theme Application / Clearing

> Harden theme application so reader-controlled theme CSS variables are cleared before applying a new snapshot, then only page-provided overrides are written. This prevents stale preview variables while leaving stylesheet defaults untouched when no page override exists.

**Verdict: ⚠️ Gap Identified — This is new work, not existing behavior**

The current `applyPageTheme()` in [data.js L256–L270](file:///srv/bw-quality/reader/data.js#L256-L270) **only adds** CSS custom properties — it never clears previously-set theme variables. There is no `clearTheme`, `resetTheme`, or any `removeProperty('--...')` call for theme variables anywhere in the reader codebase.

This means:

1. If preview snapshot A sets `--accent: #ffcc00` and snapshot B does not include `--accent`, the stale `#ffcc00` value persists on `document.documentElement.style`.
2. This is the exact problem the plan describes. The plan correctly identifies it as something to **implement**.

```
// Current code — only adds, never clears:
function applyPageTheme(page) {
  if (!page?.meta?.theme) return;
  const theme = page.meta.theme;
  const root = document.documentElement;
  Object.entries(theme).forEach(([key, value]) => {
    if (!value) return;
    const cssVar = '--' + key.replace(/([A-Z])/g, '-$1').toLowerCase();
    root.style.setProperty(cssVar, value);
  });
}
```

> [!WARNING]
> The plan says "Harden theme application so reader-controlled theme CSS variables are **cleared** before applying a new snapshot." This is correctly described as work to be done. Implementation should track which CSS variables were previously set (or maintain a known set of theme variable names) and `removeProperty` them before applying the new page's theme. Panel backgrounds already have this clearing pattern ([data.js L289–L294](file:///srv/bw-quality/reader/data.js#L289-L294)) and can serve as a model.

---

### 6. Panel Parity

> Confirm panel parity stays inside `applyBuilderPageToDOM(...)`: left/right module selection uses the runtime column mapping, panel background URLs use the same normalization, panel spacing writes `--pb-panel-gap`, and empty-panel text or hidden empty text matches runtime.

**Verdict: ✅ Accurate, with stale-state hardening gaps**

All verified in [data.js](file:///srv/bw-quality/reader/data.js):

| Claim                                                  | Location                  |
| ------------------------------------------------------ | ------------------------- |
| Column mapping via `findPanelModules()`                | L347–L364                 |
| Panel background normalization via `resolveAssetUrl()` | L272–L280, called at L296 |
| `--pb-panel-gap` writes                                | L453–L461                 |
| Empty-panel text / `hideEmptyText`                     | L466–L469                 |
| Panel background clearing on empty config              | L289–L294                 |

Existing test coverage in [reader-data-builder.test.js](file:///srv/bw-quality/tests/reader-data-builder.test.js):

- Panel backgrounds and gap values: L260–L297
- Empty panel / `hideEmptyText`: L581–L603

> [!WARNING]
> Two sequential-snapshot cases need hardening:
>
> 1. `applyBuilderPageToDOM(...)` only changes panel `display` when a section has
>    `settings.panelEnabled`. If snapshot A hides a panel and snapshot B has no `panelEnabled`
>    settings, the hidden inline style can persist.
> 2. `applyPanelBackgrounds(...)` clears `--panel-bg-opacity` only when the whole background config
>    has no path. If snapshot A sets opacity and snapshot B uses a new path without opacity, the old
>    opacity can persist.

---

### 7. Module Parity

> Confirm module parity through `reader/page-renderer.js` and `shared-renderers.js`; preview stubs remain limited to mutating side effects such as submissions, analytics, fullscreen, and navigation, not layout or module HTML.

**Verdict: ✅ Accurate**

- [page-renderer.js](file:///srv/bw-quality/reader/page-renderer.js) imports `createRenderers()` from `shared-renderers.js` at L12 and L22–L26. Both reader and admin preview use the same `createRenderers()` factory.
- Preview side-effect guards are confirmed in [reader-preview-side-effects.test.js](file:///srv/bw-quality/tests/reader-preview-side-effects.test.js): live-tracking (L21–L35), email submissions (L37–L58), user settings (L60–L74), fullscreen (L76–L86).
- Additional preview guards in `app.js`: link click prevention (L672–L681), fullscreen suppression (L710–L712, L762–L763, L773, L780–L786), analytics skip (L940–L942).

---

### 8. Test Plan

> Extend `tests/reader-app.test.js`, `tests/reader-data-builder.test.js`, `tests/header-appearance.test.js`, `tests/admin-page-builder-shell.test.js`

**Verdict: ✅ All files exist and are correctly targeted**

| Test File                                                                                         | Current Size | Plan Target             |
| ------------------------------------------------------------------------------------------------- | ------------ | ----------------------- |
| [reader-app.test.js](file:///srv/bw-quality/tests/reader-app.test.js)                             | 304 lines    | Startup path assertions |
| [reader-data-builder.test.js](file:///srv/bw-quality/tests/reader-data-builder.test.js)           | 605 lines    | Shell-level effects     |
| [header-appearance.test.js](file:///srv/bw-quality/tests/header-appearance.test.js)               | 646 lines    | Appearance parity       |
| [admin-page-builder-shell.test.js](file:///srv/bw-quality/tests/admin-page-builder-shell.test.js) | 1867 lines   | Theme reset/discard     |

Specific planned test additions are appropriate:

- **Theme clearing** tests don't exist yet (matches the gap in item 5)
- **Panel background reset** tests partially exist (L260–L297 in reader-data-builder) but don't cover the reset-on-new-snapshot scenario
- **Admin-link exclusion after nav re-render** is covered at header-appearance L514 but could be extended for the post-`applyBuilderPageToDOM` flow

---

### 9. Assumptions

> Phase 4 is a parity audit/hardening phase, not a replacement for the completed iframe architecture.

**Verdict: ✅ Correct** — The iframe architecture is fully in place (preview-bridge.js, preview-contract.js, iframe insertion in builder shell).

> The canonical reader shell remains root `index.html`; no duplicate preview shell should be introduced.

**Verdict: ✅ Correct** — The iframe `src` points to `/index.html?...&builderPreview=1` (confirmed in shell test L1176–L1178).

> Optional legacy `pageConfig` inputs may remain for direct migration/safety tests.

**Verdict: ✅ Correct** — `applyBuilderPageToDOM` still accepts `options.pageConfig` (L318), and legacy tests exercise this (reader-data-builder L315–L355, L562–L579).

---

## Summary of Findings

| #   | Section           | Status  | Notes                                                                                     |
| --- | ----------------- | ------- | ----------------------------------------------------------------------------------------- |
| 1   | Shell contract    | ✅ Pass | All elements verified in index.html                                                       |
| 2   | Two-path startup  | ✅ Pass | Both paths converge on `applyBuilderPageToDOM`                                            |
| 3   | Source constraint | ✅ Pass | Only `'builder' \| 'none'`, no legacy fetch                                               |
| 4   | Header parity     | ✅ Pass | Same resolver, layout, scroll, admin exclusion                                            |
| 5   | Theme clearing    | ⚠️ Gap  | `applyPageTheme()` never clears stale variables — this is the work to implement           |
| 6   | Panel parity      | ⚠️ Gap  | Column mapping, spacing, empty text verified; sequential display and opacity reset needed |
| 7   | Module parity     | ✅ Pass | Shared renderers + side-effect-only preview stubs                                         |
| 8   | Test plan         | ✅ Pass | All four files exist and are correctly targeted                                           |
| 9   | Assumptions       | ✅ Pass | All three assumptions are valid                                                           |

> [!IMPORTANT]
> **The primary actionable gap** is theme variable clearing (item 5). The plan correctly describes this as hardening work, but the implementation will need to either:
>
> 1. Maintain a known list of theme CSS variable names and clear them all before applying, or
> 2. Track which variables were set by the previous `applyPageTheme()` call and remove only those.
>
> Option 2 is cleaner and follows the pattern already used by `applyPanelBackgrounds()` and `clearControlledTopbarStyles()`.

Panel state should be hardened in the same pass: clear controlled panel background CSS variables
before applying each panel config, and reset panel `display` before evaluating the new snapshot's
`panelEnabled` settings.
