# Calendar Card Pro v3.1.0

**Enhanced internationalization and improved customization.** This release significantly expands language support for the visual configuration editor while adding powerful new customization options and fixing important display issues.

## 🎉 New Features

### 🌐 Expanded Editor Language Support

Calendar Card Pro's visual configuration editor now supports three additional languages, making configuration accessible to even more users:

- **Norwegian Bokmål Editor Translation** - Complete translation for the visual configuration editor interface (Thanks @mathiasbk, #235)
- **German Editor Translation** - Complete translation for the visual configuration editor interface (Thanks @NetSecond, #237)
- **Swedish Editor Translation** - Complete translation for the visual configuration editor interface (Thanks @JonasHedberg, #238)

The visual editor now supports 5 languages total: English, Slovak, Norwegian, German, and Swedish.

### 🆕 New Language Addition

- **Bulgarian Language Support** - Added complete Bulgarian translation for the calendar card interface, bringing the total number of supported languages to **30**! (Thanks @kyutov, #246)

### 🎨 Enhanced Styling Capabilities

- **Tomorrow CSS Class** - Added new HTML `tomorrow` CSS class to tomorrow's events, enabling users to use card-mod to apply specific styling to tomorrow's events that's distinct from other future events. See the ReadMe for an example. (Thanks @Squazel, #249)

## 🐛 Bug Fixes

### Weather Display Improvements

- **Zero Temperature Display Fix** - Fixed an issue where minimum temperature values of exactly 0° would not be displayed in the date column when `show_low_temp: true` was configured. The condition now properly handles zero values by checking for `undefined` instead of using truthy evaluation. (Thanks @DaveOzzie, #252)

### Layout and Container Issues

- **Grid Container Overflow Fix** - Resolved an issue where the calendar card would exceed its container boundaries and overlay other sections when `grid_options.rows` was configured. The card now properly respects container boundaries in all grid configurations. (Thanks @Deltids, #233)

## Related Issues

- [#235](https://github.com/alexpfau/calendar-card-pro/pull/235) - Added editor values to Norwegian bokmål language by @mathiasbk
- [#237](https://github.com/alexpfau/calendar-card-pro/pull/237) - Update de.json (complete) by @NetSecond
- [#238](https://github.com/alexpfau/calendar-card-pro/pull/238) - Swedish Translation by @JonasHedberg
- [#246](https://github.com/alexpfau/calendar-card-pro/pull/246) - Add support for Bulgarian language by @kyutov
- [#248](https://github.com/alexpfau/calendar-card-pro/issues/248) - [Feature]: Include HTML class to indicate "tomorrow" by @Squazel
- [#249](https://github.com/alexpfau/calendar-card-pro/pull/249) - feat(tomorrow): Added new HTML class 'tomorrow' by @Squazel
- [#252](https://github.com/alexpfau/calendar-card-pro/issues/252) - [Bug]: Weather minimum temperature not displayed if it's zero degrees by @DaveOzzie
- [#233](https://github.com/alexpfau/calendar-card-pro/issues/233) - [Bug]: Calendar card exceeds container when grid_options.rows is set by @Deltids

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v3.0.6...v3.1.0

---

# Calendar Card Pro v3.0.6

## 🎉 New Features

- **Slovak Editor Translation** - Added complete Slovak translation for the visual configuration editor, making Slovak the second fully supported editor language after English. (Thanks @jose1711, #230)

## 🐛 Bug Fixes

- **Event Background Color Fix** - Fixed an issue where the event background color did not correctly use the global `accent_color` setting when no entity-specific `accent_color` was defined. The event background now properly matches the global accent color setting.
- **Slovak Translation Typo Fix** - Fixed a small typo in the Slovak translation for the calendar card interface. (Thanks @jose1711, #230)

## Related Issues

- [#230](https://github.com/alexpfau/calendar-card-pro/pull/230) - Update Slovak translation by @jose1711
- [#232](https://github.com/alexpfau/calendar-card-pro/pull/232) - Update FUNDING.yml by @benjamin-dcs

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v3.0.5...v3.0.6

---

# Calendar Card Pro v3.0.5

## 🐛 Bug Fixes

- **Allowlist/Blocklist Filtering Fix** - Fixed incorrect behavior when using multiple configurations for the same calendar entity with different allowlist/blocklist filters. Each entity configuration is now processed independently, correctly applying filters and event limits.
- **Empty Space Removal** - Resolved an issue causing excessive empty space when `compact_events_to_show` was set only at the entity level without a global limit. Days without visible events are now properly filtered out, eliminating unnecessary empty space.
- **Ukrainian Translation Fix** - Corrected incorrect Ukrainian translations for calendar elements.

## Related Issues

- [#228](https://github.com/alexpfau/calendar-card-pro/issues/228) - Calendar event filtering applies incorrectly to multiple instances of the same calendar entity by @Zerosignal84
- [#223](https://github.com/alexpfau/calendar-card-pro/issues/223) - Incorrect Ukrainian translation by @merlin-zaraza
- [#224](https://github.com/alexpfau/calendar-card-pro/pull/224) - Fix Ukrainian translation by @merlin-zaraza

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v3.0.4...v3.0.5

---

# Calendar Card Pro v3.0.4

## 🐛 Bug Fixes

- **Fixed accent color backgrounds** - Resolved an issue where event background colors wouldn't display properly when using named colors like "blue" in the accent_color setting (RGB and hex values were unaffected)

## Related Issues

- [#219](https://github.com/alexpfau/calendar-card-pro/issues/219) - Shaded Accent Backgrounds fail after 3.0.x by @dml105

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v3.0.3...v3.0.4# Calendar Card Pro v3.0.4

## 🐛 Bug Fixes

- **Fixed accent color backgrounds** - Resolved an issue where event background colors wouldn't display properly when using named colors like "blue" in the accent_color setting (RGB and hex values were unaffected)

## Related Issues

- [#219](https://github.com/alexpfau/calendar-card-pro/issues/219) - Shaded Accent Backgrounds fail after 3.0.x by @dml105

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v3.0.3...v3.0.4

---

# Calendar Card Pro v3.0.3

**Editor functionality and documentation fixes.** This release addresses issues with the visual editor and clarifies documentation for filtering options.

## 🐛 Bug Fixes

- **Fixed entity picker selection in editor** - Resolved an issue where in rare cases calendar and weather entity selections wouldn't register in the dropdown, preventing users from selecting or changing weather entities through the UI
- **Clarified blocklist/allowlist documentation** - Updated field descriptions to correctly specify pipe separator (|) rather than commas, matching the actual implementation

## Related Issues

- [#214](https://github.com/alexpfau/calendar-card-pro/issues/214) - Entity picker selection doesn't register in editor by @mhoogenbosch and @dives11
- [#216](https://github.com/alexpfau/calendar-card-pro/issues/216) - Incorrect blocklist/allowlist format documentation by @Kuddelsoft

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v3.0.2...v3.0.3

---

# Calendar Card Pro v3.0.2

**Configuration and editor bugfixes.** This release addresses issues with configuration handling discovered after the v3.0.0 release.

## 🐛 Bug Fixes

- **Fixed configuration filtering for weather settings** - Resolved UI synchronization issues by preserving the complete weather configuration structure even when values match defaults, preventing toggle switches and selectors from becoming out of sync
- **Fixed all-day event weather display** - Ensured daily weather forecasts are properly fetched and displayed for all-day events when weather position is set to "event"

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v3.0.1...v3.0.2

---

# Calendar Card Pro v3.0.1

**Configuration and editor bugfixes.** This release addresses issues with configuration handling discovered after the v3.0.0 release.

## 🐛 Bug Fixes

- **Fixed configuration bloat** by properly handling default values and empty strings
- **Fixed week numbers unexpectedly showing** when they shouldn't be enabled
- **Fixed UI-only fields** being incorrectly saved to user configurations
- **Improved code documentation** for special cases in the editor

## Related Issues

- [#209](https://github.com/alexpfau/calendar-card-pro/issues/209) - Week separator requires week number by @LiquidPT

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v3.0.0...v3.0.1

---

# Calendar Card Pro v3.0.0

**Visual configuration meets weather integration.** This major release transforms how you interact with and view calendar information, combining intuitive visual configuration with powerful weather forecasts—making your calendar both easier to set up and more contextually informative than ever before.

## 🎉 New Features

### ⚙️ Visual Configuration Editor

Calendar Card Pro now includes a comprehensive visual editor that makes configuration simple and intuitive! This highly-requested feature provides a rich, guided interface for customizing every aspect of your calendar card.

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_editor.png" alt="Visual Configuration Editor" width="600"><br>

- **Native Home Assistant Design** - Built with the same UI components as Home Assistant for perfect visual integration and consistent theming
- **Smart, Context-Aware Interface** - Options only appear when relevant, reducing clutter and simplifying configuration
- **Organized Configuration Sections** - Settings are grouped into logical, collapsible panels for easy navigation
- **Automatic Config Upgrader** - ✨ Detects deprecated settings and updates your configuration with one click
- **Specialized Input Helpers** - Advanced pickers for entities, icons, colors and other complex options
- **Mobile-Friendly Design** - Fully responsive interface that works on any device

> **Upgrading from previous versions?** When you first open the editor after updating, any deprecated parameters in your configuration will be automatically detected. Simply click the "Update config..." button that appears to instantly migrate to the latest parameter names!

> **Note:** The visual configuration editor is currently only available in English. The configured calendar card will still display in your selected language, but the editor interface itself is English-only at this time.

<details>
<summary>Editor Feature Details</summary>

- **Logical Organization** - Edit configuration in intuitive sections including Calendar Entities, Core Settings, Appearance & Layout, Date Display, Event Display, Weather Integration, and Interactions
- **Dynamic Fields** - Options for styling and advanced features only appear when their parent features are enabled
- **Smart Validation** - Type-specific input fields with validation ensure your configuration is always correct
- **Visual Helpers** - Specialized selectors for today indicators, calendar labels, and other visual elements
- **Enhanced Accessibility** - Inclusive design principles ensure the editor is usable by everyone
</details>

### 🌦️ Weather Integration

Calendar Card Pro now supports displaying weather forecasts directly alongside your calendar events! This powerful new integration allows you to see the expected weather conditions for each day or for specific events.

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_weather.png" alt="Weather Integration" width="600"><br>

- **Dual Display Positions**: Show weather in the date column, event column, or both
- **Customizable Information**: Choose what weather data to display independently for each position
- **Per-Position Styling**: Control the appearance and content of weather data independently in each position
- **Automatic Forecast Matching**: Weather data automatically matches the correct day or event time
- **Home Assistant Integration**: Uses your existing weather entities and requires no additional setup

> **Pro Tip:** The new visual editor makes configuring weather integration simple! Just select your weather entity and customize display options through the intuitive Weather Integration panel.

<details>
<summary>Manual YAML Configuration Details</summary>

```yaml
type: custom:calendar-card-pro
# Basic weather configuration
weather:
  entity: weather.your_weather_entity
  position: date # Options: 'date', 'event', or 'both'
  date:
    show_conditions: true
    show_high_temp: true
    show_low_temp: false
  event:
    show_conditions: true
    show_temp: true
```

For full parameter documentation including styling options, see our [GitHub README](https://github.com/alexpfau/calendar-card-pro/blob/main/README.md#weather-integration).

</details>

### 🕒 Improved Time Format Detection

Calendar Card Pro now correctly integrates with all Home Assistant time format settings:

- **Complete HA Integration** - Properly detects and respects all four Home Assistant time format options: 12-hour, 24-hour, language-based, and system-based settings
- **Smart Language Detection** - When HA is set to use language-based time format, the card intelligently determines the appropriate format based on the language
- **System Settings Support** - Properly detects system/browser time format preferences when HA is configured to use them
- **Override Capability** - Still allows explicit time format configuration via the card's `time_24h` setting, independent of Home Assistant settings

### New Languages

Extended language support to further regions, so that 29 languages are now supported:

- **Croatian Language** - Added complete Croatian translations for all calendar elements

### Parameter Updates

The following parameters have been renamed or removed in v3.0.0 (the editor will automatically detect and update these for you):

- `max_events_to_show` → `compact_events_to_show` (both global and entity-level)
- `vertical_line_color` → `accent_color`
- `horizontal_line_width` → `day_separator_width`
- `horizontal_line_color` → `day_separator_color`

## 🐛 Bug Fixes

### Today Indicator Emoji Detection

- **Improved Emoji Support** – Today indicator now reliably detects and displays all emoji characters, including complex and multi-codepoint emojis, by using Unicode property escapes for robust emoji detection.

### Entity-level Settings Consistency

- **Fixed Entity-level Location Display** - Entity-specific `show_location: true` now correctly overrides the global `show_location: false` setting, ensuring consistent behavior with other entity-level settings like `show_time`.

## Related Issues

This release addresses community-reported issues:

- [#107](https://github.com/alexpfau/calendar-card-pro/issues/107) - Weather Forecast Integration by @rothomas
- [#196](https://github.com/alexpfau/calendar-card-pro/issues/196) - Auto-detect 12/24h time format from HA by @tomofdarkness
- [#199](https://github.com/alexpfau/calendar-card-pro/pull/199) - Added Croatian language translation by @adamivangrgic

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v2.4.5...v3.0.0

---

# Calendar Card Pro v2.4.5

**Consistent calendar display in all scenarios.** This release fixes an important bug affecting the display of empty days when an API call returns no events.

## 🐛 Bug Fixes

### Completely Consistent Empty Days Display

- **Unified Empty Days Logic** - Removed separate rendering paths for different empty day scenarios, ensuring consistent behavior in all cases
- **Fixed Show Empty Days Setting** - Corrected the handling of `show_empty_days: true` when the calendar API returns zero events
- **Proper Days To Show Respect** - The card now correctly honors the `days_to_show` setting even when there are no calendar events
- **Single Code Path** - Simplified the code by using a single, unified approach to empty days generation in all scenarios

## 📖 Documentation Improvements

### New Card-Mod Examples

- **Time Next to Event Title** - Added documentation for displaying time in the same row as event titles using card-mod, keeping location on its own row below:

```yaml
card_mod:
  style: |
    div.event-content {
      display: grid;
      grid-template-areas: 
        "title time"
        "location location";
      grid-template-columns: 1fr auto;
      column-gap: 10px;
      row-gap: 0px;
    }

    div.summary {
      grid-area: title;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    div.time {
      grid-area: time;
      white-space: nowrap;
    }

    div.location {
      grid-area: location;
      white-space: normal;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    div.time-location {
      display: contents;
    }
```

## Related Issues

This release addresses community-reported issues:

- [#37](https://github.com/alexpfau/calendar-card-pro/issues/37) - Added documentation for showing time in the same row as event titles using card-mod

## How Has This Been Tested

Testing has been conducted across:

- Empty calendar scenarios where API returns zero events
- Multiple `days_to_show` values (2, 3, 5, 7)
- Both `show_empty_days: true` and `show_empty_days: false` settings
- Different combinations of compact and expanded modes
- Various calendar entity configurations
- Card-mod customization examples

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v2.4.4...v2.4.5

---

# Calendar Card Pro v2.4.4

**More consistent empty days behavior.** This release fixes an important bug affecting the display of empty days, ensuring the calendar shows exactly what you expect in all configurations.

## 🐛 Bug Fixes

### Improved Empty Days Display

- **Fixed Empty Days Behavior** - Resolved an issue where empty days weren't consistently displayed when `show_empty_days: true` was configured, particularly at the end of the date range
- **Proper Mode Handling** - Fixed how empty days interact with compact mode settings, correctly handling both `compact_days_to_show` and `compact_events_to_show` parameters
- **Edge Case Support** - Better handling of date ranges with sparse events, ensuring consistent behavior regardless of event distribution
- **Parameter Validation** - Ensures `compact_days_to_show` never exceeds `days_to_show` to prevent showing empty days beyond the API fetch range

## Related Issues

This release addresses a community-reported issue:

- [#189](https://github.com/alexpfau/calendar-card-pro/issues/189) - Fixed bug where empty days weren't shown at the end of the date range when `show_empty_days: true` was configured

## How Has This Been Tested

Testing has been conducted across:

- Multiple calendar configurations with various `days_to_show` ranges
- Scenarios with events in different distribution patterns (beginning, middle, or end of range)
- Different combinations of compact mode parameters
- Various empty days settings
- Configurations where `compact_days_to_show` is greater than `days_to_show`

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v2.4.3...v2.4.4

---

# Calendar Card Pro v2.4.3

**Bug fixes for edge cases.** This release addresses several critical edge case bugs around the display of week separators and empty days, ensuring the calendar always behaves predictably in all configurations.

## 🐛 Bug Fixes

### Fixed Week Separator Display

- **Week/Month Separator Precedence** - Corrected a bug where week separators weren't displaying when month boundaries coincided with week boundaries and the `month_separator_width` was set to '0px'
- **Proper Visual Hierarchy** - Week separators now appear correctly when they should take precedence over invisible month separators

### Improved Empty Days Handling

- **Fixed Days_to_Show Behavior** - Resolved an issue where the calendar would incorrectly skip empty days and show events from future days instead of properly displaying "No events" messages
- **Consistent Empty State Display** - Empty state message now consistently shows when there are no events within the configured time range

## Related Issues

This release addresses community-reported issues:

- [#160](https://github.com/alexpfau/calendar-card-pro/issues/160) - Fixed bug where the calendar would show future days' events instead of properly respecting the `days_to_show` parameter
- [#175](https://github.com/alexpfau/calendar-card-pro/issues/175) - Fixed week separators not showing when they coincide with month boundaries

## How Has This Been Tested

Testing has been conducted across:

- Multiple calendar configurations with various `days_to_show` and `start_date` settings
- Scenarios with only past events today but events tomorrow
- Calendars with month/week boundaries falling on the same day
- Various combinations of separator width settings

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v2.4.2...v2.4.3

---

# Calendar Card Pro v2.4.2

**More accessible and more reliable.** This release brings important bug fixes and language enhancements to provide a more robust and internationally accessible calendar experience.

→→→ Please see the [🆕 What's New](https://github.com/alexpfau/calendar-card-pro#2%EF%B8%8F⃣-whats-new) section in the README for an overview of v2.4 features with links to their detailed documentation. ←←←

## 🎉 New Features

### New Languages

Extended language support to further regions, so that 28 languages are now supported:

- **Catalan Language** - Added complete Catalan translations for all calendar elements
- **Romanian Language** - Added complete Romanian translations for all calendar elements

## 🐛 Bug Fixes

### Translation Enhancements

Fixed issue with translations in date column not respecting HA system language.

### Event Display Corrections

Fixed visual bugs that affected event display:

- **Today's All-Day Event Display** - Corrected a bug where today's all-day events were incorrectly shown grayed out as if they were past events
- **Week Separator Consistency** - Ensured week separators are consistently displayed for all weeks, even when events are missing on Sunday and Monday

### Documentation Updates

- **Configuration Variables Table** - Fixed table formatting in ReadMe Configuration Variables section
- **Consistent Parameter Naming** - Updated documentation with consistent parameter naming throughout
- **Enhanced Card_mod Examples** - Improved card_mod examples for transparent backgrounds
- **Contribution Instructions** - Updated contribution guidelines to include additional files

## Related Issues

This release addresses several community-reported issues:

- [#169](https://github.com/alexpfau/calendar-card-pro/issues/169) - Fixed translation issues in date column (reported by @medapayne)
- [#174](https://github.com/alexpfau/calendar-card-pro/issues/174) - Fixed today's all-day events incorrectly appearing grayed out (reported by @jonicunha)
- [#175](https://github.com/alexpfau/calendar-card-pro/issues/175) - Fixed inconsistent display of week separators (reported by @LiquidPT)
- [#180](https://github.com/alexpfau/calendar-card-pro/issues/180) - Improved card_mod examples for transparent backgrounds (reported by @Victorsoeby)
- [#168](https://github.com/alexpfau/calendar-card-pro/pull/168) - Fixed Configuration Variables table formatting (contributed by @forsethc)
- [#178](https://github.com/alexpfau/calendar-card-pro/issues/178) - Added Romanian language support (contributed by @chr02ha)
- [#181](https://github.com/alexpfau/calendar-card-pro/issues/181) - Added Catalan language support (contributed by @rserentill)

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v2.4.1...v2.4.2

Thank you to everyone who contributed feature requests and bug reports that made this release possible!

---

# Calendar Card Pro v2.4.1

**Edge case handling and visual refinement.** This update addresses two specific user-reported issues to ensure your calendar card displays correctly in all scenarios.

→→→ All bug fixes are fully compatible with existing configurations, requiring no changes to your cards. ←←←

## 🐛 Bug Fixes

### Fixed Empty Day Display Issue

Resolved a bug where days with no events were being skipped if:

- A specific `start_date` was configured
- That date had no events
- The following day contained at least one event

Now the calendar correctly shows "No upcoming events" for the configured start date, rather than skipping ahead to the next day with events.

### Improved Scrollbar Behavior

Enhanced the scrollbar handling to:

- Show vertical scrollbars only when hovering and content exceeds the container height
- Never show horizontal scrollbars regardless of content width
- Maintain consistent behavior across all major browsers (Chrome, Firefox, Safari, Edge)

## Related Issues

This release addresses the following user-reported issues:

- [#160](https://github.com/alexpfau/calendar-card-pro/issues/160) - Fixed bug where empty day was skipped when start_date is static and the following day has events
- [#162](https://github.com/alexpfau/calendar-card-pro/issues/162) - Fixed horizontal scrollbar appearing when hovering over calendar

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v2.4.0...v2.4.1

Thank you to everyone who contributed bug reports that made this release possible!

---

# Calendar Card Pro v2.4.0

**Visually intelligent and precisely configured.** This release brings visual highlights for the current day, progress tracking for running events, and enhanced compact mode controls - making Calendar Card Pro more visually informative and customizable than ever.

→→→ Please see the [🆕 What's New](https://github.com/alexpfau/calendar-card-pro#2%EF%B8%8F⃣-whats-new) section in the README for an overview of v2.4 features with links to their detailed documentation. ←←←

## 🎉 New Features

### Today Indicator

Visually highlight the current day in your calendar with customizable indicators:

```yaml
# Enable and choose indicator type
today_indicator: true     # Simple dot indicator
today_indicator: pulse    # Animated pulsing dot
today_indicator: glow     # Glowing dot effect
today_indicator: mdi:star # Custom Material Design icon
today_indicator: 🎯       # Emoji character
today_indicator: /local/custom-indicator.png # Custom image

# Position the indicator precisely
today_indicator_position: "15% 50%" # Left-center (default)
today_indicator_position: "85% 15%" # Top-right corner
```

- **Multiple Indicator Types** - Choose from dots, animations, icons, emojis, or custom images
- **Precise Positioning** - Control exact placement with CSS-like position syntax
- **Perfect Centering** - Transform-based alignment ensures proper centering
- **Theme Integration** - Indicator color follows your Home Assistant theme

### Today's Date Styling

Customize the appearance of today's date with dedicated color options:

```yaml
# Style today's date components individually
today_weekday_color: '#03a9f4' # Color for today's weekday name
today_day_color: '#03a9f4' # Color for today's day number
today_month_color: '#03a9f4' # Color for today's month name
```

- **Component-Level Control** - Independently style the weekday name, day number, and month
- **Smart Inheritance** - Undefined values automatically inherit from base or weekend styling
- **Priority System** - Today's styling takes precedence when today falls on a weekend
- **Enhanced Visual Cues** - Makes the current day immediately identifiable at a glance

### Progress Bars for Running Events

Show visual progress indicators for events that are currently in progress:

```yaml
# Enable progress bars for running events
show_progress_bar: true
progress_bar_color: '#03a9f4'
progress_bar_height: '10px'
progress_bar_width: '60px'
```

- **Real-time Updates** - Progress bars show the current completion percentage of events
- **Customizable Appearance** - Control color, height, and width to match your theme
- **Automatic Calculation** - Intelligently determines how much of the event has completed
- **Visual Timeline** - Quickly see how far along your current activities are

### Split Multi-Day Events

Display multi-day events on each day they cover for better visibility:

```yaml
# Show multi-day events on every day they cover
split_multiday_events: true

# Control splitting on a per-calendar basis
entities:
  - entity: calendar.personal
    split_multiday_events: true
  - entity: calendar.work
    split_multiday_events: false
```

- **Improved Conflict Detection** - Easily see when multi-day events overlap with other activities
- **Complete Daily View** - See all active events for any given day at a glance
- **Consistent Formatting** - Maintains proper time and styling information for each segment
- **Calendar-Specific Control** - Enable or disable splitting per calendar entity

### Enhanced Compact Mode Controls

Gain precise control over your compact calendar view:

```yaml
# Display fewer days in compact mode
compact_days_to_show: 2 # Show just 2 days in compact mode
days_to_show: 7 # Show full 7 days when expanded

# Limit events in compact mode
compact_events_to_show: 5 # Show only 5 events in compact mode

# Ensure complete days are shown
compact_events_complete_days: true # Never show partial days
```

- **Optimized Space Usage** - Show fewer days in compact mode while keeping more days available when expanded
- **Clearer Parameter Naming** - More intuitive configuration with `compact_events_to_show`
- **Complete Days Option** - Prevent confusion by showing all events from partially visible days
- **Backward Compatible** - Legacy `max_events_to_show` parameter still supported

## Related Issues

This release addresses the following feature requests and bug reports:

- [#100](https://github.com/alexpfau/calendar-card-pro/issues/100) - Show progress bar for running events (requested by @vichjiri)
- [#93](https://github.com/alexpfau/calendar-card-pro/issues/93) - Limit to number of days instead of events (requested by @mr-light-show)
- [#81](https://github.com/alexpfau/calendar-card-pro/issues/81) - Soft events limit (requested by @noxhirsch)
- [#140](https://github.com/alexpfau/calendar-card-pro/issues/140) - Show "Today" for events on the current day (requested by @martinsheldon)

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v2.3.1...v2.4.0

Thank you to everyone who contributed feature requests and bug reports that made this release possible!

---

# Calendar Card Pro v2.3.1

**Polish and refinement.** This minor update addresses a visual inconsistency with scrollbars and improves Slovak language support, ensuring your calendar cards look cleaner and function more smoothly.

→→→ All bug fixes and improvements are fully compatible with existing configurations, requiring no changes to your cards. ←←←

## 🐛 Bug Fixes

### Fixed Scrollbar Visibility Issue

Fixed an issue where scrollbars were always visible rather than appearing only when hovering.

### Improved Slovak Translation

Enhanced Slovak language support with more accurate translations.

## Related Issues

This release addresses the following issues:

- [#146](https://github.com/alexpfau/calendar-card-pro/issues/146) - Fixed scrollbar always showing instead of only on hover in both Chrome and Firefox (by @martinsheldon)
- [#147](https://github.com/alexpfau/calendar-card-pro/pull/147) - Improved Slovak translation (contributed by @jose1711)

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v2.3.0...v2.3.1

Thank you to everyone who contributed bug reports and translation improvements that made this release possible!

---

# Calendar Card Pro v2.3.0

**Time-aware and visually enhanced.** This release brings dynamic countdown displays, weekend styling, and flexible date ranges that adapt to your needs, making Calendar Card Pro more informative and visually distinct than ever before.

→→→ Please see the [🆕 What's New](https://github.com/alexpfau/calendar-card-pro#2%EF%B8%8F⃣-whats-new) section in the README for an overview of v2.3 features with links to their detailed documentation. ←←←

## 🎉 New Features

### Countdown Display

Show how much time remains until an event starts with the new `show_countdown` option:

```yaml
# Enable countdown display for upcoming events
show_countdown: true
```

- **Automatic Time Units** - Shows days remaining for future events, hours for same-day events
- **Multi-Language Support** - Countdown text automatically uses your configured language
- **Subtle Design** - Unobtrusive display that complements the existing time information
- **Enhanced Awareness** - Quickly see which events are coming up soon

### Weekend Day Styling

Make weekend days visually distinct with dedicated color options:

```yaml
# Style weekend days differently
weekend_weekday_color: '#E67C73' # Color for Sat/Sun weekday names
weekend_day_color: '#E67C73' # Color for weekend day numbers
weekend_month_color: '#E67C73' # Color for month names on weekends
```

- **Enhanced Visual Organization** - Weekend days stand out from weekdays
- **Complete Control** - Separately style weekday names, day numbers, and month names
- **Theme Integration** - Works with Home Assistant theme variables and custom colors
- **Improved Readability** - Easier to distinguish between work days and weekend days

### Dynamic Start Date with Relative Offsets

Define "floating" start dates relative to the current day:

```yaml
# Start date examples:
start_date: "today+7"  # Always show events starting 7 days from today
start_date: "+3"       # Shorthand for today+3
start_date: "today-2"  # Show events starting from 2 days ago
start_date: "-1"       # Shorthand for today-1 (yesterday)
```

- **Automatic Adjustment** - Date range automatically updates as days pass
- **Shorthand Notation** - Simplified syntax with + and - operators
- **Fixed or Dynamic** - Use absolute dates for fixed ranges or relative offsets for floating windows
- **Flexible Planning** - Perfect for showing "next two weeks" or "current week plus 3 days" views

### Automatic Hyphenation

Long words (especially compound words in languages like German) now wrap more elegantly with automatic hyphenation.

### Enhanced Cache Management

Improved caching mechanism by adding version-aware caching to automatically invalidate incompatible cache data after updates.

## 🐛 Bug Fixes

- **Fixed All-Day Event Sorting** - All-day events are now properly sorted by calendar entity order first, then alphabetically
- **Improved Multi-Day Event Handling** - Multi-day events that begin before a custom start date now display consistently
- **Cache Invalidation After Updates** - Prevents blank cards after HACS updates by adding version numbers to cache keys

## Related Issues

This release addresses the following feature requests and bug reports:

- [#67](https://github.com/alexpfau/calendar-card-pro/issues/67) - Days remaining countdown (requested by @jelmerwouters-topicus)
- [#76](https://github.com/alexpfau/calendar-card-pro/issues/76) - Time until the event countdown (requested by @pol409887)
- [#98](https://github.com/alexpfau/calendar-card-pro/issues/98) - Show weekends in different color (requested by @yornola)
- [#103](https://github.com/alexpfau/calendar-card-pro/issues/103) - End date customization (requested by @tkabt06)
- [#105](https://github.com/alexpfau/calendar-card-pro/issues/105) - Start days ahead option (requested by @pol409887)
- [#133](https://github.com/alexpfau/calendar-card-pro/issues/133) - Add hyphens:auto (requested by @sevorl)

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v2.2.1...v2.3.0

Thank you to everyone who contributed feature requests and bug reports that made this release possible!

---

# Calendar Card Pro v2.2.1

**Stability and polish.** This release focuses on fixing issues with advanced filtering techniques introduced in v2.2.0, enhancing event organization, and adding more language support while maintaining full compatibility with existing configurations.

→→→ All bug fixes and improvements are fully compatible with existing configurations, requiring no changes to your cards. ←←←

## 🎉 New Features

### Enhanced All-Day Event Organization

All-day events occurring on the same day are now automatically sorted alphabetically:

```yaml
# Events like these will now be sorted alphabetically:
# "1. Breakfast"
# "2. Lunch"
# "3. Dinner"
```

- **Improved Readability** - Events with similar importance now appear in predictable order
- **Perfect for Task Lists** - Ideal for meal plans, to-do lists, and other numbered items
- **Automatic Organization** - No configuration needed - just works

### Improved Time String Formatting

All event time strings now automatically have their first letter capitalized:

- **Consistent Typography** - Every time string begins with a capital letter
- **Enhanced Readability** - More professional appearance across all calendar events
- **Language-Aware** - Works correctly with all supported languages

### New Language Support

Added support for two new languages:

- **Thai** - Added complete Thai language support
- **Slovak** - Added complete Slovak language support

This brings the total to 26 supported languages in Calendar Card Pro!

## 🐛 Bug Fixes

### Fixed Advanced Filtering Issues

Fixed a critical issue with the advanced filtering features introduced in v2.2.0:

```yaml
entities:
  - entity: calendar.family
    allowlist: 'shopping|grocery'
    label: '🛒'
    accent_color: '#1e88e5'
  - entity: calendar.family
    allowlist: 'birthday|anniversary'
    label: '🎉'
    accent_color: '#e91e63'
```

- **Proper Style Application** - Fixed styles and labels not being correctly applied when filtering the same calendar entity multiple times
- **Configuration Persistence** - The card now properly maintains entity configuration throughout the event processing pipeline
- **Styling Consistency** - Each filtered event now correctly receives its intended styling, labels and accent colors

### Improved Past Events Visibility

Fixed dimming effects for past events when show_past_events is enabled:

```yaml
show_past_events: true
```

- **Visual Distinction** - Past events now properly display with 60% opacity for better visual hierarchy
- **Consistent Styling** - Applied to all parts of the event (title, time, and location)
- **Restored Functionality** - Brings back the visual dimming that was present in previous versions

## Related Issues

This release addresses the following issues:

- [#125](https://github.com/alexpfau/calendar-card-pro/issues/125) - Fixed filtering and styling for multiple entity configurations of the same calendar (reported by @dg9bew)
- [#129](https://github.com/alexpfau/calendar-card-pro/issues/129) - Fixed past events not being dimmed when show_past_events is enabled (reported by @andyblac)
- [#119](https://github.com/alexpfau/calendar-card-pro/issues/119) - Added alphabetical sorting for all-day events that occur on the same day (requested by @joos81)
- [#121](https://github.com/alexpfau/calendar-card-pro/issues/121) - Capitalized first letter of event time strings (suggested by @PrinterElf)
- [#122](https://github.com/alexpfau/calendar-card-pro/issues/122), [#123](https://github.com/alexpfau/calendar-card-pro/issues/123) - Added Thai language support (contributed by @Aekung)
- [#127](https://github.com/alexpfau/calendar-card-pro/issues/127), [#128](https://github.com/alexpfau/calendar-card-pro/issues/128) - Added Slovak language support (contributed by @delneto)

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v2.2.0...v2.2.1

Thank you to everyone who contributed bug reports, feature requests, translations, and suggestions that made this release possible!

---

# Calendar Card Pro v2.2.0

**Calendar filtering and customization, redefined.** This release focuses on giving you precise control over which events appear on your dashboard and how they're displayed, with powerful filtering capabilities and enhanced visual options.

→→→ Please see the [🆕 What's New](#2️⃣-whats-new) section in the README for an overview of v2.2 features with links to their detailed documentation. ←←←

## 🎉 New Features

### Advanced Event Filtering

Calendar Card Pro now provides powerful filtering capabilities with regex-based `blocklist` and `allowlist` patterns for each calendar entity:

```yaml
# Exclude specific events by pattern:
entities:
  - entity: calendar.work
    blocklist: "Private|Conference" # Hide private meetings and conferences

# Only show specific events:
entities:
  - entity: calendar.family
    allowlist: "Birthday|Anniversary" # Only show birthdays and anniversaries
```

- **Per-Entity Filtering** - Each calendar can have its own filter rules
- **Regular Expression Support** - Use pattern matching for flexible event filtering
- **Precise Control** - Include or exclude events based on title text patterns
- **Priority System** - When both filters are specified, allowlist takes precedence

### Filter Duplicate Events

Automatically detect and remove redundant events that appear in multiple calendars:

```yaml
entities:
  - calendar.personal # Events from this calendar are prioritized
  - calendar.family # Duplicates from this calendar will be hidden
filter_duplicates: true
```

- **Smart Prioritization** - When duplicates are found, keeps events from calendars listed first
- **Complete Matching** - Compares event title, times, and location for accurate detection
- **Better Organization** - Creates a cleaner view when subscribing to multiple calendars with overlapping events

### Enhanced Calendar Labels

Calendar labels now support multiple formats for better visual customization:

```yaml
entities:
  - entity: calendar.work
    label: '💻' # Original emoji style
  - entity: calendar.family
    label: 'mdi:account-group' # Material Design Icon
  - entity: calendar.vacation
    label: '/local/icons/beach.png' # Custom image
```

- **Material Design Icons** - Use `mdi:icon-name` to display any Material Design icon
- **Custom Images** - Reference images from your `/local/` directory
- **Emoji & Text** - Original label functionality still supported
- **Automatic Format Detection** - The card detects and renders the appropriate format

### Smart Country Filtering

Enhanced control over country names in location displays with three operating modes:

```yaml
# Option 1: Specify exactly which countries to remove
remove_location_country: "USA|United States|Canada"

# Option 2: Use built-in country detection (previous behavior)
remove_location_country: true

# Option 3: Keep all country information (new default)
remove_location_country: false
```

- **Extended Parameter** - Now accepts custom country name patterns in addition to boolean values
- **Backward Compatible** - Still supports the previous `true`/`false` options
- **Regular Expression Support** - Match multiple country variations with one pattern
- **Enhanced Flexibility** - Keep international locations intact while simplifying domestic addresses
- **⚠ Default Changed** - Now defaults to `false` for more predictable global behavior

### Customizable Empty Day Styling

Control how days without events appear in your calendar:

```yaml
empty_day_color: '#ff5722' # Use custom color
```

- **Custom Text Color** - Set the perfect color for "No events" messages
- **Theme Integration** - Works with Home Assistant theme variables
- **Enhanced Accessibility** - Better control over contrast ratios

## 🐛 Bug Fixes

- **Fixed Multi-Day Event Time Display** - Multi-day events now correctly show start time when viewing before or on the event's start date
- **Improved Country Detection** - Enhanced location parsing for more reliable country name removal

## Related Issues

This release addresses the following feature requests and bug reports:

- [#32](https://github.com/alexpfau/calendar-card-pro/issues/32) - Event filtering capabilities (requested by @hlymn231)
- [#110](https://github.com/alexpfau/calendar-card-pro/issues/110) - Event filtering capabilities (requested by @tkabt06)
- [#104](https://github.com/alexpfau/calendar-card-pro/issues/104) - Labels for different event types (requested by @AlexanderTurnowsky)
- [#33](https://github.com/alexpfau/calendar-card-pro/issues/33) - Filter duplicate events (requested by @Bastian007)
- [#118](https://github.com/alexpfau/calendar-card-pro/issues/118) - Support for images in labels (requested by @Raznor09)
- [#116](https://github.com/alexpfau/calendar-card-pro/issues/116) - Fixed multi-day event time display and country detection (reported by @roblombardo)

Additional contributions by @netsoft-ruidias who provided proposals and implementation suggestions for filtering features.

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v2.1.2...v2.2.0

Thank you to everyone who contributed feature requests and bug reports that made this release possible!

---

# Calendar Card Pro v2.1.2

This release adds a new layout control feature and fixes several scrollbar-related issues to improve the user experience across different browsers and operating systems.

## 🚀 New Features

### Fixed Height Control

- **Added new `height` parameter**: Complements the existing `max_height` setting to provide greater flexibility in card layout
- **Distinct card height behaviors**:
  - `height` sets an exact size for the card independent of content amount
  - `max_height` allows the card to grow up to a specified limit

## 🐛 Bug Fixes

### Scrollbar and Overflow Improvements

- **Fixed week number pills being cut off**: Resolved an issue where week number pills could be partially hidden when using scrollable cards
- **Improved scrollbar consistency**: Scrollbars now consistently hide by default and only show on hover across all browsers
- **Fixed Chrome/Windows overflow issue**: Prevented unwanted scrollbars from appearing in Chrome on Windows when content doesn't actually overflow
- **Added absorption space**: Added 1px padding to fix edge cases where fractional pixel calculations would cause unnecessary scrolling

## 👤 Contributors

- @eyalgal - Feature request for hiding scrollbars (#112)
- @firstcolle - Feature request for card fixed dimensions (#62)

_This release maintains full compatibility with all existing configurations._

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v2.1.1...v2.1.2

---

# Calendar Card Pro v2.1.1

This maintenance release addresses a few issues related to week numbers display and styling, focusing on edge cases that were discovered after the initial week numbers feature was introduced in v2.1.0.

## 🐛 Bug Fixes

### Week Numbers Display

- **Fixed week number display with specific configurations**: Week numbers now properly appear when using `show_empty_days: false` together with `first_day_of_week: sunday`
- **Improved week boundary detection**: Enhanced algorithm ensures consistent detection even when some days are hidden
- **Fixed alignment issues**: Week number pills are now properly centered within their columns

### Visual Improvements

- **Removed "W" prefix from week numbers**: Creates cleaner appearance and avoids potential translation issues
- **Changed default week number font size**: Now set to 12px (previously 14px) for better visual balance
- **Enhanced week number pill styling**: Fixed proportional scaling with different font sizes to maintain pill shape

## 👤 Contributors

- @ValMarDav - Reported the week number display issue

_This release maintains full compatibility with all existing configurations._

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v2.1.0...v2.1.1

---

# Calendar Card Pro v2.1.0

This release introduces powerful new visual organization features and enhanced calendar controls, making Calendar Card Pro even more flexible for all your calendar management needs.

→→→ Please see the [🆕 What's New in v2.1](https://github.com/alexpfau/calendar-card-pro#-whats-new-in-v21) section in the README for detailed examples of all new features. ←←←

## 🎉 New Features

### Week Numbers & Visual Separators

Calendar Card Pro now provides a sophisticated system for displaying week numbers and visual separators that enhances your calendar's organization and readability.

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_4_week_numbers.png" alt="Week Numbers" width="600"><br>

**Key Capabilities**:

- **Week Number Indicators** - Pill-shaped badges showing the current week number (ISO or simple numbering)
- **Day, Week & Month Separators** - Distinct horizontal lines to visually organize your events
- **Visual Hierarchy** - Intelligent precedence system when multiple separators could appear
- **First Day of Week Independence** - Week numbering system works properly regardless of first day setting

### Per-Calendar Event Limits

You can now control how many events are shown from each calendar independently, allowing you to:

- **Prioritize important calendars**: Give more space to your most important calendars
- **Prevent one calendar from overwhelming the view**: Ideal for busy calendars like school schedules
- **Control information density**: Show all family events but only the next work meeting

## Related Issues

This release addresses the following feature requests:

- [#17](https://github.com/alexpfau/calendar-card-pro/issues/17) - Week numbers (requested by @akentner)
- [#72](https://github.com/alexpfau/calendar-card-pro/issues/72) - Configurable separators between weeks and months (requested by @teddybaerd)
- [#73](https://github.com/alexpfau/calendar-card-pro/issues/73) - Different number of events for each calendar (requested by @Jales2)

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v2.0.1...v2.1.0

Thank you to everyone who contributed feature requests and bug reports that made this release possible!

---

# Calendar Card Pro v2.0.1

This maintenance release addresses several issues reported by users after the v2.0.0 release, improving preview functionality, empty days display, scrollbar behavior, and Dutch translations.

## 🐛 Bug Fixes

### Card Preview & Browser Integration

- **Fixed card preview in Add to Dashboard dialog**: Calendar entities are now properly detected and displayed in the card selector preview (#97)
- **Improved scrollbar behavior**: Scrollbars now only appear when `max_height` is explicitly set, avoiding unwanted scrollbars in some browsers

### Calendar Display Enhancements

- **Fixed `start_date` with `show_empty_days`**: Calendar now properly honors the configured start date when showing empty days (#102)
- **Improved empty days generation**: Empty placeholders now consistently use the correct reference date

### Language Improvements

- **Updated Dutch translation**: Improved grammar with proper capitalization for weekday and month names (#99)

## 👤 Contributors

- @Misiu - Reported the scrollbar behavior issue (#97)
- @tkabt06 - Reported and tested the start_date with empty days issue (#102)
- @mhoogenbosch - Provided the Dutch translation improvements (#99)

---

# Calendar Card Pro v2.0.0

This major release completely reimagines Calendar Card Pro with a new architecture, enhanced performance, and numerous new features for customization. Calendar Card Pro v2 brings significant improvements to theme compatibility, visual styling options, and smart data management.

→→→ Please see the [🆕 What's New in v2](https://github.com/alexpfau/calendar-card-pro#-whats-new-in-v2) section in the README for detailed examples of all new features. ←←←

## 🚀 Major Refactoring

### Enhanced Performance

- **Complete Rewrite**: Entirely new rendering engine for better performance
- **Smart Caching**: Intelligent caching reduces API calls and improves load times
- **Progressive Rendering**: Efficiently renders events in small batches to maintain responsiveness
- **Stable DOM Structure**: Consistent structure for better compatibility with other components

### Improved Theme & Card-Mod Compatibility

- **Native Theme Support**: Properly integrates with all Home Assistant themes
- **Standard Card Structure**: Uses standard ha-card structure making card-mod work exactly like other cards

## 🎉 New Features

### Custom Styling Per Calendar

- **Accent Colors**: Assign unique colors to the vertical line for each calendar entity (#19 and #92 by @LiquidPT)
- **Background Colors**: Enable semi-transparent backgrounds matching the accent color
- **Smart Rounded Corners**: Events use rounded corners derived from your theme's card radius
- **Visual Hierarchy**: Instantly distinguish events from different calendars at a glance

  <img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_3_custom_styling.png" alt="Custom Styling" width="600"><br>

### Calendar Labels

- **Custom Calendar Identifiers**: Add emoji or text before event titles (#65, #83, #91)
- **Visual Distinction**: Labels appear before event titles with proper spacing
- **Improved Accessibility**: Distinguish calendars beyond just color coding

### Advanced Display Controls

- **Per-Calendar Settings**: Control which information appears for specific calendars
- **Flexible Configuration**: Show time or location information based on calendar type
- **Simplified Display**: Hide time information for all-day events (#7)

### Custom Start Date

- **Date Selection**: View calendars from any date, not just today (#25, #77)
- **Future Planning**: Create seasonal or special-purpose calendars
- **Flexible Format**: Supports both YYYY-MM-DD and ISO date formats

### Empty Day Display

- **Consistent Layout**: Always display all configured days, even when they have no events (#40)
- **Visual Placeholders**: Clear indication of empty days with checkmark emoji
- **Improved Organization**: Easily see when days have no scheduled events

### Enhanced Past Event Display

- **Visual Distinction**: Past events appear with reduced opacity (60%)
- **Improved All-Day Handling**: Correctly handles multi-day all-day events
- **Smart Detection**: All-day events active today are never marked as "past"

### Fixed Height with Scrolling

- **Size Control**: Limit card height while preserving all events (#62, #51)
- **Automatic Scrolling**: Content scrolls when it exceeds defined height
- **Consistent Layout**: Maintain dashboard aesthetics regardless of event count

### Smarter Caching

- **Navigation-Aware Caching**: Option to preserve cache when switching dashboard views
- **Reduced API Calls**: Minimizes unnecessary API requests
- **Mobile-Friendly**: Better performance and battery life for mobile users

### Enhanced Spacing Controls

- **Fine-Tuned Layout**: Control vertical padding within each event (#11)
- **Day Spacing**: Adjust spacing between different calendar day rows
- **Consistent Naming**: More intuitive parameter names (row_spacing → day_spacing)

### Today's Event Styling with Card-Mod

- **Custom Today Highlighting**: Easily style today's events differently with card-mod (#20)
- **Animation Support**: Create subtle animations for today's events
- **Visual Priority**: Make current day events stand out

## 🛠 Breaking Changes

1. **Parameter Renaming**:

   - `row_spacing` is now `day_spacing` (for clarity)

2. **Split Parameters**:

   - `time_location_icon_size` has been split into separate parameters:
     ```yaml
     time_icon_size: '14px'
     location_icon_size: '14px'
     ```

3. **Card DOM Structure**: Internal structure updates may affect existing card-mod customizations

## 📚 Documentation Updates

- **Reorganized README**: Clearer feature explanations with examples
- **Enhanced Configuration Guide**: Comprehensive parameter documentation
- **New Examples**: Additional configuration examples with screenshots
- **Architecture Documentation**: New developer documentation explaining internal design

## ⚙️ Technical Improvements

- **Modular Architecture**: Completely restructured codebase for maintainability
- **Type Safety**: Enhanced TypeScript interfaces throughout the codebase
- **Styling System**: Improved CSS variable integration with Home Assistant themes
- **Event Processing**: Better handling of multi-day and all-day events
- **Error Handling**: Graceful degradation when calendar data is unavailable

## 🐛 Bug Fixes

- **Multiple Lit Versions**: Fixed issues with multiple versions of Lit being loaded (#74)
- **Title Display**: Card title now always displays even with no events (#70)
- **All-Day Events**: Improved detection and display of all-day events
- **Theme Compatibility**: Fixed inconsistencies with various Home Assistant themes
- **Date Alignment**: Fixed date column alignment issues (#41)

## New Contributors

- @LiquidPT made their first contribution in https://github.com/alexpfau/calendar-card-pro/pull/92

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v1.2.3...v2.0.0

Thank you to everyone who contributed feature requests and bug reports that made this release possible!

---

# Calendar Card Pro v1.2.3

This release enhances several language translations and improves date formatting logic, bringing the total number of supported languages to 24.

## 🌎 Language Enhancements

### Norwegian Language

- **Replaced generic Norwegian (no) with proper language variants**:
  - Added Norwegian Bokmål (nb) (#86)
  - Added Norwegian Nynorsk (nn) (#86)

### Grammatical Improvements

- **Improved Russian translations**: Enhanced grammatical cases for better readability (#87)
- **Improved Ukrainian translations**: Fixed grammatical structure (#88)
- **Improved Polish translations**: Corrected grammar issues (#89)

### Date Format Improvements

- **Updated Hungarian language**:
  - Fixed translation issues (#10)
  - Improved date format logic to use month-day format similar to English

## 📚 Documentation

- Updated README to reflect both Norwegian language variants

## 👤 Contributors

- @grotteru - Improved Norwegian language support
- @jakksoft - Enhanced Russian, Ukrainian, and Polish translations
- @suxlala - Hungarian language fixes
- @alexpfau - Date format improvements and code organization

## 🔭 On the Horizon

A major v2 re-architecture update is in active development and will be released soon. This upcoming version will significantly enhance compatibility with card-mod, provide better integration with custom Home Assistant themes, and establish a solid foundation for implementing new features going forward. Stay tuned for this substantial update!

---

# Calendar Card Pro v1.2.2

This release significantly expands language support by adding five new languages and updating one existing translation, bringing the total supported languages to 23.

## 🌎 Language Enhancements

### New Languages

- **Added Norwegian (NO)**: Complete translation support (#82)
- **Added Chinese Simplified (zh-CN)**: Full translation for Mandarin Chinese users (#80)
- **Added Chinese Traditional (zh-TW)**: Support for Traditional Chinese characters (#79)
- **Added Slovenian (sl)**: Complete translation for Slovenian users (#71)
- **Added Greek (el)**: Full Greek language support (#23)

### Updated Languages

- **Improved Vietnamese (vi)**: Enhanced and corrected Vietnamese translations (#78)

## 📚 Documentation

- Updated README to reflect the expanded language support
- Added all new languages to the supported languages list

## 👤 Contributors

- @grotteru - Added Norwegian translation
- @PATCoder97 - Added Chinese Simplified and Traditional translations, improved Vietnamese translations
- @AdmiralStipe - Added Slovenian translation
- @mefistofelis - Added Greek translation

---

# Calendar Card Pro v1.2.1

This maintenance release addresses two important issues: fixing the event limit functionality and improving Icelandic translations.

## 🐛 Bug Fixes

### Event Limit Functionality

- **Fixed `max_events_to_show` behavior**: Events are now properly limited to the configured maximum number across all days (#64)
- **Improved event filtering logic**: Events are limited at the individual event level rather than entire days

### Language Improvements

- **Updated Icelandic translation**: Fixed issues in Icelandic language support (#68)

## 👤 Contributors

- @bvweerd - Reported the `max_events_to_show` issue
- @russi76 - Provided the Icelandic translation fix

---

# Calendar Card Pro v1.2.0

This release significantly expands Calendar Card Pro with comprehensive multi-language support (now supporting 18 languages), improves date formatting across different language conventions, and fixes important bugs.

## 🎉 New Features

### Expanded Language Support

- **18 languages supported**: Calendar Card Pro now includes translations for 16 languages beyond the original English and German
- **Smart date formatting** by language convention:
  - `day-dot-month` format for German (e.g., "17. Mar")
  - `month-day` format for English (e.g., "Mar 17")
  - `day-month` format for most other languages (e.g., "17 Mar")

## 🐛 Bug Fixes

### Time Format Display Issue

- **Fixed 12/24-hour format**: The `time_24h: false` setting now correctly applies to multi-day events (#28)
- **Consistent time display**: All event types now respect user time format preferences

## 📚 Documentation Updates

- Updated README.md to reflect full language support
- Enhanced CONTRIBUTING.md with clearer guidelines for language contributions
- Added language-specific formatting documentation

## 🌍 Language Contributors

A huge thank you to these contributors who made this multi-language release possible:

- Czech (`cs`) - @jakksoft (#58)
- Danish (`da`) - @hrassel / @dkduck (#15)
- Dutch (`nl`) - @mhoogenbosch (#6)
- Finnish (`fi`) - @Kotikaltsu (#9)
- French (`fr`) - @vincegre (#57)
- Hebrew (`he`) - @Shanksg (#18)
- Hungarian (`hu`) - @suxlala (#10)
- Icelandic (`is`) - @russi76 (#35)
- Italian (`it`) - @papperone (#30)
- Polish (`pl`) - @jakksoft (#34)
- Portuguese (`pt`) - @jakksoft (#56)
- Russian (`ru`) - @andrewjswan (#26)
- Spanish (`es`) - @jakksoft (#54)
- Swedish (`sv`) - @CrallH (#13)
- Ukrainian (`uk`) - @andrewjswan (#24)
- Vietnamese (`vi`) - @PATCoder97 (#61)

## ⚙️ Technical Improvements

- **Enhanced date formatting system**: Added region-sensitive date format rules
- **Improved localization framework**: Updated to support multiple date formatting conventions
- **Consistent naming convention**: Language files follow standard IETF language tags

Want to add your language? See the [Adding Translations](https://github.com/alexpfau/calendar-card-pro#-adding-translations) section in our README.

---

# Calendar Card Pro v1.1.0

## 🎉 New Features

### Automatic Language Detection (#36)

- **System language detection**: Calendar Card Pro now automatically detects and uses your Home Assistant system language
- **Smart language selection** following this priority:
  1. Card configuration (if specified)
  2. Home Assistant system setting (if supported)
  3. English as fallback
- **Region code support**: Recognizes language codes with region specifiers (e.g., "de-DE" will use German)

## 🐛 Bug Fixes

### Multi-day Event Display Issue (#16)

- **Fixed ongoing multi-day events**: Events that started in the past but are still ongoing now properly display in the calendar
- **Improved event filtering logic**: Events are now correctly shown for all days they are active, not just their start day
- **Enhanced context for events**: Added "Ends Today" and "Ends Tomorrow" indicators for better comprehension
- **Consistent display across event types**: Fixed handling of both all-day multi-day events and regular multi-day events with start/end times

## 🌍 Translations

- **New translation keys**:
  - `endsToday`: For events that end on the current day
  - `endsTomorrow`: For events ending the next day

## ⚙️ Technical Improvements

- **Improved language handling**: Updated the Home Assistant interface to include locale properties
- **Enhanced formatting**: Added specialized display functions for different event types
- **Configuration default**: Changed default language constant to properly support auto-detection
- **Debug logging**: Added helpful logs for language detection troubleshooting

## Currently Supported Languages

- English (en)
- German (de)

To add support for additional languages, please consider contributing translations via PR.

---

# Calendar Card Pro v1.0.2

### Bug Fixes

- fix(#28): Resolve all-day event timezone display issues by @alexpfau in https://github.com/alexpfau/calendar-card-pro/pull/39
  - Fixed critical issue where all-day events were displaying on the wrong day for users in timezones west of UTC
  - Implemented timezone-aware handling of all-day events to ensure correct display across all timezones
  - Special thanks to members @kummerr, @ActarusC, and @Twilek-de who helped diagnose and test the fix

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v1.0.0...v1.0.2

---

# Calendar Card Pro v1.0.1

## What's Changed

### Other Changes

- ci: add GitHub Actions workflow for build and lint checks on PRs by @alexpfau in https://github.com/alexpfau/calendar-card-pro/pull/2
- docs: update link to architecture documentation in README by @alexpfau in https://github.com/alexpfau/calendar-card-pro/pull/4
- feat: add issue templates for bug reports and feature requests, add PR template by @alexpfau in https://github.com/alexpfau/calendar-card-pro/pull/5

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v1.0.0...v1.0.1

---

# Calendar Card Pro v1.0.0

![Calendar Card Pro Banner](https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/header.png)

I am excited to announce the first public release of **Calendar Card Pro** – a high-performance, beautifully designed calendar card for Home Assistant!

## 🚀 Key Features

- **Sleek & Modern Design** – Clean, visually appealing layout based on Material Design principles
- **Multi-Calendar Support** – Display and style multiple calendars with unique colors
- **Compact & Expandable Views** – Toggle between space-efficient and detailed displays
- **Performance Optimized** – Smart caching, progressive rendering, and minimal API calls
- **Deep Home Assistant Integration** – Theme-aware with native ripple effects
- **Multi-Language Support** – Currently available in English and German
- **Highly Customizable** – Extensive options for colors, fonts, spacing and more

## 🔧 Installation

Available through HACS (recommended) or manual installation:

[![Open in HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=alexpfau&repository=calendar-card-pro&category=plugin)

## 📖 Documentation

For complete documentation including configuration options, examples, and customization:

- See the [README](https://github.com/alexpfau/calendar-card-pro/blob/main/README.md) for detailed usage instructions
- Check out the [Examples](https://github.com/alexpfau/calendar-card-pro/blob/main/README.md#5️⃣-examples) section for configuration samples

## 🙏 Acknowledgements

Special thanks to:

- **@kdw2060** from the Home Assistant community for the original design inspiration
- Home Assistant's Tile Card for interaction patterns

## 🔮 What's Next?

Development continues with planned features including:

- Enhanced event details
- Visual configuration editor
- Additional language support

Enjoy using Calendar Card Pro in your Home Assistant dashboards!
