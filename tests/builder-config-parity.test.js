import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { getModuleDescriptors } from '../shared/page-builder/module-descriptors.js';
import { BUILDER_DEVICE_ORDER } from '../shared/page-builder/preview-contract.js';
import { HTML_TAGS, TEXT_TAGS, sanitizeBuilderHtml } from '../shared/page-builder/sanitize.js';

/**
 * JS side of the JS<->Python builder schema parity fixture.
 *
 * tests/fixtures/builder-config-parity.json is the single source of truth shared with
 * backend/tests/test_builder_config_parity.py. This suite pins the JS descriptors,
 * device ids, HTML allowlists, and HTML sanitizer output to the fixture; the Python
 * suite pins its sanitizers to the same file. Drift on either side fails one of the
 * two suites.
 *
 * The moduleConfigs coverage check means a new module type cannot land without a
 * fixture entry — and the fixture entry cannot land without the Python suite agreeing
 * on its sanitized shape.
 */
const fixture = JSON.parse(readFileSync('tests/fixtures/builder-config-parity.json', 'utf8'));

describe('builder config parity (JS side)', () => {
  it('module descriptor types match the fixture', () => {
    const types = getModuleDescriptors()
      .map((descriptor) => descriptor.type)
      .sort();
    expect(types).toEqual(fixture.moduleTypes);
  });

  it('builder device ids match the fixture', () => {
    expect([...BUILDER_DEVICE_ORDER]).toEqual(fixture.deviceIds);
  });

  it('HTML tag allowlists match the fixture', () => {
    expect([...TEXT_TAGS].sort()).toEqual(fixture.htmlAllowlists.text);
    expect([...HTML_TAGS].sort()).toEqual(fixture.htmlAllowlists.html);
  });

  it('sanitizeBuilderHtml matches the shared expected outputs', () => {
    for (const sample of fixture.htmlSamples) {
      expect(sanitizeBuilderHtml(sample.input, sample.mode), sample.name).toBe(sample.expected);
    }
  });

  it('every module type has a sanitization case in the fixture', () => {
    expect(Object.keys(fixture.moduleConfigs).sort()).toEqual(fixture.moduleTypes);
  });
});
