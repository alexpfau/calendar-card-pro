/**
 * The host's fetch bookkeeping, compact-limit detection and error rendering.
 *
 * A mutation sweep of `calendar-card-pro.ts` left six mutations in these three areas
 * alive with the whole suite green. Every one of them is user-visible:
 *
 * - dropping the empty-entities guard sends a card with no calendars into a fetch;
 * - raising the failure threshold to `> 1` means a single broken calendar no longer
 *   marks the card as errored, so the card reports success while showing nothing;
 * - inverting the instance-id comparison makes a reconfigured card keep the *previous*
 *   configuration's events when the new one fails, which is the stale-render bug the
 *   generation counter exists to prevent, reintroduced one branch further down;
 * - dropping either half of the compact-limit check disables expand/collapse for a
 *   card that configured only `compact_days_to_show`, or configured its limit
 *   per-calendar rather than card-wide;
 * - dropping the fetch-error render branch shows an ordinary empty calendar instead of
 *   the error state when every calendar failed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
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

const fetchEventData = vi.hoisted(() => vi.fn());
vi.mock('../src/utils/events', async () => {
  const actual = await vi.importActual<typeof import('../src/utils/events')>('../src/utils/events');
  return { ...actual, fetchEventData };
});

interface CardUnderTest extends HTMLElement {
  setConfig(config: unknown): void;
  hass?: unknown;
  isInitialLoad: boolean;
  isExpanded: boolean;
  events: Types.CalendarEventData[];
  updateEvents(force?: boolean): Promise<void>;
  toggleExpanded(): void;
  _hasFetchError: boolean;
  readonly updateComplete: Promise<boolean>;
  readonly shadowRoot: ShadowRoot | null;
}

/** A single event far enough ahead to survive any default window. */
function event(summary: string): Types.CalendarEventData {
  return {
    summary,
    start: { dateTime: '2026-06-17T12:00:00Z' },
    end: { dateTime: '2026-06-17T13:00:00Z' },
  } as Types.CalendarEventData;
}

/** Let any update the host started on its own run to completion. */
async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Mount a card and drain the update the `hass` setter starts, so that a later explicit
 * `updateEvents()` is the newest request rather than a superseded one.
 */
async function mount(overrides: Record<string, unknown> = {}): Promise<CardUnderTest> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig(buildConfig(overrides));
  card.hass = { states: {}, locale: { language: 'en' } };
  card.isInitialLoad = false;
  document.body.appendChild(card);
  await settle();
  fetchEventData.mockClear();
  return card;
}

describe('host fetch bookkeeping', () => {
  beforeEach(() => {
    fetchEventData.mockReset();
    fetchEventData.mockResolvedValue({ events: [], failedEntities: [] });
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not fetch when the card has no calendars configured', async () => {
    const card = await mount();
    (card as unknown as { config: { entities: unknown[] } }).config.entities = [];

    await card.updateEvents();

    expect(fetchEventData).not.toHaveBeenCalled();
    expect(card.isInitialLoad).toBe(false);
  });

  it('fetches when the card has calendars configured', async () => {
    // The positive control: without it, an `updateEvents` that returned immediately in
    // every case would satisfy the assertion above.
    const card = await mount();

    await card.updateEvents();

    expect(fetchEventData).toHaveBeenCalledTimes(1);
  });

  it('marks the card as errored when a single calendar fails', async () => {
    fetchEventData.mockResolvedValue({
      events: [event('kept')],
      failedEntities: ['calendar.broken'],
    });
    const card = await mount();

    await card.updateEvents();

    expect(card._hasFetchError).toBe(true);
  });

  it('does not mark the card as errored when every calendar succeeds', async () => {
    fetchEventData.mockResolvedValue({ events: [event('fine')], failedEntities: [] });
    const card = await mount();

    await card.updateEvents();

    expect(card._hasFetchError).toBe(false);
  });

  it('keeps previously loaded events when a refresh of the same query fails', async () => {
    const card = await mount();

    fetchEventData.mockResolvedValue({
      events: [event('first'), event('second')],
      failedEntities: [],
    });
    await card.updateEvents();
    expect(card.events).toHaveLength(2);

    fetchEventData.mockResolvedValue({ events: [], failedEntities: ['calendar.personal'] });
    await card.updateEvents();

    expect(card.events).toHaveLength(2);
  });

  it('discards previously loaded events when the card has been reconfigured', async () => {
    const card = await mount();

    fetchEventData.mockResolvedValue({ events: [event('old config')], failedEntities: [] });
    await card.updateEvents();
    expect(card.events).toHaveLength(1);

    // A new configuration mints a new instance id, so the events on the card belong to
    // a query nobody is asking for any more. A failing fetch must not resurrect them.
    card.setConfig(buildConfig({ entities: ['calendar.other'] }));
    fetchEventData.mockResolvedValue({ events: [], failedEntities: ['calendar.other'] });
    await card.updateEvents();

    expect(card.events).toHaveLength(0);
  });
});

describe('host compact-limit detection', () => {
  beforeEach(() => {
    fetchEventData.mockReset();
    fetchEventData.mockResolvedValue({ events: [], failedEntities: [] });
    document.body.innerHTML = '';
  });

  it.each([
    ['card-wide event limit', { compact_events_to_show: 2 }],
    ['card-wide day limit', { compact_days_to_show: 2 }],
    [
      'per-calendar event limit',
      { entities: [{ entity: 'calendar.personal', compact_events_to_show: 2 }] },
    ],
  ])('toggles expansion for a %s', async (_label, overrides) => {
    const card = await mount(overrides);

    card.toggleExpanded();

    expect(card.isExpanded).toBe(true);
  });

  it('does not toggle expansion when no compact limit is configured', async () => {
    // The negative control. Without it, a `hasCompactModeLimits` that always returned
    // true would pass all three cases above.
    const card = await mount();

    card.toggleExpanded();

    expect(card.isExpanded).toBe(false);
  });
});

describe('host error rendering', () => {
  beforeEach(() => {
    fetchEventData.mockReset();
    fetchEventData.mockResolvedValue({ events: [], failedEntities: [] });
    document.body.innerHTML = '';
  });

  it('renders the error state rather than an empty calendar when every calendar failed', async () => {
    fetchEventData.mockResolvedValue({ events: [], failedEntities: ['calendar.personal'] });
    const card = await mount();

    await card.updateEvents();
    await settle();
    await card.updateComplete;

    const text = card.shadowRoot?.textContent ?? '';
    expect(text).toContain('Error');
    expect(card.shadowRoot?.querySelector('.day-table')).toBeNull();
  });

  it('renders an empty calendar rather than the error state when nothing failed', async () => {
    // The positive control, and the discriminator: both branches produce a card with no
    // events, so only the presence of the error text separates them.
    const card = await mount();

    await card.updateEvents();
    await settle();
    await card.updateComplete;

    expect(card.shadowRoot?.textContent ?? '').not.toContain('Error');
  });

  // Grid defaults `show_empty_days` on, so a failed calendar that reached the render
  // dispatch would draw a full, ordinary-looking time axis rather than nothing at all —
  // the same silent failure as the list view's empty day table, and harder to notice.
  // `cramp` is what keeps a zero-width happy-dom card in grid instead of falling back.
  const gridConfig = {
    view: 'grid',
    days_to_show: 7,
    time_grid: { min_days_to_show: 7, min_days_fallback: 'cramp' },
  };

  it('renders the error state rather than an empty time axis when every calendar failed', async () => {
    fetchEventData.mockResolvedValue({ events: [], failedEntities: ['calendar.personal'] });
    const card = await mount(gridConfig);

    await card.updateEvents();
    await settle();
    await card.updateComplete;

    expect(card.shadowRoot?.textContent ?? '').toContain('Error');
    expect(card.shadowRoot?.querySelector('.grid-container')).toBeNull();
  });

  it('renders an empty time axis rather than the error state when nothing failed', async () => {
    // The grid discriminator: this branch must produce the axis the one above must not.
    const card = await mount(gridConfig);

    await card.updateEvents();
    await settle();
    await card.updateComplete;

    expect(card.shadowRoot?.textContent ?? '').not.toContain('Error');
    expect(card.shadowRoot?.querySelector('.grid-container')).not.toBeNull();
  });
});
