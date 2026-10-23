/**
 * The measured day-column count must actually reach the markup.
 *
 * Deciding how many day columns fit and rendering that many are two separate steps.
 * `width-settle.test.ts` covers the first one thoroughly -- it drives real measurements
 * through the debounce and pins the resulting `_columnCount` across a dozen cases -- but
 * it stops at the state. The host then slices the grouped days down to that count inside
 * `render()`, and nothing asserted the slice.
 *
 * That is measurable rather than theoretical: removing the slice entirely, so that a
 * narrow card renders every configured day instead of the number that fit, left the
 * whole suite green. The card would have silently overflowed its container at exactly
 * the widths the column view exists to handle.
 *
 * These render the real custom element rather than calling the column renderer, because
 * the slice lives in the host and the renderer never sees the unsliced list. The empty
 * state is deliberate: column view defaults `show_empty_days` to true, so a card with no
 * events still renders one column per configured day, which exercises the slice without
 * needing a calendar fetch.
 *
 * They assert which days survive rather than how many, because a count alone is not
 * enough: slicing the same number of days off the *end* of the list keeps the count
 * correct while showing the wrong week, and that mutation passed a count-only version of
 * this file. Grid view is included because it reuses the same width resolver; proving only
 * column view was exactly the gap that let grid ignore the measured count.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import { memoryStorage } from './memory-storage';
import type * as Types from '../src/config/types';
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

interface CardUnderTest extends HTMLElement {
  setConfig(config: unknown): void;
  hass?: unknown;
  isInitialLoad: boolean;
  events: Types.CalendarEventData[];
  _columnCount: number;
  requestUpdate(): void;
  readonly updateComplete: Promise<boolean>;
  readonly shadowRoot: ShadowRoot | null;
}

const DAYS = 7;

/** Days of the month the frozen clock produces, oldest first. */
const ALL_DAYS = [17, 18, 19, 20, 21, 22, 23];

/**
 * Mount a card showing `DAYS` empty days, with the measured day-column count applied.
 *
 * @param view - View to render
 * @param columnCount - Value to place on the host before rendering
 * @param overrides - Further config, such as a `start_date` before today
 * @param events - Events to draw
 * @returns The rendered card
 */
async function mount(
  view: 'column' | 'grid',
  columnCount: number,
  overrides: Partial<Types.Config> = {},
  events: Types.CalendarEventData[] = [],
): Promise<CardUnderTest> {
  const config = buildConfig({ days_to_show: DAYS, ...overrides });
  config.view = view;

  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig(config);
  card.hass = { states: {}, locale: { language: 'en' } };
  card.isInitialLoad = false;
  document.body.appendChild(card);

  card.events = events;
  card._columnCount = columnCount;
  card.requestUpdate();
  await card.updateComplete;
  return card;
}

/**
 * The day-of-month of each rendered column, in document order.
 *
 * @param view - View to render
 * @param columnCount - Value to place on the host before rendering
 * @param overrides - Further config, such as a `start_date` before today
 * @returns The rendered days
 */
async function renderedDays(
  view: 'column' | 'grid',
  columnCount: number,
  overrides: Partial<Types.Config> = {},
): Promise<number[]> {
  const card = await mount(view, columnCount, overrides);
  const selector = view === 'grid' ? '.grid-day-header' : '.day-column';

  return [...(card.shadowRoot?.querySelectorAll(selector) ?? [])].map((column) =>
    Number(column.querySelector('.day')?.textContent?.trim()),
  );
}

// A fresh cache per test; see `memory-storage.ts`.
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
});

describe('rendered day-column count', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders every configured day when no measurement has capped it', async () => {
    // The positive control. Without it, a slice that always returned an empty list
    // would still satisfy the capping assertion below.
    expect(await renderedDays('column', 0)).toEqual(ALL_DAYS);
  });

  it('renders only as many day columns as were measured to fit', async () => {
    expect(await renderedDays('column', 4)).toEqual(ALL_DAYS.slice(0, 4));
    expect(await renderedDays('grid', 4)).toEqual(ALL_DAYS.slice(0, 4));
  });

  it('keeps the earliest days rather than any four of them', async () => {
    // Guards the direction of the slice. Taking the last four days keeps the count
    // right and shows the wrong week; the card must always start from today.
    const rendered = await renderedDays('column', 4);
    expect(rendered[0]).toBe(ALL_DAYS[0]);
    expect(rendered).not.toEqual(ALL_DAYS.slice(-4));

    const gridRendered = await renderedDays('grid', 4);
    expect(gridRendered[0]).toBe(ALL_DAYS[0]);
    expect(gridRendered).not.toEqual(ALL_DAYS.slice(-4));
  });

  it('renders every day when more columns fit than are configured', async () => {
    // The slice is guarded by `_columnCount < days.length`; a count above the
    // configured range must not truncate or pad.
    expect(await renderedDays('column', DAYS + 3)).toEqual(ALL_DAYS);
  });
});

/**
 * Which days survive when the range starts before today.
 *
 * The frozen clock is Wednesday 17 June. Shedding from the end used to keep the start of the
 * range, so a `start_of_week` card two columns wide drew Monday and Tuesday and never today —
 * the phone layout of a wall calendar, with nothing on screen saying the rest existed.
 */
describe('keeping today in the shed window', () => {
  const FROM_MONDAY = { start_date: '2026-06-15' } as Partial<Types.Config>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(['column', 'grid'] as const)('%s view starts the window at today', async (view) => {
    expect(await renderedDays(view, 2, FROM_MONDAY)).toEqual([17, 18]);
    expect(await renderedDays(view, 4, FROM_MONDAY)).toEqual([17, 18, 19, 20]);
  });

  it.each(['column', 'grid'] as const)(
    '%s view moves back only as far as the end of the range forces it',
    async (view) => {
      // Five days remain from Wednesday; a sixth column has to come from before it.
      expect(await renderedDays(view, 6, FROM_MONDAY)).toEqual([16, 17, 18, 19, 20, 21]);
    },
  );

  it('keeps the earliest days of a range that lies wholly ahead', async () => {
    expect(
      await renderedDays('grid', 3, { start_date: '2026-06-20' } as Partial<Types.Config>),
    ).toEqual([20, 21, 22]);
  });

  it('keeps the latest days of a range that lies wholly behind', async () => {
    expect(
      await renderedDays('column', 3, { start_date: '2026-06-01' } as Partial<Types.Config>),
    ).toEqual([5, 6, 7]);
  });

  it('marks a banner that began before the window as continuing from earlier', async () => {
    const card = await mount('grid', 2, FROM_MONDAY, [
      {
        start: { date: '2026-06-15' },
        end: { date: '2026-06-19' },
        summary: 'Grandparents visiting',
        _entityId: 'calendar.personal',
      },
    ]);
    const banner = card.shadowRoot?.querySelector('.grid-banner');
    expect(banner?.textContent).toContain('Grandparents visiting');
    expect(banner?.classList.contains('continues-before')).toBe(true);
    expect(banner?.classList.contains('continues-after')).toBe(false);
  });

  it('moves the window at midnight without anything else re-rendering the card', async () => {
    // Column view has no now-line timer, so without its own midnight timer the window would
    // stay on yesterday until some unrelated update arrived.
    vi.setSystemTime(new Date('2026-06-17T23:59:30.000Z'));
    // No fetch: the point is that nothing but the timer re-renders the card.
    const element = customElements.get('calendar-card-pro-dev')!;
    const fetch = vi.spyOn(element.prototype, 'updateEvents').mockResolvedValue(undefined);
    const card = await mount('column', 2, FROM_MONDAY);
    const days = () =>
      [...(card.shadowRoot?.querySelectorAll('.day-column') ?? [])].map((column) =>
        Number(column.querySelector('.day')?.textContent?.trim()),
      );
    expect(days()).toEqual([17, 18]);

    await vi.advanceTimersByTimeAsync(60_000);
    await card.updateComplete;
    expect(days()).toEqual([18, 19]);
    fetch.mockRestore();
  });

  it('labels the first visible column with its week number', async () => {
    const card = await mount('column', 2, { ...FROM_MONDAY, show_week_numbers: 'iso' });
    const columns = [...(card.shadowRoot?.querySelectorAll('.day-column') ?? [])];
    expect(columns.map((column) => column.querySelector('.day')?.textContent?.trim())).toEqual([
      '17',
      '18',
    ]);
    expect(card.shadowRoot?.textContent).toContain('25');
  });
});
