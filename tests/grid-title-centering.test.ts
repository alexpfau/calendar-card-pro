import { afterEach, describe, expect, it, vi } from 'vitest';

import '../src/calendar-card-pro';
import { centerGridTitles, gridTitleTarget } from '../src/utils/grid-title-fit';

/** 12px grid type at the block's own `line-height: 1.25`. */
const LINE = 15;

/** Line rectangles per title text node, so one stub can serve several blocks at once. */
const LINES = new WeakMap<Node, DOMRect[]>();

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

interface Geometry {
  height: number;
  width: number;
  lines: number;
  /** Overrides the title group's own box, to place it outside the block's content box. */
  group?: DOMRect;
}

/**
 * A timed grid block carrying a title and a time row, with every rectangle stated.
 *
 * `height` is the border box, because `.grid-event` is `box-sizing: border-box` with
 * `padding: 2px 4px` — so the content box the container queries measure, and the box
 * `normalClip` reconstructs, is `height - 4`. The title group is placed at the top of
 * that content box, which is where it sits before any shift is written.
 *
 * The time row is given no client rectangles. That is the whole fixture: a block whose
 * only detail row is suppressed, which is what both the height rung and the width rung
 * added in 37e5507 look like from here.
 */
function block({ height, width, lines, group }: Geometry): HTMLElement {
  const element = document.createElement('div');
  element.className = 'grid-event';
  element.style.cssText = `height: ${height}px; padding: 2px 4px; box-sizing: border-box`;
  element.innerHTML =
    '<div class="grid-event-disclosure"><div class="event-content">' +
    '<div class="summary-row" style="--calendar-card-grid-title-eligible: 1">' +
    '<div class="summary"><span class="event-title">QA Window</span></div>' +
    '</div><div class="time">10:00</div></div></div>';
  const title = element.querySelector<HTMLElement>('.event-title')!;
  const box = group ?? new DOMRect(4, 2, width - 8, lines * LINE);
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, width, height));
  for (const selector of ['.summary-row', '.summary'] as const) {
    vi.spyOn(
      element.querySelector<HTMLElement>(selector)!,
      'getBoundingClientRect',
    ).mockReturnValue(box);
  }
  LINES.set(
    title.firstChild!,
    Array.from(
      { length: lines },
      (_, index) => new DOMRect(4, box.top + index * LINE, width - 16, LINE),
    ),
  );
  const time = element.querySelector<HTMLElement>('.time')!;
  time.getClientRects = () => ({ length: 0 }) as unknown as DOMRectList;
  document.body.append(element);
  return element;
}

function measurable(): void {
  vi.spyOn(Range.prototype, 'getClientRects').mockImplementation(function (this: Range) {
    return (LINES.get(this.startContainer) ?? []) as unknown as DOMRectList;
  });
}

function shiftOf(element: HTMLElement): string {
  return element
    .querySelector<HTMLElement>('.summary-row')!
    .style.getPropertyValue('--calendar-card-grid-title-shift');
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
 * The maintainer's capture: a two-hour `QA Window` at roughly 55px wide and 90px tall,
 * whose two-line title was parked dead center with about 31px of clear space above and
 * below it. 86px of content box less a 30px title is 56px of dead space, 28px per side.
 */
const TALL_AND_NARROW: Geometry = { height: 90, width: 55, lines: 2 };

/**
 * The same event in `example_grid_week.png`, where the week's narrower columns make the
 * block about 52px wide and 180px tall and the dead space grows to roughly 60px a side.
 * Worth pinning beside the capture above rather than reasoning that a larger block must
 * refuse if a smaller one does: it is the same branch, but the claim is cheap to test.
 */
const TALLER_AND_NARROWER: Geometry = { height: 180, width: 52, lines: 2 };

/** A one-hour block at `hour_height: 25`, the case that centers correctly and must keep doing so. */
const SHORT: Geometry = { height: 25, width: 300, lines: 1 };

describe('grid title centering', () => {
  it('leaves a tall narrow block top-aligned instead of parking its title mid-air', () => {
    const [tall] = pass(TALL_AND_NARROW);

    expect(tall.dataset.gridTitleFit).toBeUndefined();
    expect(shiftOf(tall)).toBe('');
  });

  it('still centers a short block whose details never had room', () => {
    const [short] = pass(SHORT);

    expect(short.dataset.gridTitleFit).toBe('centered');
    // 21px of content box less a 15px line, halved.
    expect(shiftOf(short)).toBe('3px');
  });

  it('separates the two in a single pass rather than declining to center anything', () => {
    // Both blocks present exactly the same evidence to the caller — a title that fits and
    // not one visible detail row — so a pass that answered them alike would satisfy the
    // test above by never centering at all.
    const [tall, short] = pass(TALL_AND_NARROW, SHORT);

    expect([tall.dataset.gridTitleFit, short.dataset.gridTitleFit]).toEqual([
      undefined,
      'centered',
    ]);
  });

  it.each([
    ['refuses', TALL_AND_NARROW, null],
    ['refuses', TALLER_AND_NARROWER, null],
    ['writes', SHORT, '3px'],
    // One line in 86px of content box: 35.5px per side, far past a line box.
    ['refuses', { ...TALL_AND_NARROW, lines: 1 }, null],
    // Five lines nearly fill the same block, so centering costs 5.5px per side and reads as
    // deliberate. The guard is about the dead space, not about the block being tall.
    ['writes', { ...TALL_AND_NARROW, lines: 5 }, '5.5px'],
  ])('%s a shift for %o', (_verdict, geometry, expected) => {
    const element = block(geometry as Geometry);
    measurable();
    const target = gridTitleTarget(element)!;

    centerGridTitles([target]);

    expect(shiftOf(element)).toBe(expected ?? '');
    expect(element.dataset.gridTitleFit).toBe(expected === null ? undefined : 'centered');
  });

  it('still refuses a group that overflows its block symmetrically', () => {
    // The containment guard next door, pinned because it is otherwise invisible to the
    // suite and so reads as dead code to anyone sweeping for surviving mutants. The two
    // guards are independent rather than mutually masking: a group overflowing the content
    // box by the same amount at both ends is already centered, so the dead-space guard has
    // nothing to object to and only containment can refuse it.
    const element = block({ ...TALL_AND_NARROW, lines: 6, group: new DOMRect(4, 0, 47, 90) });
    measurable();

    centerGridTitles([gridTitleTarget(element)!]);

    expect(shiftOf(element)).toBe('');
    expect(element.dataset.gridTitleFit).toBeUndefined();
  });
});
