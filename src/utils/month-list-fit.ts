/**
 * How many of the selected day's events a narrow month lists under its weeks.
 *
 * The card stages the day's real rows out of sight beside the list, drawn as the list draws them,
 * and its "+N more" at the count it would show with no row listed (`renderListStaging` in
 * `rendering/month.ts`). It reads where each row ends, how tall the button is and the gap kept
 * before it, and the room the list's rows have (`measureMonthList`); the answer is decided from
 * those numbers alone (`fitMonthList`), which is pure, so it is tested without a layout engine.
 */

/**
 * The class of the hidden copy of the selected day's list the card fits the list from, drawn
 * beside the list and outside it, so nothing that reads the list's rows finds it.
 */
export const MONTH_LIST_STAGING_CLASS = 'month-day-list-probe';

/** A day's list as the card measures it, every length in the same pixels. */
export interface MonthListGeometry {
  /**
   * Where each row ends, from the top of the first: entry `k` is the height of the first `k` rows
   * with the gaps between them, entry 0 is 0, and the last entry is the whole day's.
   */
  readonly rows: ReadonlyArray<number>;
  /** How tall "+N more" is. */
  readonly more: number;
  /** The gap between the last row listed and "+N more". */
  readonly gap: number;
  /** The room the rows have: `Infinity` where nothing caps a list that grows. */
  readonly room: number;
}

/**
 * How far a height may run past the room and still count as inside it: fractional layout puts a
 * box that fits a hair over its room.
 */
export const MONTH_LIST_FIT_TOLERANCE = 0.01;

/**
 * The rows a day's list draws in its room: every one where all fit; else the most of its first
 * rows that fit with "+N more" after them; else none, and "+N more" alone, which is also the
 * answer where the first row is taller than the room, or the room is shorter than the button.
 *
 * The rows keep their order, so a later row that would fit never takes the place of an earlier
 * one that does not. Lengths keep their fractions, within {@link MONTH_LIST_FIT_TOLERANCE}.
 *
 * @param geometry - The day's rows, its "+N more" and the room, as measured
 * @returns How many rows to draw, from 0 to every one; "+N more" stands for the rest
 */
export function fitMonthList(geometry: MonthListGeometry): number {
  const { rows, more, gap, room } = geometry;
  const count = rows.length - 1;
  if (count <= 0) return 0;
  const limit = room + MONTH_LIST_FIT_TOLERANCE;
  if (rows[count] <= limit) return count;
  for (let shown = count - 1; shown > 0; shown -= 1) {
    if (rows[shown] + gap + more <= limit) return shown;
  }
  return 0;
}

//-----------------------------------------------------------------------------
// MEASURING
//-----------------------------------------------------------------------------

/**
 * A narrow month's list as the card fits it, read off the staged copy beside it
 * (`renderListStaging` in `rendering/month.ts`), or null where either is not drawn or not laid
 * out.
 *
 * Every length is a box in the page's pixels, read with `getBoundingClientRect`, so a scale an
 * ancestor draws the card at scales them all alike and the fit does not change; only the cap, read
 * from the card's computed style in its own pixels, is scaled to match, by the card's box against
 * its used height (`verticalScale`), since a transform may scale one way alone. The rows end where
 * each staged event's cell ends, below the table's top, with the gaps between them; a row is as
 * tall staged as listed, each part of it on one line in both. The gap before "+N more" runs from
 * the table's foot to the button's top, as the list draws it after its rows.
 *
 * The room is the rows' box, which the list's flexible height sets whatever is in it. A list that
 * grows under a cap (`monthNarrowGrows` in `rendering/month.ts`) has no such box: its room is the
 * cap less everything else the card holds, the card as drawn less the rows' box. Where the card is
 * drawn at its cap, whose content then runs past it, that content's overflow is added back, so a
 * list fitted to a room that has since shrunk is fitted again rather than kept. A cap the card's
 * computed style does not give as a length, `none` where a variable's fallback takes it off, caps
 * nothing: the room is unbounded and every row is listed.
 *
 * @param root - The card's render root
 * @param grows - Whether the list grows under a cap rather than taking a fixed room
 * @returns The rows, the button, the gap and the room, or null
 */
export function measureMonthList(root: ParentNode, grows: boolean): MonthListGeometry | null {
  const box = root.querySelector<HTMLElement>('.month-day-list > .month-day-list-rows');
  const staged = root.querySelector<HTMLElement>(`.${MONTH_LIST_STAGING_CLASS}`);
  const table = staged?.querySelector<HTMLElement>(':scope > .month-day-table');
  const button = staged?.querySelector<HTMLElement>(':scope > .month-day-list-more');
  if (!box || !table || !button) return null;

  const tableBox = table.getBoundingClientRect();
  const buttonBox = button.getBoundingClientRect();
  const roomBox = box.getBoundingClientRect();
  if (!(tableBox.height > 0) || !(buttonBox.height > 0) || !(roomBox.width > 0)) return null;
  const cells = [...table.querySelectorAll<HTMLElement>('td.event')];
  if (cells.length === 0) return null;
  // Below the last cell, the table's own foot: none at the stylesheet's border spacing, but a
  // listed table ends that far below its last row as well.
  const foot = Math.max(
    0,
    tableBox.bottom - cells[cells.length - 1].getBoundingClientRect().bottom,
  );
  const rows = [
    0,
    ...cells.map((cell) => cell.getBoundingClientRect().bottom - tableBox.top + foot),
  ];

  const measured = { rows, more: buttonBox.height, gap: buttonBox.top - tableBox.bottom };
  if (!grows) return { ...measured, room: roomBox.height };

  const card = root.querySelector<HTMLElement>('ha-card');
  if (!card) return null;
  const cap = Number.parseFloat(getComputedStyle(card).maxHeight);
  if (!Number.isFinite(cap)) return { ...measured, room: Infinity };
  const cardBox = card.getBoundingClientRect();
  const scale = verticalScale(card, cardBox);
  const content = root.querySelector<HTMLElement>('.content-container');
  const others = cardBox.height - roomBox.height + (content ? contentOverflow(content, scale) : 0);
  return { ...measured, room: cap * scale - others };
}

/**
 * The scale an ancestor draws an element at down the page: its box's height against its used
 * height, the border box its computed style gives to the fraction of a pixel. Read down rather
 * than across, so a transform that scales one way alone converts heights by the right one.
 *
 * Never against `offsetHeight`, which rounds the height to a whole pixel, so the quotient moved
 * with the height's fraction. The elements read here are as tall as what is written from the
 * reading lets them be, a month's floors or a list's least, so a floor written from one quotient
 * moved the height to where the next read another, and the two moved each other back and forth for
 * good. Against the used height the quotient is the scale itself, whatever the height. 1 where the
 * used height is not a length, as for a box not laid out.
 *
 * @param element - The element whose heights are converted
 * @param box - Its box, as `getBoundingClientRect` reads it
 * @returns The scale, 1 where there is none
 */
export function verticalScale(element: Element, box: DOMRect): number {
  const style = getComputedStyle(element);
  const px = (value: string) => Number.parseFloat(value) || 0;
  const height = Number.parseFloat(style.height);
  const used =
    style.boxSizing === 'border-box'
      ? height
      : height +
        px(style.paddingTop) +
        px(style.paddingBottom) +
        px(style.borderTopWidth) +
        px(style.borderBottomWidth);
  return Number.isFinite(used) && used > 0 && box.height > 0 ? box.height / used : 1;
}

/**
 * How far a card's content runs past its box, in the page's pixels: 0 unless the card is drawn at
 * its cap. Read from its children's boxes rather than `scrollHeight`, which rounds to whole pixels
 * and would move a list fitted to the hundredth of a pixel back and forth by one row.
 *
 * @param content - The card's content (`.content-container`)
 * @param scale - The scale an ancestor draws the card at
 * @returns The overflow, from 0
 */
function contentOverflow(content: HTMLElement, scale: number): number {
  const children = [...content.children];
  if (children.length === 0) return 0;
  const style = getComputedStyle(content);
  const padding =
    ((Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0)) *
    scale;
  const top = Math.min(...children.map((child) => child.getBoundingClientRect().top));
  const bottom = Math.max(...children.map((child) => child.getBoundingClientRect().bottom));
  return Math.max(0, bottom - top + padding - content.getBoundingClientRect().height);
}

/**
 * The least a narrow month's list may be, in the card's own pixels: its header and padding, and
 * the taller of its "+N more" and its "No events", or null where it is not laid out. Below it the
 * card's content scrolls the weeks and the list as one; nothing inside the list scrolls.
 *
 * The header and padding are what the list holds above and below its rows' box: the box's offset
 * from the list's top, and the list's bottom padding and border. Never the list's height less the
 * box's, which a list held at its least makes taller than what it holds, so each reading would add
 * to the next. "+N more" is read off the staged copy, drawn only on a day with events, and
 * "No events" off the list on a day without, so each is kept from the last day that drew it
 * (`known`) and the least is the taller of the two known. Rounded up to whole pixels, past the
 * hundredth a scale's division leaves, as the wide month's floors are (`measureMonthFloors` in
 * `rendering/month.ts`). Every length here is a height, so the scale is the list's box against its
 * used height (`verticalScale`).
 *
 * @param root - The card's render root
 * @param known - The heights of "+N more" and "No events" last read, which this updates
 * @returns The least height, or null
 */
export function measureMonthListMin(
  root: ParentNode,
  known: { more: number | null; empty: number | null },
): number | null {
  const list = root.querySelector<HTMLElement>('.month-day-list');
  const box = list?.querySelector<HTMLElement>(':scope > .month-day-list-rows');
  if (!list || !box) return null;
  const listBox = list.getBoundingClientRect();
  if (!(listBox.width > 0) || !(listBox.height > 0)) return null;
  const scale = verticalScale(list, listBox);
  const height = (element: Element | null | undefined) => {
    const pixels = element?.getBoundingClientRect().height ?? 0;
    return pixels > 0 ? pixels / scale : null;
  };
  known.more =
    height(root.querySelector(`.${MONTH_LIST_STAGING_CLASS} > .month-day-list-more`)) ?? known.more;
  known.empty = height(box.querySelector(':scope > .month-day-list-empty')) ?? known.empty;
  if (known.more === null && known.empty === null) return null;
  const style = getComputedStyle(list);
  const above = (box.getBoundingClientRect().top - listBox.top) / scale;
  const below =
    (Number.parseFloat(style.paddingBottom) || 0) +
    (Number.parseFloat(style.borderBottomWidth) || 0);
  return Math.ceil(above + below + Math.max(known.more ?? 0, known.empty ?? 0) - 0.01);
}
