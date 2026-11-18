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
    const probe = month(card).querySelector<HTMLElement>('.month-probe')!;
    const firstWeek = month(card).querySelector<HTMLElement>('.month-week')!;
    // A line pitch of 20px and a date line of 22px.
    probe.getBoundingClientRect = () => ({ width: 20, height: 22 }) as DOMRect;
    Object.defineProperty(firstWeek, 'clientHeight', { configurable: true, value: 63 });

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

describe('the line pitch and the date line the card measures', () => {
  /** A rule's declarations, by property, for one exact selector. */
  const rule = (selector: string): Record<string, string> =>
    Object.fromEntries(
      declarations(cardStyles.cssText)
        .filter((d) => d.at.length === 0 && d.selectors.length === 1 && d.selectors[0] === selector)
        .map((d) => [d.property, d.value]),
    );

  it('are a line’s height and the date’s, in the font both are set in', () => {
    const probe = rule('.month-probe');
    expect(probe['font-size']).toBe('var(--calendar-card-font-size-event)');
    // A line: the title's 1.2em line box, 1px of padding and 1px of margin above and below.
    expect(probe.width).toBe('calc(1.2em + 4px)');
    expect(rule('.month-line')).toMatchObject({
      'line-height': '1.2',
      'padding-block': '1px',
      margin: '1px 3px',
    });
    expect(rule('.month-line-title')['font-size']).toBe('var(--calendar-card-font-size-event)');
    // A bar takes the same: Grid's banner pads 1px, its title's line box is 1.2em.
    expect(rule('.month-bar').margin).toBe('1px 3px');
    expect(rule('.grid-banner').padding).toBe('1px 6px');
    expect(rule('.grid-banner-title')).toMatchObject({
      'font-size': 'var(--calendar-card-font-size-event)',
      'line-height': '1.2',
    });
    // The date: the tile's 1.2em with 4px above and 2px below.
    expect(probe.height).toBe('calc(1.2em + 6px)');
    expect(rule('.month-date')).toMatchObject({
      'font-size': 'var(--calendar-card-font-size-event)',
      height: '1.2em',
      padding: '4px 6px 2px',
    });
  });
});

describe('the rows’ height', () => {
  it('is row_height, whatever the rows hold', async () => {
    const card = await mount();
    expect(month(card).style.getPropertyValue('--calendar-card-month-row-height')).toBe('112px');

    const taller = await mount({ month: { row_height: '9em' } });
    expect(month(taller).style.getPropertyValue('--calendar-card-month-row-height')).toBe('9em');
  });

  it('is a share of a fixed card height, which row_height does not change', async () => {
    const card = await mount({ height: '600px', month: { row_height: '9em' } });
    expect(month(card).style.getPropertyValue('--calendar-card-month-row-height')).toBe(
      'minmax(0, 1fr)',
    );
    // The month is exactly as tall as the height it fills, through its bounds.
    expect([month(card).style.minHeight, month(card).style.maxHeight]).toEqual(['100%', '100%']);
  });

  it('never takes its height from the weeks, even where a fixed height cannot be worked out', async () => {
    // A percentage of a box with no height of its own resolves to nothing, and the bounds above
    // with it. Then the month is six times row_height rather than as tall as its weeks' events:
    // sized by them, an empty week had no room for a line, so the capacity read from it was 0,
    // and a month laid out for 0 lines drew no event anywhere, and stayed that way.
    const card = await mount({ height: '100%', month: { row_height: '9em' } });
    expect(month(card).style.height).toBe('calc(6 * 9em)');
    expect([month(card).style.minHeight, month(card).style.maxHeight]).toEqual(['100%', '100%']);
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
