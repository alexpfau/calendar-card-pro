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
const LABEL_OMITTED = 'data-grid-label-omitted';

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

interface Label {
  /** A picture 12px square, text or an emoji of `width` at scale 1, or a private event's lock. */
  kind: 'picture' | 'text' | 'emoji' | 'lock';
  text?: string;
  width: number;
}

interface Fitted {
  /** The text area: the disclosure's and the summary's width. */
  room: number;
  /** The labels, in the order they lead the title. */
  labels: Label[];
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

const MARKUP: Record<Label['kind'], (text?: string) => string> = {
  picture: () => '<img class="label-image" alt="Anna">',
  text: (text) => `<span class="calendar-label" style="font-size: 12px">${text}</span>`,
  emoji: (text) =>
    `<span class="calendar-label label-emoji" style="font-size: 12px">${text}</span>`,
  lock: () => '<ha-icon class="label-icon private-lock"></ha-icon>',
};

/**
 * A blank or fitted grid block, laid out as the one-line fallback lays it out: the labels at the
 * start of the line with a 4px gap after each, the title in what they leave, every width and the
 * line's height scaled by the scale on the summary, the line moved down by the shift on the row.
 * A text label cut short shrinks into the room the labels before it leave, and one left out
 * takes none, as the stylesheet lays them out.
 */
function fitted({
  room,
  labels,
  lane = true,
  title = { text: 'Swim', width: 40 },
  loaded = true,
}: Fitted): HTMLElement {
  const block = document.createElement('div');
  block.className = 'grid-event';
  block.style.cssText = `height: ${HEIGHT}px`;
  if (lane) block.setAttribute('data-lane', 'calendar.anna');
  block.innerHTML =
    '<div class="grid-event-disclosure"><div class="event-content"><div class="summary-row">' +
    `<div class="summary">${labels.map((label) => MARKUP[label.kind](label.text)).join('')}` +
    `<span class="event-title" style="font-size: 12px; display: block">${title.text}</span>` +
    '</div></div></div></div>';
  const disclosure = block.querySelector<HTMLElement>('.grid-event-disclosure')!;
  const row = block.querySelector<HTMLElement>('.summary-row')!;
  const summary = block.querySelector<HTMLElement>('.summary')!;
  const titleElement = block.querySelector<HTMLElement>('.event-title')!;
  const elements = Array.from(summary.children).slice(0, labels.length) as HTMLElement[];

  const scale = () => Number.parseFloat(summary.style.getPropertyValue(SCALE)) || 1;
  const line = () => 15 * scale();
  const top = () => DISCLOSURE.top + (Number.parseFloat(row.style.getPropertyValue(SHIFT)) || 0);
  /** Each label's box, left to right, and where the title starts after them. */
  const layout = () => {
    let x = 4;
    const boxes = labels.map((label, index) => {
      const element = elements[index];
      if (element.hasAttribute(LABEL_OMITTED)) return new DOMRect(x, top(), 0, 0);
      const natural = label.width * scale();
      const width = element.hasAttribute(LABEL_CUT)
        ? Math.max(0, Math.min(natural, 4 + room - x))
        : natural;
      const box = new DOMRect(x, top(), width, line());
      x += width + 4 * scale();
      return box;
    });
    return { boxes, title: x };
  };
  const titleBox = () => {
    const left = layout().title;
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
  /** A text's rectangle on its one line, the share of its width the range covers. */
  const text = (node: Node, width: number, left: () => number, shown = () => true) =>
    TEXT.set(node, (start, end) => {
      if (!shown()) return [];
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
  labels.forEach((label, index) => {
    const element = elements[index];
    const box = () => layout().boxes[index];
    vi.spyOn(element, 'getBoundingClientRect').mockImplementation(box);
    if (label.kind === 'picture' || label.kind === 'lock') {
      element.getClientRects = () => [box()] as unknown as DOMRectList;
    }
    if (label.kind === 'picture') {
      Object.defineProperty(element, 'complete', { value: loaded });
      Object.defineProperty(element, 'naturalWidth', { value: loaded ? 64 : 0 });
    }
    if (label.text) {
      text(
        element.firstChild!,
        label.width,
        () => box().left,
        () => !element.hasAttribute(LABEL_OMITTED),
      );
    }
  });
  text(titleElement.firstChild!, title.width, () => titleBox().left);
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
const text = (label: string, width: number): Label => ({ kind: 'text', text: label, width });

describe('a blank block in a lane', () => {
  it('shows its picture alone where the title has no room beside it', () => {
    // 28px is a 40px lane's text area. The picture takes 12px and its gap 4px, which leaves
    // 12px, and "S…" needs 16px.
    const block = fitted({ room: 28, labels: [PICTURE] });

    fit(block);

    expect(block.dataset.gridTitleFit).toBe('blank');
    expect(block.hasAttribute(LABELS_ALONE)).toBe(true);
    expect(styleOf(block, '.summary', SCALE)).toBe('1');
    expect(centerOf(block)).toBe(11);
  });

  it('stays blank without a lane, as it always has', () => {
    const block = fitted({ room: 28, labels: [PICTURE], lane: false });

    fit(block);

    expect(block.dataset.gridTitleFit).toBe('blank');
    expect(block.hasAttribute(LABELS_ALONE)).toBe(false);
    expect(styleOf(block, '.summary', SCALE)).toBe('1');
    expect(styleOf(block, '.summary-row', SHIFT)).toBe('2.5px');
  });

  it('keeps its title where the title fits, and is never marked', () => {
    const block = fitted({ room: 150, labels: [PICTURE] });

    fit(block);

    expect(block.dataset.gridTitleFit).toBe('compact');
    expect(block.hasAttribute(LABELS_ALONE)).toBe(false);
  });

  it('shows a text label at the floor where it is too wide at the title size', () => {
    // "Ben" is 30px at 12px and 25px at 10px, in 28px. The floor is measured with no shift on
    // the row and centered by what it finds there: measured with the shift the title size had,
    // the label landed 2.5px high.
    const block = fitted({ room: 28, labels: [text('Ben', 30)] });

    fit(block);

    expect(block.hasAttribute(LABELS_ALONE)).toBe(true);
    expect(styleOf(block, '.summary', SCALE)).toBe(String(10 / 12));
    expect(centerOf(block)).toBe(11);
    expect(block.querySelector(`[${LABEL_CUT}]`)).toBeNull();
  });

  it('cuts a text label short where it is too wide even at the floor', () => {
    // "Benjamin" is 50px at 12px and 41.7px at 10px, in 28px: "Benjam…" rather than nothing.
    const block = fitted({ room: 28, labels: [text('Benjamin', 50)] });

    fit(block);

    expect(block.hasAttribute(LABELS_ALONE)).toBe(true);
    expect(block.querySelector('.calendar-label')!.hasAttribute(LABEL_CUT)).toBe(true);
    expect(styleOf(block, '.summary', SCALE)).toBe(String(10 / 12));
    expect(centerOf(block)).toBe(11);
  });

  it('cuts a name beside a picture into the room the picture leaves', () => {
    // At the floor the picture and its gap take 13.3px of 40px, leaving "Benjam…" 26.7px.
    const block = fitted({ room: 40, labels: [PICTURE, text('Benjamin', 50)] });

    fit(block);

    expect(block.hasAttribute(LABELS_ALONE)).toBe(true);
    expect(block.querySelector('.calendar-label')!.hasAttribute(LABEL_CUT)).toBe(true);
    expect(block.querySelector(`[${LABEL_OMITTED}]`)).toBeNull();
  });

  it('shows the picture without the name where not even a letter of it fits beside it', () => {
    // At the floor, 20px less the picture and its gap leaves 6.7px, and "B…" needs 11.2px.
    const block = fitted({ room: 20, labels: [PICTURE, text('Benjamin', 50)] });

    fit(block);

    expect(block.hasAttribute(LABELS_ALONE)).toBe(true);
    expect(block.querySelector('.calendar-label')!.hasAttribute(LABEL_OMITTED)).toBe(true);
    expect(block.querySelector(`[${LABEL_CUT}]`)).toBeNull();
    expect(centerOf(block)).toBe(11);
  });

  it('stays blank, with the size and shift it was given, where not even a letter fits', () => {
    // 8px holds "B" (5.2px at 10px) but not "B…", and there is no picture to fall back on.
    const block = fitted({ room: 8, labels: [text('Benjamin', 50)] });

    fit(block);

    expect(block.dataset.gridTitleFit).toBe('blank');
    expect(block.hasAttribute(LABELS_ALONE)).toBe(false);
    expect(block.querySelector(`[${LABEL_CUT}], [${LABEL_OMITTED}]`)).toBeNull();
    expect(styleOf(block, '.summary', SCALE)).toBe('1');
    expect(styleOf(block, '.summary-row', SHIFT)).toBe('2.5px');
  });

  it('leaves a block blank whose emoji is too wide even at the floor', () => {
    const block = fitted({ room: 8, labels: [{ kind: 'emoji', text: '🏊', width: 15 }] });

    fit(block);

    expect(block.hasAttribute(LABELS_ALONE)).toBe(false);
    expect(block.querySelector(`[${LABEL_CUT}]`)).toBeNull();
  });

  it('shows nothing for a private event with a lock and no calendar label', () => {
    const block = fitted({ room: 28, labels: [{ kind: 'lock', width: 12 }] });

    fit(block);

    expect(block.dataset.gridTitleFit).toBe('blank');
    expect(block.hasAttribute(LABELS_ALONE)).toBe(false);
  });

  it('never shows a lock alone in place of a name it left out', () => {
    // A private event's name label too wide to show even cut: the lock beside it says nothing
    // of whose the event is.
    const block = fitted({ room: 8, labels: [text('Benjamin', 50), { kind: 'lock', width: 12 }] });

    fit(block);

    expect(block.hasAttribute(LABELS_ALONE)).toBe(false);
    expect(block.querySelector(`[${LABEL_OMITTED}]`)).toBeNull();
  });

  it('waits for a picture to load, as the title does', () => {
    const block = fitted({ room: 28, labels: [PICTURE], loaded: false });

    fit(block);

    expect(block.hasAttribute(LABELS_ALONE)).toBe(false);
  });

  it('decides each block of a pass on its own', () => {
    const [picture, lanesOff, cut, title] = [
      fitted({ room: 28, labels: [PICTURE] }),
      fitted({ room: 28, labels: [PICTURE], lane: false }),
      fitted({ room: 28, labels: [text('Benjamin', 50)] }),
      fitted({ room: 150, labels: [PICTURE] }),
    ];

    fit(picture, lanesOff, cut, title);

    expect(
      [picture, lanesOff, cut, title].map((block) => block.hasAttribute(LABELS_ALONE)),
    ).toEqual([true, false, true, false]);
    expect(title.dataset.gridTitleFit).toBe('compact');
  });

  it('leaves nothing behind for the next pass, whatever this one decided', () => {
    // One node through every outcome, as a card resized or reconfigured takes it.
    const block = fitted({ room: 20, labels: [PICTURE, text('Benjamin', 50)] });
    const target = () => gridTitleTarget(block)!;

    fit(block);
    expect(block.hasAttribute(LABELS_ALONE)).toBe(true);
    expect(block.querySelector(`[${LABEL_OMITTED}]`)).not.toBeNull();

    resetGridTitle(target());
    expect(block.hasAttribute(LABELS_ALONE)).toBe(false);
    expect(block.querySelector(`[${LABEL_CUT}], [${LABEL_OMITTED}]`)).toBeNull();
    expect(block.dataset.gridTitleFit).toBeUndefined();
    expect(styleOf(block, '.summary', SCALE)).toBe('');
    expect(styleOf(block, '.summary-row', SHIFT)).toBe('');

    block.removeAttribute('data-lane');
    fitCompactGridTitles([target()]);
    expect(block.dataset.gridTitleFit).toBe('blank');
    expect(block.hasAttribute(LABELS_ALONE)).toBe(false);
    expect(block.querySelector(`[${LABEL_CUT}], [${LABEL_OMITTED}]`)).toBeNull();
  });

  it('lays a label the normal title cut out whole again in the one-line fallback', () => {
    // cutGridLabels marks a label for the normal title. The fallback lays labels out on a line
    // of their own, so the mark goes, and is put back only where the label is cut there too.
    const block = fitted({ room: 150, labels: [text('Ben', 30)] });
    block.querySelector('.calendar-label')!.setAttribute(LABEL_CUT, '');

    fit(block);

    expect(block.dataset.gridTitleFit).toBe('compact');
    expect(block.querySelector(`[${LABEL_CUT}]`)).toBeNull();
  });
});

/** The width of a grid title's line in these fixtures: a narrow lane's. */
const LINE_WIDTH = 32;

/**
 * A grid title in its normal state, with a text label laid out as the line broke it, in a
 * summary 32px wide. `lines` is the label's text on each line, in order, as the browser placed
 * it, each character 6px wide: `['Davids', 'on']` is "Davidson", 48px, broken inside the word,
 * `['Anna ', 'Work']` "Anna Work" broken between its words.
 */
function labeled(
  lines: string[],
  options: { emoji?: boolean; scroll?: boolean; row?: 0 | 1 } = {},
) {
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
  vi.spyOn(block.querySelector('.summary')!, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(4, 2, LINE_WIDTH, lines.length * 15),
  );
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

describe('a text label in a narrow block', () => {
  it('is cut where a word is wider than its line, as the line can only break inside it', () => {
    expect(cut(labeled(['Davids', 'on']), labeled(['Anna ', 'Works', 'hop']))).toEqual([
      true,
      true,
    ]);
  });

  it('is left as it is where every word fits a line, however it wraps', () => {
    expect(
      cut(
        labeled(['David']),
        // Between its words.
        labeled(['Anna ', 'Work']),
        // After the hyphen of a compound, as a title wraps there too: "Anna-" is 30px.
        labeled(['Anna-', 'Lena']),
        // A word the browser hyphenated beside a picture, where it fits a line of its own.
        labeled(['Lu', 'kas']),
      ),
    ).toEqual([false, false, false, false]);
  });

  it('is left to wrap between characters in a script written without spaces', () => {
    expect(cut(labeled(['山田太郎山田', '太郎']))).toEqual([false]);
  });

  it('is not an emoji, a scrolling title or a block too short for its title', () => {
    expect(
      cut(
        labeled(['Davids', 'on'], { emoji: true }),
        labeled(['Davids', 'on'], { scroll: true }),
        labeled(['Davids', 'on'], { row: 0 }),
      ),
    ).toEqual([false, false, false]);
  });

  it('is measured by its box once cut, which its text runs on past', () => {
    // The label's text is 60px in a 28px summary. Read by its glyphs it overflows the summary,
    // and the title was refused its normal place; cut, it is the box the stylesheet draws.
    const fits = (marked: boolean) => {
      const block = wideLabel();
      if (marked) block.querySelector('.calendar-label')!.setAttribute(LABEL_CUT, '');
      measurable();
      const result = normalGridTitleFits(gridTitleTarget(block)!);
      vi.restoreAllMocks();
      document.body.replaceChildren();
      return result;
    };

    expect([fits(false), fits(true)]).toEqual([false, true]);
  });

  it('is cut by the fitting pass, which then keeps the title in its normal place', () => {
    // The pass itself, not the function: without the call the label overflows its summary,
    // the title is refused its normal place, and the fallback leaves nothing marked.
    const card = document.createElement('calendar-card-pro-dev') as unknown as HTMLElement & {
      _applyGridDisclosureSafety(): void;
    };
    const root = card.attachShadow({ mode: 'open' });
    Object.defineProperty(card, 'renderRoot', { value: root });
    document.body.append(card);
    const block = wideLabel();
    root.append(block);
    measurable();

    card._applyGridDisclosureSafety();

    expect(block.querySelector('.calendar-label')!.hasAttribute(LABEL_CUT)).toBe(true);
    expect(block.dataset.gridTitleFit).toBeUndefined();
  });
});

/**
 * A grid block in its normal state whose text label, "Benjamin", is 60px in a 28px summary: on
 * the line its text runs past the summary, and once cut its box is the summary's width.
 */
function wideLabel(): HTMLElement {
  const block = document.createElement('div');
  block.className = 'grid-event';
  block.style.cssText = 'height: 40px; padding: 2px 4px; box-sizing: border-box';
  block.innerHTML =
    '<div class="grid-event-disclosure"><div class="event-content">' +
    '<div class="summary-row" style="--calendar-card-grid-title-eligible: 1">' +
    '<div class="summary"><span class="calendar-label" style="display: inline">Benjamin</span>' +
    '<span class="event-title" style="display: block">Piano</span></div></div></div></div>';
  const label = block.querySelector<HTMLElement>('.calendar-label')!;
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
  return block;
}

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
      'overflow-wrap: normal',
      'hyphens: manual',
      'vertical-align: top',
    ]) {
      expect(label?.body).toContain(declaration);
    }
    // It still wraps between its words, so only the word too wide for its line is cut.
    expect(label?.body).not.toContain('white-space');
  });

  it('lets a cut label shrink beside a picture in the one-line fallback, and leaves one out', () => {
    const fallback = rules.filter(({ selectors }) =>
      selectors.startsWith(".grid-event[data-grid-title-fit='blank']"),
    );
    expect(
      fallback.find(({ selectors }) => selectors.endsWith(`.calendar-label[${LABEL_CUT}]`))?.body,
    ).toMatch(/flex:\s*0 1 auto;[^}]*min-width:\s*0/);
    expect(
      fallback.find(({ selectors }) => selectors.endsWith(`[${LABEL_OMITTED}]`))?.body,
    ).toMatch(/display:\s*none/);
  });
});
