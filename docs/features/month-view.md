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

In the [visual editor](/features/editor#options-for-the-selected-view), the circle on a layout's
row under **Layouts** chooses the layout the card opens with. Select the **Month** row itself to
change how the month looks, such as its weekend and today shading under **Days**. Its height is
set in YAML, under [How Tall the Month Is](#how-tall-the-month-is).

## 📅 The Six Weeks

The weeks start on the first day of the week, `first_day_of_week` or your Home Assistant
locale's, and the first row is the week holding the 1st of the month the card opens on: today's
month, unless `start_date` is a fixed date such as `2027-01-15`, which opens its own month.

- **A relative start date opens today's month.** Today, Tomorrow, Start of Week, a weekday and
  any offset such as `today-29` all open the month holding today, while the other layouts start
  on the day they name. So Start of Week on the 1st still opens this month, and a card that logs
  the last 30 days opens on this month with today in it.
- **Always six rows.** Six weeks hold any month, whichever day its 1st falls on: the 1st is
  always in the first row, and the weeks after the month's last are drawn below it. The six share
  the card's height, which paging never changes.
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
you pick, and the home button returns to the month the card opens with. It is called "Today"
while that month is today's, and otherwise by the month it goes to, such as "January 2027".

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

## 📏 How Tall the Month Is

A month is one height whatever its events, so a busy month is as tall as a quiet one, and its six
weeks share that height evenly. On a Sections dashboard it fills the rows it is given: ten unless
you choose others, or twelve with the toolbar. Anywhere else `card_height` sets the whole card's
height, by default the same `632px`, or `760px` with the toolbar. At the default text sizes either
leaves a day four lines under its date, the last of a busy day being "+N more".

```yaml
# On a Sections dashboard: the month fills its rows
type: custom:calendar-card-pro
entities:
  - calendar.anna
view: month
grid_options:
  rows: 10
```

```yaml
# A wall tablet: a taller month, with more events a day
view: month
month:
  card_height: 50rem
```

```yaml
# A phone: the compact month grows with the day's list, up to 40rem
view: month
month:
  compact_card_max_height: 40rem
```

| Option                            | Type   | Default           | Description                                                                                                                                      |
| --------------------------------- | ------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `month → card_height`             | string | `auto`            | The whole card's height in the wide month, its title, toolbar and notices included; `auto` is `632px`, `760px` with the toolbar                  |
| `month → card_max_height`         | string | `none`            | Tallest the wide month's card may be; it clamps `card_height`                                                                                    |
| `month → compact_card_height`     | string | `card_height`     | The same for the [compact month](#the-compact-month), which takes `card_height` until this is set; `auto` is the same height as the wide month's |
| `month → compact_card_max_height` | string | `card_max_height` | The same cap for the compact month; with its height `auto`, the card grows with the day's list up to it                                          |

In the visual editor these are **Month Card Height**, **Month Maximum Height**, **Compact Card
Height** and **Compact Maximum Height** on Month's Size & Spacing.

- **The whole card.** The heights include the title, the toolbar and any notice, which take their
  room from the weeks. The default makes room for the toolbar, so a day keeps its four lines with
  it; a title costs a card without a toolbar one line.
- **With the toolbar** means `toolbar → show` with at least one of its controls on; search counts
  only with the date navigation, beside which it is drawn. The room is
  kept where a control is not drawn on one screen, such as add where no calendar can be written
  to, so the card's height never changes with it.
- **A Sections row count wins.** While none of the four sets a height or a maximum, a month asks
  a Sections dashboard for ten rows, or twelve with the toolbar; `auto`, `none` and a value it
  cannot use set neither. Once
  one does, the card sizes itself, and rows chosen in the dashboard's Layout tab always win, the
  four then doing nothing. A card that opens as a month keeps its rows when you switch it to
  another layout, which scrolls within them.
- **The compact month follows the wide one** until its own two are set, and an explicit `auto` or
  `none` there gives it its own default back.
- **A maximum lets the compact month grow.** With its height `auto` and a maximum from either
  key, the card is as tall as its weeks and [the day's list](#the-days-list), up to the maximum,
  so a quiet day takes less room and a busy one lists more before "+N more". A maximum alone caps
  the wide month at it.
- **Too short to fit**, each week keeps room for its date and one line, and the card's content
  scrolls rather than any text shrinking, so every day still shows its date and "+N more".
- **`height` and `max_height` do not apply.** They size the events area of the other layouts;
  a month takes its height from the four above.

::: details Lengths the Heights Take
A height takes `auto` or a length: `600px`, `50rem`, a viewport unit such as `dvh`, or a `calc()`
with a `var()`. A bare number is read in pixels. A percentage, or a word such as `fit-content`,
would let the events size the month, so the card warns and uses `auto`; a cap takes `none` the
same way. In a panel view, where the card is the whole page, this fills the screen under the
dashboard's header:

```yaml
view: month
month:
  card_height: calc(100dvh - var(--header-height, 56px))
```

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

The chosen day's events are listed under the weeks, in the room the weeks leave of the card. The
list shows as many of the day's events as fit that room, in order, and "+N more" for the rest,
which opens the day in a panel. The room is the same on every day, so the card stays one height as
you tap from day to day and page from month to month. To let a busy day list more, give the
compact month a maximum and no height, and it grows with the list up to that maximum:

```yaml
view: month
month:
  compact_card_max_height: 40rem
```

See [How Tall the Month Is](#how-tall-the-month-is) for the heights and the maximum.

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
- **Only the list and the panel show an event's details.** The weeks draw an event as its title
  and time at most, so `show_location`, `show_description`, `show_countdown`,
  `show_progress_bar`, the event forecast and the all-day badge act on the list and the panel
  alone.
- **"+N more" is a button** in the tab order, after the month. Closing the panel it opens brings
  you back to it.
- **On a card too short** to show the weeks, the day's name and "+N more", the weeks and the
  list scroll as one inside the card; nothing inside the list scrolls.

The panel "+N more" opens, here or on a wide month, lists a day the same way, without the one-line
limit.

::: details How the List Decides What Fits
The card measures the day's own events, drawn out of sight exactly as the list draws them, and
lists the first ones that fit with "+N more" after them. It keeps their order, so a later, shorter
event never jumps ahead of an earlier one that does not fit. It fits again whenever the room or the
events change size, as when a font loads or the card is resized, before the change is drawn. Where
not even one event fits beside "+N more", the list shows "+N more" alone, and a day with no events
shows "No events".
:::

## ⌨️ Keyboard

The month is one stop in the tab order. The arrow keys move a day or a week, Home and End go to
the ends of the week, and Page Up and Page Down go to the month before or after the one shown, on
the same date where it has one. Enter or Space opens the day's list in a panel, or on a compact
month selects the day. Each day is announced with its full date and how many events it holds.

The events in a wide month's days are not stops of their own, so a busy month does not hold
hundreds of them; the day's list reaches each one.

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

In the visual editor they are **Weekend Shading** and **Today Shading** on Month's Days.

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

## 🔤 Text Sizes

`cell_event_font_size` and `cell_time_font_size` set the text in the wide month's days, 12px
titles and 10px times, so a day a seventh of the card wide keeps more of each title and more of
its events. A day's number takes `day_font_size` and the month named on a 1st `month_font_size`,
as a list's dates do, and the month's own defaults for them, the weekday names and the week
numbers are sized with its titles.

```yaml
view: month
month:
  cell_event_font_size: 14px
  cell_time_font_size: 12px
  day_font_size: 18px
```

| Option                         | Type   | Default  | Description                                                                                    |
| ------------------------------ | ------ | -------- | ---------------------------------------------------------------------------------------------- |
| `month → cell_event_font_size` | string | `12px`   | A line's title and calendar label, a bar's title, and a day's "+N more", in the wide month     |
| `month → cell_time_font_size`  | string | `10px`   | A line's time, and a bar's times and length, in the wide month                                 |
| `day_font_size`                | string | `16px`   | Each day's number, in both forms; Month's own default, which only `month:` changes             |
| `weekday_font_size`            | string | `16px`   | The weekday names over the columns and a day list's heading; Month's own default               |
| `week_number_font_size`        | string | `13.5px` | The week numbers, in the first day's corner or the compact month's gutter; Month's own default |
| `month_font_size`              | string | `16px`   | The month named beside the number on a 1st, at the number's size; Month's own default          |

In the visual editor the two cell sizes are **Event Font Size in Days** and **Time Font Size in
Days** on Month's Event Appearance, beside the sizes a day's list takes.

- **The day's list and the panel** keep `event_font_size` and `time_font_size`, so their rows read
  as a list's; set those inside `month:` to change them for Month alone.
- **A taller size fits fewer lines** in a week, and the rest go under "+N more"; text never
  shrinks to fit. The lines' spacing and color stripe are drawn for the 12px titles, so a line
  set larger stays as compact as its text allows.
- **`text_scale`** on a calendar multiplies the cell sizes in its days: at `1.5` its lines are
  `18px` where the others are `12px`.

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

`hide_when_empty` counts Month's events only from today on, or from a fixed `start_date`, so past
events in the month never keep an otherwise empty card on screen.

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

There `event_font_size` sets the rows of [a day's list](#the-days-list) and the panel; the lines in
the days take [their own sizes](#text-sizes).

Anything the block does not mention keeps its top-level value, except the six options below.
Options that decide which events the card loads, such as `start_date` and `entities`, and others
that act on the card as a whole, such as the actions and the `toolbar`, are card-wide and ignored
inside `month:`; see
[Options That Cannot Be Overridden](/features/column-view#options-that-cannot-be-overridden).

## 🔀 Options That Start From a Different Default

Seven shared options do not inherit their top-level value in month view:

| Option                  | Type    | Default | Month Default |
| ----------------------- | ------- | ------- | ------------- |
| `show_past_events`      | boolean | `false` | `true`        |
| `event_gap`             | string  | `0px`   | `6px`         |
| `day_font_size`         | string  | `26px`  | `16px`        |
| `weekday_font_size`     | string  | `14px`  | `16px`        |
| `week_number_font_size` | string  | `12px`  | `13.5px`      |
| `month_font_size`       | string  | `12px`  | `16px`        |
| `vertical_line_width`   | string  | `2px`   | `3px`         |

A month shows its past days with their events, dimmed, rather than empty weeks behind today. Set
`show_past_events: false` inside `month:` to hide them.

A [day's list](#the-days-list) holds one day under its name, so its events read better apart than
joined into one block beside a date, as the list layout keeps them. Set `event_gap: 0px` inside
`month:` to join them; a top-level `event_gap` changes the list and column layouts alone.

A day's number sits in its cell's corner over the lines, so it is sized with the month's 12px
titles rather than a list's 26px date, and the weekday names, the week numbers and a 1st's month
with it, the month at the number's size so the two read as one label. Beside text that small a 2px
color stripe reads as a hairline, so a month's is 3px, in its days, its day list and the panel
alike. Set any of the five inside `month:` to change it.

## 🚫 Options That Do Nothing in Month View

These options have no effect while the card draws a month, and the visual editor leaves them out
of Month's pages. Stored values are kept for the layouts they apply to.

| Options                                                                                                                                        | In Month View                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `height`, `max_height`                                                                                                                         | Month sizes the whole card with its own heights; see [How Tall the Month Is](#how-tall-the-month-is)         |
| `days_to_show`                                                                                                                                 | A month always shows six weeks                                                                               |
| `show_empty_days`, `show_empty_today`, `empty_day_text`, `empty_day_color`                                                                     | Every day of the six weeks is drawn, events or not, so there is no empty day to hide or fill                 |
| `split_multiday_events`                                                                                                                        | A long event is one [bar](#bars-lines) across its days, and the day's list shows it on every day it covers   |
| `show_multiday_allday_time`                                                                                                                    | The day's list and the panel split every multi-day event, and a bar's length follows `show_duration`         |
| `compact_events_to_show`, `compact_days_to_show`, `compact_events_complete_days`, `event_order`, `skip_first_events`                           | List-only: they shape a list card, and the [day's list](#more-than-fits) always shows the whole day in order |
| `date_vertical_alignment`, `today_indicator_position`                                                                                          | List-only: they describe the list layout's date cell                                                         |
| `day_spacing`                                                                                                                                  | Events sit on the week's lines, and hairlines divide the days                                                |
| `day_separator_width`, `day_separator_color`, `week_separator_width`, `week_separator_color`, `month_separator_width`, `month_separator_color` | The month rules its days and weeks with hairlines of its own                                                 |
| `month_separator_label`, `month_separator_label_color`, `month_separator_label_font_size`                                                      | List-only: they name a month on the list layout's month separator, which month view does not draw            |
| `today_date_scale`, `past_date_scale`                                                                                                          | Every day's date is set at one size, today's and past days' included                                         |
| `today_indicator_size`, `today_weekday_color`                                                                                                  | Today is marked by its tile, and the weekday names stand once over their columns                             |
| `week_number_background_color`                                                                                                                 | [Week numbers](#week-numbers) are plain text                                                                 |
| `time_position`                                                                                                                                | [A day's list](#the-days-list) always puts each time beside its title                                        |

The editor also leaves out the per-calendar compact limit and multi-day splitting. To edit any of
these, open a layout they apply to under **Layouts**, which leaves the card's layout as it is; see
[Options for the Selected View](/features/editor#options-for-the-selected-view).

Month's weather is its own, set in `month → weather`, and shows only beside events, in the day's
list and the panel: `position: event` or `both` shows it there, and the `date` options do
nothing, since a month has no day header for them. See
[Weather Per Layout](/features/weather#weather-per-layout).

**→ [Options With No Effect in Month View](/reference/configuration#options-with-no-effect-in-month-view)** — the same options in the configuration reference.
**→ [Month-Only Options in the configuration reference](/reference/configuration#month-only-options)** — full option table.
