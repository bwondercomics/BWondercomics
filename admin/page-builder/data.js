export async function fetchPages(seriesId) {
  try {
    const res = await fetch(`/api/admin/pages?series_id=${encodeURIComponent(seriesId)}`, {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!res.ok) throw new Error('Failed to fetch pages');
    const data = await res.json();
    return data.pages || [];
  } catch (err) {
    console.error('fetchPages error:', err);
    return [];
  }
}

export async function fetchPage(pageId) {
  try {
    const res = await fetch(`/api/admin/pages/${pageId}`, {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!res.ok) throw new Error('Failed to fetch page');
    const data = await res.json();
    return data.page || null;
  } catch (err) {
    console.error('fetchPage error:', err);
    return null;
  }
}

export async function createPage(seriesId, slug, title) {
  try {
    const res = await fetch(`/api/admin/pages?series_id=${encodeURIComponent(seriesId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, title }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create page');
    }
    const data = await res.json();
    return data.page;
  } catch (err) {
    console.error('createPage error:', err);
    alert(err.message || 'Failed to create page');
    return null;
  }
}

export async function deletePage(pageId) {
  try {
    const res = await fetch(`/api/admin/pages/${pageId}`, { method: 'DELETE' });
    return res.ok;
  } catch (err) {
    console.error('deletePage error:', err);
    return false;
  }
}

export async function updatePage(pageId, data) {
  try {
    const res = await fetch(`/api/admin/pages/${pageId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update page');
    return (await res.json()).page;
  } catch (err) {
    console.error('updatePage error:', err);
    return null;
  }
}

export async function fetchAssets() {
  try {
    const res = await fetch('/api/admin/assets', { cache: 'no-store', credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to load assets');
    const items = Array.isArray(data.items) ? data.items : [];
    return items.map((item) => ({
      path: item.path,
      label: item.name || item.path?.split('/').pop() || item.path,
      thumbSrc: item.path,
    }));
  } catch (err) {
    console.error('fetchAssets error:', err);
    return [];
  }
}

export async function uploadAsset(file, readFileAsBase64) {
  const payload = { file: { name: file.name, data: await readFileAsBase64(file) } };
  const res = await fetch('/api/admin/assets/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'include',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data;
}

export async function addSection(pageId, sectionType = 'row', layout = '1') {
  try {
    const res = await fetch(`/api/admin/pages/${pageId}/sections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sectionType, layout }),
    });
    if (!res.ok) throw new Error('Failed to add section');
    const data = await res.json();
    return data.section;
  } catch (err) {
    console.error('addSection error:', err);
    return null;
  }
}

export async function updateSection(sectionId, data) {
  try {
    const res = await fetch(`/api/admin/sections/${sectionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update section');
    return (await res.json()).section;
  } catch (err) {
    console.error('updateSection error:', err);
    return null;
  }
}

export async function deleteSection(sectionId) {
  try {
    const res = await fetch(`/api/admin/sections/${sectionId}`, { method: 'DELETE' });
    return res.ok;
  } catch (err) {
    console.error('deleteSection error:', err);
    return false;
  }
}

export async function addModule(
  sectionId,
  moduleType,
  columnIndex = 0,
  config = {},
  sortIndex = null
) {
  try {
    const res = await fetch(`/api/admin/sections/${sectionId}/modules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        moduleType,
        columnIndex,
        config,
        ...(sortIndex === null ? {} : { sortIndex }),
      }),
    });
    if (!res.ok) throw new Error('Failed to add module');
    return (await res.json()).module;
  } catch (err) {
    console.error('addModule error:', err);
    return null;
  }
}

export async function updateModule(moduleId, data) {
  try {
    const res = await fetch(`/api/admin/modules/${moduleId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update module');
    return (await res.json()).module;
  } catch (err) {
    console.error('updateModule error:', err);
    return null;
  }
}

export async function moveModule(moduleId, targetSectionId, columnIndex, sortIndex) {
  try {
    const res = await fetch(`/api/admin/modules/${moduleId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetSectionId, columnIndex, sortIndex }),
    });
    if (!res.ok) throw new Error('Failed to move module');
    return (await res.json()).module;
  } catch (err) {
    console.error('moveModule error:', err);
    return null;
  }
}

export async function reorderModules(sectionId, columnIndex, moduleIds) {
  try {
    const res = await fetch(`/api/admin/sections/${sectionId}/modules/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ columnIndex, moduleIds }),
    });
    return res.ok;
  } catch (err) {
    console.error('reorderModules error:', err);
    return false;
  }
}

export async function deleteModule(moduleId) {
  try {
    const res = await fetch(`/api/admin/modules/${moduleId}`, { method: 'DELETE' });
    return res.ok;
  } catch (err) {
    console.error('deleteModule error:', err);
    return false;
  }
}

export async function reorderSections(pageId, sectionIds) {
  try {
    const res = await fetch(`/api/admin/pages/${pageId}/sections/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sectionIds }),
    });
    return res.ok;
  } catch (err) {
    console.error('reorderSections error:', err);
    return false;
  }
}
