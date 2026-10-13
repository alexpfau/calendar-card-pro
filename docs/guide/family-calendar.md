# A Family Calendar on the Wall

A tablet on the kitchen wall, on all day, showing the family's week. Anyone walking past should see who is busy and when, what the family is doing together, and what is coming up at the weekend, before they are close enough to read a word. This page builds the card in the picture for an invented family of three: Anna, Ben and their baby son Leo. It is one worked example rather than a list of options, and each part of it links to the page that covers it in full.

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_family_week.png" alt="A wall tablet showing one family's week in grid view, Monday to Sunday on an hour axis: each person's timed events in their own color with their face beside the title, shared plans in gold, work hours in gray, all-day banners above the hours, and a green line marking the current time on Wednesday afternoon"><br>

The week as the tablet shows it on Wednesday afternoon. Anna is pink, Ben is blue and Leo is green, each with a face in front of their events. Anything on more than one of their calendars is gold. Ben's working hours are gray and say only _Work_.

## 🧾 The Whole Card

Six calendars go into it: one for each person, Ben's work calendar, a Family calendar for the things that belong to all of them, and the trash pickup.

```yaml
type: custom:calendar-card-pro
title: Family
view: grid
start_date: start_of_week
first_day_of_week: monday
days_to_show: 7
filter_duplicates: true # one block per shared plan, with every face on it
duplicate_accent_color: '#ffb74d' # shared plans turn the Family calendar's gold
today_weekday_color: '#34d399'
today_day_color: '#34d399'
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

Nothing in it is specific to one kind of calendar. Local Calendars, Google calendars and CalDAV calendars all work the same way, so use whichever ones your family already keeps.

## 👨‍👩‍👦 A Face for Every Calendar

Each person's calendar carries a `label` pointing at a picture, and the card draws it in front of the title of every timed event on that calendar. A face says whose plan it is from across the room, at a distance where the title is not yet legible. On a wall calendar that is most of the time.

The three pictures are files in Home Assistant's `www` folder, under `www/demo/`, which Home Assistant serves at `/local/demo/`. Any path starting with `/` works the same way, and so does an `http` or `https` address. [Choosing How a Label Is Read](/features/core-settings#choosing-how-a-label-is-read) explains how the card tells a picture from text or an icon.

`label: person.anna` works too. The card then reads the picture from the person entity each time it draws, so a new photo in Home Assistant appears on the wall without touching the card. See [Showing a Person's Picture](/features/core-settings#showing-a-persons-picture).

::: tip Round Faces Need Round Pictures
The card draws a picture exactly as the file is, at the height of the title, and never cuts it into a circle. Home Assistant shows a person's picture in a circle on its own screens but stores it square, so with `label: person.anna` a photo shows here as a small square. The faces in this card are round pictures on a transparent background, which is why they read as round. For that look, point `label` at files like these, as the card above does.
:::

The work calendar carries Ben's face as well, because the question it answers is where Ben is. The section on [Ben's work](#ben-at-work-without-the-details) comes back to it.

## 🟡 Gold Means the Whole Family

Family lunch on Monday is on Anna's, Ben's and Leo's calendars at once. Without help the card would draw it three times, side by side. [`filter_duplicates: true`](/features/core-settings#filtering-duplicate-events) draws it once instead, and that one block carries the face of every calendar it came from, in the order the calendars are listed. Whoever is going is right there in front of the title. The copies count as one plan when their title, start, end and location all match, which is what you get when the same event is added to each person's calendar.

[`duplicate_accent_color`](/features/core-settings#labeling-coloring-shared-events) then recolors those merged blocks. Here it is the same gold as the Family calendar's own `accent_color`, and that is deliberate: on a family card, a plan on more than one person's calendar is a family plan. So gold means the family wherever the event lives. Grandma and Grandpa's visit sits on the Family calendar itself. The trip to the zoo is on Ben's and Leo's calendars, and date night on Anna's and Ben's. All three are gold, and nobody had to file them anywhere special.

That is also why the Family calendar stays on the card even though shared plans no longer need it. It holds the things that belong to nobody in particular, like a visit from the grandparents or a birthday in the family.

## 🎂 A Birthday That Counts Itself

Grandma's birthday is a yearly all-day event on the Family calendar, with `YEAR=1956` in its description. The card reads that marker and adds her age to the title, so on Saturday the banner says _Grandma's birthday (70)_. Next year it says 71, and nobody edits anything. See [Birthday Ages & Anniversary Counts](/features/event-content#birthday-ages-anniversary-counts).

The age is part of the title, which matters here. A banner in the all-day band shows its title and nothing else, so the age is one of the few extras that reaches it.

## 💼 Ben at Work, Without the Details

Ben's work calendar is on the card for one reason: so the family can see when he is out. [`replace_with: Work`](/features/core-settings#hiding-what-an-event-is-about) replaces the title of every event on it with the word _Work_. The gray blocks say that Ben is at work and until when, and nothing about which meeting it is.

The gray is quieter than his own blue on purpose. His own events, such as soccer on Tuesday evening or the morning run, are the ones the family plans around, and the working day is background.

Descriptions are hidden by default, and `show_location: false` takes the location off every block, so each one is a title and a time. If a work calendar needs to share some of its events and hide the rest, split it in two the way [Busy & Nothing Else](/guide/one-calendar-many-purposes#busy-nothing-else) does.

## 📅 The All-Day Band

All-day events get a band of their own between the dates and the hours, and an event that runs for several days is one banner across them. Daycare is closed on Wednesday and Thursday, and Grandma and Grandpa stay from Friday to Sunday. See [All-Day Events](/features/grid-view#all-day-events).

Banners do not show labels, so no face appears in the band. The emoji at the start of _🗑️ Recycling_ and _🏫 Daycare closed_ are part of the event titles, written in the calendars themselves, and they do the same job a label does in the timed blocks below.

::: tip Why the Trash Pickup Does Not Retire
On a list card, [`allday_expires_at`](/features/core-settings#retiring-all-day-events-during-the-day) takes the trash pickup off the screen once the truck has been. It only acts where past events are hidden, and grid view shows them by default, because a finished morning is still part of the week's shape. So this card leaves it out.
:::

## 🕐 The Week on an Hour Axis

`view: grid` gives each day a column and puts every event at the time it starts, as tall as it is long. See [Grid View](/features/grid-view).

`start_date: start_of_week` and `days_to_show: 7` keep the card on the current week and move it to the next one when the week turns over. Grid view shows past events by default, so the days already behind you this week stay filled in. See [Dynamic Start Date](/features/start-date-offset). `first_day_of_week: monday` starts that week on Monday. Without it the card follows Home Assistant's own setting, which may start on Sunday.

The axis runs from 07:00 to 22:00, the hours a family is awake. See [Choosing the Hours the Card Shows](/features/grid-view#choosing-the-hours-the-card-shows).

`show_now_line: true` draws a line at the current time across today's column, in emerald green by default. The three `today_*_color` options paint today's date in that same green, `#34d399`, so today and now read as one thing. See [The Now Line](/features/grid-view#the-now-line) and [Date Column Customization](/features/layout-appearance#date-column-customization).

`past_event_opacity: 100` keeps finished events at full strength. Monday is over by Wednesday, but on a wall calendar it is still part of the week. See [A Full Week Without Dimming](/features/grid-view#a-full-week-without-dimming).

Where one event starts well inside a longer one, grid view draws it on top, slightly indented, so both stay readable. Monday's pediatrician visit, an hour into Ben's work morning, sits on it that way. See [Overlapping Events](/features/grid-view#overlapping-events).

## 📱 Sized for a Wall Tablet

The picture is a 1280 × 800 tablet screen, captured at twice that resolution, and three things make the card fill it exactly.

**A panel view.** A [panel view](https://www.home-assistant.io/dashboards/panel/) gives a single card the whole screen, where a sections view would give it one section beside others.

**Kiosk mode.** The [kiosk-mode](https://github.com/NemesisRE/kiosk-mode) plugin, installed from HACS, hides Home Assistant's header and sidebar when the dashboard's address ends in `?kiosk`. It is a separate project, not part of this card.

**An axis that fits the screen.** `hour_height: 40px` over the fifteen hours from 07:00 to 22:00 makes the axis 600 px tall. That leaves room for the title, the dates and the all-day band on an 800 px screen, so nothing has to scroll. On another screen, change `hour_height` or the hours until the card fits. See [How Tall an Hour Is](/features/grid-view#how-tall-an-hour-is).

Two smaller choices help at a distance. `event_font_size: 13px` is one pixel larger than grid view's default. `min_days_to_show: 7` tells the card never to show fewer than all seven days. On a screen too narrow for them it switches to the list layout instead, as [Fitting Narrow Cards](/features/grid-view#fitting-narrow-cards) explains.

The screenshot uses the **[iOS Theme](https://github.com/basnijholt/lovelace-ios-themes)** (ios-dark-mode-blue-red-alternative), set on the view.

## 📚 Next Steps

- [Grid View](/features/grid-view) — every grid option, from the hours on the axis to how overlapping events are drawn
- [Core Settings](/features/core-settings) — labels, shared events, and rewriting what a calendar says
- [One Calendar, Many Purposes](/guide/one-calendar-many-purposes) — a hallway list card that splits one calendar several ways
- [Configuration Reference](/reference/configuration) — the complete option table
- [Examples](/reference/examples) — shorter, single-purpose configurations
