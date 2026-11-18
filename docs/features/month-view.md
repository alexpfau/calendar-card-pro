# Month View

Month view draws six whole weeks, a row each, so a household can read its calendar the
traditional way: the month at a glance, with every event on its day. It is the same agenda the
other layouts show, laid out as a wall calendar.

Set it with `view`:

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.anna
  - calendar.ben
view: month
```

In the [visual editor](/features/editor#the-overview), **Starting Layout** on the overview
chooses the layout the card opens with. Select **Month** under **Settings For**, at the top of a
page, to change how the month looks: its height under **Size & Spacing**, and week scrolling
under **Taps & Refresh**.

## 📅 The Six Weeks

The weeks start on the first day of the week, `first_day_of_week` or your Home Assistant
locale's, and the first row is the week holding the 1st of the month `start_date` falls in, today
unless you set one.

- **Always six rows.** Six weeks hold any month, whichever day its 1st falls on, so the card's
  height never changes from one month to the next.
- **The heading names one month:** the one with the most days on screen. Its tooltip gives the
  exact dates the six weeks span.
- **Days of the months around it** are dimmed and keep their events, and the 1st of each month
  carries its month's name, such as "1 Dec".
- **Today** sits on the [date tile](/features/layout-appearance#the-date-tile), or is written in
  today's colors under another indicator style, and past days are dimmed. Past events are shown
  by default in month view; see
  [Options That Start From a Different Default](#options-that-start-from-a-different-default).

### Paging Through Months

With the toolbar's [date navigation](/features/layout-appearance#paging-through-dates), the
arrows and a sideways swipe move a whole month, the date picker jumps to the month of the date
you pick, and the home button returns to the month the card opens with.

- **Switching layouts keeps your place.** Paged to another month, List, Columns and Grid start
  on the 1st of the month in the heading. Into Month, the rows start on the week holding the
  other layout's first day.
- **Search** pages to the month of the event you pick, and opens the day's list where the
  event is behind "+N more", or selects its day on a [compact month](#the-compact-month).

## 🟦 Bars & Lines

Each day lists its timed events one line each, and an event that covers whole days is a bar
across them, as Grid's all-day band draws it.

- **A line** is a timed event: its calendar's accent bar, its title, cut short where it is too
  long, and its start time at the line's end, with the calendar's
  [label](/features/core-settings#available-options-for-entity-configuration-objects) where it
  has one. An event that runs past midnight but less than a day has a line on each day it
  touches, the later one reading "until 01:30".
- **A bar** is an all-day or multi-day event, in its calendar's color. One all-day day is a short
  bar of its own; a longer event spans its days and starts again, with its title, at the start
  of each row it continues on.
- **Bars come first**, then each day's lines by their start time, so a bar keeps one line across
  its week.

### Long Timed Events

A timed event a full day or longer, such as an on-call week, is a bar too, with its start time
after its title and its end at the bar's far end, as in
[Grid View](/features/grid-view#long-timed-events-as-banners). `multiday_banners` turns this
off, giving it a line on each day instead:

```yaml
month:
  multiday_banners: false
```

A calendar's own `multiday_banners` wins, as it does in Grid.

::: details Days a Calendar Leaves Out
A bar breaks where a calendar's [`days_of_week`](/features/core-settings#showing-a-calendar-on-weekdays-only)
leaves a day out, and starts again after it, so a weekday-only trip never covers the weekend.
:::

## 📏 How Tall a Week Is

`row_height` sets a week's height, `112px` by default, which holds four events under each date
at the default text size. A taller week holds more:

```yaml
view: month
month:
  row_height: 160px
```

| Option               | Type   | Default | Description                                                                                         |
| -------------------- | ------ | ------- | --------------------------------------------------------------------------------------------------- |
| `month → row_height` | string | `112px` | A week's height, as a CSS length; ignored under a fixed `height`, which the six weeks share instead |

The weeks never grow with their events, so a busy month is as tall as a quiet one. With a fixed
`height`, the six weeks divide it between them, and each day holds as many events as its share
fits.

::: details Heights the Weeks Cannot Take
`row_height` takes a length, such as `112px` or `8em`. A percentage, or a word such as `auto`,
would let the events size the weeks, so the card warns and uses `112px` instead. A fixed `height`
in percent only works where the card's container has a height of its own; where it does not, the
weeks take `row_height`.
:::

### More Than Fits

Where a day has more events than its week holds, its last line reads "+2 more", and a press
opens the day in a panel: every event that day, drawn as in [the day's list](#the-days-list) of a
compact month, with their times, locations and the other details the card shows. A press on an
event there closes the panel and does what a press on it in the month would.

::: details Limits the Day's List Ignores
The list shows the whole day whatever the list layout's own limits say: `skip_first_events`,
the compact limits, `event_order` and `show_empty_days` shape a list card, not a day.
:::

## 📱 The Compact Month

On a narrow card, a phone's, a day is too narrow for titles, so the month draws its compact
form: under each day's number a small capsule with a segment per event in its calendar's color,
up to four, or a dot for a single event, and the events of the day you choose listed under the
weeks.

```yaml
view: month
month:
  min_day_width: 60 # stay wide down to narrower days
```

| Option                  | Type   | Default | Description                                                                        |
| ----------------------- | ------ | ------- | ---------------------------------------------------------------------------------- |
| `month → min_day_width` | number | `80`    | Narrowest a day may be, in pixels, before the month draws its compact form instead |

At the defaults, a card narrower than about 600 pixels draws the compact form. It turns wide
again only a little past the width it turned compact at, so a card on the edge does not flicker
between the two.

- **Choosing a day:** a tap selects it. The month opens on today where the heading's month holds
  it, and otherwise on the 1st; paging selects the new month's default, and the home and
  [reset](/features/layout-appearance#resetting-the-card) buttons go back to today.
- **Adding an event:** the toolbar's [add button](/features/actions#add-event-button) dates a new
  event on the selected day, and with `day_tap_action: add-event`, so does a press on the day's
  name over its list. A tap on a day only selects it.
- **At midnight**, a selected today moves on to the new day.

### The Day's List

The chosen day's events are listed under the weeks, and the list keeps room for four of them on
every day, so the card stays one height as you tap from day to day and page from month to month.
A day with more lists three and "+5 more", which opens the day in a panel. `day_list_events` sets
how many the list keeps room for:

```yaml
view: month
month:
  day_list_events: 6 # room for six events before "+N more"
```

| Option                    | Type   | Default | Description                                                                                                                                                   |
| ------------------------- | ------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `month → day_list_events` | number | `4`     | Events the compact month's list keeps room for on every day, past which it lists one fewer and "+N more"; `0` lists every event, and the card follows the day |

In the visual editor, that is Events in Day List under Size & Spacing › Card Size & Spacing, with
**Settings For** on Month.

- **Times sit beside the titles**, whatever `time_position` says, as a phone's day list puts them:
  a row is a line shorter, and the times line up at its end.
- **The day's name keeps to one line** as well: where it does not fit in full, the weekday is
  shortened first ("Wed, November 18, 2026"), then the month, then the year is left out, then the
  weekday ("Nov 18"), and last the month ("18"), so the day's number shows on any card wide
  enough for its weeks.
- **Each detail keeps to one line**: a title too long for the line beside its time ends in "…",
  and the location, the description and the forecast take a line each. The panel shows them in
  full.
- **Each event is a block of its own**, with its own accent bar, 6px from the next: Month starts
  [`event_gap`](/features/layout-appearance#gaps-between-events) from `6px`; see
  [below](#options-that-start-from-a-different-default).
- **"+N more" is a button** in the tab order, after the month. Closing the panel it opens brings
  you back to it.
- **With a fixed `height`**, the list's room counts toward the card's content, which scrolls as a
  whole; nothing inside the list scrolls.
- **`day_list_events: 0`** lists every event at its full height, its title wrapping beside its
  time, and the card grows and shrinks with the day.

The panel "+N more" opens, here or on a wide month, lists a day the same way, without the room or
the one-line limit.

::: details How Tall the Room Is
Each row of the room is as tall as an event showing everything the card shows: a title with its
time, a location, and a description or a progress bar where the card shows them, at the largest
`text_scale` any calendar has. A day with fewer events leaves the rest of the room empty, and a
day with none shows "No events" in it.
:::

## ⌨️ Keyboard

The month is one stop in the tab order. The arrow keys move a day or a week, Home and End go to
the ends of the week, and Page Up and Page Down go to the month before or after the one shown, on
the same date where it has one. Enter or Space opens the day's list in a panel, or on a compact
month selects the day. Each day is announced with its full date and how many events it holds.

The events in a wide month's days are not stops of their own, so a busy month does not hold
hundreds of them; the day's list reaches each one.

## 🖱️ Scrolling by Weeks

`week_scroll` lets the mouse wheel, a trackpad or a vertical swipe move the month a week at a
time, rather than scroll the dashboard. It is off by default, because it takes those gestures
from the page:

```yaml
view: month
month:
  week_scroll: true
  week_scroll_min_width: 700 # a wall tablet scrolls, a phone in landscape does not
```

| Option                          | Type    | Default | Description                                                                  |
| ------------------------------- | ------- | ------- | ---------------------------------------------------------------------------- |
| `month → week_scroll`           | boolean | `false` | Move the weeks a week at a time by the wheel, a trackpad or a vertical swipe |
| `month → week_scroll_min_width` | number  | `0`     | Narrowest card, in pixels, it applies to; `0` applies it at any width        |

- It never applies to the [compact month](#the-compact-month), or while the card is being
  edited.
- After a scroll the heading follows its rule, the arrows step from the heading's month, and
  the home button returns to the month the card opens with.
- Scrolled weeks are loaded a month at a time, so a long scroll does not ask Home Assistant for
  every week on its own.

## 🔢 Week Numbers

`show_week_numbers` draws each week's number in the corner of its first day, or beside the row on
a compact month, where the current week's stands out. As in List, the first row's number shows
only with `show_current_week_number`. `week_number_color` and `week_number_font_size` apply;
`week_number_background_color` does not, since the numbers are plain text.

## 🎨 Shading the Weekend & Today

`weekend_background_color` shades each weekend day and `today_background_color` shades today, so
the shape of the month shows before you read a date. They are Grid's two options with Grid's
defaults: the weekend in a faint mix of the theme's text color, which darkens a light theme and
lightens a dark one, and today off until you give it a color.

```yaml
view: month
month:
  today_background_color: 'color-mix(in srgb, var(--primary-color) 12%, transparent)'
```

| Option                             | Type   | Default                                                         | Description                                                                                                  |
| ---------------------------------- | ------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `month → weekend_background_color` | string | `color-mix(in srgb, var(--primary-text-color) 4%, transparent)` | Tint behind a weekend day; `transparent` turns it off                                                        |
| `month → today_background_color`   | string | `transparent`                                                   | Tint behind today. Off by default; a color turns it on, and on a weekend day it replaces the weekend's shade |

- **The whole day is shaded**, under its date and its events, and on a
  [compact month](#the-compact-month) its number and marks. Days of the months either side are
  shaded too; the weekday names, the day's list and the panel are not.
- **Keep both faint**, since event text sits on top. Today's tile, the selected day's mark and the
  keyboard's focus ring stay above the shade.
- **Today on a weekend** takes today's color in place of the weekend shading rather than mixing
  the two.
- **Which days are the weekend** follows the
  [country set in Home Assistant](/features/core-settings#showing-a-calendar-on-weekdays-only), or
  its language where no country is set, as in [Grid](/features/grid-view#shading-the-weekend).
- **Grid shades apart**: its own two options live in `time_grid:`, so each layout keeps its own
  colors.

## 🧰 Month in the View Switcher

The toolbar's [view switcher](/features/layout-appearance#switching-between-layouts) offers Month
with the other layouts by default. Month shows six weeks, so a card that can switch to it loads
those six weeks with its own days. To keep a card's loading small, name the layouts the switcher
offers in `view_switcher_layouts` and leave Month out:

```yaml
toolbar:
  show: true
  view_switcher_layouts: [list, grid]
```

In the visual editor, that is **View Switcher offers** under Card & Header › Toolbar: uncheck
Month to take it out.

`hide_when_empty` counts Month's events only from the card's `start_date` on, so past events
in the month never keep an otherwise empty card on screen.

## 🎨 Overriding Options in Month View

The `month:` block holds the values that apply only when the card draws a month, as `column:`
and `time_grid:` do for their layouts:

```yaml
view: month
show_location: true
month:
  show_location: false
  event_font_size: 12px
```

Anything the block does not mention keeps its top-level value, except `show_past_events` and
`event_gap`, below.
Options that decide which events the card loads, such as `start_date` and `entities`, and others
that act on the card as a whole, such as the actions and the `toolbar`, are card-wide and ignored
inside `month:`; see
[Options That Cannot Be Overridden](/features/column-view#options-that-cannot-be-overridden).

## 🔀 Options That Start From a Different Default

Two shared options do not inherit their top-level value in month view:

| Option             | Type    | Default | Month Default |
| ------------------ | ------- | ------- | ------------- |
| `show_past_events` | boolean | `false` | `true`        |
| `event_gap`        | string  | `0px`   | `6px`         |

A month shows its past days with their events, dimmed, rather than empty weeks behind today. Set
`show_past_events: false` inside `month:` to hide them.

A [day's list](#the-days-list) holds one day under its name, so its events read better apart than
joined into one block beside a date, as the list layout keeps them. Set `event_gap: 0px` inside
`month:` to join them; a top-level `event_gap` changes the list and column layouts alone.

## 🚫 Options That Do Nothing in Month View

These options have no effect while the card draws a month, and the visual editor leaves them out
while **Settings For** is Month. Stored values are kept for the layouts they apply to.

| Options                                                                                                                                        | In Month View                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `days_to_show`                                                                                                                                 | A month always shows six weeks                                                                               |
| `show_empty_days`, `show_empty_today`, `empty_day_text`, `empty_day_color`                                                                     | Every day of the six weeks is drawn, events or not, so there is no empty day to hide or fill                 |
| `split_multiday_events`                                                                                                                        | A long event is one [bar](#bars-lines) across its days, and the day's list shows it on every day it covers   |
| `compact_events_to_show`, `compact_days_to_show`, `compact_events_complete_days`, `event_order`, `skip_first_events`                           | List-only: they shape a list card, and the [day's list](#more-than-fits) always shows the whole day in order |
| `date_vertical_alignment`, `today_indicator_position`                                                                                          | List-only: they describe the list layout's date cell                                                         |
| `day_spacing`                                                                                                                                  | Events sit on the week's lines, and hairlines divide the days                                                |
| `day_separator_width`, `day_separator_color`, `week_separator_width`, `week_separator_color`, `month_separator_width`, `month_separator_color` | The month rules its days and weeks with hairlines of its own                                                 |
| `month_separator_label`, `month_separator_label_color`, `month_separator_label_font_size`                                                      | List-only: they name a month on the list layout's month separator, which month view does not draw            |
| `day_font_size`, `month_font_size`, `today_date_scale`, `past_date_scale`                                                                      | Dates are set in the event font, at one size on every day                                                    |
| `today_indicator_size`, `today_weekday_color`                                                                                                  | Today is marked by its tile, and the weekday names stand once over their columns                             |
| `week_number_background_color`                                                                                                                 | [Week numbers](#week-numbers) are plain text                                                                 |
| `time_position`                                                                                                                                | [A day's list](#the-days-list) always puts each time beside its title                                        |

The editor also leaves out the per-calendar compact limit and multi-day splitting. To edit any of
these, choose a layout they apply to under **Settings For**, without changing
**Starting Layout**; see [Options for the Selected View](/features/editor#options-for-the-selected-view).

**→ [Options With No Effect in Month View](/reference/configuration#options-with-no-effect-in-month-view)** — the same options in the configuration reference.
**→ [Month-Only Options in the configuration reference](/reference/configuration#month-only-options)** — full option table.
