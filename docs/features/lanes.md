# Calendar Lanes

Calendar lanes give each calendar a fixed place in every day, so you can see whose plans are
whose at a glance. In grid view each calendar gets a slice of every day's hours. Its events
stay in that slice on every day, even when it has nothing on and the others are busy.

## 🏊 A Lane per Calendar

Turn lanes on with `lanes`. Each calendar under `entities` gets its own lane, in the order of
the list. A lane is headed under every date by the calendar's label, such as a person's
picture, and its name:

```yaml
type: custom:calendar-card-pro
view: grid
days_to_show: 5
lanes: true
entities:
  - entity: calendar.anna
    label: person.anna
  - entity: calendar.ben
    label: person.ben
  - entity: calendar.family
```

| Option           | Type    | Default | Description                                                                                                                     |
| ---------------- | ------- | ------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `lanes`          | boolean | `false` | Give each calendar a fixed slice of every day in grid view. Set it at the top level or in `time_grid:`                          |
| `min_lane_width` | number  | `40`    | Narrowest a lane may be, in pixels, before the grid shows fewer days; see [How Narrow a Lane May Be](#how-narrow-a-lane-may-be) |

- Lanes are drawn in grid view only. The other layouts draw the card as they always have, and
  so does a grid with `lanes` off, which is the default.
- Events that overlap within one lane share its slice, arranged as
  [`overlap_layout`](/features/grid-view#overlapping-events) says. A lane never takes room from
  another.
- All-day events stay in the [all-day band](/features/grid-view#all-day-events) every lane
  shares, above the hours.
- In the visual editor, open a layout's **Event Appearance** page and turn on **Calendar Lanes**
  under **Calendars Side by Side**.

::: details Which Calendars Get a Lane

- Every calendar keeps its lane on every day, so lanes never move. A calendar that keeps only
  all-day events, through [`event_type: all_day`](/features/filtering#separating-all-day-from-timed-events),
  gets no lane, since its events are all in the band.
- A calendar hidden by the [calendar filter](/features/header-toolbar#showing-hiding-calendars)
  takes its lane with it, and the other lanes widen. A calendar its
  [visibility conditions](/features/core-settings#showing-a-calendar-under-conditions) hide takes
  its lane with it too, for the people who do not see it.
- A lane's order is the order of the calendars on the editor's **Calendars** list.

:::

## 👥 One Lane for Several Calendars

An entry's `lane` names the lane its events go into. Entries with the same `lane` share one,
so a person with two calendars gets one lane, headed by the first label among them and by the
lane's name:

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
**Calendar Lanes** is on. **Split This Calendar** copies it to the new entry, so give one of the
two a lane of its own to draw them apart.

## 🖼️ Lane Headers

Under each date, a header names every lane: the label of its first entry that has one, as the
calendar draws it before its events, then the lane's name.

- A picture, such as `label: person.anna`, is drawn round, ringed in the lane's accent color.
- A lane with no label gets a circle in its accent color holding the first letter of its name.
- The name is the lane's `lane`, else the calendar's [`name`](/features/core-settings#naming-a-calendar-in-the-card),
  else its name in Home Assistant. A text label that says the name already draws it once.
- As the lanes narrow, the name goes first and then the label, so a narrow week still tells the
  lanes apart for as long as anything fits.

Each event keeps its own label inside its lane as well, so an icon still tells Anna's work events
from her own. A screen reader hears each event's lane named before its title.

## 📏 How Narrow a Lane May Be

A day drawing lanes needs `min_lane_width` for each of them, or its own
[`min_day_width`](/features/grid-view#fitting-narrow-cards) where that is wider. A card too
narrow for every day shows fewer days, as grid view always does on a narrow card:

```yaml
view: grid
days_to_show: 7
lanes: true
time_grid:
  min_lane_width: 48
```

- At the default 40px, four lanes make a day 160px, and seven days need 1,207px at the default
  spacing, or 1,223px for a card that opens at that width.
- Under `min_days_fallback: cramp`, a grid that keeps its days narrower than this keeps at least
  `2rem` for each lane, and scrolls sideways below that.
- The calendar filter never changes this: hiding a lane leaves the card's days as they were, and
  the other lanes widen into its room.

## ➕ Adding & Moving Events

With [`day_tap_action: add-event`](/features/actions#tapping-a-day-to-add-an-event), a tap or a drawn event in
a lane starts the new event in that lane's calendar: its first calendar that takes new events and
is not hidden by the calendar filter. A lane with none starts it in the card's first calendar, as
a tap anywhere else would, and the event popover names it either way. The block drawn for a new
event sits in its calendar's lane, and moves to another lane when you pick another calendar.

Dragging an event moves it to another day or time and keeps its calendar. Dropped in someone
else's lane, it goes back to its own.

## 📋 Shared Events

With [`filter_duplicates`](/features/filtering#filtering-duplicate-events), an event on several
calendars is shown once in each lane that holds it, each from its own calendar, so a dinner on
Anna's and Ben's calendars is in both their lanes. Copies within one lane are shown once, as
always, and so is an all-day event in the band.

Every lane option is in the [configuration reference](/reference/configuration#core-settings),
and an entry's `lane` with the [per-calendar options](/features/core-settings#available-options-for-entity-configuration-objects).
