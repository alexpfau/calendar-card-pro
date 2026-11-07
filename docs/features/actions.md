# Actions & Interactions

Calendar Card Pro lets you add, open and change events from the dashboard. With the toolbar shown, a button in the card's header adds an event, and so does a tap on a day with `day_tap_action: add-event`; with `event_tap_action: details`, a tap on an event opens it in the card's popover, where you can edit or delete it. Further down are links in events, your own tap and hold actions, and a compact card that expands when tapped.

Whether a calendar's events can be added, changed or deleted is decided by the integration it comes from, not by the card: a Local Calendar allows all three, a subscribed holiday feed none. See [What Each Integration Allows](#what-each-integration-allows).

::: tip Nothing Opens While You Edit
In the card editor's preview, and on a dashboard in edit mode, the add button is still drawn, so you see the layout the card will have, but pressing it opens nothing, events are not tap targets, and a tap on a day adds nothing. Trying out a configuration or arranging a dashboard cannot open a popover that saves a real event. The card's own `tap_action` and `hold_action` work there as always, except `add-event`, `reset` and `back`, which do nothing and offer no tap or hold.
:::

## ➕ Add Event Button

The card can carry a button for adding events, so a new appointment goes in from the dashboard rather than from the Calendar panel. Show the [header toolbar](/features/layout-appearance#header-toolbar) and the button is in it, at the start of its top row after the calendar filter, whenever one of the card's calendars [accepts new events](#what-each-integration-allows):

```yaml
type: custom:calendar-card-pro
title: Family
entities:
  - calendar.anna
  - calendar.holidays
toolbar:
  show: true
```

The button is `toolbar → add_event`, on by default once the toolbar is shown; set it to `false` for a toolbar without it. It is a plus icon with Home Assistant's own "Add event" as its tooltip and its name for screen readers, and it opens the [event popover](#the-event-popover) on a new, empty event, ready for a title.

- **Adding.** Type a title and press **Add**, or Return, or close the popover with a press outside it or with Back. Before that you can change anything a saved event lets you change, the times, All day and Repeat included; see [Editing & Deleting Events](#editing-deleting-events).
- **Not adding.** Close it untouched, press **Cancel**, or press Escape, and nothing is added. A new event you changed but gave no title stays open and asks for one, so a date or calendar you picked is not lost on the way out.
- **The calendar** is a picker offering this card's calendars that accept new events, and only those. It starts on the first of them in `entities`, `calendar.anna` above, passing over any the [calendar filter](/features/layout-appearance#showing-hiding-calendars) is hiding, so hiding a calendar never opens a new event in it. If the filter hides all of them, the first is chosen anyway. On a card with only one, the popover names it.
- **The time** is on the hour, for an hour: today at the current hour when the days on screen include today, and otherwise the start of the first of them, so a card looking at next week, or paged to it, does not suggest today.

::: tip Pressing the Button Is Not a Tap on the Card
The button does not trigger the card's `tap_action` or `hold_action`, so it can sit on a card that expands or navigates when tapped. Keyboard users keep the card's own `tap_action` too: Tab to the card itself and press Enter, as [beside tappable events](#where-you-can-tap).
:::

::: warning Hidden With the Card
`hide_when_empty` still hides the whole card when there is nothing to show on the days it opens with, button included. Leave it off on a card you rely on for adding events.
:::

::: details More About the Add Button

- The days on screen count whether or not the card draws a row for today: a collapsed compact card that shows only the days before it, or an empty today that `show_empty_days: false` leaves out, still suggests today.
- Where Home Assistant has no words for "Add event" in your language, screen readers hear it in English and the button shows no tooltip.

:::

## 📆 Tapping a Day to Add an Event

A tap on a day can add an event on it, so a new event starts on the right day without picking a date. Set `day_tap_action` to `add-event`, and a tap where a day shows no event opens a new event on that day in the [event popover](#the-event-popover).

<video class="clip" src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/clip_list_tap_add.mp4#t=0.001" width="740" height="769" loop muted playsinline controls preload="auto" aria-label="Two days of a family's list on a tablet: a tap on Thursday's date opens the popover there with a new event on Thursday at 10:00, Plumber is typed as the title, and Add saves it between WFH and Grandma time"></video><br>

A tap on Thursday's date opens a new event that day at the hour it is now, and Add saves it.

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.anna
  - calendar.holidays
day_tap_action:
  action: add-event
```

Left at `none`, the default, a tap on a day is a tap on the card and runs `tap_action`. Any other
value reads as `none`. The visual editor's Day Tap Action dropdown offers Nothing and Add Event.
Like the add button, it needs a calendar that [accepts new events](#what-each-integration-allows).

### Where You Can Tap a Day

Wherever a day shows no event, in all three layouts:

- **List view:** the day's date, its "No events" line, and the space between its events.
- **Column view:** the day's header, and the empty space under its events.
- **[Grid view](/features/grid-view):** any empty point of the time grid, which adds at that
  quarter hour; the day's header; and the empty part of the all-day band above it, which adds an
  all-day event. In the grid you can also [draw the event](#drawing-an-event-in-grid-view).

A tap on an event never adds: the tap is the event's when it has an `event_tap_action`, and the
card's otherwise. Nor do a grid's `+N` block, which stands for several events, the week numbers,
the separators between days, the grid's time axis, the title or the
[header toolbar](/features/layout-appearance#header-toolbar): a tap on the title still runs
`tap_action`, and the toolbar's controls keep their own.

A tap has to stay put. A press that moves is a scroll, or a
[swipe](/features/layout-appearance#paging-through-dates), and adds nothing; a hold on a day runs
`hold_action`, except in a grid's time area and all-day band, where it
[draws a new event](#drawing-an-event-in-grid-view).

### Which Day, Hour & Calendar

The new event starts on the day you tapped, at the hour it is now: a tap on today opens at the
current hour, as the add button does, and a tap on another day at the same hour that day. In
grid view a tap in the time grid starts at the quarter hour you tapped instead, rounded down,
whatever `slot_minutes` the grid draws its lines at, and a tap in the all-day band adds an
all-day event on that day. A timed one lasts an hour. That is only a starting point: the popover
lets you change the start, the end and All day before you close it.

The calendar is the one [the add button](#add-event-button) would preselect: the first in
`entities` that accepts new events and that the calendar filter shows.

### Drawing an Event in Grid View

In [grid view](/features/grid-view), `day_tap_action: add-event` also lets you draw a new event,
as in a calendar app: hold an empty spot, drag to set its start and end, and let go to give it a
title. There is no option of its own.

<video class="clip" src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/clip_grid_draw.mp4#t=0.001" width="740" height="742" loop muted playsinline controls preload="auto" aria-label="A finger holds an empty spot on Wednesday at 14:15 until a New event block appears, drags its end down to 15:30 and lets go; the popover opens beside the block, Playground is typed as the title and Add saves it"></video><br>

- **On a phone or tablet,** hold an empty spot of the time grid for half a second, until a block
  appears, then drag. The page does not scroll while you do.
- **With a mouse,** press and drag at once.

The block starts as an hour from the quarter hour you pressed. Drag down to move its end, up to
move its start, or sideways to run it across days, in quarter-hour steps. It looks as the event
will once saved, in its calendar's colors. Let go and the popover opens beside it with those
times, ready for a title; the block follows what you change there. Escape throws it away, while
you draw or once the popover is open, and so does Cancel.

**All-day events** are drawn the same way in the all-day band, sideways for several days. The
band is there whenever the days shown hold an all-day event. On other days, tap the time grid
and switch on **All day** in the popover instead.

A hold on an empty spot of the grid draws even where the card has a `hold_action`. A hold
anywhere else, on an event included, still runs that action.

::: details More About Drawing

- The block is titled New event, in the calendar the popover will offer, with that calendar's
  colors, accent bar, text and time. It takes the title as you type it, moves when you change
  the times, and takes on the calendar you pick. After a save it stays until the card shows the
  real event a moment later. A tap in the grid shows the hour it adds the same way.
- On a touch screen, a second finger on the screen also throws a block away, and so does the
  card turning to other days while you draw.
- An all-day block is a banner across its days, beside the all-day events or in a row of its own
  below them. Switching on All day for a tapped event opens the band for one row, which closes
  again if you switch All day off or cancel.
- Nothing is drawn while the card is being edited.

:::

### From the Keyboard

While `day_tap_action` adds events, each day's date in list view, and each day's header in column
and grid view, is a button named with Home Assistant's own "Add event" and described by its
date. Tab to it and press Enter or Space to add on that day, at the hour it is now.

## 🗒️ Tapping an Event

A tap on an event can act on that event instead of on the whole card. Set `event_tap_action` to `details` and a tap opens the event in the card's [event popover](#the-event-popover), right beside it, with its times, its location, its full description and, for a repeating event, how it repeats:

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.anna
  - calendar.holidays
event_tap_action:
  action: details
```

`event_tap_action` also takes Home Assistant's own actions, which can [use the tapped event's fields](#using-the-events-fields-in-an-action), such as a `url` built from its title. Left at `none`, the default, events are not tap targets, and a tap on one is a tap on the card that runs `tap_action`. The card's own actions, `expand`, `refresh`, `add-event`, `reset` and `back`, are about the whole card or the page, so on an event they read as `none` too. The visual editor's Event Tap Action dropdown offers Show Event Details and Home Assistant's actions.

### Event Details

The popover shows the whole event, whichever part of it you tapped: a multi-day event the card draws across several days opens with its real start and end. Where the event's calendar allows it, you can also change the event right there and delete it; [Editing & Deleting Events](#editing-deleting-events) covers how, and when.

The title, location and description read as they do on the card, with the calendar's [text replacement](/features/core-settings#text-replacement) applied, so a title you masked or reworded stays that way. A [birthday age](/features/event-content#birthday-ages-anniversary-counts) the card appends is not part of the title there.

::: warning What the Popover Reveals
Two things go further than the card itself:

- **The location and the description show**, even where the card or a view hides them with `show_location: false` or `show_description: false`, and in grid view, which leaves locations off its blocks.
- **Editing a field shows it as the calendar stores it**, because that is what a save writes. Tap into a masked title and the real one appears.

On a card whose replacements exist to keep something private, set `allow_event_edit: false`. Where a location or description must stay hidden in the popover too, set `show_location: false` or `show_description: false` on that calendar itself; see [Narrowing What the Popover Offers](#narrowing-what-the-popover-offers).
:::

### Where You Can Tap

With an event tap action set, every event is a tap target, in all three layouts: a list row, a column event, and a grid block or all-day banner. In list view the whole colored block answers, not only its text.

Two things on the card are not events, so a tap on them is a tap on the card: the "No events" line of an empty day, and a grid `+N` block, which stands for several events. [Raise `max_simultaneous_events`](/features/grid-view#how-many-fit-side-by-side) to tap those one by one.

Keyboard users reach each event with Tab and open it with Enter or Space, and screen readers announce each event as a button, described by its day, so two events with the same title on different days can be told apart.

::: tip A Tap on an Event Is Not a Tap on the Card
With `event_tap_action: details`, tapping an event opens it and does **not** run the card's `tap_action`, which still runs for a tap anywhere else on the card, such as the title or a day's date, though never for one on a [header toolbar](/features/layout-appearance#header-toolbar) control: the space between the toolbar's controls is the card's. A hold is the card's: holding an event runs `hold_action`, exactly as holding anywhere else does, unless you [give events a hold of their own](#holding-an-event). In list view events fill most of the card, so if you also use `tap_action: expand`, tap a day's date or the card title to expand it.
:::

::: details The Card's Own Tap From the Keyboard
While its events are buttons, the card no longer announces itself as one. Its `tap_action` moves to a button of its own instead, the first stop in the card's Tab order: focused, it rings the card, and Enter or Space runs the `tap_action`, so a card whose `tap_action` is `expand` still expands from the keyboard. Screen readers announce it by the action's name where the card has a button for that action (Refresh, Reset, Back, Add event), and by the card's title otherwise, or its first calendar's name where it has no title. For `expand`, they also say whether the card is expanded. The same holds while the [header toolbar](/features/layout-appearance#header-toolbar) or a link in an event is shown. A card with nothing inside it to press, such as one showing only "No events", stays a button itself.
:::

### Holding an Event

`event_hold_action` does for a hold on an event what `event_tap_action` does for a tap. Set to
`details`, holding an event opens it, so a tap on it can keep doing what a tap does anywhere else
on the card. On a list card that expands when tapped, a tap expands it and a hold on an event
shows that event:

```yaml
tap_action:
  action: expand
event_hold_action:
  action: details
```

It takes the same actions as `event_tap_action`: `details`, or one of Home Assistant's actions
with the [held event's fields](#using-the-events-fields-in-an-action). Left at `none`, the
default, a hold on an event is a hold on the card and runs `hold_action`. With the two together,
an event answers a tap with `event_tap_action` and a hold with `event_hold_action`. The visual
editor's Event Hold Action dropdown offers what its Event Tap Action dropdown does.

An event that has either is a button for keyboard users and screen readers. The keyboard has no
hold, so Enter or Space on an event runs its tap action, or its hold action when it has no tap
action.

### Using the Event's Fields in an Action

Home Assistant's own actions in `event_tap_action` and `event_hold_action`, such as `url`,
`navigate` and `perform-action`, can use the event you pressed. Write a field's name in braces,
and the card fills it in before Home Assistant runs the action:

```yaml
event_tap_action:
  action: url
  url_path: https://www.google.com/search?q={title}
```

| Placeholder     | What it holds                                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `{title}`       | The event's title, with the calendar's [text replacement](/features/core-settings#text-replacement) applied                         |
| `{start}`       | When it starts: a date and time with its offset, such as `2026-11-03T17:00:00+01:00`, or a date, such as `2026-11-03`, when all-day |
| `{end}`         | When it ends, written the same way. An all-day event ends on the day after its last day, as calendars store it                      |
| `{all_day}`     | `true` for an all-day event, `false` for any other                                                                                  |
| `{location}`    | Its location, with the text replacement applied                                                                                     |
| `{description}` | Its description as plain text, with any markup removed and the text replacement applied                                             |
| `{calendar}`    | The entity ID of its calendar, such as `calendar.anna`                                                                              |

The fields describe the whole event, whichever day of a multi-day event you pressed, and they are
filled even where the card does not show them: a grid that leaves locations out, or a card with
`show_description` off, still fills `{location}` and `{description}`. A name in braces that is
not one of these stays as you wrote it.

::: warning An Event's Text Is Not Yours
Whoever writes an event writes its title, location and description, and on a shared calendar, a
subscribed feed or a calendar that accepts invitations, that can be anyone. So `{title}`,
`{location}` and `{description}` only fill places where text cannot change what the action
does: anything under `data` or `service_data`, a confirmation's `text`, and the part of a
`url_path` or `navigation_path` after its `?` or `#`. An action that puts one anywhere else, such
as `perform_action`, a `target`, an `entity`, or the host or path of a URL, does not run at all.
`{start}`, `{end}`, `{all_day}` and `{calendar}` can only ever be dates, `true` or `false`, and
your own calendar's ID, so they fill anywhere.
:::

In `url_path` and `navigation_path` each field is percent-encoded, so a title with spaces, an
ampersand or a slash stays a single search term and cannot add a parameter of its own. Everywhere
else, a field goes in as plain text. A `url` action that would open anything but an `http` or
`https` address once a field is in it does not run either. YAML reads a value that starts with a
brace as something else, so quote it:

```yaml
event_hold_action:
  action: perform-action
  perform_action: script.announce_event
  data:
    title: '{title}'
    starts: '{start}'
    calendar: '{calendar}'
```

`more-info` opens the calendar of the event you pressed, rather than the card's first, unless the
action names an `entity` of its own. In the visual editor, the URL, path and data fields of the
Event Tap Action and Event Hold Action dropdowns take field names in braces as YAML does.

## ✏️ Editing & Deleting Events

With `event_tap_action` or `event_hold_action` set to `details`, the popover that opens an event is also where you change it, wherever its calendar [allows it](#what-each-integration-allows). There is no Edit button: each part of the event is edited where it is shown, and the change is saved when the popover closes.

<video class="clip" src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/clip_popover_edit.mp4#t=0.001" width="740" height="744" loop muted playsinline controls preload="auto" aria-label="A tap on Grandpa visits on Saturday opens the popover beside it; a tap on its date line opens the start, the end, All day and Repeat, All day is switched on, and Save turns the event into an all-day banner"></video><br>

Tap the date line to open it, switch on All day, and save: the event moves into the all-day band.

- **Title & location.** Tap either one to type.
- **Date & time.** Tap the date line to open the start and the end, All day and Repeat. Moving the start moves the end with it, so the event keeps its length.
- **Description.** Tap it to edit it. A tap on a link in it follows the link instead.
- **Calendar.** Tap it to [move the event to another calendar](#moving-to-another-calendar).

Repeat offers what Home Assistant's own event editor offers: daily, weekly on the weekdays you pick, monthly on a day of the month or on an nth or last weekday, and yearly, ending never, after a number of occurrences, or on a date. A repeat rule outside that set, which another calendar app may have written, is shown as written and kept unless you pick another.

### Saving & Discarding

The popover saves once, when it closes: with a press outside it, with Back, or with **Save**, which appears at the bottom right beside **Cancel** once you have changed something. Return in the title saves too. A part you only looked at, or tapped into without changing, writes nothing.

- **Discarding.** **Cancel**, or Escape on a keyboard, throws every change away.
- **While saving,** the popover takes no input and stays open, and it closes by itself once Home Assistant has saved the change. The card then [shows the change at once](#changes-appear-at-once).
- **A repeating event.** For one occurrence, closing asks once whether the change covers **This and all future events** or **Only this event**, and **Cancel** goes back to editing. As in Home Assistant's own editor, a change to how the event repeats takes effect only for This and all future events. Moving a repeating event to another day moves its repeat with it, so a weekly event on its own weekday, or a monthly one on its own date or weekday, stays on the day you moved it to.
- **A refused change.** If Home Assistant refuses it, because the title is empty, the times do not make a valid event, such as an end before the start, or the calendar reports an error of its own, the popover stays open and says why. Nothing you changed is lost.

### Dragging in Grid View

In [grid view](/features/grid-view#moving-events-by-drag) you can also drag an event to another time or day wherever the popover [could change it](#what-each-integration-allows), with a mouse at once or after holding it on a touch screen. A single event is saved when you let go; a repeating one opens the popover at its new times, to ask which occurrences move or to save. `allow_event_edit: false` turns dragging off along with editing.

### Moving to Another Calendar

Tap the calendar to pick another, and the event moves there when the popover closes, with anything else you changed. The picker offers this card's other calendars that [accept new events](#what-each-integration-allows). The card moves an event by adding it to the new calendar and then deleting it from its own, so moving needs the event's own calendar to allow both changing and deleting it, and both [`allow_event_edit` and `allow_event_delete`](#narrowing-what-the-popover-offers) left on.

A repeating event asks which occurrences you mean. **Only this event** moves that occurrence alone, as a single event. **This and all future events** moves the series from that occurrence on. It is offered only where the series can move whole: not for a series that ends after a number of occurrences, whose count would start again in the new calendar, so set its end to a date first, in the same popover; and not for an occurrence you changed on its own.

Only what the popover shows moves: the title, times, location, description and repeat. Anything else a calendar keeps about an event, such as a tentative status, guests or reminders, stays behind with the copy that is deleted.

::: warning Moving a Series Brings Back What You Changed in It
Home Assistant cannot carry an occurrence you deleted from a series, or one you changed on its own, over to another calendar. Moving the series brings each of them back in the new calendar as a plain occurrence, on its usual day and with the series' title and times. Delete or change them again there.
:::

A failure between adding and deleting leaves the event in both calendars rather than in neither. The popover then says why, and offers nothing more to save.

### Deleting

**Delete** sits at the bottom of the popover that `details` opens, wherever the event's calendar [allows deleting](#what-each-integration-allows) and [`allow_event_delete`](#narrowing-what-the-popover-offers), on by default, is left on; the card also leaves it out [in a few cases](#when-the-card-leaves-them-out). It asks you to confirm, and for a repeating event whether you mean **Only this event** or **This and all future events**; **Cancel** keeps the event. Once confirmed, the event is deleted from its calendar, and the card cannot bring it back.

### What Each Integration Allows

Whether a calendar's events can be added, changed or deleted at all is decided by the integration it comes from, not by the card, which offers only what the calendar declares to Home Assistant. For the calendar integrations that ship with Home Assistant:

| Integration                                            | Add | Edit | Delete |
| ------------------------------------------------------ | --- | ---- | ------ |
| Local Calendar                                         | Yes | Yes  | Yes    |
| Google Calendar                                        | Yes | No   | Yes    |
| CalDAV, iCloud included                                | Yes | No   | No     |
| Read-only calendars, such as a subscribed holiday feed | No  | No   | No     |

- **Local Calendar** does all three, repeating events included, which makes it a good calendar to try the popover's editing with.
- **Google Calendar** adds events and deletes them, one occurrence of a repeating event or every occurrence from it onward included, but Home Assistant's Google integration cannot change an event. A Google calendar you can only read, or one added to Home Assistant with read-only access, offers nothing.
- **CalDAV**, which is also how Home Assistant connects an iCloud calendar, only adds.
- **Other integrations**, custom ones included, offer whatever they declare.

**Adding** needs a calendar on the card that accepts new events: its integration allows adding, and it is not [failing to load](/features/performance#when-a-calendar-fails-to-load). That holds for the [add button](#add-event-button), a [tap on a day](#tapping-a-day-to-add-an-event), [drawing in the grid](#drawing-an-event-in-grid-view) and the [`add-event` action](#adding-an-event-from-a-tap-or-hold) alike. On a card without one, the add button is not drawn even with the toolbar shown, a tap on a day stays a tap on the card, and `add-event` does nothing and offers no tap or hold. A calendar failing to load is left out of the new event's calendar picker; where it is the card's only one, the button returns once it loads again.

**Changing** an event needs a calendar that allows changing, and so do [dragging it](#dragging-in-grid-view) and [moving it to another calendar](#moving-to-another-calendar). **Delete** needs one that allows deleting, and so does moving.

::: tip Changing & Deleting CalDAV Events
The custom integration [CalDAV Complete](https://github.com/ivenos/ha_caldav) connects CalDAV calendars with adding, changing and deleting events, repeating ones included. For each calendar you can write to, it declares all three to Home Assistant, so the card offers them as it does for a Local Calendar; a calendar you can only read, or one under its own read-only option, declares none. Its calendars are entities of their own, beside any from the built-in CalDAV integration, so the card needs those in `entities`. It is not part of Home Assistant or of this card; how to install and set it up is described in its repository.
:::

::: details Checking What a Calendar Declares
Find the calendar on the **States** tab under **Settings → Tools** (Developer Tools in older versions of Home Assistant) and read its `supported_features` attribute: 1 is adding, 2 deleting and 4 changing, added together, so 7 is all three, 3 adding and deleting, and 1 adding alone. A calendar without the attribute declares none of them.
:::

### Narrowing What the Popover Offers

`allow_event_edit` and `allow_event_delete` take editing or Delete away on one card, for a dashboard where events should be read but not changed, such as a wall tablet in the hall. With `allow_event_edit: false` every part of the popover is plain text, and with `allow_event_delete: false` it has no Delete. Both are on by default, and neither can offer what the integration does not:

```yaml
event_tap_action:
  action: details
allow_event_edit: false
allow_event_delete: false
```

The visual editor shows the two switches only while Event Tap Action or Event Hold Action is Show Event Details, because with Nothing for both there is no popover for them to narrow.

A calendar can keep its locations or descriptions out of the popover too. Set to `false` on the calendar itself, Never show in the visual editor, `show_location` and `show_description` hide them from that calendar's events everywhere: the rows leave them out, and so does the popover, which draws no map for them and looks nothing up. Saving a change to such an event keeps them as they are stored. Set on the card or a view instead, the two options only tidy the rows, and the popover still shows what they leave out, since it is where you go to read it. A new event shows every field, because you are the one writing it.

```yaml
entities:
  - entity: calendar.work
    show_location: false # no meeting rooms, in rows or in the popover
    show_description: false
```

### When the Card Leaves Them Out

The details still open, but the card makes the event read-only and leaves out Delete where changing it would go wrong, whatever the two options say:

- **A row merged by [`filter_duplicates`](/features/core-settings#filtering-duplicate-events).** The event exists in more than one calendar, so editing one copy is ambiguous, and deleting one brings the row straight back from the other.
- **An event from a calendar that is [failing to load](/features/performance#when-a-calendar-fails-to-load).** The card is drawing it from its cache, which can be up to a day old, and saving an edit would write those old values over the calendar's current ones.
- **An event without an identifier.** Home Assistant finds the event to change by its unique ID, and some calendars do not send one.
- **Editing only, an event its calendar stores without an end.** The popover shows it ending where it starts, and saving a change would write that end into the calendar.

## 💬 The Event Popover

An event's details and a new event both open in the card's own popover: from an event whose [`event_tap_action` or `event_hold_action`](#tapping-an-event) is `details`, from the [add button](#add-event-button), and from a [tap on a day](#tapping-a-day-to-add-an-event) or an [`add-event` action](#adding-an-event-from-a-tap-or-hold). It shows:

- the title, beside a bar in the color of the event's calendar;
- the date and the times, or All day, and for a repeating event how it repeats, in words;
- the location, with a [map or a pin](#maps-locations);
- the calendar's name, with its color: its [`name`](/features/core-settings#naming-a-calendar-in-the-card) on the card where it has one, else Home Assistant's, and the same for each calendar it can move to;
- the description, with its web addresses as [links](#links).

On a wide screen it opens beside the event you pressed, with its arrow pointing at it, to the right where there is room and to the left otherwise: beside the edge of an event drawn as a tinted box, such as a grid block or any event under `event_background_opacity`, and beside the end of the text of one drawn without. A tap on a day, or on an empty slot of the grid, opens it right where you tapped, and the add button opens it below the button. On a screen narrower than 600 pixels it rises from the bottom as a sheet.

While it is open, the page behind it does not scroll. It is light or dark as your Home Assistant theme is, and with reduced motion turned on in your system it appears and disappears without moving.

### Words & Language

Every word in the popover is Home Assistant's own, from its calendar translations, so the popover follows the language of your Home Assistant profile rather than the card's `language` option, as the add button's tooltip does. Dates and weekday names follow that language too, and times follow the card's 12- or 24-hour format, `time_24h`.

### Maps & Locations

When an event you open has a location the card can place, the popover draws a small OpenStreetMap map under it, with a marker on the spot. There is no option for the map; it is there whenever a location can be placed. A location the card cannot place gets a small pin beside it instead. Pressing the map or the pin opens a Google Maps search for the location.

The card places two kinds of location:

- **A zone.** When the location names one of your Home Assistant zones, the map shows the whole zone, zoomed so that its circle, its radius in Home Assistant, spans the map's width: a zone drawn around a city shows the city, and one drawn around a house shows its street. Nothing leaves your home to find it. A zone matches by its name, or by the name in its entity ID with underscores read as spaces, ignoring case and spacing: `Swim Club` finds a zone named Swim Club, or one whose entity ID is `zone.swim_club`.
- **A town or a city.** A short place name, such as `Rosenheim`, `Paris` or `Springfield, Illinois`, is looked up in [Open-Meteo](https://open-meteo.com)'s free geocoding service, which needs no account or key. A street address, a house number, a postal code, an email address or a web address is never sent, and gets the pin. So does a place the lookup does not find, or a lookup that fails.

The map needs Home Assistant 2026.10 or later; on an older version the popover shows the pin.

::: info What Leaves Your Home
Your browser sends a town or city name straight to Open-Meteo, which sees your public IP address with it; Open-Meteo states that it deletes those addresses after 90 days. The lookup runs only when you open an event in the popover, and never for a calendar that keeps its locations out of it; event rows, the card editor and typing a location never send anything. Each name is looked up once and kept in your browser for 30 days, a name that found nothing for 7, so opening the same event again sends nothing. The map tiles come through Home Assistant, so your browser asks no map server for them.
:::

::: details Which Places Are Found

- Only a name of two to 60 characters, with at most four words and one comma for its country or
  region, is looked up; anything with a digit, `@`, `/` or `:` in it is never sent. Only a town
  or a city of exactly that name counts, accents aside, never a district, a park or a mountain.
- Near home, meaning in your home's country, within 100 km of it, or in the country or region
  named after the comma, a town needs 5,000 people; anywhere else a city needs a million, or
  100,000 for a capital. Your home's country and position are the ones set in Home Assistant.
  Ordinary words that name some tiny place, such as `School`, `Park` and `Beach`, therefore find
  nothing, and a smaller town far away needs its country: `Salzburg, Austria`.
- Where several places pass, one within 100 km of home comes first, else the one Open-Meteo ranks
  first, usually the largest: `Paris` is the French capital unless you live near Paris, Texas.
- Names are asked for in your Home Assistant language, then in your home country's, then in
  English. A home in Germany finds `Köln`, `Cologne` and `München` alike; one in the United States
  or France finds `Cologne`, not `Köln`.

:::

### Links

Web addresses in the description are links, and so are those in a location you cannot edit; each opens in a new tab. A link a calendar wrote into a description as HTML keeps its words. Only `http` and `https` addresses become links, and anything else stays text. A press on a link follows it, and does not start editing.

### Keyboard & Screen Readers

The popover is a modal dialog, named by the event's title. It opens with focus on that title, so no field starts editing until you choose one. A new event added with a mouse or the keyboard opens in its title field instead, ready for you to type; one added by touch or pen does not, so a phone raises no keyboard until you tap the title. Letters you type in the popover stay in it rather than reaching Home Assistant's keyboard shortcuts. Tab moves through its fields, links and buttons. The description's text stays readable text with working links, and an Edit button, shown once Tab reaches it, starts editing it. A question, such as which occurrences you mean, takes focus onto its choices, and Escape there goes back to editing; anywhere else Escape throws the changes away and closes the popover. A Close button, shown once Tab reaches it, saves as a press outside does. Once the popover closes, Home Assistant gives focus back to where it was.

### Changes Appear at Once

After a save or a delete the card fetches its events again straight away, and every other Calendar Card Pro card on the same page that shows the changed calendar refreshes too, rather than waiting for its next `refresh_interval`. A card showing only other calendars, such as a holiday feed, stays as it is. Cards that are not on the page load the changed calendar again when they next appear (see [Performance & Caching](/features/performance#loading-refreshing)).

## 🔗 Links in Events

A web address in an event's location or description, such as a video call or a booking page, can
be a link you tap. Set `open_links` to `true`, and every `http` or `https` address in a row
becomes one, opening in a new tab:

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.anna
show_description: true
open_links: true
```

- **Only where an event does nothing of its own.** Links are drawn while `event_tap_action` and
  `event_hold_action` are both `none`, their default, or one of the card's own actions, which on
  an event are nothing too. With either set to `details`, the links are in the
  [popover](#links) instead. In the visual editor, Open Links in Events sits under Event Hold
  Action, shown while both event actions are Nothing.
- **In list and column view.** Grid blocks draw no links; a grid card draws them only when it
  falls back to a list. See
  [Options That Do Nothing in Grid View](/features/grid-view#options-that-do-nothing-in-grid-view).
- **Apart from the card's actions.** A tap on a link follows it rather than running the card's
  `tap_action`, and a hold on it is the browser's, never `hold_action`, so a card that expands
  when tapped still expands from anywhere but its links.
- **Web addresses only.** Anything else stays text, and so does a location that is not a web
  address. A link a calendar wrote into a description as HTML, as Google Calendar does, keeps its
  words; where the calendar's [text replacement](/features/core-settings#text-replacement) or a
  [birthday marker](/features/event-content#birthday-ages-anniversary-counts) rewrote the
  description, only the addresses written out in it are links.

::: details Links From the Keyboard & Swipes
Keyboard users reach each link with Tab and follow it with Enter; a link that `location_max_lines`
or `description_max_lines` cut off shows its whole field while it has focus. A swipe can still
start on a link to [page through dates](/features/layout-appearance#paging-through-dates).
:::

## 👆 Custom Tap & Hold Actions

`tap_action` and `hold_action` run an action when the card is tapped or held: any standard Home Assistant action, such as going to another view or opening a web page, or one of the card's own.

```yaml
# Navigate to another view on tap
tap_action:
  action: navigate
  navigation_path: /lovelace/calendar

# Open a URL on long press
hold_action:
  action: url
  url_path: https://calendar.google.com
```

### Available Actions

Calendar Card Pro handles five actions itself — `expand`, `refresh`, `add-event`, `reset` and `back` — and forwards **everything else to Home Assistant's own action handler**. That means any action Home Assistant supports works here, including ones added after this page was written.

The commonly used ones:

| Action Type                       | Description                                                                  | Additional Parameters                                                                |
| --------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `expand`                          | Toggle between compact and full calendar view                                | None                                                                                 |
| `refresh`                         | Load the events again now                                                    | None                                                                                 |
| `add-event`                       | Add an event on the day you pressed                                          | None                                                                                 |
| `reset`                           | Undo this device's choices, as the reset button does                         | None                                                                                 |
| `back`                            | Go back to the page before this one, as Home Assistant's own back arrow does | `navigation_path` (optional, YAML only): where to go when no page is behind this one |
| `more-info`                       | Open the Home Assistant entity dialog                                        | `entity` (optional): which entity; see below                                         |
| `navigate`                        | Go to another Lovelace view                                                  | `navigation_path: /lovelace/view`                                                    |
| `url`                             | Open external URL or internal page                                           | `url_path: https://example.com`                                                      |
| `perform-action` / `call-service` | Call any Home Assistant action (service)                                     | `perform_action: domain.service`, `data`, `target`                                   |
| `toggle`                          | Toggle the target entity                                                     | None                                                                                 |
| `assist`                          | Open the Assist dialog                                                       | None                                                                                 |
| `fire-dom-event`                  | Fire a DOM event (used by browser_mod and others)                            | Any additional keys are passed through                                               |
| `none`                            | Disable the action                                                           | None                                                                                 |

::: tip Both Action Names Work
Home Assistant renamed `call-service` to `perform-action` in 2024.8. Both names still work; `perform-action` is preferred for new configurations. The same goes for its keys: the older `service` and `service_data` still work in place of `perform_action` and `data`.
:::

::: info Tap & Hold Act on the Whole Card
`tap_action` and `hold_action` belong to the card, not to the event under your finger. So `more-info` opens the dialog of the **first** calendar in `entities`, whichever event you tapped. Name the entity on the action to open a different one:

```yaml
tap_action:
  action: more-info
  entity: calendar.family
```

To act on the event you tapped instead, use [`event_tap_action`](#tapping-an-event): its `more-info` opens the calendar of that event, and its other actions can [use the event's title and times](#using-the-events-fields-in-an-action).
:::

::: tip The Editor Lists These; YAML Accepts More
The visual editor's Tap Action and Hold Action dropdowns offer `expand`, `refresh`, `add-event`, `reset` and `back` alongside Home Assistant's standard actions, and its Event Tap Action and Event Hold Action dropdowns offer `details` instead. An action Home Assistant adds in a future release may not appear there straight away; it still works if you write it in YAML, exactly as `fire-dom-event` always has.
:::

Because these are forwarded, the parameters are Home Assistant's own — see the [Home Assistant actions documentation](https://www.home-assistant.io/dashboards/actions/) for the full list.

::: details Ripple, Wash & Haptics

- A tap or hold on the card shows Home Assistant's own ripple, in the card's `accent_color`, or your theme's primary color where that is `home-assistant`.
- A tap on an event, or on a day that adds one, shows a wash over what you pressed instead, and the ripple stays still for the whole press, including the moment the popover opens. The wash is the same accent, unless events have a background tint under `event_background_opacity`; there it is a faint layer of the event's text color, which lightens or deepens the tint without changing its hue.
- Haptic feedback comes from Home Assistant, which adds it for some of the actions it runs, such as `toggle` and `perform-action`, on devices that support it; `expand`, `refresh`, `reset`, `back` and `details` have none.

:::

### Refreshing From a Tap or Hold

`refresh` loads the card's events again now, as the toolbar's
[refresh button](/features/layout-appearance#refreshing-the-events) does, rather than at the next
`refresh_interval`. On a wall tablet a hold is a good place for it, out of the way of everyday
taps:

```yaml
hold_action:
  action: refresh
```

It asks Home Assistant for every calendar on the card, even when the events it holds are recent.
The small spinner in the card's corner turns, then gives way to a green check for a moment, or a
red alert where a calendar could not be loaded; on a card that has the refresh button, the button
shows it instead. A second tap or hold does nothing until that is over.

### Adding an Event From a Tap or Hold

`add-event` opens a new event in the [event popover](#the-event-popover), as the
[add button](#add-event-button) does, and starts it on the day you pressed. On a wall tablet, a
hold is a good place for it:

```yaml
hold_action:
  action: add-event
```

A hold on an event starts it on the event's day, and one anywhere without a day, such as the
title, on the date the add button uses. Otherwise the day, the hour and the calendar follow
[the rules for tapping a day](#which-day-hour-calendar), the grid's quarter hour and all-day band
included. It needs a calendar that [accepts new events](#what-each-integration-allows).

To add with a tap on a day while a tap elsewhere on the card does something else, use
[`day_tap_action`](#tapping-a-day-to-add-an-event) instead.

### Resetting From a Tap or Hold

`reset` does what the toolbar's [reset button](/features/layout-appearance#resetting-the-card)
does: it brings back the days the card opens with, its configured `view` and every calendar,
collapses a compact card, and forgets the layout and calendars this device chose. It works with
or without the button, so a card shared on a wall tablet can keep its toolbar short and still be
put back with a hold:

```yaml
hold_action:
  action: reset
```

Where the card already shows how it is set up, it does nothing. It is an action only on a card
with something it could undo: a toolbar with the date navigation, the view switcher or the
calendar filter, or an `expand` action. On any other card, the card offers no tap or hold for it.
On a card that has the reset button, the button shows its check after a reset, as after a press.

### Going Back From a Tap or Hold

`back` goes back to the page you came from, as the arrow in Home Assistant's own header does. On
a view opened from another dashboard, a tap returns there:

```yaml
tap_action:
  action: back
```

It goes back only to a page Home Assistant itself opened this one from. Where there is none, as
in a new tab, a bookmark, the first page a wall tablet shows, or the Home Assistant app opened
straight on this view, it shows the first view of this dashboard instead, in place of the page
you are on. Give it a `navigation_path` to go somewhere else then:

```yaml
hold_action:
  action: back
  navigation_path: /lovelace/home
```

`back` never leaves Home Assistant and never goes back to its login page. The visual editor
offers it as Go Back; `navigation_path` is YAML only. A
[button of your own](/features/layout-appearance#your-own-buttons) in the toolbar can run it too.

::: details If Back Always Shows This Dashboard
The card tells a page Home Assistant opened from a new tab or a bookmark by a mark Home Assistant
sets, which is not a documented interface, so a future release could change it. If it does,
`back` always shows this dashboard rather than going back, and still never leaves Home Assistant.
:::

## 🔄 Expandable Calendar Card

A list card can open short and show more when tapped. With a
[`compact_events_to_show`](/features/core-settings#compact-mode-event-limits) limit, the card
shows that many events, and `tap_action: expand` lets users toggle between them and the full set:

```yaml
list:
  # Limit events in compact mode
  compact_events_to_show: 5

# Enable expand/collapse with tap
tap_action:
  action: expand
```

Nothing on the card marks that events were held back, so a compact card looks the same as one with nothing more to show.

::: warning List View Only
The whole compact family is inert while the card is rendering as column or grid —
`compact_events_to_show`, its per-calendar form, `compact_days_to_show`,
`compact_events_complete_days`, and the `expand` action that drives them. A side-by-side
card with `tap_action: expand` has nothing visible to change until the layout is a list.

Column density is controlled by [showing fewer columns instead](/features/column-view#showing-fewer-columns-instead), which trades columns for fit without dropping events. Grid density is controlled by [`time_grid` day-width options](/features/grid-view#fitting-narrow-cards) the same way — including the default `min_days_fallback: list`, which does switch a too-narrow grid card to the list layout, where compact caps and `expand` apply again.
:::

With both card-wide and per-calendar limits:

- In compact mode, both are enforced.
- In expanded mode, **every** compact limit is removed — the card-wide caps **and** each calendar's own `compact_events_to_show`. What remains is the ordinary `days_to_show` window.
- The expand/collapse state persists until manually toggled, the page is reloaded, or the toolbar's [reset button](/features/layout-appearance#resetting-the-card) is pressed.

```yaml
entities:
  - entity: calendar.family
    # No limit for family calendar
  - entity: calendar.work
    compact_events_to_show: 2
    # At most 2 work events while compact
  - entity: calendar.holidays
    compact_events_to_show: 1
    # At most 1 holiday event while compact
list:
  compact_events_to_show: 4
  # Show at most 4 events total in compact mode

tap_action:
  action: expand
```

In compact mode, you'll see at most 4 events total, with work showing at most 2 and holidays showing at most 1.
In expanded mode after tapping, those caps are all gone: every family, work and holiday event inside `days_to_show` is visible.

Tap, hold, day and event actions, `allow_event_edit`, `allow_event_delete` and `open_links` are listed under [Actions in the configuration reference](/reference/configuration#actions), and the add button under [Header](/reference/configuration#header).
