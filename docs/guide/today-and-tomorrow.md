# Today & Tomorrow

Today and tomorrow on an hour axis, for the breakfast question: where are we in the day, and what is still to come? One card fits a phone, a narrow dashboard section and a portrait kitchen tablet.

## 🖼️ See It

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/story_today_and_tomorrow.png" alt="One two-day grid card at three widths, on a phone, in a dashboard section and on a portrait tablet: today and tomorrow from 07:00 to 21:00 as colored blocks with faces, the hour's temperature on events with room for it and the forecast above each column"><br>

A phone, a dashboard section and an 800px portrait tablet.

## 📋 Copy the Card

```yaml
type: custom:calendar-card-pro
config_version: 5
title: Today & Tomorrow
view: grid
days_to_show: 2
filter_duplicates: true
duplicate_accent_color: '#ffb74d'
show_progress_bar: true
weather:
  entity: weather.home
  position: both
  event:
    show_conditions: false
toolbar:
  show: true
  view_switcher: false
  legend: false
event_tap_action:
  action: details
entities:
  - entity: calendar.anna
    label: person.anna
    accent_color: '#ff6c92'
  - entity: calendar.ben
    label: person.ben
    accent_color: '#03a9f4'
  - entity: calendar.leo
    label: person.leo
    accent_color: '#66bb6a'
  - entity: calendar.work
    label: person.ben
    accent_color: '#90a4ae'
  - entity: calendar.family
    accent_color: '#ffb74d'
time_grid:
  start_time: '07:00'
  end_time: '21:00'
  hour_height: 56px
  slot_minutes: 30
  event_font_size: 13px
```

Replace the `calendar.*` ids, the `person.*` labels and `weather.home` with your own. Grid leaves locations off its blocks by default; the dialog shows them.

## 🧭 What It Adds

| Editor                                        | YAML                                                                                                             | What it adds                                                                                       |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Layout › Card Displays · Time Range & Content | `view: grid`, `days_to_show: 2`                                                                                  | Two days on one hour axis                                                                          |
| Layout › Time Axis · Events                   | `start_time` / `end_time`, `hour_height: 56px`, `slot_minutes: 30`, `event_font_size: 13px`, `show_progress_bar` | 07:00 to 21:00, ruled every half hour, readable across a kitchen; a bar on the running event       |
| Time Range & Content · Calendars              | `filter_duplicates`, `duplicate_accent_color`, labels and colors                                                 | A face and color per person; shared plans once, in gold                                            |
| Weather                                       | `position: both`, `event.show_conditions: false`                                                                 | The day's forecast over each column; the hour's icon and temperature in each timed event with room |
| Card & Header › Toolbar                       | `legend: false`, `view_switcher: false`                                                                          | Add, refresh, paging and the date picker; no filter or layout switch                               |
| Actions & Refresh                             | `event_tap_action: details`                                                                                      | The whole event on tap, with Edit and Delete where the calendar allows, but not on a shared plan   |

## 🔀 Adapt It

- **Other hours.** `start_time` and `end_time` are hard bounds: an event wholly outside them is not drawn.
- **Read only.** `allow_event_edit: false` and `allow_event_delete: false` take Edit and Delete out of the dialog.
- **Lanes on a tablet.** `overlap_layout: columns` inside `time_grid:` puts overlaps side by side, which a phone cramps.

## 📚 Next Steps

- [Grid View](/features/grid-view) — the axis, its hours and how overlaps are drawn
- [Weather in the Grid Layout](/features/weather#weather-in-the-grid-layout) — both forecast positions
- [Editing & Deleting Events](/features/actions#editing-deleting-events) — what the dialog offers
- [Configuration Reference](/reference/configuration) — every option
