import { describe, expect, it } from 'vitest';

import {
  BUILDER_PREVIEW_MESSAGE_TYPES,
  BUILDER_PREVIEW_SOURCES,
  BUILDER_PREVIEW_SNAPSHOT_VERSION,
  PREVIEW_MEDIA_QUERIES,
  PREVIEW_VIEWPORT_ORDER,
  PREVIEW_VIEWPORTS,
  buildPreviewControlMessage,
  buildPreviewMetricsMessage,
  buildPreviewSnapshotMessage,
  getPreviewStatusCopy,
  getPreviewViewport,
  isPreviewMessageType,
  isPreviewSource,
  isPreviewViewportId,
  validatePreviewEnvelope,
  validatePreviewMetricsPayload,
  validatePreviewSnapshotPayload,
} from '../admin/page-builder/preview-contract.js';

describe('admin page-builder preview contract', () => {
  it('defines ordered viewport presets with iframe dimensions', () => {
    expect(PREVIEW_VIEWPORT_ORDER).toEqual(['desktop', 'tablet', 'mobile']);
    expect(PREVIEW_VIEWPORTS.desktop).toMatchObject({ width: 1280, height: 900 });
    expect(PREVIEW_VIEWPORTS.tablet).toMatchObject({ width: 768, height: 1024 });
    expect(PREVIEW_VIEWPORTS.mobile).toMatchObject({ width: 375, height: 812 });
    expect(BUILDER_PREVIEW_SNAPSHOT_VERSION).toBe(1);
  });

  it('validates viewport ids and falls back to desktop', () => {
    expect(isPreviewViewportId('desktop')).toBe(true);
    expect(isPreviewViewportId('tablet')).toBe(true);
    expect(isPreviewViewportId('mobile')).toBe(true);
    expect(isPreviewViewportId('wide')).toBe(false);

    expect(getPreviewViewport('mobile')).toBe(PREVIEW_VIEWPORTS.mobile);
    expect(getPreviewViewport('wide')).toBe(PREVIEW_VIEWPORTS.desktop);
    expect(getPreviewViewport()).toBe(PREVIEW_VIEWPORTS.desktop);
  });

  it('defines source validation and status copy', () => {
    expect(isPreviewSource(BUILDER_PREVIEW_SOURCES.SAVED)).toBe(true);
    expect(isPreviewSource(BUILDER_PREVIEW_SOURCES.WORKING)).toBe(true);
    expect(isPreviewSource('published')).toBe(false);
    expect(getPreviewStatusCopy(BUILDER_PREVIEW_SOURCES.SAVED)).toBe('Previewing saved draft');
    expect(getPreviewStatusCopy(BUILDER_PREVIEW_SOURCES.WORKING)).toBe(
      'Previewing unsaved working changes'
    );
    expect(getPreviewStatusCopy('unknown')).toBe('Previewing saved draft');
  });

  it('builds and validates preview message envelopes separately from payloads', () => {
    const snapshot = {
      seriesId: 'battle-bros',
      pageId: 'page-1',
      pageSlug: 'reader',
      draftMode: 'published',
      snapshotVersion: BUILDER_PREVIEW_SNAPSHOT_VERSION,
      source: BUILDER_PREVIEW_SOURCES.SAVED,
      page: { id: 'page-1', sections: [] },
      options: {},
    };
    const expected = {
      previewSession: 'session-1',
      seriesId: 'battle-bros',
      pageId: 'page-1',
      pageSlug: 'reader',
    };

    expect(isPreviewMessageType(BUILDER_PREVIEW_MESSAGE_TYPES.REQUEST_SNAPSHOT)).toBe(true);
    expect(isPreviewMessageType(BUILDER_PREVIEW_MESSAGE_TYPES.SNAPSHOT)).toBe(true);
    expect(isPreviewMessageType(BUILDER_PREVIEW_MESSAGE_TYPES.ACK)).toBe(true);
    expect(isPreviewMessageType(BUILDER_PREVIEW_MESSAGE_TYPES.ERROR)).toBe(true);
    expect(isPreviewMessageType(BUILDER_PREVIEW_MESSAGE_TYPES.METRICS)).toBe(true);
    expect(isPreviewMessageType('builder-preview:other')).toBe(false);

    expect(validatePreviewSnapshotPayload(snapshot, expected)).toEqual({ valid: true, reason: '' });
    expect(
      validatePreviewSnapshotPayload(
        {
          ...snapshot,
          options: { builderEditing: true },
        },
        expected
      )
    ).toEqual({ valid: true, reason: '' });

    const envelope = buildPreviewSnapshotMessage(snapshot, 'session-1');
    expect(envelope).toEqual({
      type: BUILDER_PREVIEW_MESSAGE_TYPES.SNAPSHOT,
      previewSession: 'session-1',
      snapshot,
    });
    expect(validatePreviewEnvelope(envelope, expected)).toEqual({ valid: true, reason: '' });

    const ack = buildPreviewControlMessage(BUILDER_PREVIEW_MESSAGE_TYPES.ACK, expected);
    expect(validatePreviewEnvelope(ack, expected)).toEqual({ valid: true, reason: '' });

    expect(
      validatePreviewEnvelope(buildPreviewSnapshotMessage(snapshot, 'wrong-session'), expected)
        .valid
    ).toBe(false);
    expect(
      validatePreviewSnapshotPayload({ ...snapshot, snapshotVersion: 99 }, expected).valid
    ).toBe(false);
    expect(validatePreviewSnapshotPayload({ ...snapshot, pageSlug: 'about' }, expected).valid).toBe(
      false
    );
    expect(
      validatePreviewSnapshotPayload({ ...snapshot, options: { builderEditing: 'true' } }, expected)
        .valid
    ).toBe(false);
    expect(validatePreviewEnvelope({ type: 'unknown' }, expected).valid).toBe(false);
  });

  it('builds and validates preview metrics payloads', () => {
    const expected = {
      previewSession: 'session-1',
      seriesId: 'battle-bros',
      pageId: 'page-1',
      pageSlug: 'reader',
    };
    const branchFlags = Object.fromEntries(
      Object.keys(PREVIEW_MEDIA_QUERIES).map((key) => [key, key !== 'maxWidth480'])
    );
    const metrics = {
      viewport: { ...PREVIEW_VIEWPORTS.tablet },
      innerWidth: 768,
      innerHeight: 1024,
      pageSlug: 'reader',
      snapshotVersion: BUILDER_PREVIEW_SNAPSHOT_VERSION,
      twoPageMode: false,
      branchFlags,
      overflow: {
        hasOverflow: false,
        rootHasOverflow: false,
        offenders: [],
      },
      debugNote: 'extra debug fields are tolerated',
    };

    expect(validatePreviewMetricsPayload(metrics, expected)).toEqual({ valid: true, reason: '' });

    const envelope = buildPreviewMetricsMessage(metrics, expected);
    expect(envelope).toEqual({
      type: BUILDER_PREVIEW_MESSAGE_TYPES.METRICS,
      previewSession: 'session-1',
      snapshotVersion: BUILDER_PREVIEW_SNAPSHOT_VERSION,
      seriesId: 'battle-bros',
      pageId: 'page-1',
      pageSlug: 'reader',
      metrics,
    });
    expect(validatePreviewEnvelope(envelope, expected)).toEqual({ valid: true, reason: '' });

    expect(validatePreviewMetricsPayload({ ...metrics, innerWidth: '768' }, expected).valid).toBe(
      false
    );
    expect(
      validatePreviewMetricsPayload(
        {
          ...metrics,
          branchFlags: { ...branchFlags, maxWidth768: undefined },
        },
        expected
      ).valid
    ).toBe(false);
    expect(
      validatePreviewEnvelope(
        buildPreviewMetricsMessage(metrics, { ...expected, pageSlug: 'about' }),
        expected
      ).valid
    ).toBe(false);
    expect(validatePreviewMetricsPayload({ ...metrics, pageSlug: 'about' }, expected).valid).toBe(
      false
    );
  });
});
