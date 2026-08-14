# Column View

Column view places the days side by side, one column each, so a week reads across the card
rather than down it. It is the same agenda the list layout shows, rotated — every event,
label and color option you already use applies unchanged.

Set it with `view`. The default, `list`, stacks each day above the next.

```yaml
view: column
days_to_show: 5
```

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_column_basic.png" alt="Three days side by side in column view"><br>

In the [visual editor](/features/editor) the layout is the first control in the **Layout**
panel. Choosing **Columns** reveals the column-only options below it, and adds a
**Column View Exceptions** row to the panels whose options can differ between the two
layouts.

Column view is responsive by design. A day column has a minimum readable width, so as the
card narrows the layout gives up columns one at a time, and eventually falls back to the
list layout entirely. **A card configured `view: column` therefore renders as a list on a
narrow dashboard or a phone** — both layouts are live for the same card, and both are worth
configuring. That is the first thing to get right, so it comes first below.

## 📱 Falling Back to the List Layout

Columns stop being readable below a certain width. `min_day_width` sets that floor in
pixels, `140` by default. When the card is too narrow to give every day that much room, it
renders as a list instead.

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

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_column_week_list.png" alt="The same column card on a phone, rendered as a list"><br>

That is the same card as the one at the top of [A Week Side by Side](/reference/examples#a-week-side-by-side-in-column-view), on a phone-width card. Three things change with the layout, and all three are defaults rather than anything the card was told to do: the locations reappear, because a `column:` override only applies while the card renders as columns; the empty day disappears, because `show_empty_days` is `false` outside column view; and the multi-day trip is no longer split across days.

By default the number of columns follows `days_to_show` exactly, and a card too narrow for
all of them switches to the list layout rather than quietly showing fewer days than you
configured.

## 🔢 Showing Fewer Columns Instead

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

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_column_week_medium.png" alt="A seven-day column card narrowed to five columns"><br>

Same card again, wide enough for five of its seven days. Nothing marks the two that were
dropped, which is the point of the warning below.

::: warning Days You Configured Can Disappear
A card showing four of seven days looks exactly like a card configured for four days — there
is no marker saying days were dropped. That is why `min_days_to_show` defaults to
`days_to_show`, which switches the behavior off: reducing columns is opt-in, not something
that happens to a config you already had.
:::

## ⚠️ When Even the Fewest Columns Will Not Fit

`min_days_fallback` decides what happens at the very bottom. The default, `list`, gives up
the column layout — the behavior described above. Set it to `cramp` and the card holds at
`min_days_to_show` columns instead, letting them narrow past `min_day_width`:

```yaml
column:
  min_days_to_show: 2
  min_days_fallback: cramp
```

Use `cramp` when the column layout matters more to you than legibility at extreme widths —
on a phone-width card, for example, where two cramped columns still beat a long list. It can
produce a card too cramped to read; that is the trade.

**→ [Column-Only Options in the configuration reference](/reference/configuration#column-only-options)** — full option table.

## 🎛️ Overriding Options in Column View

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

## 🔀 Options That Start From a Different Default

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

## 🚫 Options That Cannot Be Overridden

These options decide _which_ events the card loads, so they must hold the same value in both layouts and are ignored inside `column:`. Set them at the top level:

`entities` · `start_date` · `days_to_show` · `first_day_of_week` · `weather` · `refresh_interval` · `refresh_on_navigate`

`show_past_events` and `filter_duplicates` sound like they belong in that list and do not. Both filter events the card has already loaded, so they can differ per view — and often want to, because a column is a narrow space where a finished event or a second copy of the same meeting costs more than it does in a full-width row:

```yaml
view: column
show_past_events: true
filter_duplicates: false
column:
  show_past_events: false # a column is too narrow to spend on what is over
  filter_duplicates: true # and too narrow to show the same meeting twice
```

An entry the card does not recognise is ignored rather than treated as an error, so one stray line cannot break the rest of the card. If an override seems to do nothing, check it is not one of the options above.

## 💤 Options That Do Nothing in Column View

A few options describe something the column layout does not have, so they are read in list
view and ignored in column view. They are not errors and they are not removed — the same
card renders as a list whenever it is too narrow for columns, and every one of these
applies again the moment it does.

**`date_vertical_alignment`** positions the date inside a tall date cell. A column header
sits above its events rather than beside them, so there is no cell to move it in.

**`today_indicator_position`** places the marker within that same date cell, as a
percentage of it. In column view the indicator is a leading item on the weekday row
instead — so `today_indicator`, `today_indicator_size` and `today_indicator_color` all
still apply, and only the position does not.

**`compact_events_to_show`, `compact_days_to_show` and `compact_events_complete_days`**
belong to compact mode, which caps the whole card rather than each column. A cap of three
would truncate the grid after the third event and leave the remaining columns blank.
Column density is controlled by [`min_days_to_show` and
`min_days_fallback`](#showing-fewer-columns-instead) instead.

**Per-entity `split_multiday_events`** is ignored because a column _is_ a day: an unsplit
event would leave every later column it spans silently blank, and a per-calendar opt-out
would make one calendar honest and another not in the same card. The card-level
`column: split_multiday_events: false` is the deliberate escape hatch, and it does work.

::: tip These Are Annotated in the Visual Editor
The editor marks these controls rather than hiding them, because they still apply whenever
the card falls back to the list layout.
:::

## 📊 Progress Bar & Countdown

A [countdown](/features/event-content#countdown-display) and a [progress bar](/features/event-content#progress-bar-display) never appear on the same event — a countdown means the event has not started, a bar means it is running now — so column view places each one differently.

**The countdown stays on the time row**, following the time and separated from it by a middot:

```
🕐 09:30 – 11:00 · in 2 days
```

In a column too narrow to hold it, the whole phrase wraps as ordinary running text and continues under the time.

::: tip Icon Alignment
Because the time can now occupy two lines, `event_icon_vertical_alignment` decides where the clock sits against it. The default `top` lines the icon up with the first line; `middle` centers it against the whole wrapped block. See [Spacing & Alignment](/features/layout-appearance#spacing-alignment).
:::

**The progress bar takes a row of its own**, directly under the event title and above the time, spanning 80% of the column. Give it a different width with `progress_bar_width`, for both layouts at once or for columns only:

```yaml
show_progress_bar: true
progress_bar_width: '80px' # the bar on the list view's time row
column:
  progress_bar_width: '100%' # the bar on its own row in column view
```

Left unset entirely, each layout keeps the width that suits it — which is usually the right answer, since a width tuned for the column's own row is often too wide for the list view's time row.

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_column_complete.png" alt="A column card showing countdowns, a progress bar and weather"><br>

Both are visible above: the running event on the left carries the bar on its own row, and
every later event carries a countdown after its time. No event has both, because no event
can be running and still to come.

## ↔️ Spacing Between Days

`day_spacing` is the space between one day and the next, and it applies in both layouts —
vertically between stacked days in a list, horizontally between columns.

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

## 📐 Spacing Options That Only Exist in Column View

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

The header rule starts switched **off**. `day_header_gap` supplies the space under the
header on its own, so switching the rule on centers it inside that space rather than adding
to it and the layout does not shift.

::: tip Turning the Rule Off
Set `day_header_separator_width: 0px` rather than reaching for a transparent color — at
`0px` the card omits the element entirely, while a transparent rule still takes up height.
:::

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_column_styling.png" alt="A column card with a wider header rule, per-calendar accent colors and event backgrounds"><br>

That card pairs the two options above — a 2px header rule in the primary color and a wider
`day_header_gap` — with per-calendar `accent_color` and `event_background_opacity`, which
are ordinary options that apply in both layouts.

The `column:` block and every option inside it are listed under [Column-Only Options in the
configuration reference](/reference/configuration#column-only-options).

