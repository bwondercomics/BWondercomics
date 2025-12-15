# Battle Bros Reader - Testing Guide

## Overview

This project now includes a comprehensive test suite using [Vitest](https://vitest.dev/), a modern, fast testing framework with native ES modules support.

## Test Structure

```
tests/
├── setup.js           # Test environment configuration
├── chapters.test.js   # Tests for chapter utilities
├── state.test.js      # Tests for state management
└── render.test.js     # Tests for rendering logic
```

## Prerequisites

You need Node.js installed to run the tests. Download from: https://nodejs.org/

## Installation

Install test dependencies:

```bash
npm install
```

This will install:
- `vitest` - Test runner
- `happy-dom` - Fast DOM simulation
- `@vitest/ui` - Optional UI for test visualization

## Running Tests

### Run all tests once
```bash
npm test
```

### Watch mode (re-runs on file changes)
```bash
npm run test:watch
```

### Interactive UI
```bash
npm run test:ui
```

### Coverage report
```bash
npm run test:coverage
```

## Test Coverage

Current test coverage includes:

### ✅ chapters.js (100%)
- `extractChapterNumber()` - Number extraction from chapter names
- `sortChapterNames()` - Numerical and alphabetical sorting
- `sanitizeChapters()` - Data normalization and validation

### ✅ state.js (100%)
- State object initialization
- `saveProgress()` - localStorage persistence
- `loadProgress()` - Progress restoration
- Error handling for storage failures

### ✅ render.js (Partial)
- `isTwoPageMode()` - Viewport detection logic
- `canShowTwoPages()` - Two-page availability check

## Writing New Tests

Tests use Vitest's API, which is compatible with Jest:

```javascript
import { describe, it, expect } from 'vitest';
import { myFunction } from '../reader/mymodule.js';

describe('myFunction', () => {
  it('should do something', () => {
    expect(myFunction('input')).toBe('expected output');
  });
});
```

## Continuous Integration

These tests can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Run tests
  run: npm test
```

## Benefits

✅ **Confidence** - Catch bugs before they reach production  
✅ **Documentation** - Tests serve as usage examples  
✅ **Refactoring** - Safely improve code with test coverage  
✅ **Quality** - Maintain high code standards  

## Next Steps

Consider adding tests for:
- `pointer.js` - Touch/pan/zoom interactions
- `transform.js` - Zoom calculations
- `data.js` - Async data loading (with mocked fetch)
- `controls.js` - Navigation logic
