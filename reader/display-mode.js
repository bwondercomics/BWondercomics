// Shared reader display-mode helper.
//
// The active display mode is published on `document.body.dataset.readerDisplayMode`
// by `applyReaderModuleShellSettings()` (reader/data.js) from the effective reader
// module config. Every runtime branch (render, analytics, pointer, controls)
// reads it through here so they always agree on the active mode.

export function getActiveDisplayMode() {
  if (typeof document === 'undefined' || !document.body) return 'paged';
  return document.body.dataset.readerDisplayMode === 'vertical-scroll'
    ? 'vertical-scroll'
    : 'paged';
}

export function isVerticalMode() {
  return getActiveDisplayMode() === 'vertical-scroll';
}
