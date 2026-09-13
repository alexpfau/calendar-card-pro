/**
 * Layout-boundary measurements for Grid's timed title disclosure.
 *
 * Only compact titles use zoom: scaling the existing group preserves authored CSS units,
 * independently sized labels, fixed leading, and image proportions without compounding em.
 * All preparation and candidate writes are batched; no font-step loop forces layout.
 */

const PRECISION = 1 / 64;
const FLOOR = 10;
const Segmenter = (
  Intl as typeof Intl & {
    Segmenter?: new (
      locale?: string,
      options?: { granularity: 'grapheme' },
    ) => { segment(value: string): Iterable<{ segment: string; index: number }> };
  }
).Segmenter;
const GRAPHEMES = Segmenter ? new Segmenter(undefined, { granularity: 'grapheme' }) : null;

interface Bounds {
  top: number;
  bottom: number;
}

export interface GridTitleTarget {
  block: HTMLElement;
  disclosure: HTMLElement;
  summary: HTMLElement;
  row: HTMLElement;
  title: HTMLElement;
  previousMode: string | undefined;
}

interface CompactMeasurement {
  target: GridTitleTarget;
  font: number;
  textFonts: number[];
  height: number;
  available: number;
  shift: number;
  textFits: boolean;
  readable: boolean;
}

/**
 * Select the largest one-CSS-pixel reduction that fits, including the terminal 10px floor.
 * A deliberately smaller font is never enlarged or reduced.
 */
export function selectGridTitleFont(
  configured: number,
  measuredHeight: number,
  availableHeight: number,
): number | null {
  if (
    ![configured, measuredHeight, availableHeight].every(Number.isFinite) ||
    configured <= 0 ||
    measuredHeight <= 0 ||
    availableHeight <= 0
  ) {
    return null;
  }
  if (measuredHeight <= availableHeight) return configured;
  const minimum = Math.min(configured, FLOOR);
  const ceiling = (configured * availableHeight) / measuredHeight;
  if (ceiling < minimum) return null;
  return Math.max(minimum, configured - Math.ceil(configured - ceiling));
}

/** The adjacent authored-font step, including a nonintegral last step down to the floor. */
export function adjacentGridTitleFont(font: number, candidate: number, larger: boolean): number {
  const steps = Math.ceil(font - candidate - 1e-7);
  return larger ? font - Math.max(0, steps - 1) : Math.max(Math.min(font, FLOOR), font - steps - 1);
}

/**
 * Lowest title step that also protects every text/emoji label's font floor.
 * An already smaller text part keeps its authored size, so it forbids group reduction.
 */
export function minimumGridTitleFont(font: number, textFonts: number[]): number | null {
  if (
    ![font, ...textFonts].every((value) => Number.isFinite(value) && value > 0) ||
    !textFonts.length
  ) {
    return null;
  }
  const scale = Math.max(...textFonts.map((size) => Math.min(size, FLOOR) / size));
  const minimum = font * scale;
  if (minimum <= Math.min(font, FLOOR) + 1e-7) return Math.min(font, FLOOR);
  return font - Math.floor(font - minimum + 1e-7);
}

/**
 * The prefix through the first useful grapheme, not a combining mark or an ellipsis alone.
 * Engines without segmentation must fit the entire title rather than split a grapheme.
 */
export function gridTitlePrefix(text: string): string {
  const trimmed = text.trim();
  if (!/[\p{L}\p{N}\p{S}]/u.test(trimmed)) return '';
  if (!GRAPHEMES) return trimmed;
  for (const { segment, index } of GRAPHEMES.segment(trimmed)) {
    if (/[\p{L}\p{N}\p{S}]/u.test(segment)) {
      return trimmed.slice(0, index + segment.length);
    }
  }
  return '';
}

/** Require useful title text after every unshortened label, plus the ellipsis when needed. */
export function gridTitleHasUsefulWidth(
  available: number,
  full: number,
  prefix: number,
  ellipsis: number,
): boolean {
  return (
    [available, full, prefix, ellipsis].every(Number.isFinite) &&
    available > 0 &&
    prefix > 0 &&
    (full <= available || prefix + ellipsis <= available)
  );
}

/** Reset only the transient Grid treatment; authored styles and label nodes stay intact. */
export function resetGridTitle(target: GridTitleTarget): void {
  delete target.block.dataset.gridTitleFit;
  target.summary.style.removeProperty('--calendar-card-grid-title-scale');
  target.row.style.removeProperty('--calendar-card-grid-title-shift');
}

/** Read the existing timed title nodes, excluding banners and overflow placeholders. */
export function gridTitleTarget(block: HTMLElement): GridTitleTarget | null {
  const disclosure = block.querySelector<HTMLElement>('.grid-event-disclosure');
  const summary = disclosure?.querySelector<HTMLElement>('.summary');
  const row = disclosure?.querySelector<HTMLElement>('.summary-row');
  const title = summary?.querySelector<HTMLElement>('.event-title');
  return disclosure && summary && row && title
    ? { block, disclosure, summary, row, title, previousMode: block.dataset.gridTitleFit }
    : null;
}

function textRanges(element: Element): Range[] {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const ranges: Range[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? '';
    const start = text.search(/\S/u);
    if (start < 0) continue;
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, text.trimEnd().length);
    ranges.push(range);
  }
  return ranges;
}

function labelRects(target: GridTitleTarget): DOMRect[] {
  return Array.from(target.summary.children).flatMap((label) => {
    if (label === target.title) return [];
    return label.matches('.calendar-label')
      ? textRanges(label).flatMap((range) => Array.from(range.getClientRects()))
      : Array.from(label.getClientRects());
  });
}

function union(bounds: Bounds[]): Bounds {
  return {
    top: Math.min(...bounds.map((box) => box.top)),
    bottom: Math.max(...bounds.map((box) => box.bottom)),
  };
}

function inside(bounds: Bounds, clip: Bounds): boolean {
  return bounds.top >= clip.top - PRECISION && bounds.bottom <= clip.bottom + PRECISION;
}

function px(value: string): number {
  return Number.parseFloat(value) || 0;
}

function blockScale(block: HTMLElement): number {
  const height = px(getComputedStyle(block).height);
  return height > 0 ? block.getBoundingClientRect().height / height : 1;
}

function normalClip(target: GridTitleTarget): Bounds {
  const style = getComputedStyle(target.block);
  const rect = target.block.getBoundingClientRect();
  const scale = blockScale(target.block);
  return {
    top: rect.top + (px(style.borderTopWidth) + px(style.paddingTop)) * scale,
    bottom: rect.bottom - (px(style.borderBottomWidth) + px(style.paddingBottom)) * scale,
  };
}

/**
 * Test the actual first title glyph row and all label fragments, not whole-event overflow.
 * Later wrapped lines may remain clipped exactly as they were before this feature.
 */
export function normalGridTitleFits(target: GridTitleTarget): boolean {
  if (
    getComputedStyle(target.row).getPropertyValue('--calendar-card-grid-title-eligible').trim() !==
    '1'
  ) {
    return false;
  }
  if (
    Array.from(target.summary.querySelectorAll('img')).some(
      (image) => !image.complete || image.naturalWidth <= 0,
    )
  ) {
    return false;
  }
  const ranges = textRanges(target.title);
  const first = ranges[0]?.getClientRects()[0];
  if (!first || first.height <= 0) return false;
  const clip = normalClip(target);
  const row = target.row.getBoundingClientRect();
  const summary = target.summary.getBoundingClientRect();
  const visible = {
    top: Math.max(clip.top, row.top, summary.top),
    bottom: Math.min(clip.bottom, row.bottom, summary.bottom),
  };
  const labels = labelRects(target);
  return (
    inside(first, visible) &&
    labels.every(
      (label) =>
        inside(label, visible) &&
        label.left >= summary.left - PRECISION &&
        label.right <= summary.right + PRECISION,
    )
  );
}

function centeredShift(target: GridTitleTarget): number | null {
  const clip = normalClip(target);
  const row = target.row.getBoundingClientRect();
  const glyphs = textRanges(target.summary).flatMap((range) => Array.from(range.getClientRects()));
  const bounds = union([
    row,
    ...glyphs.filter((glyph) => inside(glyph, row)),
    ...labelRects(target),
  ]);
  if (!inside(bounds, clip)) return null;
  const shift = (clip.top + clip.bottom - bounds.top - bounds.bottom) / 2;
  return shift / blockScale(target.block);
}

/** Center complete, height-forced title groups without changing their ordinary wrapping. */
export function centerGridTitles(targets: GridTitleTarget[]): void {
  const measurements = targets.map((target) => ({ target, shift: centeredShift(target) }));
  for (const { target, shift } of measurements) {
    if (shift === null) continue;
    target.row.style.setProperty('--calendar-card-grid-title-shift', `${shift}px`);
    target.block.dataset.gridTitleFit = 'centered';
  }
}

function measureCompact(
  target: GridTitleTarget,
  canvas: CanvasRenderingContext2D | null,
): CompactMeasurement {
  const scale = blockScale(target.block);
  const ranges = textRanges(target.title);
  const titleStyle = getComputedStyle(ranges[0]?.startContainer.parentElement ?? target.title);
  const title = target.title.getBoundingClientRect();
  const row = target.row.getBoundingClientRect();
  const summary = target.summary.getBoundingClientRect();
  const disclosure = target.disclosure.getBoundingClientRect();
  const glyphs = ranges.flatMap((range) => Array.from(range.getClientRects()));
  const labels = labelRects(target);
  const bounds = union([row, ...glyphs, ...labels]);
  const text = ranges[0]?.toString() ?? '';
  const prefix = gridTitlePrefix(text);
  const prefixRange = ranges[0]?.cloneRange();
  if (prefixRange && prefix) {
    prefixRange.setEnd(prefixRange.startContainer, prefixRange.startOffset + prefix.length);
  }
  const zoom = px(getComputedStyle(target.summary).zoom) || 1;
  if (canvas) canvas.font = titleStyle.font || `${titleStyle.fontSize} ${titleStyle.fontFamily}`;
  const ellipsis = canvas
    ? (canvas.measureText('\u2026').width + px(titleStyle.letterSpacing)) * scale * zoom
    : Infinity;
  const fullWidth = glyphs.reduce((width, rect) => width + rect.width, 0);
  const prefixWidth = prefix && prefixRange ? prefixRange.getBoundingClientRect().width : 0;
  const labelsFit = labels.every(
    (label) =>
      label.left >= summary.left - PRECISION &&
      label.right <= summary.right + PRECISION &&
      label.width > 0,
  );
  const imagesReady = Array.from(target.summary.querySelectorAll('img')).every(
    (image) => image.complete && image.naturalWidth > 0,
  );
  return {
    target,
    font: px(titleStyle.fontSize),
    textFonts: [
      px(titleStyle.fontSize),
      ...Array.from(target.summary.querySelectorAll<HTMLElement>('.calendar-label')).flatMap(
        (label) =>
          textRanges(label).map((range) =>
            px(getComputedStyle(range.startContainer.parentElement ?? label).fontSize),
          ),
      ),
    ],
    height: (bounds.bottom - bounds.top) / scale,
    available: disclosure.height / scale,
    shift: (disclosure.top + disclosure.bottom - bounds.top - bounds.bottom) / (2 * scale),
    textFits: glyphs.every((glyph) => inside(glyph, title)),
    readable:
      labelsFit &&
      imagesReady &&
      gridTitleHasUsefulWidth(title.width, fullWidth, prefixWidth, ellipsis),
  };
}

function verticalFit(measurement: CompactMeasurement): boolean {
  return measurement.textFits && measurement.height <= measurement.available + PRECISION;
}

/**
 * Try authored typography, a proportional candidate, then its adjacent step.
 * Native normal leading and glyph hinting are discrete: verify that neighbor rather than
 * trusting proportional arithmetic at a font boundary. Preparation is never painted.
 */
export function fitCompactGridTitles(targets: GridTitleTarget[]): void {
  if (!targets.length) return;
  const canvas = document.createElement('canvas').getContext('2d');
  for (const target of targets) target.block.dataset.gridTitleFit = 'measuring';
  try {
    const measured = targets.map((target) => measureCompact(target, canvas));
    const candidates = measured.map((measurement) => {
      const minimum = minimumGridTitleFont(measurement.font, measurement.textFonts);
      return {
        ...measurement,
        minimum,
        candidate: Math.max(
          minimum ?? measurement.font,
          selectGridTitleFont(measurement.font, measurement.height, measurement.available) ??
            Math.min(measurement.font, FLOOR),
        ),
      };
    });
    for (const { target, candidate, font } of candidates) {
      target.summary.style.setProperty(
        '--calendar-card-grid-title-scale',
        String(font > 0 ? candidate / font : 1),
      );
    }
    const verified = candidates.map((entry) => ({
      ...entry,
      result: measureCompact(entry.target, canvas),
    }));
    const neighbors = verified.map((entry) => ({
      ...entry,
      neighbor: Math.max(
        entry.minimum ?? entry.font,
        adjacentGridTitleFont(entry.font, entry.candidate, verticalFit(entry.result)),
      ),
    }));
    for (const { target, neighbor, font } of neighbors) {
      target.summary.style.setProperty(
        '--calendar-card-grid-title-scale',
        String(font > 0 ? neighbor / font : 1),
      );
    }
    const compared = neighbors.map((entry) => ({
      ...entry,
      neighborResult: measureCompact(entry.target, canvas),
    }));
    for (const { target, candidate, font, minimum, result, neighbor, neighborResult } of compared) {
      const useNeighbor =
        verticalFit(neighborResult) && (neighbor > candidate || !verticalFit(result));
      const chosen = useNeighbor ? neighborResult : result;
      target.summary.style.setProperty(
        '--calendar-card-grid-title-scale',
        String(font > 0 ? (useNeighbor ? neighbor : candidate) / font : 1),
      );
      const fits = minimum !== null && verticalFit(chosen) && chosen.readable;
      target.row.style.setProperty('--calendar-card-grid-title-shift', `${chosen.shift}px`);
      target.block.dataset.gridTitleFit = fits ? 'compact' : 'blank';
    }
  } finally {
    for (const target of targets) {
      if (target.block.dataset.gridTitleFit === 'measuring') {
        target.block.dataset.gridTitleFit = 'blank';
      }
    }
  }
}
