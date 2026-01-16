# Battle Bros Reader - Test Documentation

## Overview

This document provides comprehensive documentation for the test suite of the Battle Bros comic reader. The tests ensure code quality, catch regressions, and serve as living documentation for how the code should behave.

Note: "chapter" in code/tests is legacy naming for entries (issues/volumes/etc). The helpers still accept strings like "Chapter 1" because the label text is user-defined.

---

## Table of Contents

1. [Test Framework](#test-framework)
2. [Test Files Overview](#test-files-overview)
3. [chapters.test.js](#chapterstestjs)
4. [state.test.js](#statetestjs)
5. [render.test.js](#rendertestjs)
6. [Additional Test Files](#additional-test-files)
7. [Running Tests](#running-tests)
8. [Writing New Tests](#writing-new-tests)
9. [Continuous Integration](#continuous-integration)

---

## Test Framework

**Framework:** [Vitest](https://vitest.dev/) v1.0.4

**Why Vitest?**
- ✅ Native ES modules support (no transpilation needed)
- ✅ Fast execution with smart watch mode
- ✅ Jest-compatible API (familiar syntax)
- ✅ Built-in coverage reporting
- ✅ Optional UI for test visualization

**Environment:** `happy-dom` (fast DOM simulation)

---

## Test Files Overview

```
tests/
├── setup.js              # Test environment configuration
├── chapters.test.js      # Entry/chapter helper tests
├── state.test.js         # Reader state persistence tests
├── render.test.js        # Rendering logic tests
├── data.test.js          # reader/data.js loader tests
├── series.test.js        # reader/series.js helper tests
├── comment-targets.test.js # Comment target ID helpers
├── utils.test.js         # admin/utils.js helper tests
├── admin-smoke.test.js   # Admin UI smoke tests (happy-dom)
└── README.md             # Testing guide
```

**Test counts change over time.** Run `npm test` for current totals.

---

## chapters.test.js

**File:** `tests/chapters.test.js`  
**Covers:** `reader/chapters.js`

### Test Suites

#### `extractChapterNumber` (4 tests)

Tests the extraction of numeric chapter numbers from chapter name strings.

##### Test: "should extract chapter number from standard format"
```javascript
expect(extractChapterNumber('Chapter 5')).toBe(5);
expect(extractChapterNumber('chapter 10')).toBe(10);
expect(extractChapterNumber('CHAPTER 1')).toBe(1);
```
**Purpose:** Verifies case-insensitive extraction from standard "Chapter N" format

##### Test: "should handle chapters with leading zeros"
```javascript
expect(extractChapterNumber('Chapter 01')).toBe(1);
expect(extractChapterNumber('Chapter 007')).toBe(7);
```
**Purpose:** Ensures leading zeros are properly parsed (parseInt handles this)

##### Test: "should return null for non-numbered chapters"
```javascript
expect(extractChapterNumber('Bonus')).toBe(null);
expect(extractChapterNumber('Epilogue')).toBe(null);
expect(extractChapterNumber('Special Edition')).toBe(null);
```
**Purpose:** Verifies graceful handling of special chapters without numbers

##### Test: "should handle empty or invalid input"
```javascript
expect(extractChapterNumber('')).toBe(null);
expect(extractChapterNumber()).toBe(null);
```
**Purpose:** Tests defensive programming for edge cases

---

#### `sortChapterNames` (5 tests)

Tests the sorting algorithm for chapter names (numerical then alphabetical).

##### Test: "should sort chapters numerically"
```javascript
const input = ['Chapter 10', 'Chapter 2', 'Chapter 1', 'Chapter 5'];
const expected = ['Chapter 1', 'Chapter 2', 'Chapter 5', 'Chapter 10'];
expect(sortChapterNames(input)).toEqual(expected);
```
**Purpose:** Verifies numeric sorting (not lexicographic) - "Chapter 10" comes after "Chapter 2"

##### Test: "should place non-numbered chapters at the end"
```javascript
const input = ['Chapter 2', 'Bonus', 'Chapter 1', 'Epilogue'];
const expected = ['Chapter 1', 'Chapter 2', 'Bonus', 'Epilogue'];
expect(sortChapterNames(input)).toEqual(expected);
```
**Purpose:** Ensures special chapters appear after numbered chapters

##### Test: "should sort non-numbered chapters alphabetically"
```javascript
const input = ['Zebra', 'Alpha', 'Beta'];
const expected = ['Alpha', 'Beta', 'Zebra'];
expect(sortChapterNames(input)).toEqual(expected);
```
**Purpose:** Verifies alphabetical fallback for non-numbered chapters

##### Test: "should handle empty array"
```javascript
expect(sortChapterNames([])).toEqual([]);
```
**Purpose:** Edge case handling for empty input

##### Test: "should not mutate original array"
```javascript
const input = ['Chapter 3', 'Chapter 1'];
const original = [...input];
sortChapterNames(input);
expect(input).toEqual(original);
```
**Purpose:** Verifies function purity (no side effects)

---

#### `sanitizeChapters` (7 tests)

Tests the data normalization and validation logic for chapter data.

##### Test: "should normalize chapter data correctly"
```javascript
const input = {
  'Chapter 1': ['page1.png', 'page2.png'],
  'Chapter 2': ['page1.png']
};
const result = sanitizeChapters(input);

expect(result.chapters).toEqual(input);
expect(result.order).toEqual(['Chapter 1', 'Chapter 2']);
```
**Purpose:** Verifies basic normalization and order creation

##### Test: "should drop empty entries without meta flags"
```javascript
const input = {
  'Chapter 1': ['page1.png'],
  'Empty Chapter': [],
  'Chapter 2': ['page1.png']
};
const result = sanitizeChapters(input);

expect(result.chapters['Chapter 1']).toEqual(['page1.png']);
expect(result.chapters['Empty Chapter']).toBeUndefined();
expect(result.chapters['Chapter 2']).toEqual(['page1.png']);
```
**Purpose:** Empty entries are removed unless metadata says they should be kept

##### Test: "should keep empty entries with gallery or dropdown flags"
```javascript
const input = {
  'Empty Chapter': []
};
const meta = {
  'Empty Chapter': { showInGallery: true }
};
const result = sanitizeChapters(input, meta);

expect(result.chapters['Empty Chapter']).toEqual([]);
```
**Purpose:** Empty entries can be preserved when flagged for gallery or dropdown display

##### Test: "should trim whitespace from chapter names"
```javascript
const input = {
  '  Chapter 1  ': ['page1.png'],
  'Chapter 2': ['page1.png']
};
const result = sanitizeChapters(input);

expect(result.chapters['Chapter 1']).toEqual(['page1.png']);
expect(result.chapters['  Chapter 1  ']).toBeUndefined();
```
**Purpose:** Verifies whitespace normalization in chapter names

##### Test: "should handle empty input"
```javascript
const result = sanitizeChapters({});
expect(result.chapters).toEqual({});
expect(result.order).toEqual([]);
```
**Purpose:** Edge case for empty chapter data

##### Test: "should filter out falsy page values"
```javascript
const input = {
  'Chapter 1': ['page1.png', null, '', 'page2.png', undefined]
};
const result = sanitizeChapters(input);

expect(result.chapters['Chapter 1']).toEqual(['page1.png', 'page2.png']);
```
**Purpose:** Ensures data cleaning removes invalid page entries

##### Test: "should create sorted order array"
```javascript
const input = {
  'Chapter 10': ['page1.png'],
  'Chapter 2': ['page1.png'],
  'Chapter 1': ['page1.png']
};
const result = sanitizeChapters(input);

expect(result.order).toEqual(['Chapter 1', 'Chapter 2', 'Chapter 10']);
```
**Purpose:** Verifies the order array is properly sorted

---

#### `sortChapterNamesWithMeta` (2 tests)

Tests sorting with displayNumber metadata when available.

##### Test: "should sort by displayNumber when available"
```javascript
const names = ['Start Here', 'Issue 10', 'Issue 2'];
const meta = {
  'Start Here': { displayNumber: 1 },
  'Issue 2': { displayNumber: 2 },
  'Issue 10': { displayNumber: 10 }
};

expect(sortChapterNamesWithMeta(names, meta)).toEqual([
  'Start Here',
  'Issue 2',
  'Issue 10'
]);
```
**Purpose:** Uses displayNumber as the primary sort when present

##### Test: "should fall back to name sorting when displayNumber missing"
```javascript
const names = ['Bonus', 'Issue 2', 'Issue 10'];
const meta = { 'Issue 10': { displayNumber: 10 } };

expect(sortChapterNamesWithMeta(names, meta)).toEqual([
  'Issue 10',
  'Issue 2',
  'Bonus'
]);
```
**Purpose:** Falls back to name sorting when metadata is incomplete

---

## state.test.js

**File:** `tests/state.test.js`
**Covers:** `reader/state.js`

### Test Suites

#### `state object` (3 tests)

Tests the global state object structure and initialization.

##### Test: "should have correct initial structure"
```javascript
expect(state).toHaveProperty('currentChapter');
expect(state).toHaveProperty('pages');
expect(state).toHaveProperty('pageIndex');
expect(state).toHaveProperty('scale');
expect(state).toHaveProperty('pan');
expect(state).toHaveProperty('imageCache');
```
**Purpose:** Verifies all required properties exist on the state object

##### Test: "should initialize with default values"
```javascript
expect(state.currentChapter).toBe('');
expect(state.pages).toEqual([]);
expect(state.pageIndex).toBe(0);
expect(state.scale).toBe(1);
expect(state.pan).toEqual({ x: 0, y: 0 });
```
**Purpose:** Ensures sensible defaults for initial state

##### Test: "should have Map for imageCache"
```javascript
expect(state.imageCache).toBeInstanceOf(Map);
```
**Purpose:** Verifies correct data structure for image cache

---

#### `saveProgress` (4 tests)

Tests the localStorage persistence functionality.

##### Test: "should save progress to localStorage"
```javascript
const testState = {
  currentChapter: 'Chapter 1',
  pageIndex: 5
};

saveProgress(testState);

const saved = localStorage.getItem('battleBros_progress');
expect(saved).toBeTruthy();

const parsed = JSON.parse(saved);
expect(parsed.chapter).toBe('Chapter 1');
expect(parsed.page).toBe(5);
expect(parsed.timestamp).toBeDefined();
```
**Purpose:** Verifies basic save functionality and data structure

##### Test: "should use global state if no argument provided"
```javascript
state.currentChapter = 'Chapter 2';
state.pageIndex = 3;

saveProgress();

const saved = localStorage.getItem('battleBros_progress');
const parsed = JSON.parse(saved);
expect(parsed.chapter).toBe('Chapter 2');
expect(parsed.page).toBe(3);
```
**Purpose:** Tests default parameter behavior (uses global state)

##### Test: "should include timestamp"
```javascript
const before = Date.now();
saveProgress({ currentChapter: 'Test', pageIndex: 0 });
const after = Date.now();

const saved = JSON.parse(localStorage.getItem('battleBros_progress'));
expect(saved.timestamp).toBeGreaterThanOrEqual(before);
expect(saved.timestamp).toBeLessThanOrEqual(after);
```
**Purpose:** Verifies timestamp is current and accurate

##### Test: "should handle localStorage errors gracefully"
```javascript
const originalSetItem = localStorage.setItem;
localStorage.setItem = () => {
  throw new Error('Storage full');
};

expect(() => {
  saveProgress({ currentChapter: 'Test', pageIndex: 0 });
}).not.toThrow();

localStorage.setItem = originalSetItem;
```
**Purpose:** Tests error resilience (quota exceeded, privacy mode, etc.)

---

#### `loadProgress` (4 tests)

Tests the progress restoration functionality.

##### Test: "should load saved progress"
```javascript
const testData = {
  chapter: 'Chapter 3',
  page: 7,
  timestamp: Date.now()
};

localStorage.setItem('battleBros_progress', JSON.stringify(testData));

const loaded = loadProgress();
expect(loaded.chapter).toBe('Chapter 3');
expect(loaded.page).toBe(7);
expect(loaded.timestamp).toBe(testData.timestamp);
```
**Purpose:** Verifies basic load functionality

##### Test: "should return null if no progress saved"
```javascript
const loaded = loadProgress();
expect(loaded).toBeNull();
```
**Purpose:** Tests behavior when no saved data exists

##### Test: "should return null for invalid JSON"
```javascript
localStorage.setItem('battleBros_progress', 'invalid json {');

const loaded = loadProgress();
expect(loaded).toBeNull();
```
**Purpose:** Ensures graceful handling of corrupted data

##### Test: "should handle localStorage errors gracefully"
```javascript
const originalGetItem = localStorage.getItem;
localStorage.getItem = () => {
  throw new Error('Storage error');
};

const loaded = loadProgress();
expect(loaded).toBeNull();

localStorage.getItem = originalGetItem;
```
**Purpose:** Tests error resilience for storage access failures

---

## render.test.js

**File:** `tests/render.test.js`
**Covers:** core rendering logic

### Test Suites

#### `isTwoPageMode` (6 tests)

Tests the viewport detection logic for two-page spread mode.

##### Test: "should return true for wide viewport"
```javascript
global.innerWidth = 1200;
global.innerHeight = 800;

expect(isTwoPageMode()).toBe(true);
```
**Purpose:** Verifies detection of suitable two-page viewport

##### Test: "should return false for narrow viewport"
```javascript
global.innerWidth = 600;
global.innerHeight = 800;

expect(isTwoPageMode()).toBe(false);
```
**Purpose:** Ensures narrow viewports use single-page mode

##### Test: "should return false if width below breakpoint"
```javascript
global.innerWidth = 800; // Below 900px breakpoint
global.innerHeight = 600;

expect(isTwoPageMode()).toBe(false);
```
**Purpose:** Tests the width breakpoint (900px minimum)

##### Test: "should return false for tall/narrow aspect ratio"
```javascript
global.innerWidth = 1000;
global.innerHeight = 1600; // Aspect ratio < 0.714

expect(isTwoPageMode()).toBe(false);
```
**Purpose:** Tests the aspect ratio threshold (0.714 minimum)

##### Test: "should handle edge case at exact breakpoint"
```javascript
global.innerWidth = 900;
global.innerHeight = 1200; // Aspect ratio = 0.75 > 0.714

expect(isTwoPageMode()).toBe(true);
```
**Purpose:** Verifies boundary condition at exact breakpoint

##### Test: "should handle edge case at exact aspect ratio"
```javascript
global.innerWidth = 1000;
global.innerHeight = 1400; // Aspect ratio ≈ 0.714

const result = isTwoPageMode();
expect(typeof result).toBe('boolean');
```
**Purpose:** Tests behavior at aspect ratio threshold

---

#### `canShowTwoPages` (4 tests)

Tests whether two pages can actually be displayed (combines viewport check with page availability).

##### Test: "should return true when two-page mode active and next page exists"
```javascript
mockState.pageIndex = 0;
expect(canShowTwoPages()).toBe(true);
```
**Purpose:** Verifies basic two-page availability

##### Test: "should return false when on last page"
```javascript
mockState.pageIndex = 2; // Last page
expect(canShowTwoPages()).toBe(false);
```
**Purpose:** Ensures last page is shown alone (no blank right page)

##### Test: "should return false when viewport too narrow"
```javascript
global.innerWidth = 600;
mockState.pageIndex = 0;

expect(canShowTwoPages()).toBe(false);
```
**Purpose:** Tests viewport constraint

##### Test: "should return false when only one page remains"
```javascript
mockState.pageIndex = 1; // Second-to-last page
mockState.pages = ['page1.png', 'page2.png'];

expect(canShowTwoPages()).toBe(false);
```
**Purpose:** Verifies correct behavior at chapter end

---

## Additional Test Files

- `tests/data.test.js` — `reader/data.js` loaders (entry normalization, error handling, subtitles).
- `tests/utils.test.js` — `admin/utils.js` helpers (tag parsing, page sorting, media IDs, folder sanitizing).
- `tests/series.test.js` — `reader/series.js` helpers (series ID normalization and data/config paths).
- `tests/comment-targets.test.js` — comment target ID helpers (`entry-*` and `post:*`).
- `tests/admin-smoke.test.js` — admin UI smoke coverage in happy-dom (boot + basic post/entry flows).

---

## Running Tests

### Prerequisites

**Node.js Required:** Download from https://nodejs.org/

### Installation

```bash
cd /srv/bw-quality
npm install
```

This installs:
- `vitest` - Test runner
- `happy-dom` - DOM simulation
- `@vitest/ui` - Optional test UI

### Test Commands

#### Run all tests once
```bash
npm test
```

**Output (example; counts vary):**
```
 RUN  v1.0.4 /srv/bw-quality

 ✓ tests/chapters.test.js
 ✓ tests/state.test.js
 ✓ tests/render.test.js
 ✓ tests/data.test.js
 ✓ tests/utils.test.js
 ✓ tests/series.test.js
 ✓ tests/comment-targets.test.js
 ✓ tests/admin-smoke.test.js

Test Files  8 passed (8)
```


#### Watch mode (re-runs on file changes)
```bash
npm run test:watch
```

**Use case:** Development - tests automatically re-run when you save files

#### Interactive UI
```bash
npm run test:ui
```

**Use case:** Visual test exploration and debugging

#### Coverage report
```bash
npm run test:coverage
```

**Output:** HTML coverage report in `coverage/` directory

---

## Writing New Tests

### Basic Test Structure

```javascript
import { describe, it, expect } from 'vitest';
import { myFunction } from '../reader/mymodule.js';

describe('myFunction', () => {
  it('should do something specific', () => {
    const result = myFunction('input');
    expect(result).toBe('expected output');
  });
});
```

### Common Assertions

```javascript
// Equality
expect(value).toBe(5);                    // Strict equality (===)
expect(value).toEqual({ a: 1 });          // Deep equality

// Truthiness
expect(value).toBeTruthy();
expect(value).toBeFalsy();
expect(value).toBeNull();
expect(value).toBeUndefined();
expect(value).toBeDefined();

// Numbers
expect(value).toBeGreaterThan(3);
expect(value).toBeLessThanOrEqual(10);

// Strings
expect(string).toContain('substring');
expect(string).toMatch(/regex/);

// Arrays
expect(array).toHaveLength(3);
expect(array).toContain('item');

// Objects
expect(obj).toHaveProperty('key');
expect(obj).toHaveProperty('key', 'value');

// Exceptions
expect(() => fn()).toThrow();
expect(() => fn()).toThrow('error message');
```

### Setup and Teardown

```javascript
import { beforeEach, afterEach } from 'vitest';

describe('my tests', () => {
  beforeEach(() => {
    // Runs before each test
    localStorage.clear();
  });

  afterEach(() => {
    // Runs after each test
  });

  it('test 1', () => { /* ... */ });
  it('test 2', () => { /* ... */ });
});
```

### Mocking

```javascript
import { vi } from 'vitest';

// Mock a module
vi.mock('../reader/config.js', () => ({
  CONFIG: {
    ZOOM_STEP: 1.5
  }
}));

// Mock a function
const mockFn = vi.fn();
mockFn.mockReturnValue(42);
expect(mockFn()).toBe(42);
expect(mockFn).toHaveBeenCalled();
```

---

## Continuous Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm install
      
      - name: Run tests
        run: npm test
      
      - name: Generate coverage
        run: npm run test:coverage
```

---

## Test Statistics

| Metric | Value |
|--------|-------|
| **Total Tests** | Run `npm test` for current totals |
| **Test Files** | 8 |
| **Coverage** | Focused unit + smoke coverage |
| **Framework** | Vitest 1.0.4 |

---

## Future Test Additions

Consider adding tests for:

### High Priority
- **pointer.js** - Touch/pan/zoom gesture handling (complex logic)
- **transform.js** - Zoom calculation edge cases
- **data.js** - Expand edge case coverage (bad payloads, timeouts)

### Medium Priority
- **fullscreen.js** - Fullscreen mode transitions
- **gallery.js** - Gallery rendering and interactions
- **controls.js** - Page navigation edge cases

### Low Priority
- **Integration tests** - Complete user flows (load → navigate → zoom)
- **E2E tests** - Browser automation with Playwright/Cypress

---

## Troubleshooting

### Tests fail with "Cannot find module"
**Solution:** Ensure you're using Node.js 18+ with ES modules support

### localStorage is undefined
**Solution:** Tests use the mock in `tests/setup.js` - ensure it's loaded

### Tests pass locally but fail in CI
**Solution:** Check Node.js version consistency between local and CI

### Slow test execution
**Solution:** Use `npm run test:watch` for faster incremental runs

---

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [Jest API Reference](https://jestjs.io/docs/api) (Vitest is compatible)

---

## Summary

The Battle Bros reader test suite provides:

✅ **Focused coverage** of reader + admin helpers  
✅ **Fast execution** with Vitest (timing varies by machine)  
✅ **Living documentation** showing how code should behave  
✅ **Regression prevention** catching common UI/data bugs  
✅ **Developer confidence** enabling safe refactoring  

**Totals:** Run `npm test` for current counts.
