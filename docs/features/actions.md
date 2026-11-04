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

To act on the event you tapped instead, use [`event_tap_action`](#tapping-an-event): its `more-info` opens the calendar of that event, and its other actions can [use the event's title and times](#using-the-events-fields-in-an-action).
:::

::: tip The Editor Lists These; YAML Accepts More
The visual editor's Tap Action and Hold Action dropdowns offer `expand`, `refresh`, `add-event` and `reset` alongside Home Assistant's standard actions, and its Event Tap Action and Event Hold Action dropdowns offer `details` instead. Home Assistant builds that dropdown from a single list rather than merging one, so naming the card's own means naming the rest — which is why an action Home Assistant adds in a future release may not appear there straight away. It still works if you write it in YAML, exactly as `fire-dom-event` always has.
:::

Because these are forwarded, the parameters are Home Assistant's own — see the [Home Assistant actions documentation](https://www.home-assistant.io/dashboards/actions/) for the full list.

A tap or hold on the card shows Home Assistant's own ripple, in the card's `accent_color`, or your theme's primary color where that is `home-assistant`. A tap on an event, or on a day that adds one, shows a wash over what you pressed instead, and the ripple stays still for the whole press, including the moment the popover opens. The wash is the same accent, unless events have a background tint under `event_background_opacity`; there it is a faint layer of the event's text color, which lightens or deepens the tint without changing its hue. Haptic feedback comes from Home Assistant, which adds it for some of the actions it runs, such as `toggle` and `perform-action`, on devices that support it; `expand`, `refresh`, `reset` and `details` have none.

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

`add-event` opens a new event in the [event popover](#the-event-popover), as the
[add button](#add-event-button) does, and starts it on the day you pressed. On a wall tablet, a
hold is a good place for it:

```yaml
hold_action:
  action: add-event
```

A hold on a day starts the event on that day, and one on an event starts it on the event's day; in
[grid view](/features/grid-view) it starts at the quarter hour under your finger, and one in the
all-day band adds an all-day event. Anywhere without a day,
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

A tap on an event can act on that event instead of on the whole card. Set `event_tap_action` to `details` and a tap opens the event in the card's [event popover](#the-event-popover), right beside it, with its times, its location, its full description and, for a repeating event, how it repeats:

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.anna
  - calendar.holidays
event_tap_action:
  action: details
```

`event_tap_action` also takes Home Assistant's own actions, which can [use the tapped event's fields](#using-the-events-fields-in-an-action), such as a `url` built from its title. Left at `none`, the default, events are not tap targets, and a tap on one is a tap on the card that runs `tap_action`. The card's own actions, `expand`, `refresh`, `add-event` and `reset`, act on the whole card, so on an event they read as `none` too. The visual editor's Event Tap Action dropdown offers Show Event Details and Home Assistant's actions.

### Event Details

The popover shows the whole event, whichever part of it you tapped: a multi-day event the card draws across several days opens with its real start and end. Where the event's calendar allows it, you can also change the event right there and delete it; [Editing & Deleting Events](#editing-deleting-events) covers how, and when.

The title, location and description read as they do on the card, with the calendar's [text replacement](/features/core-settings#text-replacement) applied, so a title you masked or reworded stays that way. A [birthday age](/features/event-content#birthday-ages-anniversary-counts) the card appends is not part of the title there.

::: warning What the Popover Reveals
Two things go further than the card itself:

- **The location and the description always show**, even where the card hides them with `show_location: false` or `show_description: false`, and in grid view, which leaves locations off its blocks.
- **Editing a field shows it as the calendar stores it**, because that is what a save writes. Tap into a masked title and the real one appears.

On a card whose replacements exist to keep something private, set `allow_event_edit: false`. Where a hidden location or description must stay hidden too, leave `details` off that card.
:::

### Where You Can Tap

With an event tap action set, every event is a tap target, in all three layouts: a list row, a column event, and a grid block or all-day banner. In list view the whole colored block answers, not only its text.

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

A link a calendar wrote into a description as HTML, as Google Calendar does, keeps its words.
Where the calendar's [text replacement](/features/core-settings#text-replacement) or a
[birthday marker](/features/event-content#birthday-ages-anniversary-counts) rewrote the description, only the
addresses written out in it are links. Only `http` and `https` addresses become links; anything
else stays text, and so does a location that is not a web address.

Links are drawn only where an event does nothing of its own, so a press on a link can never also
be a press on its event: `event_tap_action` and `event_hold_action` both `none`, their default,
or one of the card's own actions, which on an event are nothing too. With either set to
`details`, the links are in the [popover](#links) instead. A tap on a link follows it and does
not run the card's `tap_action`, and a hold on it is the browser's, never `hold_action`, so a card
that expands when tapped still expands from anywhere but its links. A swipe can still start on
one to [page through dates](/features/layout-appearance#paging-through-dates). Keyboard users
reach each link with Tab and follow it with Enter; a link that `location_max_lines` or
`description_max_lines` cut off shows its whole field while it has focus.

Links are drawn in list and column view, and in grid view when the card falls back to a list. A
grid block draws its words for the eye only, so it draws no links; see
[Options That Do Nothing in Grid View](/features/grid-view#options-that-do-nothing-in-grid-view).
In the visual editor, Open Links in Events sits under Event Hold Action, shown while both event
actions are Nothing.

## ✏️ Editing & Deleting Events

Where the event's calendar allows it, the popover is where you change the event, too. There is no Edit button: each part of the event is edited where it is shown, and the change is saved when the popover closes.

- **Title & location.** Tap either one to type.
- **Date & time.** Tap the date line to open the start and the end, All day and Repeat. Moving the start moves the end with it, so the event keeps its length.
- **Description.** Tap it to edit it. A tap on a link in it follows the link instead.
- **Calendar.** Tap it to [move the event to another calendar](#moving-to-another-calendar).

Repeat offers what Home Assistant's own event editor offers: daily, weekly on the weekdays you pick, monthly on a day of the month or on an nth or last weekday, and yearly, ending never, after a number of occurrences, or on a date. A repeat rule outside that set, which another calendar app may have written, is shown as written and kept unless you pick another.

### Saving & Discarding

The popover saves once, when it closes: with a press outside it, or with Back. Once you have changed something, **Cancel** and **Save** appear at the bottom right, so you can also confirm or throw away the change where you would look for it: **Save** does what closing does, Return in the title does the same, and **Cancel**, or Escape on a keyboard, throws every change away. A part you only looked at, or tapped into without changing, writes nothing. While Home Assistant is saving, the popover takes no input and stays open, and it closes by itself once the change is saved. Moving a repeating event to another day moves its repeat with it, so a weekly event on its own weekday, or a monthly one on its own date or weekday, stays on the day you moved it to. Once Home Assistant has saved the change the card fetches its events again, so it appears straight away.

For one occurrence of a repeating event, closing asks once whether the change covers **This and all future events** or **Only this event**, and **Cancel** goes back to editing. As in Home Assistant's own editor, a change to how the event repeats takes effect only for This and all future events.

If Home Assistant refuses the change, because the title is empty, the times do not make a valid event, such as an end before the start, or the calendar reports an error of its own, the popover stays open and says why. Nothing you changed is lost.

### Moving to Another Calendar

Tap the calendar to pick another, and the event moves there when the popover closes. The picker offers this card's other calendars that [accept new events](#what-each-integration-allows). Home Assistant has no command that moves an event, so the card adds it to the new calendar and then deletes it from its own, which is why moving needs a calendar that allows deleting, and both [`allow_event_edit` and `allow_event_delete`](#narrowing-what-the-popover-offers) left on. Anything else you changed moves with it.

A repeating event asks which occurrences you mean. **Only this event** moves that occurrence alone, as a single event. **This and all future events** moves the series from that occurrence on. It is offered only where the series can move whole: not for a series that ends after a number of occurrences, whose count would start again in the new calendar, so set its end to a date first, in the same popover; and not for an occurrence you changed on its own, which no longer carries its series' repeat.

Only what the popover shows moves: the title, times, location, description and repeat. Anything else a calendar keeps about an event, such as a tentative status, guests or reminders, stays behind with the copy that is deleted.

::: warning Moving a Series Brings Back What You Changed in It
Home Assistant cannot carry an occurrence you deleted from a series, or one you changed on its own, over to another calendar. Moving the series brings each of them back in the new calendar as a plain occurrence, on its usual day and with the series' title and times. Delete or change them again there.
:::

The card adds before it deletes, so a failure between the two leaves the event in both calendars rather than in neither. The popover then says why, and offers nothing more to save.

### Deleting

Where the calendar allows deleting, **Delete** sits at the bottom of the popover. It asks you to confirm, and for a repeating event whether you mean **Only this event** or **This and all future events**; **Cancel** keeps the event.

### What Each Integration Allows

Whether a calendar's events can be changed, deleted or added at all is decided by the integration it comes from, not by the card. The popover saves through Home Assistant's own calendar commands, the ones its Calendar panel uses, and offers only what the calendar declares. For the calendar integrations that ship with Home Assistant:

| Integration                                            | Add | Edit | Delete |
| ------------------------------------------------------ | --- | ---- | ------ |
| Local Calendar                                         | Yes | Yes  | Yes    |
| Google Calendar                                        | Yes | No   | Yes    |
| CalDAV                                                 | Yes | No   | No     |
| Read-only calendars, such as a subscribed holiday feed | No  | No   | No     |

A Local Calendar can also edit or delete a repeating event from one occurrence onward. A Google calendar added to Home Assistant as read-only offers nothing, and calendars from custom integrations offer whatever their integration declares. The Add column decides which calendars the [add-event button](#add-event-button) can write to.

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

## ➕ Add Event Button

The card can carry a button for adding events, so a new appointment goes in from the dashboard rather than from the Calendar panel. It opens the [event popover](#the-event-popover) on a new, empty event, with the cursor in its title:

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

Type a title and press **Add**, or Return, or close the popover with a press outside it or with Back, and the event is added. Close it untouched, press **Cancel**, or press Escape, and nothing is added. A new event you changed but gave no title stays open and asks for one, so a date or calendar you picked is not lost on the way out. Before closing you can change anything a saved event lets you change, the times, All day and Repeat included; see [Editing & Deleting Events](#editing-deleting-events).

The popover's calendar is a picker offering this card's calendars that accept new events, and only those. It starts on the first of them in `entities`, `calendar.anna` above, passing over any the [calendar filter](/features/layout-appearance#showing-hiding-calendars) is hiding, so hiding a calendar never opens a new event in it. If the filter hides every calendar that accepts new events, the first of them is chosen anyway. On a card with only one such calendar, the popover names it.

The new event starts on the hour and lasts an hour: today, at the current hour, when the days the card covers include today, and otherwise at the start of the first of them, so a card looking at next week, or paged to it, does not suggest today. Those days are the page on screen, whether or not the card draws a row for today: a collapsed compact card that shows only the days before it, or an empty today that `show_empty_days: false` leaves out, still suggests today, the day an event is most often added for.

The button only appears when the card has somewhere to write: at least one of its calendars must [accept new events](#what-each-integration-allows) and not be failing to load. A card showing only read-only calendars draws no add button even with the toolbar shown. A calendar that is [failing to load](/features/performance#when-a-calendar-fails-to-load) is never preselected, and if it is the card's only writable calendar the button returns once it loads again.

::: tip Pressing the Button Is Not a Tap on the Card
The button does not trigger the card's `tap_action` or `hold_action`, so it can sit on a card that expands or navigates when tapped. Keyboard users keep the card's own `tap_action` too: Tab to the card itself and press Enter, as [beside tappable events](#where-you-can-tap).
:::

::: warning Hidden With the Card
`hide_when_empty` still hides the whole card when there is nothing to show on the days it opens with, button included. Leave it off on a card you rely on for adding events.
:::

## 📆 Tapping a Day to Add an Event

A tap on a day can add an event on it. Set `day_tap_action` to `add-event`, and a tap on a day
where it shows no event opens a new event on that day in the [event popover](#the-event-popover):

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
  quarter hour; the day's header; and the empty part of the all-day band above it, which adds an
  all-day event. In the grid you can also [draw the event](#drawing-an-event-in-grid-view).

A tap on an event never adds: an event covers the day beneath it, so the tap is the event's
when it has an `event_tap_action`, and the card's otherwise. The same goes for a grid's `+N`
block, which stands for several events. Week numbers, the separators between days, the grid's time axis, the
title and the [header toolbar](/features/layout-appearance#header-toolbar) are not days either:
a tap on the title still runs `tap_action`, and the toolbar's controls keep their own.

A tap has to stay put. A press that moves is a scroll, or a [swipe](/features/layout-appearance#paging-through-dates),
and adds nothing; a hold on a day runs `hold_action`, except in a grid's time area and all-day
band, where it [draws a new event](#drawing-an-event-in-grid-view). While you press, the day's
date or header is washed in the card's accent, and in the grid the hour a tap there adds.

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

In [grid view](/features/grid-view), `day_tap_action: add-event` also lets you draw a new event
with its start and end, as in a calendar app. There is no option of its own.

- **On a phone or tablet,** hold an empty spot of the time grid for half a second, until a block
  appears there, then drag. The page does not scroll while you do.
- **With a mouse,** press and drag at once.

The block starts as what a tap there adds, an hour from the quarter hour under your finger.
Drag down and its end follows you; drag up and its start does; drag sideways into another day
and it runs across days, in quarter hours either way. It is drawn as the event will be once
saved, titled New event, in the calendar the popover will offer: the same colors, accent bar,
text and time as that calendar's events, set by the same options. Let go, and the popover opens beside it
on a new event with those times, ready for a title. Press Escape, or touch the screen with a
second finger, to throw the block away; it also goes if the card turns to other days while you
draw.

The block stays while the popover is open, as a new event does in a calendar app: it takes the
title as you type it, moves when you change the times, and takes on the calendar you pick. Cancel or Escape takes it away. Once the event is saved, it stays until the card shows
the real one, a moment later. A tap in the grid shows the hour it adds the same way.

In the all-day band, a hold or a drag draws all-day days instead: drag sideways for an event
over several days. It shows as a banner across those days, as the event's will be, titled New
event, beside the all-day events or in a row of its own below them, and stays while the popover is open as a timed one
does. The band is there whenever the days shown hold an all-day event.

A hold on an empty spot of the grid draws even where the card has a `hold_action`; a hold
anywhere else, on an event included, still runs it. Nothing is drawn while the card is edited.

### From the Keyboard

While `day_tap_action` adds events, each day's date in list view, and each day's header in column
and grid view, is a button named with Home Assistant's own "Add event" and described by its
date. Tab to it and press Enter or Space to add on that day, at the hour it is now.

::: tip It Needs Somewhere to Write
Like the add button, a tap on a day only adds where one of the card's calendars [accepts new
events](#what-each-integration-allows) and is not failing to load. On a card showing only
read-only calendars, a tap on a day stays a tap on the card.
:::

## 💬 The Event Popover

An event's details and a new event both open in the card's own popover, modeled on the event popover of Calendar on macOS. On a wide screen it opens beside the event you pressed, as Calendar on macOS does, with its arrow pointing at it, to the right where there is room and to the left otherwise: beside the edge of an event drawn as a tinted box, such as a grid block or any event under `event_background_opacity`, and beside the end of the text of one drawn without, so a list row stretching across a wide card does not send it to the far edge. A tap on a day, or on an empty slot of the grid, opens it right where you tapped. The add button opens it below the button, with the arrow on top. On a screen narrower than 600 pixels it rises from the bottom as a sheet. As in Calendar on macOS, it grows out of its arrow while it fades in, and closes the same way in reverse, shrinking back toward the arrow as it fades out; a sheet rises as it opens and sinks as it closes. With reduced motion turned on in your system it simply appears and disappears. It is light or dark as your Home Assistant theme is, and it shows:

- the title, beside a bar in the color of the event's calendar;
- the date and the times, or All day, and for a repeating event how it repeats, in words;
- the location, with a [map or a pin](#maps-locations);
- the calendar's name, with its color: its [`name`](/features/core-settings#naming-a-calendar-in-the-card) on the card where it has one, else Home Assistant's, and the same for each calendar it can move to;
- the description, with its web addresses as [links](#links).

The popover is part of the card's own file, so nothing is loaded when it opens.

### Words & Language

Every word in the popover is Home Assistant's own, from its calendar translations, so the popover follows the language of your Home Assistant profile rather than the card's `language` option, as the add button's tooltip does. Dates and weekday names follow that language too, and times follow the card's 12- or 24-hour format, `time_24h`.

### Maps & Locations

When an event you open has a location the card can place, the popover draws a small map under it, with a marker on the spot. Every map is the same OpenStreetMap map; what differs is only how the card finds the spot. Pressing the map opens a Google Maps search for the location. A location the card cannot place gets a small pin beside it instead, which opens the same search. The card places a location in one of two ways.

- **A zone.** When the location is the name of one of your Home Assistant zones, the map shows the zone. A location matches a zone by the zone's name, or by the name in its entity ID with underscores read as spaces, ignoring case and spacing: `Swim Club` finds a zone named Swim Club, or one whose entity ID is `zone.swim_club`. Nothing leaves your home to find it. The map shows the whole zone: it zooms out until the zone's circle, its radius in Home Assistant, spans the map's width, so a zone drawn around a city shows the city and one drawn around a house shows its street.
- **A town or a city.** A short place name, such as `Rosenheim`, `Paris` or `Springfield, Illinois`, is looked up in [Open-Meteo](https://open-meteo.com)'s free geocoding service, which needs no account or key.

Only a name of two to 60 characters, with at most four words and one comma for its country or region, is looked up. Anything with a digit, `@`, `/` or `:` in it is never sent, so a street address, a house number, a postal code, an email address or a web address stays in your home and gets the pin.

The lookup is strict, because a wrong map is worse than none, and many ordinary words are the names of tiny places somewhere: `School`, `Park` and `Beach` all are. So only a town or a city whose name is exactly the one written counts, accents aside, never a district, a park or a mountain. A town in your home's country, within 100 km of your home, or in the country or region the location names after its comma needs 5,000 people. One anywhere else needs a million, or 100,000 for a capital. Where several places pass, one within 100 km of home comes first, else the one Open-Meteo ranks first, usually the largest. Your home's country and position are the ones set in Home Assistant. `Paris` therefore finds the French capital unless you live near Paris, Texas, and a smaller town far away needs its country: `Salzburg, Austria`. Names are asked for in your Home Assistant language, then in your home country's, then in English, until one finds the place. A home in Germany therefore finds `Köln`, `Cologne` and `München` alike; a home elsewhere finds a place by its name in one of those languages, so `Cologne` from the United States or France, not `Köln`.

Your browser sends the name straight to Open-Meteo, which sees your public IP address with it; Open-Meteo states that it deletes those addresses after 90 days. Each name is looked up once and kept in your browser for 30 days, a name that found nothing for 7, so opening the same event again sends nothing. The lookup runs only when you open an event in the popover, and never for a calendar that keeps its locations out of it; event rows, the card editor and typing a location never send anything. If the lookup fails, the popover shows the pin, as it would without one.

The map is drawn from Home Assistant's own map tile proxy, which fetches the OpenStreetMap tiles itself, so your browser asks no map server for them. That proxy arrived in Home Assistant 2026.10, so on an older version the popover shows the pin instead. The map credits © OpenStreetMap, and Open-Meteo when it found the place, each with a link, as their licenses ask. There is no option for the map; it is there whenever a location can be placed.

### Links

Web addresses in the description are links, and so are those in a location you cannot edit; each opens in a new tab. A link a calendar wrote into a description as HTML keeps its words. Only `http` and `https` addresses become links, and anything else stays text. A press on a link follows it, and does not start editing.

### Keyboard & Screen Readers

The popover is a modal dialog, named by the event's title. It opens with focus on that title, so no field starts editing until you choose one. A new event added with a mouse or the keyboard opens in its title field instead, ready for you to type; one added by touch or pen does not, so a phone raises no keyboard until you tap the title. Letters you type in the popover stay in it rather than reaching Home Assistant's keyboard shortcuts. Tab moves through its fields, links and buttons. The description's text stays readable text with working links, and an Edit button, shown once Tab reaches it, starts editing it. A question, such as which occurrences you mean, takes focus onto its choices, and Escape there goes back to editing; anywhere else Escape throws the changes away and closes the popover. A Close button, shown once Tab reaches it, saves as a press outside does. Once the popover closes, Home Assistant gives focus back to where it was.

### Changes Appear at Once

After a save or a delete the card fetches its events again straight away, and every other Calendar Card Pro card on the same page that shows the changed calendar refreshes too, rather than waiting for its next `refresh_interval`. A card showing only other calendars, such as a holiday feed, stays as it is. Cards that are not on the page load the changed calendar again when they next appear (see [Performance & Caching](/features/performance#loading-refreshing)).

::: tip Nothing Opens While You Edit
In the card editor's preview, and on a dashboard in edit mode, the add button is still drawn, so you see the layout the card will have, but pressing it opens nothing, events are not tap targets, and a tap on a day adds nothing. Trying out a configuration or arranging a dashboard cannot open a popover that saves a real event. The card's own `tap_action` and `hold_action` behave there as they always have, except `add-event`, which does nothing there.
:::

Card taps are set with `tap_action` and `hold_action`, day taps with `day_tap_action`, event taps and holds with `event_tap_action`, `event_hold_action`, `allow_event_edit` and `allow_event_delete`, and links in rows with `open_links` — see [Actions in the configuration reference](/reference/configuration#actions). The button is `toolbar → add_event`, under [Header](/reference/configuration#header).
