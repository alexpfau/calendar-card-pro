/**
 * The page registry: where every field the builders build is drawn.
 *
 * Placement, headings and their order are the approved page map, and each field's appearance
 * says how a page shows it. Nothing here decides whether a field exists; the builders do, and
 * `tests/editor-page-registry.test.ts` reconciles this table against everything they build, in
 * both directions, over the whole gate corpus, and pins where each field goes against that map.
 */

import {
  mdiCalendarFilterOutline,
  mdiCalendarText,
  mdiCalendarWeekBegin,
  mdiCardTextOutline,
  mdiGestureTapButton,
  mdiResize,
  mdiTimelineClockOutline,
  mdiWeatherPartlyCloudy,
} from '@mdi/js';

import { type FieldId, parseFieldId } from './field-index';
import { destination } from './routing';
import { entityConfigKeys } from './schemas/entity';
import { configKeysForField } from './synthetic';
import { BLOCK_KEYS } from './workspace';
import type * as Types from '../../config/types';
import { VIEWS, appliesToView, entityScopeFor } from '../../config/view';

export type PageId =
  | 'which_events'
  | 'card_header'
  | 'day_header'
  | 'events'
  | 'size_spacing'
  | 'grid'
  | 'weather'
  | 'taps_refresh';

export type FamilyId =
  'compact_mode' | 'past_days' | 'weekend_colors' | 'column_density' | 'grid_density' | 'replace';

/**
 * How a page shows a field.
 *
 * - `essential`: always live while present.
 * - `add`: live when stored, inherited and different, or added; else in its heading's Add row.
 * - `with`: a mode control's value field, live with its mode. Match Against serves two lists,
 *   so it names both, and either asks for it.
 * - `family`: shown, added and removed with its family.
 * - `chips`: drawn as a toggle chip (`chips.ts`), with the other chips of its kind on its page.
 * - `segmented`: drawn as a card-built radio group of its options with no head row: Calendar
 *   Filter's Off, Menu and Chips, and Start Date's chips.
 * - `button-rows`: one of the toolbar's own buttons' fields, drawn in each button's row.
 */
export type Appearance =
  | 'essential'
  | 'add'
  | { readonly with: FieldId | ReadonlyArray<FieldId> }
  | { readonly family: FamilyId }
  | { readonly chips: 'parts' | 'toolbar' }
  | 'segmented'
  | 'button-rows';

/** What a page draws besides its fields, at one heading. */
export type HeadingExtra = 'own-buttons' | 'weather-calendar-links' | 'split';

/** One heading of a page, and the fields under it in order. */
export interface HeadingDef {
  /** String key of the heading. */
  readonly key?: string;
  /** A different heading in one layout: Icon & Badge is Icons in Grid. */
  readonly keyByView?: Partial<Record<Types.EffectiveView, string>>;
  /** The line under the heading, as Countdown & Progress has today; a family's is its own. */
  readonly helperKey?: string;
  readonly fields: ReadonlyArray<readonly [FieldId, Appearance]>;
  readonly extras?: ReadonlyArray<HeadingExtra>;
  /**
   * A link to the heading on another page that answers the neighboring question, led by
   * `textKey`, the question it answers ("Dates of past days:").
   */
  readonly crossLink?: {
    readonly page: PageId;
    readonly heading: string;
    readonly textKey: string;
  };
  /**
   * A line pointing to a setting on the same page that answers the question people bring to this
   * heading by mistake, led by `textKey`: Who Sees It's to Days of the Week. Following it opens the
   * setting, added where it waits in an Add row.
   */
  readonly pointer?: { readonly field: FieldId; readonly textKey: string };
}

/** One section page. */
export interface PageDef {
  readonly id: PageId;
  readonly titleKey: string;
  readonly iconPath: string;
  /** The Grid page, shown only while Grid is the scope. */
  readonly onlyIn?: Types.EffectiveView;
  readonly noteKey?: string;
  readonly headings: ReadonlyArray<HeadingDef>;
  /**
   * The settings the overview's row for this page names with their values, in order; each one
   * only where it is present (`summary.ts`). A toggle chip stands for its whole group, named by
   * the chips pressed.
   */
  readonly summary: ReadonlyArray<FieldId>;
}

const E = 'essential';
const A = 'add';
const PART: Appearance = { chips: 'parts' };
const CONTROL: Appearance = { chips: 'toolbar' };

/**
 * A mode value.
 *
 * @param mode - The mode control, or the controls any one of which asks for it
 * @returns The appearance
 */
function withMode(mode: FieldId | ReadonlyArray<FieldId>): Appearance {
  return { with: mode };
}

/**
 * A family member.
 *
 * @param family - The family
 * @returns The appearance
 */
function member(family: FamilyId): Appearance {
  return { family };
}

const W = 'weather:weather.';

export const PAGES: ReadonlyArray<PageDef> = [
  {
    id: 'which_events',
    titleKey: 'page.which_events',
    iconPath: mdiCalendarFilterOutline,
    noteKey: 'page.which_events.note',
    summary: [
      'content:days_to_show',
      'content:start_date_mode',
      'content:show_past_events',
      'content:show_empty_days',
    ],
    headings: [
      {
        // First: how many days, and from when, is the widest question this page answers.
        key: 'heading.date_range',
        fields: [
          ['content:days_to_show', E],
          ['content:start_date_mode', 'segmented'],
          ['content:start_date_fixed', withMode('content:start_date_mode')],
          ['content:start_date_offset', withMode('content:start_date_mode')],
        ],
      },
      {
        key: 'heading.selection_and_order',
        fields: [
          ['content:event_type', A],
          ['content:filter_duplicates_mode', A],
          ['content:duplicate_accent_color', A],
          ['content:event_order', A],
          ['content:skip_first_events', A],
        ],
      },
      {
        key: 'heading.past_events',
        crossLink: {
          page: 'day_header',
          heading: 'past_days',
          textKey: 'nav.cross_link.past_days',
        },
        fields: [
          ['content:show_past_events', E],
          ['events:past_event_opacity', A],
        ],
      },
      {
        key: 'heading_multiday',
        fields: [
          ['content:split_multiday_events', A],
          ['content:multiday_banners', A],
        ],
      },
      {
        key: 'heading_nothing',
        fields: [
          ['content:show_empty_days', E],
          ['content:show_empty_today', E],
          ['content:empty_day_text', E],
          ['content:empty_day_color', A],
          ['content:hide_when_empty', A],
        ],
      },
      {
        key: 'compact_mode',
        fields: [
          ['content:compact_days_to_show', member('compact_mode')],
          ['content:compact_events_to_show', member('compact_mode')],
          ['content:compact_events_complete_days', member('compact_mode')],
        ],
      },
    ],
  },
  {
    id: 'card_header',
    titleKey: 'panel.card',
    iconPath: mdiCardTextOutline,
    summary: ['card:title', 'card:toolbar.show', 'card:toolbar.add_event'],
    headings: [
      {
        key: 'heading.general',
        fields: [
          ['card:title', E],
          ['card:title_font_size', A],
          ['card:title_color', A],
          ['card:background_color', A],
          ['content:language_mode', A],
        ],
      },
      {
        key: 'heading_toolbar',
        fields: [
          ['card:toolbar.show', E],
          ['card:toolbar.add_event', CONTROL],
          ['card:toolbar.view_switcher', CONTROL],
          ['card:toolbar.reset', CONTROL],
          ['card:toolbar.refresh', CONTROL],
          ['card:toolbar.search', CONTROL],
          ['card:toolbar.navigation', CONTROL],
          // Right after the controls: it qualifies one of them, and matters only while it is on.
          ['card:toolbar.view_switcher_layouts', A],
          ['card:toolbar.legend', 'segmented'],
        ],
      },
      {
        key: 'toolbar.buttons.heading',
        extras: ['own-buttons'],
        fields: [
          ['button:icon', 'button-rows'],
          ['button:name', 'button-rows'],
          ['button:entity', 'button-rows'],
          ['button:tap_action', 'button-rows'],
        ],
      },
    ],
  },
  {
    id: 'day_header',
    titleKey: 'panel.day_header',
    iconPath: mdiCalendarWeekBegin,
    summary: ['day_header:week_number_mode', 'day_header:today_indicator_style'],
    headings: [
      {
        key: 'heading.date',
        fields: [
          ['day_header:date_vertical_alignment', A],
          ['day_header:weekday_font_size', A],
          ['day_header:weekday_color', A],
          ['day_header:day_font_size', A],
          ['day_header:day_color', A],
          ['day_header:show_month', E],
          ['day_header:month_font_size', A],
          ['day_header:month_color', A],
        ],
      },
      {
        key: 'heading_gap_and_rule',
        fields: [
          ['day_header:column.day_header_gap', A],
          ['day_header:column.day_header_separator_width', A],
          ['day_header:column.day_header_separator_color', A],
          ['day_header:time_grid.day_header_gap', A],
          ['day_header:time_grid.day_header_separator_width', A],
          ['day_header:time_grid.day_header_separator_color', A],
        ],
      },
      {
        key: 'heading.weeks',
        fields: [
          ['content:first_day_of_week', E],
          ['day_header:week_number_mode', E],
          ['day_header:show_current_week_number', E],
          ['day_header:week_number_font_size', A],
          ['day_header:week_number_color', A],
          ['day_header:week_number_background_color', A],
        ],
      },
      {
        key: 'heading_today',
        fields: [
          ['day_header:today_date_scale', A],
          ['day_header:today_date_font_weight', A],
          ['day_header:today_weekday_color', A],
          ['day_header:today_day_color', A],
          ['day_header:today_month_color', A],
        ],
      },
      {
        key: 'today_indicator',
        fields: [
          ['day_header:today_indicator_style', E],
          ['day_header:today_indicator_icon', withMode('day_header:today_indicator_style')],
          ['day_header:today_indicator_custom', withMode('day_header:today_indicator_style')],
          ['day_header:today_indicator_color', A],
          ['day_header:today_indicator_size', A],
          ['day_header:today_indicator_position', A],
        ],
      },
      {
        key: 'past_days',
        crossLink: {
          page: 'which_events',
          heading: 'heading.past_events',
          textKey: 'nav.cross_link.past_events',
        },
        fields: [
          ['day_header:past_date_opacity', member('past_days')],
          ['day_header:past_date_scale', member('past_days')],
          ['day_header:past_date_font_weight', member('past_days')],
        ],
      },
      {
        key: 'weekend_colors',
        fields: [
          ['day_header:weekend_weekday_color', member('weekend_colors')],
          ['day_header:weekend_day_color', member('weekend_colors')],
          ['day_header:weekend_month_color', member('weekend_colors')],
        ],
      },
    ],
  },
  {
    id: 'events',
    titleKey: 'panel.events',
    iconPath: mdiCalendarText,
    summary: ['events:show_time', 'content:time_format'],
    headings: [
      {
        key: 'heading_details',
        // The eight parts each event shows, in the order an event shows them (D08).
        fields: [
          ['events:show_time', PART],
          ['events:show_end_time', PART],
          ['events:show_location', PART],
          ['events:show_description', PART],
          ['events:show_countdown', PART],
          ['events:show_progress_bar', PART],
          ['events:show_duration', PART],
          ['events:show_now_indicator', PART],
          ['content:time_format', E],
          ['events:time_position', A],
        ],
      },
      {
        key: 'heading_event_state',
        fields: [['events:now_color', A]],
      },
      {
        key: 'heading_accent',
        fields: [
          ['events:accent_event_text', A],
          ['events:accent_color_mode', A],
          ['events:accent_color', withMode('events:accent_color_mode')],
          ['events:vertical_line_width', A],
          ['events:event_background_opacity', A],
        ],
      },
      {
        key: 'heading_title',
        fields: [
          ['events:event_font_size', A],
          ['events:event_color', A],
          ['events:title_max_lines', A],
          ['events:scroll_long_titles', A],
        ],
      },
      {
        key: 'heading_icon_and_badge',
        keyByView: { grid: 'heading_icons' },
        fields: [
          ['events:event_icon_vertical_alignment', A],
          ['events:allday_badge_position', A],
          ['events:allday_badge_style', withMode('events:allday_badge_position')],
          ['events:allday_badge_color_mode', withMode('events:allday_badge_position')],
          ['events:allday_badge_color', withMode('events:allday_badge_color_mode')],
        ],
      },
      {
        key: 'time',
        fields: [
          ['events:show_single_allday_time', A],
          ['events:show_multiday_allday_time', A],
          ['events:time_two_digit_hours', A],
          ['events:time_font_size', A],
          ['events:time_color', A],
          ['events:time_icon_size', A],
          ['events:time_max_lines', A],
        ],
      },
      {
        key: 'location',
        fields: [
          ['events:show_location_allday', A],
          ['events:location_country_mode', A],
          ['events:location_country_pattern', withMode('events:location_country_mode')],
          ['events:location_font_size', A],
          ['events:location_color', A],
          ['events:location_icon_size', A],
          ['events:location_max_lines', A],
        ],
      },
      {
        key: 'description',
        fields: [
          ['events:show_description_allday', A],
          ['events:description_font_size', A],
          ['events:description_color', A],
          ['events:description_icon_size', A],
          ['events:description_max_lines', A],
        ],
      },
      {
        key: 'progress',
        helperKey: 'progress.helper',
        fields: [
          ['events:countdown_max_days', A],
          ['events:show_countdown_allday', A],
          ['events:countdown_once_per_day', A],
          ['events:countdown_exact_days', A],
          ['events:progress_bar_color', A],
          ['events:progress_bar_height', A],
          ['events:progress_bar_width', A],
        ],
      },
    ],
  },
  {
    id: 'size_spacing',
    titleKey: 'page.size_spacing',
    iconPath: mdiResize,
    summary: ['layout:height_mode'],
    headings: [
      {
        key: 'heading_card_size',
        fields: [
          ['layout:height_mode', E],
          ['layout:card_height', withMode('layout:height_mode')],
          ['layout:card_max_height', withMode('layout:height_mode')],
          // Month's own height, beside the Height it yields to: a fixed one replaces it.
          ['layout:month.row_height', A],
          ['layout:additional_card_spacing', A],
          ['layout:event_gap', A],
          ['layout:event_spacing', A],
        ],
      },
      {
        key: 'column.density',
        fields: [
          ['layout:column.min_day_width', member('column_density')],
          ['layout:column.min_days_to_show', member('column_density')],
          ['layout:column.min_days_fallback', member('column_density')],
        ],
      },
      {
        key: 'time_grid.density',
        fields: [
          ['layout:time_grid.min_day_width', member('grid_density')],
          ['layout:time_grid.min_days_to_show', member('grid_density')],
          ['layout:time_grid.min_days_fallback', member('grid_density')],
        ],
      },
      {
        // How narrow Month's days may get, beside the same question for Columns and Grid. One
        // field rather than a family: Month keeps its days and changes its form instead.
        key: 'month.density',
        helperKey: 'month.density.helper',
        fields: [['layout:month.min_day_width', A]],
      },
      {
        key: 'heading_between_days',
        fields: [
          ['layout:day_spacing', A],
          ['separators:day_spacing', A],
          ['separators:day_separator_width', A],
          ['separators:day_separator_color', A],
          ['separators:week_separator_width', A],
          ['separators:week_separator_color', A],
          ['separators:month_separator_width', A],
          ['separators:month_separator_color', A],
        ],
      },
      {
        key: 'heading_across_the_grid',
        fields: [
          ['separators:time_grid.hour_line_width', A],
          ['separators:time_grid.hour_line_color', A],
          ['separators:time_grid.allday_band_line_width', A],
          ['separators:time_grid.allday_band_line_color', A],
        ],
      },
    ],
  },
  {
    id: 'grid',
    // The scope's own option label, which already names Grid in every editor language.
    titleKey: 'editing_workspace.option.grid.label',
    iconPath: mdiTimelineClockOutline,
    onlyIn: 'grid',
    summary: ['layout:time_grid.start_time', 'layout:time_grid.end_time'],
    headings: [
      {
        key: 'time_grid.axis',
        fields: [
          ['layout:time_grid.start_time', E],
          ['layout:time_grid.end_time', E],
          ['layout:time_grid.slot_minutes', A],
          ['layout:time_grid.hour_height', A],
        ],
      },
      {
        key: 'heading_hour_labels',
        fields: [
          ['layout:time_grid.axis_width', A],
          ['layout:time_grid.show_axis_labels', A],
          ['layout:time_grid.axis_label_minutes', A],
        ],
      },
      {
        key: 'heading_on_the_grid',
        fields: [
          ['layout:time_grid.weekend_background_color', A],
          ['layout:time_grid.today_background_color', A],
          ['layout:time_grid.show_now_line', A],
          ['layout:time_grid.allday_band_max_rows', A],
          ['layout:time_grid.overlap_layout', A],
          ['layout:time_grid.max_simultaneous_events', A],
        ],
      },
    ],
  },
  {
    id: 'weather',
    titleKey: 'panel.weather',
    iconPath: mdiWeatherPartlyCloudy,
    summary: [`${W}entity`, `${W}position`],
    headings: [
      {
        key: 'heading.forecast',
        fields: [
          [`${W}entity`, E],
          [`${W}position`, E],
        ],
      },
      {
        key: 'weather.date',
        helperKey: 'weather.date.helper',
        fields: [
          [`${W}date.show_conditions`, E],
          [`${W}date.show_high_temp`, E],
          [`${W}date.show_low_temp`, E],
          [`${W}date.show_uv_index`, E],
          [`${W}date.uv_index_threshold`, withMode(`${W}date.show_uv_index`)],
          [`${W}date.icon_size`, A],
          [`${W}date.font_size`, A],
          [`${W}date.color`, A],
        ],
      },
      {
        key: 'weather.event',
        helperKey: 'weather.event.helper',
        extras: ['weather-calendar-links'],
        fields: [
          [`${W}event.show_conditions`, E],
          [`${W}event.show_temp`, E],
          [`${W}event.show_uv_index`, E],
          [`${W}event.uv_index_threshold`, withMode(`${W}event.show_uv_index`)],
          [`${W}event.daily_forecast_fallback`, E],
          [`${W}event.icon_size`, A],
          [`${W}event.font_size`, A],
          [`${W}event.color`, A],
          [`${W}event.max_lines`, A],
        ],
      },
    ],
  },
  {
    id: 'taps_refresh',
    titleKey: 'page.taps_refresh',
    iconPath: mdiGestureTapButton,
    noteKey: 'page.taps_refresh.note',
    summary: ['actions:event_tap_action', 'actions:day_tap_action_mode'],
    headings: [
      {
        key: 'heading.taps',
        fields: [
          ['actions:tap_action', E],
          ['actions:hold_action', A],
          ['actions:day_tap_action_mode', E],
          ['actions:event_tap_action', E],
          ['actions:event_hold_action', A],
          ['actions:open_links', A],
          ['actions:allow_event_edit', E],
          ['actions:allow_event_delete', E],
        ],
      },
      {
        // What a wheel or a swipe does, after what a tap does: gestures together, refresh last.
        key: 'heading.wheel_and_swipe',
        fields: [
          ['layout:month.week_scroll', A],
          ['layout:month.week_scroll_min_width', A],
        ],
      },
      {
        key: 'heading.refresh',
        fields: [
          ['actions:refresh_interval', A],
          ['actions:refresh_on_navigate', A],
        ],
      },
    ],
  },
];

/** The overview's Calendars block: the calendar list (`views/calendars.ts`). */
export const CALENDARS_BLOCK = { titleKey: 'panel.calendars' } as const;

/**
 * The overview's Starting Layout block: the `view` control, whose label is the block's heading, so
 * search finds it by the field's own words (`search.ts` › `startingLayoutRow`).
 */
export const STARTING_LAYOUT_BLOCK = { titleKey: 'view' } as const;

/** A calendar entry's page. */
export const ENTRY_GROUPS: ReadonlyArray<HeadingDef> = [
  {
    key: 'heading.name_and_look',
    // Accent Color first: a calendar's color is what most people open its page for.
    fields: [
      ['calendar:accent_color_mode', E],
      ['calendar:accent_color', withMode('calendar:accent_color_mode')],
      ['calendar:name', E],
      ['calendar:show_in_legend', A],
      ['calendar:label_type', E],
      ['calendar:label_icon_source', withMode('calendar:label_type')],
      ['calendar:label_image_source', withMode('calendar:label_type')],
      ['calendar:label', withMode('calendar:label_type')],
      ['calendar:label_icon_color', A],
      ['calendar:color', A],
      ['calendar:text_scale', A],
    ],
  },
  {
    key: 'heading.who_sees_it',
    // Hiding a calendar on weekends is asked here, and answered under Which Events.
    pointer: { field: 'calendar:days_of_week', textKey: 'nav.cross_link.days_of_week' },
    fields: [['calendar:visibility', A]],
  },
  {
    // The page title's own words, so one key serves both.
    key: 'page.which_events',
    extras: ['split'],
    fields: [
      ['calendar:days_of_week', A],
      ['calendar:event_type', A],
      ['calendar:allday_expires_at', A],
      ['calendar:filter_field', withMode(['calendar:blocklist', 'calendar:allowlist'])],
      ['calendar:blocklist', A],
      ['calendar:allowlist', A],
      ['calendar:compact_events_to_show', A],
    ],
  },
  {
    key: 'heading_replace',
    fields: [
      ['calendar:replace_field', member('replace')],
      ['calendar:replace_pattern', member('replace')],
      ['calendar:replace_with', member('replace')],
    ],
  },
  {
    key: 'heading_multiday',
    fields: [
      ['calendar:split_multiday_events', A],
      ['calendar:multiday_banners', A],
    ],
  },
  {
    key: 'heading_details',
    fields: [
      ['calendar:show_time', A],
      ['calendar:show_location', A],
      ['calendar:location_icon', A],
      ['calendar:show_description', A],
      ['calendar:show_weather', A],
    ],
  },
];

/**
 * Families: fields that mean little alone, offered, added and removed as one. A family's
 * heading is the heading keyed by its title.
 */
export const FAMILIES: Readonly<Record<FamilyId, { titleKey: string; helperKey?: string }>> = {
  compact_mode: { titleKey: 'compact_mode', helperKey: 'compact_mode.helper' },
  past_days: { titleKey: 'past_days', helperKey: 'past_days.helper' },
  weekend_colors: { titleKey: 'weekend_colors', helperKey: 'weekend_colors.helper' },
  column_density: { titleKey: 'column.density', helperKey: 'column.density.helper' },
  grid_density: { titleKey: 'time_grid.density', helperKey: 'time_grid.density.helper' },
  replace: { titleKey: 'heading_replace' },
};

type Placement = { readonly page: PageId | 'overview' | 'entry'; readonly heading: number };

let placements: ReadonlyMap<FieldId, Placement> | undefined;

/**
 * Where a field is drawn: its page, or the overview, or a calendar entry's page, and the index
 * of its heading there. The overview has one run, heading 0.
 *
 * @param id - Field id
 * @returns The placement, or `undefined` for an id the registry does not place
 */
export function placementOf(id: FieldId): Placement | undefined {
  if (!placements) {
    const map = new Map<FieldId, Placement>();
    const place = (fields: HeadingDef['fields'], at: Placement): void => {
      for (const [field] of fields) if (!map.has(field)) map.set(field, at);
    };
    for (const page of PAGES) {
      page.headings.forEach((heading, index) =>
        place(heading.fields, { page: page.id, heading: index }),
      );
    }
    ENTRY_GROUPS.forEach((heading, index) =>
      place(heading.fields, { page: 'entry', heading: index }),
    );
    placements = map;
  }
  return placements.get(id);
}

/**
 * Whether a field reads and writes the same in every scope: no per-layout copy, and offered in
 * every layout.
 *
 * @param id - Field id
 * @returns `true` when switching the scope changes nothing about it
 */
function sameInEveryScope(id: FieldId): boolean {
  const { scope, dataPath, name } = parseFieldId(id);
  // A nested field stays where its path puts it; inside a view block it is that layout's own.
  if (dataPath.length > 0) return !BLOCK_KEYS.has(dataPath[0]);
  if (scope === 'button') return true;
  if (scope === 'calendar') return entityConfigKeys(name).every((key) => !entityScopeFor(key));

  return configKeysForField(name).every((key) =>
    VIEWS.every((view) => destination(key, view) === undefined && appliesToView(key, view)),
  );
}

/**
 * Whether a page applies to the whole card, so it says "Applies to the whole card." where other
 * pages show the scope. Derived from `routing.ts` › `destination` and the layouts that offer
 * each field, never declared: Card & Header and Weather qualify because no field there has a
 * layout copy or is missing from a layout, and Taps & Refresh does not because Grid has no Open
 * Links. A field that later gains a layout copy changes the answer by itself.
 *
 * @param page - A section page, or a calendar entry's groups as `{ headings: ENTRY_GROUPS }`
 * @returns `true` when the scope cannot change anything on it
 */
export function isWholeCard(page: { readonly headings: ReadonlyArray<HeadingDef> }): boolean {
  return page.headings.every((heading) => heading.fields.every(([id]) => sameInEveryScope(id)));
}
