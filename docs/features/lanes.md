# Calendar Lanes

Calendar lanes give each calendar a fixed place in every day, so you can see whose plans are
whose at a glance. List view draws a column for each calendar beside its dates, column view a row
for each calendar across its days, and grid view a slice of every day's hours. A calendar's events
stay in its place on every day, even when it has nothing on and the others are busy.

## 🏊 A Lane per Calendar

Turn lanes on with `lanes`. Each calendar under `entities` gets its own lane, in the order of
the list. Give each calendar a label, such as a person's picture, and its lane shows whose it is:

```yaml
type: custom:calendar-card-pro
view: list
days_to_show: 5
lanes: true
entities:
  - entity: calendar.anna
    label: person.anna
  - entity: calendar.ben
    label: person.ben
  - entity: calendar.family
```

| Option                  | Type    | Default  | Description                                                                                                                                 |
| ----------------------- | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `lanes`                 | boolean | `false`  | Give each calendar a fixed place in every day in list, column and grid view. Set it at the top level or in one layout's block               |
| `min_lane_width`        | number  | `96`     | Narrowest a lane may be, in pixels, in list view; grid view's default is `40`. See [How Narrow a Lane May Be](#how-narrow-a-lane-may-be)    |
| `list → lanes_fallback` | string  | `scroll` | What list view does once its lanes no longer fit: `scroll` scrolls them sideways under the dates, `list` draws the plain list without lanes |

- Lanes are drawn in list, column and grid view. Month view draws none, and with `lanes` off,
  which is the default, every layout draws the card as it always has.
- A lane's order is the order of the calendars on the editor's **Calendars** list.
- In the visual editor, open a layout's **Event Appearance** page and turn on **Calendar Lanes**
  under **Calendars Side by Side**.

::: details Which Calendars Get a Lane

- Every calendar keeps its lane on every day, so lanes never move.
- In grid view, a calendar that keeps only all-day events, through
  [`event_type: all_day`](/features/filtering#separating-all-day-from-timed-events), gets no lane,
  since its events are all in the all-day band. List and column view draw all-day events in their
  lane, so there it keeps one.
- A calendar hidden by the [calendar filter](/features/header-toolbar#showing-hiding-calendars)
  takes its lane with it, and the other lanes widen. A calendar its
  [visibility conditions](/features/core-settings#showing-a-calendar-under-conditions) hide takes
  its lane with it too, for the people who do not see it.

:::

## 🎛️ Lanes in Some Layouts Only

`lanes` set inside a layout's block applies to that layout alone, over the card's own, so a card
that switches layouts can draw lanes in some and not in others:

```yaml
view: list
lanes: true
column:
  lanes: false
```

This card draws a column per calendar in list view and in grid view, the plain columns in column
view, and its month as always. In the visual editor, turn **Calendar Lanes** on or off on each
layout's own **Event Appearance** page.

## 📜 A Column per Lane in List View

In list view, each lane is a column beside the dates, under a header naming it, so each day
reads across as a row and each calendar down as a column:

```yaml
view: list
lanes: true
```

- Each header shows its lane's label, the picture, icon or text its events carry, ringed in its
  accent color, or its initial in a circle of its color where it has none, then its name. A
  header too narrow for the name shows the label alone.
- A day with nothing on in any lane, under
  [`show_empty_days`](/features/event-content#calendar-events-display), shows its notice across the
  lanes.
- On a card with a height of its own, such as
  [`card_height`](/features/layout-appearance#card-dimensions-scrolling), the row of headers stays at the top
  while the days scroll under it.
- The lanes share the card's width. Where they no longer fit, they scroll sideways, as
  [How Narrow a Lane May Be](#how-narrow-a-lane-may-be) describes.

## 🗄️ A Row per Lane in Column View

In column view, each lane is a row across the days, named at its start, so a week reads as a
chart with a row for each person:

```yaml
view: column
days_to_show: 7
lanes: true
```

- The headers stand in a narrow track before the first day, each with its lane's label or
  initial over its name, which is shortened to fit.
- Each row is as tall as its fullest day, so a lane's events line up across the week.
- That track takes 72px of the card's width, so a narrow card shows one column fewer a little
  sooner; see [Showing Fewer Columns on Narrow Cards](/features/column-view#showing-fewer-columns-on-narrow-cards).

## 🕐 A Slice per Lane in Grid View

In grid view, each lane is a slice of every day's hours, and its timed events stay in it:

```yaml
view: grid
days_to_show: 5
lanes: true
```

- Events that overlap within one lane share its slice, arranged as
  [`overlap_layout`](/features/grid-view#overlapping-events) says. A lane never takes room from
  another.
- All-day events stay in the [all-day band](/features/grid-view#all-day-events) every lane
  shares, above the hours.
- Grid view draws no header over its slices; see [Telling Lanes Apart](#telling-lanes-apart).

## 👥 One Lane for Several Calendars

An entry's `lane` names the lane its events go into. Entries with the same `lane` share one,
so a person with two calendars gets one lane:

```yaml
lanes: true
entities:
  - entity: calendar.anna
    lane: Anna
    label: person.anna
  - entity: calendar.anna_work
    lane: Anna
  - entity: calendar.ben
    label: person.ben
```

Listing one calendar twice, each entry with its own filter and its own `lane`, splits it into
lanes, such as work and home:

```yaml
lanes: true
entities:
  - entity: calendar.family
    lane: Work
    allowlist: meeting|call
  - entity: calendar.family
    lane: Home
    blocklist: meeting|call
```

Left unset, an entry draws into its calendar's lane, and two entries of one calendar share it.
In the visual editor, `lane` is **Lane** on a calendar's page, under **Name & Look**, once
**Calendar Lanes** is on in a layout. **Split This Calendar** copies it to the new entry, so give one of the
two a lane of its own to draw them apart.

## 🖼️ Telling Lanes Apart

List and column view name each lane in a header. Grid view draws none: each event in a slice
shows its calendar's [label](/features/core-settings#choosing-how-a-label-is-read), such as a
person's [picture](/features/core-settings#showing-a-persons-picture), and its accent color, so
give each calendar both, and a slice is recognized by what it holds.

- A lane's header shows the label of its first calendar with one to draw, and its name: the lane's
  `lane`, else the calendar's [`name`](/features/core-settings#naming-a-calendar-in-the-card),
  else its name in Home Assistant.
- Under a header, an event leaves out the label the header already shows, drawn the same way. An
  entry with a label of its own keeps it, so in a shared lane an icon still tells Anna's work
  events from her own.
  Grid view keeps every label, since it draws no header.
- In grid view, an event with no room for any of its title, such as a quarter hour in a narrow
  slice, shows its label alone, down to 10px, and a text label too wide even then is cut short
  with "…". Its title is still read out with it, and a tap opens it as always.
- A screen reader hears each event's lane named with it: in list and column view after its day,
  in grid view before its title. In list and column view, a lane's events on a day are also a
  group named by the lane.

## 📏 How Narrow a Lane May Be

`min_lane_width` is the narrowest a lane may be, in pixels. List view and grid view each have a
default of their own and read their own block's value; column view's lanes are rows, which no
width decides:

```yaml
lanes: true
list:
  min_lane_width: 120
  lanes_fallback: scroll
time_grid:
  min_lane_width: 48
```

- **List view**, `96` by default: where the lanes no longer fit side by side, they scroll
  sideways under the dates, which stay where they are, and a fade at the edge says more lanes
  follow. A swipe then scrolls the lanes rather than turning the page. With
  `lanes_fallback: list` the card draws the plain list instead, until it is wide enough again.
- **Grid view**, `40` by default: a day drawing lanes needs `min_lane_width` for each of them, or
  its own [`min_day_width`](/features/grid-view#fitting-narrow-cards) where that is wider. A card
  too narrow for every day shows fewer days, as grid view always does on a narrow card. At the
  default 40px, four lanes make a day 160px, and seven days need 1,207px at the default spacing,
  or 1,223px for a card that opens at that width.
- A `min_lane_width` at the top level sets list view's; grid view keeps its own 40px unless
  `time_grid:` sets another.
- The calendar filter never changes this: hiding a lane leaves the card's width as it was, and
  the other lanes widen into its room.

::: details Edge Cases

- A card already drawing its lanes side by side keeps them until it is 16px narrower than they
  need, and one that scrolls them draws them side by side again only once it is 16px wider, so a
  card resting at the threshold settles.
- Under `min_days_fallback: cramp`, a grid that keeps its days narrower than its lanes need keeps
  at least `2rem` for each lane, and scrolls sideways below that.
- A column or grid card too narrow for its days falls back to list view, which draws lanes there
  if `lanes` is on for list view, and the plain list if `list: { lanes: false }`.
- List and column view draw their lanes with CSS subgrid, which needs Chrome 117 or Safari 16. An
  older browser draws those two layouts without lanes.

:::

## ➕ Adding & Moving Events

With [`day_tap_action: add-event`](/features/actions#tapping-a-day-to-add-an-event), a tap in a
lane's empty part of a day, or an event drawn in a grid's slice, starts the new event in that
lane's calendar: its first calendar that takes new events and is not hidden by the calendar
filter. A lane with none starts it in the card's first calendar, as
a tap anywhere else would, and the event popover names it either way. In grid view, the block
drawn for a new event sits in its calendar's slice, and moves to another slice when you pick
another calendar.

Dragging an event in grid view moves it to another day or time and keeps its calendar. Dropped in
someone else's slice, it goes back to its own.

## 📋 Shared Events

With [`filter_duplicates`](/features/filtering#filtering-duplicate-events), an event on several
calendars is shown once in each lane that holds it, each from its own calendar, so a dinner on
Anna's and Ben's calendars is in both their lanes. Copies within one lane are shown once, as
always, and so is an all-day event in a grid's all-day band.

Every lane option is in the [configuration reference](/reference/configuration#core-settings),
and an entry's `lane` with the [per-calendar options](/features/core-settings#available-options-for-entity-configuration-objects).
