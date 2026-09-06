import { afterEach, describe, expect, it, vi } from 'vitest';

import '../src/calendar-card-pro';
import {
  GRID_DETAIL_ROWS,
  fittedGridDetailLines,
  gridContentOverflows,
  resolveLineHeightPx,
} from '../src/calendar-card-pro';

describe('grid disclosure safety', () => {
  it('tolerates a one-pixel rounding difference but detects a clipped detail row', () => {
    expect(gridContentOverflows({ clientHeight: 60, scrollHeight: 61 })).toBe(false);
    expect(gridContentOverflows({ clientHeight: 60, scrollHeight: 62 })).toBe(true);
  });

  it('withdraws only the trailing detail rows needed to make the content fit', () => {
    const card = document.createElement('calendar-card-pro-dev') as unknown as HTMLElement & {
      _applyGridDisclosureSafety(): void;
    };
    const root = card.attachShadow({ mode: 'open' });
    Object.defineProperty(card, 'renderRoot', { value: root });
    root.innerHTML = `
      <div class="grid-event">
        <div class="grid-event-disclosure">
          <div class="event-content">
            <div class="time">10:00</div>
            <div class="location">Office</div>
            <div class="description">Notes</div>
          </div>
        </div>
      </div>
    `;
    const content = root.querySelector<HTMLElement>('.event-content')!;
    const rows = Array.from(content.children) as HTMLElement[];
    rows.forEach((row) => {
      row.getClientRects = () =>
        row.classList.contains('grid-event-detail-clipped')
          ? ({} as DOMRectList)
          : ({ 0: {} as DOMRect, length: 1, item: () => null } as unknown as DOMRectList);
    });
    Object.defineProperties(content, {
      clientHeight: { value: 60 },
      scrollHeight: {
        get: () =>
          90 -
          rows.filter((row) => row.classList.contains('grid-event-detail-clipped')).length * 20,
      },
    });

    card._applyGridDisclosureSafety();

    expect(rows.map((row) => row.classList.contains('grid-event-detail-clipped'))).toEqual([
      false,
      true,
      true,
    ]);
  });

  it('keeps every detail row when the title alone is what overflows', () => {
    // The maintainer's report: a 2.5-hour event whose title wrapped to three lines in a
    // narrow column rendered with neither its time nor its location, while a taller
    // neighbour with a two-line title showed both. No detail row was responsible for the
    // overflow, so withdrawing them could never resolve it — but the loop hid every one of
    // them on the way to discovering that, and left the block overflowing anyway.
    //
    // The fixture is the title-too-tall case in the abstract: scrollHeight stays above
    // clientHeight no matter how many rows are withdrawn.
    const card = document.createElement('calendar-card-pro-dev') as unknown as HTMLElement & {
      _applyGridDisclosureSafety(): void;
    };
    const root = card.attachShadow({ mode: 'open' });
    Object.defineProperty(card, 'renderRoot', { value: root });
    root.innerHTML = `
      <div class="grid-event">
        <div class="grid-event-disclosure">
          <div class="event-content">
            <div class="time">11:30 - 14:00</div>
            <div class="location">Corner Cafe</div>
          </div>
        </div>
      </div>
    `;
    const content = root.querySelector<HTMLElement>('.event-content')!;
    const rows = Array.from(content.children) as HTMLElement[];
    rows.forEach((row) => {
      row.getClientRects = () =>
        row.classList.contains('grid-event-detail-clipped')
          ? ({} as DOMRectList)
          : ({ 0: {} as DOMRect, length: 1, item: () => null } as unknown as DOMRectList);
    });
    Object.defineProperties(content, {
      clientHeight: { value: 50 },
      // A three-line title owns 100px of a 50px block on its own, so withdrawing both 20px
      // rows still leaves 60px in a 50px box — the overflow was never theirs to fix.
      scrollHeight: {
        get: () =>
          100 -
          rows.filter((row) => row.classList.contains('grid-event-detail-clipped')).length * 20,
      },
    });

    card._applyGridDisclosureSafety();

    expect(
      rows.map((row) => row.classList.contains('grid-event-detail-clipped')),
      'a row may only be withdrawn when withdrawing it resolves the overflow',
    ).toEqual([false, false]);
  });

  it('keeps time ahead of lower-priority detail rows', () => {
    const card = document.createElement('calendar-card-pro-dev') as unknown as HTMLElement & {
      _applyGridDisclosureSafety(): void;
    };
    const root = card.attachShadow({ mode: 'open' });
    Object.defineProperty(card, 'renderRoot', { value: root });
    root.innerHTML = `
      <div class="grid-event">
        <div class="grid-event-disclosure">
          <div class="event-content">
            <div class="progress-bar-row"></div>
            <div class="time">10:00</div>
            <div class="event-weather">Sunny</div>
            <div class="location">Office</div>
            <div class="description">Notes</div>
          </div>
        </div>
      </div>
    `;
    const content = root.querySelector<HTMLElement>('.event-content')!;
    const rows = Array.from(content.children) as HTMLElement[];
    rows.forEach((row) => {
      row.getClientRects = () =>
        row.classList.contains('grid-event-detail-clipped')
          ? ({} as DOMRectList)
          : ({ 0: {} as DOMRect, length: 1, item: () => null } as unknown as DOMRectList);
    });
    Object.defineProperties(content, {
      clientHeight: { value: 60 },
      scrollHeight: {
        get: () =>
          100 -
          rows.filter((row) => row.classList.contains('grid-event-detail-clipped')).length * 10,
      },
    });

    card._applyGridDisclosureSafety();

    expect(content.querySelector('.time')?.classList).not.toContain('grid-event-detail-clipped');
    expect(content.querySelector('.progress-bar-row')?.classList).toContain(
      'grid-event-detail-clipped',
    );
    expect(content.querySelector('.event-weather')?.classList).toContain(
      'grid-event-detail-clipped',
    );
    expect(content.querySelector('.location')?.classList).toContain('grid-event-detail-clipped');
    expect(content.querySelector('.description')?.classList).toContain('grid-event-detail-clipped');
  });

  it('restores a previously hidden detail row once it fits', () => {
    const card = document.createElement('calendar-card-pro-dev') as unknown as HTMLElement & {
      _applyGridDisclosureSafety(): void;
    };
    const root = card.attachShadow({ mode: 'open' });
    Object.defineProperty(card, 'renderRoot', { value: root });
    root.innerHTML = `
      <div class="grid-event">
        <div class="grid-event-disclosure">
          <div class="event-content">
            <div class="time">10:00</div>
            <div class="description">Notes</div>
          </div>
        </div>
      </div>
    `;
    const content = root.querySelector<HTMLElement>('.event-content')!;
    const rows = Array.from(content.children) as HTMLElement[];
    let expandedHeight = 80;
    rows.forEach((row) => {
      row.getClientRects = () =>
        row.classList.contains('grid-event-detail-clipped')
          ? ({} as DOMRectList)
          : ({ 0: {} as DOMRect, length: 1, item: () => null } as unknown as DOMRectList);
    });
    Object.defineProperties(content, {
      clientHeight: { value: 60 },
      scrollHeight: {
        get: () =>
          expandedHeight -
          rows.filter((row) => row.classList.contains('grid-event-detail-clipped')).length * 20,
      },
    });

    card._applyGridDisclosureSafety();
    expect(rows[1].classList).toContain('grid-event-detail-clipped');

    expandedHeight = 60;
    card._applyGridDisclosureSafety();
    expect(rows.every((row) => !row.classList.contains('grid-event-detail-clipped'))).toBe(true);
  });

  it('charges a row only for the overflow the fit test does not already forgive', () => {
    // `gridContentOverflows` calls a block fitting at one pixel over, so a row only ever has
    // to give back `overflow - 1`. Charging it the untolerated overflow costs a whole extra
    // line whenever the overflow lands just past a multiple of the line height, because
    // `Math.ceil` rounds that single pixel up to a line of its own.
    const lineHeight = 14.4;

    // 15px of overflow is one pixel past one line box. Only one line has to go.
    expect(fittedGridDetailLines(15, 2 * lineHeight, lineHeight)).toBe(1);
    expect(fittedGridDetailLines(15, 5 * lineHeight, lineHeight)).toBe(4);
    // 29px is one pixel past two line boxes.
    expect(fittedGridDetailLines(29, 3 * lineHeight, lineHeight)).toBe(1);

    // Away from that boundary the count is unchanged, so the correction is confined to it.
    expect(fittedGridDetailLines(16, 2 * lineHeight, lineHeight)).toBe(0);
    expect(fittedGridDetailLines(20, 5 * lineHeight, lineHeight)).toBe(3);
    expect(fittedGridDetailLines(2, 5 * lineHeight, lineHeight)).toBe(4);
  });

  it('agrees with the fit test about what fits, at every overflow it can be asked about', () => {
    // Reconciles the two functions against each other rather than restating either, so a
    // change to the tolerance in one of them fails here instead of silently costing a line.
    const lineHeight = 14.4;
    const clientHeight = 100;

    for (const currentLines of [2, 3, 5, 8]) {
      const renderedHeight = currentLines * lineHeight;
      for (let overflow = 2; overflow <= 40; overflow += 1) {
        const scrollHeight = clientHeight + overflow;

        // The largest clamp that genuinely makes the block fit, by measurement not algebra.
        let truth = 0;
        for (let lines = 1; lines <= currentLines; lines += 1) {
          const clamped = scrollHeight - (currentLines - lines) * lineHeight;
          if (!gridContentOverflows({ clientHeight, scrollHeight: clamped })) {
            truth = Math.max(truth, lines);
          }
        }

        const fitted = fittedGridDetailLines(overflow, renderedHeight, lineHeight);
        // Below one line both answers mean the same thing -- the row cannot be kept -- so
        // only the counts a caller acts on are compared.
        expect(
          Math.max(fitted, 0),
          `overflow ${overflow}px over ${currentLines} lines of ${lineHeight}px`,
        ).toBe(truth);
      }
    }
  });

  it('clamps a two-line row to one line rather than withdrawing it for a single pixel', () => {
    // The maintainer's report: a block showing its title and its time, then no location at
    // all, with a line of empty space below where the address should have been. Widening the
    // window brought the address back, correctly ellipsised.
    //
    // The block overflows by 15px with a two-line address of 14.4px lines. One line has to
    // go, and one line then fits -- but the old count charged the row `ceil(15 / 14.4)`, two
    // lines, for an overflow the fit test already forgives a pixel of. That came out at zero
    // lines, the clamp was refused as impossible, and the caller withdrew the whole row.
    // Withdrawing it did resolve the overflow, so nothing put it back: the address vanished
    // and its second line's worth of space stayed empty.
    const card = document.createElement('calendar-card-pro-dev') as unknown as HTMLElement & {
      _applyGridDisclosureSafety(): void;
    };
    const root = card.attachShadow({ mode: 'open' });
    Object.defineProperty(card, 'renderRoot', { value: root });
    root.innerHTML = `
      <div class="grid-event">
        <div class="grid-event-disclosure">
          <div class="event-content">
            <div class="time">11:30 - 14:00</div>
            <div class="location"><span>12 Rosemary Lane, Northbrook</span></div>
          </div>
        </div>
      </div>
    `;
    const content = root.querySelector<HTMLElement>('.event-content')!;
    const location = root.querySelector<HTMLElement>('.location')!;
    const span = location.querySelector<HTMLElement>('span')!;
    const lineHeight = 14.4;

    Array.from(content.children).forEach((row) => {
      (row as HTMLElement).getClientRects = () =>
        row.classList.contains('grid-event-detail-clipped')
          ? ({} as DOMRectList)
          : ({ 0: {} as DOMRect, length: 1, item: () => null } as unknown as DOMRectList);
    });

    // The address draws two lines unless clamped, and nothing at all once withdrawn.
    const locationLines = (): number => {
      if (location.classList.contains('grid-event-detail-clipped')) return 0;
      const clamp = location.style.getPropertyValue('--calendar-card-location-max-lines');
      return clamp ? Number(clamp) : 2;
    };
    span.getBoundingClientRect = () =>
      ({ height: locationLines() * lineHeight }) as unknown as DOMRect;
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      lineHeight: `${lineHeight}px`,
      fontSize: '12px',
    } as unknown as CSSStyleDeclaration);

    Object.defineProperties(content, {
      clientHeight: { value: 100 },
      // Title and time own 86.2px; two lines of address take it 15px past the box.
      scrollHeight: { get: () => 86.2 + locationLines() * lineHeight },
    });

    card._applyGridDisclosureSafety();

    expect(
      location.classList.contains('grid-event-detail-clipped'),
      'the address had room for one line and must not be withdrawn whole',
    ).toBe(false);
    expect(location.style.getPropertyValue('--calendar-card-location-max-lines')).toBe('1');
    expect(gridContentOverflows(content)).toBe(false);
    vi.restoreAllMocks();
  });

  it('does not apply the fallback to an overflow-count placeholder', () => {
    const card = document.createElement('calendar-card-pro-dev') as unknown as HTMLElement & {
      _applyGridDisclosureSafety(): void;
    };
    const root = card.attachShadow({ mode: 'open' });
    Object.defineProperty(card, 'renderRoot', { value: root });
    root.innerHTML = `
      <div class="grid-event grid-event-overflow">
        <div class="grid-event-disclosure">
          <div class="event-content"><div class="time">+2</div></div>
        </div>
      </div>
    `;

    card._applyGridDisclosureSafety();

    expect(root.querySelector('.grid-event-detail-clipped')).toBeNull();
  });
});

describe('grid disclosure line fitting', () => {
  const LINE_HEIGHT = 14.4;

  /**
   * How tall a text row's icon is by default here, which is the floor its text cannot shrink
   * below.
   *
   * Real rows are a flex line holding an `ha-icon` beside the text. `location_icon_size`
   * defaults to 14px — just under a default line box — but is configurable, so both sides of
   * the comparison are reachable and the fixtures pick one deliberately. A floor above one
   * line box is what makes the "shortening did not pay for the overflow" branch reachable at
   * all; a floor below one is what lets a row clamped to zero lines shrink, which is the case
   * the `fitted < 1` guard exists to refuse.
   */
  const ICON_HEIGHT = 24;

  interface RowSpec {
    className: 'time' | 'location' | 'description' | 'progress-bar-row';
    /** Lines the text takes when nothing clamps it. */
    naturalLines?: number;
    /** Lines the user's own `*_max_lines` option already allows. */
    configuredLines?: number;
    /** Height of a row that carries no text of its own. */
    fixedHeight?: number;
  }

  const LINE_PROPERTY: Partial<Record<RowSpec['className'], string>> = {
    location: '--calendar-card-location-max-lines',
    description: '--calendar-card-description-max-lines',
  };

  /**
   * Builds a grid block whose layout responds to clamping, because happy-dom's does not.
   *
   * The host is attached to the document so `getComputedStyle` resolves at all — detached, it
   * answers `''` for every property, which would make every row read as unclampable and let a
   * fixture pass against code that never clamps anything.
   */
  function buildBlock(options: {
    titleHeight: number;
    contentHeight: number;
    rows: RowSpec[];
    iconHeight?: number;
  }) {
    const card = document.createElement('calendar-card-pro-dev') as unknown as HTMLElement & {
      _applyGridDisclosureSafety(): void;
    };
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    document.body.appendChild(host);
    Object.defineProperty(card, 'renderRoot', { value: root });

    root.innerHTML = `
      <div class="grid-event">
        <div class="grid-event-disclosure">
          <div class="event-content">
            <div class="summary"><span class="event-title">Autumn programme workshop</span></div>
            ${options.rows
              .map(
                (row) =>
                  `<div class="${row.className}">${
                    row.naturalLines
                      ? `<ha-icon></ha-icon><span style="line-height: ${LINE_HEIGHT}px; font-size: 12px">${row.className}</span>`
                      : ''
                  }</div>`,
              )
              .join('')}
          </div>
        </div>
      </div>
    `;

    const content = root.querySelector<HTMLElement>('.event-content')!;
    const elementFor = (spec: RowSpec) => root.querySelector<HTMLElement>(`.${spec.className}`)!;

    /** Lines the row draws now: the inline clamp when one is set, else the configured cap. */
    const renderedLines = (spec: RowSpec): number => {
      const property = LINE_PROPERTY[spec.className];
      const inline = property ? elementFor(spec).style.getPropertyValue(property) : '';
      const limit = inline ? Number(inline) : (spec.configuredLines ?? spec.naturalLines!);
      return Math.min(spec.naturalLines!, limit);
    };

    for (const spec of options.rows) {
      const element = elementFor(spec);
      element.getClientRects = () =>
        element.classList.contains('grid-event-detail-clipped')
          ? ({ length: 0 } as unknown as DOMRectList)
          : ({ 0: {} as DOMRect, length: 1, item: () => null } as unknown as DOMRectList);

      const span = element.querySelector<HTMLElement>('span');
      if (span) {
        span.getBoundingClientRect = () =>
          ({ height: renderedLines(spec) * LINE_HEIGHT }) as DOMRect;
      }
    }

    const rowHeight = (spec: RowSpec): number => {
      if (elementFor(spec).classList.contains('grid-event-detail-clipped')) {
        return 0;
      }
      if (!spec.naturalLines) {
        return spec.fixedHeight ?? LINE_HEIGHT;
      }
      return Math.max(options.iconHeight ?? ICON_HEIGHT, renderedLines(spec) * LINE_HEIGHT);
    };

    let contentHeight = options.contentHeight;
    Object.defineProperties(content, {
      clientHeight: { get: () => contentHeight },
      scrollHeight: {
        get: () =>
          options.titleHeight + options.rows.reduce((total, spec) => total + rowHeight(spec), 0),
      },
    });

    return {
      card,
      content,
      row: (className: RowSpec['className']) => root.querySelector<HTMLElement>(`.${className}`)!,
      clamp: (className: RowSpec['className']) =>
        root
          .querySelector<HTMLElement>(`.${className}`)!
          .style.getPropertyValue(LINE_PROPERTY[className] ?? '--unused'),
      grow: (height: number) => {
        contentHeight = height;
      },
      cleanup: () => host.remove(),
    };
  }

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('removes only the number of lines needed to pay for the overflow', () => {
    expect(fittedGridDetailLines(15, 60, 20)).toBe(2);
    // 21px over three 20px lines. Dropping one line recovers 20 and leaves a single pixel
    // over, which `gridContentOverflows` forgives -- so two lines survive, not one.
    expect(fittedGridDetailLines(21, 60, 20)).toBe(2);
    expect(fittedGridDetailLines(10, 60, 0)).toBe(0);
    // Two lines rendered at 14.4px, overflowing by 20px: 20px is two line boxes rounded up,
    // so nothing survives and the caller must withdraw rather than clamp.
    expect(fittedGridDetailLines(20, 28.8, 14.4)).toBe(0);
    // The maintainer's arithmetic: five rendered lines, 26.4px over, two lines to give back.
    expect(fittedGridDetailLines(26.4, 72, 14.4)).toBe(3);
    // A single pixel of overflow is the whole of the tolerance, so no line has to go. The
    // pass never asks -- `gridContentOverflows` calls that block fitting and never enters
    // the loop -- but the two must not disagree about it.
    expect(fittedGridDetailLines(1, 72, 14.4)).toBe(5);
    // Never more lines than the row already draws. Forgiving a pixel means the recovery can
    // go negative, and a line box smaller than that pixel would otherwise turn the shortfall
    // into extra lines -- handing back lines the configured clamp had already taken away.
    expect(fittedGridDetailLines(0, 60, 0.5)).toBe(120);
    expect(fittedGridDetailLines(1, 60, 0.5)).toBe(120);
  });

  it('uses an explicit pixel line height when the browser resolves one', () => {
    expect(resolveLineHeightPx({ lineHeight: '18px', fontSize: '30px' })).toBe(18);
  });

  it('falls back from normal line height to the font size', () => {
    expect(resolveLineHeightPx({ lineHeight: 'normal', fontSize: '20px' })).toBe(24);
    expect(resolveLineHeightPx({ lineHeight: 'normal', fontSize: 'invalid' })).toBe(0);
    // A detached element answers '' for everything, which must not read as a real line box.
    expect(resolveLineHeightPx({ lineHeight: '', fontSize: '' })).toBe(0);
    // A ratio is not a length. Browsers resolve `line-height: 1.25` to pixels before this
    // reads it, but nothing guarantees that, and taking the ratio at face value would call
    // every line box 1.25px tall and clamp every row to one line.
    expect(resolveLineHeightPx({ lineHeight: '1.25', fontSize: '16px' })).toBeCloseTo(19.2);
  });

  it('maps every disclosed detail row to the clamp it may use, most expendable first', () => {
    // Pinned by value rather than walked, because walking the table cannot see an entry
    // leaving it — and both directions matter here. A row gaining a clamp property it has no
    // lines for would have the pass write a meaningless `-webkit-line-clamp` onto it, and the
    // order is the withdrawal priority: reversing it gives up the time before the description.
    expect(GRID_DETAIL_ROWS).toEqual([
      { selector: '.description', lineProperty: '--calendar-card-description-max-lines' },
      { selector: '.location', lineProperty: '--calendar-card-location-max-lines' },
      { selector: '.event-weather', lineProperty: null },
      { selector: '.progress-bar-row', lineProperty: null },
      { selector: '.time', lineProperty: null },
    ]);
  });

  it('shows the location lines that fit instead of withdrawing the whole row', () => {
    // The maintainer's report: an 11:30-14:00 block whose title wraps and whose location is a
    // five-line postal address showed its title and its time and then nothing, with roughly
    // three empty lines below them inside the block. Measured in the browser at 55.6px of
    // dead space. The address does not fit whole; three of its five lines do.
    const block = buildBlock({
      titleHeight: 40,
      contentHeight: 100,
      rows: [
        { className: 'time', fixedHeight: LINE_HEIGHT },
        { className: 'location', naturalLines: 5 },
      ],
    });

    block.card._applyGridDisclosureSafety();

    expect(
      block.row('location').classList.contains('grid-event-detail-clipped'),
      'the address partly fits, so withdrawing the row throws away lines there was room for',
    ).toBe(false);
    expect(block.clamp('location')).toBe('3');
    expect(block.row('time').classList.contains('grid-event-detail-clipped')).toBe(false);
    expect(gridContentOverflows(block.content)).toBe(false);

    block.cleanup();
  });

  it('withdraws a row whose first line does not fit either', () => {
    // A 12px icon sits under the 14.4px line box, so a row clamped to zero lines really would
    // shrink and the block really would fit — as an address row showing a map pin and no
    // address. That is the outcome `fitted < 1` refuses: below one line there is nothing worth
    // keeping, so the row goes.
    const block = buildBlock({
      titleHeight: 40,
      contentHeight: 66,
      iconHeight: 12,
      rows: [
        { className: 'time', fixedHeight: LINE_HEIGHT },
        { className: 'location', naturalLines: 3 },
      ],
    });

    block.card._applyGridDisclosureSafety();

    expect(block.row('location').classList.contains('grid-event-detail-clipped')).toBe(true);
    expect(block.clamp('location'), 'a withdrawn row must not carry a clamp').toBe('');
    expect(block.row('time').classList.contains('grid-event-detail-clipped')).toBe(false);
    expect(gridContentOverflows(block.content)).toBe(false);

    block.cleanup();
  });

  it('withdraws a row whose icon floor swallows the lines the clamp gave back', () => {
    // Three lines of address beside a 24px icon in a block 21.6px too small. Two lines come
    // off, but the row only shrinks to its icon — 24px, not 14.4px — so the block still does
    // not fit and shortening bought nothing. The row goes entirely, and the clamp that failed
    // to pay for it must not be left standing on the hidden element.
    const block = buildBlock({
      titleHeight: 40,
      contentHeight: 76,
      rows: [
        { className: 'time', fixedHeight: LINE_HEIGHT },
        { className: 'location', naturalLines: 3 },
      ],
    });

    block.card._applyGridDisclosureSafety();

    expect(block.row('location').classList.contains('grid-event-detail-clipped')).toBe(true);
    expect(block.clamp('location')).toBe('');
    expect(block.row('time').classList.contains('grid-event-detail-clipped')).toBe(false);
    expect(gridContentOverflows(block.content)).toBe(false);

    block.cleanup();
  });

  it('never clamps the progress bar, which has no lines to give', () => {
    const block = buildBlock({
      titleHeight: 40,
      contentHeight: 55,
      rows: [
        { className: 'time', fixedHeight: LINE_HEIGHT },
        { className: 'progress-bar-row', fixedHeight: 6 },
      ],
    });

    block.card._applyGridDisclosureSafety();

    expect(block.row('progress-bar-row').classList.contains('grid-event-detail-clipped')).toBe(
      true,
    );
    expect(block.row('progress-bar-row').getAttribute('style')).toBeNull();
    expect(block.row('time').classList.contains('grid-event-detail-clipped')).toBe(false);

    block.cleanup();
  });

  it('tightens a configured location_max_lines and never loosens it', () => {
    // The address is eight lines long and the user asked for two. Fitting may take the second
    // away; it may not hand back any of the six the configuration already withheld.
    const block = buildBlock({
      titleHeight: 40,
      contentHeight: 80,
      rows: [
        { className: 'time', fixedHeight: LINE_HEIGHT },
        { className: 'location', naturalLines: 8, configuredLines: 2 },
      ],
    });

    block.card._applyGridDisclosureSafety();

    expect(block.row('location').classList.contains('grid-event-detail-clipped')).toBe(false);
    expect(Number(block.clamp('location'))).toBeLessThanOrEqual(2);
    expect(block.clamp('location')).toBe('1');

    block.cleanup();
  });

  it('drops the clamp again once the block has room for the whole address', () => {
    const block = buildBlock({
      titleHeight: 40,
      contentHeight: 100,
      rows: [
        { className: 'time', fixedHeight: LINE_HEIGHT },
        { className: 'location', naturalLines: 5 },
      ],
    });

    block.card._applyGridDisclosureSafety();
    expect(block.clamp('location')).toBe('3');

    block.grow(200);
    block.card._applyGridDisclosureSafety();

    expect(block.clamp('location')).toBe('');
    expect(block.row('location').classList.contains('grid-event-detail-clipped')).toBe(false);

    block.cleanup();
  });

  it('keeps every detail row and every line when the title alone is what overflows', () => {
    const block = buildBlock({
      titleHeight: 120,
      contentHeight: 60,
      rows: [
        { className: 'time', fixedHeight: LINE_HEIGHT },
        { className: 'location', naturalLines: 3 },
      ],
    });

    block.card._applyGridDisclosureSafety();

    expect(block.row('time').classList.contains('grid-event-detail-clipped')).toBe(false);
    expect(block.row('location').classList.contains('grid-event-detail-clipped')).toBe(false);
    expect(block.clamp('location')).toBe('');

    block.cleanup();
  });
});

describe('grid disclosure observer lifecycle', () => {
  class RecordingResizeObserver {
    static instances: RecordingResizeObserver[] = [];

    readonly observed: Element[] = [];
    disconnected = false;

    constructor(readonly callback: ResizeObserverCallback) {
      RecordingResizeObserver.instances.push(this);
    }

    observe(target: Element): void {
      this.observed.push(target);
    }

    unobserve(): void {}

    disconnect(): void {
      this.disconnected = true;
    }
  }

  const originalResizeObserver = globalThis.ResizeObserver;

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver;
    RecordingResizeObserver.instances = [];
    document.body.innerHTML = '';
  });

  it('does not recreate an observer from an update that finishes after disconnection', async () => {
    globalThis.ResizeObserver = RecordingResizeObserver as unknown as typeof ResizeObserver;
    const card = document.createElement('calendar-card-pro-dev') as unknown as HTMLElement & {
      setConfig(config: unknown): void;
      preview: boolean;
      updated(changedProps: Map<unknown, unknown>): void;
      readonly updateComplete: Promise<boolean>;
    };
    card.setConfig({ entities: [], view: 'grid' });
    card.preview = true;

    document.body.appendChild(card);
    await card.updateComplete;
    const root = card.shadowRoot!;
    root.innerHTML = '<div class="grid-event"></div>';
    card.updated(new Map());
    const gridObserver = RecordingResizeObserver.instances.at(-1)!;
    expect(RecordingResizeObserver.instances).toHaveLength(2);
    expect(gridObserver.observed).toHaveLength(1);

    card.remove();
    expect(gridObserver.disconnected).toBe(true);

    // Lit can run an already queued update after disconnectedCallback. It must not
    // restore an observer holding the detached block.
    card.updated(new Map());

    expect(RecordingResizeObserver.instances).toHaveLength(2);
  });

  it('observes title metrics that stay visible under the clip fallback, not optional detail rows', async () => {
    globalThis.ResizeObserver = RecordingResizeObserver as unknown as typeof ResizeObserver;
    const card = document.createElement('calendar-card-pro-dev') as unknown as HTMLElement & {
      setConfig(config: unknown): void;
      preview: boolean;
      updated(changedProps: Map<unknown, unknown>): void;
      readonly updateComplete: Promise<boolean>;
    };
    card.setConfig({ entities: [], view: 'grid' });
    card.preview = true;

    document.body.appendChild(card);
    await card.updateComplete;
    const root = card.shadowRoot!;
    root.innerHTML = `
      <div class="grid-event">
        <div class="grid-event-disclosure">
          <div class="event-content">
            <div class="summary"><span class="event-title">Meeting</span></div>
            <div class="time">10:00</div>
            <div class="location">Office</div>
            <div class="description">Notes</div>
            <div class="event-weather"></div>
            <div class="progress-bar-row"></div>
          </div>
        </div>
      </div>
    `;
    card.updated(new Map());

    const gridObserver = RecordingResizeObserver.instances.at(-1)!;
    const labels = gridObserver.observed.map((el) => el.className);
    expect(labels).toContain('grid-event');
    expect(labels).toContain('summary');
    expect(labels).toContain('event-title');
    // Optional rows can go display:none under the safety fallback. Observing them
    // re-fires the observer from the apply pass that hid them and reschedules forever.
    expect(labels).not.toContain('time');
    expect(labels).not.toContain('location');
    expect(labels).not.toContain('description');
    expect(labels).not.toContain('event-weather');
    expect(labels).not.toContain('progress-bar-row');

    card.remove();
    expect(gridObserver.disconnected).toBe(true);
  });

  it('does not re-arm disclosure from a ResizeObserver notification caused by its own clip toggle', async () => {
    class FiringResizeObserver {
      static instances: FiringResizeObserver[] = [];
      readonly observed = new Set<Element>();
      disconnected = false;

      constructor(readonly callback: ResizeObserverCallback) {
        FiringResizeObserver.instances.push(this);
      }

      observe(target: Element): void {
        this.observed.add(target);
      }

      unobserve(target: Element): void {
        this.observed.delete(target);
      }

      disconnect(): void {
        this.disconnected = true;
        this.observed.clear();
      }

      /** Deliver a notification as if every currently observed target resized. */
      fire(): void {
        if (this.disconnected || !this.observed.size) return;
        const entries = [...this.observed].map(
          (target) => ({ target }) as unknown as ResizeObserverEntry,
        );
        this.callback(entries, this as unknown as ResizeObserver);
      }
    }

    globalThis.ResizeObserver = FiringResizeObserver as unknown as typeof ResizeObserver;

    const card = document.createElement('calendar-card-pro-dev') as unknown as HTMLElement & {
      setConfig(config: unknown): void;
      preview: boolean;
      updated(changedProps: Map<unknown, unknown>): void;
      readonly updateComplete: Promise<boolean>;
      _applyGridDisclosureSafety(): void;
      _scheduleGridDisclosureSafety(): void;
    };
    card.setConfig({ entities: [], view: 'grid' });
    card.preview = true;
    document.body.appendChild(card);
    await card.updateComplete;

    const root = card.shadowRoot!;
    root.innerHTML = `
      <div class="grid-event">
        <div class="grid-event-disclosure">
          <div class="event-content">
            <div class="summary"><span class="event-title">Meeting</span></div>
            <div class="time">10:00</div>
          </div>
        </div>
      </div>
    `;
    const content = root.querySelector<HTMLElement>('.event-content')!;
    Object.defineProperties(content, {
      clientHeight: { configurable: true, value: 60 },
      scrollHeight: { configurable: true, value: 90 },
    });

    card.updated(new Map());
    const observer = FiringResizeObserver.instances.at(-1)!;

    let scheduleCount = 0;
    const originalSchedule = card._scheduleGridDisclosureSafety.bind(card);
    card._scheduleGridDisclosureSafety = () => {
      scheduleCount += 1;
      originalSchedule();
    };

    // Detail rows must not be observed: a clip toggle would notify them every apply.
    const time = root.querySelector('.time')!;
    expect(observer.observed.has(time)).toBe(false);

    // Apply always unclips then may reclip, which reflows title/block. While suppress
    // is armed, even a full fire on every observed target must not re-arm schedule.
    card._applyGridDisclosureSafety();
    const before = scheduleCount;
    observer.fire();
    expect(scheduleCount).toBe(before);

    card.remove();
    FiringResizeObserver.instances = [];
  });

  it('drops the document.fonts listener when the observer stops', async () => {
    globalThis.ResizeObserver = RecordingResizeObserver as unknown as typeof ResizeObserver;

    const listeners: Array<{ type: string; fn: EventListener }> = [];
    const fakeFonts = {
      ready: Promise.resolve(),
      addEventListener(type: string, fn: EventListener) {
        listeners.push({ type, fn });
      },
      removeEventListener(type: string, fn: EventListener) {
        const idx = listeners.findIndex((l) => l.type === type && l.fn === fn);
        if (idx >= 0) listeners.splice(idx, 1);
      },
    };
    const originalFonts = Object.getOwnPropertyDescriptor(Document.prototype, 'fonts');
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      get: () => fakeFonts,
    });

    try {
      const card = document.createElement('calendar-card-pro-dev') as unknown as HTMLElement & {
        setConfig(config: unknown): void;
        preview: boolean;
        updated(changedProps: Map<unknown, unknown>): void;
        readonly updateComplete: Promise<boolean>;
      };
      card.setConfig({ entities: [], view: 'grid' });
      card.preview = true;
      document.body.appendChild(card);
      await card.updateComplete;
      card.shadowRoot!.innerHTML = '<div class="grid-event"><div class="time">1</div></div>';
      card.updated(new Map());

      expect(listeners.some((l) => l.type === 'loadingdone')).toBe(true);

      card.remove();
      expect(listeners).toHaveLength(0);
    } finally {
      if (originalFonts) {
        Object.defineProperty(Document.prototype, 'fonts', originalFonts);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (document as any).fonts;
      }
    }
  });

  it('does not re-arm disclosure after stop when a pending fonts.ready resolves', async () => {
    globalThis.ResizeObserver = RecordingResizeObserver as unknown as typeof ResizeObserver;

    let resolveReady!: () => void;
    const ready = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });
    const listeners: Array<{ type: string; fn: EventListener }> = [];
    const fakeFonts = {
      ready,
      addEventListener(type: string, fn: EventListener) {
        listeners.push({ type, fn });
      },
      removeEventListener(type: string, fn: EventListener) {
        const idx = listeners.findIndex((l) => l.type === type && l.fn === fn);
        if (idx >= 0) listeners.splice(idx, 1);
      },
    };
    const originalFonts = Object.getOwnPropertyDescriptor(Document.prototype, 'fonts');
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      get: () => fakeFonts,
    });

    try {
      const card = document.createElement('calendar-card-pro-dev') as unknown as HTMLElement & {
        setConfig(config: unknown): void;
        preview: boolean;
        updated(changedProps: Map<unknown, unknown>): void;
        readonly updateComplete: Promise<boolean>;
        _scheduleGridDisclosureSafety(): void;
        _applyGridDisclosureSafety(): void;
      };
      card.setConfig({ entities: [], view: 'grid' });
      card.preview = true;
      document.body.appendChild(card);
      await card.updateComplete;
      card.shadowRoot!.innerHTML = '<div class="grid-event"><div class="time">1</div></div>';
      card.updated(new Map());

      expect(listeners.some((l) => l.type === 'loadingdone')).toBe(true);

      let scheduleCount = 0;
      let applyCount = 0;
      card._scheduleGridDisclosureSafety = () => {
        scheduleCount += 1;
      };
      card._applyGridDisclosureSafety = () => {
        applyCount += 1;
      };

      card.remove();
      expect(listeners).toHaveLength(0);

      resolveReady();
      await ready;
      await Promise.resolve();
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });

      expect(scheduleCount).toBe(0);
      expect(applyCount).toBe(0);
    } finally {
      if (originalFonts) {
        Object.defineProperty(Document.prototype, 'fonts', originalFonts);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (document as any).fonts;
      }
    }
  });
});
