# Grid View

Grid view places the days side by side on an hour axis, so an event sits at the time it
starts and is as tall as it is long. It is the same agenda the other two layouts show,
measured against a clock instead of listed.

Set it with `view`. The default, `list`, stacks each day above the next.

```yaml
view: grid
days_to_show: 3
```

In the [visual editor](/features/editor) the layout is the first control in the **Layout**
panel. Choosing **Time Grid** reveals a **Time Axis** group below it, holding every option on this page.

::: tip Start With Three Days
Seven columns need a wide card to stay readable. Three is a good default on a dashboard
column, and a single day makes a compact "what's left of today" card.
:::

## 🕒 Choosing the Hours the Card Shows

`start_time` and `end_time` bound the axis. Both are `HH:mm`, so a band can start at
half past:

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.family
view: grid
days_to_show: 3
time_grid:
  start_time: '06:30'
  end_time: '20:00'
```

`end_time` also accepts `24:00`, which means midnight at the end of the day rather than
the start of it.

An event partly outside the band is drawn clipped, with a subtle dashed mark on the side it
runs past. An event entirely outside it is not drawn at all — so a band is a decision about
what the card shows, not only about how it looks.

Timed events that run across more than one day are split into one block per day column. The
block's position and height show that day's span, so the text stays short: the first block
shows the event's start time, and continuation blocks show the title only.

::: warning A Bad Time Resets Both Bounds
If either value cannot be read as `HH:mm`, the card falls back to `07:00`–`22:00` for
both. Honoring one half of a pair would produce a band you never asked for and could not
recognize as a fallback.
:::

## 📏 How Tall an Hour Is

`hour_height` sets the card's natural height — one hour of axis, multiplied by the hours
in the band:

```yaml
time_grid:
  hour_height: 64px
```

It is a CSS length, so `4em` works too and tracks your font size.

Set a fixed `height` and `hour_height` stops mattering: the axis compresses to whatever
room the card has. Everything on it is positioned as a share of the band rather than in
pixels, so nothing needs recalculating and nothing drifts out of alignment.

```yaml
view: grid
height: 400px
```

That is the setting to reach for on a dashboard where the card has to be a particular
size.

## 📐 Ruling the Axis

`slot_minutes` sets how finely the axis is ruled — `15`, `20`, `30` or `60`. It changes
the ruling only. An hour is the same height whichever you pick:

```yaml
time_grid:
  slot_minutes: 15
```

The hour rules are drawn more strongly than the ones between them, so the eye still finds
the hour at a fine setting.

`axis_width` sets the label gutter. It defaults to `max-content`, so the gutter sizes to
the widest visible label — including the translated all-day label when the all-day band is
shown — with fixed padding on both sides. Set a CSS length when you want a fixed gutter:

```yaml
time_grid:
  axis_width: 3.5em
```

`show_axis_labels: false` removes the hour labels while keeping the scale — useful on a
narrow card where the ruling alone is enough.

The existing separator options draw vertical rules between day columns in grid view:

```yaml
day_separator_color: var(--secondary-text-color)
time_grid:
  day_separator_width: '1px'
  day_separator_color: var(--secondary-text-color)
  week_separator_width: '2px'
  month_separator_width: '3px'
```

Grid view turns day separators on by default, because a shared time axis needs visible day
columns to read clearly. Month rules win over week rules, and week rules win over day
rules. All of them stay inside the time body, so date headers remain clean and a multi-day
all-day banner stays visually continuous across day boundaries.

When you choose **Time Grid** in the visual editor, it adds the grid defaults that differ
from the shared card defaults into `time_grid:` for you. That makes the default day rule, event
background opacity and empty-day behavior visible in their panels, where you can change
them without changing the list or column layouts.

## 🔴 The Now Line

A line marks the current time on today's column, and only there. It is drawn from the same
arithmetic as the events, so it cannot drift away from them.

```yaml
time_grid:
  show_now_line: true
  now_line_color: var(--error-color)
```

When the current time falls outside the band the line is not drawn. A line pinned to the
top or bottom edge would be a false statement about how far through the day you are.

## 🔢 Week Numbers

Week-number pills sit above the date columns, matching column view. Every day column gets
a cell in the week-number row; cells that do not open a week are hidden so the date row
keeps one stable height.

```yaml
show_week_numbers: iso
show_current_week_number: true
```

A window that straddles two ISO weeks labels both the first visible week and the next
boundary it crosses. `show_current_week_number: false` hides only the first visible week,
so an upcoming week boundary can still be labeled.

## 📅 All-Day Events

All-day events do not belong anywhere on an hour axis, so they get a band of their own
between the day headers and the grid. A multi-day event is **one banner spanning its
days**, not a chip repeated in each:

```yaml
time_grid:
  allday_band_max_rows: 3
```

A banner for an event that starts before the first column or ends after the last one
carries a small arrow on that side, so a week-long holiday reads as continuing rather
than as ending exactly at the card's edge.

All-day banners are title-only. They still use the calendar accent, background opacity and
past-event dimming, but they do not draw event detail rows: time badges, location,
description, event weather, countdowns, progress bars and label icons stay out of the band.
Those rows would make one all-day item taller than its neighbors and break the band into a
stack of uneven cards rather than a compact spanning banner.

`allday_band_max_rows` caps how tall the band may grow. Banners that do not fit are
dropped — without it, a week containing several long events would push the axis off the
bottom of the card.

## 🔀 Overlapping Events

Events that overlap are drawn side by side, sharing the column's width. `max_simultaneous_events`
caps how many before the rest collapse into a single block:

```yaml
time_grid:
  max_simultaneous_events: 3
```

The collapsed block says how many it stands for — `+3` — and lists their titles on hover.
Nothing is hidden without being counted. A cap of `1` still keeps the first event lane
visible, then adds the overflow block beside it.

Raise it if you routinely have four or five things at once and would rather see them all
narrow; lower it to keep blocks readable.

Short blocks use progressive disclosure so clipped text does not look broken. A title shows
once a full text row fits, time appears once the block can hold a full title row plus a full
time row, and location waits until there is room for another detail line. In narrow columns,
a long title breaks at word boundaries and truncates before it slices the time or location row.

Timed blocks use the same shared event content as list and column view. Event weather
matches column view: it gets its own detail row under the time, where the condition words
can wrap beneath the temperature instead of competing with the title. The progress bar stays
inline on the time row, and countdowns trail the time text, so those two still compress
inside the first detail row.

::: tip Keep Detail Rows Short
Grid blocks have less room than list rows. If you show time, location and description in
the grid, cap the optional detail rows to one or two lines so the title stays readable and
overflow falls off the bottom of the block:

```yaml
show_location: true
show_description: true
time_grid:
  location_max_lines: 1
  description_max_lines: 2
```

:::

## 📱 Fitting Narrow Cards

Grid view uses the same responsive width fallback as column view, but with grid-specific
options inside `time_grid:`:

```yaml
view: grid
days_to_show: 5
time_grid:
  min_day_width: 100
  min_days_to_show: 1
  min_days_fallback: list
```

`min_day_width` is the narrowest a day column may be before the card sheds a day. The
default is `100`, lower than column view's `140`, because a grid day mostly carries timed
blocks against a shared axis rather than full text rows. At the default spacing, three grid
days need 352px before hysteresis, or 368px when the card is entering grid view from the
list fallback.

`min_days_to_show` defaults to `1`, not to `days_to_show`. A one-column grid is a useful
day view with a now line, so reducing a five-day grid to today's column is the right narrow
card behavior rather than a failure.

If the card cannot fit even `min_days_to_show`, `min_days_fallback` decides what happens
next:

- `list` switches to the list layout.
- `cramp` keeps the grid and lets the columns become narrower than `min_day_width`.

::: warning Dropped Days Are Not Marked
When the grid sheds columns, it shows the earliest days in the configured range and drops
the later ones. The card does not draw a marker saying more days were hidden, so use
`min_days_fallback: cramp` if seeing the whole range matters more than preserving the
minimum column width.
:::

## 🎨 Overriding Options in Grid View

A block on a time axis is much smaller than a full-width row, so a value tuned for the
list layout is often wrong in it. The `time_grid:` block holds the values that apply only when
the card renders as a grid, exactly like `column:` does for the column layout:

```yaml
view: grid
show_location: true
time_grid:
  show_location: false
  event_font_size: 12px
```

Anything the block does not mention keeps its top-level value.

## 🔀 Options That Start From a Different Default

Three shared options do not inherit their top-level value in grid view. The **Default** column
is what grid view uses; **Instead of** is the top-level default it replaces:

| Option                     | Type    | Default | Instead of |
| -------------------------- | ------- | ------- | ---------- |
| `event_background_opacity` | number  | `20`    | `0`        |
| `show_empty_days`          | boolean | `true`  | `false`    |
| `day_separator_width`      | string  | `1px`   | `0px`      |

A block on a time axis is read by its **area** — an untinted one is an outline you have to
reconstruct — so grid view fills blocks by default. And a day with nothing in it is still
a day of axis, so empty days are shown. Day separators are also on by default, so the
shared axis still reads as separate day columns.

Set any of them inside `time_grid:` to change it back.

Grid also accepts the same day-header spacing options as column view:

```yaml
time_grid:
  day_header_gap: 12px
  day_header_separator_width: 2px
  day_header_separator_color: var(--primary-color)
```

The rule sits inside the header cell, above the all-day band, so it never slices through a
banner that spans several days.

## 🚫 Options That Do Nothing in Grid View

`split_multiday_events` has no effect here, and the reason is worth stating because it
looks like it should. The grid answers the question in both directions itself: an all-day
event spanning several days is drawn as one banner across them, and timed events are split
by the grid renderer into one timed block for each day they touch. The list splitter is not
used, because it would turn the middle day of a timed event into an all-day banner.

The compact options — `compact_events_to_show`, `compact_days_to_show` and
`compact_events_complete_days` — are list-only and do nothing here either, as they do
nothing in column view.

The detail-row options also do nothing on all-day banners: `show_time`,
`show_single_allday_time`, `show_multiday_allday_time`, `allday_badge`,
`show_location_allday`, `show_description_allday`, `show_countdown_allday`,
`show_progress_bar`, `weather.position: event`, per-calendar `label`,
`label_type: home-assistant`, `label_icon_color` and their max-line companions affect
timed blocks or the other views, not the all-day band.

**→ [Grid-Only Options in the configuration reference](/reference/configuration#grid-only-options)** — full option table.
