# Event Content & Display

These options control what each event actually shows — its title, times, location, description, countdown and progress — and how the card behaves on days that have no events at all.

## 📅 Calendar Events Display

Control how event information is presented on your calendar:

```yaml
# Event title appearance
event_font_size: '14px'
event_color: 'var(--primary-text-color)'

# Empty days display
show_empty_days: true # Show days with no events
empty_day_text: 'Leftovers' # Replaces "No upcoming events" on any empty day
empty_day_color: 'var(--secondary-text-color)' # Color for "No events" text

# Or remove the card entirely when there is nothing to show
hide_when_empty: true
```

When `show_empty_days` is set to `true`, days without events will display a "No events" message. This helps maintain visual consistency across your calendar, especially when showing longer date ranges.

### Custom Empty-Day Text

The default message is deliberately neutral, but an empty day often means something specific to you. A meal-plan calendar reads far better with "Leftovers" than with "No upcoming events", and the point of showing the day at all is to keep the week's layout stable rather than letting it collapse.

The **`empty_day_text`** option replaces that message on every day the card renders as empty, and falls back to the translated default when unset. It applies wherever an empty day appears: a gap in the middle of a planned week, an entire range with nothing scheduled, or the single row the card shows for today when `show_empty_days` is off and there is nothing at all to display.

```yaml
days_to_show: 7
show_empty_days: true
empty_day_text: 'Leftovers'
```

By default, empty days are prefixed with a ✓ so they read as "nothing on". That prefix is dropped as soon as you set your own text, since a string such as "Leftovers" already carries its own meaning.

::: info Wording Only, Never Layout
`empty_day_text` changes only the wording, never the layout. Whether an empty day appears at all — and how many — is decided by `show_empty_days`, and its color by `empty_day_color`.
:::

The `empty_day_color` option lets you customize the color of this message to match your theme or stand out as needed.

If you would rather the card disappear completely instead of showing "No upcoming events", set `hide_when_empty: true`. The card removes itself from the dashboard whenever it has no events to display, and surrounding cards close the gap. It reappears automatically as soon as an event shows up, and always stays visible while you are editing the dashboard so you can still select and configure it.

Hiding takes precedence over anything that only decorates an empty day: `show_empty_days` fills the range with "No events" placeholders, but those placeholders are not events, so a card with nothing but empty days still hides. The same applies to `empty_day_text` — a hidden card shows nothing at all, custom text included. If you want your own wording to be visible, leave `hide_when_empty` off.

::: info What Never Triggers Hiding
Compact mode limits never trigger hiding — a card limited to zero events with `compact_events_to_show: 0` stays visible so it can still be expanded. Configuration errors, such as a missing calendar entity, also remain visible so problems are not hidden silently.

The same applies when a calendar cannot be reached. A failed request leaves the event list empty, but that is not the same thing as an empty calendar, so the card never vanishes because of a temporary outage. If events are already on screen they stay there until a refresh succeeds, and if there is nothing to fall back on the card reports the problem instead of claiming there are no upcoming events.
:::

## ⏱️ Time & Location Information

Configure how event times and locations are displayed:

```yaml
# Time display options
show_time: true # Show event start/end times
show_single_allday_time: false # Hide time for single-day all-day events
time_24h: false # Use 12-hour format (AM/PM)
time_two_digit_hours: false # Use 2 digits in hours
show_end_time: true # Show event end time
time_font_size: '12px'
time_color: 'var(--secondary-text-color)'
time_icon_size: '14px'

# Location display options
show_location: true
remove_location_country: true # Remove country names from addresses
location_font_size: '12px'
location_color: 'var(--secondary-text-color)'
location_icon_size: '14px'
```

The `remove_location_country` option offers three modes:

```yaml
# Option 1: Don't remove any country information
remove_location_country: false

# Option 2: Use built-in country detection
remove_location_country: true

# Option 3: Specify exactly which countries to remove (perfect for international users)
remove_location_country: "USA|United States|Canada"
```

These options provide significant flexibility:

- **Option 1 (false)**: Show complete addresses with all country information (best for international users)
- **Option 2 (true)**: Apply smart country detection to clean up addresses (good for most users)
- **Option 3 (regex pattern)**: Precisely control which countries to remove while keeping others visible (perfect for displaying domestic addresses without country while preserving international location details)

**Example scenario**: If you live in the USA but frequently have events in other countries, you could use:

```yaml
remove_location_country: 'USA|United States|U.S.A.|U.S.'
```

This would keep location details like "Paris, France" intact while simplifying domestic addresses to just city and state.

## 📝 Event Description Display

Display event descriptions below event titles for additional context:

```yaml
# Description display options
show_description: true
description_max_lines: 3 # Limit to 3 lines (0 = unlimited)
description_font_size: '12px'
description_color: 'var(--secondary-text-color)'
description_icon_size: '14px'
```

Descriptions are automatically processed:

- **HTML tags** are stripped for clean, readable text
- **HTML entities** (e.g., `&amp;`, `&lt;`) are decoded to their proper characters
- **Line clamping** truncates long descriptions with `...` when `description_max_lines` is set

You can also control description visibility per calendar entity:

```yaml
entities:
  - entity: calendar.work
    show_description: true # Show descriptions for work events
  - entity: calendar.personal
    show_description: false # Hide descriptions for personal events
```

## ⏳ Countdown Display

Show how much time remains until an event starts with the countdown display feature:

```yaml
# Enable countdown display for events
show_countdown: true
```

When enabled, a subtle countdown string appears next to each upcoming event, showing the remaining time in a natural language format like "in 3 days" or "in 2 hours". This helps users quickly identify how soon events will begin.

All-day events are included by default, counted in whole calendar days. If you only want countdowns on events with an actual start time, turn them off separately:

```yaml
show_countdown: true
show_countdown_allday: false # Timed events only
```

## 🕒 Past Events Display

Control visibility of events that have already occurred:

```yaml
show_past_events: true # Show today's events that have already ended
```

When enabled, past events appear with reduced opacity (60%) to visually distinguish them from upcoming events.

## 🌈 Weekend Day Styling

Weekend days (Saturday and Sunday) can be styled differently from weekdays to make them stand out in your calendar. You can customize:

- `weekend_weekday_color`: Sets the text color for weekday names (e.g., "Sat", "Sun")
- `weekend_day_color`: Sets the text color for the day number
- `weekend_month_color`: Sets the text color for the month name

Example configuration:

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.personal
  - calendar.work
weekend_weekday_color: '#E67C73'
weekend_day_color: '#E67C73'
weekend_month_color: '#E67C73'
```

This styling helps users quickly distinguish weekend days from weekdays, making the calendar more visually informative and easier to scan.

## 📊 Progress Bar Display

Calendar Card Pro can display a progress bar for events that are currently running, showing how much of the event has completed.

The progress bar appears in the same space as the countdown display (they're mutually exclusive - a countdown shows for future events, while a progress bar shows for running events). This provides a clean, visual indication of your event's progress without taking up additional space.

**To enable progress bars:**

```yaml
show_progress_bar: true
```

You can customize the appearance of the progress bars:

```yaml
show_progress_bar: true
progress_bar_color: '#03a9f4'
progress_bar_height: '10px'
progress_bar_width: '80px'
```

The progress bar is especially useful for tracking ongoing meetings, webinars, or appointments, giving you a quick visual reference of how much time remains.

Every option on this page lives under the card's event column settings — see [Event Column in the configuration reference](/reference/configuration#event-column).
