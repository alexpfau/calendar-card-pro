# Event Content & Display

These options control what each event actually shows — its title, times, location, description, countdown and progress — and how the card behaves on days that have no events at all. It is also where [birthday ages and anniversary counts](/features/event-content#birthday-ages-anniversary-counts) live, which need no configuration at all.

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
allday_badge: false # false, or neutral / outline / subtle / tinted / filled
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

### The All-Day Badge

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_allday_badge.png" alt="All-day events drawn as a badge in each calendar's own color" width="600"><br>

By default an all-day event says so in words, on the same line as the clock icon. Set
`allday_badge` to a treatment and the label becomes a rounded badge instead, the way most
calendar apps draw it:

```yaml
allday_badge: tinted
```

There are five treatments, from quietest to loudest:

| Value     | What it draws                                                           |
| --------- | ----------------------------------------------------------------------- |
| `neutral` | An outline only, in the row's own text color rather than the calendar's |
| `outline` | An outline only, in the calendar accent color                           |
| `subtle`  | A gentle wash of the accent, with no outline                            |
| `tinted`  | Both — a gentle wash inside a matching outline                          |
| `filled`  | A solid badge in the calendar accent color                              |

`false` is the default and keeps the plain words.

Four of the five take their color from the calendar the event came from, so events from
different calendars stay distinguishable at a glance. Where a calendar sets its own
`accent_color`, the badge follows it — including when that is a theme variable, because the
colors are resolved by the browser rather than computed in advance.

::: warning `color` And `accent_color` Are Separate
`color` sets an event's **title**. `accent_color` sets its **badge**, its vertical bar and
its row tint. A calendar that sets only `color` therefore keeps the default blue accent, and
its badge can end up in a color that relates to nothing else on the row. Set both to the
same value when you are coloring calendars apart, or use `neutral`, which takes no accent
at all.
:::

::: tip Which One To Pick
`tinted` suits most dashboards. Reach for `outline` when
[`event_background_opacity`](/reference/configuration#event-column) is high — with no fill
of its own, an outline has nothing to dissolve into the tinted row behind it. `neutral` is
the one to pick when the badge should stay out of the way entirely, or when a calendar's
accent does not sit well under its title. `filled` is the loud one, for when the calendar's
color should read as a solid chip.
:::

Anything that follows the label stays as ordinary text. A multi-day all-day event reads as
the badge and then its end date, so no information is lost.

Which events get one follows a single rule: the event has to occupy the whole of the day it
is drawn on. A timed meeting running from Wednesday evening to Monday morning does not, and
keeps its usual times. But when
[`split_multiday_events`](/features/multi-day-events) is on, that meeting's middle days
_are_ whole days, and those rows get the badge while its first and last days keep their
times.

The badge sizes itself from `time_font_size` rather than from an option of its own, so
enlarging the time enlarges the badge with it, whatever unit you write it in.

::: tip Pair This With show_single_allday_time
A single-day all-day event only has a badge if it has a time row to put it on. That row is
shown by default, but setting `show_single_allday_time: false` hides it, and the badge goes
with it. Multi-day all-day events are unaffected — their row is always shown.
:::

### Removing Country Names

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

### The Location Icon

Locations carry a map marker by default, and Microsoft Teams meetings carry the Teams
icon instead. That happens on its own, with nothing to configure: the card recognizes the
text Teams writes into an event's location — including its translations, such as
`Microsoft Teams-Besprechung` or `Réunion Microsoft Teams` — as well as a
`teams.microsoft.com` join link stored there in place of a phrase.

Teams is the only service detected this way, and the reason is a practical one rather than
a preference: Material Design Icons, the icon set Home Assistant ships, has a brand icon
for Teams and none for Zoom, Google Meet or Webex. There is no logo to show for them.

The per-calendar `location_icon` sets the icon for one calendar's events, and takes
precedence over the detection:

```yaml
entities:
  - entity: calendar.work
    location_icon: mdi:office-building # every location on this calendar
  - calendar.family # keeps the marker, and the Teams icon where it applies
```

It is per calendar deliberately, and there is no card-wide version: one icon for every
location would be a styling choice, while this is a meaning — _these_ events are online
calls, _those_ are at the office. To split a single calendar that way, pair it with
[`filter_field`](/features/core-settings#giving-teams-meetings-their-own-icon).

::: tip Turning the Teams Icon Off
Name the marker explicitly — `location_icon: mdi:map-marker-outline` — and that calendar
goes back to the plain marker on every event. `location_icon_size` above sizes whichever
icon ends up being drawn.
:::

The detection reads the location the card is about to draw, not the one your calendar sent,
so [rewriting a location](/features/core-settings#replacing-a-location-that-is-a-meeting-url)
can take the Teams icon away or hand it to an event that never had it. `location_icon`
settles it on any calendar where that matters.

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

- **HTML tags** are stripped for clean, readable text — only real markup, so prose such as `temp < 5 and pressure > 3` is left as written
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

## 🎂 Birthday Ages & Anniversary Counts

Apple's Calendar app writes the person's age into every birthday, but it builds that calendar out of Contacts, so it cannot be shared or subscribed to and Home Assistant never sees it. This is the part of it the card can do on your own calendars: note the year in the event, and the card works out the rest.

Put **`YEAR=1976`** anywhere in the event's description and the card appends the age to the title:

```yaml
# Nothing to configure — the marker in the event does the work
Annas Geburtstag  →  Annas Geburtstag (50)
```

The event you already have is the one that carries it. Birthdays are normally stored as an event that repeats every year, and each occurrence carries its own year, so the number is a subtraction and nothing else — the 2026 occurrence of a 1976 birthday is `(50)`, and the 2027 one is `(51)` without anyone touching the card again. It never needs the full date of birth, and it never has to work out whether the day has passed yet this year, because the event **is** the birthday.

The same marker counts anniversaries, because it is the same subtraction. A wedding in 2005 shows `(21)` in 2026. The number stands on its own without saying what it counts, which is what lets one marker serve both.

### Writing the Marker

`YEAR=1976` and `YEAR:1996` both work, in any capitalization, anywhere in the description — on a line of its own, or at the end of a sentence you already wrote.

Two rules matter, and both exist to keep the card from finding a marker in a description that never meant to carry one:

- **No spaces around the `=` or the `:`.** `YEAR=1976` counts; `YEAR = 1976` does not. This is what separates a marker from ordinary writing — a sentence such as `Academic Year: 2025` puts a space after its colon, and without this rule the card would read that as a birth year and start numbering a school calendar.
- **The marker stands as its own word.** `Born YEAR=1996` counts; `BIRTHYEAR=1996` does not, and neither does a `?year=1976` sitting inside a link.

The year is always four digits, so `YEAR=197` and `YEAR=19766` are both ignored.

| You write             | The card shows |
| --------------------- | -------------- |
| `YEAR=1976`           | `(50)` in 2026 |
| `YEAR:1996`           | `(30)` in 2026 |
| `Geboren YEAR=1996`   | `(30)` in 2026 |
| `YEAR = 1976`         | nothing        |
| `Academic Year: 2025` | nothing        |
| `BIRTHYEAR=1996`      | nothing        |

::: tip Nothing Showing Up?
The card only ever counts **upward**. A year that matches the event's own year, or one still in the future, shows nothing at all rather than `(0)` or a negative number — so a `YEAR=2026` on an event in 2026 looks exactly like a marker that was not recognized. Check the year first, then the spacing around the separator.
:::

### What the Description Shows

The marker is instruction to the card, not something to read, so it never appears on your card. With `show_description: true`, a description of `Geboren YEAR=1996 in Berlin` is drawn as **Geboren in Berlin**, and a description containing nothing but the marker leaves no description line at all — which is the tidiest way to use it, since the year is metadata rather than something you wanted to read.

Filtering is the deliberate exception. [`blocklist` and `allowlist`](/features/core-settings) read the event exactly as your calendar delivered it, so a `filter_field: description` pattern still sees the raw `YEAR=1976`. That is what makes it possible to filter a birthday calendar on its markers.

::: info Always On, and How to Turn It Off
There is no option for this. A four-digit year written this precisely is not something a calendar produces by accident, so an option would be one more thing to configure for everybody in exchange for a case that does not really happen — and the way back is simply to write the year differently: `Born in 1976`, or `YEAR - 1976`, are both invisible to the card.

One thing worth knowing on a narrow card: the number sits at the end of the title, so it is the first thing to be cut when `title_max_lines` truncates a long one.
:::

## ✂️ Limiting Lines Per Field

Long titles, times, locations and descriptions can each be capped to a fixed number of lines, after which the text is truncated with `...`. Each field has its own option, and `0` means unlimited (no clamp):

```yaml
title_max_lines: 1 # Keep every event title to a single line
time_max_lines: 1 # Keep the time on one line
location_max_lines: 2 # Allow locations up to two lines
description_max_lines: 3 # Allow descriptions up to three lines
```

Each option is a line count, not a toggle: `1` shows one line then an ellipsis, `2` shows two lines, and so on. All four work in both list and column view, and each can be overridden inside a `column:` block to clamp differently per view:

```yaml
title_max_lines: 0 # Unlimited in list view
column:
  title_max_lines: 1 # But single-line in the denser column view
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

When [`split_multiday_events`](/features/multi-day-events) is on, a multi-day event appears as one row per day and each row counts whole calendar days to its own date, so the countdowns read consecutively down the card.

## 🕒 Past Events Display

Control visibility of events that have already occurred:

```yaml
show_past_events: true # Show events that have already ended
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

A countdown and a progress bar are mutually exclusive: a countdown shows for events that have not started yet, a progress bar for events that are running now. No event ever shows both, which is why the two can share the same space in list view without competing.

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

`progress_bar_width` has no shipped default. Left unset, the bar sizes itself to where it is drawn: `60px` on the time row in list view, and 80% of the column width in [column view](/features/column-view#progress-bar-countdown), where it takes a row of its own. Setting a width replaces both, so a single value applies to every view — and a [column exception](/features/column-view#overriding-options-in-column-view) gives the two views different widths.

```yaml
show_progress_bar: true
progress_bar_width: '80px' # list view
column:
  progress_bar_width: '100%' # column view only
```

The progress bar is especially useful for tracking ongoing meetings, webinars, or appointments, giving you a quick visual reference of how much time remains.

Most options on this page live under the card's event column settings — see [Event Column in the configuration reference](/reference/configuration#event-column). Two groups sit elsewhere: the empty-day options are card-wide and belong to [Core Settings](/reference/configuration#core-settings), and `location_icon` is per calendar, listed under [Per-Entity Options](/reference/configuration#per-entity-options).
