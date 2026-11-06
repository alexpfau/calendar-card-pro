# What's New

**➡️ View the [Full Release Notes](/RELEASE_NOTES) for a complete list of features.**

Each entry below covers a whole minor release line — the `X.Y.0` release plus every
patch that followed it — so this page reads as the card's progression from the first
public release in January 2025 to today.

## Latest Release: v5.1

- 💬 **The Card's Own Event Popover**: [`event_tap_action: details`](/features/actions#the-event-popover) now opens a popover that belongs to the card instead of Home Assistant's dialog, beside the event on a wide screen and as a sheet on a phone. [Change an event](/features/actions#editing-deleting-events) where it is shown and it saves when the popover closes, move it to another of the card's calendars, or delete it; a repeating event asks which occurrences you mean. A location gets a [map or a pin](/features/actions#maps-locations), and links in the description open. What a calendar allows depends on [its integration](/features/actions#what-each-integration-allows): a Local Calendar does everything, Google adds and deletes, CalDAV only adds
- ✍️ **Add & Move Events the Way a Calendar App Does**: [`day_tap_action: add-event`](/features/actions#tapping-a-day-to-add-an-event) adds an event on a day you tap, and in grid view a tap adds one at that quarter hour while a hold and drag [draws it](/features/actions#drawing-an-event-in-grid-view) across hours and days. An event the popover can change also [moves by drag](/features/grid-view#moving-events-by-drag) to another time or day
- 🔍 **Search the Card's Events**: a magnifier in the toolbar [searches the card's events](/features/layout-appearance#searching-the-card) a year back and ahead by title, location or description, whatever the case and the accents, and a pick pages the card to the event and rings it where that page can show it. On wherever the toolbar shows its date navigation; `search: false` takes it away
- 👆 **Swipe, Tap & Hold**: a swipe across the days [pages](/features/layout-appearance#paging-through-dates) on a touch screen, `event_hold_action: details` opens an event on a hold, `event_tap_action` takes Home Assistant's own actions with [the event's fields](/features/actions#using-the-events-fields-in-an-action) such as `{title}` and `{location}`, and `add-event`, `reset` and `back` join the card's own actions
- 🧰 **Your Own Toolbar Buttons**: [`toolbar → buttons`](/features/layout-appearance#your-own-buttons) adds an icon and an action of your own after the add button, folding into one ⋮ menu on a narrow card
- 🔗 **Links in Event Rows**: [`open_links`](/features/actions#links-in-events) turns web addresses in a location or description into links in list and column view, on cards whose events have no tap or hold action of their own
- 🏷️ **A Name for Each Calendar**: a calendar's [`name`](/features/core-settings#naming-a-calendar-in-the-card) now names it in the toolbar's chips and menu, the couldn't-load notice, the grid for screen readers and the popover
- ⏱️ **The Time Beside the Title**: [`time_position: title`](/features/event-content#time-beside-the-title) puts the time on the title's line in list and column view; it needs a wide event row, about a 360 px list card or a 280 px column
- 🧩 **Interactive Starting Points**: the card picker now [offers Interactive List and Interactive Time Grid first](/guide/usage#adding-the-card-to-your-dashboard), with the toolbar, the popover and tap to add already on
- 📡 **Live Updates**: on Home Assistant 2026.5 or later the card [subscribes to each calendar](/features/performance#live-updates), so a change made anywhere shows on every open dashboard as soon as Home Assistant knows of it, with no polling. On a cold load each calendar is drawn as it answers, and the card no longer redraws for state changes that touch nothing it shows
- ⚠️ **Changes to Existing Cards**: a toolbar with date navigation gains the search button, Home Assistant actions set in `event_tap_action` now run, colors mix in Oklab, the `pulse` today indicator sits centered, and the editor keeps lines you wrote at their default value. The [release notes](/RELEASE_NOTES) list every change
- 🐛 **Back on Android 7 Wall Panels**: Chromium 119, in Android 7 wall displays and some headless screenshot add-ons, crashed on the card's color formulas; they now wait for Chrome 125, and the running event's green no longer turns gold on Chrome 125 to 131
- 🐛 **Right-to-Left Dashboards Mirror**: the list's dates, separators, today dot, progress bar and loading ring now sit where a right-to-left reader expects them, and 12-hour times, countdowns and labels read in order
- 🐛 **Midnight, Outages & Storage**: a card following today shows the new day's events at midnight, events deleted while another calendar is down disappear, and a calendar that emptied no longer refills itself where browser storage fails
- 🐛 **Broken HTML Can No Longer Freeze a Dashboard**: a description with tags that never close took seconds to draw every time; it now takes milliseconds

## v5.0

🎬 Smart-Live has the exclusive first video review of v5, in German: [Calendar Card Pro 5: Endlich ZEITRASTER für deinen Familienkalender in Home Assistant](https://youtu.be/ptXdis8WHXo)

- 🗓️ **Grid View**: Set [`view: grid`](/features/grid-view) and days become columns against a shared hour axis, each event drawn at its real start time and sized by how long it runs — the week view a calendar app gives you, in a Lovelace card. An event that starts inside a longer one is drawn on top of it, the way your calendar app draws a day, and when more events start together than will fit side by side the rest collapse into a counted `+N` block. All-day events span their included dates in a band above the axis, while timed multi-day events stay on the hour grid
- 🕒 **A Line Across Today**: [`show_now_line`](/features/grid-view) marks the current time on today's column only, and only while it falls inside the hours you draw, running over the event under way and under its text
- ⚙️ **An Axis You Set, and a Grid That Gives Way**: `start_time`, `end_time`, `hour_height`, `slot_minutes` and `axis_width` decide which hours are drawn and how they are ruled, while `min_day_width`, `min_days_to_show` and `min_days_fallback` decide how narrow the grid may get before it sheds a column, and what happens when even that will not fit
- 🎚️ **Grid Defaults You Can Edit Directly**: filled event blocks, empty days kept, past events kept, a hairline between columns and a full-width progress bar. The [Grid workspace](/features/editor#view-exceptions) shows the effective values and their sources; editing writes an override, while untouched defaults stay out of YAML
- 🧰 **A Toolbar on the Card**: [`toolbar: { show: true }`](/features/layout-appearance#header-toolbar) adds two rows to the card's header: the actions, then the month on screen. [Page through the dates](/features/layout-appearance#paging-through-dates) with arrows and a home button, or jump with the date picker; switch between List, Columns and Grid; [show or hide each calendar](/features/layout-appearance#showing-hiding-calendars) from a menu or as color chips; and [refresh](/features/layout-appearance#refreshing-the-events) now. Each device remembers its layout and hidden calendars until the card is edited, and `reset: true` adds a button that [puts a shared screen back](/features/layout-appearance#resetting-the-card) in one press
- 📏 **A Different Number of Days in Each Layout**: `days_to_show` can be set in `list:`, `column:` or `time_grid:`, so a card can look two weeks ahead as a list and show this week on the grid, and [switching still loads nothing](/features/core-settings#showing-a-different-number-of-days-in-each-layout)
- 👆 **Add, Open, Change & Delete Events**: the toolbar's [add button](/features/actions#add-event-button) opens Home Assistant's own new-event dialog, and [`event_tap_action: details`](/features/actions#tapping-an-event) opens a tapped event with its full description, offering Edit and Delete wherever the calendar's integration allows them. `allow_event_edit: false` and `allow_event_delete: false` take them away on a wall tablet
- 📍 **Today on a Tile, Now in Green**: today's day number sits on a [soft tile](/features/layout-appearance#today-indicator) in your theme's color by default, and in list and column view an event under way gets a [filled clock and "Now ·"](/features/event-content#the-now-indicator) in green. `today_indicator: false` and `show_now_indicator: false` bring back the v4 look
- 🎨 **Your Theme's Accent**: calendars without a color of their own, the today tile, week-number pills and week separators [follow your theme's primary color](/features/layout-appearance#visual-styling-colors) instead of a fixed blue, and the accent bar beside each event has rounded ends in every view
- 📅 **Today, Even When It Is Empty**: [`show_empty_today`](/features/event-content#showing-today-when-it-is-empty) keeps today's row, reading "No events", while the other empty days stay hidden
- ↕️ **Room Between Events**: [`event_gap`](/features/layout-appearance#gaps-between-events) holds each event of a day apart from the next in list and column view, each with its own accent bar
- 🎛️ **Edit the Layout You Mean**: [Card Displays and Editing Settings For](/features/editor#options-for-the-selected-view) separate the card's layout from the workspace you configure. All Layouts edits shared values; List, Columns, and Grid write their own blocks. Controls show effective values and individual resets. An editor transition to Grid preserves authored shared choices, including after reopening; fresh Grid defaults are not saved
- ↔️ **Scrolling Long Titles**: [`scroll_long_titles`](/features/event-content#scrolling-long-titles) keeps a too-wide title on one line and scrolls it sideways, when and only when it actually overflows. Visible titles travel at one steady pace and set off together rather than each running as its own ticker, it respects the system reduce-motion setting, and it replaces `title_max_lines` while it is on
- 🖍️ **Event Text in Each Calendar's Color**: Write `accent` into [`event_color`, `time_color`, `location_color`, `description_color` or `progress_bar_color`](/features/event-content#event-text-in-calendar-colors) and that field follows the calendar its event came from. The five stay independent, so `time_color: accent` tints only the time. Grid starts all five at `accent`; list and column accept it but leave it off
- 🌍 **Weekends That Match Where You Live**: the card answered Saturday and Sunday for everybody, which is wrong in Israel and much of the Arab world, in Iran, and in India. The [country set in Home Assistant](/features/core-settings#showing-a-calendar-on-weekdays-only) decides it now, whatever language Home Assistant runs in, with the language standing in only when no country is set. Weekend colors, the `days_of_week` filter and Grid's [weekend shading](/features/grid-view#shading-the-weekend) all agree. Nothing changes for a Saturday–Sunday household with its country set
- 🌗 **Set How Faded Finished Events Look**: [`past_event_opacity`](/features/event-content#past-events-display) replaces the fixed 60% dimming with anything from 0 to 100, and takes a value per view — `100` keeps finished events at full strength, which a calendar kept as a log has wanted for a while, and `0` makes them transparent without removing the row
- 📆 **Per-Calendar Splitting in Column View**: a calendar's own [`split_multiday_events`](/features/core-settings#available-options-for-entity-configuration-objects) now applies in column view and wins over the card-wide choice, so a Column card that already sets it to `false` on a calendar shows that calendar's multi-day events once instead of in every column they cover
- 📚 **Example Stories**: [six complete cards](/reference/examples), each built for a real place in a home and the question it answers there: a [family's wall tablet](/guide/family-calendar), a [hallway agenda](/guide/one-calendar-many-purposes), a [now-and-next tile](/guide/now-and-next), [today and tomorrow by the hour](/guide/today-and-tomorrow), [birthdays and holidays](/guide/birthdays-and-holidays) and [bin day](/guide/bin-day). Each gives you its YAML to copy and says what each part adds
- ⚡ **Your Events the Moment the Dashboard Opens**: the card draws the events it last loaded straight away and checks with Home Assistant in the background, asks every calendar at once, and [names a calendar that fails to load](/features/performance#when-a-calendar-fails-to-load) at the bottom of the card while keeping its last events. `refresh_on_navigate` now refetches whenever the card appears, as it always said it would
- 🌐 **Korean**: the card's 36th language, with the visual editor in part
- ⚠️ **Breaking**: the accent bar is now [`.event-accent-bar`](/features/theming), an element of its own, so a card-mod rule setting `border-left` on `.event` no longer reaches it
- 🐛 **Refreshes on Time**: the card refreshed at twice its `refresh_interval`, so the default 30 minutes behaved as an hour, and a calendar that never answered could stop it refreshing altogether
- 🐛 **Empty Days Say Something True**: the default message dropped "upcoming" in every language, because a day already behind you is not waiting for anything — and a finished day's notice now fades along with the events around it instead of sitting bright among them
- 🐛 **A Limited Weather Line Stayed Whole**: setting `weather → event → max_lines` pushed the condition onto a row of its own, so a line meant to read `28° · Cloudy` showed `28°` above `· Cloudy` at any width in column view. It clamps without breaking the line now
- 🐛 **Sizes That Hold the Layout**: a space before the unit, as in `today_indicator_size: 6 px`, blew icons up to 300px and could give the date column half the card, and a relative font size such as `1.5em` was applied twice to titles and countdowns. Sizes are repaired or fall back to their default now, and every valid font size means what it says
- 🐛 **A Reminder Shows Its Time Once**: an event that starts and ends at the same moment read `9:41 - 9:41`. It reads `9:41` now
- 🐛 **A Card With No Actions Behaved Like a Button**: with `tap_action` and `hold_action` both at their `none` default, the card still showed a hand cursor and ripple, took keyboard focus, and dispatched the empty action on every tap, Enter and Space. Those affordances now appear only when an action is configured
- 🐛 **A Second Finger Could Steal a Hold**: a second touch took over an active hold, so releasing it could trigger an action begun with the first finger, and a hold disc already drawn could stay on the dashboard until the page was reloaded
- 🐛 **A Card Off Screen Could Start Itself Again**: switching dashboard tabs disconnects a card without destroying it. Disconnecting stopped its refresh timer and title template, but a configuration change or a queued repaint arriving afterwards restarted them on the detached card, with nothing left to stop them
- 🐛 **Back on iOS 15 and 16**: v5.0.1 stops the card from crashing the Home Assistant app on iOS and iPadOS 16, where the colors of the today tile, the all-day badges and accent-colored text took Safari down, and lets it load again on iOS 15. The [installation guide](/guide/installation#browser-support) now says which iPhones and iPads can run it
- 🌍 **Serbian**: v5.0.1 adds Serbian, in Cyrillic and Latin script, with dates, relative times and weather conditions in the script Home Assistant uses

## v4.2

- 🧑 **A Shared Event Shows Every Calendar's Label**: With duplicates filtered, an event two calendars hold kept one row and one label — so a lunch you and your partner both have showed one of you. The row now draws [the label of every calendar it came from](/features/core-settings#labeling-coloring-shared-events), both faces instead of one, with identical labels drawn once. Colors are unchanged, and nothing changes unless you both filter duplicates and label your calendars
- 🎨 **A Color for Events Two Calendars Share**: [`duplicate_accent_color`](/features/core-settings#labeling-coloring-shared-events) accents every merged event in a color of its own, so joint events are findable at a glance while the labels say who each of the others belongs to. Only fires across different calendars, and unset it changes nothing
- 🐛 **Countdowns No Longer Skip Calendar Days**: Timed events on consecutive dates could read "in 2 days" and "in 4 days." [Countdowns now follow local calendar dates](/features/event-content#countdown-display): localized "tomorrow" for the next date, date-based relative wording thereafter, and clock units only for starts later today. Distant dates retain the previous natural month/year wording. Existing countdown-enabled cards use this automatically, including all-day and split multi-day rows
- 🐛 **A Blocklist No Longer Disappears Behind an Allowlist**: [Both filters now apply](/features/core-settings#filtering-by-event-name), so an event must match the allowlist and escape the blocklist. An invalid pattern no longer disables the other filter. Existing cards using both may show fewer events after upgrading; clearing the blocklist restores the previous result

## v4.1

- 🏷️ **All-Day Events, as a Pill**: [`allday_badge`](/features/event-content#the-all-day-badge) draws a rounded pill in the calendar's own color — around the event title, the way Google and Apple Calendar do, or beside the clock in place of _All day_. `allday_badge_style` offers four shapes, and `allday_badge_color` draws them in each calendar's own color, the row's own text color, or one you name
- 🎨 **Follow Home Assistant's Calendar Colors and Icons**: Set `accent_color` to `home-assistant` and each calendar takes [the color Home Assistant holds for it](/features/core-settings). Set its `label` the same way for [that calendar's icon](/features/core-settings#following-the-icon-from-home-assistant), so changing either in Home Assistant changes it here
- 🧑 **A Person's Photo in Front of Their Calendar**: Set a calendar's `label` to a person entity ID and the card shows [that person's picture](/features/core-settings#showing-a-persons-picture) — faces instead of words on a household dashboard, with a person picker in the editor
- 🗂️ **Split One Calendar by Event Type**: [`event_type`](/features/core-settings) takes `all`, `timed` or `all_day`, card-wide or per calendar — list one calendar twice, once each way, for a color on each, and [**Duplicate** in the editor](/features/editor#per-calendar-panels-actions) builds it for you
- ⚙️ **Clearer Editor Layout**: The panels deciding what the card shows now group their settings under sub-headings, and both order them the same way
- 🗑️ **All-Day Events That Clear During the Day**: [`allday_expires_at`](/features/core-settings#retiring-all-day-events-during-the-day) moves the moment one calendar's all-day events count as past earlier into the final day, so a bin emptied this morning stops sitting on the card until midnight
- 🐛 **Finished All-Day Events Stayed on the Card**: with past events hidden, an all-day event that had already ended kept its row on any card whose window reached backwards, while timed events beside it were correctly gone
- 📅 **A Calendar on Weekdays Only**: [`days_of_week`](/features/core-settings#showing-a-calendar-on-weekdays-only) takes `weekdays` or `weekends` for a single calendar, judged on the day each row lands on, while every other calendar keeps its weekend
- 🎂 **Ages on Birthdays, Counts on Anniversaries**: Write `YEAR=1976` in a birthday event's description and the card appends the age to the title — [nothing to configure](/features/event-content#birthday-ages-anniversary-counts), and it stays right every year
- 💬 **Teams Meetings Get the Teams Icon**: online meetings show [the Teams logo in place of the map pin](/features/event-content#the-location-icon) automatically, in any language Teams writes them in, and the per-calendar `location_icon` names a different icon for any calendar
- 🔍 **Filter on the Location or Description**: [`filter_field`](/features/core-settings#matching-the-location-or-description-instead) points `blocklist` and `allowlist` at an event's location or description instead of its title, so a Zoom URL in a location field can finally be filtered on
- 🔤 **A Today Indicator That Can Be Words**: [`today_indicator`](/features/layout-appearance#today-indicator) takes any text, so today can be marked `KW 34` or `Sprint 12` rather than a dot — raise `today_indicator_size` when you do, since it ships at `6px`
- ✏️ **Rewrite What an Event Says**: [`replace_pattern`, `replace_with` and `replace_field`](/features/core-settings#text-replacement) rewrite one field of a calendar's events as the card draws them, leaving the calendar untouched — strip a `Birthday of ` prefix, or show `Busy` in place of every title

## v4.0

- 🗓️ **Column View**: Lay the days [side by side, one column each](/features/column-view), instead of stacking them — the same agenda, rotated, with its own per-view overrides and a responsive fallback to the list layout
- ⚙️ **Rebuilt Visual Editor**: Nine panels built on Home Assistant's own form components, with a [search box that finds any setting by name or YAML key](/features/editor#search-customized-only), a customized-only filter, per-calendar settings, and [per-view exceptions](/features/editor#view-exceptions)
- ⚡ **41% Smaller to Download**: The editor moved into a file the card fetches only when you open it, taking it and all its translations off the path every dashboard pays for
- ⚡ **Fewer Round-Trips on Every Page Load**: One card load asked Home Assistant for the same events up to four times; requests are now deduplicated, and two display-only switches no longer discard a valid cache entry
- 🌍 **Eleven Editor Languages**: Nine newly translated in full — German, Estonian, Italian, Latvian, Lithuanian, Norwegian Bokmål, Polish, Slovak and Swedish — alongside US and British English, with per-string fallback so a partial translation still renders
- 📏 **Per-Field Line Limits**: Cap the lines used by a title, time or location with [`title_max_lines`, `time_max_lines` and `location_max_lines`](/features/event-content#limiting-lines-per-field)
- 🌦️ **Weather in Column View**: A row of its own beneath the time, optionally [stating the condition in words](/features/weather#weather-in-the-column-layout) in your language
- 🐛 **Dates, Clocks and Week Numbers**: [Week numbers](/features/layout-appearance#week-numbers-visual-separators) were wrong for one date in seven outside UTC, the clock format disagreed with Home Assistant's own locale data for 33 of its 64 languages, and `first_day_of_week: system` returned Monday to everyone
- 🩺 **Diagnosable Released Builds**: Turn the card's full logging back on from the browser console when [reporting a bug](/contributing#reporting-a-bug)
- ⚠️ **Breaking**: Manual installs now copy [two files](/guide/installation#manual-installation), `event_icon_vertical_alignment` defaults to `top`, and weather badges are styled through [custom properties](/features/theming#weather-custom-properties) instead of inline styles

## v3.6

- 📚 **A Documentation Site**: The full manual moved to its own searchable site — a page per feature, a [complete configuration reference](/reference/configuration) listing every option with its type and default, and [ready-made examples](/reference/examples). The README is now a landing page that points at it
- 🐛 **One Stray Line of YAML Broke the Card**: A bare `-` left in the `entities:` list parses to null, which threw before the card rendered and replaced the whole calendar with a red error box; malformed entries are now discarded
- 🐛 **Per-Calendar Settings Applied Late**: Editing a per-calendar label, colour or toggle did nothing until the cache expired, because the cache key described only what had been fetched. The raw calendar payload is now cached and reprocessed on every read
- 🐛 **Titles Ellipsised When Nothing Was Truncated**: Event titles gained a trailing `…` at certain widths despite losing no characters, and ate real ones at narrower widths
- 🐛 **Words Clipped Mid-Character**: Description, location and time rows could shrink below their own longest word and cut it mid-glyph with no ellipsis to signal it; long words now wrap
- 🐛 **Multi-Day Countdowns Disagreed Row to Row**: Each row of a [split multi-day event](/features/multi-day-events) counted differently, reading `in 3 days / in 5 days / in 6 days / in 6 days`; every row now counts whole calendar days to its own date
- 🐛 **Silently Ignored Options**: The five options removed in v3.0.0 were dropped without comment for anyone configuring in YAML, and are now reported in the console alongside the option that replaces them

## v3.5

- 🫥 **Empty State Control**: [Remove the card entirely](/features/event-content#calendar-events-display) when there are no upcoming events, or replace "No upcoming events" with [your own wording](/features/event-content#custom-empty-day-text)
- 📅 **Flexible Start Dates**: [Anchor the view to the week or a weekday](/features/start-date-offset#start-date-configuration) with `start_of_week`, `saturday`, and composable offsets like `start_of_week+7`
- 🏷️ **Templated Titles**: Render the card title from a [Home Assistant template](/features/title-templates), updating live from sensors or the current date
- 🔎 **Suggested in the Card Picker**: Home Assistant 2026.6+ offers the card under **Community** when you [add a card by entity](/guide/usage#adding-the-card-to-your-dashboard) and pick a calendar
- 🐛 **Card Title Sizing**: Titles rendered as plain body text after Home Assistant dropped the Polymer font variables; they are back at their intended size and weight
- 🐛 **Failed Calendars No Longer Look Empty**: An unreachable calendar now shows an error instead of claiming there are no events — which could silently hide the card

## v3.4

- ⏳ **All-Day Countdown Control**: Hide countdowns on all-day events while keeping them on timed ones with [`show_countdown_allday`](/features/event-content#countdown-display)
- 🌤️ **Weather Across the Full Range**: Timed events beyond Home Assistant's hourly forecast horizon now [fall back to the daily forecast](/features/weather#weather-configuration-options) instead of showing nothing
- 🧭 **Compact Mode Guidance**: The visual editor warns about compact configurations that silently do nothing
- 🐛 **All-Day Countdowns Off By One**: Now measured in whole calendar days instead of from the current instant
- 🐛 **Cleared Number Fields**: Emptying a numeric field in the editor no longer blanks the card
- ⚡ **Faster Rendering**: Color resolution is cached, removing hundreds of forced layouts per refresh on large calendars

## v3.3

- 🌍 **Two New Languages**: British English and Latvian (35 total), with editor translations for Italian, British English, and Latvian (11 total)
- 🐛 **HA 2026.5+ Visual Editor**: Restored the text input fields, which vanished entirely after Home Assistant removed `ha-textfield`
- 🐛 **`event_color` Fix**: No longer ignored when no per-entity color is configured
- 🐛 **Catalan & Romanian Relative Times**: Fixed silently falling back to English

## v3.2

- 📝 **Event Description Display**: Show event descriptions with [configurable line clamping](/features/event-content#event-description-display), HTML stripping, and full styling control
- 🌤️ **UV Index in Weather**: Display [UV index in weather forecasts](/features/weather#weather-configuration-options) with configurable visibility threshold
- 🎨 **Event Icon Alignment**: Control the [vertical alignment of event icons](/features/layout-appearance#spacing-alignment) for time, location and description rows
- 🏷️ **Label Icon Color**: Customize [label icon colors](/features/core-settings#entity-configuration) per entity with `label_icon_color`
- ↔️ **RTL Support**: Full right-to-left support for event borders and accent lines
- 🔄 **Improved Loading UX**: Events stay visible during refresh; a subtle spinner replaces the full-screen loading state
- 🌍 **Three New Languages**: Estonian, Lithuanian, and Turkish (33 at the time), with editor translations for Polish, Estonian, and Lithuanian
- 🐛 **HA 2026.3+ Compatibility**: Migrated editor dropdowns to the new WebAwesome API
- 🐛 **Weather WebSocket Leak**: Subscriptions are now cleaned up instead of accumulating

## v3.1

- 🌍 **Four New Translations**: Bulgarian interface, plus Norwegian Bokmål, German, and Swedish editor translations
- 🎨 **Tomorrow CSS Class**: New `tomorrow` HTML class for [card-mod styling](/features/theming#card-mod-examples) of tomorrow's events
- 🐛 **Zero Temperature Fix**: `0°` no longer disappeared from the weather low temperature
- 🐛 **Grid Layout Fix**: Resolved card overflow when `grid_options.rows` is set

## v3.0

- ⚙️ **Visual Configuration Editor**: New [visual editor](/features/editor) for easy, guided configuration, with smart validation and auto-upgrade of deprecated settings
- 🌦️ **Weather Integration**: Display [weather forecasts](/features/weather) alongside your events
- 🕒 **Improved Time Format Detection**: Automatically detects and respects all Home Assistant time format settings (12h, 24h, language-based, and system-based)
- ⚠️ **Breaking Changes**: Parameter renames: `vertical_line_color` → `accent_color`, `max_events_to_show` → `compact_events_to_show`, `horizontal_line_width` → `day_separator_width`, `horizontal_line_color` → `day_separator_color`

## v2.4

- 🌟 **Today Indicator**: Highlight today with a [customizable dot, pulse, glow effect, emoji, or custom icon](/features/layout-appearance#today-indicator)
- 🎨 **Today's Date Styling**: Customize the [appearance of today's date](/features/layout-appearance#date-column-customization) with dedicated color options (`today_weekday_color`, `today_day_color`, `today_month_color`)
- 🚦 **Event Progress Bars**: Visualise how far a running event has progressed with optional [progress bars](/features/event-content#progress-bar-display)
- ✂️ **Split Multi-Day Events**: Display [multi-day events on every day they cover](/features/multi-day-events#split-multi-day-events)
- 🧠 **Enhanced Compact Mode Controls**: More precise control over [what appears in compact vs expanded mode](/features/core-settings#compact-mode-event-limits)

## v2.3

- ⏳ **Countdown Display**: [Show how much time remains](/features/event-content#countdown-display) until an event starts with `show_countdown`
- 🌅 **Weekend Day Styling**: [Style weekend days](/features/event-content#weekend-day-styling) differently with dedicated color options
- 📆 **Relative Date Offsets**: Define a [floating start date](/features/start-date-offset#dynamic-start-date-with-relative-offsets) relative to the current day instead of a fixed date
- 🔤 **Automatic Hyphenation**: Long compound words wrap more elegantly, especially in German
- 🐛 **Blank Cards After Updates**: Version-aware cache keys stop incompatible cached data from blanking the card after a HACS update

## v2.2

- ⚙️ **Advanced Event Filtering**: Include or exclude specific events with [`blocklist` and `allowlist` patterns](/features/core-settings#filtering-by-event-name) per entity
- 🔄 **Filter Duplicate Events**: [Remove redundant events](/features/core-settings#filtering-duplicate-events) that appear in multiple calendars
- 🌍 **Smart Country Filtering**: Precise control over [country name display in locations](/features/event-content#time-location-information)
- 🏷️ **Enhanced Calendar Labels**: Beyond emojis and text, labels can now use [Material Design icons and custom images](/features/core-settings#entity-configuration)
- 🎨 **Customizable Empty Day Styling**: Control how [empty days appear](/features/event-content#calendar-events-display) with `empty_day_color`

## v2.1

- 📅 **Week Numbers & Visual Separators**: Better visual organization with [week number pills and customizable separators](/features/layout-appearance#week-numbers-visual-separators)
- 📊 **Per-Calendar Event Limits**: Control how many events appear from [each calendar separately](/features/core-settings#entity-level-vs-global-event-limits)
- 📏 **Fixed Height Control**: Set an [exact card height](/features/layout-appearance#card-dimensions-scrolling) with improved scrolling behavior

## v2.0

- 🏗️ **Complete Rewrite**: A new rendering engine built on the standard `ha-card` structure, so [card-mod and custom themes](/features/theming#theming-card-mod) work exactly as they do on Home Assistant's built-in cards
- 🌈 **Custom Styling Per Calendar**: Add [accent colors and opaque backgrounds](/features/layout-appearance#visual-styling-colors) to create visual hierarchy
- 🏷️ **Calendar Labels**: Add [emoji or text identifiers](/features/core-settings#entity-configuration) for each calendar source
- 🔧 **Advanced Display Controls**: [Per-calendar time and location settings](/features/event-content#time-location-information)
- 📆 **Custom Start Date**: View calendars from [any date](/features/start-date-offset#start-date-configuration), not just today
- 📱 **Maximum Height with Scrolling**: Set a [maximum card size](/features/layout-appearance#card-dimensions-scrolling) with scrollable content
- ⚠️ **Breaking Changes**: `row_spacing` → `day_spacing`, and `time_location_icon_size` split into `time_icon_size` and `location_icon_size`

## v1.2

- 🌍 **Multi-Language Support**: Grew from 2 languages to 24 over this release line, driven almost entirely by community contributions
- 📅 **Language-Aware Date Formats**: Dates follow each language's convention — `17. Mar` in German, `Mar 17` in English, `17 Mar` in most others
- 🐛 **Event Limits Fixed**: `max_events_to_show` now limits individual events across all days rather than dropping whole days
- 🐛 **12-Hour Format on Multi-Day Events**: `time_24h: false` is now honoured by multi-day events too

## v1.1

- 🌐 **Automatic Language Detection**: The card follows your Home Assistant system language, falling back to English — no `language` option required
- 🗓️ **Ongoing Multi-Day Events**: Events that started before today now appear on every day they are active, with "Ends Today" and "Ends Tomorrow" labels

## v1.0

- 🎉 **First Public Release**: A performance-focused calendar card for Home Assistant, designed along Material Design principles
- 📆 **Multi-Calendar Support**: Display several calendars in a single card, each with its own color
- 🔄 **Compact & Expandable Views**: Toggle between a space-efficient summary and the full list
- ⚡ **Built for Performance**: Smart caching, progressive rendering, and minimal API calls from the very first release
- 🐛 **All-Day Events West of UTC**: All-day events displayed on the wrong day for users in western timezones
