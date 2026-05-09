// Compatibility module retained for the legacy script entry.
// Normal reader startup no longer fetches page-config.json or mutates the shell.

(function () {
  'use strict';
  const READER_BOOT_STATE_KEY = '__BW_READER_BOOT__';

  async function initCustomization() {
    const bootState = window[READER_BOOT_STATE_KEY];
    if (bootState?.pageConfigReady) {
      await bootState.pageConfigReady.catch(() => null);
    }
  }

  // Run initialization
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCustomization);
  } else {
    initCustomization();
  }
})();
