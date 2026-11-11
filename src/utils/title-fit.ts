/**
 * Fitting the time to a title that wraps beside it (`time_position: title`, list and column).
 *
 * A title beside the time wraps across its row, and the time ends the title's last line where it
 * fits there and takes a line of its own where it does not. The browser decides which: an empty
 * float the size of the time, `.title-room`, ends the title's text, and a float placed after the
 * last word goes on that word's line only where the line still has room for it. The time itself
 * is not that float. It stays a sibling of `.summary`, where every font size inside it is measured
 * against the card's text rather than the title's, and is placed over the room. So the card
 * measures the time and sizes the room to it (`data-title-fit`). Until it has, and on a row it
 * cannot measure, the time is drawn on a line of its own below the title, which can never
 * overlap it.
 *
 * The attribute's value is the row's direction, `ltr` or `rtl`, and the stylesheet floats the
 * room and places the time by it on named sides. A float to the inline end and `:dir()` would
 * say the same, but Chromium before 118 has neither the one nor, before 120, the other, nor
 * Safari before 16.4 the second, and the browsers this card supports reach back past all
 * three: a room floated right beside a time placed at the inline end of a right-to-left row
 * sat on one side of the row and the time on the other.
 *
 * `title_max_lines` of two or more needs more, because where the time goes then depends on
 * whether the title fits: a title that fits keeps the time at its end, and a longer one is cut on
 * the last line the limit allows. The card marks the rows to cut with `data-title-cut`. A cut row
 * ends its last line in "…" and puts the time at the end of that line (`""`), unless the time is
 * too wide or too tall to leave the title a line beside it: then the title is cut across the
 * whole row and the time takes a line of its own below it (`"below"`), as it does without a limit
 * where it does not fit. The rules under TIME BESIDE THE TITLE in styles.ts draw each state.
 *
 * Every row is read before any is written: the time once, then a capped row's lines with the room
 * in place, then where the clamp put the last line of a row cut beside the time. A card lays out
 * at most three times however many rows it has.
 */

/** The attribute that marks a row whose room has been sized to its time, with its direction. */
export const TITLE_FIT = 'data-title-fit';

/** The attribute that marks a row to cut, `""` beside the time or `"below"`. */
export const TITLE_CUT = 'data-title-cut';

/** The custom properties the rules read, all in CSS pixels, set on the row. */
export const TITLE_FIT_PROPERTIES = {
  /** The time's box, with its badge: the room ending the title is this wide and tall. */
  width: '--calendar-card-title-room-width',
  height: '--calendar-card-title-room-height',
  /** The title's bottom padding, above which the time sits. */
  pad: '--calendar-card-title-pad',
  /** Cut beside the time: where the room for it starts, from the top of the first line: halfway
   * down the last line the clamp keeps, which shortens that line and leaves the one above whole. */
  start: '--calendar-card-title-cut-start',
  /** Cut beside the time: where it ends, the bottom of the last line the clamp keeps. */
  end: '--calendar-card-title-cut-end',
  /** Cut below the title: the room under it for the time and the padding. */
  below: '--calendar-card-title-cut-below',
} as const;

/** The gap the room keeps before the time, where the row does not say. */
const DEFAULT_GAP = 12;

/** The custom property the row says that gap in. */
export const TITLE_ROOM_GAP = '--calendar-card-title-room-gap';

/** The least width, in lines of the title, that a cut leaves the title beside the time. */
const MIN_TITLE_ROOM_LINES = 2;

/** The properties a cut sets, which a row loses when it is no longer cut. */
const CUT_PROPERTIES = [
  TITLE_FIT_PROPERTIES.start,
  TITLE_FIT_PROPERTIES.end,
  TITLE_FIT_PROPERTIES.below,
] as const;

/**
 * Remove a row's cut, leaving it as the stylesheet draws it with no limit.
 *
 * @param row - A `.summary-row.title-wrap`
 */
export function clearTitleCut(row: HTMLElement): void {
  row.removeAttribute(TITLE_CUT);
  for (const property of CUT_PROPERTIES) row.style.removeProperty(property);
}

/**
 * Remove everything the card measured on a row: its cut, and the room it sized to the time.
 *
 * @param row - A `.summary-row.title-wrap`
 */
export function clearTitleFit(row: HTMLElement): void {
  clearTitleCut(row);
  row.removeAttribute(TITLE_FIT);
  for (const property of Object.values(TITLE_FIT_PROPERTIES)) row.style.removeProperty(property);
}

/** A row and the parts the measures are read from. */
interface Parts {
  direction: 'ltr' | 'rtl';
  row: HTMLElement;
  summary: HTMLElement;
  aside: HTMLElement;
  /** CSS pixels per layout pixel the row is drawn at: 1 unless an ancestor scales the card. */
  scale: number;
}

/** The parts of a row with a layout, or null for a row a hidden card has not laid out. */
function partsOf(row: HTMLElement): Parts | null {
  const summary = row.querySelector<HTMLElement>(':scope > .summary');
  const aside = row.querySelector<HTMLElement>(':scope > .title-aside');
  if (!summary || !aside || !summary.offsetWidth) return null;
  const width = summary.getBoundingClientRect().width;
  return {
    row,
    summary,
    aside,
    direction: getComputedStyle(row).direction === 'rtl' ? 'rtl' : 'ltr',
    // offsetWidth is a whole number of pixels, so a box within a pixel of it is not transformed:
    // its own fraction would shrink every measure here by as much, and put the cut's room a
    // hair into the line above the one it shortens.
    scale: Math.abs(width - summary.offsetWidth) < 1 ? 1 : width / summary.offsetWidth || 1,
  };
}

/** A px value of a computed style, or 0. */
function px(value: string): number {
  return parseFloat(value) || 0;
}

/** A capped row, with its room in place and no cut. */
interface Capped extends Parts {
  lineHeight: number;
  pad: number;
  /** The room's width: the time's, or the whole line where the time cannot share the title's. */
  width: number;
  height: number;
  /** The width of the title's lines, and the gap the room keeps before the time. */
  avail: number;
  gap: number;
}

/**
 * Whether a capped row needs cutting, and which way, read with its room in place.
 *
 * Beside the time, the row keeps to the limit, as a single line does with a limit of one. Below
 * it, only the title does, so a title within the limit is left with the time under it.
 *
 * @returns `''` to cut beside the time, `'below'`, or null to leave the row as it is
 */
function cutOf(capped: Capped, maxLines: number): '' | 'below' | null {
  const { summary, scale, lineHeight, pad, width, height, avail, gap } = capped;
  const style = getComputedStyle(summary);
  const box = summary.getBoundingClientRect();
  const top = box.top / scale + px(style.paddingTop);
  // The room is a float inside .summary's formatting context, so its line counts in this height.
  // Half a line of slack: a line holding a label or the time can be a fraction taller.
  const lines = box.bottom / scale - pad - top;
  const limit = (maxLines + 0.5) * lineHeight;
  if (lines <= limit) return null;
  // The room is on a line of its own where it starts below the middle of the title's last line.
  // Not below its letters' box: a font taller than the line reaches into the next one. An empty
  // box is the space a line ends in, which the browser can place on the room's line.
  const room = summary.querySelector(':scope > .title-room')?.getBoundingClientRect();
  if (!room) return null;
  const title = Array.from(summary.querySelector('.event-title')?.getClientRects() ?? []).filter(
    (rect) => rect.width > 0,
  );
  const last = title[title.length - 1];
  const alone = !!last && room.top >= (last.top + last.bottom) / 2;
  const titleLines = alone ? room.top / scale - top : lines;
  // Decided on whole lines, before the clamp is in place to measure: a time a line or more tall
  // for each line the limit allows leaves the title none beside it.
  const below =
    height > (maxLines - 0.5) * lineHeight ||
    avail - width - gap < MIN_TITLE_ROOM_LINES * lineHeight;
  if (below) return titleLines > limit ? 'below' : null;
  return '';
}

/**
 * Size each wrapping title's room to its time, and with `title_max_lines` of two or more cut each
 * row whose title and time need more lines than that.
 *
 * Beside the time where the time leaves the title a line and room on it for a letter or two and
 * its "…", so the row keeps to the limit, as one line does with a limit of one. Below the title
 * otherwise, which is where a time wider than the row, or taller than the limit, goes: the row
 * cannot keep to the limit then, and the title is cut only where it alone needs more.
 *
 * A row a hidden card has not laid out loses what it was measured at, so it shows the time below
 * the title rather than over a room sized to a time that may have changed since; the card
 * measures it again once it is shown, when its size changes.
 *
 * @param rows - Every `.summary-row.title-wrap` on the card
 * @param maxLines - `title_max_lines`: 0 for no limit, otherwise two or more
 */
export function fitTitlesBesideTime(rows: Iterable<HTMLElement>, maxLines: number): void {
  const all = Array.from(rows);
  all.forEach(clearTitleCut);
  const capped = maxLines >= 2;

  // The time, as it is drawn: its size does not depend on the room or a cut.
  const unmeasured: HTMLElement[] = [];
  const measured = all.flatMap((row) => {
    const parts = partsOf(row);
    if (!parts) {
      unmeasured.push(row);
      return [];
    }
    const { summary, aside, scale } = parts;
    const style = getComputedStyle(summary);
    const time = aside.getBoundingClientRect();
    // On the row, so it is there to read before the room is first drawn.
    const gap = parseFloat(getComputedStyle(row).getPropertyValue(TITLE_ROOM_GAP));
    const avail =
      summary.clientWidth -
      px(style.getPropertyValue('padding-inline-start')) -
      px(style.getPropertyValue('padding-inline-end'));
    // The strut opens the time's box at the title's size, so its top is the box's top unless the
    // time or its badge reaches higher above the baseline, as a larger font does. Then the box's
    // baseline sits below the title's, and the time cannot share the title's line: a room as
    // wide as the line gives it one of its own.
    const strut = aside.querySelector(':scope > .title-strut')?.getBoundingClientRect();
    const sunk = !!strut && (strut.top - time.top) / scale > 0.5;
    return [
      {
        ...parts,
        lineHeight: px(style.lineHeight),
        pad: px(style.paddingBottom),
        width: sunk ? avail : time.width / scale,
        height: time.height / scale,
        avail,
        gap: Number.isFinite(gap) ? gap : DEFAULT_GAP,
      },
    ];
  });

  unmeasured.forEach(clearTitleFit);
  for (const { row, direction, width, height, pad } of measured) {
    row.setAttribute(TITLE_FIT, direction);
    row.style.setProperty(TITLE_FIT_PROPERTIES.width, `${width}px`);
    row.style.setProperty(TITLE_FIT_PROPERTIES.height, `${height}px`);
    row.style.setProperty(TITLE_FIT_PROPERTIES.pad, `${pad}px`);
  }
  if (!capped) return;

  const cuts = measured.flatMap((row) => {
    if (!(row.lineHeight > 0)) return [];
    const cut = cutOf(row, maxLines);
    return cut === null ? [] : [{ ...row, cut }];
  });

  for (const { row, cut, height, pad } of cuts) {
    row.setAttribute(TITLE_CUT, cut);
    if (cut === 'below') row.style.setProperty(TITLE_FIT_PROPERTIES.below, `${height + pad}px`);
  }

  // Cut beside the time, the row ends at the bottom of the last line the clamp keeps. The room
  // starts halfway down that line: a line the room's shape reaches into at all is shortened, so
  // starting at the line's own top, which layout rounds, can shorten the line above as well.
  const beside = cuts
    .filter(({ cut }) => cut === '')
    .map(({ row, summary, scale, lineHeight }) => {
      const top =
        summary.getBoundingClientRect().top / scale + px(getComputedStyle(summary).paddingTop);
      const end = row.getBoundingClientRect().bottom / scale - top;
      return { row, start: end - lineHeight / 2, end };
    });

  for (const { row, start, end } of beside) {
    row.style.setProperty(TITLE_FIT_PROPERTIES.start, `${start}px`);
    row.style.setProperty(TITLE_FIT_PROPERTIES.end, `${end}px`);
  }
}

/**
 * The attribute that marks a capped title whose last shown line was broken inside a word. The
 * stylesheet lays such a title out without automatic hyphens, so its cut ends at a word or inside
 * one with no hyphen: "Kindergarten registration…" or "appoint…", never "appoint-…".
 */
export const TITLE_UNHYPHENATED = 'data-title-unhyphenated';

/** How much wider than its line, in CSS pixels, a measured "-…" may come out and still fit. */
const HYPHEN_SLACK = 0.2;

/** A letter or a mark on one, or a soft hyphen: what a word breaks between. */
const WORD_CHARACTER = /[\p{L}\p{M}\u00AD]/u;

/**
 * The first of a title, its summary and its row that clamps its lines and hides some, if any.
 * Asked of what the box does rather than of its display: Chromium reports a clamping
 * `-webkit-box` as `flow-root`, which a summary beside the time is as well without clamping.
 */
function clampOf(summary: HTMLElement, title: HTMLElement): HTMLElement | null {
  for (const box of [title, summary, summary.parentElement]) {
    if (!(box instanceof HTMLElement)) continue;
    const style = getComputedStyle(box);
    if (
      /^\d+$/.test(style.webkitLineClamp) &&
      style.overflowY !== 'visible' &&
      box.scrollHeight > box.clientHeight + 1
    ) {
      return box;
    }
  }
  return null;
}

/**
 * Whether a capped title's last shown line ends in a hyphen and then the clamp's "…".
 *
 * The first character laid out below the clamp's last line begins the lines it hides; with the
 * one before it a letter, the cut fell inside a word. The hyphen stays only where the "…" fits
 * after it, which a word too wide for any line never leaves room for: it breaks only where its
 * line is full, and without a hyphen.
 */
function cutInsideWord(summary: HTMLElement, canvas: CanvasRenderingContext2D | null): boolean {
  const title = summary.querySelector<HTMLElement>('.event-title');
  if (!title) return false;
  const box = clampOf(summary, title);
  if (!box) return false;
  const style = getComputedStyle(box);
  const rect = box.getBoundingClientRect();
  // Boxes and characters come in the page's pixels, lengths and the canvas in the card's own: a
  // card an ancestor scales draws one at the other's scale. offsetWidth is whole pixels, so a box
  // within a pixel of it is not scaled, as partsOf above reads a row.
  const scale =
    box.offsetWidth > 0 && Math.abs(rect.width - box.offsetWidth) >= 1
      ? rect.width / box.offsetWidth
      : 1;
  const bottom = rect.bottom - px(style.paddingBottom) * scale;

  const characters: { text: string; rect: DOMRect }[] = [];
  const document = title.ownerDocument;
  const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    for (let index = 0; index < node.length; index += 1) {
      range.setStart(node, index);
      range.setEnd(node, index + 1);
      characters.push({ text: node.data[index], rect: range.getBoundingClientRect() });
    }
  }
  // Parked outside the card, so it holds on to nothing in it.
  range.setStart(document, 0);
  range.collapse(true);
  // A character reaching a quarter line below the cut is on a line it hides. Not its middle:
  // Chromium gives the first character after a hyphen a box across both lines.
  const lines = box === summary.parentElement ? summary : box;
  const flow = getComputedStyle(lines);
  const lineHeight = (px(flow.lineHeight) || px(style.lineHeight)) * scale;
  const hidden = characters.findIndex(
    ({ rect: glyph }) => glyph.height > 0 && glyph.bottom > bottom + lineHeight / 4,
  );
  if (hidden <= 0) return false;
  const before = characters[hidden - 1].text;
  const after = characters[hidden].text;
  if (!WORD_CHARACTER.test(before) || !WORD_CHARACTER.test(after)) return false;

  // The hyphen stays only where the clamp's "…" fits after it. Where it does not, the browser
  // shortens the line and takes the hyphen with it ("association me…"), and the title is left
  // as it is. The line is measured from its first character, in the title's font: WebKit gives
  // the characters the "…" replaced no place of their own. It ends at the box's end, less the
  // room a cut beside the time keeps there.
  const line = characters.slice(0, hidden).filter(({ rect: glyph }) => {
    const middle = (glyph.top + glyph.bottom) / 2;
    return glyph.height > 0 && middle > bottom - lineHeight && middle <= bottom;
  });
  if (!line.length || !canvas) return true;
  const titleStyle = getComputedStyle(title);
  canvas.font =
    titleStyle.font || `${titleStyle.fontWeight} ${titleStyle.fontSize} ${titleStyle.fontFamily}`;
  const length =
    canvas.measureText(`${line.map(({ text }) => text).join('')}\u2010\u2026`).width * scale;
  const edges = lines.getBoundingClientRect();
  const room =
    box === summary.parentElement
      ? (px(box.style.getPropertyValue(TITLE_FIT_PROPERTIES.width)) +
          (px(getComputedStyle(box).getPropertyValue(TITLE_ROOM_GAP)) || 0)) *
        scale
      : 0;
  // A fifth of a pixel to spare: the canvas sets the line a little wider than layout does. Over
  // capped English and German titles at nine widths, in Chromium and WebKit, every line the
  // browser ended in "-…" came out no more than 0.16px too long by this measure, and every one it
  // shortened 0.24px or more.
  const slack = HYPHEN_SLACK * scale;
  return flow.direction === 'rtl'
    ? line[0].rect.right - length >= edges.left + px(flow.paddingLeft) * scale + room - slack
    : line[0].rect.left + length <= edges.right - px(flow.paddingRight) * scale - room + slack;
}

/**
 * Lay out without automatic hyphens each capped title whose cut falls inside a word, so the "…"
 * never follows a hyphen. Read on the titles as the browser hyphenates them, every mark taken off
 * first, then written: one layout to read, however many titles.
 *
 * Only the titles cut that way change. A title with no limit, one that fits, and one cut between
 * words keep their hyphens. Without them a cut title needs as many lines as before or more, so a
 * title cut beside the time stays cut where it was measured.
 *
 * @param summaries - The `.summary` of every title the card caps at `title_max_lines`
 */
export function unhyphenateTitleCuts(summaries: Iterable<HTMLElement>): void {
  const all = Array.from(summaries);
  all.forEach((summary) => summary.removeAttribute(TITLE_UNHYPHENATED));
  if (!all.length) return;
  const canvas = document.createElement('canvas').getContext('2d');
  const cut = all.filter((summary) => cutInsideWord(summary, canvas));
  cut.forEach((summary) => summary.setAttribute(TITLE_UNHYPHENATED, ''));
}
