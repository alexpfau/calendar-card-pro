# Examples

This section provides different **configuration setups** to help you get started with **Calendar Card Pro**.

## 📅 Basic Configuration

A simple setup displaying events from a **single calendar**. Automatically **adapts to themes** and **dark/light mode**.

**With Home Assistant default theme** (light mode):  
<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_1_basic_native.png" alt="Basic Configuration" width="600">

**Using the [iOS Theme](https://github.com/basnijholt/lovelace-ios-themes)** (ios-dark-mode-blue-red-alternative):  
<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_1_basic_ios.png" alt="Basic Configuration" width="600">

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.family
days_to_show: 3
show_location: false
show_month: false
```

## 🗂️ Multiple Calendars with Compact Mode

This setup includes **multiple calendars**, each with a **custom color**. The **compact mode** ensures that only a limited number of events are shown at once. Screenshots again showing the **[iOS Theme](https://github.com/basnijholt/lovelace-ios-themes)** (ios-dark-mode-blue-red-alternative).

**Compact view**:  
<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_2_advanced_compact.png" alt="Advanced Configuration" width="600">

**After tap ➡️ expanded view**:  
<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_2_advanced_expanded.png" alt="Advanced Configuration" width="600">

```yaml
type: custom:calendar-card-pro
title: Upcoming events
entities:
  - entity: calendar.family
    color: '#ff6c92' # Red for family events
  - entity: calendar.work
    color: '#86ebda' # Blue for work events
  - entity: calendar.personal
    color: '#c2ffb3' # Green for personal events
days_to_show: 7
compact_events_to_show: 3 # Always only show 3 events
tap_action:
  action: expand # Tap to expand/collapse
```

## 🌈 Multiple Calendars with Custom Styling

This example demonstrates how to use **accent colors** and **background opacity** to create visual distinction between different calendars. The accent colors are used for both the vertical line and a semi-transparent background.

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_3_custom_styling.png" alt="Custom Styling" width="600">

```yaml
type: custom:calendar-card-pro
entities:
  - entity: calendar.family
    accent_color: '#ff6c92'
  - entity: calendar.work
    accent_color: '#1e88e5'
  - entity: calendar.personal
    accent_color: '#43a047'
days_to_show: 5
compact_events_to_show: 5
event_background_opacity: 20
vertical_line_width: 5px
event_spacing: 6px
```

## 📆 Multiple Calendars with Week Numbers and Separators

This configuration showcases the **week number display** and **visual separators** features. It creates a clear hierarchy with different separator widths for weeks and months.

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_4_week_numbers.png" alt="Week Numbers and Separators" width="600">

```yaml
type: custom:calendar-card-pro
entities:
  - entity: calendar.personal
    accent_color: '#03a9f4'
  - entity: calendar.family
    accent_color: '#ff6c92'
days_to_show: 5
compact_events_to_show: 5
vertical_line_width: 5px
event_spacing: 5px
show_week_numbers: iso
week_separator_width: 1px
week_separator_color: '#03a9f450'
month_separator_width: 1.5px
month_separator_color: var(--secondary-text-color)
```

## 🎨 Full Configuration

A heavily **customized** configuration covering **styling, layout, and interactions**. Though you could **go all out**—and I didn’t—and create a **completely different look** if you wanted. Screenshot using the beautiful **[Bubble Theme](https://github.com/Clooos/Bubble)**.

It touches most of the card, but not literally every option — the [configuration reference](/reference/configuration) is the complete list.

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_5_complete.png" alt="Complete Configuration" width="600"><br>

```yaml
type: custom:calendar-card-pro

# Core Settings
entities:
  - entity: calendar.family
    color: '#ffdaea'
  - entity: calendar.work
    color: '#b3ffd9'
start_date: today
days_to_show: 10
compact_events_to_show: 10
language: en

# Header
title: 📅 Full Calendar Demo
title_font_size: 26px
title_color: '#baf1ff'

# Layout and Spacing
background_color: '#eeeeee50'
accent_color: '#baf1ff'
vertical_line_width: 0px
day_spacing: 10px
additional_card_spacing: 0px

# Week Numbers and Horizontal Separators
day_separator_width: 2px
day_separator_color: '#baf1ff80'

# Date Column
date_vertical_alignment: middle
weekday_font_size: 14px
weekday_color: '#baf1ff'
day_font_size: 32px
day_color: '#baf1ff'
show_month: true
month_font_size: 12px
month_color: '#baf1ff'

# Event Column
show_past_events: false
event_font_size: 14px
event_color: '#baf1ff'
time_24h: true
time_two_digit_hours: false
show_end_time: true
time_font_size: 12px
time_color: '#baf1ff'
time_icon_size: 14px
show_location: true
remove_location_country: true
location_font_size: 12px
location_color: '#baf1ff'
location_icon_size: 14px

# Actions
tap_action:
  action: expand
hold_action:
  action: navigate
  navigation_path: calendar

# Cache and Refresh
refresh_interval: 15 # Auto-refresh events every 15 minutes
```
