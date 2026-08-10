---
title: Dynamic Start Date
---

# Dynamic Start Date with Relative Offsets

Calendar Card Pro offers flexible options for controlling which dates are displayed, allowing you to create both fixed and dynamic date ranges:

## 📅 Start Date Configuration

The `start_date` parameter can be configured in multiple ways:

- **Fixed dates**: Use a specific date in YYYY-MM-DD format

  ```yaml
  start_date: '2025-07-01' # Always start from July 1st, 2025
  ```

- **Relative date expressions**: Use dynamic offsets relative to the current date

  ```yaml
  start_date: "today+7"  # Always show events starting 7 days in the future
  start_date: "+3"       # Shorthand for today+3 (3 days from today)
  start_date: "today-2"  # Show events starting from 2 days ago
  start_date: "-1"       # Shorthand for today-1 (yesterday)
  ```

- **Week anchors**: Start from the first day of the current week

  ```yaml
  start_date: "start_of_week"    # First day of this week - Monday or Sunday, per first_day_of_week
  start_date: "start_of_week+7"  # First day of next week
  start_date: "start_of_week-7"  # First day of last week
  ```

- **Weekday names**: Jump to the next occurrence of a given weekday

  ```yaml
  start_date: "saturday"  # The next Saturday (today counts, if today is Saturday)
  start_date: "today+sat" # Same thing, written explicitly
  start_date: "monday+1w" # One week after that Monday
  ```

### Relative Expression Syntax

Relative expressions are built from an **anchor** followed by any number of **operators**:

```text
<anchor>[<operator>...]

anchor    today | start_of_week | <weekday>
operator  +N | -N        move N days
          +Nw | -Nw      move N weeks
          +<weekday>     move forward to that weekday (stays put if already on it)
          -<weekday>     move back to that weekday (stays put if already on it)
weekday   monday | tuesday | ... | sunday   (or mon, tue, wed, thu, fri, sat, sun)
```

Expressions are case-insensitive, spaces are ignored (`start_of_week + 7` works), and the
keywords are always English so a card does not change meaning when `language` changes.

A bare number is **always days**, never weeks — `monday+1` is Tuesday, and `monday+1w` is the
following Monday. A bare weekday is shorthand for `today+<weekday>`.

| Goal                                                  | Expression          |
| ----------------------------------------------------- | ------------------- |
| The next Monday to come, today included               | `monday`            |
| The Monday of the current week, even if it has passed | `start_of_week+mon` |
| This coming weekend                                   | `today+sat`         |
| The weekend after this one                            | `today+sat+7`       |
| Two weeks from next Tuesday                           | `tuesday+2w`        |

> [!NOTE]
> `start_of_week` resolves to a past date for most of the week. Because `show_past_events`
> defaults to `false`, already-finished timed events on the earlier days are hidden, which can
> make the start of the week look empty. Pair `start_of_week` with `show_past_events: true` to
> see the full week. (All-day events are always shown.)

When using `start_date` with `days_to_show`, the calendar will display exactly that number of days starting from the specified date:

```yaml
start_date: '2025-07-01'
days_to_show: 14 # Shows July 1-14, 2025
```

```yaml
start_date: '+7' # One week from today
days_to_show: 7 # Shows a 7-day window starting one week from today
```

If an expression is malformed — `start_of_week+xyz`, say — the card logs a warning and falls back to today rather than rendering an empty view.

### Common Setups

The three setups the grammar was built for, taken from the requests behind it:

**A rolling "this week" view** ([#296](https://github.com/alexpfau/calendar-card-pro/issues/296)) — pinned to the first day of the current week, so the window stays aligned to the calendar instead of sliding forward a day at a time:

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.family
start_date: 'start_of_week'
days_to_show: 7
show_past_events: true # otherwise the days already gone look empty
```

Swap the anchor for `start_of_week+7` to get next week, or `start_of_week-7` for last week. Nothing else changes.

**A weekend view** ([#276](https://github.com/alexpfau/calendar-card-pro/issues/276)) — jumps ahead to the coming Saturday and shows both weekend days:

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.family
start_date: 'today+sat'
days_to_show: 2
```

`today+sat` rolls forward to the next Saturday once Saturday has passed, so on Sunday the card already points at the following weekend. With `first_day_of_week: monday`, use `start_of_week+sat` instead to keep the current weekend on screen through Sunday night.

**One card per weekday** ([#193](https://github.com/alexpfau/calendar-card-pro/issues/193)) — a row of single-day cards that stays in Monday-to-Friday order all week:

```yaml
start_date: 'start_of_week+mon' # then +tue, +wed, +thu, +fri
days_to_show: 1
```

Anchoring each card to `start_of_week` is what keeps the row in calendar order: with bare `monday`…`friday`, each card rolls over to next week the moment its day passes, so on a Wednesday the Monday and Tuesday cards would already show next week while the rest still show this week — the row runs 17, 18, 12, 13, 14 instead of 10, 11, 12, 13, 14.

## 🔄 Dynamic vs. Fixed Date Ranges

- **Fixed date range**: Using a specific date for `start_date` creates a static calendar view that always shows the same range
- **Dynamic date range**: Using relative offsets creates a "floating" window that automatically adjusts as time passes
