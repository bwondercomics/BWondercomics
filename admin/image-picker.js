import { readFileAsBase64 } from './utils.js';

function resolveDefaultSrc(path = '') {
  const raw = String(path || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return raw;
  return `/${raw}`;
}

function getFileLabel(item) {
  if (!item) return '';
  if (item.label) return item.label;
  const path = item.path || '';
  return path.split('/').pop() || path;
}

function clampPercent(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 50;
  return Math.max(0, Math.min(100, Math.round(num)));
}

export async function openImagePicker(options = {}) {
  const {
    title = 'Select Image',
    getItems,
    onApply,
    onCancel,
    allowUpload = false,
    uploadHandler = null,
    initialSelection = null,
    resolveSrc = resolveDefaultSrc,
    showEditor = true,
    allowCrop = false,
    cropRatio = null,
  } = options;

  if (typeof getItems !== 'function') {
    throw new Error('openImagePicker requires getItems()');
  }

  let items = [];
  try {
    items = (await getItems()) || [];
  } catch (err) {
    console.error('Failed to load image picker items', err);
  }

  const modal = document.createElement('div');
  modal.className = 'ip-modal';
  modal.innerHTML = `
    <div class="ip-backdrop" aria-hidden="true"></div>
    <div class="ip-dialog" role="dialog" aria-modal="true" aria-label="${title}">
      <div class="ip-header">
        <h3>${title}</h3>
        <button type="button" class="ip-close" aria-label="Close">×</button>
      </div>
      <div class="ip-body">
        <div class="ip-list-pane">
          <div class="ip-list-header">
            <div class="ip-list-title">Images</div>
            ${allowUpload ? `<label class="ip-upload-btn">Upload<input type="file" accept="image/*" class="ip-upload-input" /></label>` : ''}
          </div>
          <div class="ip-list"></div>
        </div>
        <div class="ip-editor-pane">
          <div class="ip-preview-wrap">
            <div class="ip-preview">
              <img class="ip-preview-img" alt="" />
              <div class="ip-focus-dot" aria-hidden="true"></div>
              <div class="ip-crop-box" aria-hidden="true">
                <span class="ip-crop-handle ip-crop-handle--nw"></span>
                <span class="ip-crop-handle ip-crop-handle--ne"></span>
                <span class="ip-crop-handle ip-crop-handle--sw"></span>
                <span class="ip-crop-handle ip-crop-handle--se"></span>
              </div>
            </div>
          </div>
          <div class="ip-editor-controls">
            <div class="ip-editor-row">
              <label>Fit</label>
              <select class="ip-fit">
                <option value="cover">Cover</option>
                <option value="contain">Contain</option>
              </select>
            </div>
            <div class="ip-editor-row">
              <label>Focus X</label>
              <input type="range" min="0" max="100" value="50" class="ip-range ip-range-x" />
              <span class="ip-range-value ip-range-x-value">50%</span>
            </div>
            <div class="ip-editor-row">
              <label>Focus Y</label>
              <input type="range" min="0" max="100" value="50" class="ip-range ip-range-y" />
              <span class="ip-range-value ip-range-y-value">50%</span>
            </div>
          </div>
          <div class="ip-selected-name"></div>
        </div>
      </div>
      <div class="ip-actions">
        <button type="button" class="btn-secondary ip-cancel">Cancel</button>
        <button type="button" class="btn-primary ip-apply" disabled>Use Image</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  const listEl = modal.querySelector('.ip-list');
  const previewEl = modal.querySelector('.ip-preview');
  const previewImg = modal.querySelector('.ip-preview-img');
  const focusDot = modal.querySelector('.ip-focus-dot');
  const cropBox = modal.querySelector('.ip-crop-box');
  const fitSelect = modal.querySelector('.ip-fit');
  const rangeX = modal.querySelector('.ip-range-x');
  const rangeY = modal.querySelector('.ip-range-y');
  const rangeXValue = modal.querySelector('.ip-range-x-value');
  const rangeYValue = modal.querySelector('.ip-range-y-value');
  const applyBtn = modal.querySelector('.ip-apply');
  const selectedName = modal.querySelector('.ip-selected-name');
  const uploadInput = modal.querySelector('.ip-upload-input');

  let selectedItem = null;
  let focus = { fit: 'cover', x: 50, y: 50, zoom: 1 };
  let dragState = null;

  if (!showEditor) {
    modal.classList.add('ip-no-editor');
    const editorControls = modal.querySelector('.ip-editor-controls');
    if (editorControls) editorControls.style.display = 'none';
    if (focusDot) focusDot.style.display = 'none';
    if (cropBox) cropBox.style.display = 'none';
  } else if (allowCrop) {
    previewImg.classList.add('ip-preview-img--crop');
    if (cropBox) cropBox.style.display = 'block';
  } else if (cropBox) {
    cropBox.style.display = 'none';
  }

  const close = () => {
    modal.remove();
    window.removeEventListener('resize', updateCropBox);
    if (typeof onCancel === 'function') onCancel();
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const getImageRect = () => {
    if (!previewEl) return null;
    const previewRect = previewEl.getBoundingClientRect();
    const iw = previewImg.naturalWidth || 0;
    const ih = previewImg.naturalHeight || 0;
    if (!iw || !ih) {
      return {
        previewRect,
        left: previewRect.left,
        top: previewRect.top,
        width: previewRect.width,
        height: previewRect.height,
      };
    }

    const scale = Math.min(previewRect.width / iw, previewRect.height / ih);
    const width = iw * scale;
    const height = ih * scale;
    const left = previewRect.left + (previewRect.width - width) / 2;
    const top = previewRect.top + (previewRect.height - height) / 2;

    return { previewRect, left, top, width, height };
  };

  const updateCropBox = () => {
    if (!allowCrop || !cropBox || !selectedItem) return;
    const imgRect = getImageRect();
    if (!imgRect) return;

    const ratio = cropRatio || imgRect.previewRect.width / imgRect.previewRect.height || 1;
    const zoom = Math.max(1, Number(focus.zoom) || 1);
    let boxWidth = imgRect.width / zoom;
    let boxHeight = boxWidth / ratio;
    if (boxHeight > imgRect.height) {
      boxHeight = imgRect.height / zoom;
      boxWidth = boxHeight * ratio;
    }

    const centerX = imgRect.left + (focus.x / 100) * imgRect.width;
    const centerY = imgRect.top + (focus.y / 100) * imgRect.height;
    let left = centerX - boxWidth / 2;
    let top = centerY - boxHeight / 2;
    left = clamp(left, imgRect.left, imgRect.left + imgRect.width - boxWidth);
    top = clamp(top, imgRect.top, imgRect.top + imgRect.height - boxHeight);

    cropBox.style.width = `${boxWidth}px`;
    cropBox.style.height = `${boxHeight}px`;
    cropBox.style.left = `${left - imgRect.previewRect.left}px`;
    cropBox.style.top = `${top - imgRect.previewRect.top}px`;
  };

  const setFocus = (next) => {
    focus = {
      fit: next.fit || 'cover',
      x: clampPercent(next.x),
      y: clampPercent(next.y),
      zoom: Math.max(1, Number(next.zoom) || 1),
    };
    if (fitSelect) fitSelect.value = focus.fit;
    if (rangeX) rangeX.value = String(focus.x);
    if (rangeY) rangeY.value = String(focus.y);
    if (rangeXValue) rangeXValue.textContent = `${focus.x}%`;
    if (rangeYValue) rangeYValue.textContent = `${focus.y}%`;
    if (showEditor) {
      const appliedFit = allowCrop ? 'contain' : focus.fit;
      previewImg.style.objectFit = appliedFit;
      previewImg.style.objectPosition = `${focus.x}% ${focus.y}%`;
      previewImg.style.transform = allowCrop ? `scale(${focus.zoom})` : '';
      previewImg.style.transformOrigin = `${focus.x}% ${focus.y}%`;
      if (focusDot) {
        focusDot.style.display = allowCrop ? 'none' : '';
        focusDot.style.left = `${focus.x}%`;
        focusDot.style.top = `${focus.y}%`;
      }
    } else {
      previewImg.style.objectFit = 'contain';
      previewImg.style.objectPosition = 'center';
      previewImg.style.transform = '';
      previewImg.style.transformOrigin = 'center';
    }
    updateCropBox();
  };

  const selectItem = (item) => {
    selectedItem = item;
    applyBtn.disabled = !selectedItem;
    if (!selectedItem) return;
    const src = resolveSrc(
      selectedItem.previewSrc || selectedItem.thumbSrc || selectedItem.path || ''
    );
    previewImg.src = src;
    previewImg.alt = selectedItem.label || selectedItem.path || 'Image';
    selectedName.textContent = selectedItem.label || selectedItem.path || '';

    const initial = selectedItem.focal || initialSelection || {};
    if (initialSelection && (initialSelection.id || initialSelection.path)) {
      const matchesId = initialSelection.id && initialSelection.id === selectedItem.id;
      const matchesPath = initialSelection.path && initialSelection.path === selectedItem.path;
      if (!matchesId && !matchesPath) {
        setFocus(selectedItem.focal || {});
        return;
      }
    }
    setFocus(initial);
  };

  const renderList = () => {
    listEl.innerHTML = '';
    if (!items.length) {
      listEl.innerHTML = '<div class="ip-empty">No images found.</div>';
      return;
    }
    items.forEach((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ip-item';
      const thumbSrc = resolveSrc(item.thumbSrc || item.previewSrc || item.path || '');
      button.innerHTML = `
        <img src="${thumbSrc}" alt="" loading="lazy" />
        <div class="ip-item-name">${getFileLabel(item)}</div>
      `;
      button.addEventListener('click', () => {
        listEl.querySelectorAll('.ip-item').forEach((el) => el.classList.remove('active'));
        button.classList.add('active');
        selectItem(item);
      });
      listEl.appendChild(button);
    });
  };

  const updateFocusFromPointer = (event) => {
    const rect = previewImg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = clampPercent(((event.clientX - rect.left) / rect.width) * 100);
    const y = clampPercent(((event.clientY - rect.top) / rect.height) * 100);
    setFocus({ ...focus, x, y });
  };

  modal.querySelector('.ip-close').addEventListener('click', close);
  modal.querySelector('.ip-cancel').addEventListener('click', close);
  modal.querySelector('.ip-backdrop').addEventListener('click', close);

  if (showEditor) {
    fitSelect?.addEventListener('change', () => setFocus({ ...focus, fit: fitSelect.value }));
    rangeX?.addEventListener('input', () => setFocus({ ...focus, x: rangeX.value }));
    rangeY?.addEventListener('input', () => setFocus({ ...focus, y: rangeY.value }));
    previewImg.addEventListener('pointerdown', (event) => {
      if (!selectedItem) return;
      updateFocusFromPointer(event);
    });
  }

  if (showEditor && cropBox) {
    cropBox.addEventListener('pointerdown', (event) => {
      if (!allowCrop || !selectedItem) return;
      const handle = event.target.closest('.ip-crop-handle');
      event.preventDefault();
      const imgRect = getImageRect();
      const boxRect = cropBox.getBoundingClientRect();
      if (!imgRect) return;
      const anchor = (() => {
        const left = boxRect.left - imgRect.left;
        const top = boxRect.top - imgRect.top;
        const right = boxRect.right - imgRect.left;
        const bottom = boxRect.bottom - imgRect.top;
        if (handle?.className.includes('--nw')) return { x: right, y: bottom };
        if (handle?.className.includes('--ne')) return { x: left, y: bottom };
        if (handle?.className.includes('--sw')) return { x: right, y: top };
        return { x: left, y: top };
      })();
      const centerX = boxRect.left + boxRect.width / 2;
      const centerY = boxRect.top + boxRect.height / 2;
      const startDist = Math.max(1, Math.hypot(event.clientX - centerX, event.clientY - centerY));

      dragState = {
        imgRect,
        boxWidth: boxRect.width,
        boxHeight: boxRect.height,
        offsetX: event.clientX - boxRect.left,
        offsetY: event.clientY - boxRect.top,
        pointerId: event.pointerId,
        mode: handle ? 'resize' : 'move',
        handle: handle ? handle.className : '',
        anchorX: anchor.x,
        anchorY: anchor.y,
        startX: event.clientX,
        startY: event.clientY,
        startWidth: boxRect.width,
        startHeight: boxRect.height,
        startZoom: Math.max(1, Number(focus.zoom) || 1),
        centerX,
        centerY,
        startDist,
      };
      cropBox.setPointerCapture(event.pointerId);
    });

    cropBox.addEventListener('pointermove', (event) => {
      if (!dragState) return;
      const { imgRect, offsetX, offsetY, mode, startZoom, centerX, centerY, startDist } = dragState;
      if (mode === 'move') {
        const boxRect = cropBox.getBoundingClientRect();
        const boxWidth = boxRect.width;
        const boxHeight = boxRect.height;
        let left = event.clientX - offsetX;
        let top = event.clientY - offsetY;
        left = clamp(left, imgRect.left, imgRect.left + imgRect.width - boxWidth);
        top = clamp(top, imgRect.top, imgRect.top + imgRect.height - boxHeight);
        const centerX = left + boxWidth / 2;
        const centerY = top + boxHeight / 2;
        const x = ((centerX - imgRect.left) / imgRect.width) * 100;
        const y = ((centerY - imgRect.top) / imgRect.height) * 100;
        setFocus({ ...focus, x, y });
      } else {
        const minSize = 60;
        const maxZoom = Math.max(1, imgRect.width / minSize);
        const currentDist = Math.max(
          1,
          Math.hypot(event.clientX - centerX, event.clientY - centerY)
        );
        const scale = currentDist / startDist;
        const zoom = clamp(startZoom / scale, 1, maxZoom);
        setFocus({ ...focus, zoom });
      }
    });

    const endDrag = () => {
      if (!dragState) return;
      try {
        cropBox.releasePointerCapture(dragState.pointerId);
      } catch {
        // ignore
      }
      dragState = null;
    };

    cropBox.addEventListener('pointerup', endDrag);
    cropBox.addEventListener('pointercancel', endDrag);
  }

  applyBtn.addEventListener('click', () => {
    if (!selectedItem || typeof onApply !== 'function') return;
    onApply({
      item: selectedItem,
      fit: focus.fit,
      x: focus.x,
      y: focus.y,
      zoom: focus.zoom,
    });
    close();
  });

  if (uploadInput && typeof uploadHandler === 'function') {
    uploadInput.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const result = await uploadHandler(file, readFileAsBase64);
        items = (await getItems()) || [];
        renderList();
        if (result?.path) {
          const match = items.find((it) => it.path === result.path);
          if (match) {
            const buttons = listEl.querySelectorAll('.ip-item');
            buttons.forEach((btn) => {
              const name = btn.querySelector('.ip-item-name')?.textContent || '';
              if (name === getFileLabel(match)) btn.classList.add('active');
            });
            selectItem(match);
          }
        }
      } catch (err) {
        console.error('Upload failed', err);
        alert(err?.message || 'Upload failed.');
      } finally {
        uploadInput.value = '';
      }
    });
  }

  renderList();

  // Auto-select initial item if possible
  if (initialSelection?.path || initialSelection?.id) {
    const match = items.find((it) => {
      if (initialSelection.id && it.id === initialSelection.id) return true;
      if (initialSelection.path && it.path === initialSelection.path) return true;
      return false;
    });
    if (match) {
      listEl.querySelectorAll('.ip-item').forEach((el) => el.classList.remove('active'));
      const btn = Array.from(listEl.querySelectorAll('.ip-item')).find((el) => {
        const name = el.querySelector('.ip-item-name')?.textContent || '';
        return name === getFileLabel(match);
      });
      if (btn) btn.classList.add('active');
      selectItem(match);
    }
  }

  previewImg.addEventListener('load', () => {
    updateCropBox();
  });
  window.addEventListener('resize', updateCropBox);

  modal.classList.add('is-open');
}
