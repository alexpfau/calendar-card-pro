# What's New

**➡️ View the [Full Release Notes](/RELEASE_NOTES) for a complete list of features.**

## Latest Release: v3.5

- 🫥 **Empty State Control**: [Remove the card entirely](/features/event-content#calendar-events-display) when there are no upcoming events, or replace "No upcoming events" with [your own wording](/features/event-content#custom-empty-day-text)
- 📅 **Flexible Start Dates**: [Anchor the view to the week or a weekday](/features/start-date-offset#start-date-configuration) with `start_of_week`, `saturday`, and composable offsets like `start_of_week+7`
- 🏷️ **Templated Titles**: Render the card title from a [Home Assistant template](/features/title-templates), updating live from sensors or the current date
- 🔎 **Suggested in the Card Picker**: Home Assistant 2026.6+ offers the card under **Community** when you [add a card by entity](/guide/usage#adding-the-card-to-your-dashboard) and pick a calendar
- 🐛 **Card Title Sizing**: Titles rendered as plain body text after Home Assistant dropped the Polymer font variables; they are back at their intended size and weight
- 🐛 **Failed Calendars No Longer Look Empty**: An unreachable calendar now shows an error instead of claiming there are no events — which could silently hide the card

## v3.4

- ⏳ **All-Day Countdown Control**: Hide countdowns on all-day events while keeping them on timed ones with [`show_countdown_allday`](/features/event-content#countdown-display)
- 🌤️ **Weather Across the Full Range**: Timed events beyond Home Assistant's hourly forecast horizon now [fall back to the daily forecast](/features/weather#weather-configuration-options) instead of showing nothing
- 🐛 **All-Day Countdowns Off By One**: Now measured in whole calendar days instead of from the current instant
- ⚡ **Faster Rendering**: Color resolution is cached, removing hundreds of forced layouts per refresh on large calendars

## v3.3

- 🌍 **Two New Languages**: British English and Latvian (35 total), with editor translations for Italian, British English, and Latvian (11 total)
- 🐛 **HA 2026.5+ Visual Editor**: Restored the text input fields, which vanished entirely after Home Assistant removed `ha-textfield`
- 🐛 **`event_color` Fix**: No longer ignored when no per-entity color is configured

## v3.2

- 📝 **Event Description Display**: Show event descriptions with [configurable line clamping](/features/event-content#event-description-display), HTML stripping, and full styling control
- 🌤️ **UV Index in Weather**: Display [UV index in weather forecasts](/features/weather#weather-configuration-options) with configurable visibility threshold
- ↔️ **RTL Support**: Full right-to-left support for event borders and accent lines
- 🔄 **Improved Loading UX**: Events stay visible during refresh; subtle spinner replaces full-screen loading
- 🌍 **Three New Languages**: Estonian, Lithuanian, and Turkish (33 at the time), with editor translations for Polish, Estonian, and Lithuanian
- 🐛 **HA 2026.3+ Compatibility**: Migrated editor dropdowns to the new WebAwesome API

## v3.1

- 🌍 **Four New Translations**: Bulgarian interface, plus Norwegian Bokmål, German, and Swedish editor translations
- 🎨 **Tomorrow CSS Class**: New `tomorrow` HTML class for card-mod styling of tomorrow's events
- 🐛 **Grid Layout Fix**: Resolved card overflow when `grid_options.rows` is set

## v3.0

- ⚙️ **Visual Configuration Editor**: New visual editor for easy, guided configuration, with smart validation and auto-upgrade of deprecated settings
- 🌦️ **Weather Integration**: Display [weather forecasts](/features/weather) alongside your events
- 🕒 **Improved Time Format Detection**: Automatically detects and respects all Home Assistant time format settings (12h, 24h, language-based, and system-based)
- ⚠️ **Breaking Changes**: Parameter renames: `vertical_line_color` → `accent_color`, `max_events_to_show` → `compact_events_to_show`, `horizontal_line_width` → `day_separator_width`, `horizontal_line_color` → `day_separator_color`

_Older releases are covered in the [Full Release Notes](/RELEASE_NOTES)._

<div style="background-color: rgba(3, 169, 244, 0.1); padding: 12px; margin: 20px 0;">
  <h4 style="margin: 0; display: inline;">
    ⬇️ <a href="#5️⃣-features--configuration">View Complete Features Documentation</a>
  </h4>
</div>
