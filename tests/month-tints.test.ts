/**
 * Month view's weekend and today tints: `month → weekend_background_color` and
 * `month → today_background_color`, Grid's two options under Grid's names and defaults.
 *
 * The card writes each as a custom property on the month, only where it paints and floored where
 * the browser has no color-mix(), and the stylesheet paints a day's cell from them in either form,
 * as Grid paints its backdrops: today's tint replaces the weekend's. What is drawn over a cell, the
 * today tile, the narrow selection mark, the focus ring and a pressed day's wash, stays above it,
 * and nothing but a day's cell takes either tint.
 *
 * Wednesday, November 18, 2026, 10:00 UTC, Mondays first: the six weeks run from Monday,
 * October 26 to Sunday, December 6, and the weekend is Saturday and Sunday (`country: DE`). Names
 * are invented.
 */
import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { declarations } from './helpers/css-declarations';
import { memoryStorage } from './memory-storage';
import type * as Types from '../src/config/types';
import { DAY_PANEL_TAG, type DayPanelParams } from '../src/rendering/day-panel';
import { cardStyles } from '../src/rendering/styles';
import * as ColorMix from '../src/utils/color-mix';
import '../src/calendar-card-pro';

const NOW = new Date('2026-11-18T10:00:00Z');
const ANNA = 'calendar.anna';
const WEEKEND = '--calendar-card-month-weekend';
const TODAY = '--calendar-card-month-today';
/** The weekend tint Month ships, Grid's. */
const SHIPPED = 'color-mix(in srgb, var(--primary-text-color) 4%, transparent)';

interface CardUnderTest extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: Types.Hass;
  readonly updateComplete: Promise<boolean>;
  updateEvents(force?: boolean): Promise<void>;
}

/** Answers the resize observer the card starts, with any width a test reports. */
class RecordingResizeObserver {
  static instances: RecordingResizeObserver[] = [];
  constructor(readonly callback: (entries: Array<{ contentRect: { width: number } }>) => void) {
    RecordingResizeObserver.instances.push(this);
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

/** Five events on Tuesday the 10th, more than a wide day holds, so it ends in "+N more". */
const EVENTS = ['Standup', 'Review', 'Lunch', 'Planning', 'Gym'].map((summary, index) => ({
  summary,
  start: { dateTime: `2026-11-10T${String(8 + 2 * index).padStart(2, '0')}:00:00Z` },
  end: { dateTime: `2026-11-10T${String(9 + 2 * index).padStart(2, '0')}:00:00Z` },
}));

function hass(): Types.Hass {
  return {
    states: {
      [ANNA]: { entity_id: ANNA, state: 'off', attributes: { friendly_name: 'Anna' } },
    },
    locale: { language: 'en', first_weekday: 'monday', time_format: '24' },
    config: { country: 'DE' },
    themes: { darkMode: false },
    entities: {},
    connection: {
      // A Home Assistant before 2026.5 refuses the subscription, and the card asks over REST.
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
    callApi: vi.fn(() => Promise.resolve(EVENTS.map((event) => ({ ...event })))),
    callService: vi.fn(),
  } as unknown as Types.Hass;
}

async function settle(card: CardUnderTest): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
  await card.updateComplete;
}

/** A month card, wide, or narrow at a phone's width. */
async function mount(config: Record<string, unknown> = {}, width?: number) {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig({
    view: 'month',
    entities: [ANNA],
    first_day_of_week: 'monday',
    time_24h: true,
    ...config,
  });
  card.hass = hass();
  document.body.appendChild(card);
  await card.updateEvents(true);
  await card.updateComplete;
  if (width !== undefined) {
    for (const observer of RecordingResizeObserver.instances) {
      observer.callback([{ contentRect: { width } }]);
    }
    await settle(card);
  }
  return card;
}

const FORMS = [
  ['wide', undefined],
  ['narrow', 375],
] as const;

const root = (card: CardUnderTest) => card.shadowRoot!;

/** The month the card draws, in the form it was asked for. */
function month(card: CardUnderTest, form: 'wide' | 'narrow'): HTMLElement {
  const container = root(card).querySelector<HTMLElement>('.month-container')!;
  expect(container.classList.contains('month-narrow')).toBe(form === 'narrow');
  return container;
}

/** The two tints as written on the month, '' where one is not. */
function tints(card: CardUnderTest, form: 'wide' | 'narrow'): [string, string] {
  const { style } = month(card, form);
  return [style.getPropertyValue(WEEKEND), style.getPropertyValue(TODAY)];
}

/** The days whose cells match a selector, by the date their name starts with. */
function cellsMatching(card: CardUnderTest, selector: string): string[] {
  return [...root(card).querySelectorAll(selector)].map((cell) =>
    (cell.getAttribute('aria-label') ?? '').split(', ').slice(1, 2).join(),
  );
}

/** Every rule of the card's stylesheet outside an at-rule, by its one exact selector. */
const rule = (selector: string): Record<string, string> =>
  Object.fromEntries(
    declarations(cardStyles.cssText)
      .filter((d) => d.at.length === 0 && d.selectors.length === 1 && d.selectors[0] === selector)
      .map((d) => [d.property, d.value]),
  );

/** A value with the whitespace a wrapped declaration leaves inside its parentheses removed. */
const tight = (value = '') => value.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');

/** The three rules painting a cell, the only ones reading either tint. */
const TINT_RULES = ['.month-day.weekend', '.month-day.today', '.month-day.today.weekend'];

const originalResizeObserver = globalThis.ResizeObserver;
const record = (event: Event) => shown.push((event as CustomEvent).detail);
let shown: Array<{ dialogTag: string; dialogParams: DayPanelParams }> = [];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal('localStorage', memoryStorage());
  RecordingResizeObserver.instances = [];
  globalThis.ResizeObserver = RecordingResizeObserver as unknown as typeof ResizeObserver;
  shown = [];
  document.addEventListener('show-dialog', record);
});

afterEach(() => {
  document.removeEventListener('show-dialog', record);
  document.body.replaceChildren();
  globalThis.ResizeObserver = originalResizeObserver;
  vi.unstubAllGlobals();
  vi.useRealTimers();
  ColorMix.resetColorMixSupport();
});

describe('the tints the card writes on the month', () => {
  it.each(FORMS)(
    'writes the weekend’s by default, and today’s once it is set, in the %s form',
    async (form, width) => {
      expect(tints(await mount({}, width), form)).toEqual([SHIPPED, '']);
      const set = await mount({ month: { today_background_color: 'rgb(1, 2, 3)' } }, width);
      expect(tints(set, form)).toEqual([SHIPPED, 'rgb(1, 2, 3)']);
      // On the month alone: the day list beside a narrow one, and every cell, carry neither.
      const holders = [...root(set).querySelectorAll<HTMLElement>('[style]')].filter(
        (element) =>
          element.style.getPropertyValue(WEEKEND) !== '' ||
          element.style.getPropertyValue(TODAY) !== '',
      );
      expect(holders).toEqual([month(set, form)]);
    },
  );

  it.each(['transparent', 'none', '', ' Transparent '])(
    'writes neither where both are %j, which paints nothing',
    async (value) => {
      const tint = { weekend_background_color: value, today_background_color: value };
      for (const [form, width] of FORMS) {
        expect(tints(await mount({ month: tint }, width), form)).toEqual(['', '']);
      }
    },
  );

  it('writes the shipped mix’s floor where the browser has no color-mix(), any other as given', async () => {
    vi.stubGlobal('CSS', {
      supports: (_property: string, value?: string) => !/mix\(/.test(value ?? ''),
    });
    ColorMix.resetColorMixSupport();
    for (const [form, width] of FORMS) {
      const card = await mount({ month: { today_background_color: 'rgb(1, 2, 3)' } }, width);
      expect(tints(card, form)).toEqual(['rgba(128, 128, 128, 0.08)', 'rgb(1, 2, 3)']);
    }
  });
});

describe('the cells it tints', () => {
  const weekends = [
    'October 31',
    'November 1',
    'November 7',
    'November 8',
    'November 14',
    'November 15',
    'November 21',
    'November 22',
    'November 28',
    'November 29',
    'December 5',
    'December 6',
  ];

  it.each(FORMS)(
    'are every weekend day and today in the %s form, neighbors and empty days included',
    async (form, width) => {
      const card = await mount({}, width);
      month(card, form);
      // Forty-two cells, one a day; nothing else in the card carries the class.
      expect(cellsMatching(card, '.month-day')).toHaveLength(42);
      expect(cellsMatching(card, '.month-day.weekend')).toEqual(weekends);
      expect(cellsMatching(card, '.month-day.today')).toEqual(['November 18']);
      expect(cellsMatching(card, '.month-day.weekend.other-month')).toEqual([
        'October 31',
        'December 5',
        'December 6',
      ]);
      for (const cell of root(card).querySelectorAll('.month-day')) {
        expect(cell.getAttribute('role')).toBe('gridcell');
      }
    },
  );

  it.each(FORMS)('mark today on a weekend as both, in the %s form', async (form, width) => {
    vi.setSystemTime(new Date('2026-11-21T10:00:00Z'));
    const card = await mount({}, width);
    month(card, form);
    expect(cellsMatching(card, '.month-day.today.weekend')).toEqual(['November 21']);
  });

  it('dims a neighboring month’s date or contents, never the cell, so its tint stays whole', () => {
    // A rule whose subject is the cell itself: nothing after the last .month-day compound.
    const onCell = /\.month-day(?:[.:[][^\s>+~]*)?$/;
    const faded = declarations(cardStyles.cssText).filter(
      (d) =>
        (d.property === 'opacity' || d.property === 'filter') &&
        d.selectors.some((selector) => onCell.test(selector)),
    );
    expect(faded).toEqual([]);
  });
});

describe('what stays clear', () => {
  it('leaves the weekday names and a narrow month’s day list clear, which are not cells', async () => {
    const card = await mount({}, 375);
    month(card, 'narrow');
    const tinted = [...root(card).querySelectorAll(TINT_RULES.join(', '))];
    expect(tinted.length).toBeGreaterThan(0);
    expect(tinted.every((element) => element.matches('.month-week > .month-day'))).toBe(true);
    expect(root(card).querySelectorAll('.month-weekday.weekend')).toHaveLength(2);
    // The list sits after the month rather than in it, so the month's properties never reach it.
    expect(root(card).querySelector('.month-container .month-day-list')).toBeNull();
    expect(root(card).querySelector('.month-container + .month-day-list')).not.toBeNull();
  });

  it('leaves the panel clear: none of its rows is a cell, and it is handed neither tint', async () => {
    const card = await mount({ month: { today_background_color: 'rgb(1, 2, 3)' } });
    root(card).querySelector<HTMLButtonElement>('.month-more[aria-label*="November 10"]')!.click();
    await settle(card);
    expect(shown.map(({ dialogTag }) => dialogTag)).toEqual([DAY_PANEL_TAG]);
    const { source } = shown[0].dialogParams;
    expect(
      Object.keys(source.styles()).filter((name) => name === WEEKEND || name === TODAY),
    ).toEqual([]);
    const rows = document.createElement('div');
    litRender(source.rows(), rows);
    expect(rows.querySelectorAll('td.event')).toHaveLength(5);
    expect(rows.querySelector(TINT_RULES.join(', '))).toBeNull();
  });
});

describe('the stylesheet', () => {
  it('paints a cell as Grid paints its backdrop: today’s tint replaces the weekend’s', () => {
    const grid = (selector: string) =>
      tight(
        rule(`.grid-day-body${selector} .grid-event-backdrop-ground`)['background-color'],
      ).replace(/-grid-/g, '-month-');
    expect(TINT_RULES.map((selector) => tight(rule(selector)['background-color']))).toEqual([
      `var(${WEEKEND}, transparent)`,
      // Unset, a weekday's today is transparent, as it was without the option.
      `var(${TODAY}, transparent)`,
      // Unset, a weekend's today keeps the weekend's tint; set, today's replaces it.
      `var(${TODAY}, var(${WEEKEND}, transparent))`,
    ]);
    expect(TINT_RULES.map((selector) => tight(rule(selector)['background-color']))).toEqual(
      ['.weekend', '.today', '.today.weekend'].map(grid),
    );
  });

  it('reads the tints in those three rules alone, and paints no cell’s background elsewhere', () => {
    const all = declarations(cardStyles.cssText);
    const reading = all.filter((d) => d.value.includes(WEEKEND) || d.value.includes(TODAY));
    expect(reading.map((d) => `${d.selectors.join(', ')} { ${d.property} }`)).toEqual(
      TINT_RULES.map((selector) => `${selector} { background-color }`),
    );
    // Any other color or shorthand on a cell would outrank or reset the tint; a pressed day's wash
    // is an image, which paints over it.
    const onCell = /\.month-day(?:[.:[][^\s>+~]*)?$/;
    const painting = all.filter(
      (d) =>
        (d.property === 'background' || d.property === 'background-color') &&
        d.selectors.some((selector) => onCell.test(selector)),
    );
    expect(painting.map((d) => d.selectors.join(', '))).toEqual(TINT_RULES);
  });

  it('keeps the today tile, the selection mark and the focus ring above a tinted cell', () => {
    // The tile and the mark are the date's number, drawn inside the cell, never the cell.
    const marks = declarations(cardStyles.cssText).filter(
      (d) => d.property === 'background' && d.selectors.some((s) => s.includes('.month-selected')),
    );
    expect(marks.flatMap((d) => d.selectors)).toEqual([
      '.month-narrow .month-day.month-selected:not(.today) .month-date > .day',
      '.month-narrow .month-day.month-selected.today .month-date > .day',
      // The darkened fill where the browser has relative colors, shared with the wide tile.
      '.month-container:not(.month-narrow) .month-date > .day.today-tile',
      '.month-narrow .month-day.month-selected.today .month-date > .day',
    ]);
    // The ring is an outline drawn inside the cell's edges, over its background.
    expect(rule('.month-day:focus-visible')).toMatchObject({ 'outline-offset': '-2px' });
  });

  it('washes a pressed day over its tint, as a layer of its own', () => {
    const wash = 'color-mix(in srgb, var(--ha-ripple-pressed-color) 16%, transparent)';
    const pressed = rule('.month-day[data-add-pressed]');
    expect(Object.keys(pressed)).toEqual(['background-image']);
    expect(tight(pressed['background-image'])).toBe(`linear-gradient(${wash}, ${wash})`);
    const floor = declarations(cardStyles.cssText).filter(
      (d) =>
        d.at.includes('@supports not (color: color-mix(in srgb, red, blue))') &&
        d.selectors.includes('.month-day[data-add-pressed]'),
    );
    expect(floor.map((d) => [d.property, d.value])).toEqual([
      ['background-image', 'linear-gradient(rgba(128, 128, 128, 0.16), rgba(128, 128, 128, 0.16))'],
    ]);
  });
});
