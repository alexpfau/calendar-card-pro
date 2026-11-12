---
title: Data Loading & Caching
---

# Data Loading & Caching

This page is for contributors changing what the card fetches, how long it keeps it, how live
updates and timers reach the screen, or how a write makes stored data stale. For the map of the
whole card, start at the [architecture overview](/architecture).

## 🔀 Event Data Flow

Every load runs one pipeline in `utils/events.ts`; the load modes below differ only in whether
they draw what is stored first and when they ask Home Assistant.

1. **Request.** `resolveRequest` fixes the cache key, the first weekday and the window, half-open
   from local midnight on the first day to local midnight after the last. The window spans the
   longest `days_to_show` among the views the card can show (`loadedDaysToShow`), so switching
   views never fetches.
2. **Stored window.** `readEventSnapshot` reads and processes the stored payload synchronously, so
   an entry up to 24 hours old is on the first frame.
3. **Fetch.** Calendars are asked in parallel, each with a timeout, from a live subscription where
   one exists and over REST otherwise. Requests for the same query and window share one round trip.
4. **Process.** `processEvents` drops malformed payloads without discarding valid neighbors, keeps
   a timed event with a missing or backwards end as an instant at its start, and stamps `_source`,
   `_matchedConfig` and `_entityLabel`.
5. **Group.** `groupEventsByDay` builds display copies per day for the effective view. List and
   Column split multi-day events (`processMultiDayEvents`). Grid derives its daily coverage
   (`splitGridEventByDay`) before any per-day filter or empty-day omission, keeping timed segments
   timed and each all-day occurrence's source interval (`_gridSource`) for banner identity and
   final-day expiry. Anniversary counts read the source start (`_sourceStart`, `_gridSource`),
   never the display date, while countdowns and expiry stay per day. Duplicates are resolved after
   the per-calendar date and expiry filters, by source signature, so identical daily slices of
   distinct events never merge. List view's `event_order: latest_first` reverses the days and
   each day's events before any limit or empty-day fill, so every one of them keeps from the top
   (`listsLatestFirst`). Each calendar's cap runs next, then `skip_first_events`, then the day and
   event limits, and the empty-day fill starts where the skip stopped (`continueFrom`).
6. **Present.** `buildEventPresentation` runs at render (see
   [Rendering & Views](/architecture-rendering)).

`_source` is the event exactly as Home Assistant returned it, taken before `keepWellFormedEvents`
repairs an end. The popover and event actions read it, so a save never writes a repaired end or
display text back.

::: warning Classify Before Splitting
The List splitter rewrites a timed event's middle days as all-day (`start: { date }`), so anything
that filters on event class must run before `processMultiDayEvents`, as `event_type` does in
`processEvents`.
:::

::: warning Two Hand-Written Field Lists
`normalizeEntities` in `config/config.ts` copies each calendar entry through one field list, and
`groupEventsByDay` builds its display copy through another. A per-calendar option missing from the
first fails `tsc`, which checks that list against `EntityConfig`. An event field missing from the
second fails it too, checked against `CalendarEventData` less the few fields the copy leaves out on
purpose (`LeftOffDisplayCopy`, each with its reason). Both checks see whether a field is there, not
whether its value is the right one.
:::

## 🗃️ Load Modes

Every load names one of seven modes (`LoadMode`, documented on `updateEvents`). Every mode but
`reload` joins a matching request already in flight.

| Mode        | Used by                                                                       | Draws the stored window        | Asks Home Assistant when                                                 |
| ----------- | ----------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------ |
| `navigate`  | the card appearing, or configured before it first loaded                      | anything up to 24 h old, first | nothing stored, the entry due, or `refresh_on_navigate`                  |
| `page`      | turning to another page with the date navigation, or back home (`_loadPage`)  | anything up to 24 h old, first | nothing stored, or the entry due                                         |
| `cache`     | the refresh timer, a returning tab, the midnight timer, the grid day rollover | only if not due                | nothing fresh is stored                                                  |
| `reprocess` | a per-calendar edit                                                           | anything up to 24 h old        | nothing is stored at all                                                 |
| `network`   | a later configuration change, going home after a calendar changed while away  | no                             | always, joining a matching request under way                             |
| `reload`    | `refreshEvents()`: after a write, the refresh button and the `refresh` action | no                             | always, never joining a request from before the write                    |
| `live`      | a live subscription holding other events than those drawn (`_syncLive`)       | no                             | as `network`; a calendar without a live subscription only once it is due |

A card-level change to an option in `PROCESSING_TIME_KEYS` reprocesses like a per-calendar edit
(`hasEntityProcessingChanged`).

## 💾 What the Browser Stores

Each store has one owner and one scope. Only the `localStorage` stores outlive a reload.

| Store         | Where                                      | Holds                                       | Kept                                                            |
| ------------- | ------------------------------------------ | ------------------------------------------- | --------------------------------------------------------------- |
| Event cache   | `localStorage`, `utils/events.ts`          | the home window, its failures and deadlines | due after `refresh_interval`; drawn until 24 h old              |
| Held entries  | memory, the 16 used last (`heldEntries`)   | windows `localStorage` refused              | as the event cache; expired by any later write                  |
| Page store    | memory, the 16 used last (`pageStore`)     | windows away from home                      | dropped on read if fetched before a write                       |
| Search load   | memory, on the card's `SearchSession`      | a year back and a year ahead                | see [Search](/architecture-interaction#search)                  |
| Device choice | `localStorage`, `utils/view-choice.ts`     | the switcher's view, the hidden calendars   | until the configuration changes; pruned past `MAX_VIEW_CHOICES` |
| Place lookups | `localStorage`, `interaction/event-map.ts` | a location's coordinates                    | 30 days, a miss 7 days, a failure an hour; 300 names            |

### Event Cache

- **Key.** `getBaseCacheKey` covers only what shapes the request: the calendars, the loaded span,
  the raw `start_date`, the card version and, for a week-relative start, the first day of the week.
  Render-side options are applied again on every read, so toggling one re-renders from the cache.
  The key begins with the card's query identity (`_instanceIdForPage`), which counts the first day
  of the week by the same rule (`firstDayKeyPart`), resolved from the profile as it is now, so cards
  asking for one window share one entry and a profile that moves the week starts a new query.
- **Lifetime.** An entry is due one `refresh_interval` after its fetch, or after 15 seconds when
  every calendar answered empty (`EMPTY_RESULTS_CACHE_DURATION_SECONDS`).
- **Failures.** Each entry records which calendars failed and when to retry, so every card sharing
  it follows one backoff: 1 minute, doubling up to the refresh interval. A failing calendar keeps
  its last loaded events for up to 24 hours from its own load, while the calendars that answered
  are drawn as they answered; where the cache cannot carry it, `_keepFailedCalendars` does, and
  keeping it again never makes its events younger. Where no entry exists yet, the card's own count
  stands in (`_failureCountHint`), and only for the query it was counted for.
- **`refresh_on_navigate`.** An appearing card refetches in the background only with it on, no
  calendar failing, and data at least 5 seconds old.
- **One writer.** Only the newest request for a key writes the cache.

::: warning Two Freshness Guards
The cache's one-writer rule does not protect a card. Each card also discards a response its own
newer request superseded (`_eventRequestGeneration`), so a page passed by, or a query the
configuration has moved on from, never reaches the screen. A new load path needs both.
:::

Pages away from home stay in the page store, so a tablet paging all week leaves nothing in storage
shared with Home Assistant. A card that heard of a write while paged away fetches home on the way
back (`_homeStale`).

### Cold Loads

While no event is drawn yet on any of a load's days, each calendar is drawn as it answers
(`_schedulePartialCommit`), judged by the render's own test (`Render.drawsEvent`), not by event
dates. Once an event is drawn, a load keeps the drawn events until every calendar has answered.

### Start Date

`utils/start-date.ts` parses the relative grammar (`today+7`, `start_of_week+mon`). It takes `now`
as a parameter and returns `ok`, `error` or `nomatch`, so `getTimeWindow` can tell a malformed
expression from a date. `first_day_of_week` is a required parameter of `getTimeWindow`, resolved
once per request in `resolveRequest`, so no call site can leave it out.

## 📡 Live Updates

On Home Assistant 2026.5 and later every calendar shown is subscribed to over
`calendar/event/subscribe`, and while all of them are live the refresh timer is not armed.

- **The card.** `_syncLive` holds the subscriptions for the window on screen. One holding other
  events than the card drew (compared with `EventFetchResult.raw`, not the shared cache) starts a
  `live` load. `reload` closes the subscriptions and asks REST, so nothing from before a write is
  drawn.
- **The subscriptions.** `utils/live-calendars.ts` keeps one per calendar and window per
  connection, reference counted across every card on the page, and never writes the cache or draws.
- **Support.** `unknown_command` means polling on that connection, asking again after 30 minutes
  (`PROBE_AGAIN_AFTER`), since Home Assistant also answers it while the calendar integration is
  loading.
- **Change counts.** A push saying the same as the last (`fingerprintEvents`) notifies nobody.
  `changeCount` counts every change, first pushes included; `eventChanges` counts real changes only,
  and is what search reads.
- **Times.** A push carries times in the event's own zone, so `inZone` rewrites them into Home
  Assistant's zone, as REST writes them, and `{start}` and the popover see the same strings from
  either source.

::: details Websocket Library Workarounds
The websocket library Home Assistant shipped up to 2026.10 never settles a command sent while the
connection is down, drops a failed resubscription silently, and can resubscribe a closed command
or reuse an old id on reconnect. Hence `ANSWER_TIMEOUT`, `RECONNECT_TIMEOUT` and unsubscribing only
after a push. `STATE_PUSH_TIMEOUT` remakes a subscription that stays silent after its calendar's
state changed (`observeStates`), because one stays bound to an entity its integration replaced.
:::

## ⏱️ Timers

The card arms one refresh timer (`startRefreshTimer`) and reconciles four display timers in
`updated()`; `disconnectedCallback` stops all five. The display timers exist because
`shouldUpdate` skips renders for unrelated `hass` updates, so nothing else repaints on time.

- **Refresh.** At the deadline of the data on screen, unless every calendar is live; a `cache` load.
- **Now line** (`_syncNowLineTimer`). Once a minute while grid draws its now line, with a `cache`
  load on a new day.
- **Midnight** (`_syncMidnightTimer`). After local midnight while the window follows today or shows
  fewer days than configured, with a `cache` load. The now line and midnight timers claim the day
  (`_claimRollover`), so only the first loads.
- **Event boundary** (`_syncNowBoundaryTimer`, `nextEventBoundary`). In list, column, and grid
  without its now line: repaints at the next start or end of a timed event, or the moment
  `allday_expires_at` retires an all-day one. Never loads.
- **Clock** (`_syncClockTimer`). Without a now line: repaints for countdowns, progress bars and the
  day change. Never loads.

The now-line, event-boundary and clock timers stop while the tab is hidden; a returning tab re-arms
them and repaints at once where a now line or an event boundary is drawn
(`_handleVisibilityChange`). A tab returning more than five minutes after the last full load also
runs a `cache` load. Timers set during sleep keep the delay they had left, so the midnight,
boundary and clock timers are set again on every render.

## ✍️ After a Write

Every write, from the popover or a drag, ends in `_refreshAfterWrite` on the card that made it. The
rule it protects: **a refresh for a write never accepts work started before the write.**

1. `expireStoredCalendars` marks every stored window holding an affected calendar as due, and every
   request in flight for one as unjoinable (`isJoinable`), since no card refreshes a window it is
   not drawing. A card paged away marks home stale.
2. `advanceWriteGeneration` advances the page's write generation once.
3. `refreshEvents()` runs with that generation and joins only a request started since the write,
   which is why the write path never uses a `network` load.
4. `calendar-changes.ts` announces the change with the generation, so every other card showing the
   calendar refreshes the same way, and an open search is told (`calendarsChanged`).

The popover closes once Home Assistant has saved, without waiting for the refresh. The generation
lives on `globalThis` under a registered symbol, because a development build and a release on one
dashboard each have their own copy of `events.ts`.
