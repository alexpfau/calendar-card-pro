import { render } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import '../src/calendar-card-pro';
import type * as Types from '../src/config/types';
import { getLocalDateKey } from '../src/utils/format';

interface Card extends HTMLElement {
  config: Types.Config;
  hass: unknown;
  events: Types.CalendarEventData[];
  isInitialLoad: boolean;
  groupedEvents: Types.EventsByDay[];
  setConfig(config: Partial<Types.Config>): void;
  render(): unknown;
}

const NOW = new Date('2026-06-19T12:00:00Z');

function spanning(
  kind: 'timed' | 'all-day',
  from = 19,
  through = 22,
  summary = 'Conference',
  entityId = 'calendar.anna',
): Types.CalendarEventData {
  const date = (day: number) => `2026-06-${day}`;
  return {
    summary,
    start: kind === 'timed' ? { dateTime: `${date(from)}T09:00:00Z` } : { date: date(from) },
    end:
      kind === 'timed' ? { dateTime: `${date(through)}T18:00:00Z` } : { date: date(through + 1) },
    _entityId: entityId,
  };
}

function draw(
  input: Types.CalendarEventData[],
  entity: Partial<Types.EntityConfig> = {},
  options: Partial<Types.Config> = {},
) {
  const card = document.createElement('calendar-card-pro-dev') as Card;
  card.setConfig({
    view: 'grid',
    days_to_show: 5,
    entities: [{ entity: 'calendar.anna', ...entity }, { entity: 'calendar.ben' }],
    ...options,
  });
  card.hass = { states: {}, locale: { language: 'en', time_format: '24' } };
  card.events = input.map((event) => ({
    ...event,
    _matchedConfig: card.config.entities.find(
      (entry): entry is Types.EntityConfig =>
        typeof entry === 'object' && entry.entity === event._entityId,
    ),
  }));
  card.isInitialLoad = false;
  const days = card.groupedEvents;
  const container = document.createElement('div');
  render(card.render(), container);
  const blocks = [...container.querySelectorAll<HTMLElement>('.grid-day-body')].map((body) =>
    [...body.querySelectorAll<HTMLElement>('.grid-event:not(.grid-event-overflow)')].map((block) =>
      block.querySelector('.event-title')?.textContent?.trim(),
    ),
  );
  const banners = [...container.querySelectorAll<HTMLElement>('.grid-banner')].map((banner) => ({
    title: banner.textContent?.trim(),
    column: banner.style.gridColumn,
    before: banner.classList.contains('continues-before'),
    after: banner.classList.contains('continues-after'),
  }));
  return {
    days,
    dates: days.map((day) => getLocalDateKey(new Date(day.timestamp))),
    blocks,
    banners,
    container,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => vi.useRealTimers());

describe.each(['timed', 'all-day'] as const)('Grid %s daily coverage', (kind) => {
  it.each([true, false])('keeps every occupied date with show_empty_days=%s', (showEmpty) => {
    const result = draw(
      [spanning(kind, 19, 21)],
      {},
      {
        time_grid: { show_empty_days: showEmpty },
      },
    );
    expect(result.dates).toEqual(
      showEmpty
        ? ['2026-06-19', '2026-06-20', '2026-06-21', '2026-06-22', '2026-06-23']
        : ['2026-06-19', '2026-06-20', '2026-06-21'],
    );
    if (kind === 'timed') {
      expect(result.blocks.flat()).toEqual(['Conference', 'Conference', 'Conference']);
      expect(result.banners).toEqual([]);
    } else {
      expect(result.banners).toEqual([
        { title: 'Conference', column: '2 / span 3', before: false, after: false },
      ]);
      expect(result.blocks.flat()).toEqual([]);
    }
  });

  it('does not depend on an unrelated event creating a continuation day', () => {
    const config = { time_grid: { show_empty_days: false } };
    const alone = draw([spanning(kind, 19, 21)], {}, config);
    const together = draw(
      [spanning(kind, 19, 21), spanning('timed', 21, 21, 'Unrelated', 'calendar.ben')],
      {},
      config,
    );
    expect(alone.dates).toEqual(['2026-06-19', '2026-06-20', '2026-06-21']);
    expect(together.dates).toEqual(alone.dates);
    expect(
      together.days.flatMap((day) => day.events.filter((event) => event.summary === 'Conference')),
    ).toHaveLength(3);
  });

  it.each([19, 20])('filters each date when the source starts on June %s', (from) => {
    const source = spanning(kind, from, 22);
    const result = draw(
      [source],
      { days_of_week: 'weekdays', split_multiday_events: true },
      { time_grid: { show_empty_days: false } },
    );
    expect(result.dates).toEqual(from === 19 ? ['2026-06-19', '2026-06-22'] : ['2026-06-22']);
    if (kind === 'timed') {
      expect(result.blocks.flat()).toHaveLength(from === 19 ? 2 : 1);
      expect(result.banners).toEqual([]);
    } else {
      expect(result.banners).toEqual([
        {
          title: 'Conference',
          column: from === 19 ? '2 / span 2' : '2 / span 1',
          before: from === 20,
          after: false,
        },
      ]);
    }
  });

  it('keeps an unfiltered calendar on the days the other calendar excludes', () => {
    const result = draw(
      [spanning(kind, 19, 22, 'School'), spanning(kind, 19, 22, 'Family', 'calendar.ben')],
      { days_of_week: 'weekdays' },
      { time_grid: { show_empty_days: false } },
    );
    expect(result.dates).toEqual(['2026-06-19', '2026-06-20', '2026-06-21', '2026-06-22']);
    expect(result.days.map((day) => day.events.map((event) => event.summary).sort())).toEqual([
      ['Family', 'School'],
      ['Family'],
      ['Family'],
      ['Family', 'School'],
    ]);
    if (kind === 'all-day') {
      expect(result.banners.filter((banner) => banner.title === 'Family')).toHaveLength(1);
      expect(result.banners.filter((banner) => banner.title === 'School')).toEqual([
        { title: 'School', column: '2 / span 1', before: false, after: true },
        { title: 'School', column: '5 / span 1', before: true, after: false },
      ]);
    }
  });

  it('keeps only the weekend continuation of a weekday-starting event', () => {
    const result = draw(
      [spanning(kind)],
      { days_of_week: 'weekends' },
      {
        time_grid: { show_empty_days: false },
      },
    );
    expect(result.dates).toEqual(['2026-06-20', '2026-06-21']);
    expect(result.days.flatMap((day) => day.events)).toHaveLength(2);
  });

  it('leaves filtered dates empty when the card keeps empty columns', () => {
    const result = draw([spanning(kind)], { days_of_week: 'weekdays' });
    expect(
      result.days.map((day) => day.events.filter((event) => !event._isEmptyDay).length),
    ).toEqual([1, 0, 0, 1, 0]);
    if (kind === 'all-day') {
      expect(result.banners.map((banner) => banner.column)).toEqual(['2 / span 1', '5 / span 1']);
    }
  });

  it('deduplicates sources once before deriving their daily coverage', () => {
    const source = spanning(kind, 19, 21);
    const result = draw(
      [source, { ...source, _entityId: 'calendar.ben' }],
      {},
      {
        filter_duplicates: true,
        time_grid: { show_empty_days: false },
      },
    );
    expect(result.days.map((day) => day.events.length)).toEqual([1, 1, 1]);
    if (kind === 'all-day') expect(result.banners).toHaveLength(1);
    else expect(result.blocks.flat()).toHaveLength(3);
    expect(source.start).toEqual(spanning(kind, 19, 21).start);
    expect(source.end).toEqual(spanning(kind, 19, 21).end);
  });

  it('bounds ongoing and long events to the configured date window', () => {
    const result = draw(
      [spanning(kind, 16, 27)],
      {},
      {
        days_to_show: 3,
        time_grid: { show_empty_days: false },
      },
    );
    expect(result.dates).toEqual(['2026-06-19', '2026-06-20', '2026-06-21']);
    expect(result.days.flatMap((day) => day.events)).toHaveLength(3);
  });

  it('keeps distinct events with identical fields without duplicating their occurrences', () => {
    const source = spanning(kind, 19, 21);
    const result = draw(
      [source, { ...source }],
      {},
      {
        time_grid: { show_empty_days: false },
      },
    );
    expect(result.days.map((day) => day.events.length)).toEqual([2, 2, 2]);
    if (kind === 'all-day') {
      expect(result.banners).toHaveLength(2);
      expect(result.banners.map((banner) => banner.column)).toEqual(['2 / span 3', '2 / span 3']);
    } else {
      expect(result.blocks.map((blocks) => blocks.length)).toEqual([2, 2, 2]);
    }
  });
});

describe('Grid segmentation boundaries', () => {
  it('hides finished timed segments without dropping the still-running continuation', () => {
    vi.setSystemTime(new Date('2026-06-21T12:00:00Z'));
    const result = draw(
      [spanning('timed')],
      {},
      {
        start_date: 'today-2',
        time_grid: { show_past_events: false, show_empty_days: false },
      },
    );
    expect(result.dates).toEqual(['2026-06-21', '2026-06-22']);
    expect(result.blocks.flat()).toEqual(['Conference', 'Conference']);
    expect(result.container.querySelectorAll('.time-countdown')).toHaveLength(0);
  });

  it('does not create an occupied day for an exclusive midnight endpoint', () => {
    const source = {
      ...spanning('timed', 19, 21),
      end: { dateTime: '2026-06-21T00:00:00Z' },
    };
    expect(draw([source], {}, { time_grid: { show_empty_days: false } }).dates).toEqual([
      '2026-06-19',
      '2026-06-20',
    ]);
  });

  it('preserves the source year when a title with an age marker crosses New Year', () => {
    vi.setSystemTime(new Date('2026-12-31T08:00:00Z'));
    const source: Types.CalendarEventData = {
      summary: 'Anniversary',
      description: 'YEAR=2000',
      start: { dateTime: '2026-12-31T09:00:00Z' },
      end: { dateTime: '2027-01-02T11:00:00Z' },
      _entityId: 'calendar.anna',
    };
    expect(draw([source], {}, { days_to_show: 3 }).blocks.flat()).toEqual([
      'Anniversary (26)',
      'Anniversary (26)',
      'Anniversary (26)',
    ]);
  });

  it('judges all-day expiry against the original final day, not each coverage day', () => {
    const source = spanning('all-day', 19, 21);
    const config = { time_grid: { show_past_events: false, show_empty_days: false } };
    expect(draw([source], { allday_expires_at: '10:00' }, config).banners).toHaveLength(1);
    vi.setSystemTime(new Date('2026-06-21T11:00:00Z'));
    expect(draw([source], { allday_expires_at: '10:00' }, config).banners).toEqual([]);
    expect(
      draw(
        [source],
        { allday_expires_at: '10:00' },
        {
          time_grid: { show_past_events: true, show_empty_days: false },
        },
      ).banners,
    ).toHaveLength(1);
  });

  it('rejects invalid and out-of-window spans without losing a valid neighbor', () => {
    const invalid = [
      { start: { dateTime: 'invalid' }, end: { dateTime: 'invalid' } },
      { start: { dateTime: '2026-06-20T10:00:00Z' }, end: { dateTime: '2026-06-20T09:00:00Z' } },
      { start: { dateTime: '2026-06-20T10:00:00Z' }, end: { dateTime: '2026-06-20T10:00:00Z' } },
      { start: { date: '2026-06-20' }, end: { date: '2026-06-20' } },
      { start: { date: '2026-06-21' }, end: { date: '2026-06-20' } },
      { start: { date: '2026-06-32' }, end: { date: '2026-07-03' } },
      { start: { date: 'invalid' }, end: { date: 'invalid' } },
      spanning('timed', 25, 26),
      spanning('all-day', 25, 26),
    ].map((event) => ({ ...event, summary: 'Invalid or outside', _entityId: 'calendar.anna' }));
    const result = draw(
      [...invalid, spanning('timed', 20, 20, 'Valid')],
      {},
      { time_grid: { show_empty_days: false } },
    );
    expect(result.dates).toEqual(['2026-06-20']);
    expect(result.blocks).toEqual([['Valid']]);
    expect(result.banners).toEqual([]);
  });
});
