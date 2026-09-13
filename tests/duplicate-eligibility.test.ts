import { render } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import { resolveEffectiveConfig } from '../src/config/view';
import { renderGridGroupedEvents } from '../src/rendering/grid';
import { fetchEventData, groupEventsByDay } from '../src/utils/events';
import { getLocalDateKey } from '../src/utils/format';

const saturday: Types.CalendarEventData = {
  summary: 'Garden planning',
  start: { dateTime: '2026-09-19T11:00:00Z' },
  end: { dateTime: '2026-09-19T12:00:00Z' },
};

const allDay: Types.CalendarEventData = {
  summary: 'Garden planning',
  start: { date: '2026-09-14' },
  end: { date: '2026-09-15' },
};

async function grouped(
  view: Types.EffectiveView,
  entities: Array<string | Types.EntityConfig>,
  event: Types.CalendarEventData,
  overrides: Partial<Types.Config> = {},
): Promise<Types.EventsByDay[]> {
  const config = buildConfig({
    view,
    entities,
    start_date: '2026-09-14',
    days_to_show: 7,
    show_past_events: false,
    filter_duplicates: true,
    time_grid: { show_past_events: false },
    ...overrides,
  });
  const hass: Types.Hass = {
    states: {},
    locale: { language: 'en' },
    callApi: async () => [event],
    callService: vi.fn(),
  };
  const result = await fetchEventData(hass, config, 'duplicate-eligibility', true);
  expect(result.failedEntities).toEqual([]);
  return groupEventsByDay(result.events, config, false, 'en', view, hass.locale);
}

function realEvents(days: Types.EventsByDay[]): Types.CalendarEventData[] {
  return days.flatMap((day) => day.events).filter((event) => !event._isEmptyDay);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-14T10:00:00Z'));
  localStorage.clear();
});

afterEach(() => vi.useRealTimers());

describe.each(['list', 'column', 'grid'] as const)('eligible duplicates in %s', (view) => {
  it('keeps an eligible calendar when the first calendar excludes the date', async () => {
    const days = await grouped(
      view,
      [{ entity: 'calendar.anna', days_of_week: 'weekdays' }, 'calendar.ben'],
      saturday,
    );
    expect(realEvents(days)).toHaveLength(1);
    expect(realEvents(days)[0]._entityId).toBe('calendar.ben');
    expect(realEvents(days)[0]._mergedFrom).toBeUndefined();
  });

  it('keeps a later eligible block of the same calendar', async () => {
    const days = await grouped(
      view,
      [
        { entity: 'calendar.anna', days_of_week: 'weekdays', label: 'Weekday' },
        { entity: 'calendar.anna', days_of_week: 'weekends', label: 'Weekend' },
      ],
      saturday,
    );
    expect(realEvents(days)).toHaveLength(1);
    expect(realEvents(days)[0]._matchedConfig?.label).toBe('Weekend');
  });

  it('does not let an expired copy discard another calendar that has not expired', async () => {
    const days = await grouped(
      view,
      [
        { entity: 'calendar.anna', allday_expires_at: '09:00' },
        { entity: 'calendar.ben', allday_expires_at: '18:00' },
      ],
      allDay,
    );
    expect(realEvents(days)).toHaveLength(1);
    expect(realEvents(days)[0]._entityId).toBe('calendar.ben');
  });

  it('control: still collapses eligible copies and preserves contributor order', async () => {
    const days = await grouped(view, ['calendar.anna', 'calendar.ben'], saturday);
    const kept = realEvents(days);
    expect(kept).toHaveLength(1);
    expect(kept[0]._mergedFrom?.map((entry) => entry.entityId)).toEqual([
      'calendar.anna',
      'calendar.ben',
    ]);
  });

  it('control: leaves eligibility intact when deduplication is disabled', async () => {
    const days = await grouped(
      view,
      [{ entity: 'calendar.anna', days_of_week: 'weekdays' }, 'calendar.ben'],
      saturday,
      { filter_duplicates: false },
    );
    expect(realEvents(days)).toHaveLength(1);
    expect(realEvents(days)[0]._entityId).toBe('calendar.ben');
  });
});

it('keeps complementary Grid banner dates without crossing another calendar-owned day', async () => {
  const entities: Types.EntityConfig[] = [
    { entity: 'calendar.anna', days_of_week: 'weekdays', accent_color: '#e67c73' },
    { entity: 'calendar.ben', days_of_week: 'weekends', accent_color: '#039be5' },
  ];
  const event = {
    summary: 'Garden week',
    start: { date: '2026-09-18' },
    end: { date: '2026-09-21' },
  };
  const days = await grouped('grid', entities, event, {
    start_date: '2026-09-18',
    days_to_show: 3,
  });
  expect(
    days.map((day) => [
      getLocalDateKey(new Date(day.timestamp)),
      day.events.filter((entry) => !entry._isEmptyDay).map((entry) => entry._entityId),
    ]),
  ).toEqual([
    ['2026-09-18', ['calendar.anna']],
    ['2026-09-19', ['calendar.ben']],
    ['2026-09-20', ['calendar.ben']],
  ]);
  const config = resolveEffectiveConfig(buildConfig({ view: 'grid', entities }), 'grid');
  const container = document.createElement('div');
  render(renderGridGroupedEvents(days, config, 'en'), container);
  expect(
    [...container.querySelectorAll<HTMLElement>('.grid-banner')].map((banner) =>
      banner.style.getPropertyValue('grid-column'),
    ),
  ).toEqual(['3 / span 2', '2 / span 1']);
});

it.each(['list', 'column'] as const)(
  'control: %s keeps the winning unsplit shape when both calendars qualify',
  async (view) => {
    const days = await grouped(
      view,
      [
        { entity: 'calendar.anna', split_multiday_events: false },
        { entity: 'calendar.ben', split_multiday_events: true },
      ],
      {
        summary: 'Garden week',
        start: { date: '2026-09-18' },
        end: { date: '2026-09-21' },
      },
    );

    const events = realEvents(days);
    expect(events).toHaveLength(1);
    expect(events[0].start.date).toBe('2026-09-18');
    expect(events[0].end.date).toBe('2026-09-21');
  },
);

it('separates Grid banner runs when their eligible contributing calendars change', async () => {
  const entities: Types.EntityConfig[] = [
    { entity: 'calendar.anna', accent_color: 'rgb(230, 124, 115)' },
    { entity: 'calendar.ben', days_of_week: 'weekends', accent_color: 'rgb(3, 155, 229)' },
  ];
  const days = await grouped(
    'grid',
    entities,
    {
      summary: 'Garden week',
      start: { date: '2026-09-18' },
      end: { date: '2026-09-21' },
    },
    { start_date: '2026-09-18', days_to_show: 3 },
  );
  const events = realEvents(days);
  expect(events).toHaveLength(3);
  expect(events[0]._mergedFrom).toBeUndefined();
  expect(events[1]._mergedFrom?.map((entry) => entry.entityId)).toEqual([
    'calendar.anna',
    'calendar.ben',
  ]);
  const config = resolveEffectiveConfig(
    buildConfig({ view: 'grid', entities, duplicate_accent_color: 'rgb(67, 160, 71)' }),
    'grid',
  );
  const container = document.createElement('div');
  render(renderGridGroupedEvents(days, config, 'en'), container);
  expect(
    [...container.querySelectorAll<HTMLElement>('.grid-banner')].map((banner) => [
      banner.style.getPropertyValue('grid-column'),
      banner.style.backgroundColor,
    ]),
  ).toEqual([
    ['3 / span 2', 'rgba(67, 160, 71, 0.2)'],
    ['2 / span 1', 'rgba(230, 124, 115, 0.2)'],
  ]);
});

it.each(['column', 'grid'] as const)(
  'control: %s does not merge distinct intervals whose daily slices happen to match',
  async (view) => {
    const config = buildConfig({
      view,
      entities: ['calendar.anna'],
      filter_duplicates: true,
      start_date: '2026-09-18',
      days_to_show: 3,
    });
    const raw = [
      { summary: 'Garden week', start: { date: '2026-09-18' }, end: { date: '2026-09-21' } },
      { summary: 'Garden week', start: { date: '2026-09-19' }, end: { date: '2026-09-21' } },
    ];
    const hass: Types.Hass = {
      states: {},
      locale: { language: 'en' },
      callApi: async () => raw,
      callService: vi.fn(),
    };
    const fetched = await fetchEventData(hass, config, 'distinct-intervals', true);
    const days = groupEventsByDay(fetched.events, config, false, 'en', view);
    expect(days.map((day) => day.events.filter((event) => !event._isEmptyDay).length)).toEqual([
      1, 2, 2,
    ]);
  },
);
