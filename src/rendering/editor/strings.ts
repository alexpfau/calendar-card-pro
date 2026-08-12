/**
 * English strings for the schema-driven editor.
 *
 * A **fresh namespace**, held here rather than in `src/translations/languages/*.json`
 * for the duration of the rebuild. The editor it replaced owned `editor.*` and is
 * gone, but its sections in the thirty-five language files are kept rather than
 * deleted: they are the raw material for the translation pass, and several of their
 * strings will survive it verbatim. Keeping the new namespace separate is what stops
 * that old copy from standing in for a string nobody has written yet — `check:i18n`
 * reconciles against this table alone, so a missing label is reported rather than
 * quietly filled from a sentence written for a different surface.
 *
 * Per-key fallback in `translateEditorKey` means a partially translated editor
 * degrades to English rather than to raw key names, so shipping English-only is safe
 * at every intermediate step — the property that makes this affordable.
 *
 * `resolveString` already consults the translation files second, so migrating a key is
 * adding it to `en.json` and deleting the line below. Nothing else has to move.
 *
 * **Naming.** Keys are the config key they label. A key inside a group that draws a
 * heading is qualified with that group's path (`column.min_day_width`), because Home
 * Assistant qualifies the label key it asks for the same way; `computeLabel` falls back
 * to the bare key, so a field only needs qualifying when its name alone would be
 * ambiguous. Helper text is the key plus `.helper`, and an option label is the field
 * plus `.option.<value>.label`.
 */

/**
 * Label and helper strings, keyed as described above.
 *
 * Wording notes worth keeping: this is the surface where column view either explains
 * itself or generates support threads, so the sentences here state *what the card
 * does at a width* rather than *what an option is called*.
 */
export const EDITOR_STRINGS: Readonly<Record<string, string>> = {
  // --- Panels ---------------------------------------------------------------
  'panel.layout': 'Layout',
  'panel.layout.helper': 'How the card arranges days, and how much room it takes up.',

  // --- View -----------------------------------------------------------------
  view: 'Layout',
  'view.option.list.label': 'List',
  'view.option.list.description': 'Days stacked, one per row',
  'view.option.column.label': 'Columns',
  'view.option.column.description': 'Days side by side',
  'view.helper':
    'Column layout needs width. Below the threshold in the table, the same card ' +
    'renders as a list — so both layouts are live for one card, and the list ' +
    'settings still matter.',

  // --- Width table ----------------------------------------------------------
  'width_table.title': 'This card renders',
  'width_table.columns': '{count} columns',
  'width_table.columns_one': '1 column',
  'width_table.as_list': 'as a list',
  'width_table.cramped': '{count} columns, narrower than the minimum',
  'width_table.at_least': '\u2265 {width} px',
  'width_table.below': '< {width} px',
  'width_table.hysteresis':
    'Within {band} px of a boundary the card keeps the layout it already has, so a ' +
    'card sitting on the line settles instead of flickering.',

  // --- Spacing --------------------------------------------------------------
  day_spacing: 'Day Spacing',
  'day_spacing.helper': 'Gap between days. In column layout this is the gutter between columns.',
  event_spacing: 'Event Spacing',
  additional_card_spacing: 'Additional Card Spacing',
  'additional_card_spacing.helper': 'Extra padding above and below the card contents.',

  // --- Height ---------------------------------------------------------------
  height_mode: 'Card Height',
  'height_mode.helper': 'Whether the card grows with its content or is held to a height.',
  'height_mode.option.auto.label': 'Fit content',
  'height_mode.option.fixed.label': 'Fixed height',
  'height_mode.option.maximum.label': 'Maximum height',
  card_height: 'Height',
  'card_height.helper': 'The card is always this tall, scrolling if the events do not fit.',
  card_max_height: 'Maximum Height',
  'card_max_height.helper': 'The card grows with its content up to this height, then scrolls.',

  // --- Column density -------------------------------------------------------
  'column.density': 'Column Density',
  'column.density.helper':
    'How narrow a column may get before the card gives up a column, and what it does ' +
    'when it runs out.',
  'column.min_day_width': 'Minimum Day Width',
  'column.min_day_width.helper':
    'The narrowest a day column may be. Raising it makes the card demand more width ' +
    'for the same number of columns.',
  'column.min_days_to_show': 'Fewest Day Columns',
  'column.min_days_to_show.helper':
    'How far the card may reduce the column count to keep the layout. Defaults to the ' +
    'number of days shown, which means it never reduces.',
  'column.min_days_fallback': 'When Too Narrow',
  'column.min_days_fallback.option.list.label': 'Fall back to a list',
  'column.min_days_fallback.option.cramp.label': 'Keep the columns, narrower',
  'column.day_header_gap': 'Day Header Gap',
  'column.day_header_gap.helper': 'Space between a column heading and the events under it.',

  // --- Calendars ------------------------------------------------------------
  'panel.calendars': 'Calendars',
  'panel.calendars.helper': 'The calendars this card shows.',
  calendars: 'Calendars',
  'calendars.helper':
    'Order matters. When two calendars carry the same event and duplicates are ' +
    'filtered, the copy from the one listed first is the one kept.',

  // --- Time Range & Content -------------------------------------------------
  'panel.content': 'Time Range & Content',
  'panel.content.helper': 'Which days the card covers, and what it puts in them.',
  days_to_show: 'Days To Show',
  start_date_mode: 'Start Date',
  'start_date_mode.option.default.label': 'Today',
  'start_date_mode.option.fixed.label': 'A Fixed Date',
  'start_date_mode.option.offset.label': 'Relative To Today',
  start_date_fixed: 'Date',
  start_date_offset: 'Expression',
  'start_date_offset.helper':
    'An anchor — today, start_of_week, or a weekday name — followed by any number of ' +
    '+N or -N day offsets, +Nw week offsets, or +weekday jumps. For example today+7, ' +
    '-3, start_of_week, saturday, monday+1w.',
  first_day_of_week: 'First Day Of Week',
  'first_day_of_week.option.system.label': 'Follow Home Assistant',
  'first_day_of_week.option.monday.label': 'Monday',
  'first_day_of_week.option.sunday.label': 'Sunday',

  compact_mode: 'Compact Mode',
  'compact_mode.helper':
    'Limits that apply while the card is in a compact dashboard slot. Leaving both ' +
    'empty means compact mode changes nothing.',
  compact_days_to_show: 'Days',
  compact_events_to_show: 'Events',
  compact_events_complete_days: 'Finish The Last Day',
  'compact_events_complete_days.helper':
    'Rather than stopping mid-day at the event limit, show the rest of that day too.',

  content: 'What The Card Shows',
  show_past_events: "Show Today's Past Events",
  show_empty_days: 'Show Empty Days',
  empty_day_text: 'Empty Day Text',
  'empty_day_text.helper': 'Replaces the translated default, and drops the check mark before it.',
  empty_day_color: 'Empty Day Color',
  hide_when_empty: 'Hide The Card When Empty',
  'hide_when_empty.helper':
    'Removes the card from the dashboard entirely while it has nothing to show.',
  filter_duplicates: 'Filter Duplicates',
  'filter_duplicates.helper':
    'Hides an event whose title, start, end and location all match another. The copy ' +
    'from the calendar listed first is the one kept, along with its label and color.',
  split_multiday_events: 'Split Multi-Day Events',
  'split_multiday_events.helper':
    'Show an event on every day it covers rather than only on the day it starts.',

  locale: 'Language & Time Format',
  language_mode: 'Language',
  'language_mode.option.system.label': 'Follow Home Assistant',
  'language_mode.option.custom.label': 'Choose One',
  language: 'Language Code',
  'language.helper': 'A two-letter code such as de, or a regional one such as en-GB.',
  time_format: 'Time Format',
  'time_format.option.system.label': 'Follow Home Assistant',
  'time_format.option.24.label': '24 Hour',
  'time_format.option.12.label': '12 Hour',

  // --- Card & Title ---------------------------------------------------------
  'panel.card': 'Card & Title',
  'panel.card.helper': 'The card itself, and the heading above it.',
  title: 'Title',
  'title.helper':
    'Anything containing {{ or {% is rendered by Home Assistant as a template and ' +
    'keeps itself up to date.',
  title_font_size: 'Title Font Size',
  title_color: 'Title Color',
  background_color: 'Background Color',

  // --- Day Header -----------------------------------------------------------
  'panel.day_header': 'Day Header',
  'panel.day_header.helper': 'How each day announces itself, whichever layout it is announced in.',
  date_vertical_alignment: 'Vertical Alignment',
  'date_vertical_alignment.option.top.label': 'Top',
  'date_vertical_alignment.option.middle.label': 'Middle',
  'date_vertical_alignment.option.bottom.label': 'Bottom',
  weekday_font_size: 'Weekday Font Size',
  weekday_color: 'Weekday Color',
  day_font_size: 'Day Number Font Size',
  day_color: 'Day Number Color',
  show_month: 'Show Month',
  month_font_size: 'Month Font Size',
  month_color: 'Month Color',

  weekend_colors: 'Weekend Colors',
  'weekend_colors.helper': 'Each of these falls back to its weekday equivalent when left empty.',
  weekend_weekday_color: 'Weekend Weekday Color',
  weekend_day_color: 'Weekend Day Number Color',
  weekend_month_color: 'Weekend Month Color',

  today_colors: 'Today Colors',
  'today_colors.helper':
    'Each of these falls back to its weekend equivalent, and then to its weekday one.',
  today_weekday_color: "Today's Weekday Color",
  today_day_color: "Today's Day Number Color",
  today_month_color: "Today's Month Color",

  today_indicator: 'Today Indicator',
  'today_indicator.helper': 'A mark on the current day, so it can be found at a glance.',
  today_indicator_style: 'Style',
  'today_indicator_style.option.none.label': 'None',
  'today_indicator_style.option.dot.label': 'Dot',
  'today_indicator_style.option.pulse.label': 'Pulsing Dot',
  'today_indicator_style.option.glow.label': 'Glowing Dot',
  'today_indicator_style.option.icon.label': 'An Icon',
  'today_indicator_style.option.custom.label': 'An Emoji Or Image',
  today_indicator_icon: 'Icon',
  today_indicator_custom: 'Emoji Or Image Path',
  today_indicator_color: 'Indicator Color',
  today_indicator_size: 'Indicator Size',
  today_indicator_position: 'Indicator Position',
  'today_indicator_position.helper':
    'A pair of percentages, across then down — for example 15% 50%.',

  week_numbers: 'Week Numbers',
  week_number_mode: 'Numbering',
  'week_number_mode.option.none.label': 'None',
  'week_number_mode.option.iso.label': 'ISO 8601',
  'week_number_mode.option.simple.label': 'Simple',
  'week_number_mode.helper':
    'ISO counts the first week with four days in the new year as week one; simple ' +
    'counts from January 1st.',
  show_current_week_number: 'Show The Current Week',
  week_number_font_size: 'Week Number Font Size',
  week_number_color: 'Week Number Color',
  week_number_background_color: 'Week Number Background Color',

  // --- Events ---------------------------------------------------------------
  'panel.events': 'Events',
  'panel.events.helper': 'The events themselves, and the lines each one can carry.',
  event_font_size: 'Event Font Size',
  event_color: 'Event Color',
  accent_color: 'Accent Color',
  'accent_color.helper':
    'The bar beside each event. A calendar can override it for its own events.',
  vertical_line_width: 'Accent Bar Width',
  event_background_opacity: 'Event Background Opacity',
  'event_background_opacity.helper':
    'Tints each event with its accent color. Zero leaves it untinted.',
  title_max_lines: 'Title Line Limit',
  'title_max_lines.helper': 'Zero means no limit. A truncated title ends in an ellipsis.',
  event_icon_vertical_alignment: 'Icon Alignment',
  'event_icon_vertical_alignment.option.top.label': 'Top',
  'event_icon_vertical_alignment.option.middle.label': 'Middle',
  'event_icon_vertical_alignment.option.bottom.label': 'Bottom',

  time: 'Time',
  show_time: 'Show Time',
  show_end_time: 'Show End Time',
  show_single_allday_time: 'Show Time For All-Day Events',
  time_two_digit_hours: 'Pad Hours To Two Digits',
  time_font_size: 'Time Font Size',
  time_color: 'Time Color',
  time_icon_size: 'Time Icon Size',
  time_max_lines: 'Time Line Limit',

  location: 'Location',
  show_location: 'Show Location',
  location_country_mode: 'Country Names',
  'location_country_mode.option.keep.label': 'Keep Them',
  'location_country_mode.option.builtin.label': 'Remove Well-Known Ones',
  'location_country_mode.option.custom.label': 'Remove Ones I Name',
  location_country_pattern: 'Countries To Remove',
  'location_country_pattern.helper':
    'Names separated by | — for example USA | United States | Canada. Only a name at ' +
    'the end of the location is removed.',
  location_font_size: 'Location Font Size',
  location_color: 'Location Color',
  location_icon_size: 'Location Icon Size',
  location_max_lines: 'Location Line Limit',

  description: 'Description',
  show_description: 'Show Description',
  description_font_size: 'Description Font Size',
  description_color: 'Description Color',
  description_icon_size: 'Description Icon Size',
  description_max_lines: 'Description Line Limit',

  progress: 'Countdown & Progress',
  'progress.helper': 'How long until an event starts, and how far through it we are.',
  show_countdown: 'Show Countdown',
  show_countdown_allday: 'Count Down To All-Day Events Too',
  show_progress_bar: 'Show Progress Bar',
  progress_bar_color: 'Progress Bar Color',
  progress_bar_height: 'Progress Bar Height',
  progress_bar_width: 'Progress Bar Width',

  // --- Separators -----------------------------------------------------------
  'panel.separators': 'Separators',
  'panel.separators.helper': 'The rules the card draws between days, weeks and months.',
  day_separator_width: 'Day Rule Width',
  day_separator_color: 'Day Rule Color',
  week_separator_width: 'Week Rule Width',
  week_separator_color: 'Week Rule Color',
  month_separator_width: 'Month Rule Width',
  month_separator_color: 'Month Rule Color',
  'column.day_header_separator': 'Day Header Rule',
  'column.day_header_separator.helper':
    'The rule under a column heading. It sits inside the day header gap, so switching ' +
    'it off does not move the events.',
  'column.day_header_separator_width': 'Day Header Rule Width',
  'column.day_header_separator_color': 'Day Header Rule Color',

  // --- Weather --------------------------------------------------------------
  //
  // `entity` and `position` are spelled bare because the block they sit in nests the
  // configuration without drawing a heading, and Home Assistant only qualifies a label
  // key with a group that *has* one. They are the only two generic names in the table,
  // and `computeLabel` tries the qualified key first, so a future field of the same
  // name inside a titled group would resolve to its own string rather than to these.
  'panel.weather': 'Weather',
  'panel.weather.helper': 'A forecast beside the day, beside the event, or both.',
  entity: 'Weather Entity',
  'entity.helper': 'Leave empty for no forecast at all.',
  position: 'Show The Forecast',
  'position.option.none.label': 'Nowhere',
  'position.option.date.label': 'In The Day Header',
  'position.option.event.label': 'Beside Each Event',
  'position.option.both.label': 'In Both Places',

  'weather.date': 'In The Day Header',
  'weather.date.helper': "The day's forecast, shown once per day.",
  'date.show_conditions': 'Show Conditions',
  'date.show_high_temp': 'Show High Temperature',
  'date.show_low_temp': 'Show Low Temperature',
  'date.show_uv_index': 'Show UV Index',
  'date.uv_index_threshold': 'UV Index Threshold',
  'date.uv_index_threshold.helper': 'Hide the index below this value. Zero always shows it.',
  'date.icon_size': 'Icon Size',
  'date.font_size': 'Font Size',
  'date.color': 'Color',

  'weather.event': 'Beside Each Event',
  'weather.event.helper': "The forecast for each event's own start time.",
  'event.show_conditions': 'Show Conditions',
  'event.show_temp': 'Show Temperature',
  'event.show_uv_index': 'Show UV Index',
  'event.uv_index_threshold': 'UV Index Threshold',
  'event.uv_index_threshold.helper': 'Hide the index below this value. Zero always shows it.',
  'event.daily_forecast_fallback': 'Fall Back To The Daily Forecast',
  'event.daily_forecast_fallback.helper':
    'For an all-day event, or one further ahead than the hourly forecast reaches.',
  'event.icon_size': 'Icon Size',
  'event.font_size': 'Font Size',
  'event.color': 'Color',

  // --- Actions & Refresh ----------------------------------------------------
  'panel.actions': 'Actions & Refresh',
  'panel.actions.helper': 'What a tap does, and how often the card re-reads its calendars.',
  tap_action: 'Tap Action',
  hold_action: 'Hold Action',
  refresh_interval: 'Refresh Interval',
  'refresh_interval.helper': 'How long the card keeps its cached events before fetching again.',
  refresh_on_navigate: 'Refresh On Navigation',
  'refresh_on_navigate.helper': 'Fetch again whenever the dashboard view is opened.',

  // --- Applicability --------------------------------------------------------
  //
  // Phrased as what the option *does* apply to, never as "this does nothing".
  // A column card renders as a list on a narrow screen, so a list-only option on a
  // column card is still the live control for what that card shows on a phone.
  'scope.list_only': 'Applies to the list layout, which this card also uses on narrow screens.',
  'scope.list_only.today_indicator_position':
    'Applies to the list layout — column layout places the indicator for you.',
  'scope.list_only.compact_events_to_show':
    'Applies to the list layout. Capping events per card would empty columns rather ' +
    'than shorten the card.',
  'scope.list_only.compact_days_to_show':
    'Applies to the list layout — capping days would delete trailing columns.',
  'scope.list_only.compact_events_complete_days':
    'Applies to the list layout — the height budget rotates per column.',
};

/**
 * Renders `{placeholder}` substitutions in a string.
 *
 * @param template - String possibly containing `{name}` placeholders
 * @param values - Replacements, keyed by placeholder name
 * @returns The string with every matching placeholder replaced
 */
export function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
