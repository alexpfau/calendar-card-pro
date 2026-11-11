import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import '../src/calendar-card-pro';
import type * as Types from '../src/config/types';
import { cardStyles } from '../src/rendering/styles';
import * as Helpers from '../src/utils/helpers';
import {
  TITLE_FIT_PROPERTIES as P,
  TITLE_CUT,
  TITLE_FIT,
  TITLE_ROOM_GAP,
  TITLE_UNHYPHENATED,
  clearTitleFit,
  fitTitlesBesideTime,
  unhyphenateTitleCuts,
} from '../src/utils/title-fit';

/**
 * Fitting the time to a title that wraps beside it (`time_position: title`): the room the card
 * sizes to the time at the end of the title, and the cut at `title_max_lines` of two or more.
 *
 * happy-dom lays nothing out, so each row here is given the geometry a browser reported for it,
 * and the tests hold what the card writes from that geometry. Where the rows land on screen, in
 * Chromium and WebKit, in both directions, was measured in browsers. The units are a 14px title
 * on 16.8px lines with 2.8px of padding above and below, in a 300px row, as the card draws one.
 */

const LINE = 16.8;
const PAD = 2.8;
const WIDTH = 300;

interface Box {
  top: number;
  height: number;
  width?: number;
}

/** Give an element the box a browser would report for it. */
function place(element: Element, { top, height, width = WIDTH }: Box): void {
  const rect = {
    top,
    bottom: top + height,
    left: 0,
    right: width,
    width,
    height,
    x: 0,
    y: top,
    toJSON: () => ({}),
  };
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => rect,
  });
}

interface RowGeometry {
  /** Lines the title takes, and whether the time takes lines of its own below them. */
  titleLines: number;
  timeLines: number;
  alone: boolean;
  timeWidth: number;
  /** Where the row ends once cut beside the time: the bottom of its last line. */
  cutLines?: number;
  hidden?: boolean;
  /** How far below the top of the time's box the strut sits: a time taller than it pushes it. */
  strutDrop?: number;
}

/** A wrapping title's row, as the leaf draws it, with the geometry a browser gave it. */
function row(geometry: RowGeometry, capped = true): HTMLElement {
  const {
    titleLines,
    timeLines,
    alone,
    timeWidth,
    cutLines = titleLines,
    hidden,
    strutDrop = 0,
  } = geometry;
  const element = document.createElement('div');
  element.className = `summary-row title-wrap${capped ? ' title-capped' : ''}`;
  element.innerHTML =
    `<div class="summary" style="line-height: ${LINE}px; padding-top: ${PAD}px; padding-bottom: ${PAD}px">` +
    `<span class="event-title">A title</span><span class="title-room" style="margin-inline-start: 12px"></span></div>` +
    `<div class="title-aside"><span class="title-strut" aria-hidden="true">\u2060</span>` +
    `<div class="time">10:00 - 11:30</div></div>`;
  document.body.appendChild(element);
  const summary = element.querySelector<HTMLElement>('.summary')!;
  const title = element.querySelector('.event-title')!;
  const room = element.querySelector('.title-room')!;
  const aside = element.querySelector('.title-aside')!;

  Object.defineProperty(summary, 'offsetWidth', { configurable: true, value: hidden ? 0 : WIDTH });
  Object.defineProperty(summary, 'clientWidth', { configurable: true, value: hidden ? 0 : WIDTH });
  const lines = titleLines + (alone ? timeLines : 0);
  place(summary, { top: 0, height: PAD + lines * LINE + PAD });
  // One box per line of the title; a font taller than its line reaches a little past it.
  Object.defineProperty(title, 'getClientRects', {
    configurable: true,
    value: () =>
      Array.from({ length: titleLines }, (_, index) => ({
        top: PAD + index * LINE - 0.6,
        bottom: PAD + (index + 1) * LINE + 0.6,
        width: 100,
      })),
  });
  place(room, {
    top: PAD + (alone ? titleLines : titleLines - 1) * LINE,
    height: timeLines * LINE,
  });
  place(aside, { top: 0, height: timeLines * LINE, width: timeWidth });
  place(element.querySelector('.title-strut')!, { top: strutDrop, height: LINE, width: 0 });
  // Once cut beside the time, the row ends at the last line the clamp keeps.
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ top: 0, bottom: element.hasAttribute(TITLE_CUT) ? PAD + cutLines * LINE : 0 }),
  });
  return element;
}

/** Everything the card wrote on a row. */
function written(element: HTMLElement): Record<string, string | null> {
  return {
    fit: element.getAttribute(TITLE_FIT),
    cut: element.getAttribute(TITLE_CUT),
    ...Object.fromEntries(
      Object.entries(P).map(([name, property]) => [name, element.style.getPropertyValue(property)]),
    ),
  };
}

const NARROW = 80;
const ROW_WIDE = 290;

describe('fitTitlesBesideTime', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("sizes the room to the time and says where the title's padding is, with no limit", () => {
    const element = row({ titleLines: 3, timeLines: 1, alone: false, timeWidth: NARROW }, false);
    fitTitlesBesideTime([element], 0);
    expect(written(element)).toEqual({
      fit: 'ltr',
      cut: null,
      width: `${NARROW}px`,
      height: `${LINE}px`,
      pad: `${PAD}px`,
      start: '',
      end: '',
      below: '',
    });
  });

  it('leaves a capped title that fits as it is with no limit', () => {
    // Two lines with the time on the second, and one line with the time on a line of its own.
    const fits = [
      row({ titleLines: 2, timeLines: 1, alone: false, timeWidth: NARROW }),
      row({ titleLines: 1, timeLines: 1, alone: true, timeWidth: NARROW }),
    ];
    fitTitlesBesideTime(fits, 2);
    for (const element of fits) expect(element.getAttribute(TITLE_CUT)).toBeNull();
    // The same rows with no limit: what a capped row that fits must equal.
    const uncapped = [
      row({ titleLines: 2, timeLines: 1, alone: false, timeWidth: NARROW }, false),
      row({ titleLines: 1, timeLines: 1, alone: true, timeWidth: NARROW }, false),
    ];
    fitTitlesBesideTime(uncapped, 0);
    expect(fits.map(written)).toEqual(uncapped.map(written));
  });

  it('cuts a longer title on its last allowed line, with the room for the time on that line', () => {
    const element = row({
      titleLines: 3,
      timeLines: 1,
      alone: false,
      timeWidth: NARROW,
      cutLines: 2,
    });
    fitTitlesBesideTime([element], 2);
    expect(written(element)).toMatchObject({ fit: 'ltr', cut: '', below: '' });
    // The room starts halfway down the second line, so it shortens that line and not the first,
    // and ends at the bottom of the row's last.
    expect(parseFloat(element.style.getPropertyValue(P.start))).toBeCloseTo(1.5 * LINE, 6);
    expect(parseFloat(element.style.getPropertyValue(P.end))).toBeCloseTo(2 * LINE, 6);
  });

  it('cuts a title of exactly the limit whose time needs a line of its own beside the time', () => {
    // The row keeps to the limit beside the time, as a single line does with a limit of one.
    const element = row({
      titleLines: 2,
      timeLines: 1,
      alone: true,
      timeWidth: NARROW,
      cutLines: 2,
    });
    fitTitlesBesideTime([element], 2);
    expect(element.getAttribute(TITLE_CUT)).toBe('');
  });

  it('cuts below the title where the time leaves the title no room beside it', () => {
    // A time as wide as the row, on two lines of its own, under a title of three lines.
    const element = row({ titleLines: 3, timeLines: 2, alone: true, timeWidth: ROW_WIDE });
    fitTitlesBesideTime([element], 2);
    expect(written(element)).toMatchObject({ cut: 'below', start: '', end: '' });
    // Room under the title for the time's two lines and the padding below them.
    expect(parseFloat(element.style.getPropertyValue(P.below))).toBeCloseTo(2 * LINE + PAD, 6);
  });

  it('leaves a title within the limit under a time too wide to sit beside it', () => {
    // The title alone keeps to the limit, so it is not cut: the time takes lines of its own,
    // as it does with no limit.
    const element = row({ titleLines: 2, timeLines: 2, alone: true, timeWidth: ROW_WIDE });
    fitTitlesBesideTime([element], 2);
    expect(element.getAttribute(TITLE_CUT)).toBeNull();
    expect(element.getAttribute(TITLE_FIT)).toBe('ltr');
  });

  it('cuts below where the time is a line tall for each line the limit allows', () => {
    // Narrow, but two lines tall: beside it, a limit of two leaves the title none.
    const element = row({ titleLines: 3, timeLines: 2, alone: false, timeWidth: NARROW });
    fitTitlesBesideTime([element], 2);
    expect(element.getAttribute(TITLE_CUT)).toBe('below');
  });

  it('takes a cut off a row that no longer needs one', () => {
    const element = row({
      titleLines: 3,
      timeLines: 1,
      alone: false,
      timeWidth: NARROW,
      cutLines: 2,
    });
    fitTitlesBesideTime([element], 2);
    expect(element.getAttribute(TITLE_CUT)).toBe('');
    // The card widens and the same title fits in two lines.
    fitTitlesBesideTime([element], 3);
    expect(written(element)).toMatchObject({ cut: null, start: '', end: '', below: '' });
  });

  it('measures nothing on a row a hidden card has not laid out', () => {
    const element = row({
      titleLines: 3,
      timeLines: 1,
      alone: false,
      timeWidth: NARROW,
      hidden: true,
    });
    fitTitlesBesideTime([element], 2);
    expect(written(element)).toMatchObject({ fit: null, cut: null, width: '', height: '' });
  });

  it('takes a fit off a row it can no longer measure, so the time falls back below the title', () => {
    const element = row({
      titleLines: 3,
      timeLines: 1,
      alone: false,
      timeWidth: NARROW,
      cutLines: 2,
    });
    fitTitlesBesideTime([element], 2);
    expect(written(element)).toMatchObject({ fit: 'ltr', cut: '' });
    // The card is hidden, and its time may change before it shows again.
    Object.defineProperty(element.querySelector('.summary'), 'offsetWidth', { value: 0 });
    fitTitlesBesideTime([element], 2);
    expect(written(element)).toEqual({
      fit: null,
      cut: null,
      width: '',
      height: '',
      pad: '',
      start: '',
      end: '',
      below: '',
    });
  });

  it("names the row's direction, which the stylesheet floats the room and places the time by", () => {
    const rtl = row({ titleLines: 1, timeLines: 1, alone: false, timeWidth: NARROW }, false);
    rtl.style.direction = 'rtl';
    const ltr = row({ titleLines: 1, timeLines: 1, alone: false, timeWidth: NARROW }, false);
    fitTitlesBesideTime([rtl, ltr], 0);
    expect(rtl.getAttribute(TITLE_FIT)).toBe('rtl');
    expect(ltr.getAttribute(TITLE_FIT)).toBe('ltr');
  });

  it('keeps the gap the row says before the time when it decides where to cut', () => {
    // A time 220px wide leaves a 300px title 68px beside it with a 12px gap, enough for a word
    // and its "…", and 28px with a 52px one, too little: the cut moves below the title.
    const cut = (gap: string) => {
      const element = row({
        titleLines: 3,
        timeLines: 1,
        alone: false,
        timeWidth: 220,
        cutLines: 2,
      });
      element.style.setProperty('--calendar-card-title-room-gap', gap);
      fitTitlesBesideTime([element], 2);
      return element.getAttribute(TITLE_CUT);
    };
    expect(cut('12px')).toBe('');
    expect(cut('52px')).toBe('below');
  });

  it("gives the time a line of its own where it sinks the box's baseline below the title's", () => {
    // A time larger than the title reaches higher above its baseline than the strut at the
    // title's size, so the strut, and the baseline the time sits on, start lower in its box. A
    // room as wide as the line puts it on a line of its own; a drop within rounding does not.
    const geometry = { titleLines: 3, timeLines: 1, alone: false, timeWidth: NARROW };
    const sunk = row({ ...geometry, strutDrop: 4 }, false);
    const level = row({ ...geometry, strutDrop: 0.4 }, false);
    const capped = row({ ...geometry, strutDrop: 4 });
    fitTitlesBesideTime([sunk, level], 0);
    fitTitlesBesideTime([capped], 2);
    expect(sunk.style.getPropertyValue(P.width)).toBe(`${WIDTH}px`);
    expect(level.style.getPropertyValue(P.width)).toBe(`${NARROW}px`);
    // With a limit, the title is cut across the row and the time goes below it.
    expect(written(capped)).toMatchObject({ cut: 'below', width: `${WIDTH}px` });
  });

  it('reads the width a sunk time is given off the content box, not clientWidth less the room', () => {
    // .summary keeps 0.125em of room at its inline edges ("Marks above and below the line" in
    // styles.ts). clientWidth is a whole number of pixels and the room is not, so a 299.4px line
    // with 1.75px of room either side reports 303, which less the room is 299.5.
    const sunk = row(
      { titleLines: 3, timeLines: 1, alone: false, timeWidth: NARROW, strutDrop: 4 },
      false,
    );
    const summary = sunk.querySelector<HTMLElement>('.summary')!;
    summary.style.width = '299.4px';
    summary.style.paddingLeft = '1.75px';
    summary.style.paddingRight = '1.75px';
    Object.defineProperty(summary, 'clientWidth', { configurable: true, value: 303 });
    fitTitlesBesideTime([sunk], 0);
    expect(sunk.style.getPropertyValue(P.width)).toBe('299.4px');
  });

  it("reads a transformed card in the card's own pixels, and a fractional box as it is", () => {
    // offsetWidth is whole pixels, so a box a fraction of a pixel wider is not transformed: read
    // as one, its fraction shrank every measure, and the cut's room reached into the line above.
    const geometry = { titleLines: 3, timeLines: 1, alone: false };
    const box = { top: 0, height: PAD + 3 * LINE + PAD };
    const fractional = row({ ...geometry, timeWidth: NARROW }, false);
    place(fractional.querySelector('.summary')!, { ...box, width: WIDTH + 0.4 });
    const halved = row({ ...geometry, timeWidth: NARROW / 2 }, false);
    place(halved.querySelector('.summary')!, { ...box, width: WIDTH / 2 });
    fitTitlesBesideTime([fractional, halved], 0);
    expect(fractional.style.getPropertyValue(P.width)).toBe(`${NARROW}px`);
    expect(halved.style.getPropertyValue(P.width)).toBe(`${NARROW}px`);
  });

  it('clears every measure from a row', () => {
    const element = row({
      titleLines: 3,
      timeLines: 1,
      alone: false,
      timeWidth: NARROW,
      cutLines: 2,
    });
    fitTitlesBesideTime([element], 2);
    clearTitleFit(element);
    expect(written(element)).toEqual({
      fit: null,
      cut: null,
      width: '',
      height: '',
      pad: '',
      start: '',
      end: '',
      below: '',
    });
  });
});

describe('the layout of a title beside the time', () => {
  it.each([
    [{}, 'wrap'],
    [{ title_max_lines: 0 }, 'wrap'],
    [{ title_max_lines: 2 }, 'cap'],
    [{ title_max_lines: '3' }, 'cap'],
    [{ title_max_lines: 1 }, 'line'],
    [{ scroll_long_titles: true }, 'line'],
    [{ scroll_long_titles: true, title_max_lines: 2 }, 'line'],
  ] as const)('is %o: %s', (config, layout) => {
    expect(Helpers.titleBesideTimeLayout(config)).toBe(layout);
  });

  it('cuts in list and column view only, with the time beside the title and a limit of two', () => {
    const capped = { time_position: 'title', title_max_lines: 2 };
    expect(Helpers.titlesCutBesideTime(capped, 'list')).toBe(true);
    expect(Helpers.titlesCutBesideTime(capped, 'column')).toBe(true);
    expect(Helpers.titlesCutBesideTime(capped, 'grid')).toBe(false);
    expect(Helpers.titlesCutBesideTime({ title_max_lines: 2 }, 'list')).toBe(false);
    expect(Helpers.titlesCutBesideTime({ ...capped, title_max_lines: 1 }, 'list')).toBe(false);
  });
});

/**
 * The card's own wiring: after a render, every wrapping title's row is measured, and a card whose
 * titles beside the time are kept to one line measures none. Geometry is stubbed on the element
 * prototypes, so every row reports a laid-out box.
 */
describe('the card fits the time to wrapping titles', () => {
  /** The height every box reports, which a test changes to stand for a time that grew. */
  let height = LINE;

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    height = LINE;
    document.body.replaceChildren();
  });

  async function card(
    config: Record<string, unknown>,
    parent: Node = document.body,
  ): Promise<HTMLElement> {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(WIDTH);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      () =>
        ({
          top: 0,
          bottom: height,
          left: 0,
          right: WIDTH,
          width: WIDTH,
          height,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    );
    const start = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(10, 0, 0, 0);
    const hass = {
      states: { 'calendar.anna': { entity_id: 'calendar.anna', state: 'off', attributes: {} } },
      locale: { language: 'en', first_weekday: 'monday', time_format: '24' },
      config: { country: 'DE' },
      themes: { darkMode: false },
      entities: {},
      connection: {
        subscribeMessage: (_callback: unknown, message: { type: string }) =>
          message.type === 'calendar/event/subscribe'
            ? Promise.reject({ code: 'unknown_command' })
            : Promise.resolve(() => {}),
        subscribeEvents: () => Promise.resolve(() => {}),
      },
      callWS: () => Promise.resolve({}),
      localize: (key: string) => key,
      callApi: () =>
        Promise.resolve([
          {
            summary: 'Quarterly planning review with the whole product team',
            start: { dateTime: start.toISOString() },
            end: { dateTime: new Date(start.getTime() + 90 * 60 * 1000).toISOString() },
          },
        ]),
      callService: () => Promise.resolve(),
    } as unknown as Types.Hass;
    const element = document.createElement('calendar-card-pro-dev') as HTMLElement & {
      setConfig(config: Types.Config): void;
      hass: Types.Hass;
      updateEvents(force?: boolean): Promise<void>;
      updateComplete: Promise<boolean>;
    };
    element.setConfig(
      buildConfig({
        entities: ['calendar.anna'],
        days_to_show: 3,
        ...config,
      } as Partial<Types.Config>),
    );
    element.hass = hass;
    parent.appendChild(element);
    await element.updateEvents(true);
    await element.updateComplete;
    return element;
  }

  it.each([
    ['with no limit', {}],
    ['with a limit of two', { title_max_lines: 2 }],
  ])('sizes the room on every wrapping title %s', async (_name, extra) => {
    const element = await card({ time_position: 'title', ...extra });
    const rows = [...element.shadowRoot!.querySelectorAll<HTMLElement>('.summary-row.title-wrap')];
    expect(rows.length).toBeGreaterThan(0);
    for (const fitted of rows) {
      expect(fitted.hasAttribute(TITLE_FIT)).toBe(true);
      expect(fitted.style.getPropertyValue(P.width)).toBe(`${WIDTH}px`);
    }
  });

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

  /** The frames the card asked for, run by hand. */
  function frames(): Map<number, FrameRequestCallback> {
    const pending = new Map<number, FrameRequestCallback>();
    let next = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      pending.set(++next, callback);
      return next;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => pending.delete(id));
    return pending;
  }

  /** The observer the card keeps on its wrapping titles: the live one watching a time. */
  function fitObserver(): RecordingResizeObserver {
    const live = RecordingResizeObserver.instances.filter(
      (observer) =>
        !observer.disconnected &&
        observer.observed.some((target) => target.classList.contains('title-aside')),
    );
    expect(live).toHaveLength(1);
    return live[0]!;
  }

  it('measures again a frame after the card, a title or a time resizes, once however often', async () => {
    RecordingResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', RecordingResizeObserver);
    const element = await card({ time_position: 'title' });
    const rows = [...element.shadowRoot!.querySelectorAll<HTMLElement>('.summary-row.title-wrap')];
    expect(rows.length).toBeGreaterThan(0);
    const observer = fitObserver();
    expect(observer.observed).toContain(element);
    for (const fitted of rows) {
      expect(observer.observed).toContain(fitted.querySelector(':scope > .summary'));
      expect(observer.observed).toContain(fitted.querySelector(':scope > .title-aside'));
    }

    const pending = frames();
    height = 2 * LINE;
    observer.callback([], observer as unknown as ResizeObserver);
    observer.callback([], observer as unknown as ResizeObserver);
    expect(pending.size).toBe(1);
    for (const fitted of rows) expect(fitted.style.getPropertyValue(P.height)).toBe(`${LINE}px`);
    [...pending.values()].forEach((frame) => frame(0));
    for (const fitted of rows) {
      expect(fitted.style.getPropertyValue(P.height)).toBe(`${2 * LINE}px`);
    }
  });

  it('measures again when an ancestor changes what the titles inherit, across a shadow root', async () => {
    const ancestor = document.createElement('div');
    document.body.appendChild(ancestor);
    const element = await card({ time_position: 'title' }, ancestor.attachShadow({ mode: 'open' }));
    const pending = frames();
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
    await flush();
    pending.clear();

    ancestor.setAttribute('style', 'font-size: 20px');
    await flush();
    expect(pending.size).toBe(1);
    expect(element.shadowRoot!.querySelector(`[${TITLE_FIT}]`)).not.toBeNull();
  });

  it('stops watching once the card leaves the page, and keeps what it measured', async () => {
    RecordingResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', RecordingResizeObserver);
    const ancestor = document.createElement('div');
    document.body.appendChild(ancestor);
    const element = await card({ time_position: 'title' }, ancestor);
    const observer = fitObserver();
    const pending = frames();
    observer.callback([], observer as unknown as ResizeObserver);
    expect(pending.size).toBe(1);

    element.remove();
    expect(observer.disconnected).toBe(true);
    // The frame it had asked for is withdrawn, and an ancestor's change schedules no other.
    expect(pending.size).toBe(0);
    ancestor.setAttribute('dir', 'rtl');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(pending.size).toBe(0);
    expect(element.shadowRoot!.querySelector(`[${TITLE_FIT}]`)).not.toBeNull();
  });

  it('watches every title a limit caps, beside the time or below it, and none without one', async () => {
    RecordingResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', RecordingResizeObserver);
    const capped = await card({ title_max_lines: 2 });
    const summaries = [...capped.shadowRoot!.querySelectorAll('.summary')];
    expect(summaries.length).toBeGreaterThan(0);
    const live = RecordingResizeObserver.instances.filter(
      (observer) =>
        !observer.disconnected &&
        observer.observed.some((target) => target.classList?.contains('summary')),
    );
    expect(live).toHaveLength(1);
    expect(live[0]!.observed).toContain(capped);
    for (const summary of summaries) expect(live[0]!.observed).toContain(summary);
    capped.remove();

    RecordingResizeObserver.instances = [];
    const free = await card({});
    expect(
      RecordingResizeObserver.instances.some((observer) =>
        observer.observed.some((target) => target.classList?.contains('summary')),
      ),
    ).toBe(false);
    expect(free.shadowRoot!.querySelector(`[${TITLE_UNHYPHENATED}]`)).toBeNull();
  });

  it('takes the marks back before it measures the rows beside the time again', async () => {
    RecordingResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', RecordingResizeObserver);
    const element = await card({ time_position: 'title', title_max_lines: 2 });
    const summaries = [...element.shadowRoot!.querySelectorAll<HTMLElement>('.summary')];
    expect(summaries.length).toBeGreaterThan(0);
    const marked = (): boolean =>
      summaries.some((summary) => summary.hasAttribute(TITLE_UNHYPHENATED));

    // A row beside the time is fitted to its title as the browser hyphenates it, so the mark the
    // last pass left must be off while the row is read. Config changes render new titles; a
    // resize measures the same ones again, marks and all.
    const spy = vi.mocked(Element.prototype.getBoundingClientRect);
    const box = spy.getMockImplementation()!;
    const seen: boolean[] = [];
    spy.mockImplementation(function (this: Element) {
      if (this.closest('.summary-row.title-wrap')) seen.push(marked());
      return box.call(this);
    });
    const observer = fitObserver();
    const pending = frames();
    summaries.forEach((summary) => summary.setAttribute(TITLE_UNHYPHENATED, ''));
    observer.callback([], observer as unknown as ResizeObserver);
    [...pending.values()].forEach((frame) => frame(0));
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((stale) => !stale)).toBe(true);
  });

  it('measures nothing where the titles beside the time keep to one line', async () => {
    const element = await card({ time_position: 'title', title_max_lines: 1 });
    expect(element.shadowRoot!.querySelector('.time-beside-title')).not.toBeNull();
    expect(element.shadowRoot!.querySelector('.title-wrap')).toBeNull();
    expect(element.shadowRoot!.querySelector(`[${TITLE_FIT}]`)).toBeNull();
  });
});

/**
 * A capped title whose last shown line the browser hyphenated, so the clamp's "…" followed the
 * hyphen: "appoint-…" (backlog item 259). The card lays such a title out without automatic
 * hyphens. Here each title is given the lines a browser broke it into, ten pixels a character on
 * twenty-pixel lines, and a canvas that measures text the same way.
 */
describe('unhyphenateTitleCuts', () => {
  const CHARACTER = 10;
  const LINE_HEIGHT = 20;
  const BOX = 200;

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  interface Capped {
    /** The title as the browser broke it: the lines it shows, then the lines the clamp hides. */
    lines: string[];
    shown?: number;
    direction?: 'ltr' | 'rtl';
    /** Cut beside the time: the row clamps, and the room for the time shortens its last line. */
    beside?: number;
    /** The box's width, 200px unless a test is after the edge. */
    width?: number;
    /** How much an ancestor scales the card: boxes come in the page's pixels, lengths in its own. */
    scale?: number;
  }

  /** A capped title on the page, with that geometry. */
  function capped({
    lines,
    shown = 2,
    direction = 'ltr',
    beside,
    width = BOX,
    scale = 1,
  }: Capped): HTMLElement {
    const row = document.createElement('div');
    row.className = 'summary-row';
    row.innerHTML = `<div class="summary"><span class="event-title">${lines.join('')}</span></div>`;
    document.body.appendChild(row);
    const summary = row.querySelector<HTMLElement>('.summary')!;
    const title = row.querySelector<HTMLElement>('.event-title')!;
    const box = beside === undefined ? title : row;
    if (beside !== undefined) row.style.setProperty(P.width, `${beside}px`);

    const rect = (top: number, height: number, left: number, across: number) =>
      ({
        top: top * scale,
        bottom: (top + height) * scale,
        left: left * scale,
        right: (left + across) * scale,
        width: across * scale,
        height: height * scale,
      }) as DOMRect;
    for (const element of [row, summary, title]) {
      Object.defineProperty(element, 'getBoundingClientRect', {
        configurable: true,
        value: () => rect(0, shown * LINE_HEIGHT, 0, width),
      });
      Object.defineProperty(element, 'offsetWidth', {
        configurable: true,
        value: Math.round(width),
      });
    }
    Object.defineProperty(box, 'scrollHeight', { value: lines.length * LINE_HEIGHT });
    Object.defineProperty(box, 'clientHeight', { value: shown * LINE_HEIGHT });

    const original = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
      if (![row, summary, title].includes(element as HTMLElement)) return original(element);
      const clamps = element === box;
      return {
        webkitLineClamp: clamps ? String(shown) : 'none',
        overflowY: clamps ? 'hidden' : 'visible',
        paddingBottom: '0px',
        paddingLeft: '0px',
        paddingRight: '0px',
        lineHeight: `${LINE_HEIGHT}px`,
        direction,
        font: `${CHARACTER}px test`,
        getPropertyValue: (name: string) => (name === TITLE_ROOM_GAP ? '12px' : ''),
      } as unknown as CSSStyleDeclaration;
    });

    // Each character's box, from where the browser broke the lines.
    const places: DOMRect[] = [];
    lines.forEach((line, index) => {
      [...line].forEach((_, column) => {
        const left = direction === 'rtl' ? BOX - (column + 1) * CHARACTER : column * CHARACTER;
        places.push(rect(index * LINE_HEIGHT + 2, LINE_HEIGHT - 4, left, CHARACTER));
      });
    });
    vi.spyOn(Range.prototype, 'getBoundingClientRect').mockImplementation(function (this: Range) {
      return places[this.startOffset];
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      font: '',
      measureText: (text: string) => ({ width: [...text].length * CHARACTER }),
    } as unknown as RenderingContext);
    return summary;
  }

  /** Whether the title is marked, after the card has measured it. */
  function marked(geometry: Capped): boolean {
    const summary = capped(geometry);
    unhyphenateTitleCuts([summary]);
    return summary.hasAttribute(TITLE_UNHYPHENATED);
  }

  it('marks a title cut inside a word where the hyphen and the "…" fit after it', () => {
    expect(marked({ lines: ['Kindergarten ', 'registration ap', 'pointment'] })).toBe(true);
  });

  it('leaves a title the browser shortens, which takes the hyphen with it', () => {
    // 19 characters, a hyphen and "…" are 210px on a 200px line: "registration appoi…".
    expect(marked({ lines: ['Kindergarten ', 'registration appoin', 'tment'] })).toBe(false);
  });

  it('allows the measure a fifth of a pixel past the line, where browsers still drew "-…"', () => {
    // "registration appoi-…" measures 200px.
    const lines = ['Kindergarten ', 'registration appoi', 'ntment'];
    expect(marked({ lines, width: 199.85 })).toBe(true);
    expect(marked({ lines, width: 199.75 })).toBe(false);
  });

  it('leaves a title cut between words', () => {
    expect(marked({ lines: ['Kindergarten ', 'registration ', 'appointment'] })).toBe(false);
  });

  it('leaves a word too wide for any line, which breaks there without a hyphen', () => {
    expect(marked({ lines: ['Weekend ', 'Donaudampfschiffahrt', 'sgesellschaft'] })).toBe(false);
  });

  it('leaves a title the limit does not cut', () => {
    expect(marked({ lines: ['Kindergarten ', 'registration ap'], shown: 2 })).toBe(false);
  });

  it('measures a right-to-left line from its right edge', () => {
    expect(marked({ lines: ['פגישת הורים ', 'בבית הספר עם המו', 'רה'], direction: 'rtl' })).toBe(
      true,
    );
    expect(marked({ lines: ['פגישת הורים ', 'בבית הספר עם המורה ש', 'ל'], direction: 'rtl' })).toBe(
      false,
    );
  });

  it('keeps the room for the time a title cut beside it ends its last line in', () => {
    expect(marked({ lines: ['Kindergarten ', 'registration ap', 'pointment'], beside: 0 })).toBe(
      true,
    );
    // 60px of time and its 12px gap leave the line 128px: too short for "registration ap-…".
    expect(marked({ lines: ['Kindergarten ', 'registration ap', 'pointment'], beside: 60 })).toBe(
      false,
    );
  });

  it('reads a card an ancestor scales in its own pixels', () => {
    for (const scale of [0.8, 1.5]) {
      expect(marked({ lines: ['Kindergarten ', 'registration ap', 'pointment'], scale })).toBe(
        true,
      );
      expect(marked({ lines: ['Kindergarten ', 'registration appoin', 'tment'], scale })).toBe(
        false,
      );
      expect(
        marked({ lines: ['Kindergarten ', 'registration ap', 'pointment'], beside: 60, scale }),
      ).toBe(false);
    }
  });

  it('takes a mark off a title that is no longer cut that way', () => {
    const summary = capped({ lines: ['Kindergarten ', 'registration ', 'appointment'] });
    summary.setAttribute(TITLE_UNHYPHENATED, '');
    unhyphenateTitleCuts([summary]);
    expect(summary.hasAttribute(TITLE_UNHYPHENATED)).toBe(false);
  });

  it('is laid out without automatic hyphens once marked, and nothing else is', () => {
    const css = cardStyles.cssText.replace(/\/\*[\s\S]*?\*\//g, '');
    // On the title, so a text label beside it keeps hyphenating as it did.
    expect(css).toMatch(
      /\.summary\[data-title-unhyphenated\] > \.event-title\s*\{\s*hyphens:\s*none;\s*\}/,
    );
    expect(css.match(/hyphens:\s*none/g)).toHaveLength(1);
  });
});
