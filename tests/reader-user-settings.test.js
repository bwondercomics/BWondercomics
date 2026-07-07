import { afterEach, describe, expect, it, vi } from 'vitest';

// Phase 6 contract: Account Settings triggers bind by class delegation, so a
// builder-placed `account` module (.pb-account-btn) opens the same overlay as the
// fixed shell gear — even when the id-bound shell button is absent (hidden pages).
describe('user settings delegated trigger binding', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('opens the overlay from a module-rendered account button without the shell button', async () => {
    document.body.innerHTML = `
      <div class="pb-module pb-module--account">
        <div class="pb-account">
          <button type="button" class="pb-account-btn" aria-label="Account settings"></button>
        </div>
      </div>
      <div id="userSettingsOverlay" aria-hidden="true">
        <div id="userSettingsAuth"></div>
        <div id="userSettingsContent"></div>
      </div>
    `;
    // loadSettings() swallows fetch failures and falls back to the auth view.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      })
    );

    await import('../reader/user-settings.js');

    document
      .querySelector('.pb-account-btn')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    const overlay = document.getElementById('userSettingsOverlay');
    expect(overlay.classList.contains('active')).toBe(true);
    expect(overlay.getAttribute('aria-hidden')).toBe('false');
  });
});
