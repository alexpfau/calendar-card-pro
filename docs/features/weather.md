# Weather Integration

Calendar Card Pro can display weather forecasts alongside your calendar events, providing a complete view of both your schedule and the expected weather conditions.

::: tip Visual Editor
Access all weather settings in the "Weather Integration" section of the editor, where you can select your weather entity and configure display options for both date and event positions.
:::

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.family
days_to_show: 5
weather:
  entity: weather.forecast_home
  position: both # Options: 'date', 'event', or 'both'
  date:
    # Date column shows condition icon and high temperature only
    show_conditions: true
    show_high_temp: true
    show_low_temp: false
    icon_size: '16px'
    font_size: '14px'
    color: '#3498db'
  event:
    # Event row shows just the temperature. In the list layout that means no icon;
    # the column layout always keeps the icon (see Weather In The Column Layout).
    show_conditions: false
    show_temp: true
    font_size: '13px'
    color: 'var(--secondary-text-color)'
```

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_weather.png" alt="Weather Integration" width="600"><br>

This flexible configuration allows you to create a personalized experience that shows exactly the weather information you need, where you need it.

## ⚙️ Weather Configuration Options

| Option                            | Type    | Default                     | Description                                                                                 |
| --------------------------------- | ------- | --------------------------- | ------------------------------------------------------------------------------------------- |
| `entity`                          | string  | -                           | Weather entity to use for forecasts                                                         |
| `position`                        | string  | `date`                      | Where to show weather data: `'date'` (date column), `'event'` (next to events), or `'both'` |
| `date → show_conditions`          | boolean | `true`                      | Whether to show weather condition icons in date column                                      |
| `date → show_high_temp`           | boolean | `true`                      | Whether to show high temperature in date column                                             |
| `date → show_low_temp`            | boolean | `false`                     | Whether to show low temperature in date column. The UV index takes this place on days it is shown |
| `date → show_uv_index`            | boolean | `false`                     | Whether to show UV index in date column                                                     |
| `date → uv_index_threshold`       | number  | `0`                         | Only show UV index when it exceeds this value (0 = always show when enabled)                |
| `date → icon_size`                | string  | `14px`                      | Size of weather icons in date column                                                        |
| `date → font_size`                | string  | `12px`                      | Size of weather text in date column                                                         |
| `date → color`                    | string  | `var(--primary-text-color)` | Color of weather text and icons in date column. Matches the weekday, day number and month it sits beside |
| `event → show_conditions`         | boolean | `true`                      | List layout: whether to show the condition icon. Column layout: whether to state the condition in words — the icon is always shown |
| `event → show_temp`               | boolean | `true`                      | Whether to show temperature in event column                                                 |
| `event → show_uv_index`           | boolean | `false`                     | Whether to show UV index in event column                                                    |
| `event → uv_index_threshold`      | number  | `0`                         | Only show UV index when it exceeds this value (0 = always show when enabled)                |
| `event → daily_forecast_fallback` | boolean | `true`                      | Fall back to the daily forecast for timed events beyond the hourly forecast horizon         |
| `event → max_lines`               | number  | `0`                         | Maximum number of lines the event weather row may use (0 = unlimited). Truncated text shows `...` |
| `event → icon_size`               | string  | `14px`                      | Size of weather icons in event column                                                       |
| `event → font_size`               | string  | `12px`                      | Size of weather text in event column                                                        |
| `event → color`                   | string  | `var(--secondary-text-color)` | Color of weather text and icons beside events. Matches the time and location it sits beside |

These sit under the card's `weather` option — see [Weather in the configuration reference](/reference/configuration#weather).

## 📍 Weather Display Positions

You can choose where weather information appears in your calendar:

- `date`: Shows daily forecasts in the date column (left side)
- `event`: Shows hourly forecasts next to event titles
- `both`: Displays weather in both positions simultaneously

::: info How Far Forecasts Reach
Home Assistant weather entities typically provide hourly forecasts for about two days
ahead, while daily forecasts reach much further (six days or more, depending on the
provider). Beyond the hourly horizon, timed events fall back to that day's daily
forecast so weather keeps appearing across the whole calendar. Set
`event → daily_forecast_fallback: false` if you would rather show nothing than a daily
value. All-day events always use the daily forecast.
:::

## 🧭 Position-Specific Configuration

Each display position can be customized independently with different content and styling:

**Date Column Weather:**

- `show_conditions`: Show weather condition icon (sun, cloud, rain, etc.)
- `show_high_temp`: Show high temperature
- `show_low_temp`: Show low temperature. The UV index takes this place on days it is shown
- `show_uv_index`: Show UV index
- `uv_index_threshold`: Minimum UV index value to display (0 = always)
- `icon_size`: Weather icon size
- `font_size`: Temperature text size
- `color`: Text and icon color

**Event Weather:**

- `show_conditions`: Show the weather condition — as an icon in the list layout, in
  words in the column layout
- `show_temp`: Show temperature
- `show_uv_index`: Show UV index
- `uv_index_threshold`: Minimum UV index value to display (0 = always)
- `daily_forecast_fallback`: Use the daily forecast for timed events beyond the hourly forecast horizon
- `max_lines`: Line limit for the event weather row (0 = unlimited)
- `icon_size`: Weather icon size
- `font_size`: Temperature text size
- `color`: Text and icon color

## 🧭 Weather In The Column Layout

The column layout gives each event's forecast a row of its own, beneath the time and
above the location, instead of putting it on the title row beside the summary. A column
track is as narrow as 152px, and a badge on the title row competes with the summary for
that width — a two-word title breaks into three lines around it.

That row shares a leading icon edge with the time, location and description rows, so
**the condition icon is always shown there**. `show_conditions` instead decides whether
the condition is also stated in words:

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.family
view: column
weather:
  entity: weather.forecast_home
  position: event
  event:
    show_conditions: true # Column layout: states the condition in words
    show_temp: true
    show_uv_index: true
    max_lines: 1 # Keep the row to one line, truncating the words if needed
```

The pieces are separated by a middot, in the order the icon, the temperature, the UV
index and finally the words — so the example above reads `21° · UV4 · Partly cloudy`.
Only the pieces you switched on appear, and the separator appears only between two of
them, never after the icon.

A middot rather than a comma, because Home Assistant's own condition vocabulary
contains `Clear, night`: with a comma there would be nothing to tell the card's
separators apart from the one inside the translated condition. It is also why the
condition keeps the capital letter Home Assistant gave it — each piece reads as a label
of its own rather than as a sentence.

The words come from Home Assistant, in whatever language it is set to, so a German
instance reads `21° · Teilweise bewölkt` with no extra configuration. An instance too
old to provide them simply shows the icon and the temperature.

The row also takes its color from the time and location rows above it rather than from
the event title, so it reads as one of the event's detail rows. Set
`weather → event → color` to override that for both layouts.

On a track too narrow to hold the whole row, the words move to a line of their own
beneath the numbers rather than being squeezed into whatever space is left beside them,
and that second line starts under the temperature — not under the icon — so the row
still reads as one block of text. The temperature and the UV index are never truncated
and never wrap; the condition is the only part that gives up room, and it gives up a
whole line rather than a few characters at a time. `max_lines` caps how tall the row may
grow — `0`, the default, lets it wrap as far as it needs, and `1` keeps it on a single
line with an ellipsis.

The words are also left unhyphenated, unlike the title and location. Those are text you
wrote and may have no break opportunity in them at all, so hyphenating beats overflowing;
the condition is short generated text with a better answer available, and hyphenating it
only ever produced readings like `Sun-` / `ny`.

::: tip Same Card, Both Layouts
A column card falls back to the list layout on a narrow screen, where the same
`show_conditions` value shows or hides the icon in the usual way. One setting, and it
does the right thing in each layout rather than needing an exception.
:::

## ✨ Benefits & Use Cases

Weather integration is particularly useful for:

- Planning outdoor activities based on weather conditions
- Seeing at a glance if you'll need an umbrella for your appointments
- Preparing for weather changes during multi-day events
- Quickly checking the forecast for specific event times

The feature automatically matches weather data to the correct time periods:

- Daily forecasts for the date column
- Hourly forecasts for specific event times
