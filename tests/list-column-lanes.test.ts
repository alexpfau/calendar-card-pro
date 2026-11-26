import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW } from './fixtures';
import type { PopoverRequest } from './popover-spy';
import type * as Types from '../src/config/types';
import { EVENT_POPOVER_TAG } from '../src/rendering/event-popover';
import '../src/calendar-card-pro';

vi.mock('../src/utils/logger', () => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  setLogLevel: vi.fn(),
  initializeLogger: vi.fn(),
  printVersionInfo: vi.fn(),
}));

/**
 * Calendar lanes in List and Columns (backlog item 25, #203, #201): List draws a column per lane
 * beside its dates, Columns a row per lane across its days, each lane under a header naming it.
 * The card is mounted whole and its width reported through `fitToWidth`, so the fit, the scroll,
 * the fallback and the swipe are the card's own. Grid's lanes are `grid-lanes.test.ts`; which
 * lanes there are and how wide they need to be is `lanes.test.ts`. The unit project runs in UTC.
 */

interface Card extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  fitToWidth(widthPx: number): void;
  hass: Types.Hass;
  readonly updateComplete: Promise<boolean>;
}

const ANNA = 'calendar.anna';
const ANNA_WORK = 'calendar.anna_work';
const BEN = 'calendar.ben';
const state = (id: string, name: string) => ({
  entity_id: id,
  state: 'off',
  attributes: { friendly_name: name, supported_features: 7 },
});
const STATES = {
  [ANNA]: state(ANNA, 'Anna'),
  [ANNA_WORK]: state(ANNA_WORK, 'Anna Work'),
  [BEN]: state(BEN, 'Ben'),
};

const timed = (summary: string, day: number, from: string, to: string) => ({
  summary,
  start: { dateTime: `2026-06-${day}T${from}:00Z` },
  end: { dateTime: `2026-06-${day}T${to}:00Z` },
});
/** Dinner is on Anna's calendar and on Ben's, the event two lanes share. */
const EVENTS: Record<string, unknown[]> = {
  [ANNA]: [timed('Dentist', 17, '14:00', '15:00'), timed('Dinner', 17, '18:00', '19:00')],
  [ANNA_WORK]: [timed('Standup', 17, '11:00', '11:30')],
  [BEN]: [timed('Football', 17, '16:00', '17:00'), timed('Dinner', 17, '18:00', '19:00')],
};

/** Anna's two calendars share her lane; Ben keeps his own. */
const ENTITIES = [
  { entity: ANNA, lane: 'Anna', label: '🎒' },
  { entity: ANNA_WORK, lane: 'Anna', label: '💼' },
  BEN,
];

async function mount(config: Record<string, unknown> = {}, width = 1200) {
  const card = document.createElement('calendar-card-pro-dev') as unknown as Card;
  card.setConfig({
    entities: ENTITIES,
    days_to_show: 2,
    show_empty_days: true,
    filter_duplicates: true,
    view: 'list',
    lanes: true,
    ...config,
  });
  card.hass = {
    states: STATES as unknown as Types.Hass['states'],
    locale: { language: 'en', time_format: '24' },
    callApi: vi.fn(async (_method: string, path: string) => {
      const id = Object.keys(EVENTS).find((each) => path.includes(`${each}?`));
      return id ? EVENTS[id] : [];
    }),
    callService: vi.fn(),
    localize: (key: string) => key,
  } as unknown as Types.Hass;

  const dialogs: PopoverRequest[] = [];
  card.addEventListener('show-dialog', (ev) =>
    dialogs.push((ev as Event & { detail: PopoverRequest }).detail),
  );
  document.body.appendChild(card);
  await vi.waitFor(() => expect(card.shadowRoot?.textContent).toContain('Football'));
  await resize(card, width);
  return { card, dialogs };
}

async function resize(card: Card, width: number) {
  card.fitToWidth(width);
  await card.updateComplete;
  await card.updateComplete;
}

const $ = (card: Card, selector: string) => card.shadowRoot!.querySelector<HTMLElement>(selector);
const $$ = (card: Card, selector: string) =>
  Array.from(card.shadowRoot!.querySelectorAll<HTMLElement>(selector));
const text = (element: Element | null | undefined) =>
  (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
/** Each event's title in an element, in order. */
const titles = (element: Element) =>
  Array.from(element.querySelectorAll('.event-title')).map((title) => text(title));

function pointer(target: EventTarget, type: string): void {
  const ev = new Event(type, { bubbles: true, composed: true, cancelable: true });
  target.dispatchEvent(
    Object.assign(ev, {
      pointerId: 1,
      button: 0,
      isPrimary: true,
      pointerType: 'mouse',
      clientX: 10,
      clientY: 10,
    }),
  );
}

/** The calendar each new-event popover opened in. */
const startedIn = (dialogs: PopoverRequest[]) =>
  dialogs
    .filter(
      ({ dialogTag, dialogParams }) =>
        dialogTag === EVENT_POPOVER_TAG && dialogParams.mode === 'new',
    )
    .map(({ dialogParams }) => dialogParams.calendarId);

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(FROZEN_NOW);
});

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('a list drawing lanes', () => {
  it('draws a column per lane beside the dates, each event in its entry’s lane', async () => {
    const { card } = await mount();

    expect($$(card, '.lane-heads > .lane-header .lane-name').map(text)).toEqual(['Anna', 'Ben']);
    const [first, second] = $$(card, '.lane-matrix > .lane-day');
    expect(first.classList.contains('today')).toBe(true);
    expect(second.classList.contains('tomorrow')).toBe(true);
    // The date, then a cell per lane in the lanes' order, each placed in its own column.
    const cells = Array.from(first.querySelectorAll<HTMLElement>(':scope > .lane-cell'));
    expect(first.firstElementChild?.classList.contains('date-column')).toBe(true);
    expect(cells.map((cell) => cell.dataset.lane)).toEqual(['Anna', BEN]);
    expect(cells.map((cell) => cell.style.getPropertyValue('grid-area'))).toEqual([
      '1 / 2',
      '1 / 3',
    ]);
    // Anna's lane holds both her calendars, Ben's his own; the date is drawn once, beside them.
    expect(titles(cells[0])).toEqual(['Standup', 'Dentist', 'Dinner']);
    expect(titles(cells[1])).toEqual(['Football', 'Dinner']);
    expect(first.querySelectorAll('.lane-cell .date-column')).toHaveLength(0);
  });

  it('shows an event two lanes share in each, and merges copies only within one lane', async () => {
    const { card } = await mount();
    expect(
      $$(card, '.lane-day.today .event-title').filter((each) => text(each) === 'Dinner'),
    ).toHaveLength(2);

    // Without lanes, the same card merges the two copies into one row.
    const plain = await mount({ lanes: false });
    expect(
      $$(plain.card, '.day-table.today .event-title').filter((each) => text(each) === 'Dinner'),
    ).toHaveLength(1);
    expect($(plain.card, '.lane-matrix')).toBeNull();
  });

  it('leaves out the label its header shows, and keeps a calendar’s own', async () => {
    const { card } = await mount();
    const head = $$(card, '.lane-heads > .lane-header')[0];
    expect(text(head.querySelector('.lane-label'))).toBe('🎒');
    // Anna's own events carry no 🎒 under the header that shows it; her work's keep 💼.
    const anna = $$(card, '.lane-day.today > .lane-cell')[0];
    const labelOf = (title: string) =>
      Array.from(anna.querySelectorAll('.event'))
        .find((event) => text(event.querySelector('.event-title')) === title)!
        .querySelector('.calendar-label');
    expect(labelOf('Dentist')).toBeNull();
    expect(text(labelOf('Standup'))).toBe('💼');
    // Ben has no label: his header draws his initial.
    expect(text($$(card, '.lane-heads > .lane-header')[1].querySelector('.lane-initial'))).toBe(
      'B',
    );
  });

  it('lays a day’s notice across the empty lanes, which a press reaches through it', async () => {
    const { card } = await mount();
    const empty = $$(card, '.lane-matrix > .lane-day')[1];
    const across = empty.querySelector('.lane-across.lane-over');
    expect(text(across)).toContain('No events');
    // The lanes stay in their places under it, empty, each the place a press there adds in.
    expect(
      Array.from(empty.querySelectorAll<HTMLElement>(':scope > .lane-cell[data-lane]')).map(
        (cell) => [
          cell.dataset.lane,
          cell.style.getPropertyValue('grid-area'),
          cell.children.length,
        ],
      ),
    ).toEqual([
      ['Anna', '1 / 2', 0],
      [BEN, '1 / 3', 0],
    ]);
  });

  it('describes each event by its day and its lane’s name', async () => {
    const { card } = await mount({ event_tap_action: { action: 'details' } });
    const ben = $$(card, '.lane-day.today > .lane-cell')[1];
    const button = ben.querySelector('.event-button')!;
    const [day, lane] = button.getAttribute('aria-describedby')!.split(' ');
    expect(text(card.shadowRoot!.getElementById(day))).toContain('17');
    expect(text(card.shadowRoot!.getElementById(lane))).toBe('Ben');
  });

  it('starts an event pressed in a lane’s empty part in that lane’s calendar', async () => {
    const { card, dialogs } = await mount({ day_tap_action: { action: 'add-event' } });
    const [anna, ben] = $$(card, '.lane-matrix > .lane-day')[1].querySelectorAll(
      ':scope > .lane-cell[data-lane]',
    );

    pointer(ben, 'pointerdown');
    pointer(ben, 'pointerup');
    await vi.advanceTimersByTimeAsync(0);
    pointer(anna, 'pointerdown');
    pointer(anna, 'pointerup');
    await vi.advanceTimersByTimeAsync(0);

    expect(startedIn(dialogs)).toEqual([BEN, ANNA]);
  });

  it('scrolls its lanes under the dates where they no longer fit, and stops swiping then', async () => {
    // Two lanes need 24 + 65.5 + 2 × 96 + 6 = 287.5px; a fresh card enters at 303.5px.
    const toolbar = { show: true, navigation: true };
    const { card } = await mount({ toolbar }, 1200);
    const haCard = () => $(card, 'ha-card')!;
    const tracks = () => $(card, '.lane-matrix')!.style.gridTemplateColumns;

    expect(tracks()).toBe('max-content repeat(2, minmax(0, 1fr))');
    expect(haCard().classList.contains('lanes-scroll')).toBe(false);
    expect(haCard().classList.contains('swipe-paging')).toBe(true);

    await resize(card, 260);
    expect(tracks()).toBe('max-content repeat(2, minmax(96px, 1fr))');
    expect($(card, '.lane-matrix')!.classList.contains('lane-matrix-scrolls')).toBe(true);
    expect(haCard().classList.contains('lanes-scroll')).toBe(true);
    expect(haCard().classList.contains('swipe-paging')).toBe(false);
  });

  it('keeps how it draws its lanes within the hysteresis band', async () => {
    const { card } = await mount({}, 1200);
    const scrolls = () => $(card, 'ha-card')!.classList.contains('lanes-scroll');

    await resize(card, 272);
    expect(scrolls()).toBe(false);
    await resize(card, 271);
    expect(scrolls()).toBe(true);
    await resize(card, 303);
    expect(scrolls()).toBe(true);
    await resize(card, 304);
    expect(scrolls()).toBe(false);
  });

  it('draws the plain list where its lanes no longer fit under `lanes_fallback: list`', async () => {
    const { card } = await mount({ list: { lanes_fallback: 'list' } }, 260);

    expect($(card, '.lane-matrix')).toBeNull();
    expect($(card, 'ha-card')!.classList.contains('lanes-scroll')).toBe(false);
    // A plain list again, which merges the shared dinner into one row as it always has.
    expect(
      $$(card, '.day-table.today .event-title').filter((each) => text(each) === 'Dinner'),
    ).toHaveLength(1);

    await resize(card, 1200);
    expect($(card, '.lane-matrix')).not.toBeNull();
  });

  it('merges as the plain list when that fallback’s lanes are on in `list:` alone', async () => {
    // Grouping resolves the `list:` block again, which must not turn the lanes back on there.
    const { card } = await mount(
      { lanes: false, list: { lanes: true, lanes_fallback: 'list' } },
      260,
    );

    expect($(card, '.lane-matrix')).toBeNull();
    expect(
      $$(card, '.day-table.today .event-title').filter((each) => text(each) === 'Dinner'),
    ).toHaveLength(1);
  });

  it('fits a card first measured inside the hysteresis band as a fresh one', async () => {
    // Drawn side by side before any width, a card first measured at 280px enters at 303.5px.
    const { card } = await mount({}, 280);
    expect($(card, 'ha-card')!.classList.contains('lanes-scroll')).toBe(true);
  });

  it('fits its lanes against the date column as drawn, not as estimated', async () => {
    // A date column drawn 148px wide needs 24 + 168 + 2 × 96 + 6 = 390px, entered at 406px; the
    // estimate's 287.5px would have drawn the lanes side by side at 350px.
    const real = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
      const style = real(element, pseudo);
      if (!element.classList.contains('date-column')) return style;
      return new Proxy(style, {
        get: (target, key) => (key === 'width' ? '148px' : Reflect.get(target, key)),
      });
    });
    const { card } = await mount({}, 350);
    expect($(card, 'ha-card')!.classList.contains('lanes-scroll')).toBe(true);
  });

  it('groups each lane’s events on a day under its header’s name', async () => {
    const { card } = await mount();
    const [anna, ben] = $$(card, '.lane-day.today > .lane-cell');
    for (const [cell, name] of [
      [anna, 'Anna'],
      [ben, 'Ben'],
    ] as const) {
      expect(cell.getAttribute('role')).toBe('group');
      expect(text(card.shadowRoot!.getElementById(cell.getAttribute('aria-labelledby')!))).toBe(
        name,
      );
    }
    // An empty lane holds nothing to group.
    const empty = $$(card, '.lane-matrix > .lane-day')[1].querySelector('.lane-cell[data-lane]')!;
    expect(empty.hasAttribute('role')).toBe(false);
    expect(empty.hasAttribute('aria-labelledby')).toBe(false);
  });

  it('heads a lane with the first label it can draw, and leaves out only that, drawn alike', async () => {
    const icon = 'mdi:briefcase';
    // The first entry draws no label, so the header takes the second's icon.
    const skipped = await mount({
      entities: [
        { entity: ANNA, lane: 'Anna', label: icon, label_type: 'none' },
        { entity: ANNA_WORK, lane: 'Anna', label: icon },
        BEN,
      ],
    });
    const head = $$(skipped.card, '.lane-heads > .lane-header')[0];
    expect(head.querySelector('ha-icon')?.getAttribute('icon')).toBe(icon);
    expect(head.querySelector('.lane-initial')).toBeNull();

    // The header draws the value as text; the work calendar's icon is another label, and stays.
    const text_ = await mount({
      entities: [
        { entity: ANNA, lane: 'Anna', label: icon, label_type: 'text' },
        { entity: ANNA_WORK, lane: 'Anna', label: icon },
        BEN,
      ],
    });
    const anna = $$(text_.card, '.lane-day.today > .lane-cell')[0];
    const eventOf = (title: string) =>
      Array.from(anna.querySelectorAll('.event')).find(
        (event) => text(event.querySelector('.event-title')) === title,
      )!;
    expect(eventOf('Standup').querySelector('ha-icon')?.getAttribute('icon')).toBe(icon);
    expect(eventOf('Dentist').querySelector('.calendar-label')).toBeNull();
  });

  it('is each layout’s own: lanes in List alone, none in Columns or Month', async () => {
    const only = { lanes: false, list: { lanes: true } };
    const list = await mount(only);
    expect($(list.card, '.lane-matrix')).not.toBeNull();
    const column = await mount({ ...only, view: 'column' });
    expect($(column.card, '.column-grid')!.classList.contains('with-lanes')).toBe(false);
    // On for the card, a month still draws none: a day there has no room to divide.
    const month = await mount({ view: 'month', month: { lanes: true } });
    expect($$(month.card, '[data-lane], .lane-header')).toHaveLength(0);
  });
});

describe('columns drawing lanes', () => {
  it('draws a row per lane across the days, a track at their start naming each', async () => {
    const { card } = await mount({ view: 'column' });
    const grid = $(card, '.column-grid.with-lanes')!;

    expect(grid.style.gridTemplateColumns).toBe('72px repeat(2, minmax(0, 1fr))');
    expect(grid.style.gridTemplateRows).toBe('auto auto repeat(2, auto)');
    const heads = $$(card, '.column-grid > .lane-header');
    expect(
      heads.map((head) => [text(head.querySelector('.lane-name')), head.style.gridRow]),
    ).toEqual([
      ['Anna', '3'],
      ['Ben', '4'],
    ]);
    // Each day spans its header's row and every lane's, one track past the lane track.
    const [today, tomorrow] = $$(card, '.column-grid > .day-column');
    expect([today.style.gridColumn, today.style.gridRow]).toEqual(['2', '2 / span 3']);
    expect(tomorrow.style.gridColumn).toBe('3');
    // Its events in the cell of their entry's lane, each cell in its lane's row.
    const cells = Array.from(today.querySelectorAll<HTMLElement>('.lane-cell[data-lane]'));
    expect(
      cells.map((cell) => [cell.dataset.lane, cell.style.getPropertyValue('grid-area')]),
    ).toEqual([
      ['Anna', '2 / 1'],
      [BEN, '3 / 1'],
    ]);
    expect(titles(cells[0])).toEqual(['Standup', 'Dentist', 'Dinner']);
    expect(titles(cells[1])).toEqual(['Football', 'Dinner']);
    // Each a group named by its lane's header, as a list's lane is.
    expect(
      cells.map((cell) => [
        cell.getAttribute('role'),
        text(card.shadowRoot!.getElementById(cell.getAttribute('aria-labelledby')!)),
      ]),
    ).toEqual([
      ['group', 'Anna'],
      ['group', 'Ben'],
    ]);
    // A day with nothing on keeps its lanes, its notice down them all.
    expect(text(tomorrow.querySelector('.lane-across'))).toContain('No events');
    expect(tomorrow.querySelectorAll('.lane-cell[data-lane]')).toHaveLength(2);
  });

  it('runs a day rule down every lane’s row, and numbers its weeks past the lane track', async () => {
    const { card } = await mount({
      view: 'column',
      day_separator_width: '1px',
      show_week_numbers: 'iso',
      show_current_week_number: true,
    });
    const rule = $(card, '.column-separator-day')!;
    expect([rule.style.gridColumn, rule.style.gridRow]).toEqual(['3', '2 / -1']);
    const week = $(card, '.column-week-number, .week-number')!.closest<HTMLElement>('[style]')!;
    expect(week.style.gridColumn).toBe('2');
  });

  it('starts an event pressed in a lane’s empty part in that lane’s calendar', async () => {
    const { card, dialogs } = await mount({
      view: 'column',
      day_tap_action: { action: 'add-event' },
    });
    const tomorrow = $$(card, '.column-grid > .day-column')[1];
    const ben = tomorrow.querySelector(`.lane-cell[data-lane="${BEN}"]`)!;

    pointer(ben, 'pointerdown');
    pointer(ben, 'pointerup');
    await vi.advanceTimersByTimeAsync(0);

    expect(startedIn(dialogs)).toEqual([BEN]);
  });
});
