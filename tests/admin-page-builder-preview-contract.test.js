import { describe, expect, it } from 'vitest';

import {
  BUILDER_DEVICE_ORDER,
  BUILDER_DEVICES,
  BUILDER_PREVIEW_MESSAGE_TYPES,
  BUILDER_PREVIEW_SOURCES,
  BUILDER_PREVIEW_SNAPSHOT_VERSION,
  PREVIEW_MEDIA_QUERIES,
  PREVIEW_VIEWPORT_ORDER,
  PREVIEW_VIEWPORTS,
  buildPreviewControlMessage,
  buildPreviewInlineEditMessage,
  buildPreviewMetricsMessage,
  buildPreviewSnapshotMessage,
  buildPreviewTargetMessage,
  getPreviewStatusCopy,
  getPreviewViewport,
  getBuilderDevice,
  isBuilderDeviceId,
  isPreviewMessageType,
  isPreviewSource,
  isPreviewViewportId,
  validatePreviewEnvelope,
  validatePreviewMetricsPayload,
  validatePreviewSnapshotPayload,
  validatePreviewTargetGeometry,
  validatePreviewTargetRef,
  validatePreviewInlineEditPayload,
} from '../admin/page-builder/preview-contract.js';

describe('admin page-builder preview contract', () => {
  it('defines ordered viewport presets with iframe dimensions', () => {
    expect(PREVIEW_VIEWPORT_ORDER).toEqual(['desktop', 'tablet', 'mobile']);
    expect(BUILDER_DEVICE_ORDER).toEqual(['desktop', 'tablet', 'mobile']);
    expect(PREVIEW_VIEWPORTS.desktop).toMatchObject({ width: 1920, height: 1080 });
    expect(PREVIEW_VIEWPORTS.tablet).toMatchObject({ width: 768, height: 1024 });
    expect(PREVIEW_VIEWPORTS.mobile).toMatchObject({ width: 375, height: 812 });
    expect(PREVIEW_VIEWPORTS.mobile.label).toBe('Mobile');
    expect(BUILDER_DEVICES.mobile).toMatchObject({ id: 'mobile', label: 'Phone', width: 375 });
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

    expect(isBuilderDeviceId('mobile')).toBe(true);
    expect(isBuilderDeviceId('watch')).toBe(false);
    expect(getBuilderDevice('mobile')).toBe(BUILDER_DEVICES.mobile);
    expect(getBuilderDevice('watch')).toBe(BUILDER_DEVICES.desktop);
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
    expect(isPreviewMessageType(BUILDER_PREVIEW_MESSAGE_TYPES.TARGETS)).toBe(true);
    expect(isPreviewMessageType(BUILDER_PREVIEW_MESSAGE_TYPES.TARGET_HOVER)).toBe(true);
    expect(isPreviewMessageType(BUILDER_PREVIEW_MESSAGE_TYPES.TARGET_SELECT)).toBe(true);
    expect(isPreviewMessageType(BUILDER_PREVIEW_MESSAGE_TYPES.TARGET_ACTION)).toBe(true);
    expect(isPreviewMessageType(BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_START)).toBe(true);
    expect(isPreviewMessageType(BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_CHANGE)).toBe(true);
    expect(isPreviewMessageType(BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_COMMIT)).toBe(true);
    expect(isPreviewMessageType(BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_CANCEL)).toBe(true);
    expect(isPreviewMessageType('builder-preview:other')).toBe(false);

    expect(validatePreviewSnapshotPayload(snapshot, expected)).toEqual({ valid: true, reason: '' });
    expect(
      validatePreviewSnapshotPayload(
        {
          ...snapshot,
          options: { builderEditing: true, deviceId: 'mobile' },
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
    expect(
      validatePreviewSnapshotPayload({ ...snapshot, options: { deviceId: 'watch' } }, expected)
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

  it('builds and validates preview target payloads', () => {
    const expected = {
      previewSession: 'session-1',
      seriesId: 'battle-bros',
      pageId: 'page-1',
      pageSlug: 'reader',
    };
    const target = {
      kind: 'module',
      key: 'module:module-1',
      pageId: 'page-1',
      sectionId: 'section-1',
      columnIndex: 0,
      moduleId: 'module-1',
      moduleType: 'text',
    };
    const geometry = {
      target,
      rect: { top: 10, left: 20, right: 220, bottom: 90, width: 200, height: 80 },
      visible: true,
      order: 0,
      label: 'Text module',
    };

    expect(validatePreviewTargetRef(target)).toEqual({ valid: true, reason: '' });
    expect(validatePreviewTargetGeometry(geometry)).toEqual({ valid: true, reason: '' });

    const targets = buildPreviewTargetMessage(
      BUILDER_PREVIEW_MESSAGE_TYPES.TARGETS,
      { sequence: 7, targets: [geometry] },
      expected
    );
    expect(validatePreviewEnvelope(targets, expected)).toEqual({ valid: true, reason: '' });

    const hover = buildPreviewTargetMessage(
      BUILDER_PREVIEW_MESSAGE_TYPES.TARGET_HOVER,
      { sequence: 7, target: null },
      expected
    );
    expect(validatePreviewEnvelope(hover, expected)).toEqual({ valid: true, reason: '' });

    const select = buildPreviewTargetMessage(
      BUILDER_PREVIEW_MESSAGE_TYPES.TARGET_SELECT,
      { sequence: 7, target },
      expected
    );
    expect(validatePreviewEnvelope(select, expected)).toEqual({ valid: true, reason: '' });

    const action = buildPreviewTargetMessage(
      BUILDER_PREVIEW_MESSAGE_TYPES.TARGET_ACTION,
      { sequence: 7, action: 'scroll-into-view', target },
      expected
    );
    expect(validatePreviewEnvelope(action, expected)).toEqual({ valid: true, reason: '' });
  });

  it('rejects invalid preview target payloads', () => {
    const expected = {
      previewSession: 'session-1',
      seriesId: 'battle-bros',
      pageId: 'page-1',
      pageSlug: 'reader',
    };
    const target = {
      kind: 'module',
      key: 'module:module-1',
      pageId: 'page-1',
      moduleId: 'module-1',
    };
    const geometry = {
      target,
      rect: { top: 10, left: 20, right: 220, bottom: 90, width: 200, height: 80 },
      visible: true,
      order: 0,
      label: 'Module',
    };

    expect(validatePreviewTargetRef({ ...target, kind: 'widget' }).valid).toBe(false);
    expect(validatePreviewTargetRef({ ...target, moduleId: '' }).valid).toBe(false);
    expect(
      validatePreviewTargetGeometry({
        ...geometry,
        rect: { ...geometry.rect, width: Number.NaN },
      }).valid
    ).toBe(false);
    expect(
      validatePreviewEnvelope(
        buildPreviewTargetMessage(
          BUILDER_PREVIEW_MESSAGE_TYPES.TARGETS,
          { sequence: 1, targets: [{ ...geometry, label: 'x'.repeat(140) }] },
          expected
        ),
        expected
      ).valid
    ).toBe(false);
    expect(
      validatePreviewEnvelope(
        buildPreviewTargetMessage(
          BUILDER_PREVIEW_MESSAGE_TYPES.TARGET_ACTION,
          { sequence: 1, action: 'delete-target', target },
          expected
        ),
        expected
      ).valid
    ).toBe(false);
    expect(
      validatePreviewEnvelope(
        buildPreviewTargetMessage(
          BUILDER_PREVIEW_MESSAGE_TYPES.TARGET_SELECT,
          { sequence: 1, target },
          { ...expected, pageSlug: 'about' }
        ),
        expected
      ).valid
    ).toBe(false);
  });

  it('builds and validates inline edit messages for text content only', () => {
    const expected = {
      previewSession: 'session-1',
      seriesId: 'battle-bros',
      pageId: 'page-1',
      pageSlug: 'reader',
    };
    const target = {
      kind: 'module',
      key: 'module:module-1',
      pageId: 'page-1',
      sectionId: 'section-1',
      columnIndex: 0,
      moduleId: 'module-1',
      moduleType: 'text',
    };
    const change = buildPreviewInlineEditMessage(
      BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_CHANGE,
      {
        sequence: 4,
        target,
        field: 'content',
        value: '<p><strong>Updated</strong> text</p>',
      },
      expected
    );

    expect(validatePreviewInlineEditPayload(change)).toEqual({ valid: true, reason: '' });
    expect(validatePreviewEnvelope(change, expected)).toEqual({ valid: true, reason: '' });
    expect(
      validatePreviewEnvelope(
        buildPreviewInlineEditMessage(
          BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_START,
          { sequence: 4, target, field: 'content' },
          expected
        ),
        expected
      )
    ).toEqual({ valid: true, reason: '' });
    expect(
      validatePreviewEnvelope(
        buildPreviewInlineEditMessage(
          BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_CANCEL,
          { sequence: 4, target, field: 'content', reason: 'escape' },
          expected
        ),
        expected
      )
    ).toEqual({ valid: true, reason: '' });

    expect(
      validatePreviewEnvelope(
        buildPreviewInlineEditMessage(
          BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_CHANGE,
          {
            sequence: 4,
            target: { ...target, moduleType: 'buttons' },
            field: 'content',
            value: 'x',
          },
          expected
        ),
        expected
      ).valid
    ).toBe(false);
    expect(
      validatePreviewEnvelope(
        buildPreviewInlineEditMessage(
          BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_CHANGE,
          { sequence: 4, target, field: 'style', value: 'x' },
          expected
        ),
        expected
      ).valid
    ).toBe(false);
    expect(
      validatePreviewEnvelope(
        {
          ...buildPreviewInlineEditMessage(
            BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_CHANGE,
            { sequence: 4, target, field: 'content', value: 'x' },
            expected
          ),
          value: 'x'.repeat(50001),
        },
        expected
      ).valid
    ).toBe(false);
    expect(
      validatePreviewEnvelope(
        buildPreviewInlineEditMessage(
          BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_CHANGE,
          { sequence: 4, target, field: 'content', value: 'x' },
          { ...expected, pageId: 'wrong-page' }
        ),
        expected
      ).valid
    ).toBe(false);
  });
});
