/**
 * Layout-boundary measurements for scrolling labels and Grid's timed title disclosure.
 *
 * Only compact titles use zoom: scaling the existing group preserves authored CSS units,
 * independently sized labels, fixed leading, and image proportions without compounding em.
 * All preparation and candidate writes are batched; no font-step loop forces layout.
 */

const PRECISION = 1 / 64;
const FLOOR = 10;
/**
 * Runtime state the normal title passes below write over the rendered title. Each is read
 * only by stylesheet rules gated off in the measuring, compact and blank modes, and
 * resetGridTitle removes all of it at the start of every pass, so none outlives the layout
 * it was measured against.
 */
const LABEL_RUN = '--calendar-card-grid-title-label-run';
const CUT_ROOM = '--calendar-card-grid-title-cut-room';
const FIT_LINES = '--calendar-card-grid-title-fit-lines';
const CUT = 'data-grid-title-cut';
const LINES = 'data-grid-title-lines';
const Segmenter = (
  Intl as typeof Intl & {
    Segmenter?: new (
      locale?: string,
      options?: { granularity: 'grapheme' },
    ) => { segment(value: string): Iterable<{ segment: string; index: number }> };
  }
).Segmenter;
const GRAPHEMES = Segmenter ? new Segmenter(undefined, { granularity: 'grapheme' }) : null;
const MEASUREMENT_RANGES = new WeakMap<Document, Range>();

interface Bounds {
  top: number;
  bottom: number;
}

interface TextRun {
  node: Node;
  start: number;
  text: string;
  rects: DOMRect[];
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

/**
 * Where the useful prefix ends in a title laid out across several text nodes.
 *
 * Grid draws each word of a static title as its own element, so a title arrives as one run
 * per word and the first run alone is not the title: a lone dash in front of the first word
 * (`– Team sync`) has no useful grapheme, and reading only that run would call the whole
 * title unreadable and blank it. The prefix runs from the first run's start to the first
 * useful grapheme in any run. Engines without segmentation keep their rule of fitting the
 * entire title, which is now every run.
 *
 * @param texts - Each run's trimmed text, in order
 * @returns The run the prefix ends in and its length within that run, or `null` when no run
 *   holds a useful grapheme
 */
export function gridTitleUsefulPrefix(
  texts: readonly string[],
): { run: number; length: number } | null {
  if (!GRAPHEMES) {
    const last = texts.length - 1;
    return texts.some((text) => gridTitlePrefix(text) !== '')
      ? { run: last, length: texts[last].length }
      : null;
  }
  for (const [run, text] of texts.entries()) {
    const prefix = gridTitlePrefix(text);
    if (prefix) return { run, length: prefix.length };
  }
  return null;
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
  target.summary.style.removeProperty(LABEL_RUN);
  target.summary.style.removeProperty(FIT_LINES);
  target.summary.removeAttribute(LINES);
  target.row.style.removeProperty('--calendar-card-grid-title-shift');
  for (const word of Array.from(target.summary.querySelectorAll<HTMLElement>(`[${CUT}]`))) {
    word.removeAttribute(CUT);
    word.style.removeProperty(CUT_ROOM);
  }
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

function measurementRange(document: Document): Range {
  let range = MEASUREMENT_RANGES.get(document);
  if (!range) {
    range = document.createRange();
    MEASUREMENT_RANGES.set(document, range);
  }
  return range;
}

function parkRange(range: Range, document: Document): void {
  range.setStart(document, 0);
  range.collapse(true);
}

/** The nearest ancestor that lays the text out in line boxes, rather than an inline box. */
function lineContainer(node: Node): Element | null {
  for (let element = node.parentElement; element; element = element.parentElement) {
    const display = getComputedStyle(element).display;
    if (display !== 'inline' && display !== 'contents') return element;
  }
  return null;
}

/**
 * A text rectangle is the font's content area, not its line box. Where line-height is below
 * ascent plus descent, the content area pokes out above and below its line: 12px Roboto
 * measures 15px in a 14.4px line in Firefox, so every first line starts 0.3px above its own
 * box, and an emoji's fallback font adds a pixel below. Fonts with taller metrics, such as
 * Noto Sans, do the same in every engine. That band belongs to no line box, the title's own
 * overflow clip already cuts it, and it scales with the font, so it is not a clipped title.
 * Trim a rectangle to its line container, but only one whose center lies inside it: a line
 * clamped away or pushed out of its container keeps its full rectangle and still fails.
 */
function lineBox(rect: DOMRect, container: DOMRect | undefined): DOMRect {
  if (!container) return rect;
  const center = (rect.top + rect.bottom) / 2;
  if (center < container.top || center > container.bottom) return rect;
  const top = Math.max(rect.top, container.top);
  const bottom = Math.min(rect.bottom, container.bottom);
  return top === rect.top && bottom === rect.bottom
    ? rect
    : new DOMRect(rect.left, top, rect.width, bottom - top);
}

// A live Range participates in later DOM mutations until collected. Reuse one cursor and
// return rectangle snapshots, then park it outside the card so it cannot retain a removed card.
function textRuns(element: Element): TextRun[] {
  const document = element.ownerDocument;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const runs: TextRun[] = [];
  const range = measurementRange(document);
  try {
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? '';
      const start = text.search(/\S/u);
      if (start < 0) continue;
      range.setStart(node, start);
      range.setEnd(node, text.trimEnd().length);
      const container = lineContainer(node)?.getBoundingClientRect();
      runs.push({
        node,
        start,
        text: text.slice(start).trimEnd(),
        rects: Array.from(range.getClientRects(), (rect) => lineBox(rect, container)),
      });
    }
    return runs;
  } finally {
    parkRange(range, document);
  }
}

/** Width from the first run's start through the useful prefix; see gridTitleUsefulPrefix. */
function prefixWidth(runs: TextRun[]): number {
  const first = runs[0];
  const end = gridTitleUsefulPrefix(runs.map((run) => run.text));
  const document = first?.node.ownerDocument;
  if (!first || !end || !document) return 0;
  const last = runs[end.run];
  const range = measurementRange(document);
  try {
    range.setStart(first.node, first.start);
    range.setEnd(last.node, last.start + end.length);
    return range.getBoundingClientRect().width;
  } finally {
    parkRange(range, document);
  }
}

/**
 * Width of a single-line title, spaces between its words included.
 *
 * One run is summed by its rectangles, as it always was. Several runs are measured as one
 * range from the first to the last, because the spaces between words are text nodes of
 * their own that textRuns skips, and summing the words alone would call a title that
 * overflows by its spaces a fit. Only ever asked of a title laid out on one line.
 */
function runsWidth(runs: TextRun[]): number {
  const first = runs[0];
  const last = runs[runs.length - 1];
  const document = first?.node.ownerDocument;
  if (runs.length <= 1 || !document) {
    return runs.flatMap((run) => run.rects).reduce((width, rect) => width + rect.width, 0);
  }
  const range = measurementRange(document);
  try {
    range.setStart(first.node, first.start);
    range.setEnd(last.node, last.start + last.text.length);
    return range.getBoundingClientRect().width;
  } finally {
    parkRange(range, document);
  }
}

function labelRects(target: GridTitleTarget): DOMRect[] {
  return Array.from(target.summary.children).flatMap((label) => {
    if (label === target.title) return [];
    return label.matches('.calendar-label')
      ? textRuns(label).flatMap((run) => run.rects)
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

/** Whether the title row is shown at all; below the first rung it is display: none. */
function titleRowEligible(target: GridTitleTarget): boolean {
  return (
    getComputedStyle(target.row).getPropertyValue('--calendar-card-grid-title-eligible').trim() ===
    '1'
  );
}

/** Whether every picture in the group has the natural size the layout was computed with. */
function imagesReady(summary: HTMLElement): boolean {
  return Array.from(summary.querySelectorAll('img')).every(
    (image) => image.complete && image.naturalWidth > 0,
  );
}

/**
 * Keeps a complete scrolling label run at natural width only when useful title text fits.
 *
 * WebKit may shrink even a short label to its automatically hyphenated min-content
 * width. Test the natural run as one batch, then leave longer runs on their existing
 * wrapping path. Native flex layout accounts for every label, gap, and authored unit.
 */
export function reserveScrollingLabelWidths(titles: Iterable<HTMLElement>): void {
  const targets = Array.from(titles).flatMap((title) => {
    const summary = title.parentElement;
    const fit = title.closest<HTMLElement>('.grid-event')?.dataset.gridTitleFit;
    if (
      !summary?.matches('.summary-scroll') ||
      fit === 'compact' ||
      fit === 'blank' ||
      fit === 'measuring'
    ) {
      return [];
    }
    const labels = Array.from(summary.children).filter((label) => label !== title);
    if (!labels.some((label) => label.matches('.calendar-label:not(.label-emoji)'))) {
      summary.removeAttribute('data-scroll-labels');
      return [];
    }
    return [{ title, summary, labels, reserved: summary.hasAttribute('data-scroll-labels') }];
  });
  if (!targets.length) return;

  const canvas = targets[0].title.ownerDocument.createElement('canvas').getContext('2d');
  const reserved = new Set<HTMLElement>();
  let measured = false;
  for (const { summary } of targets) summary.setAttribute('data-scroll-labels', '');
  try {
    for (const { title, summary, labels } of targets) {
      const style = getComputedStyle(summary);
      const borderBox =
        px(style.width) +
        (style.boxSizing === 'border-box'
          ? 0
          : px(style.paddingLeft) +
            px(style.paddingRight) +
            px(style.borderLeftWidth) +
            px(style.borderRightWidth));
      const bounds = summary.getBoundingClientRect();
      const scale = borderBox > 0 ? bounds.width / borderBox : 0;
      const left = bounds.left + (px(style.borderLeftWidth) + px(style.paddingLeft)) * scale;
      const right = bounds.right - (px(style.borderRightWidth) + px(style.paddingRight)) * scale;
      const titleBox = title.getBoundingClientRect();
      const viewportStyle = getComputedStyle(title);
      const runs = textRuns(title);
      const first = runs[0];
      const titleStyle = getComputedStyle(first?.node.parentElement ?? title);
      if (canvas)
        canvas.font = titleStyle.font || `${titleStyle.fontSize} ${titleStyle.fontFamily}`;
      const ellipsis = canvas
        ? (canvas.measureText('\u2026').width + px(titleStyle.letterSpacing)) * scale
        : Infinity;
      const titleInsets =
        (px(viewportStyle.paddingLeft) +
          px(viewportStyle.paddingRight) +
          px(viewportStyle.borderLeftWidth) +
          px(viewportStyle.borderRightWidth)) *
        scale;
      const labelsFit = labels.every((label) => {
        const rect = label.getBoundingClientRect();
        return rect.width > 0 && rect.left >= left - PRECISION && rect.right <= right + PRECISION;
      });
      if (
        scale > 0 &&
        labelsFit &&
        imagesReady(summary) &&
        gridTitleHasUsefulWidth(
          titleBox.width - titleInsets,
          runsWidth(runs),
          prefixWidth(runs),
          ellipsis,
        )
      ) {
        reserved.add(summary);
      }
    }
    measured = true;
  } finally {
    for (const target of targets) {
      target.summary.toggleAttribute(
        'data-scroll-labels',
        measured ? reserved.has(target.summary) : target.reserved,
      );
    }
  }
}

function blockScale(block: HTMLElement): number {
  const height = px(getComputedStyle(block).height);
  return height > 0 ? block.getBoundingClientRect().height / height : 1;
}

function normalClip(target: GridTitleTarget): Bounds {
  const style = getComputedStyle(target.block);
  const rect = target.block.getBoundingClientRect();
  const scale = blockScale(target.block);
  const clip = {
    top: rect.top + (px(style.borderTopWidth) + px(style.paddingTop)) * scale,
    bottom: rect.bottom - (px(style.borderBottomWidth) + px(style.paddingBottom)) * scale,
  };

  // A cascaded block whose lower or trailing part another block covers keeps its text in
  // the rest, and a title is only "normal" if it fits there. See .grid-event-content-limited.
  if (target.block.classList.contains('grid-event-content-limited')) {
    const region = target.disclosure.getBoundingClientRect();
    return { top: Math.max(clip.top, region.top), bottom: Math.min(clip.bottom, region.bottom) };
  }

  return clip;
}

/**
 * Where a normal title can be seen: the block's text area, narrowed to the title row and to
 * the summary, whose box an authored clamp shortens.
 */
function titleWindow(target: GridTitleTarget): { visible: Bounds; summary: DOMRect } {
  const clip = normalClip(target);
  const row = target.row.getBoundingClientRect();
  const summary = target.summary.getBoundingClientRect();
  return {
    summary,
    visible: {
      top: Math.max(clip.top, row.top, summary.top),
      bottom: Math.min(clip.bottom, row.bottom, summary.bottom),
    },
  };
}

/**
 * Test the actual first title glyph row and all label fragments, not whole-event overflow.
 * Later wrapped lines are cutGridTitleLines's concern: by the time this runs, a title that
 * ran past its block has been cut back to the whole lines that fit.
 */
export function normalGridTitleFits(target: GridTitleTarget): boolean {
  if (!titleRowEligible(target) || !imagesReady(target.summary)) return false;
  const runs = textRuns(target.title);
  const first = runs[0]?.rects[0];
  if (!first || first.height <= 0) return false;
  const { visible, summary } = titleWindow(target);
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

/** An element's content-box width in CSS pixels, unaffected by zoom or transforms above it. */
function contentWidth(element: HTMLElement): number {
  const style = getComputedStyle(element);
  return style.boxSizing === 'border-box'
    ? px(style.width) -
        px(style.paddingLeft) -
        px(style.paddingRight) -
        px(style.borderLeftWidth) -
        px(style.borderRightWidth)
    : px(style.width);
}

/** The width of "…" in an element's own font, in CSS pixels; infinite with no 2D context. */
function ellipsisWidth(canvas: CanvasRenderingContext2D | null, element: Element): number {
  if (!canvas) return Infinity;
  const style = getComputedStyle(element);
  canvas.font = style.font || `${style.fontSize} ${style.fontFamily}`;
  return canvas.measureText('\u2026').width + px(style.letterSpacing);
}

/**
 * The title's first word, when it is also the first thing the title draws. A title that
 * opens with a run of Han, kana or Thai has none: that run already breaks between its
 * characters beside a label, and the first word element further along is not where the
 * title starts.
 */
function leadingWord(title: HTMLElement): HTMLElement | null {
  const words = title.querySelector<HTMLElement>('.title-words');
  for (const node of Array.from(words?.childNodes ?? [])) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      return node === words?.firstElementChild && (node as Element).matches('.title-word')
        ? (node as HTMLElement)
        : null;
    }
    // Lit's comment markers sit among the words; only text can come before the first one.
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) return null;
  }
  return null;
}

/**
 * Lets the first word of a labeled title start on the label's line.
 *
 * A word is never broken, so one wider than what is left beside the labels used to wrap
 * below them and leave the label alone on the first line, its title starting a line down.
 * Publishing the width the labels take lets the stylesheet narrow that one word to the
 * rest of the line, where it is cut with its own ellipsis instead: "Birth… / lunch".
 *
 * Measured rather than computed in CSS because nothing there knows the run's width: a
 * picture is as wide as its proportions make it, an emoji or a prose label is as wide as
 * its glyphs, and a merged row draws several labels. A label that wraps, or a run leaving
 * no room for the word's first character and an ellipsis, is left as it was; the title
 * cannot usefully start beside it.
 *
 * Reads every block, then writes every block, so the pass costs one layout however many
 * titles it touches.
 *
 * @param targets - The timed titles being fitted, already reset
 */
export function leadGridTitles(targets: GridTitleTarget[]): void {
  const candidates = targets.flatMap((target) => {
    const labels = Array.from(target.summary.children).filter((child) => child !== target.title);
    const word = leadingWord(target.title);
    return labels.length && word && !target.summary.matches('.summary-scroll')
      ? [{ target, labels, word }]
      : [];
  });
  if (!candidates.length) return;
  const canvas = document.createElement('canvas').getContext('2d');
  const runs = candidates.flatMap(({ target, labels, word }) => {
    if (!titleRowEligible(target) || !imagesReady(target.summary)) return [];
    const scale = blockScale(target.block);
    let run = 0;
    for (const label of labels) {
      const rects = label.getClientRects();
      if (rects.length !== 1 || rects[0].width <= 0) return [];
      const style = getComputedStyle(label);
      run += rects[0].width / scale + px(style.marginLeft) + px(style.marginRight);
    }
    const prefix = prefixWidth(textRuns(word)) / scale;
    const room = contentWidth(target.summary) - run;
    return prefix > 0 && prefix + ellipsisWidth(canvas, word) <= room + PRECISION
      ? [{ target, run }]
      : [];
  });
  for (const { target, run } of runs) target.summary.style.setProperty(LABEL_RUN, `${run}px`);
}

/** One thing the title line lays out: a label, a word element, or text the browser breaks. */
interface FlowItem {
  kind: 'label' | 'word' | 'text';
  node: Node;
  rects: DOMRect[];
}

/** The group's labels and title pieces in reading order, each with its line rectangles. */
function flowItems(target: GridTitleTarget): FlowItem[] {
  const items: FlowItem[] = Array.from(target.summary.children).flatMap((label) =>
    label === target.title
      ? []
      : [
          {
            kind: 'label' as const,
            node: label,
            rects: label.matches('.calendar-label')
              ? textRuns(label).flatMap((run) => run.rects)
              : Array.from(label.getClientRects()),
          },
        ],
  );
  for (const run of textRuns(target.title)) {
    const word = run.node.parentElement?.closest<HTMLElement>('.title-word');
    if (!word || !target.title.contains(word)) {
      items.push({ kind: 'text', node: run.node, rects: run.rects });
    } else if (items[items.length - 1]?.node !== word) {
      items.push({ kind: 'word', node: word, rects: [word.getBoundingClientRect()] });
    }
  }
  return items;
}

function middle(box: Bounds): number {
  return (box.top + box.bottom) / 2;
}

/**
 * Group rectangles into the line boxes they sit in, top to bottom.
 *
 * Counted from rectangles rather than from words, because a title in a script written
 * without spaces is one text run however many lines it takes, and a label shares the first
 * line with whatever follows it. A rectangle joins the line its middle falls inside, so a
 * word aligned middle beside a picture and one aligned top in the same line stay one line,
 * and an emoji poking a pixel past its line box does not start another.
 */
function lineBands(rects: DOMRect[]): Bounds[] {
  const bands: Bounds[] = [];
  for (const rect of rects.filter((box) => box.height > 0).sort((a, b) => a.top - b.top)) {
    const band = bands[bands.length - 1];
    if (band && middle(rect) <= band.bottom + PRECISION) {
      band.top = Math.min(band.top, rect.top);
      band.bottom = Math.max(band.bottom, rect.bottom);
    } else {
      bands.push({ top: rect.top, bottom: rect.bottom });
    }
  }
  return bands;
}

/** Horizontal space between two neighbors on one line, in either reading direction. */
function gapBetween(before: DOMRect, after: DOMRect): number {
  return Math.max(0, after.left - before.right, before.left - after.right);
}

interface TitleCut {
  target: GridTitleTarget;
  lines: number;
  word: HTMLElement | null;
  room: number;
}

/**
 * Where a title running past its block has to stop, or null where every line fits.
 *
 * The visible lines are the whole line boxes inside both the block's text area and the
 * title's own box, which an authored title_max_lines has already shortened. Lines the clamp
 * hides still lay out below it, so a title the clamp cut is found here as well as one the
 * block cuts, and both end the same way.
 */
function measureTitleCut(
  target: GridTitleTarget,
  canvas: CanvasRenderingContext2D | null,
): TitleCut | null {
  if (
    target.summary.matches('.summary-scroll') ||
    !titleRowEligible(target) ||
    !imagesReady(target.summary)
  ) {
    return null;
  }
  const items = flowItems(target);
  const bands = lineBands(items.flatMap((item) => item.rects));
  const { visible } = titleWindow(target);
  let lines = 0;
  while (lines < bands.length && inside(bands[lines], visible)) lines += 1;
  // No line fits: that is the compact fallback's case, decided after the detail rows.
  if (lines === 0 || lines === bands.length) return null;

  const last = bands[lines - 1];
  const onLast = (rect: DOMRect): boolean =>
    middle(rect) >= last.top - PRECISION && middle(rect) <= last.bottom + PRECISION;
  const title = items.filter((item) => item.kind !== 'label');
  let end = title.length - 1;
  while (end >= 0 && !title[end].rects.some(onLast)) end -= 1;
  // Labels alone on the last whole line: the title itself never starts.
  if (end < 0) return null;

  // A clamp, at a count that can only match or undercut an authored clamp. Matching one is not
  // a no-op: the clamp rule also drops the title's bottom padding, through which an unlabeled
  // title showed the top of the next line.
  const clamp = { target, lines, word: null, room: 0 };
  const scale = blockScale(target.block);
  const lineRects = items.flatMap((item) => item.rects.filter(onLast));
  const free =
    contentWidth(target.summary) * scale -
    (Math.max(...lineRects.map((rect) => rect.right)) -
      Math.min(...lineRects.map((rect) => rect.left)));
  const widthOnLast = (item: FlowItem): number =>
    item.rects.filter(onLast).reduce((sum, rect) => sum + rect.width, 0);
  const gapOnLast = (before: FlowItem | undefined, after: FlowItem): number => {
    const left = before?.rects.filter(onLast) ?? [];
    const right = after.rects.filter(onLast);
    return left.length && right.length ? gapBetween(left[left.length - 1], right[0]) : 0;
  };

  // A line ending in text is the clamp's, which shortens text by the character, provided the
  // text there, with the space before it and what is free, is wide enough for its ellipsis.
  // Short of that the clamp hides the word box in front instead, and a picture was left
  // beside a bare "…", so the cut goes back to that word below. A pixel to spare, because the
  // ellipsis is measured on a canvas in the text's own font while the clamp lays its own out
  // in the font of the box it clamps: a labeled title clamps on the summary, which is not
  // its weight, and the two came out 8.03px and 8.50px at 12px.
  if (title[end].kind === 'text') {
    let tail = free;
    let index = end;
    for (; index >= 0 && title[index].kind === 'text' && title[index].rects.some(onLast); index--) {
      tail += widthOnLast(title[index]) + gapOnLast(title[index - 1], title[index]);
    }
    const ellipsis = ellipsisWidth(canvas, title[end].node.parentElement ?? target.title);
    if (index < 0 || !title[index].rects.some(onLast) || tail >= (ellipsis + 1) * scale) {
      return clamp;
    }
  }

  // Walking back along the last line, every piece hidden after a candidate word hands back
  // its width and the space before it: that is the candidate's room. The first word with
  // room for its first character and an ellipsis carries the cut, and the stylesheet hides
  // every word and run after it. A run that began on an earlier line is never hidden: all
  // that comes before it lies on earlier lines, so the walk leaves the line right after it.
  let room = free;
  for (let index = end; index >= 0 && title[index].rects.some(onLast); index -= 1) {
    const item = title[index];
    room += widthOnLast(item);
    if (item.kind === 'word' && title.slice(index + 1).every(hiddenByCut)) {
      const word = item.node as HTMLElement;
      const prefix = prefixWidth(textRuns(word));
      if (prefix > 0 && prefix + ellipsisWidth(canvas, word) * scale <= room + PRECISION) {
        // A hair under the measured room, so rounding can never make the word one fraction
        // too wide for its line and wrap it out of sight.
        return { target, lines, word, room: room / scale - PRECISION };
      }
    }
    room += gapOnLast(title[index - 1], item);
  }
  return clamp;
}

/** Whether the stylesheet hides a piece that follows a cut word: a word, or a wrapped run. */
function hiddenByCut(item: FlowItem): boolean {
  return item.kind === 'word'
    ? (item.node as Element).matches('.title-words > .title-word')
    : !!item.node.parentElement?.matches('.title-words > .title-run');
}

/**
 * Stops a title at the last whole line its block shows, ending that line in an ellipsis.
 *
 * A grid title wraps for as long as it has words, and the block's own overflow used to
 * stop it wherever the block happened to end: often through the middle of a line, with
 * nothing to say the title went on. Now the title shows only the line boxes that fit
 * whole, and the last of them ends in "…" when more title follows.
 *
 * A title split into words ends on a word: the words after it are hidden, and so are the
 * runs of Han, kana or Thai among them, and that word draws the ellipsis inside its own
 * clip, narrowed to the room left on its line, so it reads "Pediatrician…" and never wraps
 * out of sight. A line clamp cannot do this. Asked to end on a line of word boxes, it hides
 * the last one to make room for its ellipsis, which left a picture label beside a bare "…",
 * or draws the ellipsis past the edge and has it clipped. A line ending in text the browser
 * breaks itself, such a run or a right-to-left title, ends with a runtime line clamp
 * instead, which shortens text character by character as it should, but only where that
 * text is wide enough to give the clamp's ellipsis its room. Where it is not, as when
 * "Conference 会議室で…" leaves a sliver of the run beside the word, the cut goes back to
 * the word.
 *
 * This only ever shortens: the visible lines are measured inside any title_max_lines
 * clamp, so it never shows a line the configuration took away. It runs before the detail
 * rows are fitted, so they measure the title they will actually sit under, and a block in
 * which no line fits is left to the compact fallback. Scrolling titles are one line and
 * never reach it. Reads every block, then writes every block.
 *
 * @param targets - The timed titles being fitted, already reset and led
 */
export function cutGridTitleLines(targets: GridTitleTarget[]): void {
  if (!targets.length) return;
  const canvas = document.createElement('canvas').getContext('2d');
  const cuts = targets.flatMap((target) => {
    const cut = measureTitleCut(target, canvas);
    return cut ? [cut] : [];
  });
  for (const { target, lines, word, room } of cuts) {
    if (word) {
      word.setAttribute(CUT, '');
      word.style.setProperty(CUT_ROOM, `${room}px`);
    } else {
      target.summary.setAttribute(LINES, '');
      target.summary.style.setProperty(FIT_LINES, String(lines));
    }
  }
}

function centeredShift(target: GridTitleTarget): number | null {
  const clip = normalClip(target);
  const row = target.row.getBoundingClientRect();
  const glyphs = textRuns(target.summary).flatMap((run) => run.rects);
  const bounds = union([
    row,
    ...glyphs.filter((glyph) => inside(glyph, row)),
    ...labelRects(target),
  ]);
  if (!inside(bounds, clip)) return null;
  const shift = (clip.top + clip.bottom - bounds.top - bounds.bottom) / 2;
  // The caller offers a block whose detail rows are all invisible, which used to mean one
  // thing: the block was too short to reveal any. The time row now asks about width as well
  // as height, so a block can be tall and still disclose nothing — and centering one parks
  // its title in mid-air. The maintainer's capture was a two-hour block about 55px wide
  // whose two-line title sat with roughly 31px of clear space above and below it, which
  // reads as broken rather than as deliberate.
  //
  // So ask the block what the eye asks: is there conspicuous dead space? One line box of
  // the group's own text is the unit, because that is what the disclosure is denominated in
  // — every rung in the stylesheet is a count of rows — and because it is the only
  // scale-free answer. A pixel threshold would have to be recalibrated against
  // event_font_size, a theme's type scale and zoom, all three of which move a line box and
  // none of which move a constant. Shifting a group by less than one of its own lines is
  // the nudge a small block wants; more than that is space something could have occupied.
  //
  // Deliberately not asked: how wide the block is. That would mean restating the width
  // rung's own threshold in script, a second copy to keep in step, and it would answer only
  // for the time row — location, description and weather are withheld on height alone. Dead
  // space is one question that covers every reason a row is missing, including later ones.
  //
  // Refusing costs nothing worse than the top alignment a block with a visible time row
  // already gets: no shift is written, so no data-grid-title-fit is set, so the transform
  // keyed on that attribute never applies.
  const line = Math.max(0, ...glyphs.map((glyph) => glyph.height));
  if (Math.abs(shift) > line + PRECISION) return null;
  return shift / blockScale(target.block);
}

/**
 * Center complete title groups that nearly fill their block, without changing their
 * ordinary wrapping. A group with a line box or more of slack on each side is left where
 * it is; see centeredShift for why the block's height is not asked about directly.
 */
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
  const runs = textRuns(target.title);
  const titleStyle = getComputedStyle(runs[0]?.node.parentElement ?? target.title);
  const title = target.title.getBoundingClientRect();
  const row = target.row.getBoundingClientRect();
  const summary = target.summary.getBoundingClientRect();
  const disclosure = target.disclosure.getBoundingClientRect();
  const glyphs = runs.flatMap((run) => run.rects);
  const labels = labelRects(target);
  const bounds = union([row, ...glyphs, ...labels]);
  const zoom = px(getComputedStyle(target.summary).zoom) || 1;
  if (canvas) canvas.font = titleStyle.font || `${titleStyle.fontSize} ${titleStyle.fontFamily}`;
  const ellipsis = canvas
    ? (canvas.measureText('\u2026').width + px(titleStyle.letterSpacing)) * scale * zoom
    : Infinity;
  const fullWidth = runsWidth(runs);
  const usefulWidth = prefixWidth(runs);
  const labelsFit = labels.every(
    (label) =>
      label.left >= summary.left - PRECISION &&
      label.right <= summary.right + PRECISION &&
      label.width > 0,
  );
  return {
    target,
    font: px(titleStyle.fontSize),
    textFonts: [
      px(titleStyle.fontSize),
      ...Array.from(target.summary.querySelectorAll<HTMLElement>('.calendar-label')).flatMap(
        (label) =>
          textRuns(label).map((run) =>
            px(getComputedStyle(run.node.parentElement ?? label).fontSize),
          ),
      ),
    ],
    height: (bounds.bottom - bounds.top) / scale,
    available: disclosure.height / scale,
    shift: (disclosure.top + disclosure.bottom - bounds.top - bounds.bottom) / (2 * scale),
    textFits: glyphs.every((glyph) => inside(glyph, title)),
    readable:
      labelsFit &&
      imagesReady(target.summary) &&
      gridTitleHasUsefulWidth(title.width, fullWidth, usefulWidth, ellipsis),
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
