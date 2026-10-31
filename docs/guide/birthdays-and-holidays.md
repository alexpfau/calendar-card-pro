# Birthdays & Holidays

Two months of birthdays and holidays, for a dashboard section or a pop-up: whose birthday is next, how old they turn, and when the next break starts and ends. The ages come from the calendar entries, with nothing to set up on the card.

## 🖼️ See It

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/story_birthdays_and_holidays.png" alt="A list card titled Coming Up showing two months of birthdays and holidays: each birthday with a cake emoji and the age after the name, each holiday with a party emoji, a countdown under every one still to come, a holiday of several days showing when it ends, and a thin rule between the months" width="600"><br>

Birthdays in pink, holidays in teal, and a rule where one month ends.

## 📋 Copy the Card

```yaml
type: custom:calendar-card-pro
config_version: 5
title: Coming Up
days_to_show: 60
show_countdown: true
show_single_allday_time: false
month_separator_width: 1px
day_spacing: 4px
event_gap: 4px
vertical_line_width: 4px
event_tap_action:
  action: details
entities:
  - entity: calendar.birthdays
    label: 🎂
    accent_color: '#f06292'
  - entity: calendar.holidays
    label: 🎉
    accent_color: '#26a69a'
```

Replace the two `calendar.*` ids with your own birthday and holiday calendars.

For the ages, write the birth year into each birthday's description as `YEAR=1990`. The card adds the age to the title, `(36)` in 2026, and counts up by itself every year. A tap opens the entry as the calendar stores it, so the dialog shows the title without the age.

## 🧭 What It Adds

| Editor                     | YAML                                                                           | What it adds                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Time Range & Content       | `days_to_show: 60`                                                             | Two months ahead; days with nothing on them stay hidden                                                                                                   |
| Events                     | `show_countdown`, `show_single_allday_time: false`, `vertical_line_width: 4px` | How far away each event still to come is; no "All day" line under a one-day event, while a holiday of several days still shows when it ends; a bolder bar |
| Separators · Layout        | `month_separator_width: 1px`, `day_spacing: 4px`, `event_gap: 4px`             | A rule between months; days close together, each event with a bar of its own                                                                              |
| Calendars › Label & Colors | `label`, `accent_color`                                                        | A 🎂 or 🎉 before each title, in its calendar's color                                                                                                     |
| Actions & Refresh          | `event_tap_action: details`                                                    | The calendar's entry on tap                                                                                                                               |

## 🔀 Adapt It

- **Fixtures & school terms.** A team's fixtures or a school's term dates are the same shape: add the calendar as a third entry with an emoji and a color of its own.
- **Anniversaries.** The same `YEAR=` marker counts the years since a wedding.
- **Further ahead.** Raise `days_to_show`; the month rules keep a long list readable.

## 📚 Next Steps

- [Birthday Ages & Anniversary Counts](/features/event-content#birthday-ages-anniversary-counts) — how to write the marker, and what the card does with it
- [Countdown Display](/features/event-content#countdown-display) — the wording under each event
- [Week Numbers & Visual Separators](/features/layout-appearance#week-numbers-visual-separators) — the rule between months
- [Tapping an Event](/features/actions#tapping-an-event) — what the dialog shows
- [Configuration Reference](/reference/configuration) — every option
