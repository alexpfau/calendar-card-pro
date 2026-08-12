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

| Option                   | Type    | Default                                                                                                         | Description                                                                                                                    |
| ------------------------ | ------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `entity`                 | string  | —                                                                                                               | **Required.** The calendar entity ID                                                                                           |
| `label`                  | string  | `-`                                                                                                             | Calendar label displayed before event titles. Supports text/emoji, MDI icons (`mdi:icon-name`), or images (`/local/image.jpg`) |
| `color`                  | string  | `event_color`                                                                                                   | Custom color for event titles from this calendar                                                                               |
| `accent_color`           | string  | `accent_color`                                                                                                  | Custom color for the vertical line and event background (when `event_background_opacity` is >0)                                |
| `label_icon_color`       | string  | `-`                                                                                                             | Custom color for label icons (only applies to `mdi:` and other icon labels)                                                    |
| `show_time`              | boolean | `show_time`                                                                                                     | Whether to show event times for this calendar (overrides global `show_time` option)                                            |
| `show_location`          | boolean | `show_location`                                                                                                 | Whether to show event locations for this calendar (overrides global `show_location` option)                                    |
| `show_description`       | boolean | `show_description`                                                                                              | Whether to show event descriptions for this calendar (overrides global `show_description` option)                              |
| `compact_events_to_show` | number  | `compact_events_to_show`                                                                                        | Maximum number of events to show from this calendar (works with global `compact_events_to_show`)                               |
| `blocklist`              | string  | RegExp pattern to specify events to exclude (e.g., "Private\|Conference")                                       |
| `allowlist`              | string  | RegExp pattern to specify events to include (e.g., "Birthday\|Anniversary")                                     |
| `split_multiday_events`  | boolean | Whether multi-day events from this calendar span each day they cover (overrides global `split_multiday_events`) |

This structure gives you granular control over how information from different calendars is displayed.

These options are per calendar. For the card-wide options they override, see [Core Settings in the configuration reference](/reference/configuration#core-settings).

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

## 📊 Compact View Management & Event Limits

Calendar Card Pro offers powerful controls for managing what appears in compact and expanded views:

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
- **Different behavior in views**: In compact view, both entity and global limits apply; in expanded view, all limits are removed and all events within the configured date range are displayed

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

These flexible view controls allow you to:

- **Create concise dashboard views**: Show just what's immediately relevant
- **Prioritize important calendars**: Give more visual space to key calendars
- **Prevent overwhelming views**: Limit verbose calendars (like school schedules)
- **Provide complete context**: Ensure users can see all events for any shown day
- **Support easy expansion**: Allow users to see the full calendar with a single tap

## 🧭 Column View

`view` chooses how the card arranges the days it shows. The default, `list`, stacks each day above the next down the card. `column` places the days side by side, one column each, so a week reads across rather than down.

```yaml
view: column
days_to_show: 5
```

Column view is responsive by design. A day column has a minimum readable width, so as the card narrows the layout gives up columns one at a time, and eventually falls back to the list layout entirely. That means a card configured `view: column` renders **as a list** on a narrow dashboard or a phone — both layouts are live for the same card, and both are worth configuring. See [Falling Back to the List Layout](#falling-back-to-the-list-layout).

### Overriding Options in Column View

A column is far narrower than a full-width row, so a value tuned for the list layout is often wrong in a column. The `column:` block holds the values that apply only when the card renders as columns. Anything the block does not mention keeps its top-level value, with two deliberate exceptions covered in [Options That Start From a Different Default](#options-that-start-from-a-different-default).

```yaml
show_location: true
event_font_size: 14px
column:
  show_location: false
  event_font_size: 11px
```

That card shows the location in list view and hides it in column view. The block works in both directions, so an option switched off at the top level can be switched back on for columns:

```yaml
show_description: false
column:
  show_description: true
```

What decides the outcome is whether the block mentions an option at all, not what value it holds. `show_location: false` inside the block is a real instruction to hide the location, not an empty value that falls back to the top level.

The block covers the card's dimensions too, and that is where it earns its keep most often: the same events laid out side by side are far shorter than they are stacked, so a `height` or `max_height` tuned for one view is usually wrong for the other. See [Height in Column View](/features/layout-appearance#height-in-column-view).

### Options That Start From a Different Default

Two options mean something different once days sit side by side, so column view starts them from its own default rather than from yours.

| Option | Type | Default | Column Default |
| ------ | ---- | ------- | -------------- |
| `show_empty_days` | boolean | `false` | `true` |
| `split_multiday_events` | boolean | `false` | `true` |

A list of events reads perfectly well with the blank days left out. A row of day columns does not: drop the empty ones and the columns stop corresponding to consecutive days, so the card quietly becomes something other than it appears. The same reasoning applies to a multi-day event — a column _is_ a day, so an event spanning three of them belongs in all three.

These two do **not** inherit the top-level value at all. Setting `show_empty_days: false` at the top level changes the list layout only; column view keeps showing empty days. The way to change it for columns is the block:

```yaml
show_empty_days: false # list view hides them
column:
  show_empty_days: false # columns hide them too
```

::: tip Why Not Simply Inherit It
Inheriting only when you had not set the value yourself would need the card to remember which options you typed and which merely defaulted — and it would produce the odd result that two cards behaving identically in list view render differently in column view, depending on whether a value was typed or left alone. A default you can read in a table beats a rule you cannot see in your own YAML.
:::

### Options That Cannot Be Overridden

Only presentation options may appear in `column:`. Anything that decides _which_ events the card loads from Home Assistant — `entities`, `start_date`, `days_to_show`, `first_day_of_week`, `show_past_events`, `filter_duplicates`, `weather`, `refresh_interval` and `refresh_on_navigate` — has to hold the same value in both views. The card switches between the two layouts as the dashboard resizes, and a per-view value here would mean reloading events every time it crossed that boundary.

An unusable entry inside the block is ignored rather than treated as an error, so one stray line cannot break the rest of the card.

### Spacing Between Days

`day_spacing` is the space between one day and the next, and it applies in both views —
vertically between stacked days in a list, horizontally between columns in a column
layout. It is one option because it is one idea: how far apart the days sit.

```yaml
view: column
days_to_show: 5
day_spacing: 16px
```

It takes a per-view value like any other option, which is worth reaching for here more
often than elsewhere. The gap between two columns is the only thing separating one day's
events from the next, so it carries more weight than the same number does in a list —
widen it first if two columns read as one block. It is also the option that costs the
most, because every gap comes out of the width the columns themselves have to share.

```yaml
day_spacing: 10px
column:
  day_spacing: 16px
```

### Spacing Options That Only Exist in Column View

A few things have no meaning in a list. A column layout needs a gap under each day
header, and a rule that can run under that header rather than between days. Those
options live inside `column:` and have no top-level counterpart.

| Option                       | Type   | Default                | Description                                                                      |
| ---------------------------- | ------ | ---------------------- | -------------------------------------------------------------------------------- |
| `day_header_gap`             | string | `8px`                  | Vertical space between a day header and its first event                          |
| `day_header_separator_width` | string | `0px`                  | Thickness of the rule under each day header; `0px`, the default, renders no rule |
| `day_header_separator_color` | string | `var(--divider-color)` | Color of that rule                                                               |

```yaml
view: column
days_to_show: 5
column:
  day_header_gap: 12px
  day_header_separator_width: 2px
  day_header_separator_color: var(--primary-color)
```

The header rule starts switched **off**, like every other separator in the card. Seen next
to the colored accent bar beside each event, a full-width horizontal rule reads as a table
border rather than as part of a calendar. What separates the header from the events is
`day_header_gap` instead, and that gap is constant: switching the rule on centers it inside
the existing space rather than adding to it, so the layout does not shift.

Its color is `var(--divider-color)`, Home Assistant's semantic divider token, rather than
the `var(--secondary-text-color)` the list separators use — this is a divider, not text, so
it follows your theme's divider color and stays a little quieter than the day labels above
it.

::: tip Turning the Rule Off
`0px` is already the default. If you have switched it on and want it back off, set
`day_header_separator_width: 0px` rather than reaching for a transparent color. At `0px` the
card omits the element entirely; a transparent rule still occupies its own height.
:::

### Falling Back to the List Layout

Columns stop being readable below a certain width. `min_day_width` sets that floor in
pixels, `140` by default. When the card is too narrow to give every day that much room, it
renders as a list instead.

It lives inside the `column:` block rather than at the top level, because a minimum column
width has no meaning in a layout that has no columns:

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.family
view: column
days_to_show: 5
column:
  min_day_width: 170
```

Raising it makes the card give up the column layout sooner, which is what you want when
your events have long titles. Lowering it keeps columns on narrower cards, at the cost of
more wrapping.

By default the number of columns follows `days_to_show` exactly, and a card too narrow for
all of them switches to the list layout rather than quietly showing fewer days than you
configured.

### Showing Fewer Columns Instead

`min_days_to_show` changes that. It is the fewest columns the card may shrink to, and it
lets a narrow card drop trailing days one at a time instead of abandoning the column layout
outright:

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.family
view: column
days_to_show: 7
column:
  min_days_to_show: 3
```

That card shows seven columns when there is room, then six, five, four and three as it
narrows, and only falls back to the list layout once even three columns will not fit.

::: warning Days You Configured Can Disappear
A card showing four of seven days looks exactly like a card configured for four days — there
is no marker saying days were dropped. That is why `min_days_to_show` defaults to
`days_to_show`, which switches the behavior off: reducing columns is opt-in, not something
that happens to a config you already had.
:::

### When Even the Fewest Columns Will Not Fit

`min_days_fallback` decides what happens at the very bottom. The default, `list`, gives up
the column layout — the behavior described above. Set it to `cramp` and the card holds at
`min_days_to_show` columns instead, letting them narrow past `min_day_width`:

```yaml
column:
  min_days_to_show: 2
  min_days_fallback: cramp
```

Use `cramp` when the column layout matters more to you than legibility at extreme widths —
on a phone-width card, for example, where two cramped columns still beat a long list. It is
deliberately capable of producing an unreadable card; that is the trade you are making.

**→ [Column-Only Options in the configuration reference](/reference/configuration#column-only-options)** — full option table.
