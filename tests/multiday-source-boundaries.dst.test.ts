import { render } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import '../src/calendar-card-pro';
import type * as Types from '../src/config/types';
import { fetchEventData } from '../src/utils/events';
import { getLocalDateKey } from '../src/utils/format';

async function draw(
  view: Types.EffectiveView,
  event: Types.CalendarEventData,
  options: Partial<Types.Config> = {},
) {
  const card = document.createElement('calendar-card-pro-dev');
  card.setConfig({
    entities: ['calendar.anna'],
    view,
    days_to_show: 5,
    split_multiday_events: true,
    show_past_events: true,
    ...options,
  });
  const hass = {
    states: {},
    locale: { language: 'en', time_format: '24' },
    callApi: async () => [event],
  } as unknown as Types.Hass;
  card.hass = hass;
  card.events = (await fetchEventData(hass, card.config, 'source-boundary', true)).events;
  card.isInitialLoad = false;
  const container = document.createElement('div');
  render(card.render(), container);
  const days = card.groupedEvents.filter((day) => day.events.some((entry) => !entry._isEmptyDay));
  return {
    dates: days.map((day) => getLocalDateKey(new Date(day.timestamp))),
    sourceStarts: days.flatMap((day) =>
      day.events
        .filter((entry) => !entry._isEmptyDay)
        .map((entry) => entry._gridSource?.start ?? entry._sourceStart),
    ),
    titles: [
      ...container.querySelectorAll('.event-title:not(.empty-day-title), .grid-banner-title'),
    ].map((title) => title.textContent?.trim()),
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('runs in a zone with both a real UTC offset and a daylight-saving transition', () => {
  const winter = new Date('2026-01-15T12:00:00').getTimezoneOffset();
  const summer = new Date('2026-07-15T12:00:00').getTimezoneOffset();
  expect(winter).not.toBe(0);
  expect(winter).not.toBe(summer);
});

describe.each(['list', 'column', 'grid'] as const)('%s source boundaries', (view) => {
  it.each([
    { start: '2026-10-24', middle: '2026-10-25', end: '2026-10-26' },
    { start: '2026-10-03', middle: '2026-10-04', end: '2026-10-05' },
    { start: '2026-10-31', middle: '2026-11-01', end: '2026-11-02' },
  ])('does not invent a terminal day for $start through $end at midnight', async (dates) => {
    vi.setSystemTime(new Date(`${dates.start}T08:00:00`));
    const event = {
      summary: 'Conference',
      start: { dateTime: `${dates.start}T09:00:00` },
      end: { dateTime: `${dates.end}T00:00:00` },
    };
    const result = await draw(view, event);
    expect(result.dates).toEqual([dates.start, dates.middle]);
    expect(result.titles).toEqual(['Conference', 'Conference']);
  });

  it('control: retains a real final-day millisecond', async () => {
    vi.setSystemTime(new Date('2026-10-24T08:00:00'));
    const result = await draw(
      view,
      {
        summary: 'Conference',
        start: { dateTime: '2026-10-24T09:00:00' },
        end: { dateTime: '2026-10-26T00:00:00.001' },
      },
      { time_grid: { start_time: '00:00', end_time: '24:00' } },
    );
    expect(result.dates).toEqual(['2026-10-24', '2026-10-25', '2026-10-26']);
    expect(result.titles).toEqual(['Conference', 'Conference', 'Conference']);
  });

  it.each(['timed', 'all-day'] as const)(
    'keeps the %s occurrence year on every New Year segment',
    async (kind) => {
      vi.setSystemTime(new Date('2026-12-31T08:00:00'));
      const event = {
        summary: 'Anniversary',
        description: 'YEAR=2000',
        start: kind === 'timed' ? { dateTime: '2026-12-31T09:00:00' } : { date: '2026-12-31' },
        end: kind === 'timed' ? { dateTime: '2027-01-02T11:00:00' } : { date: '2027-01-03' },
      };
      const result = await draw(view, event);
      expect(result.dates).toEqual(['2026-12-31', '2027-01-01', '2027-01-02']);
      expect(result.titles).toEqual(
        kind === 'all-day' && view === 'grid'
          ? ['Anniversary (26)']
          : ['Anniversary (26)', 'Anniversary (26)', 'Anniversary (26)'],
      );
      expect(result.sourceStarts).toEqual([event.start, event.start, event.start]);
      expect(event.summary).toBe('Anniversary');
      expect(event.description).toBe('YEAR=2000');
    },
  );

  it('control: a separate January occurrence advances the count', async () => {
    vi.setSystemTime(new Date('2026-12-31T08:00:00'));
    const result = await draw(view, {
      summary: 'Anniversary',
      description: 'YEAR=2000',
      start: { date: '2027-01-01' },
      end: { date: '2027-01-02' },
    });
    expect(result.dates).toEqual(['2027-01-01']);
    expect(result.titles).toEqual(['Anniversary (27)']);
  });

  it('keeps the original year when the window starts after New Year', async () => {
    vi.setSystemTime(new Date('2027-01-01T08:00:00'));
    const event = {
      summary: 'Anniversary',
      description: 'YEAR=2000',
      start: { date: '2026-12-31' },
      end: { date: '2027-01-03' },
    };
    const result = await draw(view, event);
    expect(result.dates).toEqual(['2027-01-01', '2027-01-02']);
    expect(result.titles).toEqual(
      view === 'grid' ? ['Anniversary (26)'] : ['Anniversary (26)', 'Anniversary (26)'],
    );
    expect(result.sourceStarts).toEqual([event.start, event.start]);
  });
});
