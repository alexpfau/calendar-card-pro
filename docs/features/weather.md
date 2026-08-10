# 🌦️ Weather Integration

Calendar Card Pro can display weather forecasts alongside your calendar events, providing a complete view of both your schedule and the expected weather conditions.

> **Visual Editor:** Access all weather settings in the "Weather Integration" section of the editor, where you can select your weather entity and configure display options for both date and event positions.

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
    # Event row shows just the temperature (no icon)
    show_conditions: false
    show_temp: true
    font_size: '13px'
    color: 'var(--secondary-text-color)'
```

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_weather.png" alt="Weather Integration" width="600"><br>

This flexible configuration allows you to create a personalized experience that shows exactly the weather information you need, where you need it.

## Weather Configuration Options

| Option                            | Type    | Default                     | Description                                                                                 |
| --------------------------------- | ------- | --------------------------- | ------------------------------------------------------------------------------------------- |
| `entity`                          | string  | -                           | Weather entity to use for forecasts                                                         |
| `position`                        | string  | `date`                      | Where to show weather data: `'date'` (date column), `'event'` (next to events), or `'both'` |
| `date → show_conditions`          | boolean | `true`                      | Whether to show weather condition icons in date column                                      |
| `date → show_high_temp`           | boolean | `true`                      | Whether to show high temperature in date column                                             |
| `date → show_low_temp`            | boolean | `false`                     | Whether to show low temperature in date column                                              |
| `date → show_uv_index`            | boolean | `false`                     | Whether to show UV index in date column                                                     |
| `date → uv_index_threshold`       | number  | `0`                         | Only show UV index when it exceeds this value (0 = always show when enabled)                |
| `date → icon_size`                | string  | `14px`                      | Size of weather icons in date column                                                        |
| `date → font_size`                | string  | `12px`                      | Size of weather text in date column                                                         |
| `date → color`                    | string  | `var(--primary-text-color)` | Color of weather text and icons in date column                                              |
| `event → show_conditions`         | boolean | `true`                      | Whether to show weather condition icons in event column                                     |
| `event → show_temp`               | boolean | `true`                      | Whether to show temperature in event column                                                 |
| `event → show_uv_index`           | boolean | `false`                     | Whether to show UV index in event column                                                    |
| `event → uv_index_threshold`      | number  | `0`                         | Only show UV index when it exceeds this value (0 = always show when enabled)                |
| `event → daily_forecast_fallback` | boolean | `true`                      | Fall back to the daily forecast for timed events beyond the hourly forecast horizon         |
| `event → icon_size`               | string  | `14px`                      | Size of weather icons in event column                                                       |
| `event → font_size`               | string  | `12px`                      | Size of weather text in event column                                                        |
| `event → color`                   | string  | `var(--primary-text-color)` | Color of weather text and icons in event column                                             |

These sit under the card's `weather` option — see [Weather in the configuration reference](/reference/configuration#weather).

## Weather Display Positions

You can choose where weather information appears in your calendar:

- `date`: Shows daily forecasts in the date column (left side)
- `event`: Shows hourly forecasts next to event titles
- `both`: Displays weather in both positions simultaneously

> [!NOTE]
> Home Assistant weather entities typically provide hourly forecasts for about two days
> ahead, while daily forecasts reach much further (six days or more, depending on the
> provider). Beyond the hourly horizon, timed events fall back to that day's daily
> forecast so weather keeps appearing across the whole calendar. Set
> `event → daily_forecast_fallback: false` if you would rather show nothing than a daily
> value. All-day events always use the daily forecast.

## Position-Specific Configuration

Each display position can be customized independently with different content and styling:

**Date Column Weather:**

- `show_conditions`: Show weather condition icon (sun, cloud, rain, etc.)
- `show_high_temp`: Show high temperature
- `show_low_temp`: Show low temperature
- `show_uv_index`: Show UV index
- `uv_index_threshold`: Minimum UV index value to display (0 = always)
- `icon_size`: Weather icon size
- `font_size`: Temperature text size
- `color`: Text and icon color

**Event Weather:**

- `show_conditions`: Show weather condition icon
- `show_temp`: Show temperature
- `show_uv_index`: Show UV index
- `uv_index_threshold`: Minimum UV index value to display (0 = always)
- `daily_forecast_fallback`: Use the daily forecast for timed events beyond the hourly forecast horizon
- `icon_size`: Weather icon size
- `font_size`: Temperature text size
- `color`: Text and icon color

## Benefits and Use Cases

Weather integration is particularly useful for:

- Planning outdoor activities based on weather conditions
- Seeing at a glance if you'll need an umbrella for your appointments
- Preparing for weather changes during multi-day events
- Quickly checking the forecast for specific event times

The feature automatically matches weather data to the correct time periods:

- Daily forecasts for the date column
- Hourly forecasts for specific event times
