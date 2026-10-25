/**
 * `show_empty_today`: keep today on the card when it has no events, while every other empty
 * day stays hidden (#670, contributed in #669).
 *
 * The rule has three edges worth pinning, because each is a way the option could quietly
 * change a card it should leave alone: today must fall inside the window `days_to_show`
 * marks out from the start date; the empty today must never take a slot from a day that has
 * events; and wherever empty days already show, the option must change nothing at all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import { memoryStorage } from './memory-storage';
import '../src/calendar-card-pro';
import type * as Types from '../src/config/types';
import * as EventUtils from '../src/utils/events';

// Wednesday 17 June 2026, 10:00 UTC; the unit project runs under TZ=UTC.
const NOW = new Date('2026-06-17T10:00:00.000Z');

function timed(date: string, from: string, to: string, summary: string): Types.CalendarEventData {
  return {
    summary,
    start: { dateTime: `${date}T${from}:00.000Z` },
    end: { dateTime: `${date}T${to}:00.000Z` },
    _entityId: 'calendar.personal',
  };
}

const TOMORROW = timed('2026-06-18', '09:00', '10:00', 'Tomorrow event');
const IN_TWO_DAYS = timed('2026-06-19', '09:00', '10:00', 'Day after event');
const TODAY_LATER = timed('2026-06-17', '15:00', '16:00', 'Today event');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

/** Each day as `YYYY-MM-DD:` plus its summaries, `-` for an empty-day placeholder. */
function layout(
  events: Types.CalendarEventData[],
  overrides: Partial<Types.Config> = {},
  view: Types.EffectiveView = 'list',
  isExpanded = false,
): string[] {
  const config = buildConfig({ days_to_show: 3, ...overrides });
  return EventUtils.groupEventsByDay(events, config, isExpanded, 'en', view).map((day) => {
    const date = new Date(day.timestamp).toISOString().slice(0, 10);
    const summaries = day.events.map((event) => (event._isEmptyDay ? '-' : event.summary));
    return `${date}: ${summaries.join(', ')}`;
  });
}

describe('in list view, where empty days ship hidden', () => {
  it('adds today ahead of the days that have events', () => {
    expect(layout([TOMORROW], { show_empty_today: true })).toEqual([
      '2026-06-17: -',
      '2026-06-18: Tomorrow event',
    ]);
    // The control: without the option today is simply absent.
    expect(layout([TOMORROW])).toEqual(['2026-06-18: Tomorrow event']);
  });

  it('adds no placeholder when today has events of its own', () => {
    expect(layout([TODAY_LATER, TOMORROW], { show_empty_today: true })).toEqual(
      layout([TODAY_LATER, TOMORROW]),
    );
  });

  it('adds only today, never another empty day', () => {
    expect(layout([IN_TWO_DAYS], { show_empty_today: true })).toEqual([
      '2026-06-17: -',
      '2026-06-19: Day after event',
    ]);
  });

  it('puts the only row of an empty card on today', () => {
    // Without the option an empty card's single row sits on the start date, which with a
    // start date in the past is not today.
    const from = { start_date: '2026-06-16' };

    expect(layout([], from)).toEqual(['2026-06-16: -']);
    expect(layout([], { ...from, show_empty_today: true })).toEqual(['2026-06-17: -']);
  });

  it('adds nothing when today is outside the window', () => {
    expect(layout([], { start_date: '2026-06-18', show_empty_today: true })).toEqual([
      '2026-06-18: -',
    ]);
    expect(layout([IN_TWO_DAYS], { start_date: '2026-06-18', show_empty_today: true })).toEqual([
      '2026-06-19: Day after event',
    ]);
    // A window that ends the day before today.
    expect(
      layout([], { start_date: '2026-06-14', days_to_show: 3, show_empty_today: true }),
    ).toEqual(['2026-06-14: -']);
  });

  it('does not take the slot of a day that has events under a compact day limit', () => {
    // compact_days_to_show counts days with events, so the one day it keeps must survive
    // the empty today joining it.
    expect(
      layout([TOMORROW, IN_TWO_DAYS], { compact_days_to_show: 1, show_empty_today: true }),
    ).toEqual(['2026-06-17: -', '2026-06-18: Tomorrow event']);
  });

  it('keeps today under a compact event limit, which an empty day does not spend', () => {
    expect(
      layout([TOMORROW, IN_TWO_DAYS], { compact_events_to_show: 1, show_empty_today: true }),
    ).toEqual(['2026-06-17: -', '2026-06-18: Tomorrow event']);
  });

  it.each([
    ['day', { compact_days_to_show: 1 }],
    ['event', { compact_events_to_show: 1 }],
  ] as const)(
    'never calls today free when a compact %s limit only hid its events',
    (_limit, compact) => {
      // A window that starts yesterday, where a running all-day event takes the one slot the
      // collapsed card has. Today's own event is cut, not missing, and expanding shows it.
      const vacation: Types.CalendarEventData = {
        summary: 'Vacation',
        start: { date: '2026-06-16' },
        end: { date: '2026-06-19' },
        _entityId: 'calendar.personal',
      };
      const window = { start_date: 'today-1', show_past_events: true, ...compact };

      expect(layout([vacation, TODAY_LATER], { ...window, show_empty_today: true })).toEqual(
        layout([vacation, TODAY_LATER], window),
      );
      expect(layout([vacation, TODAY_LATER], window, 'list', true)).toContain(
        '2026-06-17: Today event',
      );
    },
  );

  it('adds only today when the card is expanded, not every empty day', () => {
    expect(
      layout([IN_TWO_DAYS], { compact_events_to_show: 1, show_empty_today: true }, 'list', true),
    ).toEqual(['2026-06-17: -', '2026-06-19: Day after event']);
  });

  it('changes nothing while show_empty_days is on', () => {
    const shown = { show_empty_days: true };

    expect(layout([IN_TWO_DAYS], { ...shown, show_empty_today: true })).toEqual(
      layout([IN_TWO_DAYS], shown),
    );
  });

  it('uses the custom empty-day text', () => {
    const config = buildConfig({ days_to_show: 3, show_empty_today: true, empty_day_text: 'Free' });
    const [today] = EventUtils.groupEventsByDay([TOMORROW], config, false, 'en', 'list');

    expect(today.events[0].summary).toBe('Free');
  });
});

describe.each([
  ['column', 'column'],
  ['grid', 'time_grid'],
] as const)('in %s view, where empty days ship shown', (view, block) => {
  it('changes nothing at the shipped default', () => {
    expect(layout([IN_TWO_DAYS], { show_empty_today: true }, view)).toEqual(
      layout([IN_TWO_DAYS], {}, view),
    );
  });

  it('keeps today once the view hides its empty days', () => {
    const hidden = { [block]: { show_empty_days: false } };

    expect(layout([IN_TWO_DAYS], hidden, view)).toEqual(['2026-06-19: Day after event']);
    expect(
      layout([IN_TWO_DAYS], { [block]: { show_empty_days: false, show_empty_today: true } }, view),
    ).toEqual(['2026-06-17: -', '2026-06-19: Day after event']);
  });
});

describe('hide_when_empty', () => {
  interface Card extends HTMLElement {
    setConfig(config: Record<string, unknown>): void;
    hass: Types.Hass;
    readonly updateComplete: Promise<boolean>;
    updateEvents(force?: boolean): Promise<void>;
  }

  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });

  async function mount(showEmptyToday: boolean): Promise<Card> {
    const card = document.createElement('calendar-card-pro-dev') as Card;
    card.setConfig({
      entities: ['calendar.personal'],
      days_to_show: 3,
      hide_when_empty: true,
      show_empty_today: showEmptyToday,
    });
    card.hass = {
      states: {
        'calendar.personal': { entity_id: 'calendar.personal', state: 'off', attributes: {} },
      },
      locale: { language: 'en', first_weekday: 'monday', time_format: '24' },
      callApi: vi.fn().mockResolvedValue([]),
      callService: vi.fn(),
    } as unknown as Types.Hass;
    document.body.appendChild(card);
    await card.updateEvents(true);
    await card.updateComplete;
    return card;
  }

  it('still hides a card whose only row is the empty today', async () => {
    // The empty today is a placeholder, not an event, like every other empty day.
    expect((await mount(true)).hidden).toBe(true);
    // The control: the same card with nothing to show hides without the option too.
    expect((await mount(false)).hidden).toBe(true);
  });
});
