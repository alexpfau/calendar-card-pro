import { afterEach, describe, expect, it, vi } from 'vitest';

import '../src/calendar-card-pro';
import {
  fitCompactGridTitles,
  gridTitleTarget,
  normalGridTitleFits,
} from '../src/utils/grid-title-fit';

/**
 * A text Range reports the font's content area, which is taller than its line box wherever
 * line-height is smaller than ascent plus descent. Firefox measures the grid's 12px Roboto
 * title at 15px in a 14.4px line, starting 0.3px above its own block; an emoji's fallback
 * font adds another pixel below. Chromium and WebKit report the same overhang for fonts with
 * taller metrics, such as Noto Sans. The fixtures below are those measurements, relative to
 * a block whose top is 0.
 */
const LINE = 14.4;
const TOP = 2;

/** A text label; the stylesheet leaves it inline, which happy-dom cannot resolve unaided. */
const LABEL = '<span class="calendar-label" style="display: inline">Ben</span>';

/** Text rectangles per title text node, so one stub can serve several blocks at once. */
const TEXT = new WeakMap<Node, DOMRect[]>();

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

interface Geometry {
  /** Border box height; the block is `box-sizing: border-box` with `padding: 2px 4px`. */
  height: number;
  /** The summary, its row and the title's own box, which hold the line boxes. */
  group: DOMRect;
  /** What the text Range reports for the title's text, one rectangle per line. */
  text: DOMRect[];
  /** Markup inside `.summary` before the title, such as a calendar label. */
  prefix?: string;
  /** Whether the time row is still disclosed, which keeps the block out of centering. */
  time?: boolean;
  /**
   * Inline style for the title. Alone it is block-level (the stylesheet's -webkit-box, or the
   * compact fallback's block) and holds its own line boxes; after a label it is inline.
   */
  titleStyle?: string;
}

function block({ height, group, text, prefix = '', time = true, titleStyle }: Geometry) {
  const element = document.createElement('div');
  element.className = 'grid-event';
  element.style.cssText = `height: ${height}px; padding: 2px 4px; box-sizing: border-box`;
  element.innerHTML =
    '<div class="grid-event-disclosure"><div class="event-content">' +
    '<div class="summary-row" style="--calendar-card-grid-title-eligible: 1">' +
    `<div class="summary">${prefix}<span class="event-title">Sunday Brunch</span></div>` +
    '</div><div class="time">10:00</div></div></div>';
  const title = element.querySelector<HTMLElement>('.event-title')!;
  title.style.cssText = `font-size: 12px; ${titleStyle ?? 'display: block'}`;
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, height));
  vi.spyOn(
    element.querySelector<HTMLElement>('.grid-event-disclosure')!,
    'getBoundingClientRect',
  ).mockReturnValue(new DOMRect(4, 1, 192, height - 2));
  for (const node of [
    element.querySelector<HTMLElement>('.summary-row')!,
    element.querySelector<HTMLElement>('.summary')!,
    title,
  ]) {
    vi.spyOn(node, 'getBoundingClientRect').mockReturnValue(group);
  }
  TEXT.set(title.firstChild!, text);
  const timeRow = element.querySelector<HTMLElement>('.time')!;
  timeRow.getClientRects = () =>
    (time ? [new DOMRect(4, group.bottom, 60, LINE)] : []) as unknown as DOMRectList;
  document.body.append(element);
  return element;
}

function measurable(): void {
  vi.spyOn(Range.prototype, 'getClientRects').mockImplementation(function (this: Range) {
    return (TEXT.get(this.startContainer) ?? []) as unknown as DOMRectList;
  });
  vi.spyOn(Range.prototype, 'getBoundingClientRect').mockImplementation(function (this: Range) {
    return TEXT.get(this.startContainer)?.[0] ?? new DOMRect();
  });
  // happy-dom has no 2D context, which would leave the ellipsis width infinite and every
  // compact title unreadable for a reason unrelated to height.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    font: '',
    measureText: () => ({ width: 6 }),
  } as unknown as CanvasRenderingContext2D);
}

/** Drive the real pass over a shadow root holding the given blocks. */
function pass(...geometries: Geometry[]): HTMLElement[] {
  const card = document.createElement('calendar-card-pro-dev') as unknown as HTMLElement & {
    _applyGridDisclosureSafety(): void;
  };
  const root = card.attachShadow({ mode: 'open' });
  Object.defineProperty(card, 'renderRoot', { value: root });
  document.body.append(card);
  const blocks = geometries.map(block);
  root.append(...blocks);
  measurable();
  card._applyGridDisclosureSafety();
  return blocks;
}

/**
 * The reported block: a 222px brunch whose two-line title starts at the top of its content
 * box. Firefox put the first text rectangle at 1747.42 against a title top of 1747.72, 16px
 * tall for the emoji line; the second line reports the primary font's 15px.
 */
const BRUNCH: Geometry = {
  height: 222,
  group: new DOMRect(4, TOP, 192, 2 * LINE),
  text: [new DOMRect(4, TOP - 0.3, 150, 16), new DOMRect(4, TOP + LINE - 0.3, 40, 15)],
};

describe('grid title fitting measures line boxes, not font content areas', () => {
  it('keeps the ordinary title of a tall block whose first line overhangs its box', () => {
    const [brunch] = pass(BRUNCH);

    // Before this was measured against the line box, every such block came out blank:
    // an empty colored rectangle with no title, time, location or description.
    expect(brunch.dataset.gridTitleFit).toBeUndefined();
  });

  it('keeps a one-line title whose emoji also overhangs the bottom of its box', () => {
    const element = block({
      height: 69,
      group: new DOMRect(4, TOP, 192, LINE),
      text: [new DOMRect(4, TOP - 0.3, 80, 16)],
    });
    measurable();

    expect(normalGridTitleFits(gridTitleTarget(element)!)).toBe(true);
  });

  it('trims the overhang of a label in front of the title as well', () => {
    // A label makes the title inline, so both lay out in the summary's line boxes.
    const element = block({
      height: 69,
      group: new DOMRect(4, TOP, 192, LINE),
      prefix: LABEL,
      text: [new DOMRect(30, TOP - 0.3, 80, 15)],
      titleStyle: 'display: inline',
    });
    const label = element.querySelector('.calendar-label')!;
    TEXT.set(label.firstChild!, [new DOMRect(4, TOP - 0.3, 22, 15)]);
    measurable();

    expect(normalGridTitleFits(gridTitleTarget(element)!)).toBe(true);
  });

  it('still rejects a first title line that was clamped out of its box entirely', () => {
    // A label filling the first line pushes the title onto a line the clamp hides. Its
    // rectangle overlaps the box only by the same content-area overhang, so a plain clamp
    // would shrink it to a sliver inside the box and call the hidden title visible.
    const element = block({
      height: 69,
      group: new DOMRect(4, TOP, 192, LINE),
      prefix: LABEL,
      text: [new DOMRect(4, TOP + LINE - 0.3, 80, 15)],
      titleStyle: 'display: inline',
    });
    TEXT.set(element.querySelector('.calendar-label')!.firstChild!, [
      new DOMRect(4, TOP - 0.3, 188, 15),
    ]);
    measurable();

    expect(normalGridTitleFits(gridTitleTarget(element)!)).toBe(false);
  });

  it('still rejects a first line that the block genuinely cuts off', () => {
    // Content box ends at 15; the line box ends at 16.4. Trimming the content area to the
    // title's own box must not hide that the box itself runs past the block.
    const element = block({
      height: 17,
      group: new DOMRect(4, TOP, 192, LINE),
      text: [new DOMRect(4, TOP - 0.3, 80, 15)],
    });
    measurable();

    expect(normalGridTitleFits(gridTitleTarget(element)!)).toBe(false);
  });

  it('draws a compact title rather than a blank block when only the overhang is outside', () => {
    // The compact fallback's title is a one-line block, so its box is exactly its line box.
    // 21px block, 19px of disclosure, a 14.4px line: it fits at the authored size, and the
    // emoji's content area runs 0.3px above and 1.3px below the title.
    const element = block({
      height: 21,
      group: new DOMRect(4, 3.3, 192, LINE),
      text: [new DOMRect(4, 3, 80, 16)],
      titleStyle: 'display: block',
    });
    measurable();

    fitCompactGridTitles([gridTitleTarget(element)!]);

    expect(element.dataset.gridTitleFit).toBe('compact');
    expect(
      element
        .querySelector<HTMLElement>('.summary')!
        .style.getPropertyValue('--calendar-card-grid-title-scale'),
    ).toBe('1');
  });
});
