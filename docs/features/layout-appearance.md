# Layout & Appearance

These options control how the card looks rather than what it shows: its dimensions and scrolling behavior, its colors and fonts, the spacing between elements, and the styling of the date column, week numbers and today indicator.

## 📐 Card Dimensions & Scrolling

Calendar Card Pro offers flexible options for controlling the card's size and scroll behavior:

```yaml
# Fixed height - card always maintains exactly this height
height: '300px'

# Maximum height - card grows with content up to this height
max_height: '300px'

# Additional padding inside the card
additional_card_spacing: '10px'
```

The card offers two distinct height control mechanisms:

- **Fixed Height (`height`)**: Creates a calendar content area with exactly the specified height regardless of content amount. The full card also includes its header and card padding, so use the dashboard's layout controls when its outer height must fit a specific space.

- **Maximum Height (`max_height`)**: Allows the calendar content area to grow naturally up to the specified limit. This provides flexibility while still ensuring its event content does not become too large.

In list and column views, both options scroll when content exceeds the available space.
In grid view a fixed `height` compresses the time axis instead — see
[Height in Grid View](#height-in-grid-view). `max_height` still scrolls in every view.

Scrollbars are modern and clean, appearing only during hover or scrolling, and behave the
same on desktop and mobile.

### Height in Column View

Both options work the same way when the card renders as columns, and both may be
overridden inside a `column:` block. That matters more here than it looks: the same events
laid out side by side are far shorter than they are stacked, so a `max_height` tuned for
the list layout often never comes into play in column view — and one tuned for columns
would truncate the list badly.

```yaml
view: column
max_height: '600px'
column:
  max_height: '320px'
```

What scrolls is the **whole card**, not an individual day. The columns sit inside one
scrolling area, so the day headers move together with their events and nothing scrolls out
of alignment with its neighbors. The column layout is exactly as tall as its tallest day,
which means a quiet day leaves empty space beneath its last event rather than stretching
to match — the events stay anchored under their header.

::: tip Sizing From The Dashboard Instead
Home Assistant's own layout controls (⋮ → **Edit** → **Layout**) can constrain the card
too, and they scroll it the same way. Use them when a row height is precise enough;
reach for `max_height` when you want an exact pixel value, or a different limit per view.
:::

### Height in Grid View

A fixed `height` here compresses the time axis rather than scrolling. Hours, events, and
the now line are all positioned as a share of the band, so they squeeze into whatever
room the calendar content area has left after the day headers and the all-day band.
`hour_height` stops applying. The header and card padding sit outside that area, so use
the dashboard's layout controls when the outer card needs a particular size.

The time body retains at least half the configured content height, and a tall all-day band
scrolls in whatever the day headers leave above it. That remainder shrinks as the card
does: around `180px` the band is down to a row or two, and below about twice the header
height it is a sliver — its events are still scrollable rather than dropped, but only a
scroll gesture or the keyboard will reach them, and the time axis starts to be clipped by
the bottom of the card.

`max_height` still caps and scrolls, the same as in the other views.

Both options may be overridden inside a `time_grid:` block. A height tuned for a list of
events is the wrong size for a compressed axis, for the same reason a list height is
usually wrong for columns.

```yaml
view: grid
height: 400px # List and column view
time_grid:
  height: 600px # Grid view only
```

**→ [How Tall an Hour Is](/features/grid-view#how-tall-an-hour-is)** — `hour_height` and when a fixed height takes over.

## 🎨 Visual Styling & Colors

Customize the appearance of your calendar with various styling options:

```yaml
# Card background and title
title: 'My Calendar'
title_font_size: '20px'
title_color: 'var(--primary-color)'
background_color: 'var(--ha-card-background)'

# Event appearance
event_background_opacity: 15 # 0-100 scale for background color intensity
vertical_line_width: '3px' # Width of the accent bar beside each event
```

The `event_background_opacity` option (ranging from 0-100) works together with each calendar's `accent_color` to create semi-transparent backgrounds for events. At 0, the default in list and column view, events have no background color; grid view [starts at 20](/features/grid-view#options-that-start-from-a-different-default). Higher values create more intense backgrounds. With a background, each day's events form one block with rounded corners, and every event has its own accent bar inside it, 4px in from the edge, its rounded ends kept clear of the block's corners. Without one, the bar is the day's edge: the bars of touching events join into one line, changing color where one calendar's event meets another's, and only the day's top and bottom ends are rounded. To give each event a bar of its own without a background, set [`event_gap`](#gaps-between-events); even `1px` does it.

`vertical_line_width` sets how wide the bar is, and `0px` hides it. It takes a CSS length, and `thin`, `medium` and `thick`, which mean `1px`, `3px` and `5px`; anything else falls back to `2px`. The bar's ends are rounded at any width and in every view, and grid view draws it 3px inside each block.

`title_font_size` takes any CSS font size, as the
[date column's font sizes](#date-column-customization) do. A value that is not one is ignored,
and the title keeps Home Assistant's card header size.

The header can also hold a [toolbar](#header-toolbar) with arrows to page through the dates,
a view switcher and an add-event button.

When styling your calendar, you can use:

- CSS color values (`#ff6c92`, `rgba(255,0,0,0.5)`)
- Home Assistant theme variables (`var(--primary-color)`)
- Named colors (`red`, `blue`)

`accent_color` follows your theme's primary color by default, `var(--primary-color, #03a9f4)`,
so a calendar you have not colored takes a custom theme's accent. Set it card-wide, or for one
calendar in its `entities` entry, to choose a color yourself.

::: warning Changed In v5
Before v5, `accent_color` and `today_indicator_color` were a fixed `#03a9f4`, and the
week-number pill and week separator a fixed `#03a9f450`. To keep the old blue, add
`accent_color: '#03a9f4'` to your card or to a calendar's entry, `today_indicator_color: '#03a9f4'`,
and `'#03a9f450'` for `week_number_background_color` and `week_separator_color`.
:::

`accent_color` accepts one more value: `home-assistant`, which follows the color Home
Assistant holds for each calendar instead of a color you pick here. Named colors such as
`red` are unaffected and still mean the CSS color.

**→ [Using the Colors From Home Assistant](/features/core-settings#using-the-colors-from-home-assistant)** — how to set it, and what happens for calendars that have no color.

## 🧰 Header Toolbar

The card can carry a toolbar of its own controls in its header: arrows to
[page through the dates](#paging-through-dates), a view switcher between the List, Columns and
Grid layouts, a button that [loads the events again](#refreshing-the-events), a button for
adding events, a [legend of the card's calendars](#showing-hiding-calendars) that hides or
shows each one, and a button that [resets the card](#resetting-the-card) to how it is set up. One option turns the toolbar on, and the view switcher and the add button with
it; the others are turned on one by one:

```yaml
type: custom:calendar-card-pro
title: Family
entities:
  - calendar.anna
  - calendar.ben
toolbar:
  show: true
```

The controls sit at the end of the title's row, so the card grows no taller; a card without a
title gives them a slim row of their own above the events. Each is a neutral gray pill, so the
toolbar never competes with the events for attention. Color shows only on the control in use:
the card's accent, as on the card's own hover, while the pointer is over it or it is pressed,
and the theme's primary color as a ring around the one a keyboard has focused. On a card at least 640px wide the controls carry their names beside their icons, or 480px with the add button alone; with the [date navigation](#paging-through-dates) the band needs 840px, or 600px without the view switcher. Every button beyond the first among add, reset, refresh and a folded legend needs 112px more. Narrower, each is an icon with its name as a tooltip. A title too long to leave the names room keeps them as icons until the card is wider. `labels: false` keeps every control an icon at any width. The date navigation and the legend's chips are unaffected: the home button is always an icon, and the dates on screen and the chips are always words.

Each control can be turned on or off inside the block. `show: false` hides the whole toolbar and
keeps those choices for when it is turned back on:

```yaml
toolbar:
  show: true
  add_event: false
```

### Paging Through Dates

`navigation: true` adds the date navigation, which leads the toolbar: arrows back and forward
on either side of a button home, then the dates on screen.

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.anna
  - calendar.ben
days_to_show: 7
start_date: start_of_week
toolbar:
  show: true
  navigation: true
```

The arrows move by as many days as the card shows, a week here. Columns and Grid draw fewer
days on a narrow card, and the arrows then move by the days drawn, so no day is ever skipped.
A layout with its own `days_to_show` pages by its own count.
The button between them returns to the days the card opens with, the window its
[`start_date`](/features/start-date-offset) sets. It is a calendar icon, named "Today" in its
tooltip, or, when that window does not include today (`start_date: today+7`, a fixed date), by
the day it starts on.

The dates on screen open the browser's own date picker, and pressing them again closes it. Picking a day shows the page that holds
it, lined up with the card's own pages, so a week card still starts its week on the usual day.
The picker is the browser's, so it speaks the browser's language rather than the card's.

With the date navigation the toolbar takes a band of its own between the title and the events:
the dates at its start, the other controls at its end. On a card too narrow for both, the other
controls move to a second row. Which row a control sits on depends on the card's width, never
on the dates shown, so paging never moves one.

A few things work differently away from the days the card opens with:

- **Events that have ended are shown,** dimmed as usual, even with `show_past_events: false`.
  Looking back at last week is the point of paging there.
- **`hide_when_empty` does not hide the card,** so a card paged to an empty week keeps its
  arrows. It hides the card on its own days, as it always has.
- **The add button suggests the first day on screen,** unless the page includes today.

Where you are is never saved. A reload, a change to the card's configuration, a dashboard
entering edit mode and the [reset button](#resetting-the-card) all bring the card back to its own days, and a page stays on its dates at
midnight while those move on. Switching layouts keeps the page's first day, shows the new
layout's own number of days from it, and loads nothing. Each page's
events are fetched the first time it is shown and kept in memory while the dashboard is open,
the 16 most recent pages, never in the browser's storage. Paging back over a recent page is
instant and leaves nothing behind; an older one is fetched again.

::: tip Nothing Pages While You Edit
In the card editor's preview, and on a dashboard in edit mode, the date navigation is drawn but
does nothing, and the card shows the days it opens with.
:::

### Switching Between Layouts

The view switcher changes the layout on the dashboard without editing the card. The
configured `view` stays the layout the card opens with, and each device remembers its own
switch in the browser, so a wall tablet can show Grid while a phone keeps List. The choice is
never written to the configuration, and editing the card resets every device to its `view`;
the [reset button](#resetting-the-card) does the same for one device.
The choice belongs to the configuration it was made for, though, so a card changed back to
exactly what it was finds it again.

That means the whole configuration, including the layout keys a dashboard stores with the
card, so resizing the card in a sections dashboard also starts it at `view` again. Two cards
with identical configurations share one choice. A browser keeps at most 50 choices and drops
the oldest first, and a browser that refuses storage keeps the choice only while the page
stays open.

Every layout starts on the same date, and the card does not reload its events to switch.
`start_date` is shared by all three. `days_to_show` is too, unless a layout sets its own in
its block — say 14 days in List and 7 in Grid. The card then loads the longest of them once
and each layout draws the first of those days; see
[Showing a Different Number of Days in Each Layout](/features/core-settings#showing-a-different-number-of-days-in-each-layout).
List draws every one of its days; Columns and Grid draw as many as
fit the card's width, as close to today as the range allows, or from the first day of a page
the date navigation has moved to. Options set for one layout in its own `list:`,
`column:` or `time_grid:` block come with it.

Columns and Grid need room. A layout that cannot fit at the card's current width — Columns
on a phone, by default — is dimmed in the switcher, and returns when the card is wide enough
again, for example when a tablet is turned. If the layout a device remembers no longer fits,
the card shows List and the switcher marks it; once there is room again the remembered
layout comes back. When only one layout fits, there is no switcher at all. See
[Column View](/features/column-view) and [Grid View](/features/grid-view) for how much room
each needs.

The card's height follows its layout, so other cards on the dashboard may move when it
switches.

::: tip Nothing Switches While You Edit
In the card editor's preview, and on a dashboard in edit mode, the card shows its configured
`view` and a press on the switcher does nothing. To try another layout there, change
**Card Displays** in the editor.
:::

### Refreshing the Events

`refresh: true` adds a button that loads the events again now, rather than at the next
`refresh_interval`:

```yaml
type: custom:calendar-card-pro
title: Family
entities:
  - calendar.anna
  - calendar.ben
toolbar:
  show: true
  refresh: true
```

It sits just before the add button, named by Home Assistant's own "Refresh".
It asks Home Assistant for every calendar on the card, even when the events the card holds are
recent, which is how to pick up a change made somewhere else without reloading the dashboard.
While the card loads, for whatever reason, the button's icon turns, and the small spinner the
card otherwise shows in its corner is left out, since it would sit right beside it. After a press
it turns for at least one full turn, however quickly the events arrive, so a fast network still
shows that something happened. Then, for a moment, the button turns green and shows a check, or
red with an alert where a calendar could not be loaded, and the card names that calendar at its
foot as it always does. A press does nothing until the button is itself again, nor while the card
is loading by itself.

The same refresh is available as a [tap or hold action](/features/actions#refreshing-from-a-tap-or-hold),
for a card that should not carry a button.

### Showing & Hiding Calendars

`legend: true` adds a row of chips under the toolbar, one for each calendar on the card, tinted
in that calendar's color and named as Home Assistant names it:

```yaml
type: custom:calendar-card-pro
title: Family
entities:
  - entity: calendar.anna
    accent_color: '#e53935'
  - entity: calendar.ben
    accent_color: '#1e88e5'
  - calendar.family
toolbar:
  show: true
  legend: true
```

The chips are the key to the colors on the events below, and each is also a switch: a press hides
that calendar's events and turns its chip gray, and another press shows them again. A calendar
listed twice, such as one split by `event_type`, has one chip, in the color of its first entry. A
long name is cut short with an ellipsis, and shows in full as the chip's tooltip.

Hiding changes what is drawn, never what is loaded. Hidden calendars are still fetched, cached,
and named if they fail to load, so a press redraws at once and costs no request. Everything that
counts events counts only those of the calendars shown:

- **Duplicates.** With `filter_duplicates`, an event two calendars share is drawn from the first
  calendar shown, so hiding the one that drew it hands it to the next instead of removing it.
- **Compact limits.** `compact_events_to_show` and `compact_days_to_show` are filled from the
  calendars shown, so hiding one lets more of the others in.
- **`hide_when_empty`** acts only while every calendar is shown. A card emptied by the legend
  stays, with its chips, so the calendars can be brought back.

Each device remembers which calendars it hides, the way the
[view switcher](#switching-between-layouts) remembers its layout: in the browser, for this
configuration of the card. A change to the card's configuration shows every calendar again on
every device, and a configuration changed back to exactly what it was finds its hidden calendars
again; opening the editor and closing it without a change forgets nothing. The
[reset button](#resetting-the-card) shows them all again on one device. Two cards with the
same configuration share their hidden calendars, and a press on either changes both at once.
Paging and switching layouts keep them.

Where the chips do not fit on one row, they fold into a single button at the start of the
toolbar's controls, which opens them as a menu over the events, with a checkbox for each
calendar. A press outside the menu, Escape, a scroll or a change in the card's width closes it. The button carries a dot while
any calendar is hidden, so a folded legend still says the card is filtered. The chips come back
once the card is wide enough for them again, as when a tablet is turned.

::: tip Nothing Hides While You Edit
In the card editor's preview, and on a dashboard in edit mode, every calendar is shown, and the
chips and the menu button do nothing.
:::

### Resetting the Card

`reset: true` adds a button that undoes, in one press, every choice made on this device. It is
for a card several people share, such as a wall tablet, where a week someone paged to or a
calendar someone hid would otherwise stay for whoever walks up next:

```yaml
type: custom:calendar-card-pro
title: Family
entities:
  - calendar.anna
  - calendar.ben
toolbar:
  show: true
  navigation: true
  legend: true
  reset: true
```

One press brings back all of these at once:

- **The days the card opens with,** from any page the arrows or the date picker reached, as the
  home button does.
- **The configured `view`,** from a layout the [view switcher](#switching-between-layouts)
  picked. Where the card is too narrow for it, List stands in for it, as it always does.
- **Every calendar,** from any the [legend](#showing-hiding-calendars) hid.
- **A compact card collapsed,** after a tap or hold with the
  [`expand` action](/features/actions#expandable-calendar-card) opened it.

The button sits between the view switcher and refresh, named by Home Assistant's own "Reset".
While the card already shows how it is set up, the button is dimmed and a press does nothing,
so a glance at it says whether someone left the card on a choice of their own. It is drawn only
on a card with something it could undo: the date navigation, the view switcher, the legend, or an
`expand` action.

What the device remembered, its layout and its hidden calendars, is forgotten on that device
only. Another card with the same configuration shows every calendar again at once, as it does
after a press on the legend; its layout stays until that card is reset, reloaded or edited.
Nothing is loaded again for the layout or the calendars, and the card's own days are drawn from
what it already holds unless they are due for a refresh anyway.

The card never goes back by itself. A layout and hidden calendars stay until someone presses
the button or the card is edited, and a page until then or a reload.

::: tip Nothing Resets While You Edit
In the card editor's preview, and on a dashboard in edit mode, the card shows how it is set up,
so the button is dimmed and does nothing. What each device remembers is kept for when editing
ends.
:::

The add button is described under [Add Event Button](/features/actions#add-event-button).
The toolbar's options are listed under [Header](/reference/configuration#header) in the
configuration reference.

## 📏 Spacing & Alignment

Fine-tune the spacing and alignment of your calendar elements:

```yaml
# Spacing between elements
day_spacing: '8px' # Space between different calendar days
event_gap: '6px' # Space between the events of one day
event_spacing: '6px' # Internal padding within each event

list:
  # Date column alignment
  date_vertical_alignment: 'top' # Options: 'top', 'middle', 'bottom'

# Event icon alignment
event_icon_vertical_alignment: 'middle' # Options: 'top', 'middle', 'bottom'
```

The `date_vertical_alignment` option controls how dates align with their events, which is especially noticeable when a day has many events. The default `middle` option centers the date between its events, while `top` aligns it with the first event and `bottom` with the last event.

`event_icon_vertical_alignment` does the same job one level down, for the small icons on an event's time, location and description rows. It only becomes visible when one of those wraps onto a second line: the default `top` lines the icon up with the first line of text, while `middle` centers it against the whole block and `bottom` against the last line.

::: warning Changed In v4
This option defaulted to `middle` before v4. Rows wrap often enough — a long address, a description, or a time row carrying a [countdown](/features/column-view#progress-bar-countdown) in a narrow column — that centering left the icon level with neither line of text. Add `event_icon_vertical_alignment: 'middle'` to your card to keep the old behavior.
:::

### Gaps Between Events

A day's events normally touch, so they read as one block beside their date. `event_gap` holds each event apart from the next instead, which helps most when several events in a row share a calendar color and their accent bars run together into one line:

```yaml
event_gap: 6px
event_background_opacity: 15
```

Each event then becomes a block of its own, with an accent bar of its own. With [`event_background_opacity`](#visual-styling-colors) above 0 every event rounds all four of its corners, where the joined block rounds only the top of its first event and the bottom of its last, and its bar keeps clear of all four. That is how grid view draws an event, so a card shows a separate event the same way in every view. Without a background the bars that joined into one line now break between the events, each stopping just short of its event's top and bottom.

`event_gap: 1px` is the smallest way to have that: the events stand 1px apart, which you will hardly see without a background, and each has its own bar. It is a real gap all the same, so each event also becomes a tap and hover target of its own, with nothing to tap in between. The gap falls only between two events, never above the first or below the last, so the space between days is still `day_spacing` alone and every separator stays where it was.

`event_gap` takes any CSS length, such as `6px`, `0.5em` or a `calc()`. The default, `0px`, keeps the joined block, and a negative length counts as `0px`. It applies in list and column view, and each of the two can set its own inside `list:` or `column:`. Grid view places every event by its time and ignores it:

```yaml
column:
  event_gap: 4px # Gaps in column view only; list view keeps the joined block
```

`event_gap` is the space between events. The space above and below the text inside each event is `event_spacing`. In the editor, **Event Gap** sits in the **Layout** panel between **Day Spacing** and **Event Spacing**, in every workspace except Grid.

In list view, a gap also changes how the days read. Once the events stand apart, the space between two of them is close to the `day_spacing` between two days, and the days run together. A one-pixel day rule, `day_separator_width: 1px` inside `list:`, keeps them apart; [Separate Events With a Rule Between Days](/reference/examples#separate-events-with-a-rule-between-days) shows the two together.

## 📅 Week Numbers & Visual Separators

For improved organization with longer calendar views, you can enable week numbers and visual separators:

```yaml
# Week number configuration
show_week_numbers: 'iso' # 'iso', 'simple', or null to disable
show_current_week_number: true # Show week number for the first week
first_day_of_week: 'monday' # 'monday', 'sunday', or 'system'

# Week number styling
week_number_font_size: '12px'
week_number_color: 'var(--primary-text-color)'
week_number_background_color: '#e67c7350'

# Separator configuration
day_separator_width: '1px' # Line between days
day_separator_color: '#03a9f430'
week_separator_width: '2px' # Line between weeks
week_separator_color: '#03a9f480'
month_separator_width: '3px' # Line between months
month_separator_color: '#03a9f4'
```

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_4_week_numbers.png" alt="Week Numbers" width="600"><br>

`week_number_font_size` takes any CSS font size, as the
[date column's font sizes](#date-column-customization) do, and the pill is sized from it: 2.5
times as wide and 1.5 times as tall as its font size. A value that is not a font size falls
back to `12px`.

Left unset, the pill and the week separator are both your theme's primary color at 31%
opacity, so they follow a custom theme the way [`accent_color`](#visual-styling-colors)
does.

This feature creates a sophisticated visual hierarchy with:

- **Week Number Indicators**: Pill-shaped badges showing the current week number
- **Visual Separators**: Horizontal lines of varying thickness to distinguish between days, weeks, and months
- **Smart Precedence**: When multiple separators could appear at once (like when a week also changes month), the most significant one (month) takes priority

The separators follow an intelligent precedence system:

- When multiple separators could appear simultaneously (e.g., a day that's both the start of a week and a month), the most significant one (month) takes visual priority
- This creates a clean visual hierarchy: months > weeks > days

Week numbers can be displayed using either:

- **ISO Week Numbering**: Weeks start on Monday, and the first week of the year is the one containing the first Thursday (ISO 8601 standard)
- **Simple Week Numbering**: Counts weeks starting from January 1st

`first_day_of_week` decides where a week begins, which in turn drives week numbers, week separators and the `start_of_week` [start date](/features/start-date-offset). Its default, `system`, follows Home Assistant rather than the card: it uses the **First day of week** setting in your Home Assistant user profile, and when that is left at _Auto_ it falls back to the convention for your Home Assistant language — Monday for most, Sunday for languages such as English, Japanese, Hebrew and Brazilian Portuguese, Saturday for Arabic and Persian. Set `monday` or `sunday` explicitly to override Home Assistant for this card alone.

::: warning Changed In v4
Before v4, `system` always resolved to Monday and never consulted Home Assistant. If your Home Assistant profile or language implies a different week start, your week numbers and `start_of_week` anchor will shift once you upgrade. Set `first_day_of_week: 'monday'` to keep the old behavior.
:::

### Week Numbers in Column View

In column view the badge moves into the day header, on its own row directly above the
weekday, and each column answers for itself: a column that opens a week shows its number,
and the rest show nothing. That is what makes the option coherent in a grid — a seven-day
window can straddle two weeks, so a single badge spanning the card would have nowhere
sensible to sit.

The row is reserved in **every** column, not only the ones that start a week, so the
weekday, day number and events below stay aligned across the whole card. When
`show_week_numbers` is `null` — the default — no row is added at all.

`show_current_week_number` keeps its meaning: set it to `false` to hide the badge on the
first column, which is usually a partial week. All three styling options carry over
unchanged, so a badge you have already tuned looks the same in both views.

::: tip Per-View Week Numbers
Every option in this section may be set inside a `column:` block, so you can leave week
numbers off in the list layout and switch them on only when the card renders as columns.

```yaml
show_week_numbers: null
column:
  show_week_numbers: iso
```

:::

### Separators in Column View

The three separators keep their meaning in column view, but rotate: instead of horizontal
lines between stacked days, they are **vertical rules in the gaps between day columns**.
The precedence is unchanged — month beats week beats day — and every width still defaults
to `0px`, so a card that shows no lines in the list layout shows none as columns either.

Each rule runs the full height of the grid, from the top of the day headers to the bottom
of the busiest column, so a run of them reads as a set of dividers rather than as ragged
marks of differing lengths. Switching week numbers on is the one exception, covered below.

Two details differ from the list layout:

- **Spacing multipliers are not applied.** In the list a week separator carries more
  breathing room than a day separator, and a month separator more again. In a grid the gap
  between columns is a single uniform `day_spacing`, so a rule sits centered in that gap
  whatever its kind. Use width and color to signal the hierarchy.
- **Week numbers do not imply a week separator, but they do shorten the day rule.** In the
  list layout, switching week numbers on suppresses the day line at a week boundary,
  because the week-number row physically occupies that slot. Column view has no such
  collision — the badges sit in a band of their own above the columns, the rules sit
  between columns — so the day rule stays put and the run of dividers remains regular.

  What does change is how far up each rule reaches. A week number labels a whole week, so
  a day rule carried past it would appear to cut one day out of the label it belongs to.
  Day rules therefore stop level with the top of the weekday names, while week and month
  rules continue up through the badge — which is the boundary they actually mark. With
  week numbers off the badge row has no height and all three kinds are the same length
  again.

::: tip Heavier Rules Between Columns
A hairline reads well between stacked rows but can disappear against a full-height column.
Set the widths independently per view when that happens:

```yaml
day_separator_width: '1px'
column:
  day_separator_width: '2px'
```

:::

## 📆 Date Column Customization

Control the appearance of the date column for a personalized calendar view:

```yaml
# Base date column styling
weekday_font_size: '14px'
weekday_color: 'var(--primary-text-color)'
day_font_size: '26px'
day_color: 'var(--primary-text-color)'
month_font_size: '12px'
month_color: 'var(--primary-text-color)'

# Special styling for weekends (inherits from base when not specified)
weekend_weekday_color: '#e67c73' # Weekend day names
weekend_day_color: '#e67c73' # Weekend day numbers
weekend_month_color: '#e67c73' # Weekend month names

# Special styling for today (inherits from base/weekend when not specified)
today_weekday_color: '#03a9f4' # Today's weekday name
today_day_color: '#03a9f4' # Today's day number (on the date tile, the tile's shade when unset)
today_month_color: '#03a9f4' # Today's month name
```

The date column appears on the left side of each day's events and helps users quickly identify when events occur. By default, all dates use the base styling, but you can apply special styling to:

- **Weekend days** using the `weekend_*` options — which days those are follows the [country set in Home Assistant](/features/core-settings#showing-a-calendar-on-weekdays-only), or its language when no country is set
- **Today's date** using the `today_*` options

When the special styling options are not specified, they will inherit from the base styling. If today falls on a weekend, today styling takes precedence over weekend styling. The one exception is today's day number on the default [date tile](#the-date-tile): it takes a deeper shade of the tile's color rather than `day_color`, unless you set `today_day_color` or, on a weekend, `weekend_day_color`.

`weekday_font_size`, `day_font_size` and `month_font_size` take any CSS font size: a length
such as `26px` or `2em`, a percentage such as `180%`, a keyword such as `x-large`, `larger` or
`inherit`, or an expression such as `calc()` that works out to one. A space before the unit is
closed up, so `26 px` reads as `26px`, and a negative size, a misspelled unit or a word that is
not a font size falls back to the option's default. The date column is 1.75 times as wide as
the day number, whichever form you use. A keyword such as `x-large` depends on the browser's
default text size, so for those the card assumes the usual 16px, and the column can come out a
few pixels wider than the number needs. A `var()` is passed on as written, since the card
cannot see what it refers to: the date column follows it when the property it names holds a
length, but not a percentage or a keyword.

## 🌟 Today Indicator

Calendar Card Pro marks today out of the box: today's day number sits on a soft tile tinted
with your theme's primary color, in list, column and grid view. You can restyle it, swap it
for a dot, an icon, an emoji or an image, or turn it off:

::: tip Visual Editor
Find it under **Day Header → Today Indicator**, where **Style** offers **None**,
**Date Tile**, **Dot**, **Pulsing Dot**, **Glowing Dot**, **An Icon** and
**An Emoji or Image**. The date tile takes only an **Indicator Color**; the other styles add
an **Indicator Size**, and in the List workspace an **Indicator Position**.
:::

::: warning Changed In v5
Before v5 a card showed no indicator unless one was configured, and choosing **None** in the
editor stored nothing. v5 defaults to `tile`, so such a card now shows the tile. Add
`today_indicator: false` to your card to keep the old behavior. While the tile is on, column
and grid view give every day's number the tile's height, so their day headers are taller
than they were in v4.
:::

```yaml
# Choose the indicator type
today_indicator: tile # A soft tinted tile behind today's day number (default)
today_indicator: false # No indicator
today_indicator: true # Basic dot
today_indicator: pulse # Animated pulsing dot
today_indicator: glow # Glowing dot
today_indicator: mdi:star # Any Material Design icon
today_indicator: 🎯 # Emoji
today_indicator: KW 34 # Any text — raise today_indicator_size to make words readable
today_indicator: /local/custom-indicator.png # Image path
today_indicator: https://example.com/today.png # Or any image URL

# Position the indicator precisely with CSS-like coordinates
list:
  today_indicator_position: '15% 50%' # Centered left in the date column (default)
  today_indicator_position: '15% 15%' # Top left
  today_indicator_position: '85% 15%' # Top right

# Restyle the indicator
today_indicator_color: '#e67c73' # Tints the tile; colors the dot and MDI icons (default: your theme's primary color)
today_indicator_size: 6px # Size of icons, emojis and images; the tile ignores it (default)
```

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_today_indicator.png" alt="Today Indicator" width="600"><br>

The indicator is precisely positioned and always properly centered on the coordinates specified, making it ideal for creating visual emphasis on today's date.

Available indicator types:

- `tile`: A softly tinted tile behind today's day number (the default)
- `false`: No indicator
- `true` or `dot`: Simple dot indicator
- `pulse`: Animated pulsing dot
- `glow`: Glowing dot with subtle light effect
- `mdi:icon-name`: Any Material Design Icon
- Emoji characters: Any emoji like `🎯` or `⭐`
- Image path: Any image URL or local path
- Any other text: Drawn as the characters themselves — a week number, a quarter, a sprint name

Anything the card does not recognize as one of the first six is drawn as its own characters, so a typo shows up on the card instead of quietly falling back to a dot. Two things follow from that. Text is sized by `today_indicator_size`, which defaults to `6px` — right for an emoji, far too small for a word, so raise it when you use one. And a value shaped like an address is read as an image, so there is no way to draw `/dev` or a URL as literal text.

### The Date Tile

The tile is a rounded rectangle a little wider than it is tall, with the continuous corners of
an iOS app icon, and replaces nothing: the weekday and month stay where they are, and the tile
sits behind the day number itself. It sizes itself from `day_font_size`, so
`today_indicator_size` and `today_indicator_position` do not apply to it. The digits are
drawn as proportional figures, so a 1 no longer sits in a slot as wide as a 0, which halves
how far a 21 or a 31 leans left. Where the browser supports CSS `text-box`, the digits are
also centered on their own height rather than on the font's line.

The tile is a light wash of `today_indicator_color`, which follows your theme's primary color
unless you set one, over the card's background, with the day number in a deeper shade of the
same color. It is the recipe the tinted all-day pills use, and it adapts to light and dark
themes on its own. A color you set therefore tints the tile rather than filling it. The digits
take their shade from the tile, unless you name a color for them with `today_day_color` or, on
a weekend, `weekend_day_color`.

In column and grid view every day's number keeps the tile's height, so the dates stay on one
line across the columns and each column's first event starts at the same height.

```yaml
today_indicator: tile
today_indicator_color: '#e67c73' # Tint the tile with a fixed color instead of the theme's
today_day_color: '#8c1d18' # Choose the digits' color yourself
```

### Placing an Indicator

The `today_indicator_position` option accepts CSS-like position values in the format "x% y%", allowing precise placement of the indicator anywhere within the date column.

::: tip Column View Places It For You
`today_indicator_position` applies in list view only. A column header is as wide as the whole column with its date flush left, so a percentage that works beside a narrow date column lands on top of the day number instead — and a value far enough right ends up closer to the next day than to today. Rather than ask you to calibrate a percentage against your column width, column view puts the indicator immediately before the weekday, giving an unmistakable marker whatever the column measures. Every other indicator option — the type, `today_indicator_size` and `today_indicator_color` — works the same in both views.
:::

`today_indicator_size` scales every indicator type except the tile — it sets the icon size, the font size for emoji and text, and the image width. It takes a CSS length such as `6px`, `0.5em` or `1rem`, or an expression such as `calc()` that works out to one, and tolerates a space before the unit, so `6 px` reads as `6px`. A percentage, a negative size, a keyword such as `large` or a misspelled unit falls back to `6px`, because each would otherwise let the indicator balloon across today's date. For a size that follows the text around it, use `em`: `1.5em` rather than `150%`. A `var()` is passed on as written, since the card cannot see what it refers to. `today_indicator_color` tints the tile and colors the icon-based types (the dot, `pulse`, `glow` and any `mdi:` icon) and is also the color of the glow itself; emojis and images keep their own colors, and text takes the color it inherits.

The options on this page are grouped in the reference under [Layout & Spacing](/reference/configuration#layout-spacing), [Week Numbers & Horizontal Separators](/reference/configuration#week-numbers-horizontal-separators), [Today Indicator](/reference/configuration#today-indicator) and [Date Column](/reference/configuration#date-column). Two of them — `date_vertical_alignment` and `today_indicator_position` — are list-only and belong inside `list:`; they are listed under [List-Only Options](/reference/configuration#list-only-options).
