# Now & Next

A small tile with no title and no toolbar, for the top of a phone dashboard: what is on now, and what comes next? It is the maintainer's own card, showing today and tomorrow four events at a time.

## 🖼️ See It

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/story_now_and_next.png" alt="Two phone screenshots in dark mode: the compact card showing the first four of today's events with their faces, a progress bar on the two under way and a countdown on the next, and the same card tapped open, adding tomorrow's events"><br>

Collapsed on the left, tapped open on the right.

## 📋 Copy the Card

```yaml
type: custom:calendar-card-pro
config_version: 5
days_to_show: 2
filter_duplicates: true
show_empty_today: true
show_countdown: true
show_progress_bar: true
show_location: false
show_end_time: false
scroll_long_titles: true
event_gap: 4px
tap_action:
  action: expand
entities:
  - entity: calendar.anna
    label: person.anna
  - entity: calendar.ben
    label: person.ben
  - entity: calendar.leo
    label: person.leo
  - entity: calendar.family
list:
  compact_events_to_show: 4
```

Replace the `calendar.*` ids with your own calendars and the `person.*` labels with the people in your home.

::: tip Tap the Card to See the Rest
Nothing on the card says that more events are waiting. Tap it to see them all, and tap again to fold it back.
:::

## 🧭 What It Adds

| Editor               | YAML                                                                                                        | What it adds                                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Time Range & Content | `days_to_show: 2`, `list.compact_events_to_show: 4`, `show_empty_today`, `filter_duplicates`                | Today and tomorrow, four events until tapped; a free today still says so; a shared plan appears once              |
| Actions & Refresh    | `tap_action: expand`                                                                                        | A tap shows the rest, another folds it back                                                                       |
| Events               | `show_countdown`, `show_progress_bar`, `show_location: false`, `show_end_time: false`, `scroll_long_titles` | "in 2 hours"; how far along a running event is; two short lines per event; long titles scroll instead of wrapping |
| Layout · Calendars   | `event_gap: 4px`, `person.*` labels                                                                         | Separate bars; a face per person, in the theme's accent                                                           |

::: info Why Events Do Not Open on Tap
`event_tap_action: details` is left out on purpose. A tap on an event wins over the card's tap, and events cover most of this card, so most taps would open a dialog instead of expanding. `hold_action: expand` would avoid that, but a hold cannot be made from the keyboard.
:::

## 🔀 Adapt It

- **More or fewer at a glance.** Change `compact_events_to_show` inside `list:`. A tap always shows everything in `days_to_show`.
- **A color per person.** Add `accent_color` to each calendar, as the [Family Hub](/guide/family-calendar) does.
- **Icons instead of faces.** A `label` can also be an emoji or an `mdi:` icon.

## 📚 Next Steps

- [Expandable Calendar Card](/features/actions#expandable-calendar-card) — compact mode and the expand action
- [Compact Mode & Event Limits](/features/core-settings#compact-mode-event-limits) — card-wide and per-calendar limits
- [Countdown Display](/features/event-content#countdown-display), [Progress Bar Display](/features/event-content#progress-bar-display) and [Scrolling Long Titles](/features/event-content#scrolling-long-titles) — the event options
- [Configuration Reference](/reference/configuration) — every option
