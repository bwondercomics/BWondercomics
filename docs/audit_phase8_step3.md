# Audit: Phase 8 Step 3 — Retire Legacy Reader Fallback

## Verdict

The plan is **structurally sound** and correctly targets the right code paths. There are several issues that need resolution before execution.

---

## ✅ Accurate Claims

### 1. `loadPageConfigWithFallback` shape and branches
The plan correctly identifies the three return paths in [data.js:504–554](file:///srv/bw-quality/reader/data.js#L504-L554):
- `source: 'builder'` (line 527)
- `source: 'legacy'` (line 550) — the branch to remove
- `source: 'none'` (lines 531, 538, 553)

### 2. `pb-no-fallback` localStorage flag
Correctly identified at [data.js:515](file:///srv/bw-quality/reader/data.js#L515). Only referenced in `reader/data.js` and the corresponding test at [reader-data-builder.test.js:203–223](file:///srv/bw-quality/tests/reader-data-builder.test.js#L203-L223).

### 3. `allowLegacyFallback` variable
Correctly identified at [data.js:510](file:///srv/bw-quality/reader/data.js#L510). Only used within `loadPageConfigWithFallback`.

### 4. `fetchPageConfig` call inside `loadPageConfigWithFallback`
Correctly identified at [data.js:511](file:///srv/bw-quality/reader/data.js#L511). The plan says to remove this call from the normal startup path — accurate.

### 5. `safe-mode.js` independence
The plan correctly states to leave [safe-mode.js](file:///srv/bw-quality/reader/safe-mode.js) unchanged. It fetches `/page-config.json` independently (line 23) and has no dependency on `loadPageConfigWithFallback`.

### 6. `reader/app.js` startup call
The plan correctly targets [app.js:1018–1024](file:///srv/bw-quality/reader/app.js#L1018-L1024), where `applyBuilderPageToDOM` is called with `pageConfig: pageConfig.config`.

### 7. `customization.js` as the secondary legacy mutation path
The plan correctly identifies [customization.js:60–82](file:///srv/bw-quality/reader/customization.js#L60-L82) as performing its own `page-config.json` fetch and DOM mutation when the boot source is not `'builder'`.

### 8. `loadFallbackRetirementGate` exists and gates on `auditPagesFallbacks`
Confirmed in [fallback-retirement-gate.js:109](file:///srv/bw-quality/admin/page-builder/fallback-retirement-gate.js#L109). The gate returns `retirementReady: completePageDetails && audit.clean` (line 82).

### 9. Test files exist and are correctly named
All three test files referenced in the plan exist:
- [reader-data-builder.test.js](file:///srv/bw-quality/tests/reader-data-builder.test.js) (502 lines)
- [reader-customization.test.js](file:///srv/bw-quality/tests/reader-customization.test.js) (85 lines)
- [reader-app.test.js](file:///srv/bw-quality/tests/reader-app.test.js) (271 lines)

---

## ⚠️ Issues

### Issue 1: `fetchPageConfig` is called unconditionally BEFORE the builder page — removing the call changes fetch timing

> [!IMPORTANT]
> The plan says "Remove the normal startup `fetchPageConfig(sid)` call." But the current code at [data.js:511](file:///srv/bw-quality/reader/data.js#L511) calls `fetchPageConfig(sid)` **before** attempting the builder page load (lines 518–520). This means `pageConfig` is available to `extractSubtitlesFromBuilderPage(builderPage, pageConfig)` on the **builder success** path too (line 522), not just the legacy fallback.
>
> If you remove `fetchPageConfig` entirely from this function, the builder success path will also lose access to `pageConfig`. This is likely intentional (the plan says "V3 `page.meta.header` ignores `page-config.json`"), but the plan should **explicitly state** that `extractSubtitlesFromBuilderPage` will receive `null` for `pageConfig` on the builder path, and that `createEffectivePageHeader(page, null)` produces correct results for all migrated pages.

**Downstream impact chain:**
- `extractSubtitlesFromBuilderPage(builderPage, pageConfig)` → `createEffectivePageHeader(page, pageConfig)` — currently receives pageConfig, will receive null
- `applyBuilderPageToDOM(page, { pageConfig })` → `resolvePageHeaderState({ page, pageConfig })` — currently receives pageConfig, will receive null
- `applySharedHeaderLayout(pageConfig, { seriesId, page, headerState })` — first arg is currently pageConfig, will become null

The plan claims this is safe because V3 headers don't need pageConfig. **This is the single highest-risk assumption** and must be verified by the audit gate passing for all live series.

### Issue 2: `customization.js` still runs as an IIFE — "hard-disable" is underspecified

> [!WARNING]
> The plan says to "hard-disable `reader/customization.js` as a no-op compatibility module." But customization.js is an **immediately-invoked function** ([customization.js:6](file:///srv/bw-quality/reader/customization.js#L6)) that self-registers on DOM load ([customization.js:262–266](file:///srv/bw-quality/reader/customization.js#L262-L266)). 
>
> The plan needs to specify the exact mechanism:
> - **Option A**: Guard `initCustomization()` to early-return for all boot sources (not just `'builder'`/`'error'`). Currently it only skips on `source === 'builder'` or `source === 'error'` ([line 63](file:///srv/bw-quality/reader/customization.js#L63)). After this step, `source: 'legacy'` no longer exists, so only `source: 'none'` remains. The guard needs to also bail on `'none'`.
> - **Option B**: Remove the module from the build entry entirely.
> - **Option C**: Gut the function body to be a pure no-op.
>
> Option A is the smallest change and matches "no-op compatibility module for this pass."

### Issue 3: `config: pageConfig` is returned on ALL current paths — not just legacy

The plan's Interface Changes section says "The startup result no longer includes `config` from `page-config.json`." This is correct in direction, but the **current** code returns `config: pageConfig` on the **builder success** path too ([data.js:527](file:///srv/bw-quality/reader/data.js#L527)):

```js
return { source: 'builder', page: builderPage, config: pageConfig };
```

And on `source: 'none'` paths ([data.js:531](file:///srv/bw-quality/reader/data.js#L531), [538](file:///srv/bw-quality/reader/data.js#L538)):
```js
return { source: 'none', config: pageConfig };
```

The plan should state that `config` is removed from **all three** return shapes, not just the legacy one.

### Issue 4: `data.test.js` also tests `loadPageConfig` — not mentioned in the plan

> [!NOTE]
> [data.test.js:70–106](file:///srv/bw-quality/tests/data.test.js#L70-L106) directly tests `loadPageConfig` (the standalone function, not `loadPageConfigWithFallback`). The plan says `fetchPageConfig`/`loadPageConfig` "can remain for non-startup legacy helpers/tests," but doesn't mention whether `data.test.js` needs updating. If `loadPageConfig` stays exported, this test file should remain unchanged. The plan should explicitly note this.

### Issue 5: Existing tests assert `config: pageConfig` on builder results — update scope is larger than stated

The plan's test update scope says to update three test files, but several existing tests in [reader-data-builder.test.js](file:///srv/bw-quality/tests/reader-data-builder.test.js) assert the current return shape including `config`:

| Test | Line | Current Assertion |
|---|---|---|
| "prefers a published builder page" | 55 | `{ source: 'builder', page: builderPage, config: pageConfig }` |
| "loads a published custom builder page" | 86 | `{ source: 'builder', page: aboutPage, config: pageConfig }` |
| "loads unpublished draft pages" | 111 | `{ source: 'builder', page: draftPage, config: pageConfig }` |
| "falls back to legacy page-config" | 172 | `{ source: 'legacy', config: pageConfig }` |
| "does not use legacy fallback" | 198 | `{ source: 'none', config: pageConfig }` |
| "honors pb-no-fallback" | 220 | `{ source: 'none', config: pageConfig }` |

All six of these need return-shape updates, not just the legacy/pb-no-fallback ones the plan specifically calls out. The plan should enumerate the full scope.

### Issue 6: `reader-app.test.js` mock already omits `config` — but asserts `pageConfig: undefined`

In [reader-app.test.js:47–50](file:///srv/bw-quality/tests/reader-app.test.js#L47-L50), the `loadPageConfigWithFallback` mock returns `{ source: 'builder', page: ... }` without a `config` property. And at [line 193](file:///srv/bw-quality/tests/reader-app.test.js#L193), the test asserts:
```js
pageConfig: undefined,
```

This is already close to the post-retirement shape. The plan says to update this test so `applyBuilderPageToDOM` "receives no `pageConfig`" — but the assertion already expects `undefined`. The plan should note that the test's `loadPageConfigWithFallback` mock is already retirement-compatible, and the main change is in the `app.js` call site (stop passing `pageConfig.config`).

### Issue 7: `applyBuilderPageToDOM` still accepts `options.pageConfig` — compatibility stub needed

The plan says to keep `applyBuilderPageToDOM` accepting optional `pageConfig` for "direct legacy-data safety tests/admin helpers." This is consistent with the current code at [data.js:314–319](file:///srv/bw-quality/reader/data.js#L314-L319). However, `applySharedHeaderLayout` at [header-layout.js:173](file:///srv/bw-quality/reader/header-layout.js#L173) is the first arg receiving pageConfig, and at line 183 it feeds into `resolvePageHeaderState({ page, pageConfig })`.

After retirement, the normal path sends `null`. The plan should confirm that `resolvePageHeaderState` handles `pageConfig: null` correctly for all V3 pages (it likely does, since V3 header data is self-contained in `page.meta.header`, but this is the contract that needs to hold).

### Issue 8: The plan doesn't address the `page-config.json` fetch inside test mocks

Six tests in `reader-data-builder.test.js` currently set up `fetchMock` responses for `page-config.json`. After removing `fetchPageConfig()` from `loadPageConfigWithFallback`, these mock responses become unused. Several tests use `throw new Error('Unexpected fetch')` as a catch-all — after the change, `page-config.json` fetches should trigger this error if they accidentally occur. The plan's test section should note that removing the `page-config.json` mock handlers is how to verify no fetch occurs.

---

## 📋 Recommendations

1. **Explicitly state that `createEffectivePageHeader(page, null)` is the post-retirement contract** and that the audit gate's `clean: true` is the proof this is safe.

2. **Specify the `customization.js` disable mechanism**: Add `source === 'none'` to the early-return guard at line 63, so that after retirement the only surviving boot sources (`'builder'` and `'none'`) both skip the legacy fetch+mutation path.

3. **Enumerate all six test assertions that need return-shape updates** in `reader-data-builder.test.js`, not just the legacy/pb-no-fallback cases.

4. **Note that `data.test.js` stays unchanged** since it tests the standalone `loadPageConfig` function, which is being retained.

5. **Add a negative test** that verifies `loadPageConfigWithFallback` makes **zero** `page-config.json` fetches on the builder success path (currently it always fetches, so this is a behavior change worth asserting).

6. **Clarify the `reader-app.test.js` update** is minimal: the mock is already compatible; the real change is in `app.js` at line 1021 where `pageConfig: pageConfig.config` needs to become either omitted or `pageConfig: null`.

7. **Consider whether `safe-mode.js` should be noted as the sole remaining runtime consumer of `/page-config.json`** in the post-retirement state documentation, so future cleanup passes know it exists.
