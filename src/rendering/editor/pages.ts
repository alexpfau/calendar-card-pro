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
  mdiCalendarToday,
  mdiCalendarWeekBegin,
  mdiCardTextOutline,
  mdiGestureTapButton,
  mdiResize,
  mdiWeatherPartlyCloudy,
} from '@mdi/js';

import { type FieldId, parseFieldId } from './field-index';
import { destination } from './routing';
import { entityConfigKeys } from './schemas/entity';
import { configKeysForField } from './synthetic';
import { WEATHER_ENTITY } from './weather-fields';
import { type EditorWorkspace, isLayoutCopyPath } from './workspace';
import type * as Types from '../../config/types';
import { VIEWS, appliesToView, entityScopeFor } from '../../config/view';

export type PageId =
  | 'which_events'
  | 'card_header'
  | 'events_weather_language'
  | 'day_header'
  | 'events'
  | 'size_spacing'
  | 'weather'
  | 'taps_refresh';

export type FamilyId = 'compact_mode' | 'past_days' | 'weekend_colors' | 'replace';

/**
 * How a page shows a field.
 *
 * - `essential`: always live while present.
 * - `add`: live when stored, inherited and different, or added; else in its heading's Add row.
 * - `kept`: live as `add` is, but never offered in an Add row: a setting another has replaced,
 *   drawn only so a card that still holds it can read and clear it.
 * - `with`: a mode control's value field, live with its mode. Match Against serves two lists,
 *   so it names both, and either asks for it.
 * - `family`: shown, added and removed with its family.
 * - `chips`: drawn as a toggle chip (`chips.ts`), with the other chips of its kind on its page.
 * - `qualifies`: what a pressed toolbar control offers, drawn as its qualifier line under the
 *   chips while that control is pressed, with no head row: Layouts in Switcher's checkboxes.
 * - `segmented`: drawn as a card-built radio group of its options with no head row: Start Date's
 *   chips.
 * - `button-rows`: one of the toolbar's own buttons' fields, drawn in each button's row.
 * - `copy`: a whole-card setting drawn here, editable, though its home is a Whole Card page, where
 *   it is placed with its own appearance: Start Date beside Days To Show. It writes what its home
 *   writes and says Whole Card.
 * - `reference`: a whole-card setting named here by a row that opens it on its Whole Card page,
 *   with its value: First Day Of Week under Weeks.
 *
 * A copy or a reference is not a placement: `placementOf`, search and every other walk of where a
 * setting lives read the field's home alone (`isBorrowed`).
 */
export type Appearance =
  | 'essential'
  | 'add'
  | 'kept'
  | { readonly with: FieldId | ReadonlyArray<FieldId> }
  | { readonly family: FamilyId }
  | { readonly chips: 'parts' | 'toolbar' }
  | { readonly qualifies: FieldId }
  | 'segmented'
  | 'button-rows'
  | 'copy'
  | 'reference';

/**
 * Whether a registry entry draws a setting whose home is elsewhere.
 *
 * @param appearance - The entry's appearance
 * @returns `true` for a copy or a reference
 */
export function isBorrowed(appearance: Appearance): appearance is 'copy' | 'reference' {
  return appearance === 'copy' || appearance === 'reference';
}

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
  /** A different line under the heading in one layout: Card Size & Spacing's in Month. */
  readonly helperKeyByView?: Partial<Record<Types.EffectiveView, string>>;
  /**
   * Whether the heading's title in Month already says its settings act on the Day List and the
   * Day Panel alone, so they leave out the marker that says the same (`plan.ts` ›
   * `MONTH_DAY_LIST_OPTIONS`). Search results and Month's other pages keep it.
   */
  readonly namesDayList?: true;
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
  /**
   * A line after `after`, led by `textKey`, linking to `to` in each layout the card can show that
   * offers it: Days To Show beside Start Date, each layout's forecast beside the entity. `to` has a
   * value per layout, which a whole-card page cannot hold.
   */
  readonly layoutLinks?: {
    readonly after: FieldId;
    readonly to: FieldId;
    readonly page: PageId;
    readonly textKey: string;
  };
}

/** One section page. */
export interface PageDef {
  readonly id: PageId;
  readonly titleKey: string;
  readonly iconPath: string;
  readonly noteKey?: string;
  /** A line one layout's page draws under its head, as Month's Event Appearance does. */
  readonly noteKeyByView?: Partial<Record<Types.EffectiveView, string>>;
  readonly headings: ReadonlyArray<HeadingDef>;
  /**
   * The line under the page's row: what to expect on the page, the same whatever the card holds.
   * A row describes its page rather than naming values, which read as a riddle at a glance.
   */
  readonly descriptionKey: string;
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
    descriptionKey: 'page.which_events.description',
    headings: [
      {
        // First: how many days, and from when, is the widest question this page answers. Start
        // Date is the whole card's, at home on Events, Weather & Language; it stays editable
        // here, where it is set together with the days it starts. Month's First Week after it,
        // since it says what Month does with that date, and Weeks Shown is Month's Days To Show.
        key: 'heading.date_range',
        fields: [
          ['content:days_to_show', E],
          ['content:start_date_mode', 'copy'],
          ['content:start_date_fixed', 'copy'],
          ['content:start_date_offset', 'copy'],
          ['layout:month.start', E],
          ['layout:month.weeks', withMode('layout:month.start')],
        ],
      },
      {
        // Grid's hours, after the days: an event outside them is not drawn, so they bound which
        // events show as the dates do.
        key: 'heading_hours',
        fields: [
          ['layout:time_grid.start_time', E],
          ['layout:time_grid.end_time', E],
        ],
      },
      {
        key: 'heading.selection_and_order',
        fields: [
          ['content:event_type', 'reference'],
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
        // All-day and multi-day events together: how a long event is split or drawn as a banner,
        // and how many rows Grid's all-day band gives them.
        key: 'heading_allday_multiday',
        fields: [
          ['content:split_multiday_events', A],
          ['content:multiday_banners', A],
          ['layout:time_grid.allday_band_max_rows', A],
        ],
      },
      {
        key: 'heading_nothing',
        fields: [
          ['content:show_empty_days', E],
          ['content:show_empty_today', E],
          ['content:empty_day_text', E],
          ['content:empty_day_color', A],
          ['content:hide_when_empty', 'reference'],
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
    descriptionKey: 'panel.card.description',
    headings: [
      {
        key: 'heading.general',
        fields: [
          ['card:title', E],
          ['card:title_font_size', A],
          ['card:title_color', A],
          ['card:background_color', A],
        ],
      },
      {
        key: 'heading_toolbar',
        fields: [
          ['card:toolbar.show', E],
          ['card:toolbar.add_event', CONTROL],
          ['card:toolbar.view_switcher', CONTROL],
          // A chip like the others; which form it takes is its qualifier line under the chips.
          ['card:toolbar.legend', CONTROL],
          ['card:toolbar.reset', CONTROL],
          ['card:toolbar.refresh', CONTROL],
          ['card:toolbar.search', CONTROL],
          ['card:toolbar.overlay', CONTROL],
          ['card:toolbar.navigation', CONTROL],
          // View Switcher's qualifier line, drawn under the chips while it is pressed.
          ['card:toolbar.view_switcher_layouts', { qualifies: 'card:toolbar.view_switcher' }],
          ['card:toolbar.size', A],
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
    // The whole card's own answers to a first setup's questions, each with one value for every
    // layout, in the order of the page's name: which events, the forecast, then the conventions
    // the card's dates and times are written in, language last, since few change it. Each is
    // also named on its topic, by a row that opens it here, or, for Start Date and the entity, by
    // a copy, where it is set together with a layout's own.
    id: 'events_weather_language',
    titleKey: 'page.events_weather_language',
    iconPath: mdiCalendarToday,
    descriptionKey: 'page.events_weather_language.description',
    headings: [
      {
        key: 'page.which_events',
        layoutLinks: {
          after: 'content:start_date_offset',
          to: 'content:days_to_show',
          page: 'which_events',
          textKey: 'links.days_to_show',
        },
        fields: [
          ['content:start_date_mode', 'segmented'],
          ['content:start_date_fixed', withMode('content:start_date_mode')],
          ['content:start_date_offset', withMode('content:start_date_mode')],
          ['content:event_type', A],
          ['content:hide_when_empty', A],
        ],
      },
      {
        key: 'heading.forecast',
        layoutLinks: {
          after: WEATHER_ENTITY,
          to: `${W}position`,
          page: 'weather',
          textKey: 'links.forecast',
        },
        fields: [[WEATHER_ENTITY, E]],
      },
      {
        key: 'heading.format_language',
        fields: [
          ['content:first_day_of_week', E],
          ['content:time_format', E],
          ['content:language_mode', A],
        ],
      },
    ],
  },
  {
    id: 'day_header',
    titleKey: 'panel.day_header',
    iconPath: mdiCalendarWeekBegin,
    descriptionKey: 'panel.day_header.description',
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
          ['content:first_day_of_week', 'reference'],
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
          // Grid's and Month's today shading, beside the colors of today's date.
          ['layout:time_grid.today_background_color', A],
          ['layout:month.today_background_color', A],
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
          // Grid's and Month's weekend shading: a day's background rather than its date, so neither
          // is a member of the family the date's colors are.
          ['layout:time_grid.weekend_background_color', A],
          ['layout:month.weekend_background_color', A],
        ],
      },
    ],
  },
  {
    id: 'events',
    titleKey: 'panel.events',
    iconPath: mdiCalendarText,
    noteKeyByView: { month: 'page.month_rows.note' },
    descriptionKey: 'panel.events.description',
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
          ['content:time_format', 'reference'],
          ['events:time_position', A],
        ],
      },
      {
        // Grid's now line beside the color the now marker takes in every layout.
        key: 'heading_event_state',
        fields: [
          ['layout:time_grid.show_now_line', A],
          ['events:now_color', A],
        ],
      },
      {
        // How Grid places events that share a time: how an event sits beside the others, before
        // how its parts look.
        key: 'heading_overlapping_events',
        fields: [
          ['layout:time_grid.overlap_layout', A],
          ['layout:time_grid.max_simultaneous_events', A],
        ],
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
          // The size of the titles in the wide month's days, beside the one a day's list takes.
          ['layout:month.cell_event_font_size', A],
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
          // The size of the times in the wide month's days, beside the one a day's list takes.
          ['layout:month.cell_time_font_size', A],
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
    descriptionKey: 'page.size_spacing.description',
    headings: [
      {
        key: 'heading_card_size',
        // Month's Card Height is both forms' until the Narrow Month's own is set, below.
        helperKeyByView: { month: 'heading_card_size.month_note' },
        fields: [
          // The whole card's height, in every layout.
          ['layout:height_mode', E],
          ['layout:fixed_height', withMode('layout:height_mode')],
          ['layout:maximum_height', withMode('layout:height_mode')],
          // The events area's own pair, which Card Height replaced, drawn only where a card holds
          // one.
          ['layout:height', 'kept'],
          ['layout:max_height', 'kept'],
          // Grid's height, set per hour, beside the Card Height a fixed one fits it into.
          ['layout:time_grid.hour_height', A],
          ['layout:additional_card_spacing', A],
        ],
      },
      {
        // Month's narrow form, which takes Card Height while these are unset.
        key: 'heading_narrow_month',
        fields: [
          ['layout:month.narrow_card_height', A],
          ['layout:month.narrow_card_max_height', A],
        ],
      },
      {
        // The room between and inside a day's events. Month draws them only in the Day List and the
        // Day Panel, never in its weeks, so its heading says so.
        key: 'heading_event_rows',
        keyByView: { month: 'heading_day_list_panel' },
        namesDayList: true,
        fields: [
          ['layout:event_gap', A],
          ['layout:event_spacing', A],
        ],
      },
      {
        // Grid's hour labels: the time axis beside the days, sized as the card is.
        key: 'heading_hour_labels',
        fields: [
          ['layout:time_grid.axis_width', A],
          ['layout:time_grid.show_axis_labels', A],
          ['layout:time_grid.axis_label_minutes', A],
        ],
      },
      {
        // How the card fits a narrow width: Columns and Grid give up days, fall back to List or
        // keep their days narrower, and Month draws the Narrow Month below its Minimum Day Width,
        // so Month's title names the choice between its two forms. The fit summary and each
        // layout's width table follow the page's headings.
        key: 'heading_narrow_cards',
        keyByView: { month: 'heading_month_forms' },
        fields: [
          ['layout:narrow_fit', E],
          ['layout:column.min_days_to_show', withMode('layout:narrow_fit')],
          ['layout:time_grid.min_days_to_show', withMode('layout:narrow_fit')],
          ['layout:column.min_days_fallback', withMode('layout:narrow_fit')],
          ['layout:time_grid.min_days_fallback', withMode('layout:narrow_fit')],
          ['layout:column.min_day_width', A],
          ['layout:time_grid.min_day_width', A],
          ['layout:month.min_day_width', A],
        ],
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
          ['separators:month_separator_label', A],
          ['separators:month_separator_label_color', A],
          ['separators:month_separator_label_font_size', A],
        ],
      },
      {
        key: 'heading_across_the_grid',
        fields: [
          // How often a line is drawn first, then how each looks.
          ['layout:time_grid.slot_minutes', A],
          ['separators:time_grid.hour_line_width', A],
          ['separators:time_grid.hour_line_color', A],
          ['separators:time_grid.allday_band_line_width', A],
          ['separators:time_grid.allday_band_line_color', A],
        ],
      },
    ],
  },
  {
    // Each layout's own weather, stored in its block, and the one entity every layout draws from,
    // at home on Events, Weather & Language and copied here, where choosing it also turns this
    // layout's forecast on. Layout Defaults has no Weather: no forecast setting has a top level.
    id: 'weather',
    titleKey: 'panel.weather',
    iconPath: mdiWeatherPartlyCloudy,
    noteKeyByView: { month: 'page.month_weather.note' },
    descriptionKey: 'panel.weather.description',
    headings: [
      {
        key: 'heading.forecast',
        fields: [
          [WEATHER_ENTITY, 'copy'],
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
        // Month draws the forecast beside events in the Day List and the Day Panel alone, so its
        // title names those, and its settings leave out the marker that says the same.
        key: 'weather.event',
        keyByView: { month: 'heading_day_list_panel' },
        namesDayList: true,
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
    descriptionKey: 'page.taps_refresh.description',
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
        // After the taps, one of which opens it: the layout the card opens in full size.
        key: 'heading.overlay',
        fields: [['actions:overlay.view', A]],
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
    // Whether the events show at all, then what everyone who sees them reads of them.
    fields: [
      ['calendar:visibility', A],
      ['calendar:private', A],
    ],
  },
  {
    // The page title's own words, so one key serves both.
    key: 'page.which_events',
    extras: ['split'],
    fields: [
      ['calendar:days_of_week', A],
      ['calendar:event_type', A],
      ['calendar:starts_after', A],
      ['calendar:starts_before', A],
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
    // A copy or a reference draws a setting placed elsewhere, so neither is a placement.
    const place = (fields: HeadingDef['fields'], at: Placement): void => {
      for (const [field, appearance] of fields) {
        if (!isBorrowed(appearance) && !map.has(field)) map.set(field, at);
      }
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
  // A nested field stays where its path puts it; inside a view block, or a layout group such as
  // `weather:`, it is that layout's own.
  if (dataPath.length > 0) return !isLayoutCopyPath(dataPath);
  if (scope === 'button') return true;
  if (scope === 'calendar') return entityConfigKeys(name).every((key) => !entityScopeFor(key));

  return configKeysForField(name).every((key) =>
    VIEWS.every((view) => destination(key, view) === undefined && appliesToView(key, view)),
  );
}

/**
 * Whether a page applies to the whole card, so it says "Applies to the whole card." where other
 * pages show the scope. Derived from `routing.ts` › `destination` and the layouts that offer
 * each field, never declared: Card & Header qualifies because no field there has a
 * layout copy or is missing from a layout, and Taps & Refresh does not because Grid has no Open
 * Links. A field that later gains a layout copy changes the answer by itself.
 *
 * @param page - A section page, or a calendar entry's groups as `{ headings: ENTRY_GROUPS }`
 * @returns `true` when the scope cannot change anything on it
 */
export function isWholeCard(page: { readonly headings: ReadonlyArray<HeadingDef> }): boolean {
  return page.headings.every((heading) =>
    heading.fields.every(([id, appearance]) => isBorrowed(appearance) || sameInEveryScope(id)),
  );
}

/**
 * The pages under Whole Card on the overview: one value for the whole card, edited outside any
 * layout. Declared, not derived: Taps & Refresh holds Open Links, which Grid draws nothing for, and
 * is the whole card's all the same; such a setting says where it does not apply instead
 * (`plan.ts` › `stateOf`).
 */
export const WHOLE_CARD_PAGES: ReadonlySet<PageId> = new Set([
  'card_header',
  'events_weather_language',
  'taps_refresh',
]);

/** The topics every layout's page lists, in order: every page that is not the whole card's. */
export const TOPIC_PAGES: ReadonlyArray<PageDef> = PAGES.filter(
  (page) => !WHOLE_CARD_PAGES.has(page.id),
);

/**
 * Whether a card field keeps no copy per layout: one value whichever layout's page draws it. Unlike
 * `isWholeCard`, a field some layout ignores still counts, as Today's Weekday Color does for Month.
 *
 * @param id - Field id
 * @returns `true` for a whole-card setting
 */
export function keepsNoLayoutCopy(id: FieldId): boolean {
  const { scope, dataPath, name } = parseFieldId(id);
  if (scope === 'calendar' || scope === 'button') return false;
  if (dataPath.length > 0) return !isLayoutCopyPath(dataPath);
  return configKeysForField(name).every((key) =>
    VIEWS.every((view) => destination(key, view) === undefined),
  );
}

/**
 * The topics a scope's page lists, in order: every topic for a layout, and for Layout Defaults
 * each topic holding a setting with a top level. Weather holds none there: each layout's forecast
 * is its own, and the entity every layout shares is the whole card's.
 *
 * @param scope - A layout, or `shared` for Layout Defaults
 * @returns The topics
 */
export function topicsFor(scope: EditorWorkspace): ReadonlyArray<PageDef> {
  return scope === 'shared' ? TOPIC_PAGES.filter((page) => page.id !== 'weather') : TOPIC_PAGES;
}
