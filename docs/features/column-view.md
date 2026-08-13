# Column View

Column view places the days side by side, one column each, so a week reads across the card
rather than down it. It is the same agenda the list layout shows, rotated — every event,
label and color option you already use applies unchanged.

Set it with `view`. The default, `list`, stacks each day above the next.

```yaml
view: column
days_to_show: 5
```

Column view is responsive by design. A day column has a minimum readable width, so as the card narrows the layout gives up columns one at a time, and eventually falls back to the list layout entirely. That means a card configured `view: column` renders **as a list** on a narrow dashboard or a phone — both layouts are live for the same card, and both are worth configuring. See [Falling Back to the List Layout](#falling-back-to-the-list-layout).

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

::: tip Why Not Simply Inherit It
Inheriting only when you had not set the value yourself would need the card to remember which options you typed and which merely defaulted — and it would produce the odd result that two cards behaving identically in list view render differently in column view, depending on whether a value was typed or left alone. A default you can read in a table beats a rule you cannot see in your own YAML.
:::

## 🚫 Options That Cannot Be Overridden

Only presentation options may appear in `column:`. Anything that decides _which_ events the card loads from Home Assistant — `entities`, `start_date`, `days_to_show`, `first_day_of_week`, `show_past_events`, `filter_duplicates`, `weather`, `refresh_interval` and `refresh_on_navigate` — has to hold the same value in both views. The card switches between the two layouts as the dashboard resizes, and a per-view value here would mean reloading events every time it crossed that boundary.

An unusable entry inside the block is ignored rather than treated as an error, so one stray line cannot break the rest of the card.

## 📊 Progress Bar & Countdown

A [countdown](/features/event-content#countdown-display) and a [progress bar](/features/event-content#progress-bar-display) never appear on the same event — a countdown means the event has not started, a bar means it is running now. Column view uses that to give each one the treatment it needs, rather than a single compromise that suits neither.

**The countdown stays on the time row**, following the time and separated from it by a middot:

```
🕐 09:30 – 11:00 · in 2 days
```

It reads as trailing text, which is what its wording assumes — countdown strings are lowercase (`in 2 days`) because they were written to follow something. The whole phrase is treated as running text, so a column too narrow to hold it breaks it at an ordinary word boundary rather than moving the countdown down as one block:

```
🕐 09:30 – 11:00 ·
   in 2 days
```

Every wrapped line begins under the time _text_ rather than under the clock icon, and the middot always travels with the word it introduces, so it can never be stranded alone at the end of a line.

::: tip Icon Alignment
Because the time can now occupy two lines, `event_icon_vertical_alignment` decides where the clock sits against it. The default `top` lines the icon up with the first line; `middle` centers it against the whole wrapped block. See [Spacing & Alignment](/features/layout-appearance#spacing-alignment).
:::

**The progress bar takes a row of its own**, directly under the event title and above the time. A bar is a graphic rather than a line of text, so a row with no icon in front of it reads as deliberate — where a bare line of text on the same row would read as a row whose icon had gone missing.

The bar spans 80% of the column, flush with the left edge of the title, so it reads as an indicator for the whole event. Give it a different width with `progress_bar_width`, either for both views at once or for columns only:

```yaml
show_progress_bar: true
progress_bar_width: '80px' # the bar on the list view's time row
column:
  progress_bar_width: '100%' # the bar on its own row in column view
```

Set at the top level, the value applies to both views. Left unset entirely, each layout keeps the width that suits it.

::: tip Both Layouts Are Live
A card set to `view: column` still renders as a list on a narrow dashboard, so both placements are in play for the same card. A width tuned for the column row may be far too wide for the list view's time row — which is what the `column:` exception above is for.
:::

## ↔️ Spacing Between Days

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

## 📱 Falling Back to the List Layout

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
on a phone-width card, for example, where two cramped columns still beat a long list. It is
deliberately capable of producing an unreadable card; that is the trade you are making.

**→ [Column-Only Options in the configuration reference](/reference/configuration#column-only-options)** — full option table.
