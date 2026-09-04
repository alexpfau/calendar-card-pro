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
 * @returns The day-of-month of each rendered column, in document order
 */
async function renderedDays(view: 'column' | 'grid', columnCount: number): Promise<number[]> {
  const config = buildConfig({ days_to_show: DAYS });
  config.view = view;

  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig(config);
  card.hass = { states: {}, locale: { language: 'en' } };
  card.isInitialLoad = false;
  document.body.appendChild(card);

  card._columnCount = columnCount;
  card.requestUpdate();
  await card.updateComplete;

  const selector = view === 'grid' ? '.grid-day-header' : '.day-column';

  return [...(card.shadowRoot?.querySelectorAll(selector) ?? [])].map((column) =>
    Number(column.querySelector('.day')?.textContent?.trim()),
  );
}

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
