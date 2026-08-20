# Core Settings

Core settings control which calendars the card reads, which of their events it keeps, and how many of them it shows at once. Everything else in this documentation builds on the entity configuration described here.

## 🗂️ Entity Configuration

Calendar Card Pro can display events from multiple calendar entities in Home Assistant. The `entities` array accepts either:

1. **A simple entity ID** (default styling applies)
2. **An advanced object configuration** (custom styling per entity)

```yaml
entities:
  - calendar.family # Simple entity ID (default styling)
  - entity: calendar.work
    # Advanced object with custom styling (see options below)
    color: '#1e90ff'
    accent_color: '#ff6347'
```

### Available Options for Entity Configuration Objects

| Option                   | Type    | Default                  | Description                                                                                                                                                                                                           |
| ------------------------ | ------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entity`                 | string  | —                        | **Required.** The calendar entity ID                                                                                                                                                                                  |
| `label`                  | string  | `-`                      | Calendar label displayed before event titles. Supports text/emoji, MDI icons (`mdi:icon-name`), or images (`/local/image.jpg`)                                                                                        |
| `label_type`             | string  | derived from `label`     | Forces how `label` is read: `none`, `text`, `icon` or `image`. Only needed when the value alone would be read as the wrong kind                                                                                       |
| `color`                  | string  | `event_color`            | Custom color for event titles from this calendar                                                                                                                                                                      |
| `accent_color`           | string  | `accent_color`           | Custom color for the vertical line and event background (when `event_background_opacity` is >0). Accepts `home-assistant` to follow this calendar's Home Assistant color                                              |
| `label_icon_color`       | string  | `-`                      | Custom color for label icons (only applies to `mdi:` and other icon labels)                                                                                                                                           |
| `show_time`              | boolean | `show_time`              | Whether to show event times for this calendar (overrides global `show_time` option)                                                                                                                                   |
| `show_location`          | boolean | `show_location`          | Whether to show event locations for this calendar (overrides global `show_location` option)                                                                                                                           |
| `location_icon`          | string  | `mdi:map-marker-outline` | Icon shown beside this calendar's locations, e.g. `mdi:office-building`. Unset, Microsoft Teams meetings get `mdi:microsoft-teams` and every other location the map marker                                            |
| `show_description`       | boolean | `show_description`       | Whether to show event descriptions for this calendar (overrides global `show_description` option)                                                                                                                     |
| `compact_events_to_show` | number  | `compact_events_to_show` | Maximum number of events to show from this calendar (works with global `compact_events_to_show`)                                                                                                                      |
| `blocklist`              | string  | `-`                      | RegExp pattern to specify events to exclude (e.g., "Private\|Conference")                                                                                                                                             |
| `allowlist`              | string  | `-`                      | RegExp pattern to specify events to include (e.g., "Birthday\|Anniversary")                                                                                                                                           |
| `filter_field`           | string  | `title`                  | Which field `blocklist` and `allowlist` read: `title`, `location` or `description`. One at a time — list the calendar twice to filter on a second                                                                     |
| `split_multiday_events`  | boolean | `split_multiday_events`  | Whether multi-day events from this calendar span each day they cover (overrides global `split_multiday_events`)                                                                                                       |
| `event_type`             | string  | `event_type`             | Which class of this calendar's events to keep — `all`, `timed` for events with a clock time, or `all_day` for all-day ones (overrides global `event_type`)                                                            |
| `allday_expires_at`      | string  | midnight                 | Time of day, as `HH:MM`, at which this calendar's all-day events start counting as past, read against the last day each one covers. Unset, they last until midnight. Only applies while `show_past_events` is `false` |
| `days_of_week`           | string  | `-`                      | Restricts this calendar to `weekdays` (Monday to Friday) or `weekends` (Saturday and Sunday), judged on the day each row lands on. Unset, every day qualifies                                                         |

This structure gives you granular control over how information from different calendars is displayed.

These options are per calendar. For the card-wide options they override, see [Core Settings in the configuration reference](/reference/configuration#core-settings).

### Using the Colors From Home Assistant

Home Assistant holds a color for each calendar entity, which you set under **Settings →
Devices & Services → Entities**, and which the built-in calendar card and calendar panel
already use. Setting `accent_color` to `home-assistant` makes Calendar Card Pro follow it,
so a calendar keeps the same color everywhere.

Set it card-wide and every calendar follows its own color:

```yaml
type: custom:calendar-card-pro
accent_color: home-assistant
entities:
  - calendar.work
  - calendar.family
  - calendar.trash
```

Or per calendar, mixing it freely with your own colors:

```yaml
type: custom:calendar-card-pro
entities:
  - entity: calendar.work
    accent_color: home-assistant # follows Home Assistant
  - entity: calendar.family
    accent_color: '#43a047' # your own color wins
  - calendar.trash # follows the card
```

::: warning Requires Home Assistant 2026.2
Calendar colors were added in Home Assistant 2026.2. On an older version there is nothing to
read, and every calendar falls back exactly as described below.
:::

**Calendars Home Assistant has no color for fall back rather than losing their color.** A
per-calendar `home-assistant` falls back to the card's `accent_color`; a card-wide
`home-assistant` falls back to the built-in `#03a9f4`.

This matters more than it sounds, because **Google Calendar is currently the only
integration that fills the color in for you** — and it does so only at the moment a calendar
is **first added** to Home Assistant. Local Calendar, CalDAV and ICS feeds start with no
color at all. So if you run Google alongside Local Calendar and switch the card over, expect
your Google calendars to pick up their colors while the rest stay on the card default until
you set a color for them by hand. That is the fallback working, not a bug.

::: warning A Google Integration Older Than 2026.2 Has No Colors, and Nothing Back-Fills Them
Because the import happens once, when a calendar is first added, a Google integration that
was set up before Home Assistant 2026.2 has no colors stored — so switching the card over
shows every calendar on the fallback, which looks exactly like the feature not working.

**Removing and re-adding the integration does not fix this**, and is worth not attempting.
Home Assistant remembers a removed calendar's settings and restores them when the same
calendar comes back, so the color returns as empty as it left, and the import that would
have filled it is skipped precisely because the old settings were found. That is how the
Google Calendar integration and the entity registry work between them, and nothing Calendar
Card Pro does on its side can change it.

**Set the colors by hand instead** — see below. It is a moment per calendar, it is the only
thing that works today, and it leaves your integration, your entity IDs and anything
referring to them alone.

That work is also safe to do: the same restore that declines to import a color is what
preserves one you set yourself, so hand-set colors survive removing and re-adding the
integration later for some unrelated reason.
:::

::: tip Setting a Color By Hand
Any calendar can be given a color, whichever integration it came from, and this is the path
to prefer for the case above. Open **Settings → Devices & Services → Entities**, pick the
calendar, and use the color field in its settings.
:::

### Choosing How a Label Is Read

`label` holds one of four things — nothing, text or an emoji, an icon, or a path to an
image — and the card works out which by looking at the value. A value starting `mdi:` is
an icon, one ending `.png` is an image, and anything else is text. That is right almost
always, so most configurations never need to say more:

```yaml
entities:
  - entity: calendar.family
    label: '📅' # text
  - entity: calendar.work
    label: mdi:briefcase # icon
  - entity: calendar.school
    label: /local/school.png # image
```

`label_type` is for the cases where reading the value gets it wrong. Set it to `none`,
`text`, `icon` or `image` and it wins over the value:

```yaml
entities:
  # Shows the nine characters "mdi:calendar" rather than the icon of that name
  - entity: calendar.notes
    label: 'mdi:calendar'
    label_type: text
```

::: tip Visual Editor
The **Label Type** dropdown under each calendar writes this for you, and only when it has
to. Pick a type and the right control appears below it — a text box, Home Assistant's icon
browser, or a path field — along with **Label Icon Color** where the label is an icon.
:::

You will rarely write `label_type` by hand, and existing configurations do not need it:
leave it out and the value is read exactly as it always was.

## 🔍 Event Filtering

Calendar Card Pro provides powerful filtering capabilities to control exactly which events appear on your dashboard:

::: tip Visual Editor
Set up filters in the entity configuration panels. For each calendar entity, you can specify blocklist/allowlist patterns and configure duplicate filtering from the "Calendar Entities" section.
:::

### Filtering by Event Name

```yaml
entities:
  - entity: calendar.work
    blocklist: 'Private|Conference' # Hide events with these words
  - entity: calendar.personal
    allowlist: 'Birthday|Anniversary' # Only show events with these words
```

These filters use regular expressions, allowing for flexible pattern matching:

- **Blocklist**: Hide events that match specified patterns
- **Allowlist**: Only show events that match specified patterns
- **Priority**: When both are specified, allowlist takes precedence

### Matching the Location or Description Instead

By default both lists read the event **title**. `filter_field` points them somewhere else:
it takes `title`, `location` or `description`, and applies to that calendar's `blocklist`
and `allowlist` alike.

```yaml
entities:
  - entity: calendar.work
    filter_field: location
    blocklist: 'zoom\.us' # hide the events whose location is a Zoom link
```

It selects a field rather than adding one, so a calendar filtering on `location` has
stopped filtering on the title. To filter on two fields, list the calendar twice — each
block filters independently.

An event that has no location at all, or no description, counts as not matching: an
allowlist drops it and a blocklist keeps it. That is the same rule the title filter has
always applied to an event with no title, and it is what makes the two-block pattern below
add up.

::: tip Patterns Are Unchanged
`filter_field` is a separate option rather than a prefix inside the pattern, because the
lists are plain regular expressions and every character in them already means something.
`allowlist: 'location:'` still matches the literal text `location:` in a title, exactly as
it did before.
:::

::: warning The Description Is Matched Before Its Formatting Is Removed
The card strips HTML out of descriptions for display, but the filter reads the description
as your calendar delivered it. With Google Calendar that usually means HTML, so a pattern
matching a link may need to allow for the anchor markup wrapped around it. The same is true
of `show_description: false` — hiding descriptions does not stop them being filtered on.
:::

### Giving Teams Meetings Their Own Icon

Pairing `filter_field: location` with [`location_icon`](/features/event-content#the-location-icon)
splits one calendar into online and in-person halves, each with its own icon and color:

```yaml
entities:
  - entity: calendar.work
    allowlist: 'Microsoft Teams'
    filter_field: location
    accent_color: '#6264a7'
  - entity: calendar.work
    blocklist: 'Microsoft Teams'
    filter_field: location
    location_icon: mdi:office-building
```

Because the same pattern is allowed in one block and blocked in the other, every event
lands in exactly one of them — nothing is lost and nothing appears twice. The visual
editor's **Duplicate** action on a calendar's panel builds the second block for you.

Teams meetings need no allowlist to get their icon; that happens on its own. This pattern
is for when you want the two halves styled differently, or want a specific icon on the
half that is _not_ a Teams call.

### Separating All-Day From Timed Events

The `event_type` option decides which class of event a calendar contributes. It takes three
values: `all` shows everything and is the default, `timed` keeps just the events that have
a clock time, and `all_day` keeps just the all-day ones.

```yaml
type: custom:calendar-card-pro
event_type: timed # Card-wide: no all-day events anywhere
entities:
  - calendar.work
  - entity: calendar.birthdays
    event_type: all # This one calendar departs from the card
```

Its more interesting use is as a way of splitting a single calendar in two. Because `timed`
and `all_day` are exact opposites, listing the same calendar twice — once each way — divides
its events between the two blocks without losing or repeating any, and each block can then
carry its own label and colors:

```yaml
type: custom:calendar-card-pro
entities:
  - entity: calendar.family
    event_type: all_day # Birthdays, holidays, trips
    accent_color: '#9e9e9e'
  - entity: calendar.family
    event_type: timed # Appointments, meetings
    accent_color: '#1e88e5'
```

This is the same technique as [Advanced Filtering Techniques](#advanced-filtering-techniques)
below, and it composes with the name filters: a block may set `event_type` and an
`allowlist` together, and an event has to satisfy both to appear.

::: tip Listing a Calendar Twice in the Visual Editor
Home Assistant's calendar picker hides a calendar you have already chosen, so the second
listing cannot be added there. Use **Duplicate** at the foot of the calendar's own panel
instead: it lists the calendar again with the same settings, ready for you to change the
one option that differs. The two panels are numbered so you can tell them apart, and
**Remove** on the panel drops one block without taking the other — see
[Per-Calendar Panels & Actions](/features/editor#per-calendar-panels-actions).
:::

::: tip It Describes the Kind of Event, Not Its Length
`event_type` says nothing about how long an event lasts. A dinner from 23:30 to 00:30 is
`timed` even though it touches two dates, and a one-day holiday is `all_day` just as a
two-week one is. For how the card handles events spanning several days, see
[Multi-Day Events](/features/multi-day-events).
:::

### Retiring All-Day Events During the Day

An all-day event has no end time, only an end date, so the card treats one as past at
**midnight after the last day it covers**. That is usually right — a birthday is a birthday
all day — but it is wrong for a feed describing something that happens at a particular
hour. A waste-collection calendar is the common case: the bin is emptied in the morning and
its entry sits on the card until midnight.

`allday_expires_at` moves that moment earlier within the final day. It takes a time of day,
and from that time onward the card treats the event as past:

```yaml
entities:
  - entity: calendar.waste_collection
    allday_expires_at: '10:00' # gone from mid-morning, once the truck has been
  - calendar.family # unaffected — birthdays stay up all day
```

It is per calendar and has no card-wide counterpart, which is the point: your bin feed and
your birthdays want opposite answers, and only the calendar itself knows which.

The time is read against the **last** day the event covers, so a holiday running Monday to
Wednesday retires on Wednesday morning rather than Monday's. Split the calendar with
`split_multiday_events: true` and each day retires on its own morning instead.

Leaving the option out keeps the default, midnight — the option changes _when_ within the
final day, never _whether_.

::: warning It Only Applies While Past Events Are Hidden
`allday_expires_at` decides _when_ an all-day event becomes past. Whether past events are
drawn at all is [`show_past_events`](/reference/configuration#core-settings), which
defaults to `false`. With `show_past_events: true` the card is being asked to show what is
over, so this option has nothing left to do and the event stays.
:::

::: tip It Takes Effect on the Next Refresh, Not on the Minute
The card has one timer, the refresh interval, and nothing schedules a redraw at the time
you name here. An event retires on the first render after its moment passes — which may be
the refresh, a dashboard reload, or any edit that redraws the card. Expect the row to go
within the refresh interval of the time you set, not exactly on it.
:::

### Showing a Calendar on Weekdays Only

`days_of_week` restricts one calendar to weekdays or to weekends. It takes `weekdays` for
Monday to Friday and `weekends` for Saturday and Sunday; leave it out and every day
qualifies, which is the default.

```yaml
entities:
  - entity: calendar.school_holidays
    days_of_week: weekdays # term dates matter on school days
    split_multiday_events: true # judge each day of the holiday on its own
  - calendar.family # keeps its weekend events
```

Like `event_type`, the two values are exact opposites, so listing one calendar twice — once
each way — divides it between two blocks that can carry their own labels and colors,
without losing an event or showing one twice.

::: warning Pair This With `split_multiday_events` on a Calendar of Long Events
The example above sets both, and on a holidays calendar it needs to. `days_of_week` judges
the day a row **lands on**, and an event spanning several days is drawn as a single row on
the first of them unless you split it. So a fortnight's holiday beginning on a Saturday is
one Saturday row, and `weekdays` hides the whole fortnight rather than showing you its
weekdays.

With `split_multiday_events: true` that same holiday becomes a row per day, each judged
separately, and you get the Monday-to-Friday view you asked for. Column view already
defaults the option to `true`, so this pairing only needs stating for list view.
:::

::: tip It Filters the Day a Row Lands On, Not the Day It Started
The same rule explains an event already running when the card's window opens: it is drawn
on the window's **first day**, whichever weekday that is, so that is the day the filter
judges — not the date the event began. A calendar of single-day entries never notices the
distinction, since the two dates are the same.
:::

::: warning A Day the Filter Empties Follows `show_empty_days`
Filtering runs before the card pads out its window, so a Saturday whose only entry this
calendar supplied becomes an empty day like any other. With
[`show_empty_days`](/reference/configuration#core-settings) off — the default in list view
— that day is left out entirely and a later one takes its place. With it on, as column
view defaults to, the day still appears carrying the usual _No upcoming events_ notice.
:::

Weekend means Saturday and Sunday. That is the same definition the
[weekend colors](/features/layout-appearance#week-numbers-visual-separators) use, so a day
this option treats as a weekend is a day the card already colors as one.

### Filtering Duplicate Events

When you subscribe to multiple calendars that might contain the same events (like shared family calendars), you can eliminate duplicates:

```yaml
entities:
  - calendar.personal # Events from this calendar are prioritized
  - calendar.family # Duplicates from this calendar will be hidden
filter_duplicates: true
```

The duplicate detection compares:

- Event title
- Start and end times
- Event location
- Calendar order (calendars listed first have priority)

This is especially useful for:

- Shared household calendars
- Work calendars with team events
- Any scenario where you might see the same event in multiple calendars

::: warning Two Details Are Easy to Miss
Two aspects of this option are easy to miss:

- **The first-listed calendar wins, including its styling.** Only the copy from the
  calendar listed first in `entities` is kept, and it keeps that calendar's `label`,
  `color` and `accent_color`. A shared event can therefore appear under a different
  calendar's styling than you expect — reorder `entities` so the calendar you want to
  see takes precedence.
- **Matching ignores which calendar an event came from.** Any two events sharing a
  title, start time, end time and location are treated as duplicates, even if they are
  genuinely separate events, and even if both are in the _same_ calendar.

Events are never hidden merely for starting at the same time — all four fields must
match. If events are disappearing unexpectedly, set `filter_duplicates: false` to
confirm whether this option is the cause.
:::

### Advanced Filtering Techniques

You can combine filtering features with labels and accent colors to create sophisticated displays. For example, to apply different styling to specific event types within the same calendar:

```yaml
entities:
  - entity: calendar.family
    allowlist: 'shopping|grocery' # Only show shopping-related events
    label: '🛒' # Add shopping cart label to these events
    accent_color: '#1e88e5' # Blue accent for shopping events
  - entity: calendar.family
    allowlist: 'birthday|anniversary' # Only show celebration events
    label: '🎉' # Add celebration label to these events
    accent_color: '#e91e63' # Pink accent for celebration events
  - entity: calendar.family
    blocklist: 'shopping|grocery|birthday|anniversary' # Show all other events
    accent_color: '#607d8b' # Neutral accent for all other events
    # No label for remaining events
```

This technique lets you:

- Apply different labels and colors to different event types from the same calendar
- Create category-based visual organization without needing multiple calendar sources
- Use accent colors with backgrounds (when event_background_opacity > 0) for even more distinction
- Avoid needing to create separate calendars for different event categories

In the visual editor, build this with **Duplicate** at the foot of the calendar's panel —
once for each extra block — and then give each copy its own filter, label and color. See
[Per-Calendar Panels & Actions](/features/editor#per-calendar-panels-actions).

## 📊 Compact Mode & Event Limits

Calendar Card Pro offers powerful controls for managing what appears in compact and expanded mode:

```yaml
# Total days to fetch from API and display when expanded
days_to_show: 7

# Event limit for compact mode
compact_events_to_show: 5 # Preferred: New parameter name

# Day limit in compact mode
compact_days_to_show: 2 # Fewer days to display in compact mode

# Ensure complete days are shown
compact_events_complete_days: true # Never cut off a day's events mid-day
```

::: warning Compact Mode Applies to List View Only
All three options on this page cap the card as a whole, which a stack of days can express
and a row of columns cannot: a limit of three events would fill the first column, spill into
the second and leave every later one blank. So `compact_events_to_show`,
`compact_days_to_show` and `compact_events_complete_days` — including the per-calendar
`compact_events_to_show` below — are read in list view and ignored in column view.

They are not errors and they need not be removed: a card set to `view: column` renders as a
list whenever it is too narrow for columns, and they all apply again the moment it does. To
control how much a column view shows, use
[`min_days_to_show` and `min_days_fallback`](/features/column-view#showing-fewer-columns-instead)
instead.
:::

### Entity-Level vs. Global Event Limits

In addition, you can control how many events are displayed in compact mode from each calendar independently:

```yaml
entities:
  - entity: calendar.family # Show all events from family calendar (no limit)
  - entity: calendar.work
    compact_events_to_show: 2 # Only show 2 most important work events
```

This feature provides several important behaviors:

- **Entity limits are applied first**: Each calendar is restricted to its specific maximum
- **Global limit is applied second**: Total events across all calendars are then limited
- **Chronological order is preserved**: Events remain sorted by date/time
- **Different behavior per mode**: In compact mode, both entity and global limits apply; in expanded mode, all limits are removed and all events within the configured date range are displayed

### Controlling Days in Compact Mode

The `compact_days_to_show` option lets you display fewer days in compact mode:

```yaml
days_to_show: 7 # Show 7 days when expanded
compact_days_to_show: 2 # Show only the next 2 days with events in compact mode
```

This is useful for dashboards where you want an initial view showing just the most immediate events, with the ability to expand to view the entire week.

### Preserving Complete Days

When using event limits, the `compact_events_complete_days` option ensures that partial days are never shown:

```yaml
compact_events_to_show: 5
compact_events_complete_days: true
```

When enabled, this feature ensures that if at least one event from a day is shown, all events from that day will be displayed. This prevents confusion that might arise when some events from a day are visible but others are hidden.

For example, with `compact_events_to_show: 5` and `compact_events_complete_days: true`:

- If the first 5 events are spread across 2 days, all events from those 2 days will be shown
- This might result in showing more than 5 events total, but ensures you never miss events from partially shown days

### Benefits of These Controls

These flexible controls allow you to:

- **Create concise dashboard views**: Show just what's immediately relevant
- **Prioritize important calendars**: Give more visual space to key calendars
- **Prevent overwhelming views**: Limit verbose calendars (like school schedules)
- **Provide complete context**: Ensure users can see all events for any shown day
- **Support easy expansion**: Allow users to see the full calendar with a single tap

## 🧭 Column View

Column view moved to its own page — it outgrew this one.

**→ [Column View](/features/column-view)** — the layout, per-view overrides, spacing and the responsive fallbacks.

**→ [Core Settings in the configuration reference](/reference/configuration#core-settings)** — the full option table for everything on this page.
