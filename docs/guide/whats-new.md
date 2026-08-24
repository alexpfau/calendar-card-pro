# What's New

**➡️ View the [Full Release Notes](/RELEASE_NOTES) for a complete list of features.**

Each entry below covers a whole minor release line — the `X.Y.0` release plus every
patch that followed it — so this page reads as the card's progression from the first
public release in January 2025 to today.

## Latest Release: v4.1

- 🎨 **Follow Home Assistant's Calendar Colors and Icons**: Set `accent_color` to `home-assistant` and each calendar takes [the color Home Assistant already holds for it](/features/core-settings), so it looks the same on every card — whether you picked that color by hand or Google Calendar imported it. Set a calendar's `label` the same way and it takes [that calendar's own icon](/features/core-settings#following-the-icon-from-home-assistant) too, so changing it in Home Assistant changes it here
- 🧑 **A Person's Photo in Front of Their Calendar**: Set a calendar's `label` to a person entity ID and the card shows [that person's picture](/features/core-settings#showing-a-persons-picture) — four faces instead of four words on a household dashboard, with a person picker in the editor and nothing to look up. Replace the photo in Home Assistant and the card follows it
- 🗂️ **Split One Calendar by Event Type**: [`event_type`](/features/core-settings) takes `all`, `timed` or `all_day`, card-wide or per calendar — list one calendar twice, once each way, for a color on each, and [**Duplicate** in the editor](/features/editor#per-calendar-panels-actions) builds it for you
- ⚙️ **Clearer Editor Layout**: The panels deciding what the card shows now group their settings under sub-headings, and both order them the same way
- 🗑️ **All-Day Events That Clear During the Day**: [`allday_expires_at`](/features/core-settings#retiring-all-day-events-during-the-day) moves the moment one calendar's all-day events count as past earlier into the final day, so a bin emptied this morning stops sitting on the card until midnight
- 🐛 **Finished All-Day Events Stayed on the Card**: with past events hidden, an all-day event that had already ended kept its row on any card whose window reached backwards, while timed events beside it were correctly gone
- 📅 **A Calendar on Weekdays Only**: [`days_of_week`](/features/core-settings#showing-a-calendar-on-weekdays-only) takes `weekdays` or `weekends` for a single calendar, judged on the day each row lands on, while every other calendar keeps its weekend
- 🎂 **Ages on Birthdays, Counts on Anniversaries**: Write `YEAR=1976` in a birthday event's description and the card appends the age to the title — [nothing to configure](/features/event-content#birthday-ages-anniversary-counts), and it stays right every year, because each occurrence of a repeating birthday already carries its own date
- 💬 **Teams Meetings Get the Teams Icon**: online meetings show [the Teams logo in place of the map pin](/features/event-content#the-location-icon) automatically, in any language Teams writes them in, and the new per-calendar `location_icon` names a different icon for any calendar — including back to the plain marker
- 🔍 **Filter on the Location or Description**: [`filter_field`](/features/core-settings#matching-the-location-or-description-instead) points `blocklist` and `allowlist` at an event's location or description instead of its title, so a Zoom URL in a location field can finally be filtered on
- ✏️ **Rewrite What an Event Says**: [`replace_pattern`, `replace_with` and `replace_field`](/features/core-settings#text-replacement) rewrite one field of a calendar's events as the card draws them, leaving the calendar untouched — strip a `Birthday of ` prefix off every birthday, or show `Busy` in place of every title on a shared family card

## v4.0

- 🗓️ **Column View**: Lay the days [side by side, one column each](/features/column-view), instead of stacking them — the same agenda, rotated, with its own per-view overrides and a responsive fallback to the list layout
- ⚙️ **Rebuilt Visual Editor**: Nine panels built on Home Assistant's own form components, with a [search box that finds any setting by name or YAML key](/features/editor#search-customized-only), a customized-only filter, per-calendar settings, and [per-view exceptions](/features/editor#column-view-exceptions)
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
