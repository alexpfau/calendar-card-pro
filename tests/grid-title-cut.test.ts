import { afterEach, describe, expect, it, vi } from 'vitest';

import '../src/calendar-card-pro';
import { cardStyles } from '../src/rendering/styles';
import {
  cutGridTitleLines,
  gridTitleTarget,
  leadGridTitles,
  resetGridTitle,
} from '../src/utils/grid-title-fit';

/**
 * A grid title wraps for as long as it has words; these pin how it starts and how it stops.
 *
 * - It starts beside its labels: a first word wider than what the labels leave is cut with
 *   its own ellipsis on their line rather than wrapping below and leaving a label alone
 *   (`leadGridTitles`).
 * - It stops at the last line its block shows whole, and that line ends in one ellipsis when
 *   more title follows (`cutGridTitleLines`). Before, the block's own overflow stopped it
 *   wherever the block ended: 31 of 59 labeled titles on a live-like week had a line cut
 *   through the middle, in Chromium and WebKit alike.
 *
 * happy-dom lays nothing out, so each block below is a set of measured rectangles: a 13px
 * title has 15.6px line boxes, and a block is `padding: 2px 4px`, so its text area starts at
 * 2 and ends 2px above its bottom. One grapheme measures 7px and an ellipsis 6px.
 */

const LINE = 15.6;
const CHAR = 7;
const ELLIPSIS = 6;
const TEXT = new WeakMap<Node, DOMRect[]>();
const FONT = 'font-size: 13px';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

/** The top of line `n`, counted from 0. */
const line = (n: number) => 2 + n * LINE;

interface Label {
  kind: 'image' | 'icon' | 'prose' | 'emoji';
  rects: DOMRect[];
}

interface Geometry {
  /** Border-box height of the block. */
  height: number;
  /** The summary's content width, and its box, which an authored clamp shortens. */
  width?: number;
  summary: DOMRect;
  labels?: Label[];
  /** A title split into words, each with its box. */
  words?: Array<[string, DOMRect]>;
  /** A title left to the browser's own line breaking, one rectangle per line. */
  text?: [string, DOMRect[]];
  /** Text before the words, as a title in Han or Thai opens. */
  leadingText?: [string, DOMRect[]];
  scroll?: boolean;
  imageReady?: boolean;
}

function block(geometry: Geometry): HTMLElement {
  const { height, width = 100, summary, labels = [], words, text, leadingText } = geometry;
  const element = document.createElement('div');
  element.className = 'grid-event';
  element.style.cssText = `height: ${height}px; padding: 2px 4px; box-sizing: border-box`;
  const labelMarkup = labels
    .map(({ kind }) =>
      kind === 'image'
        ? '<img class="label-image" style="margin-right: 4px">'
        : kind === 'icon'
          ? '<ha-icon class="label-icon" style="margin-right: 4px"></ha-icon>'
          : `<span class="calendar-label${kind === 'emoji' ? ' label-emoji' : ''}" style="display: inline; margin-right: 4px">${kind === 'emoji' ? '🎉' : 'Anna'}</span>`,
    )
    .join('');
  const titleMarkup = words
    ? '<span class="title-words" dir="auto"><!--?lit$1$-->' +
      (leadingText ? leadingText[0] : '') +
      words
        .map(([word]) => `<span class="title-word" style="display: inline-block">${word}</span>`)
        .join(' ') +
      '</span>'
    : text![0];
  element.innerHTML =
    '<div class="grid-event-disclosure"><div class="event-content">' +
    '<div class="summary-row" style="--calendar-card-grid-title-eligible: 1">' +
    `<div class="summary${geometry.scroll ? ' summary-scroll' : ''}" style="width: ${width}px; ${FONT}">` +
    `${labelMarkup}<span class="event-title">${titleMarkup}</span></div></div>` +
    '<div class="location"><span>Main Street 5</span></div>' +
    '</div></div>';

  const rect = (node: Element, box: DOMRect) =>
    vi.spyOn(node, 'getBoundingClientRect').mockReturnValue(box);
  rect(element, new DOMRect(0, 0, 200, height));
  rect(element.querySelector('.grid-event-disclosure')!, new DOMRect(4, 2, 192, height - 4));
  for (const selector of ['.summary-row', '.summary', '.event-title']) {
    rect(element.querySelector(selector)!, summary);
  }
  const labelElements = element.querySelectorAll<HTMLElement>('.summary > :not(.event-title)');
  labels.forEach(({ kind, rects }, index) => {
    const label = labelElements[index];
    label.getClientRects = () => rects as unknown as DOMRectList;
    rect(label, rects[0]);
    if (kind === 'image') {
      Object.defineProperty(label, 'complete', { value: geometry.imageReady ?? true });
      Object.defineProperty(label, 'naturalWidth', { value: 256 });
    }
    if (kind === 'prose' || kind === 'emoji') TEXT.set(label.firstChild!, rects);
  });
  const wordElements = element.querySelectorAll<HTMLElement>('.title-word');
  (words ?? []).forEach(([, box], index) => {
    rect(wordElements[index], box);
    TEXT.set(wordElements[index].firstChild!, [box]);
  });
  const titleWords = element.querySelector('.title-words');
  if (leadingText) {
    const node = Array.from(titleWords!.childNodes).find(
      (child) => child.nodeType === Node.TEXT_NODE && child.textContent === leadingText[0],
    )!;
    TEXT.set(node, leadingText[1]);
  }
  if (text) TEXT.set(element.querySelector('.event-title')!.firstChild!, text[1]);
  document.body.append(element);
  return element;
}

function measurable(): void {
  vi.spyOn(Range.prototype, 'getClientRects').mockImplementation(function (this: Range) {
    return (TEXT.get(this.startContainer) ?? []) as unknown as DOMRectList;
  });
  // A prefix is one grapheme; a whole run reports its own width.
  vi.spyOn(Range.prototype, 'getBoundingClientRect').mockImplementation(function (this: Range) {
    const box = TEXT.get(this.startContainer)?.[0] ?? new DOMRect();
    return new DOMRect(box.left, box.top, CHAR * (this.endOffset - this.startOffset), box.height);
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    font: '',
    measureText: () => ({ width: ELLIPSIS }),
  } as unknown as CanvasRenderingContext2D);
}

function cut(geometry: Geometry): HTMLElement {
  const element = block(geometry);
  measurable();
  cutGridTitleLines([gridTitleTarget(element)!]);
  return element;
}

function lead(geometry: Geometry): HTMLElement {
  const element = block(geometry);
  measurable();
  leadGridTitles([gridTitleTarget(element)!]);
  return element;
}

const words = (element: HTMLElement) => Array.from(element.querySelectorAll('.title-word'));
const cutWord = (element: HTMLElement) =>
  words(element).find((word) => word.hasAttribute('data-grid-title-cut'))?.textContent ?? null;
const room = (element: HTMLElement) =>
  element
    .querySelector<HTMLElement>('[data-grid-title-cut]')
    ?.style.getPropertyValue('--calendar-card-grid-title-cut-room');
const fitLines = (element: HTMLElement) => {
  const summary = element.querySelector<HTMLElement>('.summary')!;
  return summary.hasAttribute('data-grid-title-lines')
    ? summary.style.getPropertyValue('--calendar-card-grid-title-fit-lines')
    : null;
};
const labelRun = (element: HTMLElement) =>
  element
    .querySelector<HTMLElement>('.summary')!
    .style.getPropertyValue('--calendar-card-grid-title-label-run') || null;

const PICTURE: Label = { kind: 'image', rects: [new DOMRect(4, line(0) + 1.3, 13, 13)] };

/** "Pediatrician 👶" beside a picture: the emoji wraps to a second line. */
const PEDIATRICIAN = {
  summary: new DOMRect(4, line(0), 100, 2 * LINE),
  labels: [PICTURE],
  words: [
    ['Pediatrician', new DOMRect(21, line(0), 70, LINE)],
    ['👶', new DOMRect(4, line(1), 16, LINE)],
  ] as Array<[string, DOMRect]>,
};

describe('a grid title stops at the last whole line its block shows', () => {
  it('ends a one-line block on the word that fits, with room for its ellipsis', () => {
    // 20px block: a 16px text area holds the first line box (2 to 17.6) and not the second.
    const element = cut({ height: 20, ...PEDIATRICIAN });

    expect(cutWord(element)).toBe('Pediatrician');
    // Its own 70px plus the 13px left on its line, a hair under: "Pediatrician…" fits.
    expect(room(element)).toBe(`${70 + (100 - (91 - 4)) - 1 / 64}px`);
    expect(fitLines(element)).toBeNull();
  });

  it('steps back a word when the last one has no room for a character and an ellipsis', () => {
    // "at" ends the line 5px short of the edge: 7 + 5 is less than a character plus an
    // ellipsis, and a narrower clip draws the ellipsis itself half cut. Hiding "at" gives its
    // width and the space before it back to "lesson".
    const element = cut({
      height: 20,
      width: 90,
      summary: new DOMRect(4, line(0), 90, 2 * LINE),
      words: [
        ['Swim', new DOMRect(4, line(0), 30, LINE)],
        ['lesson', new DOMRect(38, line(0), 40, LINE)],
        ['at', new DOMRect(82, line(0), 7, LINE)],
        ['the', new DOMRect(4, line(1), 20, LINE)],
        ['pool', new DOMRect(28, line(1), 25, LINE)],
      ],
    });

    expect(cutWord(element)).toBe('lesson');
    expect(room(element)).toBe(`${40 + 4 + 7 + (90 - (89 - 4)) - 1 / 64}px`);
  });

  it('cuts a three-line title in a two-line block on its second line', () => {
    const element = cut({
      height: 36,
      summary: new DOMRect(4, line(0), 100, 3 * LINE),
      labels: [PICTURE],
      words: [
        ['Football', new DOMRect(21, line(0), 55, LINE)],
        ['training', new DOMRect(4, line(1), 50, LINE)],
        ['⚽', new DOMRect(58, line(1), 16, LINE)],
        ['at', new DOMRect(4, line(2), 12, LINE)],
        ['the', new DOMRect(20, line(2), 20, LINE)],
      ],
    });

    expect(cutWord(element)).toBe('⚽');
  });

  it('leaves a title alone when every line fits', () => {
    expect(cutWord(cut({ height: 40, ...PEDIATRICIAN }))).toBeNull();
  });

  it('leaves a block in which no line fits to the compact fallback', () => {
    const element = cut({ height: 15, ...PEDIATRICIAN });
    expect(cutWord(element)).toBeNull();
    expect(fitLines(element)).toBeNull();
  });

  it('clamps text the browser breaks itself, which it can shorten by the character', () => {
    const element = cut({
      height: 20,
      summary: new DOMRect(4, line(0), 100, 2 * LINE),
      labels: [PICTURE],
      text: [
        '会議室で打ち合わせ',
        [new DOMRect(21, line(0), 70, LINE), new DOMRect(4, line(1), 40, LINE)],
      ],
    });

    expect(fitLines(element)).toBe('1');
    expect(cutWord(element)).toBeNull();
  });

  it('ends a title its configured clamp shortened on a word as well', () => {
    // title_max_lines: 1 in a block with room for two. The second line still lays out below
    // the clamped box, and a line clamp asked to end on word boxes hides one for its ellipsis.
    const element = cut({
      height: 40,
      ...PEDIATRICIAN,
      summary: new DOMRect(4, line(0), 100, LINE),
    });

    expect(cutWord(element)).toBe('Pediatrician');
  });

  it('takes over a configured clamp on text at the same count, never a looser one', () => {
    // title_max_lines: 1 already stops this text at one line, and its own ellipsis is right
    // for text. The runtime clamp still takes over, at that same count, because its rule also
    // drops the bottom padding through which the next line's top showed under the title.
    const element = cut({
      height: 40,
      summary: new DOMRect(4, line(0), 100, LINE),
      text: [
        '会議室で打ち合わせ',
        [new DOMRect(4, line(0), 90, LINE), new DOMRect(4, line(1), 40, LINE)],
      ],
    });

    expect(fitLines(element)).toBe('1');
  });

  it('never touches a scrolling title, which is one line that moves', () => {
    const element = cut({ height: 20, ...PEDIATRICIAN, scroll: true });
    expect(cutWord(element)).toBeNull();
    expect(fitLines(element)).toBeNull();
  });

  it('waits for a picture to know its size', () => {
    expect(cutWord(cut({ height: 20, ...PEDIATRICIAN, imageReady: false }))).toBeNull();
  });
});

describe('a labeled grid title starts on its labels line', () => {
  const BIRTHDAY: Array<[string, DOMRect]> = [
    ['Birthday', new DOMRect(4, line(1), 60, LINE)],
    ['lunch', new DOMRect(4, line(2), 35, LINE)],
  ];

  it.each<[string, Label[], string]>([
    [
      'a picture wider than it is tall',
      [{ kind: 'image', rects: [new DOMRect(4, 3, 20, 13)] }],
      '24px',
    ],
    ['an icon', [{ kind: 'icon', rects: [new DOMRect(4, 3, 13, 13)] }], '17px'],
    ['an emoji', [{ kind: 'emoji', rects: [new DOMRect(4, 2, 16.25, 15)] }], '20.25px'],
    ['a prose label', [{ kind: 'prose', rects: [new DOMRect(4, 2, 30, 15)] }], '34px'],
    [
      'a merged run',
      [
        { kind: 'image', rects: [new DOMRect(4, 3, 13, 13)] },
        { kind: 'icon', rects: [new DOMRect(21, 3, 13, 13)] },
        { kind: 'prose', rects: [new DOMRect(38, 2, 30, 15)] },
      ],
      '68px',
    ],
  ])('publishes the width of %s', (_name, labels, expected) => {
    const element = lead({
      height: 60,
      summary: new DOMRect(4, line(0), 100, 3 * LINE),
      labels,
      words: BIRTHDAY,
    });

    expect(labelRun(element)).toBe(expected);
  });

  it('leaves the word to wrap where not even a character and an ellipsis fit beside it', () => {
    // 25px of summary, 17px of label run: 8px left, against 7 + 6.
    const element = lead({
      height: 60,
      width: 25,
      summary: new DOMRect(4, line(0), 25, 3 * LINE),
      labels: [PICTURE],
      words: BIRTHDAY,
    });

    expect(labelRun(element)).toBeNull();
  });

  it('leaves a label that wraps, which the title cannot start beside', () => {
    const element = lead({
      height: 60,
      summary: new DOMRect(4, line(0), 100, 3 * LINE),
      labels: [{ kind: 'prose', rects: [new DOMRect(4, 2, 96, 15), new DOMRect(4, 17.6, 20, 15)] }],
      words: BIRTHDAY,
    });

    expect(labelRun(element)).toBeNull();
  });

  it('leaves a title that opens with text broken between characters', () => {
    const element = lead({
      height: 60,
      summary: new DOMRect(4, line(0), 100, 3 * LINE),
      labels: [PICTURE],
      leadingText: ['会議 ', [new DOMRect(21, line(0), 28, LINE)]],
      words: [['Room', new DOMRect(53, line(0), 30, LINE)]],
    });

    expect(labelRun(element)).toBeNull();
  });

  it('leaves an unlabeled title and a scrolling one', () => {
    expect(labelRun(lead({ height: 60, ...PEDIATRICIAN, labels: [] }))).toBeNull();
    expect(labelRun(lead({ height: 60, ...PEDIATRICIAN, scroll: true }))).toBeNull();
  });
});

describe('every pass starts from the rendered title', () => {
  it('clears the lead, the cut and the clamp', () => {
    const element = block({ height: 20, ...PEDIATRICIAN });
    const target = gridTitleTarget(element)!;
    const [first] = words(element) as HTMLElement[];
    target.summary.style.setProperty('--calendar-card-grid-title-label-run', '17px');
    target.summary.style.setProperty('--calendar-card-grid-title-fit-lines', '1');
    target.summary.setAttribute('data-grid-title-lines', '');
    first.setAttribute('data-grid-title-cut', '');
    first.style.setProperty('--calendar-card-grid-title-cut-room', '80px');

    resetGridTitle(target);

    expect(labelRun(element)).toBeNull();
    expect(fitLines(element)).toBeNull();
    expect(cutWord(element)).toBeNull();
    expect(first.style.getPropertyValue('--calendar-card-grid-title-cut-room')).toBe('');
  });

  it('cuts the title before fitting the rows beneath it', () => {
    // A title line half past the block's edge overflows the content as surely as a detail
    // row does. Cut first, the 40px title and the 20px address fill the 60px box exactly;
    // measured uncut, the address would be withdrawn for a line nobody can read.
    const element = block({ height: 20, ...PEDIATRICIAN });
    const card = document.createElement('calendar-card-pro-dev') as unknown as HTMLElement & {
      _applyGridDisclosureSafety(): void;
    };
    const root = card.attachShadow({ mode: 'open' });
    Object.defineProperty(card, 'renderRoot', { value: root });
    document.body.append(card);
    root.append(element);
    const content = element.querySelector<HTMLElement>('.event-content')!;
    const location = element.querySelector<HTMLElement>('.location')!;
    // Disclosed, so the detail pass considers it; happy-dom reports no boxes on its own.
    location.getClientRects = () => [new DOMRect(4, 40, 100, LINE)] as unknown as DOMRectList;
    Object.defineProperty(content, 'clientHeight', { value: 60 });
    Object.defineProperty(content, 'scrollHeight', {
      get: () =>
        (element.querySelector('[data-grid-title-cut]') ? 40 : 60) +
        (location.classList.contains('grid-event-detail-clipped') ? 0 : 20),
    });
    measurable();

    card._applyGridDisclosureSafety();

    expect(cutWord(element)).toBe('Pediatrician');
    expect(location.classList.contains('grid-event-detail-clipped')).toBe(false);
  });
});

describe('the stylesheet half', () => {
  const CSS = cardStyles.cssText.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');
  const rules = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, body], index) => ({
    selectors: selectors.trim(),
    body,
    index,
  }));
  const NORMAL =
    ".grid-event:not( [data-grid-title-fit='measuring'], [data-grid-title-fit='compact'], [data-grid-title-fit='blank'] ) .grid-event-disclosure";
  const rule = (selectors: string) => {
    const found = rules.find((candidate) => candidate.selectors === selectors);
    expect(found, selectors).toBeDefined();
    return found!;
  };

  it('starts every wrapped grid line at the text edge, whatever the label', () => {
    // The hanging indent rules are one class and one :has() argument each, the same weight
    // as this one, so it wins by coming later.
    const grid = rule('.grid-event-disclosure .summary');
    expect(grid.body).toMatch(/padding-inline-start: 0;/);
    expect(grid.body).toMatch(/text-indent: 0;/);
    for (const hanging of [
      '.summary:has(> .label-icon), .summary:has(> .label-image)',
      '.summary:has(> .label-emoji)',
    ]) {
      expect(rule(hanging).body).toMatch(/text-indent: calc\(-1/);
      expect(rule(hanging).index).toBeLessThan(grid.index);
    }
  });

  it('narrows only the first word, and only in a normal title', () => {
    const first = rule(`${NORMAL} .title-words > .title-word:first-child`);
    expect(first.body.trim()).toBe(
      'max-width: calc(100% - var(--calendar-card-grid-title-label-run, 0px));',
    );
  });

  it('ends a cut word in one ellipsis, hides what follows, and outranks the first-word rule', () => {
    const first = rule(`${NORMAL} .title-words > .title-word:first-child`);
    const word = rule(`${NORMAL} .title-words > .title-word[data-grid-title-cut]`);
    expect(word.body.trim()).toBe('max-width: var(--calendar-card-grid-title-cut-room);');
    expect(word.index).toBeGreaterThan(first.index);
    expect(
      rule(`${NORMAL} .title-words > .title-word[data-grid-title-cut]::after`).body.trim(),
    ).toBe("content: '\\2026';");
    expect(
      rule(`${NORMAL} .title-words > .title-word[data-grid-title-cut] ~ .title-word`).body.trim(),
    ).toBe('display: none;');
  });

  it('clamps a text title to the measured lines on whichever box clamps it, padding and all', () => {
    expect(
      rule(
        `${NORMAL} .summary[data-grid-title-lines], ${NORMAL} .summary[data-grid-title-lines] > .event-title`,
      ).body.trim(),
    ).toBe('-webkit-line-clamp: var(--calendar-card-grid-title-fit-lines); padding-bottom: 0;');
  });
});
