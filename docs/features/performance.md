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

On Home Assistant 2026.5 or later, the card subscribes to each calendar it shows, and Home
Assistant sends that calendar's events again whenever they change. An event added, moved or
deleted anywhere, on the card, in Home Assistant, on a phone or in the calendar's own app,
appears on every open dashboard as soon as Home Assistant knows of it, with no refresh in
between.

How soon Home Assistant knows depends on the calendar's integration:

| Calendar                                               | A change appears                                 |
| ------------------------------------------------------ | ------------------------------------------------ |
| Local calendars, and those an integration keeps itself | within seconds                                   |
| Google Calendar, CalDAV                                | at the integration's next sync, every 15 minutes |
| Remote calendars (an iCal address)                     | at the integration's next refresh, once a day    |

- **No polling while live.** `refresh_interval` applies only where live updates are not
  available: on Home Assistant before 2026.5, and for a calendar whose integration could not
  read its events, until it can again. It is also the longest wait between retries of a
  calendar that keeps failing.
- **Nothing redrawn for nothing.** Home Assistant also sends a calendar's events when one of
  them starts or ends, and some integrations at every sync, every minute for some. The card
  compares and redraws only when an event changed.
- **One subscription per calendar.** Cards showing the same calendar over the same dates share
  one subscription per browser tab. A card that leaves the page keeps its subscriptions for a
  minute, so switching dashboard views back and forth asks Home Assistant for nothing.
- **What it costs Home Assistant.** Each subscription reads the calendar's events once when it
  starts and again at every change Home Assistant sends, so a card appearing costs what a
  refresh did, and a calendar that changes often is read as often. Home Assistant's own
  calendar card works the same way.

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
- **Pages kept in memory only.** Dates the
  [date navigation](/features/layout-appearance#paging-through-dates) pages to are loaded the
  first time they are shown and kept in memory, shared by the cards on the page, for the 16
  most recent pages. They are never written to the browser's storage, so a tablet paging all
  week leaves nothing behind.
- **When you ask.** The toolbar's [refresh button](/features/layout-appearance#refreshing-the-events),
  or a [`refresh` tap or hold action](/features/actions#refreshing-from-a-tap-or-hold), asks Home
  Assistant for every calendar now, however recent the events the card holds.

```yaml
# A wall tablet that should not refetch every time its dashboard is opened
refresh_interval: 15
refresh_on_navigate: false
```

## 🖥️ Redrawing

Home Assistant tells the card about every change in the house, often several a second. The
card redraws only when something it shows has changed: one of its calendars, a label's
person or entity, its weather entity, or your language, theme or Home Assistant settings. A
light switching in another room costs it nothing.

Some of what the card shows changes with time alone, and it redraws for that on its own:

- when an event starts or ends, and when `allday_expires_at` retires an all-day event;
- once a minute while a countdown to something later today, or a progress bar, is on screen;
- just after midnight, which moves the mark of today, even on a card whose dates are fixed.

## ⚠️ When a Calendar Fails to Load

A calendar can fail to load because its integration returns an error, because Home
Assistant is restarting, or because it does not answer within 30 seconds. The card then:

- names it in a line at the bottom of the card, such as "Couldn't load: Ben", using the
  calendar's name in Home Assistant, or its entity id when Home Assistant does not know it;
- keeps showing that calendar's last loaded events, for up to 24 hours;
- lets no one change or delete those events, which may be a day out of date, and never
  preselects that calendar for a [new event](/features/actions#add-event-button) (see
  [Editing & Deleting Events](/features/actions#when-the-card-leaves-them-out));
- tries again after 1 minute, then after 2, 4, 8 and so on, up to `refresh_interval`.

A calendar that has never loaded, for example because of a typo in its entity id, is named
straight away. The line uses your theme's error color, and card-mod can style it through
the `.fetch-error` class.

These are the `refresh_interval` and `refresh_on_navigate` options — see [Cache & Refresh in the configuration reference](/reference/configuration#cache-refresh).

For styling the card with card-mod and CSS variables, see [Theming & Card-Mod](/features/theming).
