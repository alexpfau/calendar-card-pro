import { afterEach, describe, expect, it, vi } from 'vitest';

import { cardStyles } from '../src/rendering/styles';
import { gridTitleHasUsefulWidth, reserveScrollingLabelWidths } from '../src/utils/grid-title-fit';

const css = cardStyles.cssText.replace(/\/\*[\s\S]*?\*\//g, '');

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function row(available = 20, scale = 1) {
  const summary = document.createElement('div');
  summary.className = 'summary-scroll';
  summary.style.cssText = 'width: 200px; box-sizing: border-box';
  summary.innerHTML =
    '<span class="calendar-label">Garden</span>' +
    '<span class="event-title title-scrollable" style="font: 500 14px/1.2 sans-serif; padding-bottom: 2px">' +
    '<span class="event-title-scroll">Review the garden plans</span></span>';
  document.body.append(summary);
  const title = summary.querySelector<HTMLElement>('.event-title')!;
  const label = summary.querySelector<HTMLElement>('.calendar-label')!;
  const content = title.firstElementChild as HTMLElement;
  const bounds = (x: number, width: number) => new DOMRect(x * scale, 0, width * scale, 20 * scale);
  vi.spyOn(summary, 'getBoundingClientRect').mockImplementation(() => bounds(0, 200));
  vi.spyOn(label, 'getBoundingClientRect').mockImplementation(() => bounds(0, 40));
  const box = vi
    .spyOn(title, 'getBoundingClientRect')
    .mockImplementation(() => bounds(44, available));
  return { summary, title, label, content, box, bounds };
}

function metrics(scale = 1) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    font: '',
    measureText: () => ({ width: 12 }),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(Range.prototype, 'getClientRects').mockReturnValue([
    new DOMRect(0, 0, 100 * scale, 16 * scale),
  ] as unknown as DOMRectList);
  vi.spyOn(Range.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 8 * scale, 16 * scale),
  );
}

describe('natural scrolling label width reservation', () => {
  it('uses the existing prefix-plus-ellipsis boundary, not a new width budget', () => {
    metrics();
    const { summary, title, box, bounds } = row(20);
    expect(gridTitleHasUsefulWidth(20, 100, 8, 12)).toBe(true);
    reserveScrollingLabelWidths([title]);
    expect(summary.hasAttribute('data-scroll-labels')).toBe(true);
    expect(title.style.paddingBottom).toBe('2px');

    box.mockReturnValue(bounds(44, 19.99));
    reserveScrollingLabelWidths([title]);
    expect(summary.hasAttribute('data-scroll-labels')).toBe(false);

    box.mockReturnValue(bounds(44, 20));
    reserveScrollingLabelWidths([title]);
    expect(summary.hasAttribute('data-scroll-labels')).toBe(true);
  });

  it.each([0.75, 1, 1.5, 2])('keeps all geometry in the same coordinates at scale %s', (scale) => {
    metrics(scale);
    const { summary, title } = row(20, scale);
    reserveScrollingLabelWidths([title]);
    expect(summary.hasAttribute('data-scroll-labels')).toBe(true);
  });

  it('charges title padding and borders before reserving label widths', () => {
    metrics();
    const { summary, title } = row(22);
    title.style.paddingLeft = '2px';
    title.style.borderLeft = '1px solid black';
    reserveScrollingLabelWidths([title]);
    expect(summary.hasAttribute('data-scroll-labels')).toBe(false);
    title.style.borderLeftWidth = '0';
    reserveScrollingLabelWidths([title]);
    expect(summary.hasAttribute('data-scroll-labels')).toBe(true);
  });

  it('requires the entire mixed label run to fit, not only its prose label', () => {
    metrics();
    const { summary, title, bounds } = row(50);
    const icon = document.createElement('ha-icon');
    icon.className = 'label-icon';
    summary.insertBefore(icon, title);
    const iconBox = vi.spyOn(icon, 'getBoundingClientRect').mockReturnValue(bounds(190, 20));
    reserveScrollingLabelWidths([title]);
    expect(summary.hasAttribute('data-scroll-labels')).toBe(false);
    iconBox.mockReturnValue(bounds(44, 20));
    reserveScrollingLabelWidths([title]);
    expect(summary.hasAttribute('data-scroll-labels')).toBe(true);
  });

  it('withholds a reservation until an image label is loaded and measurable', () => {
    metrics();
    const { summary, title, bounds } = row(50);
    const image = document.createElement('img');
    image.className = 'label-image';
    summary.insertBefore(image, title);
    vi.spyOn(image, 'getBoundingClientRect').mockReturnValue(bounds(44, 20));
    Object.defineProperty(image, 'complete', { configurable: true, value: false });
    reserveScrollingLabelWidths([title]);
    expect(summary.hasAttribute('data-scroll-labels')).toBe(false);
    Object.defineProperties(image, {
      complete: { configurable: true, value: true },
      naturalWidth: { configurable: true, value: 20 },
    });
    reserveScrollingLabelWidths([title]);
    expect(summary.hasAttribute('data-scroll-labels')).toBe(true);
  });

  it('prepares every natural run before the first layout read, then restores wrapping', () => {
    metrics();
    const a = row(20);
    const b = row(19);
    const reads: boolean[][] = [];
    vi.spyOn(a.summary, 'getBoundingClientRect').mockImplementation(() => {
      reads.push([a.summary, b.summary].map((node) => node.hasAttribute('data-scroll-labels')));
      return a.bounds(0, 200);
    });
    reserveScrollingLabelWidths([a.title, b.title]);
    expect(reads).toEqual([[true, true]]);
    expect(a.summary.hasAttribute('data-scroll-labels')).toBe(true);
    expect(b.summary.hasAttribute('data-scroll-labels')).toBe(false);
  });

  it('leaves non-scrolling markup and icon-only label geometry untouched', () => {
    metrics();
    const { summary, title, label } = row(20);
    summary.className = 'summary';
    const before = summary.outerHTML;
    reserveScrollingLabelWidths([title]);
    expect(summary.outerHTML).toBe(before);
    summary.className = 'summary-scroll';
    summary.setAttribute('data-scroll-labels', '');
    label.className = 'label-icon';
    reserveScrollingLabelWidths([title]);
    expect(summary.hasAttribute('data-scroll-labels')).toBe(false);
  });

  it.each(['compact', 'blank', 'measuring'])('does not override the Grid %s transaction', (fit) => {
    metrics();
    const { summary, title } = row(20);
    const block = document.createElement('div');
    block.className = 'grid-event';
    block.dataset.gridTitleFit = fit;
    summary.replaceWith(block);
    block.append(summary);
    reserveScrollingLabelWidths([title]);
    expect(summary.hasAttribute('data-scroll-labels')).toBe(false);
  });

  it('makes nowrap and no-shrink conditional on the measured reservation only', () => {
    const rule = css.match(
      /\.summary-scroll\[data-scroll-labels\] > :not\(\.event-title\)\s*\{([^}]+)\}/,
    );
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/flex-shrink:\s*0;/);
    expect(rule![1]).toMatch(/white-space:\s*nowrap;/);
    expect(rule![1]).not.toMatch(/padding|min-width|max-width|font|align/);
    expect(css).not.toMatch(/\.calendar-label\s*\{[^}]*(white-space:\s*nowrap|flex-shrink:\s*0)/);
  });
});
