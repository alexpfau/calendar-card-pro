# A Family Calendar: The Weekly Grid

Anna, Ben and their baby son Leo are an invented family whose kitchen-wall tablet shows the current week in grid view, so anyone walking past can see who is busy when and which plans they share. Six calendars feed it, one for each person, Ben's work, the family and the trash pickup, and an event that sits on several of them appears once.

This walkthrough builds that weekly display. Calendars that mix several kinds of event can feed it too; the last section shows how to add filtering without changing the layout.

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_family_week.png" alt="A wall tablet showing one family's week in grid view, Monday to Sunday on an hour axis: each person's timed events in their own color with their face beside the title, shared plans in gold, work hours in gray, all-day banners above the hours, and a green line marking the current time on Wednesday afternoon"><br>

The week as the tablet shows it on Wednesday afternoon. Anna is pink, Ben is blue and Leo is green, each with a face in front of their events. Anything on more than one of their calendars is gold. Ben's working hours are gray and say only _Work_.

::: tip Choose Your Walkthrough

- **A whole week by the hour** is this walkthrough.
- **A short agenda with its own rules for each kind of event** is [The Filtered Agenda](/guide/one-calendar-many-purposes).
- **Both kinds of calendar?** Choose the display first, then split only the calendars whose events need different treatment.

Filters read an event's title, location or description, so they need a reliable word or marker there. They never require moving events into new calendars.
:::

## 🏡 The Household & the Display

### The Kitchen Wall Tablet

A tablet on the kitchen wall, on all day. Anyone walking past should see who is busy and when, what the family is doing together, and what is coming up over the weekend, before they are close enough to read a word.

That makes it a week rather than a few days, and a grid rather than a list. Each day is a column on an hour axis, so a busy morning and a free afternoon show up as shapes before any title is read. The screen is a 1280 × 800 tablet in kiosk mode, and [Sized for a Wall Tablet](#sized-for-a-wall-tablet) explains how the card fills it.

## 🗂️ Calendars & Event Blocks

Six calendars go in, and each is listed once:

| Calendar                | Holds                                                       | Blocks |
| ----------------------- | ----------------------------------------------------------- | ------ |
| `calendar.anna`         | Anna's own plans                                            | 1      |
| `calendar.ben`          | Ben's own plans                                             | 1      |
| `calendar.leo`          | Leo's daycare, naps and classes                             | 1      |
| `calendar.work`         | Ben's working hours, a few of them marked `#family`         | 1      |
| `calendar.family`       | what belongs to nobody in particular, a visit or a birthday | 1      |
| `calendar.trash_pickup` | the recycling and trash collection days                     | 1      |

Nothing is filtered, because on this card each calendar means one thing. A plan that two or three of them share sits on each of their calendars, which is what lets the card draw it once with every face on it. If one of your calendars mixes several kinds of event, it can still feed this card, as [A Mixed Calendar in the Weekly Grid](#a-mixed-calendar-in-the-weekly-grid) shows.

Nothing in the card is specific to one kind of calendar. Local Calendars, Google calendars and CalDAV calendars all display the same way, so use whichever ones your family already keeps. Adding, editing and deleting events from the card is another matter: whether a calendar allows each is up to its integration, as [What Each Integration Allows](/features/actions#what-each-integration-allows) shows.

## 🧾 The Whole Card

The card in the picture, complete:

```yaml
type: custom:calendar-card-pro
title: Family
view: grid
start_date: start_of_week
first_day_of_week: monday
days_to_show: 7
filter_duplicates: true # one block per shared plan, with every face on it
duplicate_accent_color: '#ffb74d' # shared plans turn the Family calendar's gold
today_indicator_color: '#34d399'
today_weekday_color: '#34d399'
today_month_color: '#34d399'
entities:
  - entity: calendar.anna
    label: /local/demo/anna.png
    accent_color: '#ff6c92'
  - entity: calendar.ben
    label: /local/demo/ben.png
    accent_color: '#03a9f4'
  - entity: calendar.leo
    label: /local/demo/leo.png
    accent_color: '#66bb6a'
  - entity: calendar.work
    label: /local/demo/ben.png
    accent_color: '#90a4ae'
    replace_with: Work # shows that Ben is at work, not what the meeting is
    show_location: false # and not where it is
    show_description: false
  - entity: calendar.family
    accent_color: '#ffb74d'
  - entity: calendar.trash_pickup
    accent_color: '#b388ff'
time_grid:
  start_time: '07:00'
  end_time: '22:00'
  min_days_to_show: 7
  show_now_line: true
  past_event_opacity: 100
  show_location: false
  hour_height: 40px
  event_font_size: 13px
```

## 🧩 How the Card Works

### A Face for Every Calendar

Each person's calendar carries a `label` pointing at a picture, and the card draws it in front of the title of every timed event on that calendar. A face says whose plan it is from across the room, at a distance where the title is not yet legible. On a wall calendar that is most of the time.

The three pictures are files in Home Assistant's `www` folder, under `www/demo/`, which Home Assistant serves at `/local/demo/`. Any path starting with `/` works the same way, and so does an `http` or `https` address. [Choosing How a Label Is Read](/features/core-settings#choosing-how-a-label-is-read) explains how the card tells a picture from text or an icon.

`label: person.anna` works too. The card then reads the picture from the person entity each time it draws, so a new photo in Home Assistant appears on the wall without touching the card. See [Showing a Person's Picture](/features/core-settings#showing-a-persons-picture).

::: tip Round Faces Need Round Pictures
The card draws a picture exactly as the file is, at the height of the title, and never cuts it into a circle. Home Assistant shows a person's picture in a circle on its own screens but stores it square, so with `label: person.anna` a photo shows here as a small square. The faces in this card are round pictures on a transparent background, which is why they read as round. For that look, point `label` at files like these, as the card above does.
:::

The work calendar carries Ben's face as well, because the question it answers is where Ben is. [Ben at Work, Without the Details](#ben-at-work-without-the-details) comes back to it.

### Gold Means the Whole Family

Family lunch on Monday is on Anna's, Ben's and Leo's calendars at once. Without help the card would draw it three times, side by side. [`filter_duplicates: true`](/features/core-settings#filtering-duplicate-events) draws it once instead, and that one block carries the face of every calendar it came from, in the order the calendars are listed. Whoever is going is right there in front of the title. The copies count as one plan when their title, start, end and location all match, which is what you get when the same event is added to each person's calendar.

[`duplicate_accent_color`](/features/core-settings#labeling-coloring-shared-events) then recolors those merged blocks. Here it is the same gold as the Family calendar's own `accent_color`, and that is deliberate: on a family card, a plan on more than one person's calendar is a family plan. So gold means the family wherever the event lives. Grandma and Grandpa's visit sits on the Family calendar itself. The trip to the zoo is on Ben's and Leo's calendars, and date night on Anna's and Ben's. All three are gold, and nobody had to file them anywhere special.

That is also why the Family calendar stays on the card even though shared plans no longer need it. It holds the things that belong to nobody in particular, like a visit from the grandparents or a birthday in the family.

[The Filtered Agenda](/guide/one-calendar-many-purposes#shared-plans-in-the-filtered-agenda) sets the same gold for the same reason, so a shared plan looks the same on both of the family's screens.

### A Birthday That Counts Itself

Grandma's birthday is a yearly all-day event on the Family calendar, called _🎂 Grandma's birthday_, with `YEAR=1956` in its description. The card reads that marker and adds her age to the title, so on Saturday the banner says _🎂 Grandma's birthday (70)_. Next year it says 71, and nobody edits anything. See [Birthday Ages & Anniversary Counts](/features/event-content#birthday-ages-anniversary-counts).

The age is part of the title, which matters here. A banner in the all-day band shows its title and nothing else, so the age is one of the few extras that reaches it.

### Ben at Work, Without the Details

Ben's work calendar is on the card for one reason: so the family can see when he is out. [`replace_with: Work`](/features/core-settings#hiding-what-an-event-is-about) replaces the title of every event on it with the word _Work_. The gray blocks say that Ben is at work and until when, and nothing about which meeting it is. That includes Friday's offsite, which Ben marked `#family` so that [The Filtered Agenda](/guide/one-calendar-many-purposes#busy-nothing-else) shows it by name. This card does not read the marker.

The gray is quieter than his own blue on purpose. His own events, such as soccer on Tuesday evening or the morning run, are the ones the family plans around, and the working day is background.

The two `show_*` lines on the work calendar keep its locations and descriptions off the screen whatever the rest of the card says. Today they change nothing you can see: descriptions are hidden by default, and `show_location: false` under `time_grid` already takes the location off every block. They are there for the day someone turns either one on for the whole card, because a meeting room or an agenda gives away what the title no longer does, and a setting on the calendar outranks the card's. If a work calendar needs to share some of its events and hide the rest, split it in two, as [A Mixed Calendar in the Weekly Grid](#a-mixed-calendar-in-the-weekly-grid) does.

::: warning A Tap Shows the Real Event
[`event_tap_action: details`](/features/actions#tapping-an-event) opens a tapped event in Home Assistant's own dialog, which shows the event as the calendar stores it. A tap on a _Work_ block would show the meeting's real title, location and description. `event_tap_action` is set for the whole card, not per calendar, so leave it off this card, or show the work calendar on a card without it.
:::

## 🏷️ How the Display Reads

### The All-Day Band

All-day events get a band of their own between the dates and the hours, and an event that runs for several days is one banner across them. Daycare is closed on Wednesday and Thursday, and Grandma and Grandpa stay from Friday to Sunday. See [All-Day Events](/features/grid-view#all-day-events).

Banners do not show labels, so no face appears in the band. The emoji at the start of _🗑️ Recycling collection_ and _🏫 Daycare closed_ are part of the event titles, written in the calendars themselves, and they do the same job a label does in the timed blocks below.

::: tip Why the Trash Pickup Does Not Retire
On a list card, [`allday_expires_at`](/features/core-settings#retiring-all-day-events-during-the-day) takes the trash pickup off the screen once the truck has been, as [The Filtered Agenda](/guide/one-calendar-many-purposes#a-reminder-that-retires-itself) does at 11:00. It only acts where past events are hidden, and grid view shows them by default, because a finished morning is still part of the week's shape. So this card leaves it out.
:::

### The Week on an Hour Axis

`view: grid` gives each day a column and puts every event at the time it starts, as tall as it is long. See [Grid View](/features/grid-view).

`start_date: start_of_week` and `days_to_show: 7` keep the card on the current week and move it to the next one when the week turns over. Grid view shows past events by default, so the days already behind you this week stay filled in. See [Dynamic Start Date](/features/start-date-offset). `first_day_of_week: monday` starts that week on Monday. Without it the card follows Home Assistant's own setting, which may start on Sunday.

The axis runs from 07:00 to 22:00, the hours a family is awake. See [Choosing the Hours the Card Shows](/features/grid-view#choosing-the-hours-the-card-shows).

`show_now_line: true` draws a line at the current time across today's column, in emerald green by default. `today_indicator_color` puts today's day number on a tile in that same green, `#34d399`, and the two `today_*_color` options paint the weekday and month around it to match, so today and now read as one thing. The tile is a light wash of that green with the day number in a deeper one. See [The Now Line](/features/grid-view#the-now-line), [The Date Tile](/features/layout-appearance#the-date-tile) and [Date Column Customization](/features/layout-appearance#date-column-customization).

`past_event_opacity: 100` keeps finished events at full strength. Monday is over by Wednesday, but on a wall calendar it is still part of the week. See [A Full Week Without Dimming](/features/grid-view#a-full-week-without-dimming).

Where one event starts well inside a longer one, grid view draws it on top, slightly indented, so both stay readable. Monday's pediatrician visit, an hour into Ben's work morning, sits on it that way. See [Overlapping Events](/features/grid-view#overlapping-events).

### Sized for a Wall Tablet

The picture is a 1280 × 800 tablet screen, captured at twice that resolution, and three things make the card fill it exactly.

**A panel view.** A [panel view](https://www.home-assistant.io/dashboards/panel/) gives a single card the whole screen, where a sections view would give it one section beside others.

**Kiosk mode.** The [kiosk-mode](https://github.com/NemesisRE/kiosk-mode) plugin, installed from HACS, hides Home Assistant's header and sidebar when the dashboard's address ends in `?kiosk`. It is a separate project, not part of this card.

**An axis that fits the screen.** `hour_height: 40px` over the fifteen hours from 07:00 to 22:00 makes the axis 600 px tall. That leaves room for the title, the dates and the all-day band on an 800 px screen, so nothing has to scroll. On another screen, change `hour_height` or the hours until the card fits. See [How Tall an Hour Is](/features/grid-view#how-tall-an-hour-is).

Two smaller choices help at a distance. `event_font_size: 13px` is one pixel larger than grid view's default. `min_days_to_show: 7` tells the card never to show fewer than all seven days. On a screen too narrow for them it switches to the list layout instead, as [Fitting Narrow Cards](/features/grid-view#fitting-narrow-cards) explains.

The screenshot uses the **[iOS Theme](https://github.com/basnijholt/lovelace-ios-themes)** (ios-dark-mode-blue-red-alternative), set on the view.

### Adding a Plan From the Kitchen

The card in the picture only shows the week, but the tablet can take a new plan too. This is an addition, not the card in the picture:

```yaml
toolbar:
  show: true
  view_switcher: false # this tablet is always a week on the hour axis
```

That puts an add button at the end of the title's row, so the card grows no taller and the axis still fits the screen. It opens Home Assistant's own new-event dialog with the first calendar that accepts new events preselected, which is Anna's if hers does, because it is listed first. The dialog's picker offers the others, so a visit or a birthday goes on the Family calendar from there. See [Add Event Button](/features/actions#add-event-button).

## 🔀 Combining the Techniques

### A Mixed Calendar in the Weekly Grid

Every calendar in this card means one thing. Real ones often do not: a work calendar can hold the late finish the family needs to know about beside meetings it does not, and a family calendar can hold birthdays, collection days and outings at once. The card can split such a calendar into blocks, and nothing about the grid has to change.

Here is Ben's work calendar split on a `#family` marker in the description, the way [Busy & Nothing Else](/guide/one-calendar-many-purposes#busy-nothing-else) splits one. The two blocks replace the single `calendar.work` entry in the card above. This is an adaptation, not the card in the picture.

```yaml
entities:
  # calendar.anna, calendar.ben and calendar.leo as above
  - entity: calendar.work # an event marked #family keeps its real title
    filter_field: description
    allowlist: '#family'
    label: /local/demo/ben.png
    accent_color: '#90a4ae'
    show_location: false
    show_description: false
  - entity: calendar.work # everything else only says Work
    filter_field: description
    blocklist: '#family'
    label: /local/demo/ben.png
    accent_color: '#90a4ae'
    replace_with: Work
    show_location: false
    show_description: false
  # calendar.family and calendar.trash_pickup as above
```

Both blocks keep Ben's face and the gray, so the screen looks the same, and only a marked event shows its real title. The allowlist and the blocklist name the same marker, so every work event matches exactly one block. That matters more on this card than on most, because `filter_duplicates` is on: if both blocks matched an event, the card would draw it once, from the first block, and nothing on the screen would show the overlap. [Why This Works](/guide/one-calendar-many-purposes#why-this-works) has the rule in full.

The gold still works as before. A block's `accent_color` holds for the events only that calendar has, and a work event that also sits on Anna's calendar is a shared plan like any other, so it merges and turns gold. The agenda's `days_of_week: weekdays` is left off here; add it to both blocks if a weekend work event should stay off the wall.

A family calendar that mixes several kinds of event splits the same way, one block for each kind, as [The Filtered Agenda](/guide/one-calendar-many-purposes#calendars-event-blocks) splits its birthdays from everything else. Leave out the list-only parts, which the next section names.

### What Does Not Transfer From List View

Filters, text replacement, labels on timed events and `days_of_week` work the same in every layout. A few list options do not, because grid view draws all-day events differently:

- **The all-day badge options**, `allday_badge`, `allday_badge_style` and `allday_badge_color`, do nothing here. An all-day event in grid view is a banner, and a timed block never draws a badge.
- **Labels stop at the banner.** A banner shows its title and nothing else, so a 🎂 or 🗑️ label on a birthday or collection-day block does not appear on it. Put the emoji in the event's title instead, as the birthday and the trash pickup here do. The agenda takes those same titles the other way and moves each emoji into a label, as [The Same Week, Laid Out as a List](/guide/one-calendar-many-purposes#the-same-week-laid-out-as-a-list) explains.
- **The all-day row options**, such as `show_single_allday_time` and `show_location_allday`, have no row to act on.
- **`allday_expires_at`** retires an all-day event only where past events are hidden, and grid view shows them, as [The All-Day Band](#the-all-day-band) explains.

The full list is in [Options That Do Nothing in Grid View](/features/grid-view#options-that-do-nothing-in-grid-view).

## 📚 Next Steps

- [A Family Calendar: The Filtered Agenda](/guide/one-calendar-many-purposes) — the other walkthrough: a short list agenda that splits mixed calendars into blocks with their own rules
- [Grid View](/features/grid-view) — every grid option, from the hours on the axis to how overlapping events are drawn
- [Core Settings](/features/core-settings) — labels, shared events, and rewriting what a calendar says
- [Configuration Reference](/reference/configuration) — the complete option table
- [Examples](/reference/examples) — shorter, single-purpose configurations
