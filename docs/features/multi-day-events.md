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

[Grid view](/features/grid-view) ignores the option and places multi-day events itself: an
all-day event, or a timed one a full day or longer, is one banner across its days (see
[Long Timed Events as Banners](/features/grid-view#long-timed-events-as-banners)), and a shorter
timed event gets a block on every day it touches. A
day's part of an event still shows when the event's first day is left off the card, by a
weekday or weekend filter or because empty days are hidden. See
[Options That Do Nothing in Grid View](/features/grid-view#options-that-do-nothing-in-grid-view).

This is the `split_multiday_events` option — see [Core Settings in the configuration reference](/reference/configuration#core-settings).
