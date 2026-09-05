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
  'view.option.grid.label': 'Time Grid',
  'view.option.grid.description': 'Days side by side on an hour axis',
  'view.helper':
    'Side-by-side layouts need width. Below the threshold in the table, the same card ' +
    'renders as a list — so multiple layouts are live for one card, and the list ' +
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
  'grid.day_header_gap': 'Day Header Gap',
  'grid.day_header_gap.helper': 'Space between a grid heading and the content below it.',

  // --- Calendars ------------------------------------------------------------
  //
  // The panel helper earns its line by naming the half of this panel the title does
  // not: it is not only *which* calendars, it is where each one's label, colours and
  // filters live. "The calendars this card shows" was *Calendars* with more words in it.
  'panel.calendars': 'Calendars',
  'panel.calendars.helper': 'Which calendars the card shows, and how each one looks.',
  calendars: 'Calendars',
  // "Entries" rather than "calendars": with Duplicate, the two entries carrying the same
  // event are often two blocks of *one* calendar, and `deduplicateEvents` keeps whichever
  // is listed first in `entities` either way. Naming calendars made the true case — the
  // keyword-icon mapping, which is one calendar listed several times — read as impossible.
  'calendars.helper':
    'Order matters, and can be dragged. When two entries carry the same event and ' +
    'duplicates are filtered, the copy from the one listed first is the one kept.',

  // --- Per-calendar settings ------------------------------------------------
  //
  // Each calendar gets its own collapsible form below the picker. Four of these are
  // three-way rather than switches, because the card reads them presence-first — an
  // absent key means "follow the card", which no checkbox can say.
  'entity.customised': 'Configured',
  'entity.unconfigured': 'Using the card settings',
  // Not "Copy 2 of 2": neither block is the copy once both exist, and which one was
  // duplicated stops being interesting the moment their settings diverge. What the user
  // needs is only which of the two panels they are looking at.
  'entity.occurrence': 'Entry {position} of {total}',
  'entity.copy': 'Copy Settings',
  'entity.paste': 'Paste Settings',
  'entity.duplicate': 'Duplicate',
  'entity.remove': 'Remove',

  'entity.label_type': 'Label Type',
  'entity.label_type.helper':
    'Shown before every event from this calendar. An image label is a path the browser ' +
    'can reach, such as /local/work.png.',
  'entity.label_type.option.none.label': 'None',
  'entity.label_type.option.text.label': 'Text or Emoji',
  'entity.label_type.option.icon.label': 'An Icon',
  'entity.label_type.option.image.label': 'An Image',
  'entity.label_icon_source': 'Icon Source',
  'entity.label_icon_source.helper':
    'Home Assistant holds an icon for each calendar, under Settings, Devices & Services, ' +
    'Entities. Following it keeps the two in step; calendars it has no icon for show no ' +
    'label at all.',
  'entity.label_icon_source.option.home_assistant.label': 'Follow Home Assistant',
  'entity.label_icon_source.option.custom.label': 'Custom icon',
  'entity.label_image_source': 'Image Source',
  'entity.label_image_source.helper':
    "A person's picture comes from Home Assistant, under Settings, People. Changing it " +
    'there changes it here; people it holds no picture for show no label at all.',
  'entity.label_image_source.option.custom.label': 'Custom image',
  'entity.label_image_source.option.person.label': "A person's picture",
  'entity.label': 'Label',
  'entity.color': 'Event Color',
  'entity.color.helper': 'Event titles from this calendar. Overrides the card colour.',
  'entity.accent_color': 'Accent Color',
  'entity.accent_color.helper':
    'The vertical line beside each event, and its background where the background ' +
    'opacity is above zero.',
  'entity.accent_color_mode': 'Accent Color',
  'entity.accent_color_mode.helper':
    'Home Assistant can hold a color for each calendar, under Settings, Devices & ' +
    'Services, Entities. Calendars it has no color for fall back to the card.',
  'entity.accent_color_mode.option.inherit.label': 'Follow the card',
  'entity.accent_color_mode.option.home_assistant.label': 'Follow Home Assistant',
  'entity.accent_color_mode.option.custom.label': 'Custom color',
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
  'entity.location_icon': 'Location Icon',
  'entity.location_icon.helper':
    'Icon shown beside this calendar\u2019s locations, in place of the map marker. Left ' +
    'empty, Microsoft Teams meetings get the Teams icon and everything else the marker.',
  'entity.show_description': 'Event Descriptions',
  'entity.show_description.option.inherit.label': 'Follow the card',
  'entity.show_description.option.show.label': 'Always show',
  'entity.show_description.option.hide.label': 'Never show',

  'entity.split_multiday_events': 'Split Across Days',
  'entity.split_multiday_events.option.inherit.label': 'Follow the card',
  'entity.split_multiday_events.option.split.label': 'Split across each day',
  'entity.split_multiday_events.option.whole.label': 'Keep as one event',

  // --- Sub-headings ---------------------------------------------------------
  //
  // Rendered by `heading()` as `constant` nodes, which carry no value and no input. The
  // same key serves both the card-level and per-calendar panels wherever they name the
  // same category, so the two read with one vocabulary rather than two.
  //
  // Terse noun phrases, and deliberately so. The earlier set were sentence fragments —
  // `Which Events Appear`, `What Each Event Shows` — which read well in isolation and
  // collided the moment a section about what an event *says* was added beside one about
  // what it *shows*. The collision is worse in translation than in English, because
  // "appear" and "show" collapse to one verb in several of the nine translated languages.
  //
  // 🚨 `heading_multiday` names the same thing as the field beneath it once, which is why
  // `entity.split_multiday_events` is `Split Across Days` rather than `Multi-Day Events`:
  // a heading repeating its only field's label is the stutter `AGENTS.md` warns about, and
  // it is invisible to a DOM probe. Renaming the field rather than the heading also moves
  // the per-calendar label closer to the card-level `Split Multi-Day Events`.
  heading_filters: 'Event Filtering',
  heading_replace: 'Text Replacement',
  heading_multiday: 'Multi-Day Events',
  heading_nothing: 'Empty Days',
  heading_appearance: 'Label & Colors',
  heading_details: 'Event Details',

  'entity.event_type': 'Event Type',
  'entity.event_type.option.inherit.label': 'Follow the card',
  'entity.event_type.option.all.label': 'All events',
  'entity.event_type.option.timed.label': 'Only events with a time',
  'entity.event_type.option.all_day.label': 'Only all-day events',
  'entity.event_type.helper':
    'List the same calendar twice \u2014 once on each of the last two \u2014 to give ' +
    'its all-day and timed events different colors.',

  'entity.compact_events_to_show': 'Compact Events to Show',
  'entity.compact_events_to_show.helper':
    'How many of this calendar\u2019s events compact mode keeps. Left empty, the card ' +
    'limit applies.',
  'entity.blocklist': 'Blocklist',
  'entity.blocklist.helper':
    'Hide events where the field above contains any of these terms, separated by | ' +
    '\u2014 for example Private|Tentative.',
  'entity.allowlist': 'Allowlist',
  'entity.allowlist.helper':
    'Show only events where the field above contains one of these terms, separated by ' +
    '| . Left empty, every event is shown.',
  'entity.filter_field': 'Match Against',
  'entity.filter_field.option.title.label': 'Event title',
  'entity.filter_field.option.location.label': 'Location',
  'entity.filter_field.option.description.label': 'Description',
  'entity.filter_field.helper':
    'Which part of an event the two lists below read. One at a time \u2014 list the same ' +
    'calendar twice to filter on a second.',
  'entity.allday_expires_at': 'All-Day Events Expire At',
  'entity.allday_expires_at.helper':
    'Time of day this calendar\u2019s all-day events stop counting as upcoming, on the ' +
    'last day they cover. Left empty they last until midnight. Only applies while past ' +
    'events are hidden, and takes effect on the card\u2019s next refresh rather than on ' +
    'the minute.',
  'entity.days_of_week': 'Days of the Week',
  'entity.days_of_week.option.inherit.label': 'Every day',
  'entity.days_of_week.option.weekdays.label': 'Monday to Friday only',
  'entity.days_of_week.option.weekends.label': 'Saturday and Sunday only',
  'entity.days_of_week.helper':
    'Which days this calendar may put events on. A multi-day event keeps only the days ' +
    'that qualify, so a holiday running through a weekend still shows on the weekdays ' +
    'around it.',

  // --- Text replacement -----------------------------------------------------
  //
  // Find/replace wording rather than pattern wording, because that is the vocabulary every
  // user already has. The regular expression is named in the helper for the people who
  // want one; nobody has to know the word to strip a prefix off a birthday.
  //
  // 🚨 Both text fields say what happens when they are left **empty**, and those two
  // sentences are the whole feature rather than politeness. Empty `Find` replaces the whole
  // field; empty `Replace With` deletes the match. The editor cannot store an empty string
  // — `isSet` in `synthetic.ts` rejects it — so an absent value is the only way either
  // instruction can be given, and a helper that did not say so would leave both unreachable
  // in practice.
  'entity.replace_field': 'Replace In',
  'entity.replace_field.option.title.label': 'Event title',
  'entity.replace_field.option.location.label': 'Location',
  'entity.replace_field.option.description.label': 'Description',
  'entity.replace_field.helper':
    'Which part of an event the two fields below rewrite. One at a time \u2014 and unlike ' +
    'the filters above, listing the calendar twice does not add a second, because both ' +
    'copies would draw the same events.',
  'entity.replace_pattern': 'Find',
  'entity.replace_pattern.helper':
    'Text to find, as a regular expression. Every match is replaced, whatever its case. ' +
    'Left empty, the whole field is replaced instead.',
  'entity.replace_with': 'Replace With',
  'entity.replace_with.helper':
    'What to put in place of each match \u2014 or of the whole field, when nothing is ' +
    'being searched for. Left empty, the match is removed.',

  // --- Exceptions -----------------------------------------------------------
  //
  // The surface for "this option has a different value in this layout". Worded as
  // exceptions throughout, because that is what they are: the card has one
  // configuration, and a handful of options may depart from it in one layout.
  'exceptions.title': 'View Exceptions',
  'exceptions.summary.none': 'Every option above uses this view\u2019s normal value',
  'exceptions.summary.one': '1 option differs in this view',
  'exceptions.summary.many': '{count} options differ in this view',
  exceptions: 'Options With An Exception',
  'exceptions.helper':
    'Pick the options that should take a different value when this card renders as ' +
    'this view. Removing one returns it to the shared value above.',
  'column.height': 'Height',
  'column.height.helper': 'A fixed height for the column layout. Use auto to let it grow.',
  'column.max_height': 'Maximum Height',
  'column.max_height.helper':
    'The height the column layout may grow to before it scrolls. Use none for no limit.',
  'column.show_week_numbers': 'Week Numbers',
  'column.today_indicator': 'Today Indicator',
  'column.allday_badge': 'All-Day Badge',
  'column.allday_badge_style': 'All-Day Badge Style',
  'column.allday_badge_color': 'All-Day Badge Color',
  'column.remove_location_country': 'Country Names',
  'grid.density': 'Grid Density',
  'grid.density.helper':
    'How narrow a day column may get before the grid gives up a day, and what it does ' +
    'when it runs out.',
  'grid.min_day_width': 'Minimum Day Width',
  'grid.min_day_width.helper':
    'The narrowest a day column may be. The default 100px keeps three days at 352px, ' +
    'or 368px when entering from the list fallback.',
  'grid.min_days_to_show': 'Fewest Day Columns',
  'grid.min_days_to_show.helper':
    'How far the grid may reduce the day count to keep the time layout. Defaults to 1, ' +
    'because a one-day grid is still a useful day view with a now line.',
  'grid.min_days_fallback': 'When Too Narrow',
  'grid.min_days_fallback.option.list.label': 'Fall back to a list',
  'grid.min_days_fallback.option.cramp.label': 'Keep the grid, narrower',
  'grid.axis': 'Time Axis',
  'grid.axis.helper':
    'Which hours the card draws, and how they are ruled. Everything on the axis is ' +
    'positioned as a share of this band, so a fixed card height simply compresses it.',
  'grid.start_time': 'First Hour',
  'grid.start_time.helper':
    'As HH:mm. Events entirely before this are not drawn at all, so this decides what ' +
    'the card shows and not only how it looks.',
  'grid.end_time': 'Last Hour',
  'grid.end_time.helper':
    'As HH:mm, or 24:00 for the end of the day. If either time cannot be read, both fall ' +
    'back to 07:00 and 22:00 together.',
  'grid.slot_minutes': 'Grid Lines Every',
  'grid.slot_minutes.helper':
    'Spacing of the rules across the axis. Ruling only — an hour is the same height ' +
    'whichever you pick.',
  'grid.slot_minutes.option.15.label': '15 minutes',
  'grid.slot_minutes.option.20.label': '20 minutes',
  'grid.slot_minutes.option.30.label': '30 minutes',
  'grid.slot_minutes.option.60.label': '1 hour',
  'grid.hour_height': 'Height Per Hour',
  'grid.hour_height.helper':
    "The card's natural height, one hour at a time. Ignored when a fixed height is set: " +
    'the axis compresses to fit instead.',
  'grid.axis_width': 'Hour Label Width',
  'grid.show_axis_labels': 'Show Hour Labels',
  'grid.show_now_line': 'Now Line',
  'grid.show_now_line.helper':
    "Marks the current time on today's column. Hidden when now falls outside the hours " +
    'above, rather than pinned to an edge.',
  'grid.now_line_color': 'Now Line Color',
  'grid.allday_band_max_rows': 'Most All-Day Rows',
  'grid.allday_band_max_rows.helper':
    'How tall that band may grow. Banners past this are dropped — without a cap, a week ' +
    'of long events would push the axis off the card.',
  'grid.max_simultaneous_events': 'Most Events Side By Side',
  'grid.max_simultaneous_events.helper':
    'Above this, the rest collapse into one block saying how many it stands for. Nothing ' +
    'is hidden without being counted.',
  'grid.height': 'Height',
  'grid.height.helper': 'A fixed height for the grid layout. Use auto to let it grow.',
  'grid.max_height': 'Maximum Height',
  'grid.max_height.helper': 'The tallest the grid layout may grow before it scrolls.',
  'grid.show_week_numbers': 'Week Numbers',
  'grid.allday_badge': 'All-Day Badge',
  'grid.remove_location_country': 'Remove Country From Location',
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
  'view_default.grid':
    'Time grid starts this option from {value}, whatever the shared setting above says. ' +
    'Add a grid exception below to change it.',
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
    'An anchor — today, start_of_week, or a weekday name — followed by up to eight ' +
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
  show_past_events: 'Show Past Events',
  show_empty_days: 'Show Empty Days',
  empty_day_text: 'Empty Day Text',
  'empty_day_text.helper': 'Replaces the translated default, and drops the check mark before it.',
  empty_day_color: 'Empty Day Color',
  hide_when_empty: 'Hide The Card When Empty',
  'hide_when_empty.helper':
    'Removes the card from the dashboard entirely while it has nothing to show.',
  filter_duplicates: 'Filter Duplicates',
  // See `calendars.helper`: the entry listed first wins, and that entry may be a second
  // block of the same calendar rather than a different one. Colors only — since v4.2 a row
  // merged across two or more distinct calendars shows every one of their labels.
  'filter_duplicates.helper':
    'Hides an event whose title, start, end and location all match another. The copy ' +
    'from the entry listed first is the one kept, along with its color.',
  duplicate_accent_color: 'Shared Event Color',
  'duplicate_accent_color.helper':
    'Accent color for an event kept from two or more different calendars, in place of ' +
    'the first calendar\u2019s. Left empty it keeps that calendar\u2019s color.',
  split_multiday_events: 'Split Multi-Day Events',
  'split_multiday_events.helper':
    'Show an event on every day it covers rather than only on the day it starts.',
  event_type: 'Event Type',
  'event_type.option.all.label': 'All events',
  'event_type.option.timed.label': 'Only events with a time',
  'event_type.option.all_day.label': 'Only all-day events',
  'event_type.helper':
    'Whether the card shows every event, only those with a time, or only all-day ones. ' +
    'This is about the kind of event, not how long it lasts. Individual calendars can ' +
    'depart from it below.',

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
  'today_indicator_custom.helper':
    'An emoji, an image path or URL, or any text. Words need a larger Indicator Size than the size an emoji reads at.',
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
  accent_color_mode: 'Accent Color',
  'accent_color_mode.helper':
    'Home Assistant can hold a color for each calendar, under Settings, Devices & ' +
    'Services, Entities. Calendars it has no color for keep the card default.',
  'accent_color_mode.option.custom.label': 'Custom color',
  'accent_color_mode.option.home_assistant.label': 'Follow Home Assistant',
  vertical_line_width: 'Accent Bar Width',
  event_background_opacity: 'Event Background Opacity',
  'event_background_opacity.helper':
    'Tints each event with its accent color. Zero leaves it untinted.',
  title_max_lines: 'Title Line Limit',
  'title_max_lines.helper': 'Zero means no limit. A truncated title ends in an ellipsis.',
  allday_badge_position: 'All-Day Badge',
  'allday_badge_position.helper':
    'Marks all-day events with a rounded badge in the calendar accent color. On the time ' +
    'row it replaces the all-day label; on the title it wraps the event name. A title ' +
    'badge is kept to one line and shortened with an ellipsis where it does not fit.',
  'allday_badge_position.option.off.label': 'Off',
  'allday_badge_position.option.time.label': 'Around The All-Day Label',
  'allday_badge_position.option.title.label': 'Around The Event Title',
  allday_badge_style: 'All-Day Badge Style',
  'allday_badge_style.helper':
    'How much weight the badge carries, from a quiet wash to a solid block of color.',
  'allday_badge_style.option.outline.label': 'Outline',
  'allday_badge_style.option.subtle.label': 'Subtle',
  'allday_badge_style.option.tinted.label': 'Tinted',
  'allday_badge_style.option.filled.label': 'Filled',
  allday_badge_color_mode: 'All-Day Badge Color',
  'allday_badge_color_mode.helper':
    'Which color the badge is drawn in. The accent gives every calendar its own; the row ' +
    'text color gives them all the color they already sit in, which is the time color on ' +
    'the time row and the title color on the title.',
  'allday_badge_color_mode.option.accent.label': 'Calendar Accent Color',
  'allday_badge_color_mode.option.text.label': 'Row Text Color',
  'allday_badge_color_mode.option.custom.label': 'Custom Color',
  allday_badge_color: 'Badge Color',
  event_icon_vertical_alignment: 'Icon Alignment',
  'event_icon_vertical_alignment.option.top.label': 'Top',
  'event_icon_vertical_alignment.option.middle.label': 'Middle',
  'event_icon_vertical_alignment.option.bottom.label': 'Bottom',

  time: 'Time',
  show_time: 'Show Time',
  show_end_time: 'Show End Time',
  show_single_allday_time: 'Show Time For All-Day Events',
  'show_single_allday_time.helper':
    'Applies to all-day events that occupy a single day. Multi-day ones have their own ' +
    'setting below, because their time row also carries the end date.',
  show_multiday_allday_time: 'Show Time For Multi-Day All-Day Events',
  'show_multiday_allday_time.helper':
    'Their time row reads "All day, until ..." and so carries the end date, which nothing ' +
    'else on the row shows. Timed events spanning several days are unaffected.',
  time_two_digit_hours: 'Pad Hours To Two Digits',
  time_font_size: 'Time Font Size',
  time_color: 'Time Color',
  time_icon_size: 'Time Icon Size',
  time_max_lines: 'Time Line Limit',

  location: 'Location',
  show_location: 'Show Location',
  show_location_allday: 'Show Location For All-Day Events',
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
  show_description_allday: 'Show Description For All-Day Events',
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
  'grid.day_header_separator': 'Day Header Rule',
  'grid.day_header_separator.helper':
    'The rule under a grid heading. It sits inside the day header gap and above the ' +
    'all-day band, so switching it off does not move events or slice banners.',
  'grid.day_header_separator_width': 'Day Header Rule Width',
  'grid.day_header_separator_color': 'Day Header Rule Color',

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
  'scope.column_list_only': 'Applies to the list and column layouts, not to the time grid.',
  'scope.column_list_only.split_multiday_events':
    'The time grid does not need this. An all-day event spanning several days is drawn ' +
    'as one banner across them, and a timed one is already drawn as a separate block in ' +
    'each day it touches.',
  'scope.list_only': 'Applies to the list layout, which this card also uses on narrow screens.',
  'scope.list_only.today_indicator_position':
    'Applies to the list layout — column layout places the indicator for you.',
  'scope.list_only.compact_events_to_show':
    'Applies to the list layout. Capping events per card would empty columns rather ' +
    'than shorten the card.',
  'scope.list_only.compact_mode':
    'No effect in side-by-side layouts. These only shorten the list layout, which also ' +
    'appears on narrow screens; otherwise, limits would remove whole days instead.',
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
