/**
 * A laid-out narrow month's day list, for tests that run where nothing lays out.
 *
 * happy-dom measures every box at 0, so a card under test never fits a narrow month's list to its
 * room (`MonthRender.measureMonthList`): it lists "+N more" alone, as a card does before it is on
 * screen. A test that reads the list's rows lays the list out with this first. It answers
 * `getBoundingClientRect` for the boxes the fit reads, the staged rows beside the list, their
 * table and "+N more", the rows' box and the list, and leaves every other box at happy-dom's 0.
 *
 * The staged rows stack from an arbitrary top, each `row` tall and `gap` apart, with the gap again
 * before "+N more", as the list draws them. With the defaults a room of 200px holds four rows, or
 * three and "+N more".
 */

/** The boxes a laid-out list measures, in pixels. */
export interface MonthListBoxes {
  /** The room the rows have: the rows' box's height. */
  readonly room: number;
  /** Each staged row's height, by its place in the day; the last repeats past the end. */
  readonly rows?: number | ReadonlyArray<number>;
  /** The gap between two rows, and before "+N more". */
  readonly gap?: number;
  /** "+N more"'s height. */
  readonly more?: number;
  /** "No events"'s height. */
  readonly empty?: number;
  /** What the list holds above its rows' box: its top padding and its header. */
  readonly chrome?: number;
  /** How wide the list and everything in it is. */
  readonly width?: number;
}

/** Where the staged table starts, anywhere: the fit reads every row from it. */
const TOP = 500;

const box = (top: number, height: number, width: number): DOMRect =>
  ({
    x: 0,
    y: top,
    top,
    left: 0,
    right: width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  }) as DOMRect;

/**
 * Lays out every narrow month's list drawn from now on, until the returned function is called.
 *
 * @param boxes - The room and the rows' heights
 * @returns Puts happy-dom's own measuring back
 */
export function layOutMonthList(boxes: MonthListBoxes): () => void {
  const { room, gap = 6, more = 28, empty = 26, chrome = 44, width = 343 } = boxes;
  const heights = boxes.rows ?? 40;
  const rowHeight = (index: number) =>
    typeof heights === 'number' ? heights : (heights[index] ?? heights[heights.length - 1]);
  // Where each staged row ends below the table's top, rows[k] for the first k rows.
  const ends = (count: number) => {
    const end = [0];
    for (let index = 0; index < count; index++) {
      end.push(end[index] + (index > 0 ? gap : 0) + rowHeight(index));
    }
    return end;
  };

  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
    const staged = this.closest('.month-day-list-probe');
    if (staged) {
      const table = staged.querySelector(':scope > .month-day-table');
      const cells = table ? [...table.querySelectorAll('td.event')] : [];
      const end = ends(cells.length);
      if (this === table) return box(TOP, end[cells.length], width);
      if (this.matches('td.event')) {
        const index = cells.indexOf(this);
        return box(TOP + end[index] + (index > 0 ? gap : 0), rowHeight(index), width);
      }
      if (this.matches('.month-day-list-more')) {
        return box(TOP + end[cells.length] + gap, more, width);
      }
      return original.call(this);
    }
    if (this.matches('.month-day-list > .month-day-list-rows')) return box(chrome, room, width);
    if (this.matches('.month-day-list')) return box(0, chrome + room, width);
    if (this.matches('.month-day-list-empty')) return box(0, empty, width);
    return original.call(this);
  };
  return () => {
    Element.prototype.getBoundingClientRect = original;
  };
}
