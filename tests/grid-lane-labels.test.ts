import { afterEach, describe, expect, it, vi } from 'vitest';

import '../src/calendar-card-pro';
import { cardStyles } from '../src/rendering/styles';
import {
  cutGridLabels,
  fitCompactGridTitles,
  gridTitleTarget,
  normalGridTitleFits,
  resetGridTitle,
} from '../src/utils/grid-title-fit';

/**
 * Narrow grid lanes (backlog item 422). Two things went wrong in a lane of the default 40px:
 * a short event's fitted title could not fit a picture and "S…" side by side, so the block
 * went blank and hid the picture with it, and a text label wider than its block broke inside
 * its word ("Davi / d"). A blank block in a lane now shows its labels alone, and a text label
 * the line broke is kept to one line and cut short, as a title word is.
 *
 * happy-dom lays nothing out, so every rectangle is stated. A block's is a function of the scale
 * and the shift the fitter writes on it, so the passes it makes at the floor and the centering
 * it finds there are measured as a browser would lay them out: the group's line is 15px at
 * scale 1, starting at the top of the disclosure plus the shift, and every width scales with it.
 */

const SCALE = '--calendar-card-grid-title-scale';
const SHIFT = '--calendar-card-grid-title-shift';
const LABELS_ALONE = 'data-grid-title-labels';
const LABEL_CUT = 'data-grid-label-cut';

/** Each text node's rectangles, as a function of the range measured within it. */
const TEXT = new WeakMap<Node, (start: number, end: number) => DOMRect[]>();

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function measurable(): void {
  const rects = (range: Range) =>
    TEXT.get(range.startContainer)?.(range.startOffset, range.endOffset) ?? [];
  vi.spyOn(Range.prototype, 'getClientRects').mockImplementation(function (this: Range) {
    return rects(this) as unknown as DOMRectList;
  });
  vi.spyOn(Range.prototype, 'getBoundingClientRect').mockImplementation(function (this: Range) {
    const all = rects(this);
    if (!all.length) return new DOMRect();
    const left = Math.min(...all.map((rect) => rect.left));
    const right = Math.max(...all.map((rect) => rect.right));
    return new DOMRect(left, all[0].top, right - left, all[0].height);
  });
  // happy-dom has no 2D context; an ellipsis is 6px.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    font: '',
    measureText: () => ({ width: 6 }),
  } as unknown as CanvasRenderingContext2D);
}

interface Fitted {
  /** The text area: the disclosure's and the summary's width. */
  room: number;
  /** The label: a picture 12px square, text or an emoji of this width at scale 1, or a lock. */
  label: { kind: 'picture' | 'text' | 'emoji' | 'lock'; text?: string; width: number };
  /** Whether the block is drawn in a lane. */
  lane?: boolean;
  /** The title's text, and its width at scale 1. */
  title?: { text: string; width: number };
  /** Whether a picture label has loaded. */
  loaded?: boolean;
}

/** The block's height, and the disclosure's: 20px inside a 22px block, from y = 1. */
const HEIGHT = 22;
const DISCLOSURE = { top: 1, bottom: 21 };

/**
 * A blank or fitted grid block, laid out as the one-line fallback lays it out: the labels at the
 * start of the line, the title in what they leave, every width and the line's height scaled by
 * the scale on the summary, the line moved down by the shift on the row.
 */
function fitted({
  room,
  label,
  lane = true,
  title = { text: 'Swim', width: 40 },
  loaded = true,
}: Fitted): HTMLElement {
  const block = document.createElement('div');
  block.className = 'grid-event';
  block.style.cssText = `height: ${HEIGHT}px`;
  if (lane) block.setAttribute('data-lane', 'calendar.anna');
  const labelMarkup = {
    picture: '<img class="label-image" alt="Anna">',
    text: `<span class="calendar-label" style="font-size: 12px">${label.text}</span>`,
    emoji: `<span class="calendar-label label-emoji" style="font-size: 12px">${label.text}</span>`,
    lock: '<ha-icon class="label-icon private-lock"></ha-icon>',
  }[label.kind];
  block.innerHTML =
    '<div class="grid-event-disclosure"><div class="event-content"><div class="summary-row">' +
    `<div class="summary">${labelMarkup}` +
    `<span class="event-title" style="font-size: 12px; display: block">${title.text}</span>` +
    '</div></div></div></div>';
  const disclosure = block.querySelector<HTMLElement>('.grid-event-disclosure')!;
  const row = block.querySelector<HTMLElement>('.summary-row')!;
  const summary = block.querySelector<HTMLElement>('.summary')!;
  const titleElement = block.querySelector<HTMLElement>('.event-title')!;
  const labelElement = summary.firstElementChild as HTMLElement;

  const scale = () => Number.parseFloat(summary.style.getPropertyValue(SCALE)) || 1;
  const line = () => 15 * scale();
  const top = () => DISCLOSURE.top + (Number.parseFloat(row.style.getPropertyValue(SHIFT)) || 0);
  // A cut label is no wider than the line; a whole one runs on past it.
  const labelWidth = () =>
    labelElement.hasAttribute(LABEL_CUT)
      ? Math.min(label.width * scale(), room)
      : label.width * scale();
  const labelBox = () => new DOMRect(4, top(), labelWidth(), line());
  const titleBox = () => {
    const left = 4 + labelWidth() + 4 * scale();
    return new DOMRect(left, top(), Math.max(0, 4 + room - left), line());
  };

  vi.spyOn(block, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, room + 8, HEIGHT));
  vi.spyOn(disclosure, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(4, DISCLOSURE.top, room, DISCLOSURE.bottom - DISCLOSURE.top),
  );
  for (const element of [row, summary]) {
    vi.spyOn(element, 'getBoundingClientRect').mockImplementation(
      () => new DOMRect(4, top(), room, line()),
    );
  }
  vi.spyOn(titleElement, 'getBoundingClientRect').mockImplementation(titleBox);
  vi.spyOn(labelElement, 'getBoundingClientRect').mockImplementation(labelBox);
  if (label.kind === 'picture' || label.kind === 'lock') {
    labelElement.getClientRects = () => [labelBox()] as unknown as DOMRectList;
  }
  if (label.kind === 'picture') {
    Object.defineProperty(labelElement, 'complete', { value: loaded });
    Object.defineProperty(labelElement, 'naturalWidth', { value: loaded ? 64 : 0 });
  }
  /** A text's rectangle on its one line, the share of its width the range covers. */
  const text = (node: Node, width: number, left: () => number) =>
    TEXT.set(node, (start, end) => {
      const length = node.textContent?.length ?? 1;
      return [
        new DOMRect(
          left() + (width * scale() * start) / length,
          top(),
          (width * scale() * (end - start)) / length,
          line(),
        ),
      ];
    });
  text(titleElement.firstChild!, title.width, () => titleBox().left);
  if (label.text) text(labelElement.firstChild!, label.width, () => 4);
  document.body.append(block);
  return block;
}

function fit(...blocks: HTMLElement[]): void {
  measurable();
  fitCompactGridTitles(blocks.map((block) => gridTitleTarget(block)!));
}

const styleOf = (block: HTMLElement, selector: string, property: string) =>
  block.querySelector<HTMLElement>(selector)!.style.getPropertyValue(property);

/** Where the group's line is centered once the fitter is done, against the disclosure's 11. */
function centerOf(block: HTMLElement): number {
  const scale = Number.parseFloat(styleOf(block, '.summary', SCALE)) || 1;
  const shift = Number.parseFloat(styleOf(block, '.summary-row', SHIFT)) || 0;
  return DISCLOSURE.top + shift + (15 * scale) / 2;
}

const PICTURE = { kind: 'picture', width: 12 } as const;

describe('a blank block in a lane', () => {
  it('shows its picture alone where the title has no room beside it', () => {
    // 28px is a 40px lane's text area. The picture takes 12px and its gap 4px, which leaves
    // 12px, and "S…" needs 16px.
    const block = fitted({ room: 28, label: PICTURE });

    fit(block);

    expect(block.dataset.gridTitleFit).toBe('blank');
    expect(block.hasAttribute(LABELS_ALONE)).toBe(true);
    expect(styleOf(block, '.summary', SCALE)).toBe('1');
    expect(centerOf(block)).toBe(11);
  });

  it('stays blank without a lane, as it always has', () => {
    const block = fitted({ room: 28, label: PICTURE, lane: false });

    fit(block);

    expect(block.dataset.gridTitleFit).toBe('blank');
    expect(block.hasAttribute(LABELS_ALONE)).toBe(false);
    expect(styleOf(block, '.summary', SCALE)).toBe('1');
    expect(styleOf(block, '.summary-row', SHIFT)).toBe('2.5px');
  });

  it('keeps its title where the title fits, and is never marked', () => {
    const block = fitted({ room: 150, label: PICTURE });

    fit(block);

    expect(block.dataset.gridTitleFit).toBe('compact');
    expect(block.hasAttribute(LABELS_ALONE)).toBe(false);
  });

  it('shows a text label at the floor where it is too wide at the title size', () => {
    // "Ben" is 30px at 12px and 25px at 10px, in 28px. The floor is measured with no shift on
    // the row and centered by what it finds there: measured with the shift the title size had,
    // the label landed 2.5px high.
    const block = fitted({ room: 28, label: { kind: 'text', text: 'Ben', width: 30 } });

    fit(block);

    expect(block.hasAttribute(LABELS_ALONE)).toBe(true);
    expect(styleOf(block, '.summary', SCALE)).toBe(String(10 / 12));
    expect(centerOf(block)).toBe(11);
    expect(block.querySelector(`[${LABEL_CUT}]`)).toBeNull();
  });

  it('cuts a text label short where it is too wide even at the floor', () => {
    // "Benjamin" is 50px at 12px and 41.7px at 10px, in 28px: "Benjam…" rather than nothing.
    const block = fitted({ room: 28, label: { kind: 'text', text: 'Benjamin', width: 50 } });

    fit(block);

    expect(block.hasAttribute(LABELS_ALONE)).toBe(true);
    expect(block.querySelector('.calendar-label')!.hasAttribute(LABEL_CUT)).toBe(true);
    expect(styleOf(block, '.summary', SCALE)).toBe(String(10 / 12));
    expect(centerOf(block)).toBe(11);
  });

  it('stays blank, with the size and shift it was given, where not even a letter fits', () => {
    // 8px holds "B" (5.2px at 10px) but not "B…".
    const block = fitted({ room: 8, label: { kind: 'text', text: 'Benjamin', width: 50 } });

    fit(block);

    expect(block.dataset.gridTitleFit).toBe('blank');
    expect(block.hasAttribute(LABELS_ALONE)).toBe(false);
    expect(block.querySelector(`[${LABEL_CUT}]`)).toBeNull();
    expect(styleOf(block, '.summary', SCALE)).toBe('1');
    expect(styleOf(block, '.summary-row', SHIFT)).toBe('2.5px');
  });

  it('leaves a block blank whose emoji is too wide even at the floor', () => {
    const block = fitted({ room: 8, label: { kind: 'emoji', text: '🏊', width: 15 } });

    fit(block);

    expect(block.hasAttribute(LABELS_ALONE)).toBe(false);
    expect(block.querySelector(`[${LABEL_CUT}]`)).toBeNull();
  });

  it('shows nothing for a private event with a lock and no calendar label', () => {
    const block = fitted({ room: 28, label: { kind: 'lock', width: 12 } });

    fit(block);

    expect(block.dataset.gridTitleFit).toBe('blank');
    expect(block.hasAttribute(LABELS_ALONE)).toBe(false);
  });

  it('waits for a picture to load, as the title does', () => {
    const block = fitted({ room: 28, label: PICTURE, loaded: false });

    fit(block);

    expect(block.hasAttribute(LABELS_ALONE)).toBe(false);
  });

  it('decides each block of a pass on its own', () => {
    const [picture, lanesOff, cut, title] = [
      fitted({ room: 28, label: PICTURE }),
      fitted({ room: 28, label: PICTURE, lane: false }),
      fitted({ room: 28, label: { kind: 'text', text: 'Benjamin', width: 50 } }),
      fitted({ room: 150, label: PICTURE }),
    ];

    fit(picture, lanesOff, cut, title);

    expect(
      [picture, lanesOff, cut, title].map((block) => block.hasAttribute(LABELS_ALONE)),
    ).toEqual([true, false, true, false]);
    expect(title.dataset.gridTitleFit).toBe('compact');
  });

  it('leaves nothing behind for the next pass, whatever this one decided', () => {
    // One node through every outcome, as a card resized or reconfigured takes it.
    const block = fitted({ room: 28, label: { kind: 'text', text: 'Benjamin', width: 50 } });
    const target = () => gridTitleTarget(block)!;

    fit(block);
    expect(block.hasAttribute(LABELS_ALONE)).toBe(true);

    resetGridTitle(target());
    expect(block.hasAttribute(LABELS_ALONE)).toBe(false);
    expect(block.querySelector(`[${LABEL_CUT}]`)).toBeNull();
    expect(block.dataset.gridTitleFit).toBeUndefined();
    expect(styleOf(block, '.summary', SCALE)).toBe('');
    expect(styleOf(block, '.summary-row', SHIFT)).toBe('');

    block.removeAttribute('data-lane');
    fitCompactGridTitles([target()]);
    expect(block.dataset.gridTitleFit).toBe('blank');
    expect(block.hasAttribute(LABELS_ALONE)).toBe(false);
    expect(block.querySelector(`[${LABEL_CUT}]`)).toBeNull();
  });

  it('lays a label the normal title cut out whole again in the one-line fallback', () => {
    // cutGridLabels marks a label for the normal title. The fallback lays labels out on a line
    // of their own, so the mark goes, and is put back only where the label is cut there too.
    const block = fitted({ room: 150, label: { kind: 'text', text: 'Ben', width: 30 } });
    block.querySelector('.calendar-label')!.setAttribute(LABEL_CUT, '');

    fit(block);

    expect(block.dataset.gridTitleFit).toBe('compact');
    expect(block.querySelector(`[${LABEL_CUT}]`)).toBeNull();
  });
});

/**
 * A grid title in its normal state, with a text label laid out as the line broke it. `lines`
 * is the label's text on each line, in order, as the browser placed it: `['Davi', 'd']` is
 * "David" broken inside the word, `['Anna ', 'Work']` "Anna Work" broken between its words.
 */
function labeled(lines: string[], options: { emoji?: boolean; scroll?: boolean; row?: 0 | 1 }) {
  const { emoji = false, scroll = false, row = 1 } = options;
  const text = lines.join('');
  const block = document.createElement('div');
  block.className = 'grid-event';
  block.innerHTML =
    '<div class="grid-event-disclosure"><div class="event-content">' +
    `<div class="summary-row" style="--calendar-card-grid-title-eligible: ${row}">` +
    `<div class="summary${scroll ? ' summary-scroll' : ''}">` +
    `<span class="calendar-label${emoji ? ' label-emoji' : ''}" style="display: inline">${text}</span>` +
    '<span class="event-title" style="display: inline">Piano</span>' +
    '</div></div></div></div>';
  // Each character sits on the line the browser broke it onto, 6px wide.
  const lineOf = lines.flatMap((part, line) => Array.from(part, () => line));
  TEXT.set(block.querySelector('.calendar-label')!.firstChild!, (start, end) => {
    const byLine = new Map<number, number[]>();
    for (let index = start; index < end; index += 1) {
      const line = lineOf[index] ?? 0;
      byLine.set(line, [...(byLine.get(line) ?? []), index]);
    }
    return [...byLine.entries()].map(
      ([line, indexes]) => new DOMRect(4, 2 + line * 15, indexes.length * 6, 15),
    );
  });
  document.body.append(block);
  return block;
}

function cut(...blocks: HTMLElement[]): boolean[] {
  measurable();
  cutGridLabels(blocks.map((block) => gridTitleTarget(block)!));
  return blocks.map((block) => block.querySelector('.calendar-label')!.hasAttribute(LABEL_CUT));
}

describe('a text label the line broke', () => {
  it('is cut short where the line broke inside a word', () => {
    expect(cut(labeled(['Davi', 'd'], {}))).toEqual([true]);
  });

  it('is left as it is where it fits, or wraps between its words', () => {
    expect(cut(labeled(['David'], {}), labeled(['Anna ', 'Work'], {}))).toEqual([false, false]);
  });

  it('is not an emoji, a scrolling title or a block too short for its title', () => {
    expect(
      cut(
        labeled(['Davi', 'd'], { emoji: true }),
        labeled(['Davi', 'd'], { scroll: true }),
        labeled(['Davi', 'd'], { row: 0 }),
      ),
    ).toEqual([false, false, false]);
  });

  it('is measured by its box once cut, which its text runs on past', () => {
    // The label's text is 60px in a 28px summary. Read by its glyphs it overflows the summary,
    // and the title was refused its normal place; cut, it is the box the stylesheet draws.
    const fits = (marked: boolean) => {
      const block = document.createElement('div');
      block.className = 'grid-event';
      block.style.cssText = 'height: 40px; padding: 2px 4px; box-sizing: border-box';
      block.innerHTML =
        '<div class="grid-event-disclosure"><div class="event-content">' +
        '<div class="summary-row" style="--calendar-card-grid-title-eligible: 1">' +
        '<div class="summary"><span class="calendar-label" style="display: inline">Benjamin</span>' +
        '<span class="event-title" style="display: block">Piano</span></div></div></div></div>';
      const label = block.querySelector<HTMLElement>('.calendar-label')!;
      if (marked) label.setAttribute(LABEL_CUT, '');
      vi.spyOn(block, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 36, 40));
      for (const selector of ['.summary-row', '.summary']) {
        vi.spyOn(block.querySelector(selector)!, 'getBoundingClientRect').mockReturnValue(
          new DOMRect(4, 2, 28, 30),
        );
      }
      vi.spyOn(label, 'getBoundingClientRect').mockReturnValue(new DOMRect(4, 2, 28, 15));
      const title = block.querySelector<HTMLElement>('.event-title')!;
      vi.spyOn(title, 'getBoundingClientRect').mockReturnValue(new DOMRect(4, 17, 28, 15));
      TEXT.set(label.firstChild!, () => [new DOMRect(4, 2, 60, 15)]);
      TEXT.set(title.firstChild!, () => [new DOMRect(4, 17, 24, 15)]);
      document.body.append(block);
      measurable();
      const result = normalGridTitleFits(gridTitleTarget(block)!);
      vi.restoreAllMocks();
      document.body.replaceChildren();
      return result;
    };

    expect([fits(false), fits(true)]).toEqual([false, true]);
  });
});

describe('the stylesheet', () => {
  const css = cardStyles.cssText.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, body]) => ({
    selectors: selectors.trim(),
    body,
  }));

  it('hides the title of a block showing its labels alone, and reveals nothing', () => {
    // Revealing the labels would show them through anything that hides the block itself, as a
    // dropped event's origin is until the card refreshes.
    const alone = rules.filter(({ selectors }) => selectors.includes(`[${LABELS_ALONE}]`));
    expect(alone.length).toBeGreaterThan(0);
    for (const { body } of alone) expect(body).not.toMatch(/visibility:\s*visible/);
    expect(
      alone.some(
        ({ selectors, body }) =>
          selectors.includes('.summary > .event-title') && /visibility:\s*hidden/.test(body),
      ),
    ).toBe(true);
    // The blank block's whole row stays hidden everywhere else.
    const blank = rules.find(
      ({ selectors, body }) =>
        selectors.includes("[data-grid-title-fit='blank']") &&
        selectors.endsWith('.summary-row') &&
        /visibility:\s*hidden/.test(body),
    );
    expect(blank?.selectors).toMatch(/:not\(\s*\[data-grid-title-labels\]\s*\)/);
  });

  it('cuts a marked label as it cuts a title word', () => {
    const label = rules.find(
      ({ selectors }) => selectors === `.grid-event-disclosure .calendar-label[${LABEL_CUT}]`,
    );
    for (const declaration of [
      'display: inline-block',
      'max-width: 100%',
      'overflow: hidden',
      'text-overflow: ellipsis',
      'white-space: nowrap',
      'vertical-align: top',
    ]) {
      expect(label?.body).toContain(declaration);
    }
  });
});
