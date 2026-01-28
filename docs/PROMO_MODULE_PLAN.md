# Promo Module Rebuild Plan

Goal: the promo module always looks right, regardless of image shape, text position, or Fit/Fill.
- **No clipping** of text/indicators
- **Border fits the visible image** in all modes
- **Fit/Fill behaves exactly as labeled**
- Works the same in **builder preview** and **reader runtime**

Scope: promo module only (builder preview + reader runtime). No unrelated UI changes.

---

## Summary (one paragraph)
The promo module fix locks a fixed grid so text/indicators never overlap, adds a sizing frame around the image, computes the frame’s exact bounds for Fit vs Fill using the image’s natural size and container dimensions, moves border/glow to that frame, and adds baseline CSS so the frame—not the image—defines size. It recomputes on slide change and resize, and includes a no‑image safety guard so missing images render the placeholder without errors. Finally it verifies all Fit/Fill + Overlay/Outside combinations in both builder preview and runtime for consistent borders and zero clipping.

---

## Current checks (what’s already true)
Checked in code:
- **Outside mode** already uses a fixed grid: `auto / minmax(0, 1fr) / auto`.
- **Indicator spacing** exists via `--promo-indicator-space`.
- **Overlay text** is constrained by `max-height` and reserved indicator space.
- **Fit/Fill** is currently only applied through `object-fit` (insufficient for borders).
- **Border/glow** currently apply to `<img>` → wrong for Fit/contain.

Conclusion: **layout is close**, but border sizing is fundamentally wrong for Fit/contain.

---

## Plan (execute in order)

### Phase 1 — Lock the grid (no clipping)
**Objective:** text and indicators never overlap the image, in either Overlay or Outside.

**Outside mode (already in CSS):**
```
.pb-promo-slide--outside {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 12px;
  padding: 16px;
  padding-bottom: calc(16px + var(--promo-indicator-space));
  min-height: 0;
}
```
**Overlay mode (already in CSS):**
- Overlay sits inside the image container.
- `max-height: calc(100% - var(--promo-indicator-space))`.

✅ No changes here unless testing proves overlap.

---

### Phase 2 — Add image frame (foundation)
**Problem:** border can’t fit the visible image without a sizing frame.

**Change HTML structure in BOTH renderers:**
- `admin/page-builder/preview-renderers.js`
- `reader/page-renderer.js`

Replace:
```
<div class="pb-promo-image-container">
  <img ...>
</div>
```
With:
```
<div class="pb-promo-image-container">
  <div class="pb-promo-image-frame" style="...computed...">
    <img ...>
  </div>
</div>
```

✅ Frame is the single source of truth for image size.

---

### Phase 3 — Compute frame size (core fix)
**Objective:** border hugs the **visible** image regardless of Fit/Fill.

**Rule:**
- **Fill / cover** → frame == container bounds
- **Fit / contain** → frame == letterboxed image bounds

**Sizing math:**
```
if (fit === "cover") {
  w = containerW; h = containerH; left = 0; top = 0;
} else { // contain
  const imgRatio = naturalW / naturalH;
  const boxRatio = containerW / containerH;
  if (imgRatio > boxRatio) {
    w = containerW; h = containerW / imgRatio;
  } else {
    h = containerH; w = containerH * imgRatio;
  }
  left = (containerW - w) / 2;
  top  = (containerH - h) / 2;
}
```

Apply to `.pb-promo-image-frame` via inline styles.

---

### Phase 4 — Move border/glow to frame
**Reason:** border must always match the frame, not the full container.

- Move `border` + `box-shadow` from `<img>` to `.pb-promo-image-frame`.
- Keep color/intensity logic exactly the same.

✅ Border now always matches visible image.

---

### Phase 5 — CSS baseline for frame
Add base CSS in `assets/css/main.core.18-page-builder.css`:
```
.pb-promo-image-container {
  position: relative;
  overflow: hidden;
}

.pb-promo-image-frame {
  position: absolute;
  inset: 0; /* overridden by inline sizing */
  display: block;
}

.pb-promo-image-frame img {
  width: 100%;
  height: 100%;
  object-fit: fill; /* frame defines size */
  display: block;
}
```

---

### Phase 6 — Recompute on resize / slide change
Frame sizes must update when layout changes.

Add:
- recompute on **slide change** (after image load)
- recompute on **window resize**

---

### Phase 7 — Verification + failure-mode checks
**Purpose:** make sure the fix survives real usage, async image loads, and slider changes.

Required checks (both **preview** and **runtime**):
1) **Image load timing**  
   - Frame sizing runs *after* image natural dimensions are available.  
   - If `naturalWidth/Height` is zero, retry after `load` event.
2) **Active slide only**  
   - Only compute frames for the active slide to avoid wasted work.
3) **Resize resilience**  
   - On resize, recompute for the current active slide.
4) **No-image safety**  
   - If a slide has no image, frame sizing should be skipped without errors.
5) **Indicator space**  
   - Verify bottom indicator space doesn’t reduce the image frame height unexpectedly.

Pass condition: border fits visible image and layout never overlaps or clips.

---

## QA Matrix (must pass)
Test all 8 combinations in **builder preview** and **reader runtime**:
- Fit + Outside (tall)
- Fit + Outside (wide)
- Fit + Overlay (tall)
- Fit + Overlay (wide)
- Fill + Outside (tall)
- Fill + Outside (wide)
- Fill + Overlay (tall)
- Fill + Overlay (wide)

**Pass criteria:**
- Border hugs visible image
- No overlap/clipping
- Indicators always visible
- No layout jump between slides

---

## Done Definition
All 8 combos pass in both builder preview and reader runtime.
No fallbacks added. No unrelated UI changes.
