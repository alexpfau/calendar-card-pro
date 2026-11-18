/**
 * Month as a registered view: its `month:` block, the options it reads and ignores, and the
 * grouping it shares with Grid.
 *
 * Every table is pinned by value, in both directions, rather than walked by its own keys: a
 * walk runs one fewer time when an entry leaves and says nothing (AGENTS.md, the table-walk
 * trap). The rows, the load and the pages are in `month-window.dst.test.ts`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import { fetchEventData, groupEventsByDay } from '../src/utils/events';
import * as Logger from '../src/utils/logger';

describe('the month block', () => {
  it('is registered as `month:`, with its own keys, defaults and divergent default', () => {
    expect(ViewConfig.viewBlockFor('month')).toEqual({
      blockKey: 'month',
      overrideKeys: ViewConfig.MONTH_OVERRIDE_KEYS,
      onlyKeys: ViewConfig.MONTH_ONLY_KEYS,
      onlyDefaults: ViewConfig.MONTH_DEFAULTS,
      defaultOverrides: { event_gap: '6px', show_past_events: true },
    });
    expect(ViewConfig.MONTH_ONLY_KEYS).toEqual([
      'row_height',
      'min_day_width',
      'day_list_events',
      'week_scroll',
      'week_scroll_min_width',
    ]);
    expect(ViewConfig.MONTH_DEFAULTS).toEqual({
      row_height: '112px',
      min_day_width: 80,
      day_list_events: 4,
      week_scroll: false,
      week_scroll_min_width: 0,
    });
  });

  it('overrides column’s shared options but the twenty it draws nothing for, and the bars', () => {
    const ignored = [
      'days_to_show',
      'show_empty_days',
      'show_empty_today',
      'empty_day_text',
      'empty_day_color',
      'split_multiday_events',
      'day_spacing',
      'day_separator_width',
      'day_separator_color',
      'week_separator_width',
      'week_separator_color',
      'month_separator_width',
      'month_separator_color',
      'week_number_background_color',
      'day_font_size',
      'month_font_size',
      'today_date_scale',
      'past_date_scale',
      'today_indicator_size',
      'time_position',
    ];
    expect(ViewConfig.MONTH_IGNORED_SHARED_KEYS).toEqual(ignored);
    const month: ReadonlyArray<string> = ViewConfig.MONTH_OVERRIDE_KEYS;
    const column: ReadonlyArray<string> = ViewConfig.COLUMN_OVERRIDE_KEYS;
    expect(column.filter((key) => !month.includes(key)).sort()).toEqual([...ignored].sort());
    expect(month.filter((key) => !column.includes(key))).toEqual(['multiday_banners']);
  });

  it('is not a view that fits its width by shedding days', () => {
    expect(ViewConfig.VIEWS_WITH_WIDTH_FALLBACK.has('month')).toBe(false);
    expect(ViewConfig.resolveColumnFit('month', buildConfig({ view: 'month' }), 200, null)).toEqual(
      { view: 'month', columns: 0 },
    );
  });

  it('takes Grid’s daily coverage, and draws under a layout class of its own', () => {
    expect(
      Object.fromEntries(
        ViewConfig.VIEWS.map((view) => [view, ViewConfig.multidaySplitPolicy(view)]),
      ),
    ).toEqual({ list: 'inherit', column: 'inherit', grid: 'never', month: 'never' });
    expect(ViewConfig.viewCssClass('month')).toBe('month-view');
  });
});

describe('the options month reads', () => {
  it('ignores exactly these, of every option VIEW_SCOPE scopes', () => {
    const ignored = Object.entries(ViewConfig.VIEW_SCOPE)
      .filter(([, views]) => !views.has('month'))
      .map(([key]) => key)
      .sort();
    expect(ignored).toEqual([
      'compact_days_to_show',
      'compact_events_complete_days',
      'compact_events_to_show',
      'date_vertical_alignment',
      'day_font_size',
      'day_separator_color',
      'day_separator_width',
      'day_spacing',
      'days_to_show',
      'empty_day_color',
      'empty_day_text',
      'event_order',
      'month_font_size',
      'month_separator_color',
      'month_separator_width',
      'past_date_scale',
      'show_empty_days',
      'show_empty_today',
      'skip_first_events',
      'split_multiday_events',
      'time_position',
      'today_date_scale',
      'today_indicator_position',
      'today_indicator_size',
      'today_weekday_color',
      'week_number_background_color',
      'week_separator_color',
      'week_separator_width',
    ]);
  });

  it('keeps out of its block exactly the shared options VIEW_SCOPE keeps out of it', () => {
    // Reconciled rather than listed twice: an option month cannot draw must neither be written
    // into `month:` nor offered there, and one its block refuses must be one it does not draw.
    const column: ReadonlyArray<string> = ViewConfig.COLUMN_OVERRIDE_KEYS;
    const scopedAway = Object.entries(ViewConfig.VIEW_SCOPE)
      .filter(([key, views]) => !views.has('month') && column.includes(key))
      .map(([key]) => key)
      .sort();
    expect(scopedAway.length).toBeGreaterThan(10);
    expect([...ViewConfig.MONTH_IGNORED_SHARED_KEYS].sort()).toEqual(scopedAway);
  });

  it('reads these scoped ones, which the day list draws or the bars follow', () => {
    const read = Object.entries(ViewConfig.VIEW_SCOPE)
      .filter(([, views]) => views.has('month'))
      .map(([key]) => key)
      .sort();
    expect(read).toEqual([
      'allday_badge',
      'allday_badge_color',
      'allday_badge_style',
      'event_gap',
      'event_spacing',
      'multiday_banners',
      'open_links',
      'show_countdown_allday',
      'show_description_allday',
      'show_location_allday',
      'show_multiday_allday_time',
      'show_now_indicator',
      'show_single_allday_time',
      'time_max_lines',
    ]);
  });

  it('sets a day list’s events apart by default, as List does with a gap, unless its block says', () => {
    // A divergent default: the top level's 0px keeps List and Columns joined and reaches
    // neither Month nor its day list, which only `month:` changes.
    const resolved = (config: Partial<Types.Config>) =>
      Object.fromEntries(
        ViewConfig.VIEWS.map((view) => [
          view,
          ViewConfig.resolveEffectiveConfig(buildConfig(config), view).event_gap,
        ]),
      );
    expect(resolved({})).toEqual({ list: '0px', column: '0px', grid: '0px', month: '6px' });
    expect(resolved({ event_gap: '10px' })).toEqual({
      list: '10px',
      column: '10px',
      grid: '10px',
      month: '6px',
    });
    expect(resolved({ month: { event_gap: '0px' } }).month).toBe('0px');
    expect(resolved({ month: { event_gap: '0.5em' } }).month).toBe('0.5em');
    expect(ViewConfig.appliesToView('event_gap', 'month')).toBe(true);
  });

  it('shows past events by default, and a block or the card can still hide them', () => {
    expect(ViewConfig.resolveEffectiveConfig(buildConfig({}), 'month').show_past_events).toBe(true);
    expect(
      ViewConfig.resolveEffectiveConfig(
        buildConfig({ month: { show_past_events: false } }),
        'month',
      ).show_past_events,
    ).toBe(false);
    expect(ViewConfig.resolveViewOption(buildConfig({}), 'show_past_events', 'month')).toBe(true);
  });
});

describe('a month-only option', () => {
  it.each([
    ['row_height', 120, '120px'],
    ['row_height', '8em', '8em'],
    ['row_height', '9 em', '9em'],
    // Anything that would size a week by its events, or by a height the month does not have.
    ['row_height', 'auto', '112px'],
    ['row_height', '15%', '112px'],
    ['row_height', 'fit-content', '112px'],
    ['row_height', 'calc(50% + 10px)', '112px'],
    ['row_height', '-20px', '112px'],
    ['min_day_width', '72', 72],
    ['min_day_width', 0, 80],
    ['min_day_width', -5, 80],
    ['min_day_width', 'wide', 80],
    ['week_scroll', true, true],
    ['week_scroll', 'yes', false],
    ['week_scroll_min_width', 0, 0],
    ['week_scroll_min_width', '600', 600],
    ['week_scroll_min_width', -1, 0],
    // A whole number of events from 0, which keeps no room; a fraction is rounded down.
    ['day_list_events', 6, 6],
    ['day_list_events', '3', 3],
    ['day_list_events', 0, 0],
    ['day_list_events', 2.7, 2],
    ['day_list_events', -1, 4],
    ['day_list_events', 'many', 4],
  ] as const)('reads %s: %j as %j', (key, value, expected) => {
    expect(ViewConfig.normalizeMonthValue(key, value)).toBe(expected);
    expect(
      ViewConfig.resolveMonthOption(
        buildConfig({ month: { [key]: value } as Types.MonthOverrides }),
        key,
      ),
    ).toBe(expected);
  });

  it('says once that a row height it cannot draw falls back to its default', () => {
    const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);
    try {
      ViewConfig.validateColumnOverrides(buildConfig({ month: { row_height: 'auto' } }));
      ViewConfig.validateColumnOverrides(buildConfig({ month: { row_height: '9em' } }));
      expect(warn.mock.calls.map((call) => String(call[0]))).toEqual([
        'Invalid month.row_height "auto": expected a non-negative CSS length such as "112px" or ' +
          '"8em", not a percentage or a keyword. Falling back to "112px".',
      ]);
    } finally {
      warn.mockRestore();
    }
  });

  it('falls back to its default with no block', () => {
    for (const key of ViewConfig.MONTH_ONLY_KEYS) {
      expect(ViewConfig.resolveMonthOption(buildConfig({}), key)).toBe(
        ViewConfig.MONTH_DEFAULTS[key],
      );
    }
  });

  it('is reported where it does nothing: at the top level, or in another view’s block', () => {
    expect(
      ViewConfig.findMisplacedOptions({ row_height: '90px', column: { week_scroll: true } }),
    ).toEqual([
      { kind: 'view-only', key: 'row_height', from: null, to: ['month'] },
      { kind: 'wrong-view', key: 'week_scroll', from: 'column', to: ['month'] },
    ]);
    // Nor does the time's placement: the day list puts every time beside its title.
    expect(ViewConfig.findMisplacedOptions({ month: { time_position: 'below' } })).toEqual([
      expect.objectContaining({ kind: 'wrong-view', key: 'time_position', from: 'month' }),
    ]);
    // And a shared option month draws nothing for, written in its block.
    expect(ViewConfig.findMisplacedOptions({ month: { days_to_show: 9 } })).toEqual([
      {
        kind: 'wrong-view',
        key: 'days_to_show',
        from: 'month',
        to: ['list', 'column', 'time_grid'],
      },
    ]);
  });
});

describe('grouping for month', () => {
  /** A three-day all-day event, Monday to Wednesday. */
  const TRIP: Types.CalendarEventData = {
    summary: 'Trip',
    start: { date: '2026-09-14' },
    end: { date: '2026-09-17' },
  };

  /** A timed event over two days, Monday morning to Wednesday noon. */
  const CONFERENCE: Types.CalendarEventData = {
    summary: 'Conference',
    start: { dateTime: '2026-09-14T10:00:00Z' },
    end: { dateTime: '2026-09-16T12:00:00Z' },
  };

  async function grouped(
    view: Types.EffectiveView,
    overrides: Partial<Types.Config> = {},
    event: Types.CalendarEventData = TRIP,
  ): Promise<Types.EventsByDay[]> {
    const config = buildConfig({
      view,
      entities: ['calendar.anna', 'calendar.ben'],
      start_date: '2026-09-14',
      days_to_show: 7,
      show_past_events: true,
      ...overrides,
    });
    const hass: Types.Hass = {
      states: {},
      locale: { language: 'en' },
      callApi: async () => [event],
      callService: vi.fn(),
    };
    const result = await fetchEventData(hass, config, 'month-grouping', 'network');
    return groupEventsByDay(result.events, config, false, 'en', view, hass);
  }

  /** Each day holding an event, and the calendars its events are from. */
  const summary = (days: Types.EventsByDay[]) =>
    days
      .map((day) => [day.day, day.events.filter((event) => !event._isEmptyDay)] as const)
      .filter(([, events]) => events.length > 0)
      .map(([date, events]) => [date, events.map((event) => event._entityId)]);

  /** One field of every event drawn, in order. */
  const each = <K extends keyof Types.CalendarEventData>(days: Types.EventsByDay[], key: K) =>
    days.flatMap((day) =>
      day.events.filter((event) => !event._isEmptyDay).map((event) => event[key]),
    );

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T10:00:00Z'));
    localStorage.clear();
  });

  afterEach(() => vi.useRealTimers());

  it('keeps every day of a duplicate the first calendar wins, as grid does', async () => {
    // One copy a day, Anna's, on each of the three days: the whole event's winner does not
    // stand for its other days, which Grid's coverage draws as segments of their own.
    for (const view of ['grid', 'month'] as const) {
      expect(summary(await grouped(view, { filter_duplicates: true })), view).toEqual([
        [14, ['calendar.anna']],
        [15, ['calendar.anna']],
        [16, ['calendar.anna']],
      ]);
    }
  });

  it('keeps each day of an all-day event as a segment of its whole, as grid does', async () => {
    const source = { start: TRIP.start, end: TRIP.end };
    expect(each(await grouped('month'), '_gridSource')).toEqual(Array(6).fill(source));
    // The control: the list's own splitter keeps no such record.
    expect(each(await grouped('list', { split_multiday_events: true }), '_gridSource')).toEqual(
      Array(6).fill(undefined),
    );
  });

  it('draws a timed event a full day or longer as a banner while multiday_banners is on', async () => {
    expect(each(await grouped('month', {}, CONFERENCE), '_gridBanner')).toEqual(
      Array(6).fill(true),
    );
    expect(
      each(
        await grouped('month', { month: { multiday_banners: false } }, CONFERENCE),
        '_gridBanner',
      ),
    ).toEqual(Array(6).fill(undefined));
  });

  it('stamps no day of its event, as grid does not', async () => {
    const month = await grouped('month', { show_progress_bar: true });
    expect(each(month, '_dayOfEvent')).toEqual(Array(6).fill(undefined));
    // The control: the list does, on the days it splits the trip into.
    const list = await grouped('list', { show_progress_bar: true, split_multiday_events: true });
    expect(each(list, '_dayOfEvent').map((stamp) => stamp?.day)).toEqual([1, 1, 2, 2, 3, 3]);
  });
});
