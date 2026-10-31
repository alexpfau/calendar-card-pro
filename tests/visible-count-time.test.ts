import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import '../src/calendar-card-pro';
import type * as Types from '../src/config/types';

interface Card extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: Types.Hass;
  events: Types.CalendarEventData[];
  readonly groupedEvents: Types.EventsByDay[];
  readonly visibleEventCount: number;
  readonly updateComplete: Promise<boolean>;
  updateEvents(force?: boolean): Promise<void>;
}

const EVENTS: Record<string, Types.CalendarEventData> = {
  timed: {
    summary: 'Morning rehearsal',
    start: { dateTime: '2026-06-17T09:30:00Z' },
    end: { dateTime: '2026-06-17T10:00:30.250Z' },
  },
  'all-day': {
    summary: 'Festival',
    start: { date: '2026-06-17' },
    end: { date: '2026-06-18' },
  },
};

async function mount(
  view: Types.EffectiveView,
  kind: keyof typeof EVENTS,
  hideWhenEmpty: boolean,
  showPastEvents = false,
  startDate: string | null = '2026-06-17',
) {
  const card = document.createElement('calendar-card-pro-dev') as Card;
  const callApi = vi.fn().mockResolvedValue([EVENTS[kind]]);
  card.setConfig({
    view,
    entities: [{ entity: 'calendar.anna', allday_expires_at: '10:00:30' }],
    start_date: startDate ?? undefined,
    days_to_show: 1,
    hide_when_empty: hideWhenEmpty,
    show_past_events: showPastEvents,
    time_grid: { show_past_events: showPastEvents },
  });
  card.hass = {
    states: {},
    locale: { language: 'en', first_weekday: 'monday', time_format: '24' },
    callApi,
    callService: vi.fn(),
  };
  document.body.appendChild(card);
  await card.updateEvents(true);
  await card.updateComplete;
  callApi.mockClear();
  return { card, callApi };
}

function realEvents(card: Card): Types.CalendarEventData[] {
  return card.groupedEvents.flatMap((day) => day.events.filter((event) => !event._isEmptyDay));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime('2026-06-17T10:00:00Z');
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe.each(['list', 'column', 'grid'] as const)('%s time-dependent visibility', (view) => {
  it.each(
    (['timed', 'all-day'] as const).flatMap((kind) =>
      [false, true].map((hideWhenEmpty) => ({ kind, hideWhenEmpty })),
    ),
  )('expires $kind events with hiding=$hideWhenEmpty', async ({ kind, hideWhenEmpty }) => {
    const { card, callApi } = await mount(view, kind, hideWhenEmpty);
    expect(realEvents(card)).toHaveLength(1);
    expect(card.visibleEventCount).toBe(1);
    expect(card.hidden).toBe(false);
    const events = card.events;

    const lastVisible = kind === 'timed' ? '2026-06-17T10:00:30.250Z' : '2026-06-17T10:00:29.999Z';
    vi.setSystemTime(lastVisible);
    expect(realEvents(card)).toHaveLength(1);
    expect(card.visibleEventCount).toBe(1);

    vi.setSystemTime(new Date(lastVisible).getTime() + 1);
    card.hass = { ...card.hass };
    await card.updateComplete;

    expect(card.events).toBe(events);
    expect(callApi).not.toHaveBeenCalled();
    expect(realEvents(card)).toHaveLength(0);
    expect(card.shadowRoot!.textContent).not.toContain(EVENTS[kind].summary);
    expect(card.visibleEventCount).toBe(0);
    expect(card.hidden).toBe(hideWhenEmpty);
    expect(card.style.display).toBe(hideWhenEmpty ? 'none' : '');
  });

  it.each(['timed', 'all-day'])(
    'keeps expired $kind events when past events are enabled',
    async (kind) => {
      const { card, callApi } = await mount(view, kind, true, true);
      expect(card.visibleEventCount).toBe(1);
      vi.setSystemTime('2026-06-17T10:01:00Z');
      card.hass = { ...card.hass };
      await card.updateComplete;

      expect(callApi).not.toHaveBeenCalled();
      expect(realEvents(card)).toHaveLength(1);
      expect(card.visibleEventCount).toBe(1);
      expect(card.hidden).toBe(false);
    },
  );

  it('drops yesterday from a moving window before the next fetch', async () => {
    const { card, callApi } = await mount(view, 'all-day', true, true, null);
    expect(card.visibleEventCount).toBe(1);
    const events = card.events;
    vi.setSystemTime('2026-06-18T00:00:00Z');
    card.hass = { ...card.hass };
    await card.updateComplete;

    expect(card.events).toBe(events);
    expect(callApi).not.toHaveBeenCalled();
    expect(realEvents(card)).toHaveLength(0);
    expect(card.visibleEventCount).toBe(0);
    expect(card.hidden).toBe(true);
  });
});
