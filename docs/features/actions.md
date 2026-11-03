# Actions & Interactions

Calendar Card Pro is interactive: you can let users expand a compact card to reveal more events, bind your own tap and hold actions to the card — navigating to another view, calling a service, or opening a URL — and let a tap or a hold on an event open its details, where it can be edited or deleted. A button in the card's header adds new events, and so can a tap on a day or a hold anywhere on the card.

## 🔄 Expandable Calendar Card

One of Calendar Card Pro's most powerful features is the ability to toggle between compact and expanded mode:

```yaml
list:
  # Limit events in compact mode
  compact_events_to_show: 5

# Enable expand/collapse with tap
tap_action:
  action: expand
```

When a `compact_events_to_show` limit is set, the card displays that number of events initially. The `expand` action then allows users to toggle between this compact mode and the full set of events. Nothing on the card marks that events were held back, so a compact card looks the same as one with nothing more to show.

::: warning List View Only
The whole compact family is inert while the card is rendering as column or grid —
`compact_events_to_show`, its per-calendar form, `compact_days_to_show`,
`compact_events_complete_days`, and the `expand` action that drives them. A side-by-side
card with `tap_action: expand` has nothing visible to change until the layout is a list.

This is deliberate rather than an omission. Compact mode caps events **across the card**,
not per day, so a limit of three would fill the first day columns and leave every later one
empty — the layout would stop corresponding to consecutive days, which is the one thing a
side-by-side view has to get right.

Column density is controlled by [showing fewer columns instead](/features/column-view#showing-fewer-columns-instead), which trades columns for fit without dropping events. Grid density is controlled by [`time_grid` day-width options](/features/grid-view#fitting-narrow-cards) the same way — including the default `min_days_fallback: list`, which does switch a too-narrow grid card to the list layout, where compact caps and `expand` apply again.
:::

When using expansion with both global and per-calendar limits:

- In compact mode: Both global and per-calendar limits are enforced
- In expanded mode: **every** compact limit is removed — the card-wide caps **and** each calendar's own `compact_events_to_show`. What remains is the ordinary `days_to_show` window
- The expand/collapse state persists until manually toggled, the page is reloaded, or the toolbar's [reset button](/features/layout-appearance#resetting-the-card) is pressed

**Example scenario**: If you have a configuration like this:

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

## 👆 Custom Tap & Hold Actions

Calendar Card Pro supports all standard Home Assistant actions:

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

Calendar Card Pro handles four actions itself — `expand`, `refresh`, `add-event` and `reset` — and forwards **everything else to Home Assistant's own action handler**. That means any action Home Assistant supports works here, including ones added after this page was written.

The commonly used ones:

| Action Type                       | Description                                          | Additional Parameters                              |
| --------------------------------- | ---------------------------------------------------- | -------------------------------------------------- |
| `expand`                          | Toggle between compact and full calendar view        | None                                               |
| `refresh`                         | Load the events again now                            | None                                               |
| `add-event`                       | Add an event on the day you pressed                  | None                                               |
| `reset`                           | Undo this device's choices, as the reset button does | None                                               |
| `more-info`                       | Open the Home Assistant entity dialog                | `entity` (optional): which entity; see below       |
| `navigate`                        | Go to another Lovelace view                          | `navigation_path: /lovelace/view`                  |
| `url`                             | Open external URL or internal page                   | `url_path: https://example.com`                    |
| `perform-action` / `call-service` | Call any Home Assistant action (service)             | `perform_action: domain.service`, `data`, `target` |
| `toggle`                          | Toggle the target entity                             | None                                               |
| `assist`                          | Open the Assist dialog                               | None                                               |
| `fire-dom-event`                  | Fire a DOM event (used by browser_mod and others)    | Any additional keys are passed through             |
| `none`                            | Disable the action                                   | None                                               |

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

To open the event you tapped instead, use [`event_tap_action`](#tapping-an-event).
:::

::: tip The Editor Lists These; YAML Accepts More
The visual editor's Tap Action and Hold Action dropdowns offer `expand`, `refresh`, `add-event` and `reset` alongside Home Assistant's standard actions. Home Assistant builds that dropdown from a single list rather than merging one, so naming the card's own means naming the rest — which is why an action Home Assistant adds in a future release may not appear there straight away. It still works if you write it in YAML, exactly as `fire-dom-event` always has.
:::

Because these are forwarded, the parameters are Home Assistant's own — see the [Home Assistant actions documentation](https://www.home-assistant.io/dashboards/actions/) for the full list.

A tap or hold on the card shows Home Assistant's own ripple, in the card's `accent_color`, or your theme's primary color where that is `home-assistant`. A tap on an event shows a wash over that event instead, so you can see which one you pressed, and the ripple stays still. The wash is the same accent, unless events have a background tint under `event_background_opacity`; there it is a faint layer of the event's text color, which lightens or deepens the tint without changing its hue. Haptic feedback comes from Home Assistant, which adds it for some of the actions it runs, such as `toggle` and `perform-action`, on devices that support it; `expand`, `refresh`, `reset` and `details` have none.

### Refreshing From a Tap or Hold

`refresh` loads the card's events again now, as the toolbar's
[refresh button](/features/layout-appearance#refreshing-the-events) does, rather than at the next
`refresh_interval`. On a wall tablet a hold is a good place for it, out of the way of everyday
taps:

```yaml
hold_action:
  action: refresh
```

It asks Home Assistant for every calendar on the card, even when the events it holds are recent,
and shows that it did as the button does: the small spinner in the card's corner turns for at
least one full turn, then gives way to a green check for a moment, or a red alert where a calendar
could not be loaded. On a card that has the refresh button, the button shows it instead. A second
tap or hold does nothing until that is over. Unlike the toolbar's controls it is not paused while
you edit the card, any more than the card's other actions are.

### Adding an Event From a Tap or Hold

`add-event` opens Home Assistant's new-event dialog, as the [add button](#add-event-button) does,
and starts the new event on the day you pressed. On a wall tablet, a hold is a good place for it:

```yaml
hold_action:
  action: add-event
```

A hold on a day starts the event on that day, and one on an event starts it on the event's day; in
[grid view](/features/grid-view) it starts at the hour under your finger. Anywhere without a day,
such as the title, it starts on the date the add button uses. The day, the hour and the calendar
it opens with follow [the rules for tapping a day](#which-day-hour-calendar). It needs a calendar
that [accepts new events](#what-each-integration-allows); on a card with none, and while you edit
the card, it does nothing, and the card offers no hold or tap for it.

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
calendar filter, or an `expand` action. On any other card, and while you edit the card, the card
offers no tap or hold for it. On a card that has the reset button, the button shows its check
after a reset, as after a press.

## 🗒️ Tapping an Event

A tap on an event can open that event instead of acting on the whole card. Set `event_tap_action` to `details` and a tap opens the event in Home Assistant's own event dialog, the one the Calendar panel shows, with its full description, its location and, for a repeating event, how it repeats:

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.anna
  - calendar.holidays
event_tap_action:
  action: details
```

`details` is the one thing a tap on an event does. Left at `none`, the default, events are not tap targets, and a tap on one is a tap on the card that runs `tap_action`. Any other value, such as `more-info` or `expand`, reads as `none`. The visual editor's Event Tap Action dropdown offers the same two choices: Nothing and Show Event Details.

### Event Details

The dialog shows the whole event, whichever part of it you tapped: a multi-day event the card draws across several days opens with its real start and end. Where the event's calendar allows it, the dialog also offers **Edit** and **Delete**; [Editing & Deleting Events](#editing-deleting-events) covers when it does.

::: warning The Dialog Shows the Event as Stored
The card's display options do not reach the dialog. A title you rewrote with [text replacement](/features/core-settings#text-replacement), a location or description you hid, or a [birthday age](/features/event-content#birthday-ages-anniversary-counts) the card appended appears in the dialog the way the calendar stores it. Leave `details` off a card whose replacements exist to keep something private.
:::

### Where You Can Tap

With `details` set, every event is a tap target, in all three layouts: a list row, a column event, and a grid block or all-day banner. In list view the whole colored block answers, not only its text.

Two things on the card are not events, so a tap on them is a tap on the card: the "No events" line of an empty day, and a grid `+N` block, which stands for several events. [Raise `max_simultaneous_events`](/features/grid-view#how-many-fit-side-by-side) to tap those one by one.

Keyboard users reach each event with Tab and open it with Enter or Space, and screen readers announce each event as a button, described by its day, so two events with the same title on different days can be told apart.

::: tip A Tap on an Event Is Not a Tap on the Card
With `event_tap_action: details`, tapping an event opens it and does **not** run the card's `tap_action`, which still runs for a tap anywhere else on the card, such as the title or a day's date, though never for one on a [header toolbar](/features/layout-appearance#header-toolbar) control: the space between the toolbar's controls is the card's. A hold is the card's: holding an event runs `hold_action`, exactly as holding anywhere else does, unless you [give events a hold of their own](#holding-an-event). In list view events fill most of the card, so if you also use `tap_action: expand`, tap a day's date or the card title to expand it.
:::

::: info The Card Stays on the Keyboard
A button cannot hold other buttons, so while its events are buttons the card stops announcing itself as one. It keeps its place in the Tab order, though: with the card itself focused, Enter or Space runs its `tap_action`, so a card whose `tap_action` is `expand` still expands from the keyboard. The same holds while the [header toolbar](/features/layout-appearance#header-toolbar) is shown. A card with no event to tap, such as one showing only "No events", stays a button as before.
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

`details` is the one thing a hold on an event does; left at `none`, the default, a hold on an
event is a hold on the card and runs `hold_action`. With the two together, an event answers a
tap with `event_tap_action` and a hold with `event_hold_action`. The visual editor's Event Hold
Action dropdown offers Nothing and Show Event Details.

An event that has either is a button for keyboard users and screen readers. The keyboard has no
hold, so Enter or Space on an event opens its details whichever of the two it has.

## ✏️ Editing & Deleting Events

The event dialog can change an event as well as show it. **Edit** opens the same form the Calendar panel uses, and **Delete** removes the event; for a repeating event, Home Assistant asks which occurrences you mean. Once the change is saved the card fetches its events again, so it appears straight away.

### What Each Integration Allows

Whether a calendar offers Edit, Delete or new events at all is decided by the integration it comes from, not by the card. For the calendar integrations that ship with Home Assistant:

| Integration                                            | Add | Edit | Delete |
| ------------------------------------------------------ | --- | ---- | ------ |
| Local Calendar                                         | Yes | Yes  | Yes    |
| Google Calendar                                        | Yes | No   | Yes    |
| CalDAV                                                 | Yes | No   | No     |
| Read-only calendars, such as a subscribed holiday feed | No  | No   | No     |

A Local Calendar can also edit or delete a repeating event from one occurrence onward. A Google calendar added to Home Assistant as read-only offers nothing, and calendars from custom integrations offer whatever their integration declares. The Add column decides which calendars the [add-event button](#add-event-button) can write to.

### Narrowing What the Dialog Offers

`allow_event_edit` and `allow_event_delete` take Edit or Delete away on one card, for a dashboard where events should be read but not changed, such as a wall tablet in the hall. Both are on by default, and neither can offer a button the integration does not:

```yaml
event_tap_action:
  action: details
allow_event_edit: false
allow_event_delete: false
```

The visual editor shows the two switches only while Event Tap Action or Event Hold Action is Show Event Details, because with Nothing for both there is no dialog for them to narrow.

### When the Card Leaves Them Out

The details still open, but the card withholds Edit and Delete where using them would go wrong, whatever the two options say:

- **A row merged by [`filter_duplicates`](/features/core-settings#filtering-duplicate-events).** The event exists in more than one calendar, so editing one copy is ambiguous, and deleting one brings the row straight back from the other.
- **An event from a calendar that is [failing to load](/features/performance#when-a-calendar-fails-to-load).** The card is drawing it from its cache, which can be up to a day old, and saving an edit would write those old values over the calendar's current ones.
- **An event without an identifier.** Home Assistant finds the event to change by its unique ID, and some calendars do not send one.
- **Edit only, an event its calendar stores without an end.** The dialog shows it ending where it starts, and saving the form would write that end into the calendar.

## ➕ Add Event Button

The card can carry a button for adding events, so a new appointment goes in from the dashboard rather than from the Calendar panel. It opens Home Assistant's own new-event dialog, the same one the Calendar panel and Home Assistant's calendar card use:

```yaml
type: custom:calendar-card-pro
title: Family
entities:
  - calendar.anna
  - calendar.holidays
toolbar:
  show: true
```

The button is a control of the card's [header toolbar](/features/layout-appearance#header-toolbar), at the start of its top row, after the calendar filter. It is a plus icon at every width, with Home Assistant's own "Add event" as its tooltip and its name for screen readers. Where Home Assistant has no words for it, screen readers hear it in English and it shows no tooltip.

The dialog opens with the first calendar in `entities` that accepts new events preselected, `calendar.anna` above, passing over any the [calendar filter](/features/layout-appearance#showing-hiding-calendars) is hiding, so hiding a calendar never opens a new event in it. If the filter hides every calendar that accepts new events, the first of them is preselected anyway. Its calendar picker is Home Assistant's own, though, so it offers every calendar in Home Assistant that accepts new events, not only this card's, and the event is saved to whichever you pick. The new event is set for today when the days the card covers include today, and for the first of them otherwise, so a card looking at next week, or paged to it, does not suggest today. Those days are the page on screen, whether or not the card draws a row for today: a collapsed compact card that shows only the days before it, or an empty today that `show_empty_days: false` leaves out, still suggests today, the day an event is most often added for.

The button only appears when the card has somewhere to write: at least one of its calendars must [accept new events](#what-each-integration-allows) and not be failing to load. A card showing only read-only calendars draws no add button even with the toolbar shown. A calendar that is [failing to load](/features/performance#when-a-calendar-fails-to-load) is never preselected, and if it is the card's only writable calendar the button returns once it loads again.

::: tip Pressing the Button Is Not a Tap on the Card
The button does not trigger the card's `tap_action` or `hold_action`, so it can sit on a card that expands or navigates when tapped. Keyboard users keep the card's own `tap_action` too: Tab to the card itself and press Enter, as [beside tappable events](#where-you-can-tap).
:::

::: warning Hidden With the Card
`hide_when_empty` still hides the whole card when there is nothing to show on the days it opens with, button included. Leave it off on a card you rely on for adding events.
:::

## 📆 Tapping a Day to Add an Event

A tap on a day can add an event on it. Set `day_tap_action` to `add-event`, and a tap on a day
where it shows no event opens Home Assistant's new-event dialog for that day:

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

### Where You Can Tap a Day

Wherever a day shows no event, in all three layouts:

- **List view:** the day's date, its "No events" line, and the space between its events.
- **Column view:** the day's header, and the empty space under its events.
- **[Grid view](/features/grid-view):** any empty point of the time grid, which adds at that
  hour; the day's header; and the empty part of the all-day band above it.

A tap on an event never adds: an event covers the day beneath it, so the tap is the event's
when it has an `event_tap_action`, and the card's otherwise. The same goes for a grid's `+N`
block, which stands for several events. Week numbers, the separators between days, the grid's time axis, the
title and the [header toolbar](/features/layout-appearance#header-toolbar) are not days either:
a tap on the title still runs `tap_action`, and the toolbar's controls keep their own.

A tap has to stay put. A press that moves is a scroll, or a [swipe](/features/layout-appearance#paging-through-dates),
and adds nothing; a hold on a day runs `hold_action`. While you press, the day's date or header
is washed in the card's accent, and in the grid the hour you are about to add at.

### Which Day, Hour & Calendar

The new event starts on the day you tapped, at the hour it is now: a tap on today opens at the
current hour, as the add button does, and a tap on another day at the same hour that day. In
grid view a tap in the time grid opens at the hour you tapped instead, rounded down: Home
Assistant's dialog always starts a new event on the hour and makes it one hour long, so a grid
with `slot_minutes: 30` still opens at the hour. The dialog cannot start an all-day event either,
so a tap in the all-day band opens at the current hour too; switch on All Day in the dialog.

The calendar is the one [the add button](#add-event-button) would preselect: the first in
`entities` that accepts new events and that the calendar filter shows.

### From the Keyboard

While `day_tap_action` adds events, each day's date in list view, and each day's header in column
and grid view, is a button named with Home Assistant's own "Add event" and described by its
date. Tab to it and press Enter or Space to add on that day, at the hour it is now.

::: tip It Needs Somewhere to Write
Like the add button, a tap on a day only adds where one of the card's calendars [accepts new
events](#what-each-integration-allows) and is not failing to load. On a card showing only
read-only calendars, a tap on a day stays a tap on the card.
:::

## 🧩 Home Assistant's Own Dialogs

The event dialog and the new-event dialog are Home Assistant's own rather than copies of them: the forms, the validation, the repeat rules and the saving all stay Home Assistant's, and the card only decides what to open them with. Three things follow from that.

- **Their words are Home Assistant's.** The button's label and everything in the dialogs follow the language of your Home Assistant profile, not the card's `language` option.
- **Changes appear at once.** After a save in either dialog the card fetches its events again straight away, and every other Calendar Card Pro card on the same page that shows the changed calendar refreshes too, rather than waiting for its next `refresh_interval`. A new event could have gone to any calendar that accepts new events, so after one every card showing such a calendar refreshes, and a card showing only read-only calendars, such as a holiday feed, stays as it is. Cards that are not on the page load the changed calendar again when they next appear (see [Performance & Caching](/features/performance#loading-refreshing)).
- **They are loaded when first needed.** Home Assistant offers custom cards no public way to open its calendar dialogs, so the first time one is needed the card loads it through Home Assistant's own calendar code. That can take a moment, so while it loads a soft circle pulses where you pressed, or on the button you pressed from the keyboard; it stays still when your device asks for less motion. Once a dialog has opened, it opens at once.

::: info When a Dialog Cannot Be Loaded
A future Home Assistant release may change the calendar code the card loads its dialogs through. If loading fails, or has not finished after ten seconds, the card falls back rather than doing nothing: a tap that should show an event's details opens its calendar's more-info dialog instead, and the add button opens the Calendar panel, which has an add button of its own.
:::

::: tip Nothing Opens While You Edit
In the card editor's preview, and on a dashboard in edit mode, the add button is still drawn, so you see the layout the card will have, but pressing it opens nothing, events are not tap targets, and a tap on a day adds nothing. Trying out a configuration or arranging a dashboard cannot open a dialog that saves a real event. The card's own `tap_action` and `hold_action` behave there as they always have, except `add-event`, which does nothing there.
:::

Card taps are set with `tap_action` and `hold_action`, day taps with `day_tap_action`, and event taps and holds with `event_tap_action`, `event_hold_action`, `allow_event_edit` and `allow_event_delete` — see [Actions in the configuration reference](/reference/configuration#actions). The button is `toolbar → add_event`, under [Header](/reference/configuration#header).
