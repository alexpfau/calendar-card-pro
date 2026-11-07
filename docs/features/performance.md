# Performance & Caching

Calendar Card Pro keeps the events it loads in your browser and draws them the moment a
dashboard opens. On Home Assistant 2026.5 or later, Home Assistant then tells it of every change
to its calendars, so it never polls; on older versions it asks again whenever its events are due
for a refresh.

```yaml
# Cache and refresh settings
refresh_interval: 30 # Minutes between refreshes
refresh_on_navigate: true # Refetch in the background whenever the card appears
```

## 📡 Live Updates

On Home Assistant 2026.5 or later, an event added, moved or deleted anywhere, on the card, in
Home Assistant, on a phone or in the calendar's own app, appears on every open dashboard as soon
as Home Assistant knows of it, with no refresh in between. The card subscribes to each calendar
it shows, and Home Assistant sends that calendar's events again whenever they change.

How soon Home Assistant knows depends on the calendar's integration:

| Calendar                                               | A change appears                                 |
| ------------------------------------------------------ | ------------------------------------------------ |
| Local calendars, and those an integration keeps itself | within seconds                                   |
| Google Calendar, CalDAV                                | at the integration's next sync, every 15 minutes |
| Remote calendars (an iCal address)                     | at the integration's next refresh, once a day    |

- **No polling while live.** `refresh_interval` applies only where live updates are not
  available: on Home Assistant before 2026.5, and for a calendar whose integration could not
  read its events, until it can again.
- **After an integration reload.** Reloading a calendar's integration, changing its options or
  signing in to the calendar again replaces the calendar in Home Assistant, and its updates stop
  until the card subscribes again: within 30 seconds for a card on screen, and when it comes back
  for one that was not, as while you were in Home Assistant's settings.

::: details Subscriptions & What They Cost

- On Home Assistant before 2026.5 the card asks again at most every 30 minutes whether it can
  subscribe, in case Home Assistant was only starting up.
- Cards showing the same calendar over the same dates share one subscription per browser tab. A
  card that leaves the page lets go of its subscriptions a few seconds later, and subscribes
  again when it comes back.
- Each subscription reads the calendar's events once when it starts and again at every change
  Home Assistant sends. A card appearing therefore costs Home Assistant one read of each
  calendar, as a refresh on appearing did, and a calendar that changes often is read as often.

:::

## ⚡ Loading & Refreshing

- **Cached events first.** When the card appears, on a page load, when you open a
  dashboard or when you switch back to a dashboard view, it draws the events it last loaded, up to
  24 hours old, without waiting for Home Assistant.
- **A background refetch on appearing.** With `refresh_on_navigate` on, which is the
  default, the card then asks Home Assistant again and swaps in the answer, unless its data
  is less than 5 seconds old or a calendar is failing to load and waiting for its next
  retry. Turn it off to keep using the cached events until they are due.
- **Where live updates are not available, a refresh every `refresh_interval` minutes**,
  counted from when the data was loaded.
  Cards showing the same calendars over the same dates share one cache, so one card's
  refresh serves the others.
- **All calendars at once.** Every calendar is requested in parallel, so a load takes as
  long as the slowest calendar rather than the sum of all of them. When the card has nothing
  to draw yet, on its first load or on dates it has not shown before, it draws each calendar
  as it answers, so one slow calendar no longer holds back the rest. A card already showing
  saved events for those dates keeps them until every calendar has answered.
- **At once after a change made on the card.** Adding, editing or deleting an event through
  the card's [event popover](/features/actions#the-event-popover) refetches straight
  away, on that card and on every other Calendar Card Pro card on the page that shows the
  changed calendar. A card that is not on the page, on
  another view or dashboard, loads the changed calendar again the next time it appears, even
  with `refresh_on_navigate` off, and so does the card itself after a reload.
- **Just after midnight.** A card whose dates move with today, with no `start_date` or a
  [relative one](/features/start-date-offset), loads the new day's events just after midnight
  rather than at its next refresh.
- **When you ask.** The toolbar's [refresh button](/features/layout-appearance#refreshing-the-events),
  or a [`refresh` tap or hold action](/features/actions#refreshing-from-a-tap-or-hold), asks Home
  Assistant for every calendar now, however recent the events the card holds.

```yaml
# A wall tablet that should not refetch every time its dashboard is opened
refresh_interval: 15
refresh_on_navigate: false
```

### What the Card Keeps

The card keeps three sets of events, each for its own purpose, and each device remembers the
choices made on its toolbar:

- **The events it last loaded,** up to 24 hours old, in the browser's storage. They are what the
  card draws the moment it appears, and what it keeps showing for a calendar that
  [fails to load](#when-a-calendar-fails-to-load).
- **Pages the [date navigation](/features/layout-appearance#paging-through-dates) reaches,** in
  memory only. Each is loaded the first time it is shown and kept, shared by the cards on the
  page, for the 16 most recent pages while the dashboard is open. Paging back to a recent page is
  instant and an older one is loaded again. None is written to the browser's storage, so a tablet
  paging all week leaves nothing behind.
- **Two years for [search](/features/layout-appearance#searching-the-card),** in memory only,
  for that card while the dashboard is open; see [How Search Loads](#how-search-loads).
- **The layout and the hidden calendars a device chose,** with the
  [view switcher](/features/layout-appearance#switching-between-layouts) and the
  [calendar filter](/features/layout-appearance#showing-hiding-calendars), in the browser's
  storage, for that exact configuration of the card, including the layout keys a dashboard
  stores with it. A change to the configuration, even resizing the card in a sections dashboard,
  starts them over, and a configuration changed back to exactly what it was finds them again. Two
  cards with identical configurations share them. A browser keeps these choices for at most 50
  configurations, each holding a layout, hidden calendars or both, and drops the least recently
  changed first. One that refuses storage keeps them only while the page stays open.

### How Search Loads

The first time the toolbar's search panel opens, the card asks Home Assistant for each of its
calendars' events over the whole two years, one request per calendar, and keeps them in memory
for that card. Typing asks for nothing more.

Later openings search the same events until one of the card's calendars is written to, Home
Assistant pushes a change to one of them, the card's `refresh_interval` has passed or a new day
has begun, and then ask again. A write or a pushed change while the panel is open asks again at
once, keeping what you typed and the result you were on wherever it is still there.

No Home Assistant calendar searches text, or limits how many days it is asked for, so the card
asks for the days and searches them itself. What that costs depends on the integration:

- **Local Calendar and Remote Calendar** answer from memory, quickly.
- **Google Calendar** answers from its own copy of the calendar, which holds only about 90 days
  of past events that do not repeat, so older ones may be missing from the results. A Google
  calendar set up with a search filter, or with free/busy access only, asks Google each time
  instead.
- **CalDAV** asks its server each time the card loads the two years, and the server expands
  recurring events over all of them: the one case where the first results can take a while.

## 🖥️ Redrawing

Home Assistant tells the card about every change in the house, often several a second. The
card redraws only when something it shows has changed: one of its calendars, a label's
person or entity, its weather entity, or your language, theme or Home Assistant settings. A
light switching in another room costs it nothing. Nor does a calendar's live update that
changes no event: Home Assistant also sends a calendar's events when one of them starts or
ends, and some integrations at every sync, every minute for some, and the card compares and
redraws only when an event changed.

Some of what the card shows changes with time alone, and it redraws for that on its own:

- when an event starts or ends, and when `allday_expires_at` retires an all-day event;
- once a minute while a countdown to something later today, or a progress bar, is on screen;
- just after midnight, which moves the mark of today, even on a card whose dates are fixed.

## ⚠️ When a Calendar Fails to Load

A calendar can fail to load because its integration returns an error, because Home
Assistant is restarting, or because it does not answer within 30 seconds. The card then:

- names it in a line at the bottom of the card, such as "Couldn't load: Ben", by its
  [`name`](/features/core-settings#naming-a-calendar-in-the-card) on the card, else its name
  in Home Assistant, else its entity id. Where Home Assistant does not know the calendar at
  all, the entity id stays in the line, after the name if it has one, as in "Couldn't load:
  Ben (calendar.bne)";
- keeps showing that calendar's last loaded events, for up to 24 hours;
- lets no one change or delete those events, which may be a day out of date, and never
  preselects that calendar for a [new event](/features/actions#add-event-button) (see
  [Editing & Deleting Events](/features/actions#when-the-card-leaves-them-out));
- tries again after 1 minute, then after 2, 4, 8 and so on, up to `refresh_interval`.

A calendar that has never loaded, for example because of a typo in its entity id, is named
straight away. A calendar hidden with the toolbar's
[calendar filter](/features/layout-appearance#showing-hiding-calendars) is still loaded, and
still named when it fails. The line uses your theme's error color, and card-mod can style it
through the `.fetch-error` class.

### What to Check

1. **Does Home Assistant know the calendar?** An entity id in parentheses after the calendar's
   name, as in "Ben (calendar.bne)", means it does not. A bare entity id says less: Home
   Assistant may not know the calendar, or know it without a name. Compare the id with the
   calendar's entity in Home Assistant and correct it in the card's `entities`.
2. **Is the calendar working in Home Assistant?** The card knows only that the calendar failed to
   load, not why. Check the calendar's entity, and its integration under
   **Settings → Devices & services**. If the cause is not shown there, look in
   **Settings → System → Logs** for an error from the integration.
3. **Try again.** Once the calendar works in Home Assistant, the card picks it up at its next
   retry. To try at once, press the toolbar's
   [refresh button](/features/layout-appearance#refreshing-the-events) or run a
   [`refresh` action](/features/actions#refreshing-from-a-tap-or-hold). After you reload the
   integration, a card on screen also subscribes to [live updates](#live-updates) again within 30
   seconds.

These are the `refresh_interval` and `refresh_on_navigate` options — see [Cache & Refresh in the configuration reference](/reference/configuration#cache-refresh).

For styling the card with card-mod and CSS variables, see [Theming & Card-Mod](/features/theming).
