# Family Hub

Anna, Ben and their baby son Leo are an invented family with a tablet on the kitchen wall, a family dashboard and the same card on their phones. Wherever it is, it answers one question: who is busy when over the next few days, and which plans do they share? Each device picks its own layout and remembers it.

## 🖼️ See It

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/story_family_hub.png" alt="A wall tablet showing the family's next seven days in grid view under a two-row toolbar with a chip for each calendar: each person's events in their own color with their face in front of the title, shared plans in gold, all-day banners above the hours, and a forecast in each date header"><br>

The kitchen wall, a 1280 × 800 tablet in grid view. Anna is pink, Ben is blue and Leo is green, each face in front of its events, and anything on more than one of their calendars is gold.

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/story_family_hub_screens.png" alt="The same card three times: a phone in List showing three days and a Reset button, a narrow dashboard section in Grid showing three days with the calendar chips folded into the filter button, and the wall tablet in Columns showing a tinted week with finished events faded"><br>

One card, three screens: a phone switched to List, with Reset offering to undo the switch; a dashboard section in Grid; and the wall switched to Columns.

## 📋 Copy the Card

Replace the `calendar.*` ids with your own calendars, each `person.*` label with someone from **Settings → People**, and `weather.home` with your weather entity:

```yaml
type: custom:calendar-card-pro
config_version: 5
title: Family
view: grid
days_to_show: 7
event_gap: 4px
filter_duplicates: true
duplicate_accent_color: '#ffb74d'
weather:
  entity: weather.home
toolbar:
  show: true
  legend: chips
  reset: true
event_tap_action:
  action: details
entities:
  - entity: calendar.anna
    label: person.anna
    accent_color: '#ff6c92'
  - entity: calendar.ben
    label: person.ben
    accent_color: '#03a9f4'
  - entity: calendar.leo
    label: person.leo
    accent_color: '#66bb6a'
  - entity: calendar.family
    accent_color: '#ffb74d'
  - entity: calendar.trash_pickup
    accent_color: '#b388ff'
list:
  days_to_show: 3
column:
  min_days_to_show: 3
  show_past_events: true
  past_event_opacity: 40
  event_background_opacity: 15
time_grid:
  start_time: '07:00'
  end_time: '22:00'
  hour_height: 36px
```

## 🧭 Across Different Screens

`view: grid` is only where the card starts. The toolbar's switcher offers List, Columns and Grid, and each device remembers its own choice until the card is edited, so the wall stays on Grid while a phone keeps List. See [Switching Between Layouts](/features/layout-appearance#switching-between-layouts).

### Grid, Columns & List

`days_to_show: 7` is the week the grid and the columns show, and `list.days_to_show: 3` gives a phone's List today and the next two days. The card loads the longest of them, seven days, once, so switching never loads anything again. See [Showing a Different Number of Days in Each Layout](/features/core-settings#showing-a-different-number-of-days-in-each-layout).

Grid sheds days one at a time as the card narrows, always keeping today, so the same card fits a narrow dashboard section. See [Fitting Narrow Cards](/features/grid-view#fitting-narrow-cards).

The `column:` block styles Columns alone, so List stays a plain agenda. `event_background_opacity: 15` tints each event in its calendar's color, `show_past_events: true` keeps today's finished events, and `past_event_opacity: 40` fades them. `min_days_to_show: 3` lets Columns drop days down to three, at about 472px, before it turns into a list, where all seven would need about 1,072px. See [Showing Fewer Columns Instead](/features/column-view#showing-fewer-columns-instead).

`event_gap: 4px` gives each event its own rounded box and accent bar in List and Columns. Grid ignores it.

### The Toolbar

With `show: true`, `toolbar` adds two rows. The lower one carries the title _Family_ as a small label over the month, whose name is bold, and a press on the month opens a date picker. The arrows beside it page by the days on screen, a week on the wall and three on a phone, and the house between them returns to today. See [Paging Through Dates](/features/layout-appearance#paging-through-dates).

`legend: chips` puts a chip in each calendar's color in that row. It is the key to the colors and a switch that hides that calendar on this device. Where they do not all fit, as on a phone, they fold into the filter button, a menu with a checkbox per calendar. See [Showing & Hiding Calendars](/features/layout-appearance#showing-hiding-calendars).

The top row holds the rest. Add opens Home Assistant's new-event dialog with the first calendar that accepts new events preselected, Anna's here, and refresh loads the events now. See [Add Event Button](/features/actions#add-event-button).

Reset is off by default, and `reset: true` turns it on for a shared wall. It appears only once someone on this device has paged away, switched layouts or hidden a calendar, and one press puts it all back for whoever walks up next. On a card only you use, leave it off. See [Resetting the Card](/features/layout-appearance#resetting-the-card).

## 🗂️ Calendars & Event Blocks

Five calendars go in, and each is listed once:

| Calendar                | Holds                                                       | Blocks |
| ----------------------- | ----------------------------------------------------------- | ------ |
| `calendar.anna`         | Anna's own plans                                            | 1      |
| `calendar.ben`          | Ben's own plans                                             | 1      |
| `calendar.leo`          | Leo's daycare, naps and classes                             | 1      |
| `calendar.family`       | what belongs to nobody in particular, a visit or a birthday | 1      |
| `calendar.trash_pickup` | the recycling and trash collection days                     | 1      |

Nothing is filtered, because each calendar means one thing. A plan two or three of them share sits on each of their calendars, which is what lets the card draw it once with every face on it. A calendar that mixes several kinds of event can still feed the card, split into blocks as the [Family Agenda](/guide/one-calendar-many-purposes#calendars-event-blocks) splits its own. Local, Google and CalDAV calendars all display the same way.

## 🧩 How It Works

### A Face for Every Calendar

`label: person.anna` puts Anna's picture from Home Assistant in front of her events, so a face says whose plan it is from across the room, before the title is legible. A new photo in Home Assistant reaches the wall by itself. See [Showing a Person's Picture](/features/core-settings#showing-a-persons-picture).

::: tip Round Faces Need Round Pictures
Home Assistant stores a person's photo square, and the card draws it as stored, so it shows as a small square. For round faces, put round pictures on a transparent background in the `www` folder and point `label` at them, such as `/local/demo/anna.png`, as in the fixed-week screenshot below.
:::

### Gold Means the Whole Family

Family lunch is on Anna's, Ben's and Leo's calendars at once. [`filter_duplicates: true`](/features/core-settings#filtering-duplicate-events) draws it once instead of three times, with the face of every calendar it came from, in the order the calendars are listed. Copies count as one plan when their title, start, end and location all match, which is what you get when the same event is added to each calendar.

[`duplicate_accent_color`](/features/core-settings#labeling-coloring-shared-events) recolors those merged blocks in the Family calendar's own gold, deliberately: on a family card, a plan on more than one person's calendar is a family plan. So gold means the family wherever the event lives. The grandparents' visit is on the Family calendar, the zoo trip on Ben's and Leo's, and date night on Anna's and Ben's. All three are gold, and nobody filed them anywhere special. The [Family Agenda](/guide/one-calendar-many-purposes#shared-plans-in-the-filtered-agenda) uses the same gold, so a shared plan looks the same on every screen.

### A Birthday That Counts Itself

Grandma's birthday is a yearly all-day event on the Family calendar, called _🎂 Grandma's birthday_, with `YEAR=1956` in its description. The card reads that marker and adds her age to the title, so this year the banner says _🎂 Grandma's birthday (70)_. Next year it says 71, and nobody edits anything. The age is part of the title, which matters in the grid, where a banner shows its title and nothing else. See [Birthday Ages & Anniversary Counts](/features/event-content#birthday-ages-anniversary-counts).

### The All-Day Band

In grid view, all-day events get a band between the dates and the hours, and an event that runs for several days is one banner across them, like daycare closing for two days. See [All-Day Events](/features/grid-view#all-day-events).

Banners show no label, so the emoji in _🗑️ Recycling collection_ and _🏫 Daycare closed_ are written into the titles in the calendars themselves. They do the job a face does in the timed blocks.

The [Family Agenda](/guide/one-calendar-many-purposes#a-reminder-that-retires-itself) retires the trash pickup at 11:00 with `allday_expires_at`. This card leaves it out, because the option acts only where past events are hidden, and the grid and the columns here keep them.

### The Next Seven Days on an Hour Axis

`view: grid` gives each day a column and puts every event at the time it starts, as tall as it is long. See [Grid View](/features/grid-view).

With no `start_date`, the seven days start today and move on at midnight. `start_date` is shared by all three layouts, so `start_of_week` would make the phone's list show Monday to Wednesday, even on a Friday. A wall that shows Monday to Sunday is the [first variation](#a-fixed-week-on-a-dedicated-wall).

Grid view keeps today's finished events on screen, and an emerald line marks the current time. `weather` puts each day's forecast in its date header, as far ahead as the forecast reaches. See [The Now Line](/features/grid-view#the-now-line) and [Weather in the Grid Layout](/features/weather#weather-in-the-grid-layout).

The axis runs from 07:00 to 22:00, the hours a family is awake. See [Choosing the Hours the Card Shows](/features/grid-view#choosing-the-hours-the-card-shows).

### Sized for a Wall Tablet

The wall is a 1280 × 800 tablet. A [panel view](https://www.home-assistant.io/dashboards/panel/) gives the card the whole screen, and the [kiosk-mode](https://github.com/NemesisRE/kiosk-mode) plugin from HACS, a separate project, hides Home Assistant's header and sidebar when the address ends in `?kiosk`.

`hour_height: 36px` over the fifteen hours from 07:00 to 22:00 makes the axis 540px tall. That leaves room for the toolbar, the dates and the all-day band on an 800px screen, so the week needs no scrolling. Those two hours are grid view's defaults, written out so the arithmetic cannot change under you. On another screen, adjust `hour_height` or the hours. See [How Tall an Hour Is](/features/grid-view#how-tall-an-hour-is).

## 🔒 Shared-Screen Safety

`event_tap_action: details` opens a tapped event in Home Assistant's own dialog, with its description, its location, which the grid leaves off its blocks, and how it repeats. The dialog shows the event as the calendar stores it, so Grandma's birthday appears there without her age. See [Tapping an Event](/features/actions#tapping-an-event).

Where the calendar's [integration allows it](/features/actions#what-each-integration-allows), the dialog also offers **Edit** and **Delete**: a Local Calendar both, a Google calendar only Delete. Neither appears on a merged shared plan, where one copy cannot speak for the others. To keep them off a screen everyone walks past, add `allow_event_edit: false` and `allow_event_delete: false` to the card.

So the dialog also shows whatever the card hides, such as a rewritten title or a hidden location. `event_tap_action` applies to the whole card, not to one calendar, so a card with a private calendar on it needs the dialog off, as [A Private Work Calendar](#a-private-work-calendar) explains.

## 🔀 Variations

### A Fixed Week on a Dedicated Wall

A tablet that only ever shows the week can drop the switcher and hold the calendar week, Monday to Sunday. This is the card this page first published:

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_family_week.png" alt="A wall tablet showing one family's week in grid view, Monday to Sunday on an hour axis: each person's events in their own color with their face beside the title, shared plans in gold, work hours in gray, all-day banners above the hours, and a green line marking the current time on Wednesday afternoon"><br>

The fixed-week setup, with no toolbar, on a dark theme on Wednesday afternoon. The faces are round pictures from `/local/demo/`, and Ben's working hours say only _Work_, as the next variation sets up.

Add these lines to the card, replace its `time_grid:` block with this one, and delete its `toolbar:`, `list:` and `column:` blocks:

```yaml
start_date: start_of_week
first_day_of_week: monday
today_weekday_color: '#34d399'
today_day_color: '#34d399'
today_month_color: '#34d399'
time_grid:
  start_time: '07:00'
  end_time: '22:00'
  min_days_to_show: 7
  past_event_opacity: 100
  hour_height: 40px
  event_font_size: 13px
```

`start_date: start_of_week` holds the current week, and `first_day_of_week: monday` starts that week on Monday rather than wherever Home Assistant does. `past_event_opacity: 100` keeps finished events at full strength, because Monday is still part of the week. `min_days_to_show: 7` never shows fewer than seven days, and turns the card into a list where they do not fit. Without the toolbar, 40px hours fill its room, 13px type is a pixel above grid view's default, and the `today_*` colors paint today's date in the now line's green. See [A Full Week Without Dimming](/features/grid-view#a-full-week-without-dimming) and [Dynamic Start Date](/features/start-date-offset).

### A Private Work Calendar

Ben's work calendar can go on the wall too, so the family sees when he is out but not what the meeting is:

```yaml
entities:
  # calendar.anna, calendar.ben and calendar.leo as above
  - entity: calendar.work
    label: person.ben
    accent_color: '#90a4ae'
    replace_with: Work # says Ben is at work, not what the meeting is
    show_location: false # and not where it is
    show_description: false
  # calendar.family and calendar.trash_pickup as above
```

[`replace_with: Work`](/features/core-settings#hiding-what-an-event-is-about) replaces every title with _Work_, and Ben's face says whose it is. The gray is quieter than his own blue on purpose, because the working day is background. Grid hides locations already, but List and Columns show them, so `show_location: false` keeps a meeting room off the phone, and `show_description: false` keeps an agenda off even if descriptions are turned on for the whole card.

::: warning A Tap Shows the Real Meeting
Remove `event_tap_action` from the card. The dialog would show the meeting's real title, location and description, and it cannot be turned off for one calendar. To keep details on the tablet, put the work calendar on a card of its own.
:::

To let some work events keep their real title, such as a late finish the family plans around, split the calendar into two blocks on a marker, as the Family Agenda's [Busy & Nothing Else](/guide/one-calendar-many-purposes#busy-nothing-else) does. The two blocks work in the grid unchanged.

## 📚 Next Steps

- [Family Agenda](/guide/one-calendar-many-purposes) — the same family on a short hallway list
- [Header Toolbar](/features/layout-appearance#header-toolbar) — the switcher, the chips, paging and Reset in full
- [Grid View](/features/grid-view) — every grid option, from the hours to overlapping events
- [Column View](/features/column-view) — what Columns overrides, and how it falls back on narrow screens
- [Actions](/features/actions) — the event dialog, editing, deleting and the add button
- [Configuration Reference](/reference/configuration) — the complete option table
