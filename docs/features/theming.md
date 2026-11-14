# Theming & Card-Mod

Calendar Card Pro takes its colors from your Home Assistant theme, and you can restyle it further.
Try these in order, and stop at the first one that does what you need:

1. **A built-in option.** The card has its own color, font and spacing options, listed from
   [Layout & Spacing](/reference/configuration#layout-spacing) on in the configuration reference.
2. **A theme variable**, which restyles every card whose options still name it, as the defaults
   do; see [Colors From Your Theme](#colors-from-your-theme).
3. **[card-mod](https://github.com/thomasloven/lovelace-card-mod)**, for anything else. It is a
   styling plugin, not a card, installed separately, and it lets a card's YAML carry CSS. Every
   CSS recipe under [Card-Mod Examples](#card-mod-examples) needs it.

## 🖌️ Colors From Your Theme

An unstyled card takes its colors from these theme variables, so changing one in your theme
recolors every card that has not given that color a value of its own:

| Theme Variable                                         | What It Colors by Default                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--primary-color`                                      | The accent bar and tint of every calendar without a color of its own, and the card's ripple, the wash on an untinted event and a toolbar control's hover, all through `accent_color`; the today tile, through `today_indicator_color`; the week-number pill and the week separator, at 31%; the toolbar's focus ring |
| `--primary-text-color`                                 | The title, the dates and week numbers; event titles outside grid view; grid view's weekend tint, at 4%                                                                                                                                                                                                               |
| `--secondary-text-color`                               | Outside grid view, an event's time, location, description, progress bar and weather badge; list view's `day_separator_color`; grid view's axis labels                                                                                                                                                                |
| `--divider-color`                                      | Column view's `day_header_separator_color`. In grid view, at 50%, the hour lines, the day separators and the rules under the dates and under the all-day band                                                                                                                                                        |
| `--ha-card-background`, then `--card-background-color` | The card's background, `background_color`; the calendar filter's menu                                                                                                                                                                                                                                                |
| `--primary-background-color`                           | Behind the calendar filter's menu and the view switcher's selected view, where the card background is see-through, so nothing shows through them                                                                                                                                                                     |
| `--ha-card-border-radius`                              | The rounded corners of an event's box in list and column view, at half the card's radius                                                                                                                                                                                                                             |
| `--error-color`                                        | The card's error message, and the line naming a calendar that [failed to load](/features/performance#when-a-calendar-fails-to-load)                                                                                                                                                                                  |

Grid view colors an event's text from its calendar instead; see
[Event Text in Calendar Colors](/features/event-content#event-text-in-calendar-colors).

To change a color on one card only, set its option. Most of these colors reach the card through
an option whose default names the variable, such as `accent_color: var(--primary-color, #03a9f4)`,
so the theme decides them for as long as the option's value names the variable. A fixed color
such as `#e67c73` stops following the theme, and another `var(--…)` follows that variable
instead.

## 🌦️ Weather Custom Properties

The weather badges read six custom properties, which mirror the `weather.date` and
`weather.event` options:

| Custom Property                           | Default                       | Affects                                                     |
| ----------------------------------------- | ----------------------------- | ----------------------------------------------------------- |
| `--calendar-card-weather-date-icon-size`  | `14px`                        | Weather icon in the day header                              |
| `--calendar-card-weather-date-font-size`  | `12px`                        | Weather temperature and UV text in the day header           |
| `--calendar-card-weather-date-color`      | `var(--primary-text-color)`   | Weather text in the day header                              |
| `--calendar-card-weather-event-icon-size` | `14px`                        | Weather icon in an event row                                |
| `--calendar-card-weather-event-font-size` | `12px`                        | Weather temperature, UV, and condition text in an event row |
| `--calendar-card-weather-event-color`     | `var(--secondary-text-color)` | Weather icon and text in an event row                       |

Set them one level below `ha-card`, where each replaces the inherited value for every badge
inside: on `.event` for the badge in an event, on `.content-container` for the one in a day's
header. The card writes the first five on `ha-card` itself, from the options or the defaults
above, so a theme does not replace them there and a card-mod rule on `ha-card` needs
`!important`. `--calendar-card-weather-event-color` is written
only once `weather.event.color` is set.

In grid view, and wherever `event_color` is `accent`, each event writes
`--calendar-card-weather-event-color` on itself too, so the color below needs `!important`.
A calendar with a [`text_scale`](/features/core-settings#scaling-one-calendars-text) writes the
two event sizes on its own events the same way, so a size set on `.event` needs it there too:

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.family
weather:
  entity: weather.home
  position: both
card_mod:
  style: |
    .event {
      --calendar-card-weather-event-color: var(--primary-color) !important;
      --calendar-card-weather-event-font-size: 13px;
    }
```

## 🕒 Past Event Opacity

[`past_event_opacity`](/features/event-content#past-events-display) dims a finished event's
content, shared or per view, from 0 to 100 percent. The card writes it on `ha-card` as
`--calendar-card-past-event-opacity`, a **0-1 alpha**, default `0.6`, which
`.past-event .event-content` and a grid banner's `.grid-banner.past-event .grid-banner-title`
read.

- Backgrounds and accent bars do not dim, and `.past-event` stays on a finished event even at
  `100`.
- `100` turns off the card's own dimming only: colors and badge fills keep their own
  translucency, so it is no contrast guarantee. `0` makes the content transparent without
  hiding the event.

A theme value alone does not replace the property. To override it from card-mod, set it on
`ha-card` with `!important`:

```yaml
card_mod:
  style: |
    ha-card {
      --calendar-card-past-event-opacity: 0.8 !important;
    }
```

A rule that sets `opacity` directly on `.past-event .event-content` or
`.grid-banner.past-event .grid-banner-title` keeps working as before: the card still dims
through those two selectors, and only their value now comes from the property.

::: details Finished Empty Days
In list and column view, an empty day's notice carries `.past-event` too once its own local date
has ended, and dims through the same `.event-content` rule as a finished event. A rule written
for finished events therefore reaches past notices as well; to treat them differently, add
`.empty-day-title` to the selector.
:::

**→ [Event Column in the configuration reference](/reference/configuration#event-column)**

## 🎨 Card-Mod Examples

Each CSS recipe goes under `card_mod:` in the card's YAML and needs [card-mod](#theming-card-mod)
installed; the last section uses a built-in option instead. The first four sections list the
classes to select, and the rest are recipes to copy.
Where the card writes a value inline from one of its options, on `ha-card` or on the element it
colors, a card-mod rule for the same property needs `!important` to win.

### Day Container Classes

Every recipe below selects a **day container**, the element wrapping one day's events.
Which element that is depends on the active view, so a rule written for one view does
nothing in the others unless each container is named:

| View                            | Day container                        | Emitted by                                                      |
| ------------------------------- | ------------------------------------ | --------------------------------------------------------------- |
| List                            | `.day-table`                         | the table holding that day's rows                               |
| [Column](/features/column-view) | `.day-column`                        | the grid cell holding that day's column                         |
| [Grid](/features/grid-view)     | `.grid-day-header`, `.grid-day-body` | the day's cell in the date row, and its column on the time axis |

The containers carry the same state classes, so the state half of a selector is portable
even though the container name is not. Grid's day body carries only two of them:

| Class        | Applied when             | In grid view    |
| ------------ | ------------------------ | --------------- |
| `today`      | the day is today         | header and body |
| `tomorrow`   | the day is tomorrow      | header only     |
| `future-day` | the day is not today     | header only     |
| `weekend`    | the day is a weekend day | header and body |

In list view, `weekend` is also on the date cell, `.date-column.weekend`, as a hook for your own
rules. `weekend_weekday_color`, `weekend_day_color` and `weekend_month_color` are written inline
on the `.weekday`, `.day` and `.month` inside it, so a color set there from card-mod needs
`!important`.

::: tip Name Every View's Container
Selector lists cost nothing and survive a later change of view, including one made with the
view switcher:

```css
.day-table.today .event-title,
.day-column.today .event-title,
.grid-day-body.today .event-title { ... }
```

Most event-level classes are shared by all three views, so usually only the day container
needs repeating. They are listed under [Card & Event Classes](#card-event-classes), and
grid view's own under [Grid View Classes](#grid-view-classes).
:::

### Card & Event Classes

The card root, `.calendar-card-pro`, names the view being drawn, and follows the
[view switcher](/features/layout-appearance#switching-between-layouts) while the card is on
screen. List view has no class of its own; select it as
`.calendar-card-pro:not(.column-view):not(.grid-view)`.

| Class         | Applied when                                                   |
| ------------- | -------------------------------------------------------------- |
| `column-view` | [column view](/features/column-view) is the layout being drawn |
| `grid-view`   | [grid view](/features/grid-view) is the layout being drawn     |

Every event carries `.event`, plus `past-event` once it has finished. In list and column view
it also carries its place in the day; grid view's events carry none of these:

| Class          | Applied when                        |
| -------------- | ----------------------------------- |
| `event-first`  | the event is the first of its day   |
| `event-middle` | the event is neither first nor last |
| `event-last`   | the event is the last of its day    |

::: warning A Lone Event Is Both First And Last
A day with a single event gets `event-first` **and** `event-last` together, so a rule written
for `.event-first` alone also hits every single-event day. Use `.event-first:not(.event-last)`
when you mean "first of several".
:::

While [`event_gap`](/features/layout-appearance#gaps-between-events) is above zero, list and
column view draw two more classes; style events that stand apart through `with-event-gap`. A
negative length counts as no gap:

| Class            | Applied to                                                                   | When                      |
| ---------------- | ---------------------------------------------------------------------------- | ------------------------- |
| `with-event-gap` | `.day-table` in list view, `.column-events` in column view                   | `event_gap` is above zero |
| `event-gap-row`  | the empty row list view draws between two events, hidden from screen readers | `event_gap` is above zero |

A few more classes mark something the card draws only some of the time:

| Class               | Carried by                                                     | Applied when                                                                                                                             |
| ------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `today-tile`        | today's day number, `.day`                                     | `today_indicator` is `tile`, the default                                                                                                 |
| `with-today-tile`   | every day's `.column-date-content`, in column and grid view    | `today_indicator` is `tile`                                                                                                              |
| `event-now`         | `td.event` in list view, `.event` in column view               | the event is under way and `show_now_indicator` is on                                                                                    |
| `event-interactive` | `.event` in column and grid view, `.event-button` in list view | `event_tap_action` is `details`                                                                                                          |
| `event-tappable`    | `td.event` in list view                                        | `event_tap_action` is `details`                                                                                                          |
| `event-text-scaled` | `.event` in every view                                         | its calendar has a [`text_scale`](/features/core-settings#scaling-one-calendars-text) other than 1                                       |
| `count-up`          | `.time-countdown` in every view                                | it reads how long ago a finished event ended, [counting up](/features/event-content#counting-up-from-past-events)                        |
| `time-beside-title` | `.event-content` in list and column view                       | `time_position` is `title` and the event has a time or a countdown, which then sits in `.title-aside` after `.summary` in `.summary-row` |
| `title-wrap`        | `.summary-row`, with `time-beside-title`                       | the title wraps beside the time: no `title_max_lines: 1` or `scroll_long_titles`. `.summary` ends in `.title-room`, kept for the time    |
| `title-capped`      | `.summary-row`, with `title-wrap`                              | `title_max_lines` is two or more                                                                                                         |
| `fetch-error`       | the line below the events naming the calendars that failed     | a calendar [fails to load](/features/performance#when-a-calendar-fails-to-load)                                                          |
| `page-pending`      | `.content-container`                                           | the days on screen wait for another page's events, dimmed to 50%                                                                         |

- The [date tile](/features/layout-appearance#the-date-tile) is painted from
  `--calendar-card-today-indicator-color`, which the card writes on `ha-card` from
  `today_indicator_color`. Its digits are colored inline on the `.day` itself, so change them
  with `today_day_color`, or in card-mod with `!important`.
- In a [running event](/features/event-content#the-now-indicator), `.time` holds `.now-time`,
  with the word "Now" in `.now-indicator`. Its color, `--calendar-card-now-ink`, is mixed from
  `now_color` and declared on `.event-now` itself, so a value set on `ha-card` does not reach it.
  Change it with `now_color`, or in card-mod on `ha-card .event-now`. Grid view marks the present
  with its now line instead and adds no class.
- When events are [tap targets](/features/actions#tapping-an-event), list view's is a
  `.event-button` inside `td.event`, so `.event-interactive` alone reaches all three views,
  while `.event.event-interactive` misses list view.
- In a `.title-wrap` row the card measures `.title-aside`, sizes `.title-room` to it and places
  the time over the room, marking the row `data-title-fit`. `data-title-cut` marks a title it
  cut at `title_max_lines`. A theme that changes the time's size or spacing is measured with it;
  one that moves `.title-aside` elsewhere leaves the room empty and can overlap the title.
- `.fetch-error` holds `.fetch-error-icon` and `.fetch-error-text`, in the theme's
  `--error-color`.
- `.event-title`, `.time` and `.location` are plain element classes with no state attached.

Every event's accent bar is an element of its own, `.event-accent-bar`, the first child of the
event in list, column and grid view; grid all-day banners and the `+N` block have none. Its color,
`--calendar-card-event-accent-bar-color`, is its calendar's, written on each event itself, so
overriding it on `.event` needs `!important`. Its width,
`--calendar-card-line-width-vertical`, comes from
[`vertical_line_width`](/features/layout-appearance#visual-styling-colors), which also decides how
far the text keeps from the bar. Style the bar through `.event-accent-bar`, or hide it with
`vertical_line_width: 0px`.

::: details Borders & Padding on an Event
The bar is not a border of `.event`: a rule that sets `border-left` or `border-inline-start` on
`.event` does not reach it, and `border-left: none` does not hide it. The bar sits inside the
event's start padding, which in list and column view is
`calc(12px + var(--calendar-card-line-width-vertical))`, so a card-mod rule that sets `padding` on
`.event` can run the text under the bar.
:::

### Grid View Classes

[Grid view](/features/grid-view) splits a day into the two containers above, and draws its
events, its now line and its tints with classes of their own:

| Class                  | Element                                                                                                                                                  | Also carries                                                                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.grid-event`          | a timed event's block                                                                                                                                    | `.event`; `.past-event`; `.clipped-top` or `.clipped-bottom` where the event runs past the visible hours; `.grid-event-raised` while drawn over an earlier one |
| `.grid-banner`         | an all-day event, in the band above the time axis                                                                                                        | `.event`; `.past-event`; `.continues-before` or `.continues-after` where it runs past the visible days                                                         |
| `.grid-event-overflow` | the `+N` block standing in for events that did not fit                                                                                                   | `.event`, `.grid-event`                                                                                                                                        |
| `.grid-now-line`       | the now line in today's `.grid-day-body`, between events, in `now_color`                                                                                 | —                                                                                                                                                              |
| `.grid-weekend`        | the weekend tint behind a run of neighboring weekend days, unless [`weekend_background_color`](/features/grid-view#shading-the-weekend) is `transparent` | —                                                                                                                                                              |
| `.grid-today`          | today's tint behind today's column, once [`today_background_color`](/features/grid-view#shading-today) is set to a color                                 | —                                                                                                                                                              |

The `+N` block is a `.grid-event` too, so `.grid-event:not(.grid-event-overflow)` selects real
events only. A banner can span several days, so it sits in the all-day band rather than in any
day's `.grid-day-body`, and a day selector does not reach it; select it as `.grid-banner`.

`.grid-now-line` is only the part of the now line between events. Inside the event under way,
which carries `.grid-event-now`, the line is drawn as that event's own background, in
`now_color` at the same height, so it runs over the event's color and under its text. To recolor
the line, set `now_color` rather than styling `.grid-now-line`, or the two parts will not match.

`.grid-weekend` and `.grid-today` are stripes of their own, hidden from screen readers. They run
from just under the date row through the all-day band and down the hours, behind the hour lines,
the now line and the events. A weekend stripe covers every weekend day in a run and the gap
between them, so it belongs to no single day; select one weekend day as `.grid-day-body.weekend`.
While today's tint is on, the weekend stripe breaks around today's column, which `.grid-today`
covers alone.

### Header Toolbar Classes

The [header toolbar](/features/layout-appearance#header-toolbar) adds `.has-toolbar` to
`.header-container` and draws one or two rows inside it, each a `.card-toolbar`: the actions
(`.toolbar-actions`), only while that row holds a control, then the month (`.toolbar-heading`).
The title, `h1.card-header`, moves into the month's row as a small label over the month, keeping
its element and classes. Select it as `.header-container h1.card-header`;
`.header-container > h1.card-header` misses it while the toolbar is drawn.

| Class                      | Element                                                                                                                                                                                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.card-toolbar`            | either row: `.toolbar-actions` for the actions, `.toolbar-heading` for the month, which also carries `.chips-shown` while the [calendar chips](/features/layout-appearance#showing-hiding-calendars) show and `.short-month` while the month takes its short form |
| `.toolbar-start`           | the group at the start of the action row: the calendar filter's button and the add button                                                                                                                                                                         |
| `.toolbar-end`             | the group at the end of the action row: reset and refresh                                                                                                                                                                                                         |
| `.toolbar-identity`        | the block at the start of the month's row: the title, then the month under it                                                                                                                                                                                     |
| `.toolbar-month`           | the month heading; its words are `.toolbar-month-text`, the month's name in them `.toolbar-month-name`, inside `.toolbar-month-button` where it opens the date picker                                                                                             |
| `.toolbar-heading-end`     | the group at the end of the month's row, holding the date navigation                                                                                                                                                                                              |
| `.date-navigation`         | the group holding the previous, home and next buttons                                                                                                                                                                                                             |
| `.date-navigation-segment` | one of those three round buttons; home also `.home-done` for a moment after a press brought the card back                                                                                                                                                         |
| `.toolbar-button`          | every toolbar button, each an icon named by its tooltip; the four below carry it too                                                                                                                                                                              |
| `.add-event-button`        | the add button                                                                                                                                                                                                                                                    |
| `.reset-button`            | the reset button: `.unavailable`, and hidden, while there is nothing to undo, but dimmed rather than hidden when it is also `.alone`, the only control in its row; `.reset-done` for a moment after a press                                                       |
| `.refresh-button`          | the refresh button: `.busy` while it turns, also `.unasked` for a load the card started itself, then `.refresh-done` or `.refresh-failed` for a moment after a press                                                                                              |
| `.legend-button`           | the calendar filter's button: `.filtered` while it hides a calendar                                                                                                                                                                                               |
| `.toolbar-button-icon`     | a button's icon                                                                                                                                                                                                                                                   |
| `.toolbar-button-label`    | a view's name on its view switcher segment, while the switcher shows words                                                                                                                                                                                        |
| `.toolbar-legend`          | the calendar chips, in the middle of the month's row                                                                                                                                                                                                              |
| `.legend-chip`             | one calendar's chip; `.hidden-calendar` while its events are hidden                                                                                                                                                                                               |
| `.legend-menu`             | the menu the filter button opens; each calendar in it is a `.legend-menu-row`, also `.hidden-calendar` while hidden                                                                                                                                               |
| `.view-switcher`           | the view switcher's track                                                                                                                                                                                                                                         |
| `.view-switcher-segment`   | one view in it; `.selected` for the current one, `.unavailable` while the card is too narrow for it, `.icon-only` while it shows its pictogram rather than its word                                                                                               |
| `.view-switcher-icon`      | a segment's pictogram                                                                                                                                                                                                                                             |

The menu is drawn opaque in the theme's card background, so the events never show through it.
A card-mod `background` or `background-color` on `.legend-menu` replaces that, so write an opaque
one. To tint the menu and still have the card keep it opaque, set `--ha-card-background` on
`.legend-menu` instead.

The controls are painted from four custom properties:

| Custom Property                        | Paints                                                         |
| -------------------------------------- | -------------------------------------------------------------- |
| `--calendar-card-toolbar-fill`         | the buttons, the switcher's track and a hidden calendar's chip |
| `--calendar-card-toolbar-fill-hover`   | a control under the pointer                                    |
| `--calendar-card-toolbar-fill-pressed` | a control while it is pressed                                  |
| `--calendar-card-toolbar-selected`     | the switcher's selected segment                                |

Set them on `.card-toolbar`, with `ha-card` in front so the rule outweighs the card's own; a
theme or a rule on `ha-card` does not reach them. The chips and the menu take them from the row
they sit in, and each chip and menu row tints itself from `--calendar-card-legend-color`, its
calendar's accent:

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.family
title: Family Schedule
toolbar:
  show: true
card_mod:
  style: |
    ha-card .card-toolbar {
      --calendar-card-toolbar-fill: color-mix(in srgb, var(--primary-color) 15%, transparent);
      --calendar-card-toolbar-selected: var(--primary-color);
    }
    ha-card .view-switcher-segment.selected {
      color: var(--text-primary-color);
    }
```

### Custom Title Styling

Center the card's title across the card, make it bold and underline it in the theme's primary
color:

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.family
title: Family Schedule
card_mod:
  style: |
    ha-card .header-container h1.card-header {
      width: 100%;
      text-align: center;
      font-weight: bold;
      border-bottom: 1px solid var(--primary-color);
      float: none !important; /* Override the default float:left */
    }
```

With the [header toolbar](/features/layout-appearance#header-toolbar) on, the title is the small
label over the month, inside `.toolbar-identity`, so it is centered in the room the date
navigation leaves rather than across the whole card; the rule above still reaches it. The month
is then the card's headline: it takes `title_font_size` and `title_color`, and a rule for the
title's look reaches the label, not the month. Style the month through `.toolbar-month`, and its
name, drawn bold, through `.toolbar-month-name`. The hidden copies the card keeps the heading's
room with, and measures it by, carry that class too, so a rule on it, `font-weight` say, changes
them alike and the heading keeps the right room.

### Highlight Today's Events

Make today's events stand out in every view: larger, bold titles in the theme's accent color,
and wider accent bars that pulse between two colors. In grid view this reaches today's timed
events only, not its [all-day banners](#grid-view-classes). To tint today's whole grid column
instead, use [`time_grid.today_background_color`](/features/grid-view#shading-today).

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.family
card_mod:
  style: |
    /* Make today's events stand out */
    .day-table.today .event-title,
    .day-column.today .event-title,
    .grid-day-body.today .event-title {
      font-size: 16px !important;     /* Larger text */
      font-weight: bold !important;   /* Bold text */
      color: var(--accent-color) !important; /* Use theme accent color */
    }

    /* Widen today's accent bars; the text keeps its distance from them */
    .day-table.today .event,
    .day-column.today .event,
    .grid-day-body.today .event {
      --calendar-card-line-width-vertical: 4px;
    }

    /* ...and pulse their color */
    .day-table.today .event-accent-bar,
    .day-column.today .event-accent-bar,
    .grid-day-body.today .event-accent-bar {
      animation: todayPulse 3s infinite alternate;
    }

    @keyframes todayPulse {
      from { border-inline-start-color: var(--accent-color); }
      to { border-inline-start-color: var(--primary-color); }
    }
```

### Highlight Tomorrow's Events

This works like the today recipe above, using the `tomorrow` class. It covers list and column
view: in grid view only the day's header, `.grid-day-header`, carries `tomorrow`, so no
selector reaches tomorrow's events by class. For example:

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.family
card_mod:
  style: |
    /* Make tomorrow's events stand out */
    .day-table.tomorrow .event-title,
    .day-column.tomorrow .event-title {
      font-size: 16px !important;     /* Larger text */
      font-weight: bold !important;   /* Bold text */
      color: var(--accent-color) !important; /* Use theme accent color */
    }
```

### Shade Weekend Days

This rule covers the weekend in List and Column. Which days carry the `weekend` class
follows the [country set in Home Assistant](/features/core-settings#showing-a-calendar-on-weekdays-only),
or its language when no country is set, so this rule shades Friday and Saturday in Israel
without being rewritten:

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.family
card_mod:
  style: |
    .day-table.weekend,
    .day-column.weekend {
      background: var(--secondary-background-color);
      border-radius: 8px;
    }
```

For Grid, use [`time_grid.weekend_background_color`](/features/grid-view#shading-the-weekend)
instead. Its tint spans the time axis and all-day band, which a rule on
`.grid-day-body.weekend` cannot reach. Today's column has an option of its own there,
[`time_grid.today_background_color`](/features/grid-view#shading-today), off by default.

### Frameless Calendar Integration

Remove the card's frame (its border, rounded corners, shadow and background) so the calendar
sits straight on the dashboard, or inside another card that draws a frame of its own. The text
then sits on whatever is behind the card, so check that it stays readable there.

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.family
card_mod:
  style: |
    ha-card {
      border-radius: 0;
      border: none;
      box-shadow: none;
      background: transparent !important;
    }
```

### Move Time Into the Same Row as the Event Title

This needs no card-mod: the built-in
[`time_position`](/features/event-content#time-beside-the-title) option draws the time at the end
of the title's line, on every row with a time or a countdown. A long title wraps and the time
ends its last line, or takes a line of its own where it does not fit; `title_max_lines` cuts the
title with the time on its last line, and `scroll_long_titles` keeps it on one line. A countdown
follows the time after a dot, and list view's progress bar takes a row of its own. `list:` and
`column:` can each set it for their own layout:

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.family
time_position: title
```

**→ [Layout & Spacing in the configuration reference](/reference/configuration#layout-spacing)** — the card's own color, font and spacing options.
