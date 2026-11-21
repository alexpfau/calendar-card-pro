---
title: Dynamic Start Date
---

# Dynamic Start Date with Relative Offsets

`start_date` sets the first day the card shows, today unless you say otherwise. It can name a
fixed date, move the window a few days ahead or back, start it on the first day of this week,
or jump to the coming weekend, and a relative start moves on by itself as the days pass.

## 📅 Start Date Configuration

`start_date` takes a fixed date or an expression relative to today. Each fence below shows one
value, with the others commented out:

| Option       | Type   | Default | Description                                                                                                        |
| ------------ | ------ | ------- | ------------------------------------------------------------------------------------------------------------------ |
| `start_date` | string | Today   | The first day the card shows: a fixed date (`YYYY-MM-DD`) or a relative expression such as `today+7` or `saturday` |

- **Fixed dates**: Use a specific date in YYYY-MM-DD format. A date in the past needs
  `show_past_events: true` in list and column view, or its finished events are hidden.

  ```yaml
  start_date: '2025-07-01' # Always start from July 1st, 2025
  show_past_events: true
  ```

- **Relative date expressions**: Use dynamic offsets relative to the current date

  ```yaml
  start_date: 'today+7' # Always show events starting 7 days in the future
  # start_date: '+3' # Shorthand for today+3 (3 days from today)
  # start_date: 'today-2' # Show events starting from 2 days ago
  # start_date: '-1' # Shorthand for today-1 (yesterday)
  ```

- **Week anchors**: Start from the first day of the current week

  ```yaml
  start_date: 'start_of_week' # First day of this week - Monday or Sunday, per first_day_of_week
  # start_date: 'start_of_week+7' # First day of next week
  # start_date: 'start_of_week-7' # First day of last week
  ```

- **Weekday names**: Jump to the next occurrence of a given weekday

  ```yaml
  start_date: 'saturday' # The next Saturday (today counts, if today is Saturday)
  # start_date: 'today+sat' # Same thing, written explicitly
  # start_date: 'monday+1w' # One week after that Monday
  ```

### Relative Expression Syntax

Relative expressions are built from an **anchor** followed by up to eight **operators**:

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

Month is the one exception to the first two. It opens today's month for Tomorrow and Start of
Week only when they are written exactly `today+1`, `+1` or `start_of_week`. Any other spelling,
such as `Today+1` or `today + 1`, opens the month holding the date it resolves to, which near a
month's end or start is the next or the previous month. See
[Dynamic vs. Fixed Date Ranges](#dynamic-vs-fixed-date-ranges).

A bare number is **always days**, never weeks — `monday+1` is Tuesday, and `monday+1w` is the
following Monday. A bare weekday is shorthand for `today+<weekday>`.

| Goal                                                  | Expression          |
| ----------------------------------------------------- | ------------------- |
| The next Monday to come, today included               | `monday`            |
| The Monday of the current week, even if it has passed | `start_of_week+mon` |
| This coming weekend                                   | `today+sat`         |
| The weekend after this one                            | `today+sat+7`       |
| Two weeks from next Tuesday                           | `tuesday+2w`        |

::: warning Pair This With show_past_events
`start_of_week` resolves to a past date for most of the week. In the list and column views
`show_past_events` defaults to `false`, so what has already finished on the earlier days is
hidden: a timed event once it ends, and an all-day event from midnight after its last day. That
can make the start of the week look empty, so pair `start_of_week` with `show_past_events: true`
there to see the full week. Grid view shows past events by default and needs nothing.
:::

When using `start_date` with `days_to_show`, the calendar shows that number of days starting from the specified date. A layout can set its own count in its block ([Showing a Different Number of Days in Each Layout](/features/layouts#showing-a-different-number-of-days-in-each-layout)), and Columns and Grid may draw fewer on a narrow card:

```yaml
start_date: '2025-07-01'
days_to_show: 14 # Shows July 1-14, 2025
show_past_events: true # the range is in the past
```

```yaml
start_date: '+7' # One week from today
days_to_show: 7 # Shows a 7-day window starting one week from today
```

If an expression is malformed — `start_of_week+xyz`, say — the card logs a warning and falls back to today rather than rendering an empty view.

### Common Setups

**A rolling "this week" view** — pinned to the first day of the current week, so the window stays aligned to the calendar instead of sliding forward a day at a time:

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.family
start_date: 'start_of_week'
days_to_show: 7
show_past_events: true # otherwise the days already gone look empty
```

Swap the anchor for `start_of_week+7` to get next week, or `start_of_week-7` for last week. Nothing else changes.

In column or grid view, a card too narrow for all seven days starts at today rather than at the start of the week, and reaches back only once too few days are left in the week to fill it — see [Fitting Narrow Cards](/features/grid-view#fitting-narrow-cards).

**A weekend view** — jumps ahead to the coming Saturday and shows both weekend days:

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.family
start_date: 'today+sat'
days_to_show: 2
```

`today+sat` rolls forward to the next Saturday once Saturday has passed, so on Sunday the card already points at the following weekend. With `first_day_of_week: monday`, use `start_of_week+sat` instead to keep the current weekend on screen through Sunday night.

**One card per weekday** — a row of single-day cards that stays in Monday-to-Friday order all week:

```yaml
start_date: 'start_of_week+mon' # then +tue, +wed, +thu, +fri
days_to_show: 1
show_past_events: true # otherwise a day already gone looks empty
```

Anchor each card to `start_of_week`. With bare `monday`…`friday`, each card rolls over to next week the moment its day passes, so on a Wednesday the Monday and Tuesday cards already show next week: the row runs 17, 18, 12, 13, 14 instead of 10, 11, 12, 13, 14.

## 🔄 Dynamic vs. Fixed Date Ranges

- **Fixed date range**: Using a specific date for `start_date` creates a static calendar view that always shows the same range
- **Dynamic date range**: Using relative offsets creates a "floating" window that automatically adjusts as time passes

Either way, `start_date` sets the days the card opens with. The toolbar's
[date navigation](/features/header-toolbar#paging-through-dates) can page away from them,
and its home button always returns to them, today or not.

Month shows a whole month: the month holding the date, fixed or relative, or today's month for
Tomorrow (`today+1` or `+1`) and `start_of_week`, written exactly so. A narrow month opens with that day selected. See
[The Six Weeks](/features/month-view#the-six-weeks).

`start_date` is a core option — see [Core Settings in the configuration reference](/reference/configuration#core-settings).
