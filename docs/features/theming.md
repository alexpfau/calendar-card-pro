# Theming & Card-Mod

Calendar Card Pro seamlessly integrates with all Home Assistant themes and fully supports card-mod customization:

- **Automatic Theme Detection**: Uses your active Home Assistant theme variables
- **Standard Card Structure**: Follows HA conventions for consistent styling
- **CSS Customization**: Accessible structure for easy card-mod targeting

## 🖌️ Colors From Your Theme

An unstyled card takes its colors from the active Home Assistant theme:

| Theme Variable                                         | What It Colors by Default                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--primary-color`                                      | Through `accent_color`, the accent bar and tint of every calendar without a color of its own, and the card's hover: its ripple, the wash on an untinted event and a toolbar control's hover; through `today_indicator_color`, the today tile; at 31%, the week-number pill and the week separator; the toolbar's focus ring |
| `--primary-text-color`                                 | The title, the dates and week numbers; event titles outside grid view; grid view's weekend tint, at 4%                                                                                                                                                                                                                      |
| `--secondary-text-color`                               | Outside grid view, an event's time, location, description, progress bar and weather badge; list view's `day_separator_color`; grid view's axis labels                                                                                                                                                                       |
| `--divider-color`                                      | Column view's `day_header_separator_color`. In grid view, at 50%, the hour lines, the day separators and the rules under the dates and under the all-day band                                                                                                                                                               |
| `--ha-card-background`, then `--card-background-color` | The card's background, `background_color`                                                                                                                                                                                                                                                                                   |
| `--ha-card-border-radius`                              | The rounded corners of an event's box in list and column view, at half the card's radius                                                                                                                                                                                                                                    |
| `--error-color`                                        | The card's error message, and the line naming a calendar that [failed to load](/features/performance#when-a-calendar-fails-to-load)                                                                                                                                                                                         |

Grid view colors an event's text from its calendar instead; see
[Event Text in Calendar Colors](/features/event-content#event-text-in-calendar-colors).

Most of these arrive through an option whose default names the variable, such as
`accent_color: var(--primary-color, #03a9f4)`. The card writes the option's value as an
inline style, so the theme still decides the color: change `--primary-color` in the theme and
every one of them follows. To change one of them on one card, set its option. A card-mod rule
that sets the card's own custom property on `ha-card` loses to the inline value unless it
carries `!important`.

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

The card writes the first five inline on `ha-card`, from those options or from the defaults
above, whether or not the options are set, so neither a theme nor a card-mod rule on
`ha-card` can replace them. Only `--calendar-card-weather-event-color` is left unwritten until
`weather.event.color` is set. To override any of them, set it one level down, where it replaces
the inherited value for every badge inside: on `.event` for the badge in an event, on
`.content-container` for the one in a day's header.

In grid view, and wherever `event_color` is `accent`, each event also writes
`--calendar-card-weather-event-color` inline on itself, which is why the color below carries
`!important`:

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

Use [`past_event_opacity`](/features/event-content#past-events-display) for built-in
past-content dimming, shared or per view. The option accepts a percentage from 0 to 100;
the CSS property `--calendar-card-past-event-opacity` carries its **0-1 alpha**, default
`0.6`, on `ha-card`.

Both `.past-event .event-content` and
`.grid-banner.past-event .grid-banner-title` read that property. The `.past-event` class
stays present even at 100%, and outer fills and accent bars do not dim.

Empty-day notices in list and column views carry `.past-event` too, once their own local
date has ended, and dim through the same `.event-content` rule as any finished event. A
rule written for finished events therefore reaches past notices as well; to treat them
differently, add `.empty-day-title` to the selector.

The generated property is inline on `ha-card`, so an inherited theme value alone does
not replace it. For an explicit card-mod override, target that same element and use
`!important`:

```yaml
card_mod:
  style: |
    ha-card {
      --calendar-card-past-event-opacity: 0.8 !important;
    }
```

Existing rules setting `opacity` directly on the two content selectors still work through
the normal cascade. Setting the option to 100 removes the card's built-in dimming, not
additional author CSS. Normal colors, translucent ink, and badge fills retain their own
treatments beneath the layer; full opacity is not a contrast guarantee.

**→ [Event Column in the configuration reference](/reference/configuration#event-column)**

## 🎨 Card-Mod Examples

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

In list view, `weekend` is also on the date cell, `.date-column.weekend`. It is a hook for
your own rules only: `weekend_weekday_color`, `weekend_day_color` and `weekend_month_color`
are written as inline styles on the `.weekday`, `.day` and `.month` inside it, so a color set
there from card-mod needs `!important`.

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

The card root, `.calendar-card-pro`, carries one class naming the view being drawn. The
[view switcher](/features/layout-appearance#switching-between-layouts) changes it while the
card is on screen, so a rule scoped to a view follows the switch:

| Class         | Applied when                                                   |
| ------------- | -------------------------------------------------------------- |
| `column-view` | [column view](/features/column-view) is the layout being drawn |
| `grid-view`   | [grid view](/features/grid-view) is the layout being drawn     |

List view adds no view class of its own, so
`.calendar-card-pro:not(.column-view):not(.grid-view)` is the way to target it.

Inside a day, every event carries `.event`, plus `past-event` once it has finished. In list
and column view it also carries one or both of a position pair. Grid view places events on a
time axis rather than in a list, so its events carry none of the three:

| Class          | Applied when                        |
| -------------- | ----------------------------------- |
| `event-first`  | the event is the first of its day   |
| `event-middle` | the event is neither first nor last |
| `event-last`   | the event is the last of its day    |

::: warning A Lone Event Is Both First And Last
A day with a single event gets `event-first` **and** `event-last` together — it is the
first and the last. A rule written for `.event-first` alone will therefore also hit every
single-event day. Use `.event-first:not(.event-last)` when you mean "first of several".
:::

While [`event_gap`](/features/layout-appearance#gaps-between-events) is above zero, list and
column view draw two more classes. The position pair keeps meaning the event's place in its
day, so `with-event-gap` is how to style events that stand apart. A negative length counts
as no gap:

| Class            | Applied to                                                                   | When                      |
| ---------------- | ---------------------------------------------------------------------------- | ------------------------- |
| `with-event-gap` | `.day-table` in list view, `.column-events` in column view                   | `event_gap` is above zero |
| `event-gap-row`  | the empty row list view draws between two events, hidden from screen readers | `event_gap` is above zero |

A few more classes mark something the card draws only some of the time:

| Class               | Carried by                                                     | Applied when                                                                    |
| ------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `today-tile`        | today's day number, `.day`                                     | `today_indicator` is `tile`, the default since v5                               |
| `with-today-tile`   | every day's `.column-date-content`, in column and grid view    | `today_indicator` is `tile`                                                     |
| `event-now`         | `td.event` in list view, `.event` in column view               | the event is under way and `show_now_indicator` is on                           |
| `event-interactive` | `.event` in column and grid view, `.event-button` in list view | `event_tap_action` is `details`                                                 |
| `event-tappable`    | `td.event` in list view                                        | `event_tap_action` is `details`                                                 |
| `fetch-error`       | the line below the events naming the calendars that failed     | a calendar [fails to load](/features/performance#when-a-calendar-fails-to-load) |
| `page-pending`      | `.content-container`                                           | the days on screen wait for another page's events, dimmed to 50%                |

The [date tile](/features/layout-appearance#the-date-tile) is painted from
`--calendar-card-today-indicator-color`, which the card writes on `ha-card` from
`today_indicator_color`. Its digits are colored inline on the `.day` itself, so change them
with `today_day_color`, or in card-mod with `!important`.

In a [running event](/features/event-content#the-now-indicator), `.time` holds `.now-time`,
with the word "Now" in `.now-indicator`. The time's color is `--calendar-card-now-ink`, which
the stylesheet declares on `.event-now` itself and derives from `now_color`, so change it with
`now_color`. Grid view marks the present with its now line instead and adds no class.

A list row is a table cell, which cannot be a button, so when events are
[tap targets](/features/actions#tapping-an-event) the button is a `.event-button` inside
`td.event`. `.event-interactive` alone therefore reaches all three views, while
`.event.event-interactive` misses list view.

`.fetch-error` holds `.fetch-error-icon` and `.fetch-error-text`, in the theme's
`--error-color`.

Every event's accent bar is an element of its own, `.event-accent-bar`, the first child of
the event in list, column and grid view. Grid all-day banners and the `+N` block have none.
It is painted from two custom properties. `--calendar-card-event-accent-bar-color` is its
calendar's color, which each event writes inline on itself, so overriding it on `.event`
needs `!important`. `--calendar-card-line-width-vertical` is set for the card by
[`vertical_line_width`](/features/layout-appearance#visual-styling-colors), and also decides
how far the text keeps from the bar.

::: warning The Bar Is No Longer a Border
Until v5 the bar was the inline-start border of `.event` (the left one in a left-to-right
language). A rule that sets `border-left` or `border-inline-start` on `.event` no longer
reaches it, and `border-left: none` no longer hides it. Style `.event-accent-bar` instead, or
hide it with `vertical_line_width: 0px`. The bar now sits inside the event's start padding,
which in list and column view is `calc(12px + var(--calendar-card-line-width-vertical))`, so a
card-mod rule that sets `padding` on `.event` can run the text under the bar.
:::

The remaining event-level classes — `.event-title`, `.time`, `.location` — are plain
element classes with no state attached.

### Grid View Classes

[Grid view](/features/grid-view) splits a day into the two containers above, and draws its
events as positioned blocks with classes of their own:

| Class                  | Element                                                                  | Also carries                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.grid-event`          | a timed event's block                                                    | `.event`; `.past-event`; `.clipped-top` or `.clipped-bottom` where the event runs past the visible hours; `.grid-event-raised` while drawn over an earlier one |
| `.grid-banner`         | an all-day event, in the band above the time axis                        | `.event`; `.past-event`; `.continues-before` or `.continues-after` where it runs past the visible days                                                         |
| `.grid-event-overflow` | the `+N` block standing in for events that did not fit                   | `.event`, `.grid-event`                                                                                                                                        |
| `.grid-now-line`       | the now line in today's `.grid-day-body`, between events, in `now_color` | —                                                                                                                                                              |

Because the `+N` block is a `.grid-event` too, `.grid-event:not(.grid-event-overflow)` selects
real events only. A banner can span several days, so it sits in the all-day band rather than
in any day's `.grid-day-body`, and a day selector does not reach it; select it as
`.grid-banner`.

`.grid-now-line` is only the part of the now line between events. Inside the event under way,
which carries `.grid-event-now`, the line is that event's own background, drawn in `now_color`
from the same position, so it sits over the event's color and under its text. To recolor or
restyle the line, set `now_color` rather than styling `.grid-now-line`, or the two parts will
not match.

### Header Toolbar Classes

The [header toolbar](/features/layout-appearance#header-toolbar) adds `.has-toolbar` to
`.header-container` and draws one or two rows inside it, each a `.card-toolbar`: the actions
(`.toolbar-actions`), only while that row holds a control, then the month (`.toolbar-heading`). The title, `h1.card-header`, moves into
the month's row as a small label over the month, keeping its element and classes. A rule written
`.header-container h1.card-header` reaches it there; `.header-container > h1.card-header`, which
names it as the header's own child, does not while the toolbar is drawn.

| Class                      | Element                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.card-toolbar`            | either row: `.toolbar-actions` for the actions, `.toolbar-heading` for the month, which also carries `.chips-shown` while the [calendar chips](/features/layout-appearance#showing-hiding-calendars) show and `.short-month` while the month takes its short form                                                                                                                                                                                                                                                                                                                               |
| `.toolbar-start`           | the group at the start of the action row: the calendar filter's button and the add button                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `.toolbar-end`             | the group at the end of the action row: reset and refresh                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `.toolbar-identity`        | the block at the start of the month's row: the title, then the month under it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `.toolbar-month`           | the month heading; its words are `.toolbar-month-text`, the month's name in them `.toolbar-month-name`, inside `.toolbar-month-button` where it opens the date picker                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `.toolbar-heading-end`     | the group at the end of the month's row, holding the date navigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `.date-navigation`         | the group holding the previous, home and next buttons                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `.date-navigation-segment` | one of those three round buttons; home also `.home-done` for a moment after a press brought the card back                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `.toolbar-button`          | a button: add, also `.add-event-button`; reset, also `.reset-button`, with `.unavailable`, and hidden, while there is nothing to undo, `.alone` when it is the only control in its row, dimmed rather than hidden, and `.reset-done` for a moment after a press; refresh, also `.refresh-button`, with `.busy` while it turns, also `.unasked` for a load the card started itself, then `.refresh-done` or `.refresh-failed` for a moment after a press; and the calendar filter, also `.legend-button`, with `.filtered` while it hides a calendar. Every one is an icon, named by its tooltip |
| `.toolbar-button-icon`     | a button's icon                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `.toolbar-button-label`    | a view's name on its view switcher segment, while the switcher shows words                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `.toolbar-legend`          | the calendar chips, in the middle of the month's row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `.legend-chip`             | one calendar's chip; `.hidden-calendar` while its events are hidden                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `.legend-menu`             | the menu the filter button opens; each calendar in it is a `.legend-menu-row`, also `.hidden-calendar` while hidden                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `.view-switcher`           | the view switcher's track                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `.view-switcher-segment`   | one view in it; `.selected` for the current one, `.unavailable` while the card is too narrow for it, `.icon-only` while it shows its pictogram rather than its word                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `.view-switcher-icon`      | a segment's pictogram                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

The controls are painted from four custom properties:

| Custom Property                        | Paints                                                         |
| -------------------------------------- | -------------------------------------------------------------- |
| `--calendar-card-toolbar-fill`         | the buttons, the switcher's track and a hidden calendar's chip |
| `--calendar-card-toolbar-fill-hover`   | a control under the pointer                                    |
| `--calendar-card-toolbar-fill-pressed` | a control while it is pressed                                  |
| `--calendar-card-toolbar-selected`     | the switcher's selected segment                                |

The stylesheet declares them on `.card-toolbar` itself, which both rows are, so a theme or a rule
on `ha-card` does not reach them; the chips and the menu sit inside a row and take them from
there. Each chip and menu row tints itself from `--calendar-card-legend-color`, which the card
sets on it to the calendar's accent. Set them on `.card-toolbar`, with `ha-card` in front so the
rule outweighs the card's own:

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
navigation leaves rather than across the whole card. The rule above still reaches it, because it
names the title as any descendant of `.header-container`. The month is then the card's headline:
it takes `title_font_size` and `title_color`, and a rule for the title's look reaches the label,
not the month. Style the month through `.toolbar-month`. Its month's name, bold, is
`.toolbar-month-name`: the hidden copies the card keeps the heading's room with and measures it
by carry the class too, so a rule on it, `font-weight` say, changes them all alike and the
heading's room stays right.

### Highlight Today's Events

In grid view, `.grid-day-body.today` reaches today's timed events. An all-day banner sits in
no day's body; see [Grid View Classes](#grid-view-classes).

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
`.grid-day-body.weekend` cannot reach.

### Frameless Calendar Integration

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

For list and column view. Grid blocks lay out their own content, and `:not(.grid-event)`
keeps the recipe away from them.

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.family
card_mod:
  style: |
    .event:not(.grid-event) div.event-content {
      display: grid;
      grid-template-areas:
        "title time"
        "location location";
      grid-template-columns: 1fr auto;
      column-gap: 10px;
      row-gap: 0px;
    }

    .event:not(.grid-event) div.summary-row {
      grid-area: title;
      min-width: 0;
    }

    .event:not(.grid-event) div.time {
      grid-area: time;
      white-space: nowrap;
    }

    .event:not(.grid-event) div.location {
      grid-area: location;
      white-space: normal;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .event:not(.grid-event) div.time-location {
      display: contents;
    }
```

These examples demonstrate how Calendar Card Pro can be customized to match any dashboard design using card-mod's powerful CSS customization capabilities.

Before reaching for card-mod, check whether a built-in option already does what you need: the card exposes its own color, font and spacing options under [Layout & Spacing](/reference/configuration#layout-spacing) in the configuration reference.
