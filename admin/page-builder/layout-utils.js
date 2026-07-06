/**
 * Pure section-layout helpers shared by the public reader bundle and the admin
 * builder. A section layout is a 1-6 segment dash-separated ratio string (each
 * segment a positive integer ratio); legacy presets (1, 1-1, 1-2, 2-1, 1-1-1,
 * 1-3-1) are a strict subset. These must stay aligned with the backend
 * `parse_layout_ratios` contract in builder_security.py.
 *
 * Kept dependency-free (no module-descriptor imports) so importing it does not
 * pull builder-only code into the public reader bundle.
 */

export const MAX_COLUMNS = 6;
// 100 so percent-style weight strings (e.g. '20-60-20') are valid; legacy small
// ratios like '1-3-1' remain a strict subset.
export const MAX_COLUMN_RATIO = 100;
export const COLUMN_ALIGNMENTS = ['stretch', 'start', 'center', 'end'];

export function parseLayoutRatios(layout = '1') {
  const ratios = String(layout || '1')
    .split('-')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const value = Number.parseInt(part, 10);
      if (!Number.isFinite(value)) return null;
      return Math.max(1, Math.min(MAX_COLUMN_RATIO, value));
    })
    .filter((value) => value !== null);
  if (!ratios.length || ratios.length > MAX_COLUMNS) return [1];
  return ratios;
}

export function layoutColumnCount(layout = '1') {
  return parseLayoutRatios(layout).length;
}

export function ratiosToLayout(ratios = [1]) {
  const safe = (Array.isArray(ratios) ? ratios : [1])
    .slice(0, MAX_COLUMNS)
    .map((value) => Math.max(1, Math.min(MAX_COLUMN_RATIO, Number.parseInt(value, 10) || 1)));
  return (safe.length ? safe : [1]).join('-');
}

export function ratiosToGridTemplate(ratios = []) {
  const safe = Array.isArray(ratios)
    ? ratios
        .slice(0, MAX_COLUMNS)
        .map((value) => Math.max(1, Math.min(MAX_COLUMN_RATIO, Number.parseInt(value, 10) || 1)))
    : [];
  if (!safe.length) return 'none';
  return safe.map((ratio) => `${ratio}fr`).join(' ');
}

export function layoutToGridTemplate(layout = '1') {
  return ratiosToGridTemplate(parseLayoutRatios(layout));
}

/** CSS justify-self value for a column alignment keyword. */
export function alignmentToJustifySelf(alignment = 'stretch') {
  switch (alignment) {
    case 'start':
      return 'start';
    case 'center':
      return 'center';
    case 'end':
      return 'end';
    default:
      return 'stretch';
  }
}

/** CSS align-self value for a column alignment keyword (flex-based panel wrappers). */
export function alignmentToAlignSelf(alignment = 'stretch') {
  switch (alignment) {
    case 'start':
      return 'flex-start';
    case 'center':
      return 'center';
    case 'end':
      return 'flex-end';
    default:
      return 'stretch';
  }
}
