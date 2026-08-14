/**
 * English editor strings; keep keys aligned with schemas and translations.
 * `en-GB` is override-only: it carries spelling differences and otherwise falls back to `en`.
 */

export const EDITOR_STRINGS: Readonly<Record<string, string>> = {
  // --- Filter bar -----------------------------------------------------------
  //
  // The chassis's own control, above the panels. Written as *settings* rather than as
  // *options* in the two sentences a user reads while searching: at that moment they are
  // looking for a thing in a user interface, not for a config key, and the reference
  // documentation's noun would be the wrong register. Everything that names an option in
  // its own right still calls it an option.
  search: 'Search Settings',
  customized_only: 'Customized Only',
  'customized_only.helper':
    'Hides everything left at the value the card would use anyway, so what is left is ' +
    'what this card changes.',
  'filter.no_matches': 'Nothing matches “{query}”.',
  'filter.nothing_customized': 'Nothing is customized — every setting is at the card default.',
  'filter.gated_note':
    'Settings that depend on another one appear only once that one is switched on.',

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
  //
  // No helper on the mode: its three option labels — *Fit content*, *Fixed height*,
  // *Maximum height* — already say what it does, and a sentence restating them in prose
  // costs a line and teaches the reader that helpers are not worth reading. The two
  // measurements below say what a helper can only say there: what happens when the
  // events do not fit.
  height_mode: 'Card Height',
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
  //
  // The panel helper earns its line by naming the half of this panel the title does
  // not: it is not only *which* calendars, it is where each one's label, colours and
  // filters live. "The calendars this card shows" was *Calendars* with more words in it.
  'panel.calendars': 'Calendars',
  'panel.calendars.helper': 'Which calendars the card shows, and how each one looks.',
  calendars: 'Calendars',
  'calendars.helper':
    'Order matters, and can be dragged. When two calendars carry the same event and ' +
    'duplicates are filtered, the copy from the one listed first is the one kept.',

  // --- Per-calendar settings ------------------------------------------------
  //
  // Each calendar gets its own collapsible form below the picker. Four of these are
  // three-way rather than switches, because the card reads them presence-first — an
  // absent key means "follow the card", which no checkbox can say.
  'entity.customised': 'Configured',
  'entity.unconfigured': 'Using the card settings',
  'entity.copy': 'Copy Settings',
  'entity.paste': 'Paste Settings',

  'entity.label_type': 'Label Type',
  'entity.label_type.helper':
    'Shown before every event from this calendar. An image label is a path the browser ' +
    'can reach, such as /local/work.png.',
  'entity.label_type.option.none.label': 'None',
  'entity.label_type.option.text.label': 'Text or Emoji',
  'entity.label_type.option.icon.label': 'An Icon',
  'entity.label_type.option.image.label': 'An Image',
  'entity.label': 'Label',
  'entity.color': 'Event Color',
  'entity.color.helper': 'Event titles from this calendar. Overrides the card colour.',
  'entity.accent_color': 'Accent Color',
  'entity.accent_color.helper':
    'The vertical line beside each event, and its background where the background ' +
    'opacity is above zero.',
  'entity.label_icon_color': 'Label Icon Color',
  'entity.label_icon_color.helper': 'Left empty, the icon takes the text colour around it.',

  'entity.show_time': 'Event Times',
  'entity.show_time.option.inherit.label': 'Follow the card',
  'entity.show_time.option.show.label': 'Always show',
  'entity.show_time.option.hide.label': 'Never show',
  'entity.show_location': 'Event Locations',
  'entity.show_location.option.inherit.label': 'Follow the card',
  'entity.show_location.option.show.label': 'Always show',
  'entity.show_location.option.hide.label': 'Never show',
  'entity.show_description': 'Event Descriptions',
  'entity.show_description.option.inherit.label': 'Follow the card',
  'entity.show_description.option.show.label': 'Always show',
  'entity.show_description.option.hide.label': 'Never show',

  'entity.split_multiday_events': 'Multi-Day Events',
  'entity.split_multiday_events.option.inherit.label': 'Follow the card',
  'entity.split_multiday_events.option.split.label': 'Split across each day',
  'entity.split_multiday_events.option.whole.label': 'Keep as one event',

  'entity.compact_events_to_show': 'Compact Events to Show',
  'entity.compact_events_to_show.helper':
    'How many of this calendar\u2019s events compact mode keeps. Left empty, the card ' +
    'limit applies.',
  'entity.blocklist': 'Blocklist',
  'entity.blocklist.helper':
    'Hide events whose title contains any of these terms, separated by | \u2014 for ' +
    'example Private|Tentative.',
  'entity.allowlist': 'Allowlist',
  'entity.allowlist.helper':
    'Show only events whose title contains one of these terms, separated by | . Left ' +
    'empty, every event is shown.',

  // --- Exceptions -----------------------------------------------------------
  //
  // The surface for "this option has a different value in column layout". Worded as
  // exceptions throughout, because that is what they are: the card has one
  // configuration, and a handful of options may depart from it in one layout.
  'exceptions.title': 'Column View Exceptions',
  'exceptions.summary.none': 'Every option above applies to both layouts',
  'exceptions.summary.one': '1 option differs in column layout',
  'exceptions.summary.many': '{count} options differ in column layout',
  exceptions: 'Options With An Exception',
  'exceptions.helper':
    'Pick the options that should take a different value when this card renders as ' +
    'columns. Removing one returns it to the shared value above.',
  'column.height': 'Height',
  'column.height.helper': 'A fixed height for the column layout. Use auto to let it grow.',
  'column.max_height': 'Maximum Height',
  'column.max_height.helper':
    'The height the column layout may grow to before it scrolls. Use none for no limit.',
  'column.show_week_numbers': 'Week Numbers',
  'column.today_indicator': 'Today Indicator',
  'column.remove_location_country': 'Country Names',
  'column.show_empty_days.helper':
    'Column layout defaults this to on, whatever the shared setting above says.',
  'column.split_multiday_events.helper':
    'Column layout defaults this to on, whatever the shared setting above says.',

  // --- Defaults a view substitutes -------------------------------------------
  //
  // Said beside the shared control rather than as an exception row of its own. The
  // statement is that the view has already decided the option, which is information
  // about the control the user is looking at — an exception row would be two rows of
  // chrome on every card that has asked for none.
  'view_default.column.show_empty_days':
    'Column layout shows empty days whatever this is set to, so that the columns keep ' +
    'matching consecutive days. Add an exception below to change that.',
  'view_default.column.split_multiday_events':
    'Column layout splits multi-day events whatever this is set to, so that every day ' +
    'an event covers shows it. Add an exception below to change that.',

  // --- Time Range & Content -------------------------------------------------
  'panel.content': 'Time Range & Content',
  'panel.content.helper': 'Which days the card covers, and what it puts in them.',
  days_to_show: 'Days To Show',
  start_date_mode: 'Start Date',
  'start_date_mode.option.default.label': 'Today',
  'start_date_mode.option.fixed.label': 'A Fixed Date',
  'start_date_mode.option.offset.label': 'Relative to Today',
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
    'Shortens the card while it sits in a compact dashboard slot. Leaving both empty ' +
    'means compact mode changes nothing.',
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
  today_indicator_style: 'Style',
  'today_indicator_style.option.none.label': 'None',
  'today_indicator_style.option.dot.label': 'Dot',
  'today_indicator_style.option.pulse.label': 'Pulsing Dot',
  'today_indicator_style.option.glow.label': 'Glowing Dot',
  'today_indicator_style.option.icon.label': 'An Icon',
  'today_indicator_style.option.custom.label': 'An Emoji or Image',
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
    'ISO is the European and international standard: week one is the first with four ' +
    'days in the new year, so the numbering stays consistent from year to year. Simple ' +
    'counts from January 1st, which is common in North America and can leave a short ' +
    'first week.',
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
  'position.option.date.label': 'In the Day Header',
  'position.option.event.label': 'Beside Each Event',
  'position.option.both.label': 'In Both Places',

  'weather.date': 'In the Day Header',
  'weather.date.helper': "The day's forecast, shown once per day.",
  'date.show_conditions': 'Show Conditions',
  'date.show_high_temp': 'Show High Temperature',
  'date.show_low_temp': 'Show Low Temperature',
  'date.show_low_temp.helper': 'The UV index takes this place on days it is shown.',
  'date.show_uv_index': 'Show UV Index',
  'date.uv_index_threshold': 'UV Index Threshold',
  'date.uv_index_threshold.helper': 'Hide the index below this value. Zero always shows it.',
  'date.icon_size': 'Icon Size',
  'date.font_size': 'Font Size',
  'date.color': 'Color',

  'weather.event': 'Beside Each Event',
  'weather.event.helper': "The forecast for each event's own start time.",
  'event.show_conditions': 'Show Conditions',
  'event.show_conditions.helper':
    'Shows the condition icon. In the column layout the icon is always shown, because ' +
    'the row shares an icon edge with the time and location, and this adds the ' +
    'condition in words instead.',
  'event.show_temp': 'Show Temperature',
  'event.show_uv_index': 'Show UV Index',
  'event.uv_index_threshold': 'UV Index Threshold',
  'event.uv_index_threshold.helper': 'Hide the index below this value. Zero always shows it.',
  'event.daily_forecast_fallback': 'Fall Back to the Daily Forecast',
  'event.daily_forecast_fallback.helper':
    'For an all-day event, or one further ahead than the hourly forecast reaches.',
  'event.icon_size': 'Icon Size',
  'event.font_size': 'Font Size',
  'event.color': 'Color',
  'event.max_lines': 'Weather Line Limit',
  'event.max_lines.helper':
    'Zero means no limit. Only the column layout writes the condition out in words, ' +
    'so only there can this row reach a second line. The temperature and UV index are ' +
    'never truncated.',

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
  'scope.list_only.compact_mode':
    'No effect in column view. These only shorten the list layout, which also appears ' +
    'on narrow screens; in columns, limits would remove whole days instead.',
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
