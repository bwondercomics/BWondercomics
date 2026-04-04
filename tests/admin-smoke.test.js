/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  flushAdminUi,
  jsonResponse,
  mountAdminDom,
  stubAdminGlobals,
} from './helpers/admin-fixture.js';

describe('admin app smoke', () => {
  beforeEach(() => {
    vi.resetModules();
    mountAdminDom();
    stubAdminGlobals(vi);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        if (String(url) === '/api/session') {
          return jsonResponse({ user: null });
        }
        return jsonResponse({});
      })
    );
  });

  it('boots the unauthenticated admin shell against the live markup contract', async () => {
    await import('../admin/app.js');
    await flushAdminUi(2);

    expect(document.getElementById('loginScreen')?.style.display).toBe('flex');
    expect(document.getElementById('adminDashboard')?.style.display).toBe('none');
    expect(fetch).toHaveBeenCalledWith('/api/session', {
      cache: 'no-store',
      credentials: 'same-origin',
    });
  });
});
