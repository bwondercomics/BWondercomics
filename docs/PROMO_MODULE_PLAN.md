# Promo Module Fix Plan

## Goal
Make the promo module reliable and predictable: borders align to the visible image area, Fit/Fill behaves consistently, and text/indicators never clip or overlap.

## Constraints / Ground Rules
- No crop/focus/zoom editor for promos.
- Per-slide **Image Fit** only: `Fill (cover)` vs `Fit (contain)`.
- Avoid new fallback logic.

---

## Phase 1 — Layout stability (no clipping)
**Objective:** the promo always reserves space for text + indicators, and the image never collapses.

1) **Promo slide layout**
   - Use a fixed grid: `top text / image / bottom text`.
   - Image container gets the remaining space and must not shrink below 0.

2) **Indicator & nav spacing**
   - Reserve bottom space via `--promo-indicator-space` (already used).
   - Ensure indicators/nav sit outside image space so they never overlap the image.

**Success check:**
- Tall images do not clip text.
- Indicators always visible.

---

## Phase 2 — Border placement (the current pain point)
**Problem:** border appears “too big” in Fill+Overlay because it’s drawn on the image, which fills the whole module box.

**Fix:**
- Move the border from the `<img>` to the **image container**.
- Use `outline` or `box-shadow: inset` so it doesn’t alter layout size.

**Result:**
Border matches the visible image area and stays consistent for Fit/Fill.

---

## Phase 3 — Fit / Fill behavior
**Per-slide setting:**
`imageFit: "cover" | "contain"`

**Render logic (reader + preview):**
```
const fit = item.imageFit === "contain" ? "contain" : "cover";
imageStyles.push(`object-fit: ${fit}`);
imageStyles.push(`object-position: center`);
```

**Result:**
Fit shows full image with letterboxing; Fill crops to fit.

---

## Phase 4 — QA matrix (fast)
Test each in **left panel** and **right panel**:
- A tall image
- A wide image
- **Fit** and **Fill**
- **Overlay** vs **Outside** text

**Pass criteria:**
- No overlap.
- Border is correct size.
- Fit/Fill behaves predictably.

---

## Notes / Dependencies
- Promo image editor remains **simple** (no crop tools).
- Image picker stays enabled for other contexts (feed / assets).

