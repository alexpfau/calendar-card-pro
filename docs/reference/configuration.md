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

| Option                         | Type    | Default                       | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------ | ------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entities`                     | array   | Required                      | List of calendar entities with optional styling (see [Per-Entity Options](#per-entity-options))                                                                                                                                                                                                                                                                                                                                                                  |
| `view`                         | string  | `list`                        | Layout the card renders in — `list` stacks each day above the next, `column` places days side by side, and `grid` places them side by side on an hour axis. See [Column View](/features/column-view) and [Grid View](/features/grid-view)                                                                                                                                                                                                                        |
| `start_date`                   | string  | Today                         | Custom start date for the calendar. Accepts a fixed date (`YYYY-MM-DD`) or a relative expression built from an anchor (`today`, `start_of_week`, or a weekday name) plus optional `+N` / `-N` day offsets, `+Nw` / `-Nw` week offsets, and `+<weekday>` / `-<weekday>` jumps — e.g. `today+7`, `+3`, `start_of_week`, `saturday`, `today+sat+7`, `monday+1w`. See [Start Date Configuration](/features/start-date-offset#start-date-configuration).              |
| `days_to_show`                 | number  | `3`                           | Number of days to display                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `compact_days_to_show`         | number  | -                             | Number of days to display in compact mode                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `compact_events_to_show`       | number  | -                             | Number of events to show in compact mode                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `compact_events_complete_days` | boolean | `false`                       | When true, shows all events for days that have at least one event displayed                                                                                                                                                                                                                                                                                                                                                                                      |
| `show_empty_days`              | boolean | `false`                       | Whether to show days with no events (with "No events" message). Column view defaults this to `true`, and grid view defaults this to `true`, inside their view blocks; neither inherits the top-level value — see [Column Options That Start From a Different Default](/features/column-view#options-that-start-from-a-different-default) and [Grid Options That Start From a Different Default](/features/grid-view#options-that-start-from-a-different-default) |
| `hide_when_empty`              | boolean | `false`                       | Hide the entire card when there are no upcoming events to show                                                                                                                                                                                                                                                                                                                                                                                                   |
| `empty_day_text`               | string  | _translated default_          | Custom text shown on any day the card renders as empty, whether a gap between event days, an entire empty range, or the single row shown when the card has nothing at all. Omits the ✓ prefix when set                                                                                                                                                                                                                                                           |
| `filter_duplicates`            | boolean | `false`                       | Hide events whose title, start, end and location all match another event; the entry listed first in `entities` wins its colors, which may be a second block of the same calendar, while the surviving row shows the label of every calendar the event came from                                                                                                                                                                                                  |
| `duplicate_accent_color`       | string  | -                             | Accent color for an event kept from two or more different calendars, replacing the first-listed calendar's own; unset keeps that calendar's color. Needs `filter_duplicates: true`                                                                                                                                                                                                                                                                               |
| `split_multiday_events`        | boolean | `false`                       | Display multi-day events on each day they cover. Column view defaults this to `true` and does not inherit the top-level value — a column is a day, so a spanning event belongs in each one it covers. See [Options That Start From a Different Default](/features/column-view#options-that-start-from-a-different-default)                                                                                                                                       |
| `event_type`                   | string  | `all`                         | Which class of event the card keeps — `all` shows every event, `timed` keeps only those with a clock time, and `all_day` keeps only all-day ones. It describes the kind of event, not how long it lasts. Setting it per calendar, on a calendar listed twice, is how one calendar's all-day events get their own color. See [Separating All-Day From Timed Events](/features/core-settings#separating-all-day-from-timed-events)                                 |
| `language`                     | string  | `System`, fallback `en`       | Interface language (auto-detects from HA). Governs every string the card renders, including the weather condition words — see [Weather](/features/weather#weather-in-the-column-layout)                                                                                                                                                                                                                                                                          |
| `column`                       | object  | Inherits the top-level values | Options that should take a different value in column view. Only presentation options may appear here — see [Column View](/features/column-view)                                                                                                                                                                                                                                                                                                                  |
| `time_grid`                    | object  | Inherits the top-level values | Options that should take a different value in grid view, plus the time axis's own settings. Only presentation options may appear here — see [Grid View](/features/grid-view)                                                                                                                                                                                                                                                                                     |

### Column-Only Options

These live inside the `column:` block and have no top-level counterpart, because they
describe spacing that only exists once days sit side by side. Their defaults make an
absent `column:` block a visual no-op.

| Option                                | Type   | Default                | Description                                                                                                                                                  |
| ------------------------------------- | ------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `column → day_header_gap`             | string | `8px`                  | Vertical space between a day header and its first event                                                                                                      |
| `column → day_header_separator_width` | string | `0px`                  | Thickness of the rule under each day header; `0px`, the default, renders no rule                                                                             |
| `column → day_header_separator_color` | string | `var(--divider-color)` | Color of that rule                                                                                                                                           |
| `column → min_day_width`              | number | `140`                  | Narrowest a day column may become, in pixels, before the card sheds a column                                                                                 |
| `column → min_days_to_show`           | number | `days_to_show`         | Fewest columns the card may shrink to. Defaults to `days_to_show`, so no columns are shed unless you lower it; below this floor, `min_days_fallback` decides |
| `column → min_days_fallback`          | string | `list`                 | What happens when even `min_days_to_show` will not fit: `list` or `cramp`                                                                                    |

**→ [Column View](/features/column-view)** — worked examples.

### Grid-Only Options

These live inside the `time_grid:` block and have no top-level counterpart, because they
describe the shared day header, the time axis and the grid's responsive width fallback.

| Option                                   | Type    | Default                | Description                                                                                                                                     |
| ---------------------------------------- | ------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `time_grid → day_header_gap`             | string  | `8px`                  | Vertical space between a day header and the content below it                                                                                    |
| `time_grid → day_header_separator_width` | string  | `0px`                  | Thickness of the rule under each day header; `0px`, the default, renders no rule                                                                |
| `time_grid → day_header_separator_color` | string  | `var(--divider-color)` | Color of that rule                                                                                                                              |
| `time_grid → min_day_width`              | number  | `100`                  | Narrowest a day column may become, in pixels, before the grid sheds a column. Three days fit at 410px, or 426px entering from the list fallback |
| `time_grid → min_days_to_show`           | number  | `1`                    | Fewest day columns the grid may shrink to. Defaults to one because a one-day grid is a useful day view with a now line                          |
| `time_grid → min_days_fallback`          | string  | `list`                 | What happens when even `min_days_to_show` will not fit: `list` or `cramp`. Cramp retains a `2rem` day floor and scrolls horizontally below it   |
| `time_grid → start_time`                 | string  | `07:00`                | First moment the axis draws, as `HH:mm`. A value that cannot be read resets this and `end_time` together                                        |
| `time_grid → end_time`                   | string  | `22:00`                | Last moment the axis draws. Also accepts `24:00` for the end of the day                                                                         |
| `time_grid → slot_minutes`               | number  | `30`                   | Spacing of the axis rules, in minutes: `15`, `20`, `30` or `60`. Changes the ruling only, never how tall an hour is                             |
| `time_grid → hour_height`                | string  | `48px`                 | Height of one hour. Sets the calendar content area's natural height; under a fixed `height` the axis compresses to fit instead                  |
| `time_grid → axis_width`                 | string  | `max-content`          | Width of the hour-label gutter. The default sizes to the widest visible gutter label with fixed padding                                         |
| `time_grid → show_axis_labels`           | boolean | `true`                 | Label the axis with its hours                                                                                                                   |
| `time_grid → show_now_line`              | boolean | `true`                 | Draw a line across today's column at the current time                                                                                           |
| `time_grid → now_line_color`             | string  | `var(--error-color)`   | Color of that line                                                                                                                              |
| `time_grid → max_simultaneous_events`    | number  | `3`                    | Most event lanes drawn side by side before the rest collapse into one `+N` block. Nothing is ever hidden without being counted                  |
| `time_grid → allday_band_max_rows`       | number  | `3`                    | Rows the all-day band may grow to before remaining banners are dropped                                                                          |

**→ [Grid View](/features/grid-view)** — worked examples.

### Options With No Effect in Column View

`date_vertical_alignment` · `today_indicator_position` · `compact_events_to_show` ·
`compact_days_to_show` · `compact_events_complete_days` · per-entity `split_multiday_events`

These describe a date cell or a compact budget that the column layout does not have. They
keep working in list view, including when a `view: column` card falls back to it on a
narrow dashboard, so they are annotated rather than removed.

**→ [Options That Do Nothing in Column View](/features/column-view#options-that-do-nothing-in-column-view)** — why each one, and what to use instead.

### Options With No Effect in Grid View

`compact_events_to_show` · `compact_days_to_show` · `compact_events_complete_days` ·
`split_multiday_events` (card-wide and per-entity)

Compact caps empty later day columns rather than shortening the card, and the grid already
segments multi-day events itself — all-day as one spanning banner, timed as one block per
day — so the list splitter is not used. Unlike column view, grid does not fall back to list
on a narrow dashboard; these keys stay inert while `view: grid`.

**→ [Options That Do Nothing in Grid View](/features/grid-view#options-that-do-nothing-in-grid-view)** — why each one.

### Per-Entity Options

Each item in `entities` may be a plain entity ID string, or an object that overrides
the card-wide settings for that one calendar:

`entity` · `label` · `label_type` · `color` · `accent_color` · `label_icon_color` ·
`show_time` · `show_location` · `location_icon` · `show_description` ·
`compact_events_to_show` · `blocklist` · `allowlist` · `filter_field` ·
`replace_field` · `replace_pattern` · `replace_with` ·
`split_multiday_events` · `event_type` · `allday_expires_at` · `days_of_week`

**→ [Entity configuration options](/features/core-settings#available-options-for-entity-configuration-objects)** — full table, with filtering examples.
**→ [Rewriting what an event says](/features/core-settings#text-replacement)** — `replace_pattern` and `replace_with`, and what each does when the other is left out.
**→ [Choosing how a label is read](/features/core-settings#choosing-how-a-label-is-read)** — when `label_type` is needed, and when it is not.
**→ [Using a picture Home Assistant already serves](/features/core-settings#using-a-picture-home-assistant-already-serves)** — a person's photo or a camera frame as a label, and where to find its address.
**→ [Showing a person's picture](/features/core-settings#showing-a-persons-picture)** — `label: person.anna`, and why only that one domain is read as an entity ID.
**→ [Following the icon from Home Assistant](/features/core-settings#following-the-icon-from-home-assistant)** — `label: home-assistant`, and what a calendar with no icon shows.

## 🏷️ Header

| Option            | Type   | Default                           | Description                                                                                                                                                            |
| ----------------- | ------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`           | string | -                                 | Card title. Accepts a [Home Assistant template](/features/title-templates) — any value containing `{{` or `{%` is rendered by Home Assistant and updates automatically |
| `title_font_size` | string | `--calendar-card-font-size-title` | Card title font size                                                                                                                                                   |
| `title_color`     | string | `--calendar-card-color-title`     | Card title font color                                                                                                                                                  |

**→ [Dynamic titles with templates](/features/title-templates)** — placeholders such as `{event_count}` and `{next_event}`.

## 📏 Layout & Spacing

| Option                    | Type   | Default                | Description                                                                                                                                                                                                                                            |
| ------------------------- | ------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `background_color`        | string | `--ha-card-background` | Card background color                                                                                                                                                                                                                                  |
| `accent_color`            | string | `#03a9f4`              | The calendar's accent: its vertical line, its row tint under `event_background_opacity`, and its all-day badge. Separate from `color`, which sets the event title. Accepts `home-assistant` to follow the color Home Assistant holds for each calendar |
| `vertical_line_width`     | string | `2px`                  | Vertical line separator width                                                                                                                                                                                                                          |
| `day_spacing`             | string | `10px`                 | Space between days — vertical in list view, the gap between columns in column view (replaces `row_spacing`)                                                                                                                                            |
| `event_spacing`           | string | `4px`                  | Vertical padding within each event                                                                                                                                                                                                                     |
| `additional_card_spacing` | string | `0px`                  | Additional top/bottom padding for the card                                                                                                                                                                                                             |
| `height`                  | string | `auto`                 | Sets a fixed, exact height for the calendar content area regardless of content amount. The full card is taller when it has a header or card padding                                                                                                    |
| `max_height`              | string | `none`                 | Allows the calendar content area to grow with content up to this maximum height limit                                                                                                                                                                  |

**→ [Using the Colors From Home Assistant](/features/core-settings#using-the-colors-from-home-assistant)** — what `accent_color: home-assistant` follows, and what calendars without a color fall back to.

Both height options may be overridden inside a `column:` or `time_grid:` block — see
[Height in Column View](/features/layout-appearance#height-in-column-view) and
[Height in Grid View](/features/layout-appearance#height-in-grid-view). In grid view a
fixed `height` compresses the time axis rather than scrolling.

**→ [Layout and appearance](/features/layout-appearance)**

## 📐 Week Numbers & Horizontal Separators

| Option                         | Type    | Default                       | Description                                                                                  |
| ------------------------------ | ------- | ----------------------------- | -------------------------------------------------------------------------------------------- |
| `show_week_numbers`            | string  | `null`                        | Week number display method ('iso', 'simple', or null to disable)                             |
| `show_current_week_number`     | boolean | `true`                        | Whether to show week number for the first/current week in view                               |
| `week_number_font_size`        | string  | `12px`                        | Font size for week number pills                                                              |
| `week_number_color`            | string  | `var(--primary-text-color)`   | Text color for week number pills                                                             |
| `week_number_background_color` | string  | `#03a9f450`                   | Background color for week number pills                                                       |
| `first_day_of_week`            | string  | `system`                      | First day of week ('monday', 'sunday', or 'system' to follow Home Assistant)                 |
| `day_separator_width`          | string  | `0px`                         | Width of separator line between days. Grid view defaults this to `0.5px` inside `time_grid:` |
| `day_separator_color`          | string  | `var(--secondary-text-color)` | Color of separator line between days                                                         |
| `week_separator_width`         | string  | `0px`                         | Width of separator line between weeks                                                        |
| `week_separator_color`         | string  | `#03a9f450`                   | Color of separator line between weeks                                                        |
| `month_separator_width`        | string  | `0px`                         | Width of separator line between months                                                       |
| `month_separator_color`        | string  | `var(--primary-text-color)`   | Color of separator line between months                                                       |

**→ [Week numbers and visual separators](/features/layout-appearance#week-numbers-visual-separators)**

## 🌟 Today Indicator

| Option                     | Type              | Default   | Description                                                                                                                                                               |
| -------------------------- | ----------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `today_indicator`          | boolean or string | `false`   | Today indicator type: `true`/`dot` (basic dot), `pulse` (animated dot), `glow` (glowing effect), custom MDI icon (e.g., `mdi:star`), emoji, image path, or any other text |
| `today_indicator_position` | string            | `15% 50%` | Position of today indicator in CSS-like format (x% y%)                                                                                                                    |
| `today_indicator_color`    | string            | `#03a9f4` | Color of the today indicator                                                                                                                                              |
| `today_indicator_size`     | string            | `6px`     | Size of the today indicator                                                                                                                                               |

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

| Option                          | Type              | Default                                            | Description                                                                                                                                                                                                                                                         |
| ------------------------------- | ----------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `event_background_opacity`      | number            | `0`                                                | Background opacity (0-100) for events using entity accent color. Grid view defaults this to `20` inside `time_grid:`                                                                                                                                                |
| `event_icon_vertical_alignment` | string            | `top`                                              | Vertical alignment of event icons (time, location, description): `top`, `middle`, or `bottom`                                                                                                                                                                       |
| `show_past_events`              | boolean           | `false`                                            | Whether to show events that have already ended. Grid view defaults this to `true` inside `time_grid:`                                                                                                                                                               |
| `show_countdown`                | boolean           | `false`                                            | Show how much time remains until an event starts                                                                                                                                                                                                                    |
| `show_countdown_allday`         | boolean           | `true`                                             | Whether the countdown is also shown for all-day events (requires `show_countdown`)                                                                                                                                                                                  |
| `show_progress_bar`             | boolean           | `false`                                            | Whether to show a progress bar for currently running events                                                                                                                                                                                                         |
| `progress_bar_color`            | string            | `var(--secondary-text-color)`                      | Color of the progress bar                                                                                                                                                                                                                                           |
| `progress_bar_height`           | string            | `calc(var(--calendar-card-font-size-time) * 0.75)` | Height of the progress bar                                                                                                                                                                                                                                          |
| `progress_bar_width`            | string            | _per placement_                                    | Width of the progress bar. Unset, each layout uses its own: `60px` on the time row in list view, `80%` of the column in column view, where the bar takes a row of its own. Grid view defaults this to `100%` inside `time_grid:`. A value here replaces all of them |
| `empty_day_color`               | string            | `--primary-text-color`                             | Color for "No events" text on empty days                                                                                                                                                                                                                            |
| `event_font_size`               | string            | `14px`                                             | Event title font size                                                                                                                                                                                                                                               |
| `title_max_lines`               | number            | `0`                                                | Maximum number of lines to show for event titles (0 = unlimited). Truncated text shows `...`                                                                                                                                                                        |
| `event_color`                   | string            | `--primary-text-color`                             | Event title font color                                                                                                                                                                                                                                              |
| `show_time`                     | boolean           | `true`                                             | Whether to show event times                                                                                                                                                                                                                                         |
| `show_single_allday_time`       | boolean           | `true`                                             | Whether to show time display for all-day single-day events                                                                                                                                                                                                          |
| `show_multiday_allday_time`     | boolean           | `true`                                             | Whether to show the time row for all-day events spanning several days. That row carries the end date, so it is a separate setting. Timed multi-day events are unaffected                                                                                            |
| `allday_badge`                  | string            | `off`                                              | Where the all-day pill is drawn: `off` for plain text, `title` to wrap the event title, or `time` to replace the all-day label beside the clock. A title pill is kept to one line and shortened with an ellipsis                                                    |
| `allday_badge_style`            | string            | `subtle`                                           | Which shape draws the pill: `subtle`, `outline`, `tinted` or `filled`. Ignored while `allday_badge` is `off`                                                                                                                                                        |
| `allday_badge_color`            | string            | `accent`                                           | Which color that shape is drawn in: `accent` for each calendar's own, `text` for the color the row already uses, or any CSS color. Ignored while `allday_badge` is `off`                                                                                            |
| `time_24h`                      | boolean           | `System`                                           | Whether to use 24-hour time format (auto-detects from HA)                                                                                                                                                                                                           |
| `time_two_digit_hours`          | boolean           | `false`                                            | Whether to use 2 digits in hours                                                                                                                                                                                                                                    |
| `show_end_time`                 | boolean           | `true`                                             | Whether to show event end times                                                                                                                                                                                                                                     |
| `time_icon_size`                | string            | `14px`                                             | Clock icon size (replaces time_location_icon_size)                                                                                                                                                                                                                  |
| `time_font_size`                | string            | `12px`                                             | Event time font size                                                                                                                                                                                                                                                |
| `time_color`                    | string            | `--secondary-text-color`                           | Event time font color                                                                                                                                                                                                                                               |
| `time_max_lines`                | number            | `0`                                                | Maximum number of lines to show for event times (0 = unlimited). Truncated text shows `...`                                                                                                                                                                         |
| `show_location`                 | boolean           | `true`                                             | Whether to show event locations                                                                                                                                                                                                                                     |
| `show_location_allday`          | boolean           | `true`                                             | Whether locations are also shown for all-day events (requires `show_location`)                                                                                                                                                                                      |
| `remove_location_country`       | boolean or string | `false`                                            | Whether to remove country names from locations. Can be boolean (`true`/`false`) or a regex pattern string (e.g., `"USA \| United States \| Canada"`) to specify which countries to remove                                                                           |
| `location_icon_size`            | string            | `14px`                                             | Location icon size (replaces time_location_icon_size)                                                                                                                                                                                                               |
| `location_font_size`            | string            | `12px`                                             | Event location font size                                                                                                                                                                                                                                            |
| `location_color`                | string            | `--secondary-text-color`                           | Event location font color                                                                                                                                                                                                                                           |
| `location_max_lines`            | number            | `0`                                                | Maximum number of lines to show for event locations (0 = unlimited). Truncated text shows `...`                                                                                                                                                                     |
| `show_description`              | boolean           | `false`                                            | Whether to show event descriptions                                                                                                                                                                                                                                  |
| `show_description_allday`       | boolean           | `true`                                             | Whether descriptions are also shown for all-day events (requires `show_description`)                                                                                                                                                                                |
| `description_icon_size`         | string            | `14px`                                             | Description icon size                                                                                                                                                                                                                                               |
| `description_font_size`         | string            | `12px`                                             | Event description font size                                                                                                                                                                                                                                         |
| `description_color`             | string            | `--secondary-text-color`                           | Event description font color                                                                                                                                                                                                                                        |
| `description_max_lines`         | number            | `0`                                                | Maximum number of lines to show for event descriptions (0 = unlimited). Truncated text shows `...`                                                                                                                                                                  |

**→ [Event content](/features/event-content)** · **[Multi-day events](/features/multi-day-events)** · **[Start date offset](/features/start-date-offset)**

## 🌦️ Weather

| Option               | Type   | Default | Description                                                                                                                       |
| -------------------- | ------ | ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `weather`            | object | -       | Weather configuration object containing the settings below                                                                        |
| `weather → entity`   | string | -       | Home Assistant weather entity to use for forecasts                                                                                |
| `weather → position` | string | `date`  | Where to show weather data: `none` (nowhere), `date` (in the day header), `event` (next to events), or `both` (in both positions) |
| `weather → date`     | object | -       | Configuration for weather display in the day header                                                                               |
| `weather → event`    | object | -       | Configuration for weather display next to events                                                                                  |

### Weather Position Options

`weather → date` and `weather → event` each take their own styling object. The two
scopes accept different options, because a date cell shows a daily forecast and an event
shows the forecast for its own start time:

| Scope             | Accepted options                                                                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `weather → date`  | `show_conditions` · `show_high_temp` · `show_low_temp` · `show_uv_index` · `uv_index_threshold` · `icon_size` · `font_size` · `color`                    |
| `weather → event` | `show_conditions` · `show_temp` · `show_uv_index` · `uv_index_threshold` · `daily_forecast_fallback` · `max_lines` · `icon_size` · `font_size` · `color` |

`show_conditions` means something different in each layout. In the list layout it shows
the condition icon. In the column and grid layouts the event forecast has a row of its own,
sharing a leading icon edge with the time and location, so the icon is always shown
there and `show_conditions` writes the condition out in words instead. That row separates
its pieces with a middot and reads `21° · Partly cloudy`.
`weather → event → max_lines` limits how many lines those words may occupy, with `0`
meaning no limit.

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
