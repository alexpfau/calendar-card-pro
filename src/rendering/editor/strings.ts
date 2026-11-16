/**
 * English editor strings; keep keys aligned with schemas and translations.
 * `en-GB` is override-only: it carries spelling differences and otherwise falls back to `en`.
 *
 * A `<label key>.aliases` string is never shown. It holds, comma-separated, the words people use
 * for a setting where its label says something else, so the search finds it by them ("12h" for
 * Time Format). Add one only for a word users have used and the search misses; a translation
 * carries its own only where the words differ, and otherwise searches by these.
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
  'filter.no_matches': 'Nothing matches “{query}”.',

  // --- Panels ---------------------------------------------------------------

  // --- Pages ----------------------------------------------------------------
  //
  // Read from the page registry (`pages.ts`), which is what makes them used: `check:i18n`
  // reconciles every `page.`, `heading.` and `gate.needs.` key against the keys the registry and
  // the gate table name. Only the words no string had yet live here. Card & Header, Day Header,
  // Events and Weather keep their panel titles, Grid is the scope's own option label, and every
  // other heading reuses today's heading or group title, so all of those arrive already
  // translated.
  'page.which_events': 'Which Events',
  'page.which_events.aliases': 'time range, content',
  'page.which_events.note':
    'Hide events by words, or split one calendar, on that calendar’s own page.',
  'page.size_spacing': 'Size & Spacing',
  'page.size_spacing.aliases': 'layout, separators',
  'page.taps_refresh': 'Taps & Refresh',
  'page.taps_refresh.aliases': 'actions',
  'page.taps_refresh.note':
    'The preview does not run taps while you edit the card. Try them on the dashboard.',
  'heading.past_events': 'Past Events',
  // Week Numbers until this heading took the first day of the week as well.
  'heading.weeks': 'Weeks',
  'heading.name_and_look': 'Name & Look',
  'heading.who_sees_it': 'Who Sees It',
  'heading.refresh': 'Refresh',

  // --- Overview & navigation ------------------------------------------------
  //
  // The overview's own words, the pages' Back and cross-links, the scope control and the line
  // under each section row. Every key here is looked up by a literal in code, which `check:i18n`
  // holds them to. Counts are a label and a number ("Set: 3"), so no language inflects for one.
  'overview.settings': 'Settings',
  'overview.more': 'More',
  'more.example': 'Start From an Example',
  'more.example_note': 'Quick Setup: an example card and a few questions',
  'more.audit': 'What This Card Changes',
  'audit.intro':
    'Every value this card stores, grouped by where it lives. Anything not listed uses its default.',
  'audit.not_in_use': 'Not in Use: {count}',
  'audit.card': 'Card',
  'audit.card_note': 'Stored for the whole card. Every layout uses these unless it sets its own.',
  'audit.reset_all': 'Reset All in {layout}',
  'audit.reset_all_done': 'Reset every value stored for {layout}.',
  'audit.edit': 'Edit {label}, {value}',
  'audit.go_to': 'Go to {name}',
  'audit.go_setting': 'Go to Setting',
  'audit.in_layout': '{label} in {layout}',
  'audit.on_calendar': '{label} on {name}',
  'audit.same': 'Same as the Default',
  'audit.inactive': 'Not in Use until {when}',
  'audit.kept': 'Kept as Written',
  'audit.kept_note': 'Lines this editor does not own. It keeps them exactly as written.',
  'audit.ha_own': 'Home Assistant’s own, from the Layout tab',
  'notices.ignored': 'Options the Card Ignores: {count}',
  'notices.old': 'Old Options: {count}',
  'notices.old_title': 'Old Options',
  'notices.old_note': 'The next change removes these.',
  'notices.replaced': 'Replaced by {label}.',
  'value.from_yaml': '{value} (From YAML)',
  'quick_setup.dismiss': 'Dismiss Quick Setup',
  'nav.back': 'Back',
  // A page's foot: its page on the documentation site, which says what the helpers leave out.
  'nav.docs': 'Documentation',
  // A link to the heading on another page that answers the neighboring question.
  'nav.crumb': '{page} › {heading}',
  'nav.cross_link.past_days': 'Dates of past days:',
  'nav.cross_link.past_events': 'Whether past events show:',
  'settings_for.label': 'Settings For',
  'settings_for.compact': 'Settings for {layout}',
  'settings_for.change': 'Change',
  'settings_for.change_named': 'Change: settings for {layout}',
  'settings_for.option_set': '{layout}, Set: {count}',
  'settings_for.help_shared':
    'Shared starting values. A layout’s own settings or built-in defaults can take precedence.',
  'settings_for.help_layout':
    'Edits here are written for {layout} and apply when the card shows it.',
  'settings_for.preview': 'Editing {layout} · Preview Shows {displayed}',
  'settings_for.grid_only': 'Applies when the card shows Grid.',
  'announce.scope': 'Now editing settings for {layout}.',
  'summary.pair': '{label}: {value}',
  'summary.set': 'Set: {count}',
  'summary.on': 'On',
  'summary.off': 'Off',
  'announce.removed': 'Removed {name}.',
  'announce.applied': 'Applied {story}.',
  'announce.moved': 'Moved {name} to position {position} of {total}.',
  'announce.pasted': 'Pasted settings into {name}.',
  'announce.added': 'Added {label}.',
  'announce.showing_all': 'Showing every setting under {heading}.',
  'announce.removed_setting': 'Removed {label} and reset it.',

  // --- Show What Applies ----------------------------------------------------
  //
  // A page draws what applies here and is essential, stored, inherited with a different value or
  // added; the rest of a heading waits in its Add row, named. Counts are a label and a number, and
  // a list that does not fit ends "{names}, +{count}", which inflects nothing.
  'add.setting': 'Add Setting',
  'add.setting_under': '{heading} · Add Setting',
  'add.name': 'Add Setting under {heading}, Settings: {count}',
  'add.names_more': '{names}, +{count}',
  'add.count': 'Settings: {count}',
  'add.group': 'Settings to Add under {heading}',
  'add.show_all': 'Show All',
  'add.filter': 'Filter Settings',
  // What a field says about where its value comes from, after its label or before its helper.
  'state.set': 'Set',
  'state.set_all_layouts': 'Set for All Layouts',
  'state.whole_card': 'Whole Card',
  'state.whole_card_set': 'Whole Card · Set',
  'state.set_layout': 'Set for {layout}',
  'state.set_layout_same': 'Set for {layout}, Same as the Default',
  'state.layout_default': '{layout}’s Default',
  'state.ignored': 'The All Layouts value, {value}, does not apply in {layout}.',
  'state.from_all_layouts': 'From All Layouts',
  'state.set_entry': 'Set on This Calendar',
  'state.set_entry_shared': 'Set on This Calendar · Shared by Its Entries',
  'state.follows_card': 'Follows the Card: {value}',
  'state.layout_own': '{layout} Sets Its Own: {value}',
  'state.set_on_calendars': 'Set on Calendars:',
  'state.edit_layout': 'Edit {layout}',
  'state.edit_named': 'Edit {layout}: {label}',
  // The button under a stored field, named for what it leaves: "Reset to Off", "Clear" where
  // nothing comes back, "Remove" where the control goes; the rest name it for screen readers.
  'reset.to': 'Reset to {value}',
  'reset.clear': 'Clear',
  'reset.named': '{action}: {label}',
  'reset.reset': 'Reset',
  'reset.reset_for': 'Reset {label} for {layout}',
  'reset.remove': 'Remove',
  'reset.remove_named': 'Remove {label} and Reset It',
  'reset.remove_for': 'Remove {label} for {layout} and Reset It',
  // A value the YAML holds for a setting a gate withholds; the gate line above it says why.
  'inactive.line': 'Stored but not in use: {label} ({value})',
  'inactive.line_top': 'Stored but not in use: {label} ({value}), from All Layouts',
  // The page's foot: what the layouts this scope is not add to it.
  'other_layouts.one': '{layout} adds here: {names}.',
  'other_layouts.many': '{layouts} add here: {names}.',
  // The two preferences under More, remembered in this browser (`prefs.ts`).
  'prefs.every': 'Show Every Setting',
  'prefs.every_note':
    'Pages open with every setting that applies as a control, instead of naming the rest in Add ' +
    'Setting rows. Remembered in this browser.',
  'prefs.yaml': 'Show YAML Option Names',
  'prefs.yaml_note':
    'Shows each setting’s option name beside its label. Remembered in this browser.',

  // --- Undo & Redo ----------------------------------------------------------
  //
  // Each step is named for what it did, so the buttons read "Undo: Remove Ben" and a screen
  // reader hears "Undid: Remove Ben.". Undo and Redo on their own are Home Assistant's words
  // (`ui.common.undo`, `ui.common.redo`) wherever it has them; these are the fallback.
  'history.undo': 'Undo',
  'history.redo': 'Redo',
  'history.undo_named': 'Undo: {action}',
  'history.redo_named': 'Redo: {action}',
  'history.undone': 'Undid: {action}.',
  'history.redone': 'Redid: {action}.',
  'history.change': 'Change {setting}',
  'history.change_for': 'Change {setting} for {name}',
  'history.reset': 'Reset {setting}',
  'history.remove': 'Remove {name}',
  'history.duplicate': 'Duplicate {name}',
  'history.paste': 'Paste Settings Into {name}',
  'history.move': 'Move {name}',
  'history.apply': 'Apply {story}',
  'history.add': 'Add {name}',
  // Pick From Preview, beside Undo and Redo while Home Assistant's dialog shows the card: its
  // button, the line that says a pick is on (Click where there is a pointer to hover, Tap on a
  // touch screen, whose preview sits below the editor), and the label on the outlined part, whose
  // {label} is where it opens ("Events › Location").
  'pick.button': 'Pick From Preview',
  'pick.banner': 'Click a part of the preview to open its settings.',
  'pick.banner_touch': 'Tap a part of the preview below to open its settings.',
  'pick.click': '{label} · Click to Edit',
  'pick.tap': '{label} · Tap to Edit',
  // The line a removal or an applied story leaves, beside its Undo, until the next change.
  'status.removed': 'Removed {name}',
  'status.removed_calendar': 'Removed {name} · Entries: {count}',
  'status.applied': 'Applied {story}',
  // The jump list: its count line, the scope it shows values for, and what a row and a jump say.
  'search.results': 'Results for “{query}”: {count}',
  'search.values_for': 'Values for {layout}',
  'search.overview': 'Overview',
  'search.not_set': 'Not Set',
  'search.yaml': 'YAML: {path}',
  'search.return': 'Return to Results',
  'search.showing': 'Showing {label}.',
  // The tag on a setting a gate withholds, around a gate phrase below or the label of the control
  // it waits on (`plan.ts` › `needsTag`): "Needs Show Description".
  'search.needs': 'Needs {needs}',
  'search.not_in_use': 'Not in Use · Needs {needs}',
  'search.needs_said': '{label} needs {needs}.',
  'search.only_in': 'Only in {layouts}',
  'search.help_phrase': 'Help: “{phrase}”',
  'search.add': 'Add',
  'search.add_named': 'Add {label}, {place}',
  'search.edit_here': 'Edit Here',
  'search.show_list': 'Show as a List',
  'search.hint': 'Try fewer words, or an option name from YAML such as show_location.',
  'search.clear': 'Clear Search',
  'search.calendars_set': 'Set on Calendars: {count}',
  'search.calendars_none': 'Not Set on Any Calendar',
  'search.ha_tab.layout': 'Card Width',
  'search.ha_tab.layout.aliases': 'full width',
  'search.ha_tab.layout_note': 'In Home Assistant’s Layout Tab, Above This Editor',
  'search.ha_tab.visibility': 'Who Sees the Card',
  'search.ha_tab.visibility_note': 'In Home Assistant’s Visibility Tab, Above This Editor',

  // --- Colors ---------------------------------------------------------------
  //
  // The composed color control (`colors.ts`, `views/color.ts`). The rows Follow the card, Follow
  // Home Assistant, Calendar Accent Color and Row Text Color reuse their dropdown options' words.
  // A placeholder is never `{color}`: the en-GB derivation would spell it `{colour}`.
  'color.default': 'Default',
  'color.calendar_color': 'Calendar Color',
  'color.follow_card.description': "The card's Accent Color, {value}",
  'color.follow_ha.card': "Each calendar's color in Home Assistant, where it holds one",
  'color.follow_ha.none': 'None set for {name} there, so it falls back to the card',
  'color.follow_ha.found': "Home Assistant's color for {name}: {value}",
  'color.swatches': 'Home Assistant colors',
  'color.custom': 'Custom…',
  'color.custom.description':
    'Any color the card can draw: #e91e63, a CSS name, or a theme variable',
  'color.custom_field': 'Custom {setting}',
  'color.invalid': 'Not a color the card can draw',
  'color.kept': 'Kept until the text above is a color',
  'color.yaml_none': 'Not in the YAML',
  'color.not_set': 'Not Set',
  'color.named': '{setting}, {value}',
  'color.named_state': '{setting}, {value}, {state}',
  'color.remove': "Remove {name}'s {setting}",
  'color.mix': '{value}, {percent}%',
  // Theme colors the card's defaults are written in, as a value reads.
  'color.theme.primary': "Home Assistant's primary color",
  'color.theme.primary_text': 'Primary Text',
  'color.theme.secondary_text': 'Secondary Text',
  'color.theme.divider': 'Divider',
  'color.theme.card_background': 'Card Background',
  // The swatches' names, English only: Home Assistant's own (`ui.components.color-picker.colors.*`)
  // are read first, in its language, so these show only where it has none.
  'color.name.red': 'Red',
  'color.name.pink': 'Pink',
  'color.name.purple': 'Purple',
  'color.name.deep_purple': 'Deep purple',
  'color.name.indigo': 'Indigo',
  'color.name.blue': 'Blue',
  'color.name.light_blue': 'Light blue',
  'color.name.cyan': 'Cyan',
  'color.name.teal': 'Teal',
  'color.name.green': 'Green',
  'color.name.light_green': 'Light green',
  'color.name.lime': 'Lime',
  'color.name.yellow': 'Yellow',
  'color.name.amber': 'Amber',
  'color.name.orange': 'Orange',
  'color.name.deep_orange': 'Deep orange',
  'color.name.brown': 'Brown',
  'color.name.grey': 'Gray',
  'color.name.blue_grey': 'Blue gray',

  // --- Gates ----------------------------------------------------------------
  //
  // What a withheld setting waits for. A gate line reads "Appears once {when}: {names}.", where
  // `{when}` is a clause written for that one position, after "Appears once": a language whose
  // subordinate clauses end on the verb writes it in that order. A switch reads "{label} is on";
  // every other condition has a clause of its own, or its gate's (`gates.ts` › `whenText`).
  'gate.line': 'Appears once {when}: {names}.',
  'gate.line_bare': 'Appears once {when}.',
  'gate.when.on': '{label} is on',
  'gate.when.pressed': '{part} is pressed',
  'gate.when.indicator_shown': 'a Style other than None is chosen',
  'gate.when.indicator_marker': 'the Style is a dot, an icon or an emoji',
  'gate.when.empty_days_off': 'Show Empty Days is off',
  'gate.when.empty_or_today': 'Show Empty Days or Show Today When Empty is on',
  'gate.when.forecast_by_day': 'the forecast shows in the day header',
  'gate.when.forecast_by_event': 'the forecast shows beside events',
  'gate.when.event_details': 'tapping or holding an event shows its details',
  'gate.when.no_event_actions': 'both event actions are set to Nothing',
  'gate.when.events_limit': 'Compact Mode limits the events',
  'gate.when.calendar_filter': 'the toolbar shows a calendar filter',
  'gate.when.week_numbers': 'week numbers are shown',
  'gate.when.duplicates': 'duplicates are filtered',
  'gate.when.weather_entity': 'a Weather Entity is chosen',
  'gate.when.label_icon': 'the label is an icon',
  'gate.when.location_shown': 'this calendar shows locations',
  // The same, as noun phrases for search's Needs tag, where the control's own label does not say
  // it. Read from the gate table by a condition, or by a gate for any of its conditions without a
  // phrase of its own: "Needs the forecast beside each event".
  'gate.needs.indicator_shown': 'a Style other than None',
  'gate.needs.indicator_marker': 'a dot, icon or emoji Style',
  'gate.needs.empty_days_off': 'Show Empty Days off',
  'gate.needs.empty_or_today': 'Show Empty Days or Show Today When Empty',
  'gate.needs.forecast_by_day': 'the forecast in the day header',
  'gate.needs.forecast_by_event': 'the forecast beside each event',
  'gate.needs.event_details': 'Show Event Details as a tap or hold action',
  'gate.needs.no_event_actions': 'both event actions set to Nothing',
  'gate.needs.events_limit': 'an Events limit under Compact Mode',
  'gate.needs.calendar_filter': 'a calendar filter in the toolbar',

  // --- View -----------------------------------------------------------------
  view: 'Card Displays',
  'view.option.list.label': 'List',
  'view.option.list.description': 'Days stacked, one per row',
  'view.option.column.label': 'Columns',
  'view.option.column.description': 'Days side by side',
  'view.option.grid.label': 'Grid',
  'view.option.grid.description': 'Days side by side on an hour axis',
  'view.helper':
    'The card’s starting layout. Side-by-side layouts can fall back to List when space is tight.',
  editing_workspace: 'Editing Settings For',
  'editing_workspace.helper': 'Choose which layout to edit without changing Card Displays.',
  'editing_workspace.shared_note':
    'These are the shared starting values. A layout’s own settings or built-in defaults can take precedence.',
  'value_source.card': 'Applies to the whole card.',
  'value_source.reset': 'Reset {option}',
  'editing_workspace.option.shared.label': 'All Layouts',
  'editing_workspace.option.list.label': 'List',
  'editing_workspace.option.column.label': 'Columns',
  'editing_workspace.option.grid.label': 'Grid',
  'grid_reconciliation.title': 'Existing Values Kept for Grid',
  'grid_reconciliation.message':
    'Grid kept your existing values for: {options}. Use Reset in Grid to use its default for an option.',
  'grid_reconciliation.dismiss': 'Dismiss',
  'grid_reconciliation.see': 'See What Grid Keeps',

  // --- Misplaced options (backlog item 192) -----------------------------------
  //
  // Read by YAML authors: the option is shown as its YAML path, so these sentences say what
  // the card does with it and where it works, never what the path already says.
  'misplaced.title': 'Options the Card Ignores',
  'misplaced.message':
    'These options are written where the card does not read them. Move each one to where it ' +
    'works, or change it in YAML.',
  'misplaced.fetch_time':
    'Decides which events are loaded, so it works only for the whole card, at the top level.',
  'misplaced.card_wide': 'Works only for the whole card, at the top level.',
  'misplaced.wrong_view': 'Belongs to another layout: {places}.',
  'misplaced.view_only': 'Works only in a layout’s own settings: {places}.',
  'misplaced.calendar': 'Works only on a calendar: set it on the one it is for, under entities.',
  'misplaced.unknown': 'Not an option of this card. Check its spelling and where it is.',
  'misplaced.move': 'Move to {place}',
  'misplaced.taken': '{place} already sets it.',
  'misplaced.top_level': 'Top Level',

  // --- Quick Setup (backlog item 188) ----------------------------------------
  //
  // A card started from one of the docs' Example Stories. The story names and their two lines
  // are the docs' own, from the Example Stories table, so the editor and the site describe each
  // the same way. The field labels repeat the panels' own where the field is the same setting.
  'quick_setup.open': 'Quick Setup',
  'quick_setup.open_note': 'Start from an example card and answer a few questions.',
  'quick_setup.title': 'Quick Setup',
  'quick_setup.step': 'Step {step} of {steps}: {name}',
  'quick_setup.step.story': 'Starting Point',
  'quick_setup.step.calendars': 'Title & Calendars',
  'quick_setup.step.weather': 'Weather',
  'quick_setup.step.taps': 'Taps & Toolbar',
  'quick_setup.step.review': 'Review',
  'quick_setup.story_intro':
    'Pick the example closest to what this card is for. You can change everything afterward.',
  'quick_setup.story.family_hub': 'Family Hub',
  'quick_setup.story.family_hub.best_for':
    'The whole family’s week, with every control on the card',
  'quick_setup.story.family_hub.space': 'A wall tablet, and the same card on a phone',
  'quick_setup.story.now_and_next': 'Now & Next',
  'quick_setup.story.now_and_next.best_for': 'What is on now and what comes next',
  'quick_setup.story.now_and_next.space': 'A small tile on a phone',
  'quick_setup.story.today_and_tomorrow': 'Today & Tomorrow',
  'quick_setup.story.today_and_tomorrow.best_for': 'Where the day stands, hour by hour',
  'quick_setup.story.today_and_tomorrow.space': 'A phone, a section or a portrait tablet',
  'quick_setup.story.birthdays_and_holidays': 'Birthdays & Holidays',
  'quick_setup.story.birthdays_and_holidays.best_for':
    'Birthdays with ages, and the next school break',
  'quick_setup.story.birthdays_and_holidays.space': 'A dashboard section or a pop-up',
  'quick_setup.story.house_log': 'House Log',
  'quick_setup.story.house_log.best_for': 'When each job was last done, newest first',
  'quick_setup.story.house_log.space': 'A dashboard section, and the same card on a phone',
  'quick_setup.read_story': 'Read about this example',
  'quick_setup.card_title': 'Title',
  'quick_setup.card_title.helper': 'Leave it empty for a card without a title.',
  'quick_setup.card_calendars': 'Calendars',
  'quick_setup.calendars_needed': 'Choose at least one calendar to go on.',
  'quick_setup.weather_entity': 'Weather Entity',
  'quick_setup.weather_entity.helper': 'Leave it empty for a card without weather.',
  'quick_setup.show_toolbar': 'Show Toolbar',
  'quick_setup.show_toolbar.helper':
    'Pages through dates, switches layouts, searches and adds events.',
  'quick_setup.event_details': 'Tapping an Event Opens It',
  'quick_setup.event_details.helper': 'Shows the event in the card’s own window.',
  'quick_setup.day_adds': 'Tapping a Day Adds an Event',
  'quick_setup.day_adds.helper': 'Only on calendars that accept new events.',
  'quick_setup.review_story':
    'This card takes the layout, look and actions of {story}. Every setting not listed here is ' +
    'replaced.',
  'quick_setup.review_calendars': 'Calendars: {calendars}. Each keeps its own settings.',
  'quick_setup.review_colors': 'Colors from the example for: {calendars}.',
  'quick_setup.review_keeps':
    'Settings Home Assistant keeps for this card, such as its size on the dashboard, stay as ' +
    'they are.',
  'quick_setup.back': 'Back',
  'quick_setup.next': 'Next',
  'quick_setup.cancel': 'Cancel',
  'quick_setup.apply': 'Apply',
  'config_migration.title': 'Choose How to Upgrade This Card',
  'config_migration.list_message':
    'Version 5 separates settings for List from settings shared by every layout. Either choice keeps the card looking the same right now.',
  'config_migration.grid_message':
    'Version 5 separates settings for List from settings shared by every layout. Either choice keeps Grid looking the same right now and decides what List uses later.',
  'config_migration.affected': 'Choose what these settings mean: {options}.',
  'config_migration.keep_list': 'Keep my existing List appearance',
  'config_migration.keep_list_note':
    'Recommended. Keep these values specific to List; other layouts keep their own settings and defaults.',
  'config_migration.use_shared': 'Use these settings for all layouts',
  'config_migration.use_shared_note':
    'Keep these values shared. A layout’s own settings and built-in defaults can still take precedence.',
  'config_migration.future_title': 'This Card Uses a Newer Configuration',
  'config_migration.future_message':
    'This editor supports configuration version 5, but the card uses version {version}. Update Calendar Card Pro before editing it.',
  'config_migration.invalid_title': 'Configuration Version Is Invalid',
  'config_migration.invalid_message':
    'The card has an invalid configuration version ({value}). Correct it in YAML before using the visual editor.',

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
  event_gap: 'Event Gap',
  'event_gap.helper': 'Zero joins a day’s events into one block.',
  event_spacing: 'Event Spacing',
  'event_spacing.helper': 'Space above and below the text inside each event.',
  additional_card_spacing: 'Additional Card Spacing',

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
  'card_height.helper':
    'List and Columns scroll when the events do not fit; Grid compresses its hours.',
  card_max_height: 'Maximum Height',
  'card_max_height.helper': 'Grows with its content up to this height, then scrolls.',

  // --- Column density -------------------------------------------------------
  'column.density': 'Column Density',
  'column.density.helper':
    'How narrow a column may get before the card gives up a column, and what it does ' +
    'when it runs out.',
  'column.min_day_width': 'Minimum Day Width',
  'column.min_days_to_show': 'Fewest Day Columns',
  'column.min_days_to_show.helper':
    'Defaults to the number of days shown, so the card never drops a column.',
  'column.min_days_fallback': 'When Too Narrow',
  'column.min_days_fallback.option.list.label': 'Fall back to a list',
  'column.min_days_fallback.option.cramp.label': 'Keep the columns, narrower',
  'column.day_header_gap': 'Day Header Gap',
  'time_grid.day_header_gap': 'Day Header Gap',

  // --- Calendars ------------------------------------------------------------
  //
  // The panel helper earns its line by naming the half of this panel the title does
  // not: it is not only *which* calendars, it is where each one's label, colors and
  // filters live. "The calendars this card shows" was *Calendars* with more words in it.
  'panel.calendars': 'Calendars',
  // --- Calendar list --------------------------------------------------------
  //
  // The overview's list of calendars (`views/calendars.ts`): a row per entry, a calendar row
  // above the entries of a calendar listed more than once, the action strip under a row, and
  // Add Calendar. Every key is looked up by a literal in code. A row's control is named with its
  // summary, so "Edit {row}" receives "Anna, Without: Homework, Set: 4", already joined.
  'calendars.entries': 'Entries: {count}',
  'calendars.missing': 'Not found in Home Assistant',
  'calendars.edit': 'Edit {row}',
  'calendars.position': 'entry {position} of {total}',
  'calendars.actions': 'Actions for {name}',
  'calendars.add': 'Add Calendar',
  'calendars.pick': 'Calendar',
  'calendars.pick.helper':
    'Choose a calendar, then press Add: it joins the card and its page opens.',
  'calendars.add_confirm': 'Add',
  'calendars.cancel': 'Cancel',
  'calendars.chose': 'Chose {name}. Add puts it on the card and opens its page.',
  'calendars.already': '{name} is already on the card.',
  'calendars.open': 'Open {name}',
  'calendars.empty': 'No Calendars Yet',
  'calendars.empty_note': 'Add the calendars this card shows.',
  'calendars.filter': 'Filter Calendars',
  'calendars.no_match': 'No calendars match.',
  // The strip of actions under a row. Moves act on a whole calendar; the names say whose, after
  // the words the button shows, so a name a person speaks to reach it holds them (WCAG 2.5.3).
  'strip.move_up': 'Move Up: {name}',
  'strip.move_down': 'Move Down: {name}',
  'strip.move_top': 'Move to Top: {name}',
  'strip.move_top_label': 'Move to Top',
  'strip.duplicate': 'Duplicate {name}',
  'strip.copy': 'Copy settings from {name}',
  'strip.paste': 'Paste settings into {name}',
  'strip.paste_empty': 'Copy settings first',
  'strip.paste_from': 'From {name}',
  'strip.remove': 'Remove {name}',
  'strip.remove_calendar': 'Remove {name}, Entries: {count}',
  'strip.remove_entry': 'Remove This Entry',
  'strip.remove_entry_named': 'Remove This Entry: {name}',
  // The keys beside a move in an entry page's menu.
  'strip.key_up': 'Alt ↑',
  'strip.key_down': 'Alt ↓',
  // Reordering (section 5.11): a calendar's drag handle, and the keyboard grab's line under the
  // list, which the announcement queue also speaks. In `reorder.keys` each `{…}` is drawn as a key
  // cap: `{up}` and `{down}` as arrows, `{space}` and `{esc}` as `reorder.space` and `reorder.esc`.
  'reorder.handle': 'Move {name}',
  'reorder.tooltip': 'Drag to move {name}, or press Space',
  'reorder.status': '{name}, position {position} of {total}.',
  'reorder.keys': '{up} {down} move it, {space} drops it, {esc} puts it back.',
  'reorder.space': 'Space',
  'reorder.esc': 'Esc',
  'reorder.put_back': 'Put {name} back at position {position} of {total}.',
  // The event-part chips at the top of Events (section 5.9, D08). Time, Location and Description
  // are their headings' words. The stored parts are grouped under the chips by their state words
  // (`state.*`): "Set for List · Countdown: On · End Time: Off".
  'chip.end_time': 'End Time',
  'chip.countdown': 'Countdown',
  'chip.progress_bar': 'Progress Bar',
  'chip.duration': 'Duration',
  'chip.now': 'Now',
  'chip.hint':
    "Each event shows the parts that are pressed. A pressed part's settings follow below.",
  'chip.needs': 'Needs {part}',
  'chip.not_in': 'Not in {layout}: {names}.',
  // A calendar entry's page.
  'entry.back': 'Back to the overview',
  'entry.previous': 'Previous Calendar',
  'entry.next': 'Next Calendar',
  'entry.previous_named': 'Previous calendar: {name}',
  'entry.next_named': 'Next calendar: {name}',
  'entry.showing': 'Showing {name}.',
  'entry.calendar': 'Calendar',
  'entry.calendar.helper': 'Picking another keeps this entry’s settings.',
  'entry.duplicate_warning':
    'Both entries show the same events until one sets Event Type or a word list, so each ' +
    'event shows twice for now.',
  'entry.duplicated': 'Duplicated {name}.',
  'entry.repointed': '{name} now reads {calendar}.',
  'entry.repointed_adopted':
    '{name} now reads {calendar}, so it uses that calendar’s name and calendar filter setting.',
  'entry.remove': 'Remove {name}',

  // --- Split This Calendar --------------------------------------------------
  //
  // The task on an entry's page that turns it into two (section 5.7, D12). Every refusal is a
  // whole sentence naming the entry, and the event type's four are four sentences rather than one
  // with a clause added, so a translator writes each in its own word order. Counts are a label
  // and a number ("Days Ahead: 7 · Events: 1"), never an assembled plural.
  'split.title': 'Split This Calendar',
  'split.row_helper':
    'Turn this entry into two, such as all-day events and events with a time, each with its own color.',
  'split.named': 'Split {name}',
  'split.step.how': 'How',
  'split.step.colors': 'Colors',
  'split.step.review': 'Review',
  'split.step_of': 'Step {step} of {total}',
  'split.how.intro':
    'Two entries take this one’s place, each with its own color. Both keep {name}’s other ' +
    'settings and read {entity}; nothing changes in Home Assistant.',
  'split.how.type': 'All-Day vs. With a Time',
  'split.how.type.description': 'One entry for all-day events, one for events with a time.',
  'split.how.words': 'By Words',
  'split.how.words.description':
    'Events whose title, location or description contains certain words get one entry; every ' +
    'other event gets the other.',
  'split.match_against_note': 'Where to look for the words: Event title, Location or Description.',
  'split.word': 'Word',
  'split.words_note':
    'Events whose {field} contains any of these words or phrases go to the first part; every ' +
    'other event goes to the second. One word or phrase per field.',
  'split.field.title': 'event title',
  'split.field.location': 'location',
  'split.field.description': 'description',
  'split.locked': 'Locked to {field}, where this entry’s Blocklist looks.',
  'split.refused.all_day':
    'Can’t split {name} into all-day and timed events: it already shows only all-day events. ' +
    'Duplicate it to add an entry for events with a time.',
  'split.refused.all_day_card':
    'Can’t split {name} into all-day and timed events: it already shows only all-day events, ' +
    'following the card’s Event Type. Duplicate it to add an entry for events with a time.',
  'split.refused.timed':
    'Can’t split {name} into all-day and timed events: it already shows only events with a ' +
    'time. Duplicate it to add an entry for all-day events.',
  'split.refused.timed_card':
    'Can’t split {name} into all-day and timed events: it already shows only events with a ' +
    'time, following the card’s Event Type. Duplicate it to add an entry for all-day events.',
  'split.refused.words':
    'Can’t split {name} by words: it already shows only events containing “{words}”. One entry ' +
    'keeps one set of words, so the two parts could not show exactly what {name} shows now. ' +
    'Split All-Day vs. With a Time instead, or change the Allowlist first.',
  'split.refused.blocklist':
    'Can’t split {name} by words: its Blocklist cannot be read, so the card ignores it, and the ' +
    'two parts would show some events twice. Fix the Blocklist first, or split All-Day vs. With ' +
    'a Time.',
  'split.refused.allowlist':
    'Can’t split {name} by words: its Allowlist cannot be read, so the card ignores it, and the ' +
    'two parts would show some events twice. Fix the Allowlist first, or split All-Day vs. With ' +
    'a Time.',
  'split.refused.budget':
    'Can’t split {name}: it has its own Compact Events to Show, which two entries would double. ' +
    'Clear it first.',
  'split.edit_allowlist': 'Edit Allowlist',
  'split.edit_blocklist': 'Edit Blocklist',
  'split.go_budget': 'Go to Compact Events to Show',
  'split.colors.title': 'Colors and Labels',
  'split.colors.intro':
    'Both parts keep the name {name}, which every entry of a calendar shares. The calendar list ' +
    'and the card tell them apart by what they show and by these.',
  'split.part_of': 'Part {part} of {total}',
  'split.color_now': '{name}’s color now.',
  'split.color_free': 'Not used by another calendar on this card.',
  'split.review.intro':
    'Where {name}’s upcoming events land. Splitting writes both entries in one step, and Undo ' +
    'takes it back.',
  'split.review.counts': 'Days Ahead: {days} · Events: {count}',
  'split.review.day': '{weekday} {day}',
  'split.review.event': '{day} · {title}',
  'split.review.event_time': '{day} · {time} · {title}',
  'split.review.more': '+{count}',
  'split.review.none': 'No events in the days this card shows.',
  'split.review.loading': 'Reading {name}’s upcoming events…',
  'split.review.failed':
    '{name}’s upcoming events could not be read. The preview shows where they land.',
  'split.review.conditions': 'Both parts keep {name}’s visibility conditions.',
  'split.review.note':
    'Every event {name} shows now lands in exactly one part: none shows twice, none goes missing.',
  'split.rule.all_day': 'Only all-day events',
  'split.rule.timed': 'Only events with a time',
  'split.rule.words.title': 'Event title contains {words}',
  'split.rule.words.location': 'Location contains {words}',
  'split.rule.words.description': 'Description contains {words}',
  'split.rule.other': 'Every other event',
  'split.writes.allowlist': 'Writes Allowlist: {words}, matching the {field}',
  'split.writes.blocklist': 'Writes Blocklist: {words}, matching the {field}',
  'split.apply': 'Split',
  'split.done': 'Split {name} into 2 entries. This page now edits the first.',
  'split.done_button': 'Done',
  'split.new': 'New',
  // Under a Blocklist, an Allowlist or Countries To Remove the card cannot compile.
  'word_list.invalid': 'This pattern cannot be read, so the card ignores it.',
  'word_list.use_pattern': 'Use a Pattern',
  'word_list.use_words': 'Use Words',
  'tap.line': 'Tapping an Event: {action}',
  'tap.change_named': 'Change: Tapping an Event, {action}',

  // --- Calendar list rows ---------------------------------------------------
  //
  // What tells one entry from its calendar's others on the list (`calendar-list.ts` ›
  // `rowParts`), at most two of them, in sentence case as option labels are. "All events",
  // for an entry that sets none of them, is the Event Type option's own string.
  'row.all_day': 'All-day events',
  'row.timed': 'Events with a time',
  'row.only': 'Only: {words}',
  'row.without': 'Without: {words}',
  'row.weekdays': 'Weekdays',
  'row.weekends': 'Weekend days',
  'row.expires': 'Expires at {time}',
  'row.conditions': 'Shown under conditions',
  // An entry's name inside a calendar with several, as its controls are named: "Remove Family,
  // All-day events". A template, so a language can order the two its own way.
  'row.name': '{name}, {part}',

  // --- Per-calendar settings ------------------------------------------------
  //
  // Each calendar entry gets a page of its own, opened from its row. Four of these are
  // three-way rather than switches, because the card reads them presence-first — an
  // absent key means "follow the card", which no checkbox can say.
  // Not "Copy 2 of 2": neither block is the copy once both exist, and which one was
  // duplicated stops being interesting the moment their settings diverge. What the user
  // needs is only which of the two panels they are looking at.
  'entity.occurrence': 'Entry {position} of {total}',
  'entity.copy': 'Copy Settings',
  'entity.paste': 'Paste Settings',
  'entity.duplicate': 'Duplicate',
  'entity.remove': 'Remove',

  'entity.name': 'Name',
  'entity.name.helper':
    'Every entry for this calendar shares it. Left empty, the card uses Home Assistant’s name.',
  'entity.show_in_legend': 'Show in Calendar Filter',
  'entity.show_in_legend.helper':
    'Off leaves this calendar out of the calendar filter, so its events always show. Every entry for it shares this.',
  'entity.label_type': 'Label Type',
  'entity.label_type.helper':
    'An image label is a path the browser can reach, such as /local/work.png.',
  'entity.label_type.option.none.label': 'None',
  'entity.label_type.option.text.label': 'Text or Emoji',
  'entity.label_type.option.icon.label': 'An Icon',
  'entity.label_type.option.image.label': 'An Image',
  'entity.label_icon_source': 'Icon Source',
  'entity.label_icon_source.helper':
    'Follows the icon under Settings, Devices & Services, Entities. Calendars without one show no label.',
  'entity.label_icon_source.option.home_assistant.label': 'Follow Home Assistant',
  'entity.label_icon_source.option.custom.label': 'Custom icon',
  'entity.label_image_source': 'Image Source',
  'entity.label_image_source.helper':
    'The person’s picture under Settings, People. People without one show no label.',
  'entity.label_image_source.option.custom.label': 'Custom image',
  'entity.label_image_source.option.person.label': "A person's picture",
  'entity.label': 'Label',
  'entity.color': 'Event Color',
  'entity.color.helper': 'Event titles from this calendar. Overrides the card color.',
  'entity.accent_color': 'Custom Accent Color',
  'entity.accent_color.helper':
    'The line beside each event, and its background where the opacity is above zero.',
  'entity.accent_color_mode': 'Accent Color',
  'entity.accent_color_mode.helper':
    'Home Assistant’s color under Settings, Devices & Services, Entities. Calendars without one fall back to the card.',
  'entity.accent_color_mode.option.inherit.label': 'Follow the card',
  'entity.accent_color_mode.option.home_assistant.label': 'Follow Home Assistant',
  'entity.accent_color_mode.option.custom.label': 'Custom color',
  'entity.label_icon_color': 'Label Icon Color',
  'entity.label_icon_color.helper': 'Left empty, the icon takes the text color around it.',
  // "Scale" and not "Size": a size reads as a pixel value, and this is a multiplier. The
  // translations keep that distinction, using each language's word for a display scale.
  'entity.text_scale': 'Text Scale',
  'entity.text_scale.aliases': 'text size, font size, bigger text, smaller text',
  'entity.text_scale.helper':
    'Below 1 draws this calendar’s events smaller, above 1 larger. Left empty, they match the card.',

  'entity.show_time': 'Event Times',
  'entity.show_time.option.inherit.label': 'Follow the card',
  'entity.show_time.option.show.label': 'Always show',
  'entity.show_time.option.hide.label': 'Never show',
  'entity.show_location': 'Event Locations',
  'entity.show_location.option.inherit.label': 'Follow the card',
  'entity.show_location.option.show.label': 'Always show',
  'entity.show_location.option.hide.label': 'Never show',
  // The card's other two choices leave the popover showing the field, so only Never show is
  // named: a calendar set to it is kept private, rows and popover alike.
  'entity.show_location.helper':
    'Never show also leaves them out when you open one of this calendar\u2019s events.',
  'entity.location_icon': 'Location Icon',
  'entity.location_icon.helper':
    'In place of the map marker. Left empty, Microsoft Teams meetings get the Teams icon.',
  'entity.show_description': 'Event Descriptions',
  'entity.show_description.option.inherit.label': 'Follow the card',
  'entity.show_description.option.show.label': 'Always show',
  'entity.show_description.option.hide.label': 'Never show',
  'entity.show_description.helper':
    'Never show also leaves them out when you open one of this calendar\u2019s events.',
  // Only two choices: the card's weather position decides whether events get weather at all,
  // so this can only take it away. The day header's forecast belongs to every calendar.
  'entity.show_weather': 'Event Weather',
  'entity.show_weather.option.inherit.label': 'Follow the card',
  'entity.show_weather.option.hide.label': 'Never show',
  'entity.show_weather.helper': 'The forecast in the day header stays.',

  'entity.split_multiday_events': 'Split Across Days',
  'entity.split_multiday_events.option.inherit.label': 'Follow the card',
  'entity.split_multiday_events.option.split.label': 'Split across each day',
  'entity.split_multiday_events.option.whole.label': 'Keep as one event',
  'entity.multiday_banners': 'In the Time Grid',
  'entity.multiday_banners.option.inherit.label': 'Follow the card',
  'entity.multiday_banners.option.banner.label': 'One banner above the hours',
  'entity.multiday_banners.option.blocks.label': 'A block on each day',
  'entity.multiday_banners.helper':
    'How this calendar\u2019s events with a time that last a full day or longer are drawn.',

  // --- Sub-headings ---------------------------------------------------------
  //
  // Named by the page registry (`pages.ts`), which draws them as the pages' own headings, a
  // calendar entry's page among them. The same key serves the card's pages and an entry's
  // wherever they name the same category, so the two read with one vocabulary rather than two.
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
  heading_gap_and_rule: 'Gap & Rule',
  heading_hour_labels: 'Hour Labels',
  heading_on_the_grid: 'On the Grid',
  heading_card_size: 'Card Size & Spacing',
  heading_accent: 'Accent',
  heading_title: 'Title',
  heading_icon_and_badge: 'Icon & Badge',
  heading_icons: 'Icons',
  heading_between_days: 'Between Days',
  heading_across_the_grid: 'Across the Grid',
  heading_replace: 'Text Replacement',
  heading_multiday: 'Multi-Day Events',
  heading_nothing: 'Empty Days',
  heading_details: 'Event Details',
  heading_event_state: 'Event State',
  heading_toolbar: 'Toolbar',

  // Home Assistant's own word for a card's conditions, under its own Visibility heading. The
  // helper serves both editors: above Home Assistant's own Visibility editor, which carries no
  // label, and under the YAML box where that editor is missing.
  'entity.visibility': 'Conditions',
  'entity.visibility.aliases': 'who sees it, specific users, per user, person',
  'entity.visibility.helper':
    'Shows this calendar’s events only while all of these conditions hold. Not applied while you edit the card.',

  'entity.event_type': 'Event Type',
  'entity.event_type.option.inherit.label': 'Follow the card',
  'entity.event_type.option.all.label': 'All events',
  'entity.event_type.option.timed.label': 'Only events with a time',
  'entity.event_type.option.all_day.label': 'Only all-day events',
  'entity.event_type.helper':
    'List the same calendar twice \u2014 once on each of the last two \u2014 to give ' +
    'its all-day and timed events different colors.',

  'entity.compact_events_to_show': 'Compact Events to Show',
  'entity.compact_events_to_show.helper': 'Left empty, the card’s limit applies.',
  'entity.blocklist': 'Blocklist',
  'entity.blocklist.aliases': 'filter out, exclude, keywords',
  'entity.blocklist.helper': 'Hide events where the field above contains any of these terms.',
  'entity.allowlist': 'Allowlist',
  'entity.allowlist.aliases': 'filter, include only, keywords',
  'entity.allowlist.helper': 'Show only events where the field above contains one of these terms.',
  'entity.filter_field': 'Match Against',
  'entity.filter_field.option.title.label': 'Event title',
  'entity.filter_field.option.location.label': 'Location',
  'entity.filter_field.option.description.label': 'Description',
  'entity.filter_field.helper':
    'One at a time: list the same calendar twice to filter on a second.',
  'entity.allday_expires_at': 'All-Day Events Expire At',
  'entity.allday_expires_at.helper':
    'When this calendar’s all-day events stop counting as upcoming on their last day. Only while past events are hidden.',
  'entity.days_of_week': 'Days of the Week',
  'entity.days_of_week.option.inherit.label': 'Every day',
  'entity.days_of_week.option.weekdays.label': 'Every day except the weekend',
  'entity.days_of_week.option.weekends.label': 'Weekend days only',
  'entity.days_of_week.helper': 'Weekend days follow the country set in Home Assistant.',

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
  'entity.replace_field.helper': 'One at a time: listing the calendar twice does not add a second.',
  'entity.replace_pattern': 'Find',
  'entity.replace_pattern.helper':
    'A regular expression, matched in any case. Left empty, the whole field is replaced.',
  'entity.replace_with': 'Replace With',
  'entity.replace_with.helper': 'Left empty, the match is removed.',

  // --- The time grid's own block ----------------------------------------------
  //
  // Options stored in `time_grid:`, labeled under its prefix (`schemas/common.ts` ›
  // `blockScope`).
  'time_grid.density': 'Grid Density',
  'time_grid.density.helper':
    'How narrow a day column may get before the grid gives up a day, and what it does ' +
    'when it runs out.',
  'time_grid.min_day_width': 'Minimum Day Width',
  'time_grid.min_day_width.helper': 'The default, 100px, fits three days at 383px.',
  'time_grid.min_days_to_show': 'Fewest Day Columns',
  'time_grid.min_days_to_show.helper': 'Defaults to 1: a one-day grid is still a useful day view.',
  'time_grid.min_days_fallback': 'When Too Narrow',
  'time_grid.min_days_fallback.option.list.label': 'Fall back to a list',
  'time_grid.min_days_fallback.option.cramp.label': 'Keep the grid, narrower',
  'time_grid.axis': 'Time Axis',
  'time_grid.start_time': 'First Hour',
  'time_grid.start_time.helper': 'As HH:mm. Events entirely before it are not drawn at all.',
  'time_grid.end_time': 'Last Hour',
  'time_grid.end_time.helper':
    'As HH:mm, or 24:00. If either time cannot be read, both fall back to 07:00 and 22:00.',
  'time_grid.slot_minutes': 'Grid Lines Every',
  'time_grid.slot_minutes.helper': 'Only the rules: an hour is the same height whichever you pick.',
  'time_grid.slot_minutes.option.15.label': '15 minutes',
  'time_grid.slot_minutes.option.20.label': '20 minutes',
  'time_grid.slot_minutes.option.30.label': '30 minutes',
  'time_grid.slot_minutes.option.60.label': '1 hour',
  'time_grid.weekend_background_color': 'Weekend Shading',
  'time_grid.weekend_background_color.helper':
    'Any CSS color; keep it faint, since event text sits on top. Weekend days follow the country set in Home Assistant.',
  'time_grid.today_background_color': 'Today Shading',
  'time_grid.today_background_color.helper':
    'Any CSS color; keep it faint, since event text sits on top. On a weekend it replaces the weekend shading.',
  'time_grid.hour_height': 'Height Per Hour',
  'time_grid.hour_height.helper': 'Ignored when a fixed Height is set: the hours compress to fit.',
  'time_grid.hour_line_width': 'Hour Rule Width',
  'time_grid.hour_line_color': 'Hour Rule Color',
  'time_grid.allday_band_line_width': 'All-Day Band Rule Width',
  'time_grid.allday_band_line_color': 'All-Day Band Rule Color',
  'time_grid.axis_width': 'Hour Label Width',
  'time_grid.show_axis_labels': 'Show Hour Labels',
  'time_grid.axis_label_minutes': 'Axis Labels Every',
  'time_grid.axis_label_minutes.helper':
    'Independent of the grid lines. Below an hour, labels carry minutes, which widens the gutter.',
  'time_grid.axis_label_minutes.option.30.label': '30 minutes',
  'time_grid.axis_label_minutes.option.60.label': '1 hour',
  'time_grid.axis_label_minutes.option.120.label': '2 hours',
  'time_grid.axis_label_minutes.option.180.label': '3 hours',
  'time_grid.show_now_line': 'Now Line',
  'time_grid.show_now_line.helper': 'Hidden when now falls outside the hours shown.',
  'time_grid.allday_band_max_rows': 'Most All-Day Rows',
  'time_grid.allday_band_max_rows.helper': 'Banners past this many rows are dropped.',
  'time_grid.overlap_layout': 'Overlapping Events',
  'time_grid.overlap_layout.helper':
    'Stacked draws an event over a longer one it starts inside; Side by Side splits the column.',
  'time_grid.overlap_layout.option.cascade.label': 'Stacked',
  'time_grid.overlap_layout.option.columns.label': 'Side by side',
  'time_grid.max_simultaneous_events': 'Most Events Side By Side',
  'time_grid.max_simultaneous_events.helper': 'The rest collapse into a +N block at the edge.',

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
  days_to_show: 'Days To Show',
  'days_to_show.aliases': 'how many days, number of days, weeks ahead, future weeks, date range',
  'days_to_show.helper':
    'Each layout can set its own. The card loads the longest once, so switching layouts never reloads.',
  start_date_mode: 'Start Date',
  'start_date_mode.aliases': 'tomorrow, yesterday, begin on, first day shown',
  'start_date_mode.option.default.label': 'Today',
  'start_date_mode.option.tomorrow.label': 'Tomorrow',
  'start_date_mode.option.start_of_week.label': 'Start of Week',
  'start_date_mode.option.fixed.label': 'A Fixed Date',
  'start_date_mode.option.offset.label': 'Relative to Today',
  start_date_fixed: 'Date',
  start_date_offset: 'Expression',
  'start_date_offset.helper':
    'An anchor (today, start_of_week or a weekday), then +N or -N days, +Nw weeks or +weekday. For example today+7, saturday, monday+1w.',
  first_day_of_week: 'First Day Of Week',
  'first_day_of_week.option.system.label': 'Follow Home Assistant',
  'first_day_of_week.option.monday.label': 'Monday',
  'first_day_of_week.option.sunday.label': 'Sunday',
  event_order: 'Event Order',
  'event_order.aliases': 'newest first, oldest first, reverse order, sort, descending',
  'event_order.option.earliest_first.label': 'Earliest first',
  'event_order.option.latest_first.label': 'Latest first',
  'event_order.helper': 'With Latest First, the event limit keeps the most recent events.',

  compact_mode: 'Compact Mode',
  'compact_mode.helper': 'Shortens the card in a compact dashboard slot.',
  compact_days_to_show: 'Days',
  compact_events_to_show: 'Events',
  // Also a calendar's own limit, which has no words of its own and resolves to these.
  'compact_events_to_show.aliases': 'limit events, maximum events, max events, number of events',
  compact_events_complete_days: 'Finish The Last Day',
  'compact_events_complete_days.helper':
    'Rather than stopping mid-day at the event limit, show the rest of that day too.',

  show_past_events: 'Show Past Events',
  'show_past_events.aliases': 'hide past events, finished events, ended events',
  skip_first_events: 'Skip First Events',
  'skip_first_events.helper':
    'Leaves this many events off the top, so this card can continue where another stops.',
  show_empty_days: 'Show Empty Days',
  show_empty_today: 'Show Today When Empty',
  'show_empty_today.helper':
    'Keeps today on the card when it has no events, while other empty days stay hidden.',
  empty_day_text: 'Empty Day Text',
  'empty_day_text.helper': 'Replaces the translated default, and drops the check mark before it.',
  empty_day_color: 'Empty Day Color',
  hide_when_empty: 'Hide The Card When Empty',
  filter_duplicates_mode: 'Filter Duplicates',
  'filter_duplicates_mode.option.off.label': 'Off',
  'filter_duplicates_mode.option.exact.label': 'Same title, start, end and location',
  'filter_duplicates_mode.option.ignore_location.label': 'Same title, start and end',
  // See `calendars.helper`: the entry listed first wins, and that entry may be a second
  // block of the same calendar rather than a different one. Colors only — since v4.2 a row
  // merged across two or more distinct calendars shows every one of their labels.
  'filter_duplicates_mode.helper':
    'Hides an event that matches another on these fields. The copy from the entry listed first is kept, with its color.',
  duplicate_accent_color: 'Shared Event Color',
  'duplicate_accent_color.helper':
    'For an event kept from two or more calendars. Left empty, it keeps the first calendar’s color.',
  split_multiday_events: 'Split Multi-Day Events',
  'split_multiday_events.helper':
    'Show an event on every day it covers rather than only on the day it starts.',
  multiday_banners: 'Banners Above the Hours',
  'multiday_banners.helper':
    'Draws an event with a time that lasts a day or longer as one banner above the hours.',
  event_type: 'Event Type',
  'event_type.option.all.label': 'All events',
  'event_type.option.timed.label': 'Only events with a time',
  'event_type.option.all_day.label': 'Only all-day events',
  'event_type.aliases': 'all-day events, timed events',
  'event_type.helper':
    'The kind of event, not how long it lasts. Each calendar can choose its own.',

  language_mode: 'Language',
  'language_mode.option.system.label': 'Follow Home Assistant',
  'language_mode.option.custom.label': 'Choose One',
  language: 'Language Code',
  'language.helper': 'A two-letter code such as de, or a regional one such as en-GB.',
  time_format: 'Time Format',
  'time_format.aliases': '12h, 24h, 12-hour clock, 24-hour clock, AM/PM',
  'time_format.option.system.label': 'Follow Home Assistant',
  'time_format.option.24.label': '24 Hour',
  'time_format.option.12.label': '12 Hour',

  // --- Card & Header --------------------------------------------------------
  'panel.card': 'Card & Header',
  title: 'Title',
  'title.helper':
    'Text with {{ or {% is a Home Assistant template. With the toolbar shown, the title’s size and color apply to the month.',
  title_font_size: 'Title Font Size',
  title_color: 'Title Color',
  background_color: 'Background Color',
  'toolbar.show': 'Show Toolbar',
  'toolbar.navigation': 'Date Navigation',
  'toolbar.navigation.helper':
    'Arrows, a button back to the starting days, and a date picker on the month. Swiping pages too.',
  'toolbar.view_switcher': 'View Switcher',
  'toolbar.view_switcher.helper': 'Each device remembers its choice.',
  'toolbar.reset': 'Reset Button',
  'toolbar.reset.helper':
    'Undoes this device’s changes to the days, the layout, the calendars and an expanded view.',
  'toolbar.refresh': 'Refresh Button',
  'toolbar.search': 'Search Button',
  'toolbar.search.helper':
    'Finds events by title, location or description, a year either way. Needs Date Navigation.',
  'toolbar.add_event': 'Add Event Button',
  'toolbar.add_event.helper': 'Shown only when a calendar on the card accepts new events.',
  'toolbar.legend': 'Calendar Filter',
  'toolbar.legend.helper':
    'Hides calendars on this device. Chips fall back to the menu where they do not fit.',
  'toolbar.legend.option.off.label': 'Off',
  'toolbar.legend.option.menu.label': 'Menu',
  'toolbar.legend.option.chips.label': 'Chips',
  // The toolbar's built-in controls, drawn as chips (D09): shorter than their fields' labels,
  // which the search still finds them by. View Switcher and Date Navigation keep theirs.
  'toolbar.controls': 'Controls',
  'toolbar.controls.hint': 'Pressed controls show in the toolbar. Search needs Date Navigation.',
  'toolbar.controls.add_event': 'Add Event',
  'toolbar.controls.reset': 'Reset',
  'toolbar.controls.refresh': 'Refresh',
  'toolbar.controls.search': 'Search',
  // The toolbar's own buttons: a row each under this sub-heading, after the toolbar's controls
  // and only while the toolbar is shown, which opens in place. The words on the rows themselves,
  // Add Button and the rest, are drawn by the editor rather than by a form; `button.summary` is
  // the line under a row's name, the action by Home Assistant's own name, then its target.
  'toolbar.buttons.heading': 'Your Own Buttons',
  'toolbar.buttons.icon': 'Icon',
  'toolbar.buttons.icon.helper': 'A button without an icon is left out of the toolbar.',
  'toolbar.buttons.name': 'Name',
  'toolbar.buttons.name.helper':
    'Read out by screen readers and shown on hover. Left empty, the button is named after its action.',
  'toolbar.buttons.entity': 'Entity',
  'toolbar.buttons.entity.helper':
    'What a toggle or more-info acts on. Left empty, the card’s first calendar.',
  'toolbar.buttons.tap_action': 'Tap Action',
  'toolbar.buttons.tap_action.helper':
    'Go Back returns to the page you came from, or to this dashboard’s first view.',
  // A panel's heading for a button with neither a name nor an icon the editor can put words to.
  'toolbar.buttons.untitled': 'Button {number}',
  'toolbar.buttons.add': 'Add Button',
  'toolbar.buttons.move_up': 'Move Up',
  'toolbar.buttons.move_down': 'Move Down',
  'toolbar.buttons.remove': 'Remove',
  'button.summary': '{action} · {target}',

  // --- Day Header -----------------------------------------------------------
  'panel.day_header': 'Day Header',
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

  accent_event_text: 'Use Calendar Colors For Event Text',
  'accent_event_text.helper':
    'Draws each event’s title, time, location, description and progress bar in its calendar’s color. Grid does this by default.',

  weekend_colors: 'Weekend Colors',
  // 🚨 Deliberately free of the word this file spells Color, which is what
  // `generate-en-gb.mjs` substitutes on. `editor-translations.test.ts` uses this exact
  // label/helper pair as its witness that a partial language falls back per key: the label
  // carries the word and is always overridden, the helper does not and never is. Put it
  // back in and that test fails, on a claim about the generator rather than about wording.
  'weekend_colors.helper':
    'Weekend days follow the country set in Home Assistant. Each one left empty falls back to its weekday equivalent.',
  weekend_weekday_color: 'Weekend Weekday Color',
  weekend_day_color: 'Weekend Day Number Color',
  weekend_month_color: 'Weekend Month Color',

  heading_today: 'Today',
  today_date_scale: "Today's Date Scale",
  'today_date_scale.helper': '1.25 is a quarter larger; 1 leaves it as it is.',
  today_date_font_weight: "Today's Font Weight",
  'today_date_font_weight.option.default.label': 'Default',
  'today_date_font_weight.option.light.label': 'Light',
  'today_date_font_weight.option.regular.label': 'Regular',
  'today_date_font_weight.option.medium.label': 'Medium',
  'today_date_font_weight.option.bold.label': 'Bold',
  today_weekday_color: "Today's Weekday Color",
  'today_weekday_color.helper':
    'Left empty, it falls back to the weekend color on a weekend, then to the usual one.',
  today_day_color: "Today's Day Number Color",
  'today_day_color.helper':
    "Left empty, the digits on the date tile take a deeper shade of the tile's color.",
  today_month_color: "Today's Month Color",

  past_days: 'Past Days',
  'past_days.helper': 'For the days before today, when the card starts earlier.',
  past_date_opacity: 'Past Date Opacity',
  'past_date_opacity.helper': '0 to 100%; 100 leaves them as they are.',
  past_date_scale: 'Past Date Scale',
  'past_date_scale.helper': '0.85 is a little smaller; 1 leaves them as they are.',
  past_date_font_weight: 'Past Font Weight',
  'past_date_font_weight.option.default.label': 'Default',
  'past_date_font_weight.option.light.label': 'Light',
  'past_date_font_weight.option.regular.label': 'Regular',
  'past_date_font_weight.option.medium.label': 'Medium',
  'past_date_font_weight.option.bold.label': 'Bold',

  today_indicator: 'Today Indicator',
  today_indicator_style: 'Style',
  'today_indicator_style.option.none.label': 'None',
  'today_indicator_style.option.tile.label': 'Date Tile',
  'today_indicator_style.option.dot.label': 'Dot',
  'today_indicator_style.option.pulse.label': 'Pulsing Dot',
  'today_indicator_style.option.glow.label': 'Glowing Dot',
  'today_indicator_style.option.icon.label': 'An Icon',
  'today_indicator_style.option.custom.label': 'An Emoji or Image',
  today_indicator_icon: 'Icon',
  today_indicator_custom: 'Emoji Or Image Path',
  'today_indicator_custom.helper':
    'An emoji, an image path or URL, or any text but tile, dot, pulse and glow, the built-in styles.',
  today_indicator_color: 'Indicator Color',
  today_indicator_size: 'Indicator Size',
  today_indicator_position: 'Indicator Position',
  'today_indicator_position.helper':
    'A pair of percentages, across then down — for example 15% 50%.',

  week_number_mode: 'Numbering',
  'week_number_mode.option.none.label': 'None',
  'week_number_mode.option.iso.label': 'ISO 8601',
  'week_number_mode.option.simple.label': 'Simple',
  'week_number_mode.aliases': 'week numbers',
  'week_number_mode.helper':
    'ISO: week one is the first with four days in the new year. Simple counts from January 1st.',
  show_current_week_number: 'Show The Current Week',
  week_number_font_size: 'Week Number Font Size',
  week_number_color: 'Week Number Color',
  week_number_background_color: 'Week Number Background Color',

  // --- Events ---------------------------------------------------------------
  'panel.events': 'Events',
  event_font_size: 'Event Font Size',
  event_color: 'Event Color',
  accent_color: 'Custom Accent Color',
  'accent_color.helper': 'The bar beside each event.',
  accent_color_mode: 'Accent Color',
  'accent_color_mode.helper':
    'Home Assistant’s color under Settings, Devices & Services, Entities. Calendars without one keep the card default.',
  'accent_color_mode.option.custom.label': 'Custom color',
  'accent_color_mode.option.home_assistant.label': 'Follow Home Assistant',
  vertical_line_width: 'Accent Bar Width',
  event_background_opacity: 'Event Background Opacity',
  'event_background_opacity.helper':
    'Tints each event with its accent color. Zero leaves it untinted.',
  past_event_opacity: 'Past Event Opacity',
  'past_event_opacity.helper':
    '0 to 100%. 100% removes the dimming; 0% makes contents transparent, not hidden.',
  title_max_lines: 'Title Line Limit',
  'title_max_lines.helper': 'Zero means no limit. A truncated title ends in an ellipsis.',
  scroll_long_titles: 'Scroll Long Titles',
  'scroll_long_titles.helper':
    'Keeps a long title on one line and scrolls it, overriding Title Line Limit. Never animates under reduced motion.',
  allday_badge_position: 'All-Day Badge',
  'allday_badge_position.helper':
    'On the time row it replaces the all-day label; on the title it wraps the event name.',
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
    'The accent gives each calendar its own; the row text color matches the row it sits on.',
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
  time_position: 'Time Position',
  'time_position.helper':
    'Puts the time on the title’s line, without its clock. Title Line Limit 1 or Scroll Long Titles keeps both on one line, which needs a wide event row.',
  'time_position.option.below.label': 'Below the title',
  'time_position.option.title.label': 'Beside the title',
  show_end_time: 'Show End Time',
  show_duration: 'Show Duration',
  'show_duration.helper':
    'Such as “(1 hr, 45 min)”. A split event shows its whole length on each day.',
  show_single_allday_time: 'Show Time For All-Day Events',
  'show_single_allday_time.helper': 'Multi-day all-day events have their own setting below.',
  show_multiday_allday_time: 'Show Time For Multi-Day All-Day Events',
  'show_multiday_allday_time.helper':
    'Their time row reads “All day, until …” and carries the end date.',
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
  'location_country_pattern.helper': 'Only a name at the end of the location is removed.',
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
  'progress.helper':
    'How long until an event starts or since it ended, and how far through it we are.',
  show_countdown: 'Show Countdown',
  'show_countdown.helper': 'Such as “in 2 days”, and “2 days ago” for a finished event.',
  countdown_max_days: 'Count Down Only Within Days',
  'countdown_max_days.helper':
    '0 is today alone, 7 a week either way. Left empty, every event gets one.',
  show_countdown_allday: 'Count Down To All-Day Events Too',
  countdown_once_per_day: 'Leave Out Repeated Countdowns',
  'countdown_once_per_day.helper':
    'Leaves out a countdown that repeats the one above it. Minutes and hours always show.',
  countdown_exact_days: 'Count In Days Only',
  'countdown_exact_days.helper':
    '“in 30 days” rather than “in a month”, “in 1 day” rather than “tomorrow”.',
  show_progress_bar: 'Show Progress Bar',
  'show_progress_bar.helper':
    'In List and Columns, an event lasting a day or longer shows a day counter, such as “Day 2 of 3”, instead.',
  show_now_indicator: 'Show Now Indicator',
  'show_now_indicator.helper':
    'Puts a green “Now” before the time of events that are happening right now.',
  now_color: 'Now Color',
  'now_color.helper':
    'The color of an event that is happening right now, and of the now line in grid view.',
  progress_bar_color: 'Progress Bar Color',
  progress_bar_height: 'Progress Bar Height',
  progress_bar_width: 'Progress Bar Width',

  // --- Separators -----------------------------------------------------------
  // Grid alone gathers horizontal rules — the hour lines and the band edge — beside the
  // vertical day, week and month ones, so "Separators" describes only half of what the
  // panel holds there. The field labels in it already say "Rule".
  day_separator_width: 'Day Rule Width',
  day_separator_color: 'Day Rule Color',
  week_separator_width: 'Week Rule Width',
  week_separator_color: 'Week Rule Color',
  month_separator_width: 'Month Rule Width',
  month_separator_color: 'Month Rule Color',
  // The rule's own explanation moved onto the width field when the collapsible around it
  // became a sub-heading. A heading carries no helper, so leaving the text on the group
  // key would have deleted it from the editor rather than relocated it.
  'column.day_header_separator_width': 'Day Header Rule Width',
  'column.day_header_separator_width.helper':
    'It sits inside the day header gap, so switching it off does not move the events.',
  'column.day_header_separator_color': 'Day Header Rule Color',
  'time_grid.day_header_separator_width': 'Day Header Rule Width',
  'time_grid.day_header_separator_width.helper':
    'The rule between the date row and the all-day band. 0 removes it.',
  'time_grid.day_header_separator_color': 'Day Header Rule Color',

  // --- Weather --------------------------------------------------------------
  //
  // `entity` and `position` are spelled bare because the block they sit in nests the
  // configuration without drawing a heading, and Home Assistant only qualifies a label
  // key with a group that *has* one. They are the only two generic names in the table,
  // and `computeLabel` tries the qualified key first, so a future field of the same
  // name inside a titled group would resolve to its own string rather than to these.
  'panel.weather': 'Weather',
  entity: 'Weather Entity',
  'entity.helper': 'Leave empty for no forecast at all.',
  position: 'Show The Forecast',
  'position.option.none.label': 'Nowhere',
  'position.option.date.label': 'In the Day Header',
  'position.option.event.label': 'Beside Each Event',
  'position.option.both.label': 'In Both Places',

  'weather.date': 'In the Day Header',
  'weather.date.helper': "The day's forecast, shown once per day.",
  'date.show_conditions': 'Show Conditions Beside Days',
  'date.show_high_temp': 'Show High Temperature',
  'date.show_low_temp': 'Show Low Temperature',
  'date.show_low_temp.helper': 'The UV index takes this place on days it is shown.',
  'date.show_uv_index': 'Show UV Index Beside Days',
  'date.uv_index_threshold': 'UV Index Threshold Beside Days',
  'date.uv_index_threshold.helper': 'Hide the index below this value. Zero always shows it.',
  'date.icon_size': 'Icon Size Beside Days',
  'date.font_size': 'Font Size Beside Days',
  'date.color': 'Color Beside Days',

  'weather.event': 'Beside Each Event',
  'weather.event.helper': "The forecast for each event's own start time.",
  'event.show_conditions': 'Show Conditions Beside Events',
  'event.show_conditions.helper':
    'Columns and Grid always show the icon; there this adds the condition in words.',
  'event.show_temp': 'Show Temperature',
  'event.show_uv_index': 'Show UV Index Beside Events',
  'event.uv_index_threshold': 'UV Index Threshold Beside Events',
  'event.uv_index_threshold.helper': 'Hide the index below this value. Zero always shows it.',
  'event.daily_forecast_fallback': 'Fall Back to the Daily Forecast',
  'event.daily_forecast_fallback.helper':
    'For an all-day event, or one further ahead than the hourly forecast reaches.',
  'event.icon_size': 'Icon Size Beside Events',
  'event.font_size': 'Font Size Beside Events',
  'event.color': 'Color Beside Events',
  'event.max_lines': 'Weather Line Limit',
  'event.max_lines.helper': 'Zero means no limit. Only Columns and Grid can reach a second line.',

  // --- Actions & Refresh ----------------------------------------------------
  tap_action: 'Tap Action',
  hold_action: 'Hold Action',
  // Home Assistant names its own actions; this is the one the card adds, and both
  // dropdowns resolve it through the same key. See `hass-localize.ts` for how it reaches
  // HA's action editor at all.
  //
  // Wording carried over verbatim from the hand-rolled v3 editor, which offered this
  // action and had it translated into all nine languages. Inventing a shorter English
  // label here would have been an invitation to guess nine translations; this one was
  // written by the people who speak them. It also says what the action does, which a bare
  // "Expand" does not — and Home Assistant now contributes a `Toggle` of its own two rows
  // below, for toggling an entity rather than the card.
  'card_action.option.expand.label': 'Toggle Compact/Expanded View',
  // The card's other action: load the events again now, as the toolbar's refresh button does.
  'card_action.option.refresh.label': 'Refresh Events',
  // And its third: open a new event, on the day the press landed on.
  'card_action.option.add-event.label': 'Add Event',
  // Its fourth: what the toolbar's reset button does, named for the docs' "Resetting the Card".
  'card_action.option.reset.label': 'Reset Card',
  // Its fifth: back to the page before this one, as Home Assistant's own back arrow goes. Each
  // translation takes the word its language's back buttons carry.
  'card_action.option.back.label': 'Go Back',
  // The day's own dropdown, two choices over an action object. "Nothing" is the word Home
  // Assistant's action editor uses for `none` in the dropdowns around it, and each translation
  // takes Home Assistant's own word for it, so the panel says it one way in every language.
  // "Add Event" is the card action's label.
  day_tap_action_mode: 'Day Tap Action',
  'day_tap_action_mode.option.none.label': 'Nothing',
  'day_tap_action_mode.option.add-event.label': 'Add Event',
  'day_tap_action_mode.helper':
    'Add Event opens a new event when you tap an empty spot of a day. In Grid you can also hold and drag to draw one.',
  // Home Assistant's action editor, as for the card's two. `details` is the one action only an
  // event takes, labeled as the dropdown's other card actions are; "Show Event Details" is the
  // wording the event's own two-choice dropdown carried before, in every language.
  'card_action.option.details.label': 'Show Event Details',
  event_opens_details: 'Tapping an Event Opens It',
  'event_opens_details.helper':
    'Where it can be changed or deleted. The preview does not open events; try it on the dashboard.',
  event_tap_action: 'Event Tap Action',
  'event_tap_action.helper':
    'Home Assistant’s own actions can use the tapped event’s title, times, location and description.',
  event_hold_action: 'Event Hold Action',
  'event_hold_action.helper':
    'Home Assistant’s own actions can use the held event’s title, times, location and description.',
  // Shown only while neither event action does anything of its own, directly under them. The
  // views it reaches are the applicability note's to say (`VIEW_SCOPE`): grid draws no links.
  open_links: 'Open Links in Events',
  'open_links.helper':
    'Web addresses in locations and descriptions open in a new tab. Tapping one follows it.',
  // Shown only while the event tap or hold action is `details`, directly under them, so "the
  // event's details" needs no introduction. Each ends on the calendar because that is the
  // question a user with the switch on and no Edit button is asking: these can only take away.
  allow_event_edit: 'Allow Editing Events',
  'allow_event_edit.helper':
    'Lets you change an event in its details, on calendars that support it.',
  allow_event_delete: 'Allow Deleting Events',
  'allow_event_delete.helper': "Offers Delete in an event's details, on calendars that support it.",
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
    'Grid derives daily coverage itself. All-day events use spanning banners across included ' +
    'columns; timed events use a block per included day.',
  'scope.list_only': 'Applies to the list layout, which this card also uses on narrow screens.',
  'scope.grid_only': 'Applies to the time grid layout.',
  'scope.list_only.today_indicator_position':
    'Applies to the list layout — column layout places the indicator for you.',
  'scope.list_only.compact_events_to_show':
    'Applies to the list layout. Capping events per card would empty columns rather ' +
    'than shorten the card.',
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
