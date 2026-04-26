/**
 * Tests for comment target helpers
 */

import { describe, it, expect } from 'vitest';
import { slugifyTarget, buildEntryTargetId, buildPostTargetId } from '../reader/comment-targets.js';

describe('slugifyTarget', () => {
  it('should normalize to lowercase and hyphenate', () => {
    expect(slugifyTarget('Entry 1!!!')).toBe('entry-1');
  });

  it('should keep allowed characters', () => {
    expect(slugifyTarget('post:abc-123')).toBe('post:abc-123');
  });
});

describe('buildEntryTargetId', () => {
  it('should use displayNumber when provided', () => {
    const target = buildEntryTargetId({
      seriesId: 'battle-bros',
      entryName: 'Start Here',
      displayNumber: 1,
    });
    expect(target).toBe('battle-bros:entry-1');
  });

  it('should fall back to slugified name when no displayNumber', () => {
    const target = buildEntryTargetId({
      seriesId: 'battle-bros',
      entryName: 'Start Here',
    });
    expect(target).toBe('battle-bros:start-here');
  });
});

describe('buildPostTargetId', () => {
  it('should prefix post id', () => {
    expect(buildPostTargetId('abc-123')).toBe('post:abc-123');
  });
});
