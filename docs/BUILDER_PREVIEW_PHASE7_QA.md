# Phase 7 Builder Preview Manual QA Notes

Date: 2026-05-14T18:38:31Z
Commit: `c3401311aef6328b92d1607a18359bf37afd2274`
Environment: local Codex workspace, Vite/Playwright browser pass on `127.0.0.1:3107`
Browser: Playwright Chromium `1.59.1`
Runtime: Node `v18.19.1`, npm `9.2.0`

## Method

This Phase 7 pass was executed as browser-level QA from the terminal using the same Chromium route
that backs the preview parity visual suite, plus focused contract checks for draft, unsaved, module,
metric, and side-effect behavior. No live staging data or persisted production content was mutated.

The local browser evidence used seeded builder fixtures and mocked read-only backend responses from
`tests/fixtures/contract-fixtures.json`. The manual checklist below is mapped to the selectors,
routes, viewport presets, and side-effect boundaries that the implemented preview uses.

## Commands Run

```bash
npm run build
npm run test:visual
npm test -- tests/reader-preview-side-effects.test.js tests/reader-preview-bridge.test.js tests/reader-preview-metrics.test.js tests/admin-page-builder-shell.test.js
npm test -- tests/reader-page-renderer.test.js tests/shared-renderers-parity.test.js tests/admin-page-builder-preview.test.js
```

Results:

- `npm run build`: passed. Vite reported the existing fullscreen dynamic/static import chunking warning.
- `npm run test:visual`: passed, `3` Chromium tests.
- Preview side-effect/metrics/unsaved focused Vitest pass: passed, `4` files and `58` tests.
- Module renderer/admin preview focused Vitest pass: passed, `3` files and `23` tests.

## Page Inventory

| Coverage item                           | Page or fixture used                                                                                                                                                                          | Result |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Published builder page                  | `battle-bros / reader` from `builderPage`                                                                                                                                                     | Pass   |
| Unpublished draft page                  | `battle-bros / about` from `builderPageDraft`; draft link behavior covered by builder shell tests                                                                                             | Pass   |
| Unsaved local module edits              | Dirty text-module draft preview snapshot                                                                                                                                                      | Pass   |
| Unsaved local header/theme edits        | Dirty header, theme, page-settings, and section preview snapshots                                                                                                                             | Pass   |
| All common module types                 | `builderModules` fixture covering `header`, `text`, `image`, `gallery`, `video`, `social`, `email-signup`, `promo`, `buttons`, `spacer`, `divider`, `reader`, `entry-gallery`, `feed`, `html` | Pass   |
| Canonical V3 page header                | `builderPage.meta.header.version = 3`                                                                                                                                                         | Pass   |
| Customized button/header-nav appearance | `builderPage` header nav plus button/social/feed appearance fixtures                                                                                                                          | Pass   |

## Viewport Matrix

| Viewport |          Size | Reader route                                 | Builder preview route                                                           | Evidence                                                                  | Result |
| -------- | ------------: | -------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------ |
| Desktop  | `1920 x 1080` | `/index.html?series=battle-bros&page=reader` | `/admin/index.html?view=designer&series=battle-bros&page=reader&surface=header` | Screenshot parity and shell/module selectors                              | Pass   |
| Tablet   |  `768 x 1024` | `/index.html?series=battle-bros&page=reader` | same builder route, Tablet preset                                               | Screenshot parity and media-query branch metrics                          | Pass   |
| Mobile   |   `375 x 812` | `/index.html?series=battle-bros&page=reader` | same builder route, Mobile preset                                               | Screenshot parity, iframe `window.innerWidth === 375`, no mobile overflow | Pass   |

## Checklist Results

| Check                                                                 | Result | Evidence                                                                                                                                                         |
| --------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop preview matches reader route                                  | Pass   | `builder-preview-parity.spec.js` Desktop screenshot comparison passed.                                                                                           |
| Tablet preview matches reader route                                   | Pass   | `builder-preview-parity.spec.js` Tablet screenshot comparison passed.                                                                                            |
| Mobile preview matches reader route                                   | Pass   | `builder-preview-parity.spec.js` Mobile screenshot comparison passed.                                                                                            |
| Mobile iframe reports `window.innerWidth === 375`                     | Pass   | Visual suite evaluates iframe `window.innerWidth` against `PREVIEW_VIEWPORTS.mobile.width`.                                                                      |
| Header title, subtitle, blocks, nav links, and nav appearance match   | Pass   | Visual shell assertions plus header/apply layout tests passed.                                                                                                   |
| Left/right panels match, including backgrounds and empty states       | Pass   | Visual shell assertions and reader data builder shell tests passed.                                                                                              |
| Builder page links route to same series/page targets                  | Pass   | Link utility, shared renderer, and draft/open-reader shell assertions passed.                                                                                    |
| Draft preview matches admin draft reader route                        | Pass   | Draft route uses `draft=1` and `Open Draft Preview` behavior in builder shell tests.                                                                             |
| Unsaved working preview updates without saving and is labeled unsaved | Pass   | Dirty module/header/theme/page-settings/section snapshots report `Previewing unsaved working changes`.                                                           |
| Email/comment/analytics side effects do not fire from preview mode    | Pass   | Side-effect guard tests passed for email stubs, comments read-only behavior, analytics/live tracking guards, safe-mode, chat SSO, user settings, and fullscreen. |
| External links are disabled or require intentional open action        | Pass   | Preview-mode capture-phase link suppression is covered by reader preview side-effect tests and app wiring.                                                       |

## Side-Effect Results

| Boundary                    | Expected                                                         | Result |
| --------------------------- | ---------------------------------------------------------------- | ------ |
| Email signup                | Preview-only feedback, no `/api/email/subscribe` POST            | Pass   |
| Comments/auth/moderation    | Read-only/disabled preview behavior, no mutating request         | Pass   |
| Analytics and live tracking | No `/analytics.js` injection or tracking write from preview mode | Pass   |
| External links              | Preview click suppression prevents accidental navigation         | Pass   |
| Fullscreen                  | Preview mode blocks fullscreen requests                          | Pass   |

## Issue Log

No mismatches found.

| Severity | Area | Repro | Expected | Actual | Status         |
| -------- | ---- | ----- | -------- | ------ | -------------- |
| None     | None | None  | None     | None   | No open issues |

## Exit Decision

Phase 7 exits with no unresolved blocker, major, or minor mismatch from the local browser evidence
and focused contract checks. The remaining release gate is Phase 8 documentation cleanup plus the
full Phase 9 quality gate.
