/**
 * Type definitions for Calendar Card Pro
 */

// Type-only, so this module keeps zero runtime dependencies.
import type { LabelType } from '../utils/helpers';

// -----------------------------------------------------------------------------
// CORE CONFIGURATION
// -----------------------------------------------------------------------------

/** Main configuration interface for the card. */
export interface Config {
  // Core settings
  entities: Array<string | EntityConfig>;
  view: EffectiveView;
  start_date?: string;
  days_to_show: number;
  compact_days_to_show?: number;
  compact_events_to_show?: number;
  compact_events_complete_days?: boolean;
  show_empty_days: boolean;
  hide_when_empty: boolean;
  empty_day_text?: string;
  filter_duplicates: boolean;
  /**
   * Accent color for a row that `filter_duplicates` collapsed across two or more
   * **distinct** calendars, replacing the first-listed calendar's own accent.
   *
   * Answers a different question from the labels that such a row carries. The labels say
   * *who* the event belongs to and scale to as many calendars as share it; this says only
   * *that* it is shared, which is a binary and so needs no second color per combination.
   * The two compose — a glanceable marker plus a precise one — and this is why a single
   * color is enough where a color per combination could never be.
   *
   * Left unset the row keeps the first-listed calendar's accent, which is the behavior
   * every release before v4.2 had.
   */
  duplicate_accent_color?: string;
  split_multiday_events: boolean;
  event_type: EventType;
  language?: string;

  // Header
  title?: string;
  title_font_size?: string;
  title_color?: string;

  // Layout and spacing
  background_color: string;
  accent_color: string;
  vertical_line_width: string;
  day_spacing: string;
  event_spacing: string;
  additional_card_spacing: string;
  max_height: string;
  height: string;

  // Week numbers and horizontal separators
  first_day_of_week: 'sunday' | 'monday' | 'system';
  show_week_numbers: null | 'iso' | 'simple';
  show_current_week_number: boolean;
  week_number_font_size: string;
  week_number_color: string;
  week_number_background_color: string;
  day_separator_width: string;
  day_separator_color: string;
  week_separator_width: string;
  week_separator_color: string;
  month_separator_width: string;
  month_separator_color: string;

  // Today indicator
  today_indicator: string | boolean;
  today_indicator_position: string;
  today_indicator_color: string;
  today_indicator_size: string;

  // Date column
  date_vertical_alignment: string;
  weekday_font_size: string;
  weekday_color: string;
  day_font_size: string;
  day_color: string;
  show_month: boolean;
  month_font_size: string;
  month_color: string;
  weekend_weekday_color?: string;
  weekend_day_color?: string;
  weekend_month_color?: string;
  today_weekday_color?: string;
  today_day_color?: string;
  today_month_color?: string;

  // Event column
  event_background_opacity: number;
  show_past_events: boolean;
  show_countdown: boolean;
  show_countdown_allday: boolean;
  show_progress_bar: boolean;
  progress_bar_color: string;
  progress_bar_height: string;
  progress_bar_width?: string;
  event_icon_vertical_alignment: string;
  event_font_size: string;
  event_color: string;
  empty_day_color: string;
  show_time: boolean;
  show_single_allday_time: boolean;
  show_multiday_allday_time: boolean;
  allday_badge: boolean | string;
  allday_badge_style: string;
  allday_badge_color: string;
  time_24h: boolean | 'system';
  time_two_digit_hours: boolean;
  show_end_time: boolean;
  time_font_size: string;
  time_color: string;
  time_icon_size: string;
  time_max_lines: number;
  show_location: boolean;
  show_location_allday: boolean;
  remove_location_country: boolean | string;
  location_font_size: string;
  location_color: string;
  location_icon_size: string;
  location_max_lines: number;
  show_description: boolean;
  show_description_allday: boolean;
  title_max_lines: number;
  description_max_lines: number;
  description_font_size: string;
  description_color: string;
  description_icon_size: string;

  // Weather
  weather?: WeatherConfig;

  // Actions
  tap_action: ActionConfig;
  hold_action: ActionConfig;

  // Cache and refresh settings
  refresh_interval: number;
  refresh_on_navigate: boolean;

  // Column view
  column?: ColumnOverrides;

  // Grid view
  grid?: GridOverrides;
}

/** Views the card can render. */
export type EffectiveView = 'list' | 'column' | 'grid';

/** How finely the grid rules its time axis. */
export type GridSlotMinutes = 15 | 20 | 30 | 60;

/**
 * Which class of event a calendar contributes.
 *
 * Named for the axis rather than for one class, so a second axis can land beside it
 * symmetrically. It says nothing about how long an event lasts: a 23:30–00:30 dinner is
 * `timed` however many dates it touches.
 *
 * `timed` and `all_day` are exact complements over the same calendar, so listing one
 * entity twice — once each way — partitions it without overlap, which is what styling
 * the two classes differently requires.
 */
export type EventType = 'all' | 'timed' | 'all_day';

/**
 * Which days of the week a calendar's events are allowed to land on.
 *
 * A **display-date** axis, not an event-property one. `event_type` above asks what an
 * event *is*; this asks where a row *lands*, which is why it is resolved after multi-day
 * splitting and after the window clamp rather than from the event's own start date. A
 * three-week holiday already in progress shows on the window's first day whatever weekday
 * that is, so reading the start date would answer about a day the card is not drawing.
 *
 * Weekend means Saturday and Sunday — {@link isWeekendDate} in `utils/format.ts` is the
 * single definition, shared with the weekend day-header colors so the two cannot disagree.
 *
 * 🚨 There is deliberately no `all` member, unlike `EventType`. This option is
 * per-calendar only, so it has no card-level value to override and an explicit `all` would
 * mean exactly what the absent key already means — two dropdown entries with one behavior
 * and, inevitably, one label between them. Absent is the unfiltered state; the editor
 * spells that `inherit`, the way it spells `show_week_numbers`' absent value `none`.
 */
export type DaysOfWeekFilter = 'weekdays' | 'weekends';

/**
 * Which field `blocklist` and `allowlist` match against.
 *
 * An **out-of-band mode flag**, deliberately, rather than a widening of the pattern
 * grammar. `blocklist` and `allowlist` are documented as arbitrary RegExp and are passed
 * to `new RegExp()` unnormalized, so no character and no token is free to be given a
 * second meaning: a field prefix like `location:standup` collides with the perfectly legal
 * pattern for a title containing that literal text, and a sentinel value collides in the
 * same way. A separate key cannot collide with any pattern at all.
 *
 * 🚨 `title` *is* a member here, unlike `DaysOfWeekFilter`'s missing `all` — and for the
 * reason stated there rather than against it. That warning is about two dropdown entries
 * sharing one behavior; the absent state here is not an unfiltered state but a named field
 * a user may legitimately want to write, so `title` is the *one* entry standing for it and
 * stores nothing. Three members, three editor entries, three behaviors, one-to-one. See
 * `ENTITY_TRISTATE_DEFAULT` in `rendering/editor/schemas/entity.ts`.
 */
export type FilterField = 'title' | 'location' | 'description';

/**
 * Which field `replace_pattern` and `replace_with` rewrite.
 *
 * The same three fields {@link FilterField} names, and deliberately the same spelling —
 * one vocabulary for "which part of an event", whether the card is deciding what to keep
 * or what to draw. It is a separate type rather than an alias so the two can diverge if
 * one ever grows a field the other cannot serve.
 *
 * `title` stands for the absent state here for exactly {@link FilterField}'s reason, and
 * stores nothing. See `ENTITY_TRISTATE_DEFAULT` in `rendering/editor/schemas/entity.ts`.
 */
export type ReplaceField = 'title' | 'location' | 'description';

/** What column view does when even its narrowest permitted layout will not fit. */
export type ColumnMinDaysFallback = 'list' | 'cramp';

/**
 * Per-view configuration overrides applied when the card renders in column view.
 *
 * Overrides are presence-based. Fetch-time options are excluded because switching views
 * must not trigger Home Assistant API requests.
 *
 * @see resolveViewOption in `src/config/view.ts`
 */
/**
 * Options any multi-day view may override for itself.
 *
 * These are the content and appearance keys whose right value depends on how much room
 * a day gets, not on which axis the days run along — so a column and a grid column want
 * the same freedom to differ from the list. Every key here has a top-level counterpart
 * and is read with `resolveViewOption`.
 *
 * Shared rather than duplicated per view: a second copy is a second thing to forget,
 * and the failure is silent — an override the editor offers, validates and stores, and
 * that the renderer then replaces with the top-level default.
 */
export interface SharedViewOverrides {
  // Day grouping and empty days
  show_empty_days?: boolean;
  empty_day_text?: string;
  split_multiday_events?: boolean;

  // Render-side filters; they do not refetch on width transitions.
  show_past_events?: boolean;
  filter_duplicates?: boolean;
  duplicate_accent_color?: string;

  // Layout and spacing
  vertical_line_width?: string;
  event_spacing?: string;
  day_spacing?: string;
  additional_card_spacing?: string;
  height?: string;
  max_height?: string;

  // Today indicator
  today_indicator?: string | boolean;
  today_indicator_size?: string;
  today_indicator_color?: string;

  // Date column
  weekday_font_size?: string;
  day_font_size?: string;
  show_month?: boolean;
  month_font_size?: string;

  // Event column
  event_background_opacity?: number;
  event_font_size?: string;
  show_countdown?: boolean;
  show_countdown_allday?: boolean;
  show_progress_bar?: boolean;
  progress_bar_height?: string;
  progress_bar_width?: string;
  event_icon_vertical_alignment?: string;
  show_time?: boolean;
  show_single_allday_time?: boolean;
  show_multiday_allday_time?: boolean;
  allday_badge?: boolean | string;
  allday_badge_style?: string;
  allday_badge_color?: string;
  time_two_digit_hours?: boolean;
  show_end_time?: boolean;
  time_font_size?: string;
  time_icon_size?: string;
  time_max_lines?: number;
  show_location?: boolean;
  show_location_allday?: boolean;
  remove_location_country?: boolean | string;
  location_font_size?: string;
  location_icon_size?: string;
  location_max_lines?: number;
  show_description?: boolean;
  show_description_allday?: boolean;
  title_max_lines?: number;
  description_max_lines?: number;
  description_font_size?: string;
  description_icon_size?: string;
  show_week_numbers?: null | 'iso' | 'simple';
  show_current_week_number?: boolean;
  week_number_font_size?: string;
  week_number_color?: string;
  week_number_background_color?: string;

  // Separators between days. The meaning stays the same; only the axis changes.
  day_separator_width?: string;
  day_separator_color?: string;
  week_separator_width?: string;
  week_separator_color?: string;
  month_separator_width?: string;
  month_separator_color?: string;
}

/**
 * The `column:` block — every shared override, plus column's own layout keys.
 */
export interface ColumnOverrides extends SharedViewOverrides {
  // Column-only layout. These have no top-level counterpart and are read with
  // `resolveColumnOption`, not `resolveViewOption`.
  day_header_gap?: string;
  day_header_separator_width?: string;
  day_header_separator_color?: string;

  // Column density
  min_day_width?: number;

  /**
   * Fewest day columns the card may reduce to when the width will not carry
   * `days_to_show` of them.
   *
   * Defaults dynamically to `days_to_show`, so `resolveMinDaysToShow` owns it.
   */
  min_days_to_show?: number;

  /** What the card does once even `min_days_to_show` columns will not fit. */
  min_days_fallback?: ColumnMinDaysFallback;
}

/**
 * The `grid:` block — every shared override, plus the time axis's own keys.
 *
 * The grid-only keys below describe the *axis*: which slice of the day it draws, how
 * finely it is ruled, and how tall an hour is. They have no top-level counterpart and
 * are read with `resolveGridOption`, not `resolveViewOption`.
 */
export interface GridOverrides extends SharedViewOverrides {
  /**
   * First and last moment the axis draws, as `HH:mm`. `end_time` also accepts `24:00`.
   *
   * Strings rather than integer hours because minute precision costs nothing here and a
   * band starting at `06:30` is a real thing to want. A bad value resets **both**, so a
   * half-honoured band cannot masquerade as one the user asked for.
   */
  start_time?: string;

  /** @see start_time */
  end_time?: string;

  /** Spacing of the axis rules. Density only — it does not change the scale. */
  slot_minutes?: GridSlotMinutes;

  /**
   * Height of one hour of the axis, as a CSS length.
   *
   * Sets the grid's *intrinsic* height only. Under `height_mode: fixed` the card's own
   * height wins and the axis compresses to fit, which costs no arithmetic because every
   * event is positioned as a percentage of the band rather than in pixels.
   */
  hour_height?: string;

  /** Draw a line across today's column at the current time. */
  show_now_line?: boolean;

  /** Colour of that line. */
  now_line_color?: string;

  /**
   * Most events drawn side by side before the rest collapse into one "+N" block.
   *
   * A cap rather than unbounded lanes, because a busy morning otherwise renders as a row
   * of unreadable slivers. Nothing is ever hidden silently: at a cap of 1 the overflow
   * block still says how many events it stands for.
   */
  max_simultaneous_events?: number;

  /** Show the band of all-day events between the day headers and the axis. */
  show_allday_band?: boolean;

  /** Rows that band may grow to before the remaining banners are summarised. */
  allday_band_max_rows?: number;

  /** Width of the hour-label gutter, as a CSS length. */
  axis_width?: string;

  /** Label the axis with its hours. */
  show_axis_labels?: boolean;
}

/** Calendar entity configuration. */
export interface EntityConfig {
  entity: string;
  label?: string;
  label_type?: LabelType;
  color?: string;
  accent_color?: string;
  label_icon_color?: string;
  show_time?: boolean;
  show_location?: boolean;
  /**
   * Icon for this calendar's location row, replacing the default map marker.
   *
   * Per calendar only, and deliberately so: one icon for every location on the card would
   * be a *theming* choice, while this is a *semantic* one — it says this block's events are
   * Teams calls, or are at the office, and gives them the icon that says it. Nobody has
   * asked for the card-wide version.
   *
   * Set, it wins over the built-in Microsoft Teams detection, which doubles as that
   * feature's opt-out: `location_icon: mdi:map-marker-outline` restores the plain marker.
   */
  location_icon?: string;
  show_description?: boolean;
  compact_events_to_show?: number;
  blocklist?: string;
  allowlist?: string;
  /**
   * Which field `blocklist` and `allowlist` match against. Unset means `title`.
   *
   * Selects the field; it does not add one. Exactly one of the three is matched, so a
   * calendar filtering on `location` stops filtering on the title — list it twice to do
   * both.
   */
  filter_field?: FilterField;
  /**
   * Which field {@link EntityConfig.replace_pattern} and {@link EntityConfig.replace_with}
   * rewrite. Unset means `title`.
   *
   * One field per block, like `filter_field` — and unlike that option, listing the calendar
   * twice does **not** buy a second field. Two filter blocks partition the calendar's
   * events between them; two transform blocks both match the same events and each pushes
   * its own copy, so the card draws the event twice. See the note on
   * {@link EntityConfig.replace_pattern}.
   */
  replace_field?: ReplaceField;
  /**
   * What to find in the field named by {@link EntityConfig.replace_field}.
   *
   * An arbitrary regular expression, compiled with `gi` — global, so every occurrence goes
   * rather than the first, and case-insensitive to agree with `blocklist`, `allowlist` and
   * `remove_location_country`, the card's three other user-supplied patterns. A pattern
   * that does not compile leaves the text untouched and warns once.
   *
   * 🚨 **A calendar can transform exactly one field, and cannot be listed twice to get a
   * second.** `processEvents` filters each block against the calendar's *full* event set,
   * so an event matching two blocks is pushed by both — filters escape this because
   * `blocklist`/`allowlist` partition, while two transforms overlap. `filter_duplicates`
   * makes it worse rather than better: the signature is built from the *raw* event, which
   * no display transform touches, so the two copies are always identical and
   * `deduplicateEvents` keeps the **first** block's — silently discarding the second
   * block's transform along with its duplicate row.
   */
  replace_pattern?: string;
  /**
   * What to put in place of {@link EntityConfig.replace_pattern}, or of the whole field
   * when no pattern is set.
   *
   * The two keys are independently optional, and the four combinations mean four different
   * things:
   *
   * | `replace_pattern` | `replace_with` | Result                     |
   * | ----------------- | -------------- | -------------------------- |
   * | set               | unset          | the match is **removed**    |
   * | set               | set            | the match is **replaced**   |
   * | unset             | set            | the **whole field** is replaced |
   * | unset             | unset          | nothing happens            |
   *
   * 🚨 That third row is not decoration, and it is the reason "delete" gets a row of its
   * own rather than being spelled `replace_with: ''`. `isSet` in
   * `rendering/editor/synthetic.ts` counts the empty string as unset and the write path
   * drops it, so the visual editor **cannot store one** — a plain find/replace pair would
   * put "strip this prefix", which is #153's own first example, out of reach of everyone
   * not hand-editing YAML.
   *
   * With a pattern, this is the replacement argument of `String.replace`, so `$1` and `$&`
   * carry their usual meaning and a literal `$` is written `$$`. Replacing the whole field
   * takes the text verbatim instead — there are no groups to reference.
   *
   * Applied to the **display copy** only, so it never reaches the cache, never compounds
   * across renders, and never changes which events the filters see. An empty field is left
   * empty rather than filled: this rewrites text an event carries, it does not give an
   * event a location it never had.
   */
  replace_with?: string;
  split_multiday_events?: boolean;
  event_type?: EventType;
  days_of_week?: DaysOfWeekFilter;
  /**
   * Clock time at which this calendar's all-day events start counting as past, `HH:MM`.
   *
   * An all-day event has no end *instant*, only an end date, so the `show_past_events` test
   * cannot be applied to it directly. It is therefore past at **midnight after its last
   * day**, and this option moves that instant earlier within the final day. Unset keeps
   * midnight. Read only while `show_past_events` is `false`; it decides *when* an all-day
   * event becomes past, not whether past events show.
   */
  allday_expires_at?: string;
}

/** Weather position-specific styling configuration. */
export interface WeatherPositionConfig {
  show_conditions?: boolean;
  show_high_temp?: boolean;
  show_low_temp?: boolean;
  show_temp?: boolean;
  show_uv_index?: boolean;
  uv_index_threshold?: number;
  daily_forecast_fallback?: boolean;
  /**
   * Lines the per-event weather row may occupy before it truncates. `0` is unlimited.
   *
   * Read for the **event** position only; the day-header row has a different width and
   * no nested max-lines option.
   */
  max_lines?: number;
  icon_size?: string;
  font_size?: string;
  color?: string;
}

/** Weather configuration. */
export interface WeatherConfig {
  entity?: string;
  position?: 'none' | 'date' | 'event' | 'both';
  date?: WeatherPositionConfig;
  event?: WeatherPositionConfig;
}

/** Raw weather forecast data from Home Assistant. */
export interface WeatherForecast {
  datetime: string;
  condition: string;
  temperature: number;
  templow?: number;
  precipitation?: number;
  precipitation_probability?: number;
  wind_speed?: number;
  wind_bearing?: number;
  humidity?: number;
  uv_index?: number;
}

/** Processed weather data for use in templates. */
export interface WeatherData {
  icon: string;
  condition: string;
  temperature: string | number;
  templow?: string | number;
  uv_index?: number;
  datetime: string;
  hour?: number;
}

/** Weather forecasts organized by type and date/time. */
export interface WeatherForecasts {
  daily?: Record<string, WeatherData>;
  hourly?: Record<string, WeatherData>;
}

// -----------------------------------------------------------------------------
// CALENDAR DATA STRUCTURES
// -----------------------------------------------------------------------------

/** Calendar event data structure. */
export interface CalendarEventData {
  readonly start: { readonly dateTime?: string; readonly date?: string };
  readonly end: { readonly dateTime?: string; readonly date?: string };
  summary?: string;
  location?: string;
  description?: string;
  _entityId?: string;
  _entityLabel?: string;
  _isEmptyDay?: boolean;
  /** Empty-day placeholder uses custom text; suppresses the checkmark prefix only. */
  _isCustomEmptyText?: boolean;
  /**
   * Set on every segment produced by splitting a multi-day event, so a row can
   * tell "one day of a longer event" from a standalone event.
   *
   * Split timed events can look all-day after segmentation; this flag lets countdowns
   * count whole calendar days for every segment.
   */
  _isMultiDaySegment?: boolean;
  /**
   * Set on every segment produced by splitting a **timed** multi-day event, recording the
   * class of the event the segment came from rather than the shape the segment now has.
   *
   * The two differ, and only for these: splitting rewrites the middle days of a timed
   * event as `start: { date }`, so they read as all-day to everything downstream. That is
   * right for layout — a middle day genuinely occupies the whole day and draws no time —
   * and wrong for `allday_expires_at`, which is a statement about all-day *events*. Without
   * this, a calendar set to retire bin collections at 10:00 also deleted the middle day of
   * a three-day conference while it was still running.
   *
   * `_isMultiDaySegment` cannot answer the question, because segments of a genuinely
   * all-day event carry it too and must keep expiring one day at a time.
   *
   * 🚨 Set on **all three** segment kinds so the name is literally true of anything
   * carrying it, but only the middle ones can ever be read: the first and last keep their
   * `dateTime`, so the expiry branch's `isAllDayEvent` test excludes them before this is
   * consulted. Removing it from those two therefore breaks no test — it records provenance
   * there, not behaviour, and the alternative is a flag that lies about half its subjects.
   *
   * Carried into the display copies alongside `_isMultiDaySegment` for symmetry, though
   * only the expiry filter reads it today — that filter runs before the copies are built.
   */
  _splitFromTimedEvent?: boolean;
  _matchedConfig?: EntityConfig;
  /**
   * Every calendar that contributed a copy of this event, in `entities` order, set only
   * when `filter_duplicates` collapsed copies from **two or more distinct calendars**.
   *
   * The stamp exists because the merge is otherwise lossless in one direction only: the
   * surviving row keeps the first-listed entry's styling, and every other calendar that
   * held the same event is discarded without trace. A row that belongs to two people can
   * then only say one of their names, which is less than leaving the duplicates visible
   * would have told the reader.
   *
   * 🚨 Gated on distinct **entity ids**, not on the number of blocks that matched. Two
   * blocks of one calendar are the documented keyword-icon mapping pattern, where
   * first-listed is *supposed* to win and a title matching both `swim` and `meeting` must
   * take one icon rather than both. Counting blocks would break that pattern outright.
   */
  _mergedFrom?: ReadonlyArray<MergedCalendar>;
}

/**
 * One calendar that contributed a copy of a merged duplicate.
 *
 * Carries the block rather than only the id because the two answer different questions.
 * A label's *value* lives on the block, while the `home-assistant` sentinel resolves
 * against the calendar's own entity id — the same split `resolveEntityLabel` documents.
 */
export interface MergedCalendar {
  entityId: string;
  config?: EntityConfig;
}

/**
 * A label with everything `renderLabel` needs to draw it, resolved against Home Assistant.
 *
 * Each contributing calendar answers for itself, so the shape and the icon color travel
 * with the value instead of being read once from the row's own matched block.
 */
export interface ResolvedLabel {
  value: string;
  iconColor?: string;
  type?: LabelType;
}

/**
 * Result of a calendar fetch, including which entities failed.
 *
 * Per-entity fetch errors are tolerated, so `failedEntities` distinguishes an empty
 * calendar from a failed request.
 */
export interface EventFetchResult {
  events: CalendarEventData[];
  /** Entity IDs whose calendar could not be retrieved during this fetch. */
  failedEntities: string[];
}

/** Grouped events by day. */
export interface EventsByDay {
  weekday: string;
  day: number;
  month: string;
  timestamp: number;
  events: CalendarEventData[];
  weekNumber?: number | null;
  monthNumber?: number;
}

/** Cache entry structure. */
export interface CacheEntry {
  events: CalendarEventData[];
  timestamp: number;
  ttlMs?: number;
}

// -----------------------------------------------------------------------------
// USER INTERACTION
// -----------------------------------------------------------------------------

/** Action configuration for tap and hold actions. */
export interface ActionConfig {
  action: string;
  navigation_path?: string;
  service?: string;
  service_data?: object;
  url_path?: string;
  open_tab?: string;
}

// -----------------------------------------------------------------------------
// HOME ASSISTANT INTEGRATION
// -----------------------------------------------------------------------------

/** Home Assistant interface. */
export interface Hass {
  /** Every entity Home Assistant knows about, as full state objects. */
  states: Record<string, HassEntity>;
  callApi: (method: string, path: string, parameters?: object) => Promise<unknown>;
  callService: (domain: string, service: string, serviceData?: object) => void;
  locale?: {
    language: string;
    time_format?: string;
    /** Home Assistant's first-weekday profile setting: a weekday name, or 'language'. */
    first_weekday?: string;
  };
  connection?: {
    subscribeEvents: (callback: (event: unknown) => void, eventType: string) => Promise<() => void>;
    subscribeMessage: <T = WeatherForecastMessage>(
      callback: (message: T) => void,
      options: SubscribeMessageOptions,
    ) => Promise<() => void>;
    /** One-shot WebSocket request; not every custom-card `hass` also has `callWS`. */
    sendMessagePromise?: <T = unknown>(message: WebSocketMessage) => Promise<T>;
  };
  /** Sends a one-shot WebSocket command; optional so callers can degrade gracefully. */
  callWS?: <T = unknown>(message: WebSocketMessage) => Promise<T>;
  /**
   * Home Assistant's own entity-state formatter.
   *
   * The second parameter is an **override**: `computeStateDisplay` resolves the value
   * as `state !== undefined ? state : stateObj.state`, so passing a forecast's
   * condition returns *that* condition's localized text rather than the entity's
   * current one. Optional because older or non-standard `hass` objects may omit it.
   */
  formatEntityState?: (stateObj: HassEntity, state?: string) => string;
}

/** Weather forecast message structure received from Home Assistant. */
export interface WeatherForecastMessage {
  forecast: WeatherForecast[];
  forecast_type?: string;
  [key: string]: unknown;
}

/** Home Assistant subscribe message options. */
export interface SubscribeMessageOptions {
  type: string;
  /** Required by `weather/subscribe_forecast`, absent from `render_template`. */
  entity_id?: string;
  forecast_type?: string;
  [key: string]: unknown;
}

/**
 * A one-shot WebSocket command. `type` is the command name; everything else is
 * command-specific, which is why the rest is left open.
 */
export interface WebSocketMessage {
  type: string;
  [key: string]: unknown;
}

/**
 * Home Assistant's reply to `frontend/get_translations`.
 *
 * `resources` is a flat map of fully-qualified key to translated string — for the
 * weather component's states, `component.weather.entity_component._.state.<condition>`.
 */
export interface TranslationsResponse {
  resources?: Record<string, unknown>;
}

/**
 * One entry of Home Assistant's reply to `config/entity_registry/list`.
 *
 * Only the two fields the card reads are declared. A calendar's color lives in the
 * generic per-domain `options` blob rather than in a field of its own, and it is absent
 * from the compressed `list_for_display` shape that feeds `hass.entities` — so this
 * command is the only way to reach it.
 */
export interface EntityRegistryEntry {
  entity_id: string;
  options?: {
    calendar?: {
      color?: string | null;
    } | null;
  } | null;
}

/**
 * Successful `render_template` result pushed by Home Assistant.
 *
 * `result` is not necessarily a string: Home Assistant renders templates with
 * native type parsing enabled. `listeners.time` is true for templates that depend on
 * the current time.
 */
export interface RenderTemplateResult {
  result: unknown;
  listeners?: {
    all: boolean;
    domains: string[];
    entities: string[];
    time: boolean;
  };
}

/** Template error pushed by Home Assistant when `report_errors` is enabled. */
export interface RenderTemplateError {
  error: string;
  level: 'ERROR' | 'WARNING';
}

/** Home Assistant state object type. */
export interface HassEntity {
  /**
   * The entity's own id, and the reason this field is required rather than optional.
   *
   * `computeStateDisplay` builds its translation key from `computeDomain(stateObj.entity_id)`.
   * A state object without one produces `component.undefined.entity_component._.state.sunny`,
   * misses every table and falls through to the raw state. Every Home Assistant state
   * object carries this field.
   */
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed?: string;
  last_updated?: string;
  context?: {
    id?: string;
    parent_id?: string;
    user_id?: string | null;
  };
}

/**
 * A single card recipe offered by the Home Assistant card picker after the user
 * selects an entity.
 *
 * The first entry of a suggestion list is the canonical recipe and carries no
 * `label`; any further entry is a labelled variant naming only what differs.
 */
export interface EntitySuggestion {
  label?: string;
  config: Record<string, unknown>;
}

/** Custom card registration interface for Home Assistant. */
export interface CustomCard {
  type: string;
  name: string;
  preview: boolean;
  description: string;
  documentationURL?: string;
  /**
   * Optional hook (Home Assistant 2026.6+) that offers this card for a picked
   * entity. Must be synchronous and should return `null`, never an empty array, when
   * there is nothing to offer.
   *
   * Older Home Assistant versions ignore this key.
   */
  getEntitySuggestion?: (hass: Hass, entityId: string) => EntitySuggestion[] | null;
}

// -----------------------------------------------------------------------------
// UI SUPPORT
// -----------------------------------------------------------------------------

/** Interface for language translations. */
export interface Translations {
  loading: string;
  noEvents: string;
  error: string;
  allDay: string;
  multiDay: string;
  at: string;
  months: string[];
  daysOfWeek: string[];
  fullDaysOfWeek: string[];
  endsToday: string;
  endsTomorrow: string;
}
