# Configuration Options

Every option Calendar Card Pro accepts, grouped by the part of the card it affects.

This page is the **index**: it tells you an option exists, what type it takes and what
it defaults to. The [feature pages](/features/core-settings) are where each option is
explained and demonstrated — where an option needs more than one line, this page links
to the page that owns it.

::: tip Looking for a Starting Point?
[Usage](/guide/usage) has two complete, copy-pasteable configurations. Snippets on this
site show only the options under discussion, so they are fragments rather than whole
cards.
:::

## 🗂️ Core Settings

| Option                         | Type    | Default                       | Description                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------ | ------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entities`                     | array   | Required                      | List of calendar entities with optional styling (see [Per-Entity Options](#per-entity-options))                                                                                                                                                                                                                                                                                                                                                     |
| `view`                         | string  | `list`                        | Layout the card renders in — `list` stacks each day above the next, `column` places days side by side. See [Column View](/features/core-settings#column-view)                                                                                                                                                                                                                                                                                       |
| `start_date`                   | string  | Today                         | Custom start date for the calendar. Accepts a fixed date (`YYYY-MM-DD`) or a relative expression built from an anchor (`today`, `start_of_week`, or a weekday name) plus optional `+N` / `-N` day offsets, `+Nw` / `-Nw` week offsets, and `+<weekday>` / `-<weekday>` jumps — e.g. `today+7`, `+3`, `start_of_week`, `saturday`, `today+sat+7`, `monday+1w`. See [Start Date Configuration](/features/start-date-offset#start-date-configuration). |
| `days_to_show`                 | number  | `3`                           | Number of days to display                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `compact_days_to_show`         | number  | -                             | Number of days to display in compact mode                                                                                                                                                                                                                                                                                                                                                                                                           |
| `compact_events_to_show`       | number  | -                             | Number of events to show in compact mode                                                                                                                                                                                                                                                                                                                                                                                                            |
| `compact_events_complete_days` | boolean | `false`                       | When true, shows all events for days that have at least one event displayed                                                                                                                                                                                                                                                                                                                                                                         |
| `show_empty_days`              | boolean | `false`                       | Whether to show days with no events (with "No events" message)                                                                                                                                                                                                                                                                                                                                                                                      |
| `hide_when_empty`              | boolean | `false`                       | Hide the entire card when there are no upcoming events to show                                                                                                                                                                                                                                                                                                                                                                                      |
| `empty_day_text`               | string  | _translated default_          | Custom text shown on any day the card renders as empty, whether a gap between event days, an entire empty range, or the single row shown when the card has nothing at all. Omits the ✓ prefix when set                                                                                                                                                                                                                                              |
| `filter_duplicates`            | boolean | `false`                       | Hide events whose title, start, end and location all match another event; the calendar listed first in `entities` wins                                                                                                                                                                                                                                                                                                                              |
| `split_multiday_events`        | boolean | `false`                       | Display multi-day events on each day they cover                                                                                                                                                                                                                                                                                                                                                                                                     |
| `language`                     | string  | `System`, fallback `en`       | Interface language (auto-detects from HA)                                                                                                                                                                                                                                                                                                                                                                                                           |
| `column`                       | object  | Inherits the top-level values | Options that should take a different value in column view. Only presentation options may appear here — see [Column View](/features/core-settings#column-view)                                                                                                                                                                                                                                                                                       |
| `min_day_column_width_px`      | number  | `160`                         | Narrowest a day column may become in column view before the card falls back to the list layout                                                                                                                                                                                                                                                                                                                                                      |

### Column-Only Options

These live inside the `column:` block and have no top-level counterpart, because they
describe spacing that only exists once days sit side by side. Their defaults make an
absent `column:` block a visual no-op.

| Option                                | Type   | Default                | Description                                                                        |
| ------------------------------------- | ------ | ---------------------- | ---------------------------------------------------------------------------------- |
| `column → day_gap`                    | string | `10px`                 | Horizontal space between day columns, the column-view counterpart to `day_spacing` |
| `column → day_header_separator_width` | string | `1px`                  | Thickness of the rule under each day header; `0px` renders no rule                 |
| `column → day_header_separator_color` | string | `var(--divider-color)` | Color of that rule                                                                 |

**→ [Column View](/features/core-settings#column-view)** — worked examples.

### Per-Entity Options

Each item in `entities` may be a plain entity ID string, or an object that overrides
the card-wide settings for that one calendar:

`entity` · `label` · `color` · `accent_color` · `label_icon_color` · `show_time` ·
`show_location` · `show_description` · `compact_events_to_show` · `blocklist` ·
`allowlist` · `split_multiday_events`

**→ [Entity configuration options](/features/core-settings#available-options-for-entity-configuration-objects)** — full table, with filtering examples.

## 🏷️ Header

| Option            | Type   | Default                           | Description                                                                                                                                                            |
| ----------------- | ------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`           | string | -                                 | Card title. Accepts a [Home Assistant template](/features/title-templates) — any value containing `{{` or `{%` is rendered by Home Assistant and updates automatically |
| `title_font_size` | string | `--calendar-card-font-size-title` | Card title font size                                                                                                                                                   |
| `title_color`     | string | `--calendar-card-color-title`     | Card title font color                                                                                                                                                  |

**→ [Dynamic titles with templates](/features/title-templates)** — placeholders such as `{event_count}` and `{next_event}`.

## 📏 Layout & Spacing

| Option                    | Type   | Default                | Description                                                                                                   |
| ------------------------- | ------ | ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| `background_color`        | string | `--ha-card-background` | Card background color                                                                                         |
| `accent_color`            | string | `#03a9f4`              | Vertical line separator color                                                                                 |
| `vertical_line_width`     | string | `2px`                  | Vertical line separator width                                                                                 |
| `day_spacing`             | string | `10px`                 | Spacing between different calendar day rows (replaces `row_spacing`)                                          |
| `event_spacing`           | string | `4px`                  | Vertical padding within each event                                                                            |
| `additional_card_spacing` | string | `0px`                  | Additional top/bottom padding for the card                                                                    |
| `height`                  | string | `auto`                 | Sets a fixed, exact height for the card regardless of content amount (always this height, never more or less) |
| `max_height`              | string | `none`                 | Allows the card to grow with content up to this maximum height limit                                          |

**→ [Layout and appearance](/features/layout-appearance)**

## 📐 Week Numbers & Horizontal Separators

| Option                         | Type    | Default                       | Description                                                      |
| ------------------------------ | ------- | ----------------------------- | ---------------------------------------------------------------- |
| `show_week_numbers`            | string  | `null`                        | Week number display method ('iso', 'simple', or null to disable) |
| `show_current_week_number`     | boolean | `true`                        | Whether to show week number for the first/current week in view   |
| `week_number_font_size`        | string  | `12px`                        | Font size for week number pills                                  |
| `week_number_color`            | string  | `var(--primary-text-color)`   | Text color for week number pills                                 |
| `week_number_background_color` | string  | `#03a9f450`                   | Background color for week number pills                           |
| `first_day_of_week`            | string  | `system`                      | First day of week ('monday', 'sunday', or 'system')              |
| `day_separator_width`          | string  | `0px`                         | Width of separator line between days                             |
| `day_separator_color`          | string  | `var(--secondary-text-color)` | Color of separator line between days                             |
| `week_separator_width`         | string  | `0px`                         | Width of separator line between weeks                            |
| `week_separator_color`         | string  | `#03a9f450`                   | Color of separator line between weeks                            |
| `month_separator_width`        | string  | `0px`                         | Width of separator line between months                           |
| `month_separator_color`        | string  | `var(--primary-text-color)`   | Color of separator line between months                           |

**→ [Week numbers and visual separators](/features/layout-appearance#week-numbers-visual-separators)**

## 🌟 Today Indicator

| Option                     | Type              | Default   | Description                                                                                                                                               |
| -------------------------- | ----------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `today_indicator`          | boolean or string | `false`   | Today indicator type: `true`/`dot` (basic dot), `pulse` (animated dot), `glow` (glowing effect), custom MDI icon (e.g., `mdi:star`), emoji, or image path |
| `today_indicator_position` | string            | `15% 50%` | Position of today indicator in CSS-like format (x% y%)                                                                                                    |
| `today_indicator_color`    | string            | `#03a9f4` | Color of the today indicator                                                                                                                              |
| `today_indicator_size`     | string            | `6px`     | Size of the today indicator                                                                                                                               |

**→ [Today indicator](/features/layout-appearance#today-indicator)** — all four indicator types, shown side by side.

## 📆 Date Column

| Option                    | Type    | Default                                                | Description                                                      |
| ------------------------- | ------- | ------------------------------------------------------ | ---------------------------------------------------------------- |
| `date_vertical_alignment` | string  | `middle`                                               | Vertical alignment of date column (`top`, `middle`, or `bottom`) |
| `weekday_font_size`       | string  | `14px`                                                 | Weekday name font size                                           |
| `weekday_color`           | string  | `--primary-text-color`                                 | Weekday name font color                                          |
| `day_font_size`           | string  | `26px`                                                 | Day numbers font size                                            |
| `day_color`               | string  | `--primary-text-color`                                 | Day numbers font color                                           |
| `show_month`              | boolean | `true`                                                 | Whether to show month names                                      |
| `month_font_size`         | string  | `12px`                                                 | Month name font size                                             |
| `month_color`             | string  | `--primary-text-color`                                 | Month name font color                                            |
| `weekend_weekday_color`   | string  | inherits `weekday_color`                               | Color for the weekday name (e.g., "Sat", "Sun") on weekend days  |
| `weekend_day_color`       | string  | inherits `day_color`                                   | Color for the day number on weekend days                         |
| `weekend_month_color`     | string  | inherits `month_color`                                 | Color for the month name on weekend days                         |
| `today_weekday_color`     | string  | inherits `weekend_weekday_color`, then `weekday_color` | Color for the weekday name (e.g., "Sat", "Sun") on today's date  |
| `today_day_color`         | string  | inherits `weekend_day_color`, then `day_color`         | Color for the day number on today's date                         |
| `today_month_color`       | string  | inherits `weekend_month_color`, then `month_color`     | Color for the month name on today's date                         |

**→ [Date column customization](/features/layout-appearance#date-column-customization)** — including weekend and today overrides.

## 📅 Event Column

| Option                          | Type              | Default                                            | Description                                                                                                                                                                               |
| ------------------------------- | ----------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `event_background_opacity`      | number            | `0`                                                | Background opacity (0-100) for events using entity accent color                                                                                                                           |
| `event_icon_vertical_alignment` | string            | `middle`                                           | Vertical alignment of event icons (time, location, description): `top`, `middle`, or `bottom`                                                                                             |
| `show_past_events`              | boolean           | `false`                                            | Whether to show today's events that have already ended                                                                                                                                    |
| `show_countdown`                | boolean           | `false`                                            | Show how much time remains until an event starts                                                                                                                                          |
| `show_countdown_allday`         | boolean           | `true`                                             | Whether the countdown is also shown for all-day events (requires `show_countdown`)                                                                                                        |
| `show_progress_bar`             | boolean           | `false`                                            | Whether to show a progress bar for currently running events                                                                                                                               |
| `progress_bar_color`            | string            | `var(--secondary-text-color)`                      | Color of the progress bar                                                                                                                                                                 |
| `progress_bar_height`           | string            | `calc(var(--calendar-card-font-size-time) * 0.75)` | Height of the progress bar                                                                                                                                                                |
| `progress_bar_width`            | string            | `60px`                                             | Width of the progress bar                                                                                                                                                                 |
| `empty_day_color`               | string            | `--primary-text-color`                             | Color for "No events" text on empty days                                                                                                                                                  |
| `event_font_size`               | string            | `14px`                                             | Event title font size                                                                                                                                                                     |
| `event_color`                   | string            | `--primary-text-color`                             | Event title font color                                                                                                                                                                    |
| `show_time`                     | boolean           | `true`                                             | Whether to show event times                                                                                                                                                               |
| `show_single_allday_time`       | boolean           | `true`                                             | Whether to show time display for all-day single-day events                                                                                                                                |
| `time_24h`                      | boolean           | `System`                                           | Whether to use 24-hour time format (auto-detects from HA)                                                                                                                                 |
| `time_two_digit_hours`          | boolean           | `false`                                            | Whether to use 2 digits in hours                                                                                                                                                          |
| `show_end_time`                 | boolean           | `true`                                             | Whether to show event end times                                                                                                                                                           |
| `time_icon_size`                | string            | `14px`                                             | Clock icon size (replaces time_location_icon_size)                                                                                                                                        |
| `time_font_size`                | string            | `12px`                                             | Event time font size                                                                                                                                                                      |
| `time_color`                    | string            | `--secondary-text-color`                           | Event time font color                                                                                                                                                                     |
| `show_location`                 | boolean           | `true`                                             | Whether to show event locations                                                                                                                                                           |
| `remove_location_country`       | boolean or string | `false`                                            | Whether to remove country names from locations. Can be boolean (`true`/`false`) or a regex pattern string (e.g., `"USA \| United States \| Canada"`) to specify which countries to remove |
| `location_icon_size`            | string            | `14px`                                             | Location icon size (replaces time_location_icon_size)                                                                                                                                     |
| `location_font_size`            | string            | `12px`                                             | Event location font size                                                                                                                                                                  |
| `location_color`                | string            | `--secondary-text-color`                           | Event location font color                                                                                                                                                                 |
| `show_description`              | boolean           | `false`                                            | Whether to show event descriptions                                                                                                                                                        |
| `description_icon_size`         | string            | `14px`                                             | Description icon size                                                                                                                                                                     |
| `description_font_size`         | string            | `12px`                                             | Event description font size                                                                                                                                                               |
| `description_color`             | string            | `--secondary-text-color`                           | Event description font color                                                                                                                                                              |
| `description_max_lines`         | number            | `0`                                                | Maximum number of lines to show for event descriptions (0 = unlimited). Truncated text shows `...`                                                                                        |

**→ [Event content](/features/event-content)** · **[Multi-day events](/features/multi-day-events)** · **[Start date offset](/features/start-date-offset)**

## 🌦️ Weather

| Option               | Type   | Default | Description                                                                                                  |
| -------------------- | ------ | ------- | ------------------------------------------------------------------------------------------------------------ |
| `weather`            | object | -       | Weather configuration object containing the settings below                                                   |
| `weather → entity`   | string | -       | Home Assistant weather entity to use for forecasts                                                           |
| `weather → position` | string | `date`  | Where to show weather data: `date` (in date column), `event` (next to events), or `both` (in both positions) |
| `weather → date`     | object | -       | Configuration for weather display in the date column                                                         |
| `weather → event`    | object | -       | Configuration for weather display next to events                                                             |

### Weather Position Options

`weather → date` and `weather → event` each take their own styling object. The two
scopes accept different options, because a date cell shows a daily forecast and an event
shows the forecast for its own start time:

| Scope             | Accepted options                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `weather → date`  | `show_conditions` · `show_high_temp` · `show_low_temp` · `show_uv_index` · `uv_index_threshold` · `icon_size` · `font_size` · `color`      |
| `weather → event` | `show_conditions` · `show_temp` · `show_uv_index` · `uv_index_threshold` · `daily_forecast_fallback` · `icon_size` · `font_size` · `color` |

**→ [Weather configuration options](/features/weather#weather-configuration-options)** — full table with defaults and worked examples.

## 👆 Actions

| Option        | Type   | Default | Description                  |
| ------------- | ------ | ------- | ---------------------------- |
| `tap_action`  | object | `none`  | Action when tapping the card |
| `hold_action` | object | `none`  | Action when holding the card |

### Action Parameters

`tap_action` and `hold_action` take an object whose `action` key selects the
behavior. The remaining keys depend on which action you chose:

`action` · `navigation_path` · `service` · `service_data` · `url_path` · `open_tab`

**→ [Actions](/features/actions#available-actions)** — every supported action and the parameters it takes.

## ⚡ Cache & Refresh

| Option                | Type    | Default | Description                                                           |
| --------------------- | ------- | ------- | --------------------------------------------------------------------- |
| `refresh_interval`    | number  | `30`    | Time in minutes between data refreshes                                |
| `refresh_on_navigate` | boolean | `true`  | Whether to force refresh data when navigating between dashboard views |

**→ [Performance and caching](/features/performance)**
