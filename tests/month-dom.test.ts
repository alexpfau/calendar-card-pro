/**
 * The month view's DOM, drawn by the card itself from a fake Home Assistant.
 *
 * Mounted rather than rendered piece by piece, because what a month draws depends on what
 * the card hands its renderer: the six weeks of the page (`_monthRowsStart`), the configuration
 * resolved for month, and the line capacity it measures (`_syncMonthCapacity`). Each property a
 * month cell is meant to have is asserted by value, and one representative month is pinned as a
 * snapshot, read before it was committed. Zones that move the arithmetic are covered in
 * `month-dom.dst.test.ts`.
 *
 * Monday, November 16 to Sunday 22, 2026, is the fourth row of November's six when Mondays come
 * first: October 26 to December 6.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { declarations } from './helpers/css-declarations';
import { memoryStorage } from './memory-storage';
import '../src/calendar-card-pro';
import type * as Types from '../src/config/types';
import * as MonthRender from '../src/rendering/month';
import { cardStyles } from '../src/rendering/styles';

/** Wednesday, November 18, 2026; the unit project runs on UTC. */
const NOW = new Date('2026-11-18T10:00:00Z');

interface CardUnderTest extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: Types.Hass;
  readonly updateComplete: Promise<boolean>;
  updateEvents(force?: boolean): Promise<void>;
  requestUpdate(): void;
}

/** A timed event, in UTC, which is the zone this project runs in. */
function timed(summary: string, date: string, from: string, to: string, toDate = date) {
  return {
    summary,
    start: { dateTime: `${date}T${from}:00Z` },
    end: { dateTime: `${toDate}T${to}:00Z` },
  };
}

/** An all-day event, its end date exclusive as Home Assistant sends it. */
function allDay(summary: string, from: string, until: string) {
  return { summary, start: { date: from }, end: { date: until } };
}

const EVENTS = [
  // Friday to Tuesday: across the break between the fourth and fifth rows.
  allDay('Trip', '2026-11-20', '2026-11-25'),
  // One day: a pill.
  allDay('Holiday', '2026-11-26', '2026-11-27'),
  timed('Dentist', '2026-11-12', '14:00', '15:00'),
  // Overnight: a line on each night's day, the later one reading "until".
  timed('Late show', '2026-11-13', '22:30', '01:30', '2026-11-14'),
  // Five on one day, for "+N more".
  timed('Standup', '2026-11-10', '08:00', '08:15'),
  timed('Review', '2026-11-10', '10:00', '11:00'),
  timed('Lunch', '2026-11-10', '12:00', '13:00'),
  timed('Planning', '2026-11-10', '14:00', '15:00'),
  timed('Gym', '2026-11-10', '18:00', '19:00'),
];

function hass(): Types.Hass {
  return {
    states: {
      'calendar.anna': {
        entity_id: 'calendar.anna',
        state: 'off',
        attributes: { friendly_name: 'Anna' },
      },
    },
    locale: { language: 'en', first_weekday: 'monday', time_format: '24' },
    config: { country: 'DE' },
    themes: { darkMode: false },
    entities: {},
    connection: {
      // The card subscribes to every calendar it shows; a Home Assistant before 2026.5 refuses,
      // and the card falls back to asking over REST, which is what this test answers.
      subscribeMessage: vi.fn((_callback: unknown, message: { type: string }) =>
        message.type === 'calendar/event/subscribe'
          ? Promise.reject({ code: 'unknown_command' })
          : Promise.resolve(() => {}),
      ),
      subscribeEvents: vi.fn().mockResolvedValue(() => {}),
    },
    callWS: vi.fn().mockResolvedValue({}),
    localize: (key: string) => key,
    formatEntityState: (_stateObj: unknown, value?: string) => String(value ?? ''),
    callApi: vi.fn((_method: string, path: string) => {
      const query = new URLSearchParams(path.split('?')[1]);
      const from = Date.parse(query.get('start')!);
      const to = Date.parse(query.get('end')!);
      const at = (point: { date?: string; dateTime?: string }) =>
        Date.parse(point.dateTime ?? `${point.date}T00:00:00Z`);
      return Promise.resolve(
        EVENTS.filter((event) => at(event.start) < to && at(event.end) > from).map((event) => ({
          ...event,
        })),
      );
    }),
    callService: vi.fn(),
  } as unknown as Types.Hass;
}

const BASE = {
  view: 'month',
  entities: ['calendar.anna'],
  first_day_of_week: 'monday',
  time_24h: true,
};

async function mount(config: Record<string, unknown> = {}): Promise<CardUnderTest> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig({ ...BASE, ...config });
  card.hass = hass();
  document.body.appendChild(card);
  await card.updateEvents(true);
  await card.updateComplete;
  return card;
}

/** The card's month, or a failure naming what it drew instead. */
function month(card: CardUnderTest): HTMLElement {
  const container = card.shadowRoot!.querySelector<HTMLElement>('.month-container');
  expect(container, card.shadowRoot!.innerHTML.slice(0, 400)).not.toBeNull();
  return container!;
}

/** Text with whitespace collapsed. */
const text = (element: Element | null | undefined): string =>
  (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** Each day's date as drawn, in order. */
const dates = (card: CardUnderTest): string[] =>
  [...month(card).querySelectorAll('.month-week > .month-date')].map((date) => text(date));

/** A day's cell, by its row and column. */
function cell(card: CardUnderTest, row: number, column: number): HTMLElement {
  const week = month(card).querySelectorAll('.month-week')[row];
  return week.querySelectorAll<HTMLElement>('.month-day')[column];
}

/** A day's date, which follows its cell on the row's first line. */
function dateOf(cellElement: HTMLElement): HTMLElement {
  const date = cellElement.nextElementSibling as HTMLElement;
  expect(date.classList.contains('month-date')).toBe(true);
  expect(date.style.gridColumn).toBe(cellElement.style.gridColumn);
  return date;
}

/** A row's lines in one day column, by its CSS grid column. */
function linesIn(week: Element, gridColumn: string): HTMLElement[] {
  return [...week.querySelectorAll<HTMLElement>('.month-line')].filter(
    (line) => line.style.gridColumn === gridColumn,
  );
}

/** The boxes a month is laid out in, in layout pixels, before any scale. */
interface Layout {
  /** The scale an ancestor draws the card at, by a transform or a zoom. */
  readonly scale?: number;
  /** The scale across and down, where a transform sets them apart; each defaults to `scale`. */
  readonly scaleX?: number;
  readonly scaleY?: number;
  /** The first week's height, its rule included. */
  readonly week?: number;
  /**
   * The month's height, to the fraction, where it is not the weekday names and six such weeks: as
   * tall as a card leaves it, or as its floor.
   */
  readonly height?: number;
  /** The rule along the week's top. */
  readonly rule?: number;
  /** The date line, and a line's title and time, each as its probe stands for it. */
  readonly date?: number;
  readonly title?: number;
  readonly time?: number;
}

/** The used heights `layOut` gives boxes, to the fraction, as a browser computes them. */
const usedHeights = new WeakMap<Element, number>();
const computedStyle = window.getComputedStyle;

/**
 * Answers `getComputedStyle` for a box `layOut` gave a used height with that height, its border
 * box, and every other style as declared. Restored after each test.
 */
function answerUsedHeights(): void {
  if (vi.isMockFunction(window.getComputedStyle)) return;
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
    const declared = computedStyle.call(window, element, pseudo);
    const height = pseudo ? undefined : usedHeights.get(element);
    if (height === undefined) return declared;
    return new Proxy(declared, {
      get: (target, key) => {
        if (key === 'height') return `${height}px`;
        if (key === 'boxSizing') return 'border-box';
        const value = Reflect.get(target, key) as unknown;
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  });
}

/**
 * Lays a mounted month out as a browser would at a scale an ancestor applies: every box
 * `getBoundingClientRect` reports is scaled, and the layout sizes are not, as a browser reports
 * them, `offsetHeight` and `clientHeight` rounded to whole pixels and the used height
 * `getComputedStyle` gives to the fraction. The single probe the card measured from before the
 * probes were split is answered too, its width the line pitch and its height the date line, so a
 * measurement that mixes a layout height with scaled boxes reads differently at another scale.
 * The month is 700px wide, its weekday names take the 40px above the first week, and its closing
 * rule is 1px.
 */
function layOut(card: CardUnderTest, layout: Layout = {}): void {
  const { scale = 1, week = 64, rule = 1, date = 22, title = 20, time = 16 } = layout;
  const { scaleX = scale, scaleY = scale } = layout;
  const box = (top: number, height: number, width = 0) =>
    ({
      top: top * scaleY,
      bottom: (top + height) * scaleY,
      height: height * scaleY,
      width: width * scaleX,
    }) as DOMRect;
  const container = month(card);
  const height = layout.height ?? 40 + 6 * week + 1;
  container.getBoundingClientRect = () => box(0, height, 700);
  usedHeights.set(container, height);
  answerUsedHeights();
  for (const [name, value] of [
    ['offsetWidth', 700],
    ['offsetHeight', Math.round(height)],
    ['clientHeight', Math.round(height) - 1],
  ] as const) {
    Object.defineProperty(container, name, { configurable: true, value });
  }
  const row = month(card).querySelector<HTMLElement>('.month-week')!;
  // The week starts 40px down the month, its first cell under its rule.
  row.getBoundingClientRect = () => box(40, week);
  row.querySelector<HTMLElement>('.month-day')!.getBoundingClientRect = () =>
    box(40 + rule, week - rule);
  Object.defineProperty(row, 'clientHeight', {
    configurable: true,
    value: Math.round(week - rule),
  });
  Object.defineProperty(row, 'offsetHeight', { configurable: true, value: Math.round(week) });
  for (const probe of month(card).querySelectorAll<HTMLElement>('.month-probe')) {
    const kind = probe.getAttribute('data-probe');
    const height = kind === 'title' ? title : kind === 'time' ? time : date;
    probe.getBoundingClientRect = () => box(0, height, kind === null ? title : 0);
  }
}

/** Sets the capacity the card would measure, and draws again. */
async function withCapacity(card: CardUnderTest, capacity: number): Promise<void> {
  (card as unknown as { _monthCapacity: number })._monthCapacity = capacity;
  card.requestUpdate();
  await card.updateComplete;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal('localStorage', memoryStorage());
});

afterEach(() => {
  if (vi.isMockFunction(window.getComputedStyle)) vi.mocked(window.getComputedStyle).mockRestore();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('the month grid', () => {
  it('draws six week rows of seven days under the weekday names, Mondays first', async () => {
    const card = await mount();
    const container = month(card);

    expect(card.shadowRoot!.querySelector('ha-card')!.classList.contains('month-view')).toBe(true);
    expect(container.querySelectorAll('.month-week')).toHaveLength(6);
    expect(container.querySelectorAll('.month-day')).toHaveLength(42);
    for (const week of container.querySelectorAll('.month-week')) {
      expect(week.querySelectorAll('.month-day')).toHaveLength(7);
    }
    expect([...container.querySelectorAll('.month-weekday')].map((day) => text(day))).toEqual([
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun',
    ]);
    const drawn = dates(card);
    expect([drawn[0], drawn[6], drawn[7], drawn[41]]).toEqual(['26', 'Nov 1', '2', '6']);
    // The list renderer it replaced draws none of this.
    expect(card.shadowRoot!.querySelector('.day-table')).toBeNull();
  });

  it('starts the rows on Sunday where the week does', async () => {
    const card = await mount({ first_day_of_week: 'sunday' });
    expect([...month(card).querySelectorAll('.month-weekday')].map((day) => text(day))).toEqual([
      'Sun',
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
    ]);
    // November 1, 2026 is a Sunday, so it opens the first row, and six rows run to December 12.
    const drawn = dates(card);
    expect([drawn[0], drawn[29], drawn[30], drawn[41]]).toEqual(['Nov 1', '30', 'Dec 1', '12']);
  });

  it('names the month on each month’s first day, in the card’s language', async () => {
    const card = await mount();
    expect(dates(card).filter((date) => /\D/.test(date))).toEqual(['Nov 1', 'Dec 1']);

    const german = await mount({ language: 'de' });
    expect(dates(german).filter((date) => /\D/.test(date))).toEqual(['1. Nov.', '1. Dez.']);
    // The number is its own element, so today's tile can sit behind it alone.
    const first = dateOf(cell(german, 5, 1));
    expect(text(first.querySelector('.day'))).toBe('1');
    expect(text(first.querySelector('.month-date-month'))).toBe('. Dez.');
  });

  it('dims the days of the months either side of the one the header names', async () => {
    const card = await mount();
    const other = [...month(card).querySelectorAll<HTMLElement>('.month-day.other-month')].map(
      (day) => text(dateOf(day)),
    );
    expect(other).toEqual(['26', '27', '28', '29', '30', '31', 'Dec 1', '2', '3', '4', '5', '6']);
  });

  it('marks today, as the today tile and as the current date', async () => {
    const card = await mount();
    const current = month(card).querySelectorAll('[aria-current="date"]');
    expect(current).toHaveLength(1);
    expect(current[0]).toBe(cell(card, 3, 2));
    expect(current[0].classList.contains('today')).toBe(true);
    expect(text(dateOf(current[0] as HTMLElement).querySelector('.day.today-tile'))).toBe('18');
    expect(month(card).querySelectorAll('.today-tile')).toHaveLength(1);
    // Every day before it is past.
    expect(month(card).querySelectorAll('.month-day.past-day')).toHaveLength(23);
  });

  it('lets each day’s empty space stand for its day, and each event cover it', async () => {
    const card = await mount();
    const slot = (element: Element) =>
      (element as Element & { calendarCardDaySlot?: unknown }).calendarCardDaySlot;
    expect(slot(cell(card, 3, 2))).toEqual({
      kind: 'day',
      timestamp: new Date('2026-11-18T00:00:00Z').getTime(),
    });
    for (const event of month(card).querySelectorAll('.month-bar, .month-line')) {
      expect(slot(event)).toEqual({ kind: 'covered' });
    }
  });
});

describe('events in the cells', () => {
  it('draws a multi-day event as one bar per row, its title repeated where it carries on', async () => {
    const card = await mount({ entities: [{ entity: 'calendar.anna', accent_color: '#3b82f6' }] });
    const bars = [...month(card).querySelectorAll<HTMLElement>('.month-bar')].filter(
      (bar) => text(bar.querySelector('.grid-banner-title')) === 'Trip',
    );
    expect(
      bars.map((bar) => ({
        row: [...month(card).querySelectorAll('.month-week')].indexOf(bar.parentElement!),
        column: bar.style.gridColumn,
        line: bar.style.gridRow,
        before: bar.classList.contains('continues-before'),
        after: bar.classList.contains('continues-after'),
      })),
    ).toEqual([
      { row: 3, column: '5 / span 3', line: '2', before: false, after: true },
      { row: 4, column: '1 / span 2', line: '2', before: true, after: false },
    ]);
    // Grid's banner, filled with its calendar's color and written in its ink, where a line
    // keeps the card's background at the shipped event_background_opacity: 0.
    for (const bar of bars) {
      expect(bar.classList.contains('grid-banner')).toBe(true);
      expect(bar.classList.contains('event')).toBe(true);
      expect(bar.style.backgroundColor).not.toBe('');
      expect(bar.style.getPropertyValue('--calendar-card-color-event')).toBe(
        'var(--calendar-card-accent-ink)',
      );
    }
    const line = month(card).querySelector<HTMLElement>('.month-line')!;
    expect(line.style.backgroundColor).toBe('');
    expect(line.style.getPropertyValue('--calendar-card-color-event')).toBe('');
  });

  it('draws a one-day all-day event as a pill one day long', async () => {
    const card = await mount();
    const pill = [...month(card).querySelectorAll<HTMLElement>('.month-bar')].find(
      (bar) => text(bar) === 'Holiday',
    )!;
    expect(pill.style.gridColumn).toBe('4 / span 1');
    expect(pill.classList.contains('continues-before')).toBe(false);
    expect(pill.classList.contains('continues-after')).toBe(false);
  });

  it('draws a timed event as a line: accent bar, title and start time', async () => {
    const card = await mount();
    const [line] = linesIn(month(card).querySelectorAll('.month-week')[2], '4');
    expect(line.querySelector('.event-accent-bar')).not.toBeNull();
    expect(text(line.querySelector('.month-line-title'))).toBe('Dentist');
    expect(text(line.querySelector('.month-line-time'))).toBe('14:00');
    expect(line.style.gridRow).toBe('2');
    expect(line.classList.contains('past-event')).toBe(true);
  });

  it('gives an overnight event a line on each day, the later one reading until its end', async () => {
    const card = await mount();
    const week = month(card).querySelectorAll('.month-week')[2];
    const parts = [...week.querySelectorAll<HTMLElement>('.month-line')]
      .filter((line) => text(line.querySelector('.month-line-title')) === 'Late show')
      .map((line) => [line.style.gridColumn, text(line.querySelector('.month-line-time'))]);
    expect(parts).toEqual([
      ['5', '22:30'],
      ['6', 'until 1:30'],
    ]);
  });

  it('shows a day whole while it fits, and "+N more" in its last line once it does not', async () => {
    const card = await mount();
    const week = () => month(card).querySelectorAll('.month-week')[2];
    const titles = () =>
      linesIn(week(), '2').map((line) => text(line.querySelector('.month-line-title')));

    // Five on four lines: three and "+2 more".
    expect(titles()).toEqual(['Standup', 'Review', 'Lunch']);
    let more = week().querySelectorAll<HTMLButtonElement>('.month-more');
    expect([...more].map((button) => text(button))).toEqual(['+2 more']);
    expect(more[0].style.gridColumn).toBe('2');
    expect(more[0].style.gridRow).toBe('5');
    expect(more[0].getAttribute('aria-label')).toBe('+2 more, Tuesday, November 10');
    expect(more[0].type).toBe('button');

    await withCapacity(card, 2);
    expect(titles()).toEqual(['Standup']);
    more = week().querySelectorAll<HTMLButtonElement>('.month-more');
    expect([...more].map((button) => [text(button), button.style.gridRow])).toEqual([
      ['+4 more', '3'],
    ]);

    await withCapacity(card, 5);
    expect(titles()).toEqual(['Standup', 'Review', 'Lunch', 'Planning', 'Gym']);
    expect(week().querySelectorAll('.month-more')).toHaveLength(0);
  });

  it('keeps a press on "+N more" from reaching the card', async () => {
    const card = await mount();
    const more = month(card).querySelector<HTMLButtonElement>('.month-more')!;
    const reached = vi.fn();
    card.shadowRoot!.querySelector('ha-card')!.addEventListener('pointerdown', reached);
    card.shadowRoot!.querySelector('ha-card')!.addEventListener('click', reached);
    more.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    more.click();
    expect(reached).not.toHaveBeenCalled();
  });

  it('lays each row out for as many lines as it measures under a date', async () => {
    const card = await mount();
    // A week 64px tall under a 1px rule, a 22px date line and a line pitch of 20px.
    layOut(card);

    card.requestUpdate();
    await card.updateComplete;
    await card.updateComplete;

    // (63 - 22) / 20 is two lines.
    const week = month(card).querySelectorAll<HTMLElement>('.month-week')[2];
    expect(week.style.gridTemplateRows).toBe('auto repeat(2, auto) minmax(0, 1fr)');
    expect([...week.querySelectorAll('.month-more')].map((button) => text(button))).toEqual([
      '+4 more',
    ]);
  });
});

describe('the capacity the card measures', () => {
  it('reads the same lines whatever scale an ancestor draws the card at', async () => {
    const card = await mount();
    const at = (scale: number) => {
      layOut(card, { scale });
      return MonthRender.measureMonthCapacity(card.shadowRoot!);
    };
    // (63 - 22) / 20 is two lines, at full size, at half and at four fifths: every box scales
    // alike, so the scale cancels.
    expect([at(1), at(0.5), at(0.8)]).toEqual([2, 2, 2]);
  });

  it('takes the line pitch from the time where it is set taller than the title', async () => {
    const card = await mount();
    layOut(card, { time: 24 });
    // (63 - 22) / 24 is one line, where the title's 20px would have held two.
    expect(MonthRender.measureMonthCapacity(card.shadowRoot!)).toBe(1);
  });

  it('leaves the week’s rule out of the room under the date', async () => {
    const card = await mount();
    // 62.5px tall with its rule, 61.5px under it: half a pixel short of a second line.
    layOut(card, { week: 62.5 });
    expect(MonthRender.measureMonthCapacity(card.shadowRoot!)).toBe(1);
  });

  it('reads nothing from a month that is not laid out', async () => {
    const card = await mount();
    // happy-dom's own boxes are empty, as a hidden card's are.
    expect(MonthRender.measureMonthCapacity(card.shadowRoot!)).toBeNull();
  });

  it('measures three hidden boxes, each one class and no children, in a wide month only', async () => {
    const card = await mount();
    const probes = [...card.shadowRoot!.querySelectorAll('.month-probe')];
    expect(
      probes.map((probe) => [
        probe.localName,
        probe.getAttribute('class'),
        probe.getAttribute('data-probe'),
        probe.getAttribute('aria-hidden'),
        probe.childNodes.length,
        probe.parentElement === month(card),
      ]),
    ).toEqual([
      ['div', 'month-probe', 'date', 'true', 0, true],
      ['div', 'month-probe', 'title', 'true', 0, true],
      ['div', 'month-probe', 'time', 'true', 0, true],
    ]);
  });

  it('marks the date probe to leave the month out where no 1st draws it', async () => {
    /** Whether a 1st draws its month, and each probe's kind, mark and children. */
    const drawn = async (config: Record<string, unknown>) => {
      document.body.replaceChildren();
      const card = await mount(config);
      return [
        month(card).querySelector('.month-date-month') !== null,
        ...[...month(card).querySelectorAll('.month-probe')].map((probe) => [
          probe.getAttribute('data-probe'),
          probe.getAttribute('data-month'),
          probe.childNodes.length,
        ]),
      ];
    };
    const unmarked = [
      ['date', null, 0],
      ['title', null, 0],
      ['time', null, 0],
    ];
    const marked = [['date', 'none', 0], ...unmarked.slice(1)];
    // The month's own show_month decides, as it decides whether a 1st draws its month.
    expect(await drawn({})).toEqual([true, ...unmarked]);
    expect(await drawn({ show_month: false })).toEqual([false, ...marked]);
    expect(await drawn({ month: { show_month: false } })).toEqual([false, ...marked]);
    expect(await drawn({ show_month: false, month: { show_month: true } })).toEqual([
      true,
      ...unmarked,
    ]);
  });
});

describe('the line pitch and the date line the card measures', () => {
  /** A rule's declarations, by property, for one exact selector. */
  const rule = (selector: string): Record<string, string> =>
    Object.fromEntries(
      declarations(cardStyles.cssText)
        .filter((d) => d.at.length === 0 && d.selectors.length === 1 && d.selectors[0] === selector)
        .map((d) => [d.property, d.value]),
    );

  it('are a line’s title and time and the date, each in the font it is set in', () => {
    const probe = (name: string) => rule(`.month-probe[data-probe='${name}']`);
    // Hidden, taking no room and no press, each as tall as what it stands for.
    expect(rule('.month-probe')).toEqual({
      position: 'absolute',
      top: '0',
      'inset-inline-start': '0',
      visibility: 'hidden',
      'pointer-events': 'none',
    });
    // A line: its 1.2em line box, 0.25px of padding and 0.5px of margin above and below, as
    // tall as the taller of its title and its time, each in its own font. A bar takes the same.
    expect(probe('title')).toEqual({
      height: 'calc(1.2em + 1.5px)',
      'font-size': 'var(--calendar-card-font-size-event)',
    });
    expect(probe('time')).toEqual({
      height: 'calc(1.2em + 1.5px)',
      'font-size': 'var(--calendar-card-font-size-time)',
    });
    expect(rule('.month-line')).toMatchObject({
      'line-height': '1.2',
      'padding-block': '0.25px',
      margin: '0.5px 3px',
    });
    expect(rule('.month-line-title')['font-size']).toBe('var(--calendar-card-font-size-event)');
    expect(rule('.month-line-time')['font-size']).toBe('var(--calendar-card-font-size-time)');
    // A bar takes the same, over the 1px Grid's banner pads, and its title's line box is 1.2em.
    expect(rule('.month-bar')).toEqual({ margin: '0.5px 3px', 'padding-block': '0.25px' });
    expect(rule('.grid-banner').padding).toBe('1px 6px');
    expect(rule('.grid-banner-title')).toMatchObject({
      'font-size': 'var(--calendar-card-font-size-event)',
      'line-height': '1.2',
    });
    // The date: the tile's 1.2em with 4px above and 2px below, in the day's size dates are set
    // in. The line sets no size of its own; an empty strut in the day's size makes it 1.2em tall,
    // and the number and the 1st's month each take their own option, the month's line box 1em
    // tall in its size, which a large month makes the taller of the two.
    expect(rule('.month-date')).toMatchObject({
      display: 'flex',
      'align-items': 'center',
      padding: '4px 6px 2px',
      'line-height': '1',
    });
    expect(rule('.month-date')).not.toHaveProperty('font-size');
    expect(rule('.month-date')).not.toHaveProperty('height');
    expect(rule('.month-date::before')).toEqual({
      content: "''",
      height: '1.2em',
      'font-size': 'var(--calendar-card-font-size-day)',
    });
    expect(rule('.month-date > .day')['font-size']).toBe('var(--calendar-card-font-size-day)');
    expect(rule('.month-date-month')['font-size']).toBe('var(--calendar-card-font-size-month)');
    // Its probe is laid out as a 1st's date line is, the same padding above and below and two
    // struts centered across it: the day's, and one as tall as the month's line box. Every week
    // is counted as holding the month, so one capacity holds for all six. Each strut sets its
    // own size, as the parts it stands for do, so a keyword or a percentage resolves against what
    // theirs does, and the probe sets none.
    expect(probe('date')).toEqual({
      display: 'flex',
      'align-items': 'center',
      'padding-block': '4px 2px',
    });
    expect(rule(".month-probe[data-probe='date']::before")).toEqual(rule('.month-date::before'));
    expect(rule(".month-probe[data-probe='date']::after")).toEqual({
      content: "''",
      height: '1em',
      'font-size': 'var(--calendar-card-font-size-month)',
    });
    // Where no 1st draws its month, show_month off, the probe drops that strut, so the month's
    // size costs the weeks nothing.
    expect(rule(".month-probe[data-probe='date'][data-month='none']::after")).toEqual({
      content: 'none',
    });
  });
});

describe('the sizes a month’s text is set in', () => {
  /** A custom property as an element's own style writes it, or undefined. */
  const own = (element: Element, property: string): string | undefined =>
    new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+)`)
      .exec(element.getAttribute('style') ?? '')?.[1]
      .trim();
  const sizes = (element: Element) =>
    [
      '--calendar-card-font-size-event',
      '--calendar-card-font-size-time',
      '--calendar-card-font-size-day',
      '--calendar-card-font-size-month',
    ].map((property) => own(element, property));

  it('sets its days’ lines in the cell sizes, and its dates and everything else in the card’s', async () => {
    const card = await mount();
    // The card writes the list's 14px and 12px, which a day's list and the panel read, the
    // month's 13px day number and the 12px month on a 1st.
    expect(sizes(card.shadowRoot!.querySelector('ha-card')!)).toEqual([
      '14px',
      '12px',
      '13px',
      '12px',
    ]);
    // The wide month writes its cells' 10px and 8.5px over them, for the lines, the bars and "+N
    // more" inside it, and leaves the dates' sizes to the card.
    expect(sizes(month(card))).toEqual(['10px', '8.5px', undefined, undefined]);
    card.remove();
  });

  it('takes the cell sizes and the date sizes from the month block', async () => {
    const card = await mount({
      day_font_size: '30px',
      month: {
        cell_event_font_size: '1rem',
        cell_time_font_size: '0.75rem',
        day_font_size: '18px',
        month_font_size: '0.8em',
      },
    });
    expect(sizes(card.shadowRoot!.querySelector('ha-card')!)).toEqual([
      '14px',
      '12px',
      '18px',
      '0.8em',
    ]);
    expect(sizes(month(card))).toEqual(['1rem', '0.75rem', undefined, undefined]);
    card.remove();
  });
});

describe('the rows’ height', () => {
  /** A rule's declarations, by property, for one exact selector, spaces inside brackets closed. */
  const rule = (selector: string): Record<string, string> =>
    Object.fromEntries(
      declarations(cardStyles.cssText)
        .filter((d) => d.at.length === 0 && d.selectors.length === 1 && d.selectors[0] === selector)
        .map((d) => [d.property, d.value.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')')]),
    );

  /** The floors the card wrote on the month, a week's and the whole month's. */
  const floors = (card: CardUnderTest) =>
    [MonthRender.MONTH_FLOOR_PROPERTIES.week, MonthRender.MONTH_FLOOR_PROPERTIES.month].map(
      (property) => month(card).style.getPropertyValue(property),
    );

  it('shares the content area among six weeks, each at least its floor, none sized by events', () => {
    // The content area takes what the header leaves of the card, whatever height and max_height
    // say, and scrolls only below the floors. Only a compact month whose list grows under a cap
    // writes the property, for a card of no height of its own (month-sizing.test.ts).
    expect(rule('.calendar-card-pro.month-view .content-container')).toEqual({
      display: 'flex',
      flex: 'var(--calendar-card-month-content-flex, 1 1 0)',
      'flex-direction': 'column',
      'min-height': '0',
      height: 'auto',
      'max-height': 'none',
    });
    // Never a bare 1fr, and never a basis from the content: either would let a week's lines size
    // the week the capacity is read from. Until the card has measured, the floors are reckoned in
    // em: a 1.2em date line and 6px, a 1.2em line and 1.5px, the 1px rule over each week.
    expect(rule('.month-container')).toMatchObject({
      display: 'grid',
      flex: '1 1 0',
      'min-height': 'var(--calendar-card-month-min, calc(6 * (2.4em + 8.5px) + 1.2em + 4px))',
      'grid-template-rows':
        'auto repeat(6, minmax(var(--calendar-card-month-week-min, calc(2.4em + 8.5px)), 1fr))',
    });
    // The wide month's last week ends at the card's edge with no rule of its own.
    expect(rule('.month-container')['border-block-end']).toBeUndefined();
    // The compact form's weeks are as tall as their days, and a rule sets them off from the
    // day's list.
    expect(rule('.month-container.month-compact')).toMatchObject({
      flex: 'none',
      'min-height': '0',
      'grid-template-rows': 'auto repeat(6, auto)',
      'border-block-end': '1px solid var(--calendar-card-month-rule)',
    });
  });

  it('takes nothing from height or max_height', async () => {
    const card = await mount({ height: '600px', max_height: '300px' });
    const style = month(card).style;
    expect([
      style.height,
      style.minHeight,
      style.maxHeight,
      style.getPropertyValue('--calendar-card-month-row-height'),
    ]).toEqual(['', '', '', '']);
    // The card is the month's own default height instead (month-sizing.test.ts).
    expect(card.shadowRoot!.querySelector<HTMLElement>('ha-card')!.style.height).toBe('632px');
  });

  it('floors a week at its date and one line, and the month at six, at any scale', async () => {
    const card = await mount();
    // happy-dom lays nothing out, as a hidden card is not: nothing is written.
    expect(floors(card)).toEqual(['', '']);

    const at = async (layout: Layout) => {
      layOut(card, layout);
      card.requestUpdate();
      await card.updateComplete;
      return floors(card);
    };
    // A 22px date line, a 20px line and the 1px rule make a 43px week; the 40px of weekday names,
    // six such weeks and the 1px closing rule a 299px month. Every box scales alike, so the scale
    // cancels.
    expect(await at({ scale: 1 })).toEqual(['43px', '299px']);
    expect(await at({ scale: 0.5 })).toEqual(['43px', '299px']);
    expect(await at({ scale: 0.8 })).toEqual(['43px', '299px']);
    // A transform that scales one way alone: the heights are read against the month's height.
    expect(await at({ scaleX: 1, scaleY: 0.75 })).toEqual(['43px', '299px']);
    expect(await at({ scaleX: 0.75, scaleY: 1 })).toEqual(['43px', '299px']);
    expect(await at({ scaleX: 1, scaleY: 1.5 })).toEqual(['43px', '299px']);
    // A time set taller than the title is the line, as the capacity takes it.
    expect(await at({ time: 24 })).toEqual(['47px', '323px']);
  });

  it('reads the same floors whatever fraction of a pixel the month is tall', async () => {
    const card = await mount();
    const at = async (height: number) => {
      layOut(card, { scale: 0.75, height });
      card.requestUpdate();
      await card.updateComplete;
      return floors(card);
    };
    // A card that leaves the month 303.6px, which offsetHeight rounds to 304px: the month is that
    // tall or as tall as its floor, whichever is taller. Read against 304px the scale was 0.749,
    // which wrote a 44px week and a 306px month; at 306px it read 0.75 and wrote 43px and 299px,
    // which let the month back to 303.6px, and so on for good.
    let height = 303.6;
    const passes: string[][] = [];
    for (let pass = 0; pass < 4; pass += 1) {
      passes.push(await at(height));
      height = Math.max(303.6, Number.parseFloat(passes[pass][1]));
    }
    expect(passes).toEqual(Array.from({ length: 4 }, () => ['43px', '299px']));
    // Either side of a half pixel and a whole one, the same.
    for (const fraction of [303.4, 303.5, 303.6, 304, 306, 310.7]) {
      expect(await at(fraction)).toEqual(['43px', '299px']);
    }
  });

  it('writes the floors only when they change', async () => {
    const card = await mount();
    layOut(card);
    card.requestUpdate();
    await card.updateComplete;
    const write = vi.spyOn(month(card).style, 'setProperty');
    card.requestUpdate();
    await card.updateComplete;
    // The render writes the tints again, as styleMap does; the card leaves the floors alone.
    const names: ReadonlyArray<string> = Object.values(MonthRender.MONTH_FLOOR_PROPERTIES);
    const floorWrites = write.mock.calls.filter(([property]) => names.includes(property));
    expect(floorWrites).toEqual([]);
    expect(floors(card)).toEqual(['43px', '299px']);
  });
});

describe('a representative month', () => {
  it('matches its snapshot', async () => {
    const card = await mount({
      entities: [{ entity: 'calendar.anna', accent_color: '#3b82f6' }],
      show_week_numbers: 'iso',
    });
    const markup = month(card)
      .outerHTML.replace(/<!--\?lit\$[0-9]+\$-->/g, '')
      .replace(/<!---->/g, '')
      .replace(/>\s+</g, '>\n<')
      .trim();
    expect(markup).toMatchSnapshot();
  });
});
