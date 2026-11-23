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
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import { fetchEventData, groupEventsByDay } from '../src/utils/events';
import * as Logger from '../src/utils/logger';
import * as MonthDay from '../src/utils/month-day';

/**
 * The shared options Month keeps at their shipped values (`MONTH_PINNED`), in its order: a day's
 * list and the panel draw an event's title, time, location and forecast, and leave the rest to the
 * event's details.
 */
const PINNED = [
  'show_description',
  'show_description_allday',
  'description_font_size',
  'description_color',
  'description_icon_size',
  'description_max_lines',
  'show_countdown',
  'show_countdown_allday',
  'countdown_max_days',
  'countdown_exact_days',
  'show_progress_bar',
  'progress_bar_color',
  'progress_bar_height',
  'progress_bar_width',
  'allday_badge',
  'allday_badge_style',
  'allday_badge_color',
  'title_max_lines',
  'time_max_lines',
  'location_max_lines',
  'event_icon_vertical_alignment',
] as const;

describe('the month block', () => {
  it('is registered as `month:`, with its own keys, defaults and divergent default', () => {
    expect(ViewConfig.viewBlockFor('month')).toEqual({
      blockKey: 'month',
      overrideKeys: ViewConfig.MONTH_OVERRIDE_KEYS,
      onlyKeys: ViewConfig.MONTH_ONLY_KEYS,
      onlyDefaults: ViewConfig.MONTH_DEFAULTS,
      defaultOverrides: {
        day_font_size: '16px',
        weekday_font_size: '16px',
        week_number_font_size: '13.5px',
        month_font_size: '16px',
        vertical_line_width: '3px',
        event_gap: '6px',
        show_past_events: true,
      },
      pinned: ViewConfig.MONTH_PINNED,
    });
    expect(ViewConfig.MONTH_ONLY_KEYS).toEqual([
      'narrow_card_height',
      'narrow_card_max_height',
      'min_day_width',
      'start',
      'weeks',
      'weekend_background_color',
      'today_background_color',
      'cell_event_font_size',
      'cell_time_font_size',
    ]);
    // The narrow form's two heights have no default of their own: unset, each takes the card's
    // `card_height` and `card_max_height` as Month resolves them (`resolveCardSize`).
    expect(ViewConfig.MONTH_DEFAULTS).toEqual({
      min_day_width: 80,
      // A calendar month, in the six weeks that hold any month; `weeks` is read only under
      // `start: week`.
      start: 'month',
      weeks: 6,
      // Grid's two tints, under Grid's defaults.
      weekend_background_color: 'color-mix(in srgb, var(--primary-text-color) 4%, transparent)',
      today_background_color: 'transparent',
      // What the wide month draws in its days: 12px titles and 10px times.
      cell_event_font_size: '12px',
      cell_time_font_size: '10px',
    });
    expect(ViewConfig.MONTH_DEFAULTS.weekend_background_color).toBe(
      ViewConfig.TIME_GRID_DEFAULTS.weekend_background_color,
    );
    expect(ViewConfig.MONTH_DEFAULTS.today_background_color).toBe(
      ViewConfig.TIME_GRID_DEFAULTS.today_background_color,
    );
  });

  it('overrides column’s shared options but the forty-three it draws nothing for or pins, and the bars', () => {
    const ignored = [
      'height',
      'max_height',
      'days_to_show',
      'show_empty_days',
      'show_empty_today',
      'empty_day_text',
      'empty_day_color',
      'split_multiday_events',
      'show_multiday_allday_time',
      'day_spacing',
      'day_separator_width',
      'day_separator_color',
      'week_separator_width',
      'week_separator_color',
      'month_separator_width',
      'month_separator_color',
      'week_number_background_color',
      'today_date_scale',
      'past_date_scale',
      'today_indicator_size',
      'time_position',
      'time_icon_size',
      ...PINNED,
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
    expect(ignored).toEqual(
      [
        'compact_days_to_show',
        'compact_events_complete_days',
        'compact_events_to_show',
        'date_vertical_alignment',
        'day_separator_color',
        'day_separator_width',
        'day_spacing',
        'days_to_show',
        'empty_day_color',
        'empty_day_text',
        'event_order',
        'height',
        'max_height',
        'month_separator_color',
        // List's month separator, which the Month layout does not draw, so it has no month's name
        // to set.
        'month_separator_label',
        'month_separator_label_color',
        'month_separator_label_font_size',
        'month_separator_width',
        'past_date_scale',
        'show_empty_days',
        'show_empty_today',
        'show_multiday_allday_time',
        'skip_first_events',
        'split_multiday_events',
        'time_icon_size',
        'time_position',
        'today_date_scale',
        'today_indicator_position',
        'today_indicator_size',
        'today_weekday_color',
        'week_number_background_color',
        'week_separator_color',
        'week_separator_width',
        ...PINNED,
      ].sort(),
    );
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
      'event_gap',
      'event_spacing',
      'multiday_banners',
      'open_links',
      'show_location_allday',
      'show_now_indicator',
      'show_single_allday_time',
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

  it('sizes its dates, names, week numbers and stripe from its titles, which only its block changes', () => {
    // Divergent defaults, as the gap is: a list's 26px date column stands alone, a month's day
    // number sits in its cell's corner over the lines, and all five follow the 12px titles.
    const month = (config: Partial<Types.Config>) =>
      ViewConfig.resolveEffectiveConfig(buildConfig(config), 'month');
    const sizes = (config: Partial<Types.Config>) => {
      const resolved = month(config);
      return [
        resolved.day_font_size,
        resolved.weekday_font_size,
        resolved.week_number_font_size,
        resolved.month_font_size,
        resolved.vertical_line_width,
      ];
    };
    expect(sizes({})).toEqual(['16px', '16px', '13.5px', '16px', '3px']);
    expect(
      sizes({
        day_font_size: '30px',
        weekday_font_size: '20px',
        week_number_font_size: '16px',
        month_font_size: '14px',
        vertical_line_width: '6px',
      }),
    ).toEqual(['16px', '16px', '13.5px', '16px', '3px']);
    expect(
      sizes({
        month: {
          day_font_size: '1.1rem',
          weekday_font_size: '1em',
          week_number_font_size: '12px',
          month_font_size: '0.8em',
          vertical_line_width: '2px',
        },
      }),
    ).toEqual(['1.1rem', '1em', '12px', '0.8em', '2px']);
    // A list keeps the card's own.
    const list = ViewConfig.resolveEffectiveConfig(buildConfig({}), 'list');
    expect([
      list.day_font_size,
      list.weekday_font_size,
      list.week_number_font_size,
      list.month_font_size,
      list.vertical_line_width,
    ]).toEqual(['26px', '14px', '12px', '12px', '2px']);
    expect(
      ViewConfig.resolveEffectiveConfig(
        buildConfig({ month: { month_font_size: '10px' } }),
        'month',
      ).month_font_size,
    ).toBe('10px');
    for (const key of [
      'day_font_size',
      'weekday_font_size',
      'week_number_font_size',
      'vertical_line_width',
    ] as const) {
      expect(ViewConfig.appliesToView(key, 'month')).toBe(true);
    }
    expect(ViewConfig.appliesToView('month_font_size', 'month')).toBe(true);
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

describe('what month keeps at its shipped values', () => {
  /** A value no default holds, so a pin cannot pass by coincidence. */
  const written = (key: string): unknown => {
    const shipped = (Config.DEFAULT_CONFIG as unknown as Record<string, unknown>)[key];
    if (typeof shipped === 'boolean') return !shipped;
    if (typeof shipped === 'number' || shipped === undefined) return 3;
    return key.endsWith('color') ? 'rgb(1, 2, 3)' : key === 'allday_badge' ? 'title' : '37px';
  };
  const everything = Object.fromEntries(PINNED.map((key) => [key, written(key)]));

  it('is the shipped value of each, in order', () => {
    expect(Object.keys(ViewConfig.MONTH_PINNED)).toEqual([...PINNED]);
    for (const key of PINNED) {
      expect([key, ViewConfig.MONTH_PINNED[key]]).toEqual([key, Config.DEFAULT_CONFIG[key]]);
    }
  });

  it('wins over the card and the month block, in both resolvers, and nowhere but Month', () => {
    const config = buildConfig({ ...everything, month: everything } as Partial<Types.Config>);
    const month = ViewConfig.resolveEffectiveConfig(config, 'month');
    const list = ViewConfig.resolveEffectiveConfig(config, 'list');
    for (const key of PINNED) {
      expect([key, month[key]]).toEqual([key, Config.DEFAULT_CONFIG[key]]);
      expect([key, ViewConfig.resolveViewOption(config, key, 'month')]).toEqual([
        key,
        Config.DEFAULT_CONFIG[key],
      ]);
      // The control: the card's own value reaches List.
      expect([key, list[key]]).toEqual([key, written(key)]);
    }
  });

  it('reports each where a month block holds it, as an option the block does not read', () => {
    expect(
      ViewConfig.findMisplacedOptions({ month: { show_description: true, title_max_lines: 2 } }),
    ).toEqual([
      expect.objectContaining({ kind: 'wrong-view', key: 'show_description', from: 'month' }),
      expect.objectContaining({ kind: 'wrong-view', key: 'title_max_lines', from: 'month' }),
    ]);
  });
});

describe('a month-only option', () => {
  it.each([
    ['min_day_width', '72', 72],
    ['min_day_width', 0, 80],
    ['min_day_width', -5, 80],
    ['min_day_width', 'wide', 80],
    // Any string is a color, as Grid's tints take it; anything else is the default.
    ['weekend_background_color', 'rgb(1, 2, 3)', 'rgb(1, 2, 3)'],
    ['weekend_background_color', 'transparent', 'transparent'],
    [
      'weekend_background_color',
      0,
      'color-mix(in srgb, var(--primary-text-color) 4%, transparent)',
    ],
    ['today_background_color', 'var(--primary-color)', 'var(--primary-color)'],
    ['today_background_color', 12, 'transparent'],
    // Any font size the card's own take; anything else is the block's default.
    ['cell_event_font_size', '15px', '15px'],
    ['cell_event_font_size', '0.9 rem', '0.9rem'],
    ['cell_event_font_size', 11, '11px'],
    ['cell_event_font_size', 'big', '12px'],
    ['cell_time_font_size', 'smaller', 'smaller'],
    ['cell_time_font_size', '-2px', '10px'],
  ] as const)('reads %s: %j as %j', (key, value, expected) => {
    expect(ViewConfig.normalizeMonthValue(key, value)).toBe(expected);
    expect(
      ViewConfig.resolveMonthOption(
        buildConfig({ month: { [key]: value } as Types.MonthOverrides }),
        key,
      ),
    ).toBe(expected);
  });

  it('is not row_height, day_list_events or week scrolling, which Month never shipped: each is unrecognized', () => {
    // None was in a release, so none has a migration: written in `month:`, each is reported as any
    // unknown key is, once, and read by nothing.
    const unshipped = {
      row_height: '120px',
      day_list_events: 3,
      week_scroll: true,
      week_scroll_min_width: 600,
    };
    expect(ViewConfig.findMisplacedOptions({ month: unshipped })).toEqual(
      Object.keys(unshipped).map((key) => ({ kind: 'unknown', key, from: 'month', to: [] })),
    );
    const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);
    try {
      ViewConfig.validateColumnOverrides(buildConfig({ month: unshipped } as never));
      expect(warn.mock.calls.map((call) => String(call[0]))).toEqual([
        'Ignoring "month.row_height": not a recognized option.',
        'Ignoring "month.day_list_events": not a recognized option.',
        'Ignoring "month.week_scroll": not a recognized option.',
        'Ignoring "month.week_scroll_min_width": not a recognized option.',
      ]);
    } finally {
      warn.mockRestore();
    }
    for (const key of Object.keys(unshipped)) {
      expect(Object.keys(ViewConfig.MONTH_DEFAULTS)).not.toContain(key);
    }
  });

  it('says once that a cell size it cannot use falls back to the block’s default', () => {
    const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);
    try {
      ViewConfig.validateColumnOverrides(buildConfig({ month: { cell_event_font_size: 'big' } }));
      ViewConfig.validateColumnOverrides(buildConfig({ month: { cell_time_font_size: '1em' } }));
      expect(warn.mock.calls.map((call) => String(call[0]))).toEqual([
        'Invalid month.cell_event_font_size "big": expected a CSS font size such as "14px", ' +
          '"1.2em", "120%" or "large". Falling back to "12px".',
      ]);
    } finally {
      warn.mockRestore();
    }
  });

  it('reads `start` as `week` or `month`, and `weeks` as a whole number from 1 to 6', () => {
    const start = (value: unknown) =>
      ViewConfig.resolveMonthOption(buildConfig({ month: { start: value } } as never), 'start');
    expect(start('week')).toBe('week');
    expect(start('month')).toBe('month');
    expect(start('Week')).toBe('month');
    expect(start(true)).toBe('month');

    const weeks = (value: unknown) =>
      ViewConfig.resolveMonthOption(buildConfig({ month: { weeks: value } } as never), 'weeks');
    expect([1, 4, 6].map(weeks)).toEqual([1, 4, 6]);
    expect(['3', 2.6, 0, -2, 9].map(weeks)).toEqual([3, 3, 1, 1, 6]);
    expect(['', 'many', null, Number.NaN].map(weeks)).toEqual([6, 6, 6, 6]);
  });

  it('draws six weeks unless `start: week` asks for its own count', () => {
    const rows = (month: Record<string, unknown>) =>
      ViewConfig.monthWeekRows(buildConfig({ month } as never));
    expect(rows({})).toBe(6);
    expect(rows({ weeks: 3 })).toBe(6);
    expect(rows({ start: 'week' })).toBe(6);
    expect(rows({ start: 'week', weeks: 3 })).toBe(3);
    expect(ViewConfig.monthPageDays(buildConfig({ month: { start: 'week', weeks: 2 } }))).toBe(14);
  });

  it('falls back to its default with no block', () => {
    for (const key of Object.keys(ViewConfig.MONTH_DEFAULTS) as Array<
      keyof typeof ViewConfig.MONTH_DEFAULTS
    >) {
      expect(ViewConfig.resolveMonthOption(buildConfig({}), key)).toBe(
        ViewConfig.MONTH_DEFAULTS[key],
      );
    }
  });

  it('is reported where it does nothing: at the top level, or in another view’s block', () => {
    expect(
      ViewConfig.findMisplacedOptions({
        narrow_card_height: '90px',
        column: { cell_event_font_size: '12px' },
      }),
    ).toEqual([
      { kind: 'view-only', key: 'narrow_card_height', from: null, to: ['month'] },
      { kind: 'wrong-view', key: 'cell_event_font_size', from: 'column', to: ['month'] },
    ]);
    // A tint is Grid's and Month's, each in its own block, so a misplaced one names both.
    expect(
      ViewConfig.findMisplacedOptions({
        weekend_background_color: 'red',
        column: { today_background_color: 'red' },
      }),
    ).toEqual([
      {
        kind: 'view-only',
        key: 'weekend_background_color',
        from: null,
        to: ['time_grid', 'month'],
      },
      {
        kind: 'wrong-view',
        key: 'today_background_color',
        from: 'column',
        to: ['time_grid', 'month'],
      },
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

  it('lists and groups a day without descriptions whatever a calendar says, and keeps a calendar’s privacy', async () => {
    const DENTIST: Types.CalendarEventData = {
      summary: 'Dentist',
      description: 'Bring the card',
      start: { dateTime: '2026-09-14T10:00:00Z' },
      end: { dateTime: '2026-09-14T11:00:00Z' },
    };
    const listed = async (
      entry: Partial<Types.EntityConfig>,
      view: Types.EffectiveView,
      through: 'day list' | 'grouping' = 'day list',
    ) => {
      const config = buildConfig({
        view,
        entities: [{ entity: 'calendar.anna', ...entry }],
        start_date: '2026-09-14',
        days_to_show: 7,
        show_past_events: true,
      });
      const hass: Types.Hass = {
        states: {},
        locale: { language: 'en' },
        callApi: async () => [DENTIST],
        callService: vi.fn(),
      };
      const { events } = await fetchEventData(hass, config, `month-description-${view}`, 'network');
      const resolved = ViewConfig.resolveEffectiveConfig(config, view);
      const day = new Date('2026-09-14T00:00:00Z');
      return view === 'month' && through === 'day list'
        ? MonthDay.monthDayEvents(events, resolved, day, 'en', hass)
        : groupEventsByDay(events, resolved, false, 'en', view, hass).flatMap((d) => d.events);
    };
    const [shown] = await listed({ show_description: true }, 'month');
    expect([shown.summary, shown.description]).toEqual(['Dentist', '']);
    // The control: the same calendar's list draws it.
    expect((await listed({ show_description: true }, 'list'))[0].description).toBe(
      'Bring the card',
    );
    // Month's own grouping, which search reads, holds none either, so search cannot find it.
    const [grouped] = await listed({ show_description: true }, 'month', 'grouping');
    expect([grouped.summary, grouped.description]).toEqual(['Dentist', '']);
    // A calendar's own `false` stays on the row, so its details keep the description private.
    const [hidden] = await listed({ show_description: false }, 'month');
    expect(hidden._matchedConfig?.show_description).toBe(false);
    expect(shown._matchedConfig?.show_description).toBeUndefined();
  });
});
