import { describe, expect, it } from 'vitest';

import { mountAdminDom } from './helpers/admin-fixture.js';

describe('admin designer shell cleanup', () => {
  it('keeps the Page Designer nav button but removes the legacy iframe host from the admin shell', () => {
    mountAdminDom();

    expect(document.getElementById('btnDesigner')).not.toBeNull();
    expect(document.getElementById('pageBuilderSection')).not.toBeNull();
    expect(document.getElementById('designerSection')).toBeNull();
    expect(document.getElementById('designerFrame')).toBeNull();
  });
});
