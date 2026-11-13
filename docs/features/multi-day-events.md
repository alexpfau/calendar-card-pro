# Split Multi-Day Events

`split_multiday_events` shows a multi-day event on every day it covers instead of only on its
first, so a conference, a trip or an on-call week stays visible on each of its days and clashes
with other events are easy to spot. Set it for the whole card or per calendar:

```yaml
# Global option for all calendars
split_multiday_events: true

# Entity-specific settings
entities:
  - entity: calendar.family
    split_multiday_events: true # Show family events on each day
  - entity: calendar.work
    split_multiday_events: false # Show work events only on first day (default)
```

It is off by default, except in column view.

## ✂️ How Each Day Is Shown

When enabled, multi-day events are split in a way that preserves their original properties:

- **All-day events** appear as single-day all-day events on each day they cover
- **Timed multi-day events** are split into:
  - First day: Event from start time to end of day (e.g., 10:00-23:59)
  - Middle days: Full all-day events
  - Last day: Event from start of day to end time (e.g., 00:00-15:00)

A timed event ending exactly at midnight has no row on the date that midnight opens, even when
it spans several days. An event ending after midnight still has a final-day row.

Left unsplit, a timed event shows its whole span on its first day: an event from 22:30 to 0:30
the next day reads "22:30, ends tomorrow at 0:30", and one running on to Friday "9:00 until
Friday, Oct 23 at 17:00".

Each row stands for its day, which changes what other features show on it:

- A [countdown](/features/event-content#countdown-display) counts to the row's own start, and a
  row already under way has none.
- A [progress bar](/features/event-content#progress-bar-display) measures the whole event and
  is drawn on today's row, so it keeps growing from one day to the next.
- The middle days of a timed event are whole days, so they get an
  [all-day badge](/features/event-content#which-events-get-one) and no
  [Now mark](/features/event-content#the-now-indicator).
- Every row occupies a single day, so
  [`show_single_allday_time`](/features/event-content#hiding-the-time-row) governs all of them.
- The [day counter](#day-counter) names the row's own day.

## 🔢 Day Counter

`show_day_counter` says which of its days an event a day or longer is on, such as "Day 12 of
45", so a course, a trip or a vacation shows how far along it is at a glance. It goes where the
countdown and the progress bar go, and on these events it takes the bar's place:

```yaml
show_day_counter: true
```

| Option             | Type    | Default | Description                                                                                                   |
| ------------------ | ------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| `show_day_counter` | boolean | `false` | Show "Day 2 of 3" on each row of an event a day or longer, in place of its progress bar. List and column view |

- **Which events count.** An all-day event over two or more dates, and a timed event at least a
  full day long, ending no earlier than its start time on the next date. Days are calendar
  dates, so Monday 18:00 to Wednesday 10:00 runs three days, while a night from 22:00 to 06:00
  counts none.
- **Which day a row names.** The day it is drawn on. Split, each day's row names its own; left
  unsplit, a row names the day it stands under, so a course that began before the card's first
  day reads "Day 12 of 45" there.
- **The countdown comes first.** Before an event starts, a row with a
  [countdown](/features/event-content#countdown-display) keeps it, and the counter takes over
  once the event is under way. A row with no countdown to show, because it is off or the event
  is beyond [`countdown_max_days`](/features/event-content#countdown-range), names its day from
  the start.
- **No progress bar on these events.** Their rows draw the counter instead of the
  [progress bar](/features/event-content#progress-bar-display), which barely moves over a long
  event. Shorter events keep theirs, and the counter works with the bar on or off.

::: details Midnight, Later Windows & Grid View

- A timed event ending at 0:00 does not count the date that midnight opens: Nov 1 0:00 to Dec 16
  0:00 is 45 days. Where the clocks go back at midnight, an event ending at the second 0:00 takes
  up an hour of that date and counts it.
- When the card's window starts after the event does, through `start_date` or the toolbar, an
  unsplit row names the window's first day, such as "Day 19 of 45".
- [Grid view](/features/grid-view) draws no counter, since its all-day banners already span
  their days, and its blocks keep their progress bars.
- The counter takes the countdown's place in every layout, including
  [beside the title](/features/event-content#time-beside-the-title), and its look. A theme can
  tell the two apart by the counter's `day-counter` class.

:::

## 🧭 Column & Grid View

In the [column layout](/features/column-view) this option starts from `true` rather than from
your top-level value, so setting `split_multiday_events: false` at the top level changes the list
layout only. To keep multi-day events whole in columns too, say so in the block:

```yaml
split_multiday_events: false
column:
  split_multiday_events: false
```

The per-calendar form works in the column layout too, so a single calendar can keep its events
whole while the rest of the card splits:

```yaml
entities:
  - entity: calendar.anna
    split_multiday_events: false
```

[Grid view](/features/grid-view) ignores the option and places multi-day events itself: a timed
event gets a block on every day it touches, and an all-day event a banner across its days. A
day's part of an event still shows when the event's first day is left off the card, by a
weekday or weekend filter or because empty days are hidden. See
[Options That Do Nothing in Grid View](/features/grid-view#options-that-do-nothing-in-grid-view).

This page covers `split_multiday_events`, in [Core Settings in the configuration reference](/reference/configuration#core-settings), and `show_day_counter`, in [Event Column](/reference/configuration#event-column).
