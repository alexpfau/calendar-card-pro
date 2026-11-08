---
title: Interaction & Event Writes
---

# Interaction & Event Writes

This page is for contributors changing what a press does, the actions the card runs, the event
popover, calendar writes or search. The short form of the gesture rules is on the overview
([Gesture Model](/architecture#gesture-model)); this page holds the detail. For the map of the
whole card, start at the [architecture overview](/architecture).

## 👆 Gesture Model in Detail

The recognizer lives in the card's pointer handlers (`_handlePointerDown`, `_handlePointerMove`,
`_handlePointerUp`). A change there has to keep these rules.

- **Targets are read at pointer-down**, because the pointer capture taken there retargets every
  later event, the derived `click` included. Views mark their days with a property no markup shows
  (`DaySlot` in `rendering/activation.ts`); space that is no day's element takes the day whose
  column holds the pointer (`findDayHit`), and a time slot is the quarter hour under it
  (`minuteAt`).
- **Arming.** A press arms only when it could end in something: an action that resolves, or a touch
  or pen press on a card that swipes (`_swipeAvailable`), away from the screen's edges. Anything
  else is left to the browser, so turning an action on changes nothing elsewhere. `add-event`
  resolves only where the card can add (`_canAddEvents`).
- **Endings.** A hold needs the pointer within `UI.POINTER_MOVE_TOLERANCE` for
  `TIMING.HOLD_THRESHOLD`; movement before it rules out both tap and hold, and a mostly sideways
  touch or pen swipe of `UI.SWIPE_MIN_DISTANCE` pages through `_stepPage`.
- **Links.** Only an event with no tap or hold of its own draws links in its row (`rowLinksOn`). A
  press that begins on one arms nothing (`startsOnRowLink`), so the browser's click reaches the
  link.
- **Place.** The card's own `add-event` adds on the day under the press, events walked past
  (`_addContextAt`).
- **Keys and editing.** Enter acts on keydown and Space on keyup, without repeats. There is no key
  hold, so an event with a hold and no tap of its own runs its hold from the keys (`_activate`).
  While a tap on a day adds, each day's date or header is a button named by Home Assistant's "Add
  event". In Home Assistant's `preview` and `editMode`, events are not tap targets and the
  functions that open the popover refuse.

### Movement & Drags

- **Pans.** Vertical pans are always the browser's. Sideways pans are the card's while it swipes,
  declared by `touch-action: pan-y pinch-zoom` on the card and again on its body and everything in
  it, since a scroll container does not honor a restriction it only inherits. A crammed grid
  scrolls sideways itself. The swipe's motion runs through the Web Animations API, so the grid's
  structure observers see nothing.
- **Drawing.** With `day_tap_action: add-event`, a hold on an empty grid slot, or a mouse dragged
  there, draws a new event (`_startDraft`), and the popover opens on it at release; Escape, a second
  contact or a render showing other days (`_draftStillShown`) throws it away. Only such a card binds
  a non-passive `touchmove` (`_draftTouchMove`), which refuses the scroll while a finger draws.
- **Moving.** Where the popover could change an event (`_movesEvents`, `_moveFrom`), a timed grid
  block on one day moves by mouse drag at once, or by finger after the hold. A single event is
  written on release (`_writeMove`); a repeating one opens the popover to ask which occurrences
  move (`_dropMove`). Escape puts it back.
- **The block** is drawn by the grid's own renderers from the event run through `processEvents`
  and `groupEventsByDay` (`_newEventByDay`), so it looks like the real event, inside an element the
  structure observer skips (`NEW_EVENT_HOST_CLASS`). After a save it stays until the save's own
  refresh brings the real event (`_newArrived`).

### Clicks & Focus

- **Derived clicks.** A `click` naming an event is assistive technology activating it, unless it is
  the one a browser derives from the gesture that just ended, which `_derivedClick` swallows.
- **Ghost clicks.** The card refuses the `touchend` of a finger that opened the popover
  (`_swallowTouchEnd`), and for a moment after a touch or pen opened it the popover swallows clicks
  that arrive before its own first pointer-down (`_ghostGuard`).
- **Focus.** A pointer press that runs something leaves no focus in the card
  (`_releasePressFocus`), so Home Assistant's focus restore does not ring it.
- **Events stop nothing**, so Home Assistant's edit-mode drag works on them as anywhere.

## 🎬 Actions

- **Card actions.** `handleAction` in `actions.ts` runs `tap_action` and `hold_action`: the card's
  own `expand`, `refresh`, `add-event`, `reset` and `back` through callbacks handed in per press,
  and everything else through `fireHassAction`, with the card's first calendar as the entity.
- **Event actions** never reach `handleAction`. `eventActionKind` reads one as `details`, a Home
  Assistant action, or nothing (the card's own actions act on the whole card, so they count as
  nothing here). `_runEventAction` opens the popover or forwards the filled action under the
  event's own calendar.
- **Day taps.** `_addEventAt` opens the popover on a new event, as the add button does.

`eventFields` reads the event from `_source`, not the row, with the calendar's text replacement
applied, and `fillEventAction` fills `{title}`, `{start}` and the rest into the action's strings.

::: warning Event Text Is Untrusted
Whoever wrote the event chose its title, location and description, so they fill only the payload
(`FREE_TEXT_FIELDS`: `data`, `service_data`, a confirmation's `text`, a URL's or path's query or
fragment). An
action placing one anywhere else is refused, since there it could pick the service, the target or
the host; percent-encoding guards none of that. A filled `url` that is not http or https is refused
too.
:::

The ripple is an `<ha-ripple>` in the card; a press on an event or a day marks `ha-card`
(`data-own-press`) to mute it. `feedback.ts` draws the hold indicator and records where a press was
(`PressOrigin`), for the popover to open at.

## 🪟 The Event Popover

Viewing, adding, editing, moving and deleting events all happen in the card's own popover
(`rendering/event-popover.ts`), which writes through Home Assistant's calendar WebSocket commands
and borrows nothing from its frontend beyond the public dialog contract.

- **The contract.** The card fires `show-dialog` with the popover's tag
  (`calendar-card-pro-event-popover`, `calendar-card-pro-dev-event-popover` in the dev build), and
  Home Assistant's dialog manager creates it. `showDialog` arrives before the element is attached,
  so `showModal()` runs in `updated()`. `closeDialog()` must return a plain boolean, which the
  manager does not await; `false` keeps the popover open.
- **Saving.** Changes are a draft (`popover-model.ts`) written once, on close. A press that starts
  and ends on the backdrop saves, as Back does; Escape discards. A write in progress makes the
  panel `inert` and refuses every close.
- **Text.** Fields show the card's display text until edited, then the stored text, which is what a
  save writes.
- **Placement.** Beside a pressed event's visible box (`eventBox`), at a pressed day's point, below
  the add button, or as a sheet on a narrow viewport.
- **Words.** All from `hass.localize`, with English fallbacks, so the card ships no translations
  for it.
- **Moving between calendars.** With no move command in Home Assistant, the popover adds to the new
  calendar, then deletes from the old, so a failure leaves the event in both, never in neither. A
  series moves whole only where `seriesMovable` allows.

::: warning A Reused Popover Ignores Old Writes
The element can be reused for another event, so each `showDialog` starts a new open (`_openId`). A
save, move or delete checks it when it finishes: one that finishes after the popover was opened for
another event still refreshes the calendar it wrote to, but neither closes nor changes the new
one. Any new asynchronous step in the popover needs the same check.
:::

`popover-shell.ts` (`PopoverShell`) holds what the popover and the search panel share, including a
scroll guard on the window (`_guardScroll`), which Chromium needs because it scrolls the page under
a modal's backdrop, and placement by inline position alone (`inset: auto`), which right-to-left
pages need.

## ✏️ Building & Writing Events

The `interaction/` modules decide what the popover is handed and what it writes, and none touches
the DOM. `calendar-writes.ts` alone sends writes, called by the popover and, for a single dragged
event, by the card (`_writeMove`). Every write then goes through
[After a Write](/architecture-data#after-a-write).

- **`event-details.ts`** builds the popover's entry from `_source`, never from the row, whose text
  is display text and whose interval may be one day of a split event. It allows editing and Delete
  only with the feature bit, a `uid`, the `allow_event_*` options, a row that is no
  `filter_duplicates` merge, and a calendar not failing to load. Editing also needs an end the
  calendar stores (`storedEnd`).
- **`add-event.ts`** lists the writable calendars, without failing ones; none means no button. A new
  event lasts an hour: from the current hour for the add button, or the window's first day when
  today is outside it (`newEventDate`), from that hour on a pressed day, or from the quarter hour
  pressed in a grid (`newEventTimesOn`). The first writable calendar the legend shows is
  preselected, or the first writable one when it hides them all (`preselectedCalendarId`).
- **`calendar-writes.ts`** reads feature bits as Home Assistant's Calendar panel does
  (`calendarSupports`) and writes timed events as UTC instants, because Home Assistant requires
  start and end in one zone, which two offsets around a clock change are not.
- **`popover-model.ts`** builds, checks (`draftProblem`) and writes (`eventWrite`) the draft. A
  repeat rule left alone is written back exactly as stored.
- **`rrule.ts`** reads only the rules Home Assistant's own editor offers. Any other rule is kept
  verbatim, because rewording it would change the days it repeats on.
- **`calendar-changes.ts`** announces a write on `window`, naming the calendar, with the write's
  generation. The event name must never contain `calendar-card-pro-dev`, which the production build
  rewrites.
- **`event-map.ts`** resolves a location to a Home Assistant zone first, else to an Open-Meteo place
  accepted only by the strict rules of `pickPlace`, and draws tiles from Home Assistant's own proxy,
  which exists from Home Assistant 2026.10.

## 🔍 Search

Search is a panel on the popover's shell (`rendering/search-panel.ts`) over a load of its own,
owned by the card's `SearchSession`.

- **The load** covers a year back and a year ahead (`searchWindow`) over plain REST, so no live
  subscription is leased or disturbed. It lives in memory and is reused while the window, the
  calendars, the write generation, real changes (`eventChanges`) and the refresh interval hold. A
  write or live change while the panel is open supersedes it once; typing never fetches.
- **Rows** come from the card's own `processEvents` and `groupEventsByDay` for the view on screen
  (`searchGroupingConfig`), so filters, duplicates and replacements are the card's.
- **A pick** pages through the date picker's path (`_pickDate`) and rings the event through a class
  render binds (`_searchRing`), never an element added in `updated()`.
- **Closing.** The panel closes before anything takes its magnifier away.
