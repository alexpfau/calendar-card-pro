# Performance & Caching

Calendar Card Pro keeps the events it loads in your browser. It draws them the moment a
dashboard opens, and asks Home Assistant again only when they are due for a refresh.

```yaml
# Cache and refresh settings
refresh_interval: 30 # Minutes between refreshes
refresh_on_navigate: true # Refetch in the background whenever the card appears
```

## ⚡ Loading & Refreshing

- **Cached events first.** When the card appears, on a page load, when you open a
  dashboard or when you switch back to a dashboard view, it draws the events it last loaded, up to
  24 hours old, without waiting for Home Assistant.
- **A background refetch on appearing.** With `refresh_on_navigate` on, which is the
  default, the card then asks Home Assistant again and swaps in the answer, unless its data
  is less than 5 seconds old or a calendar is failing to load and waiting for its next
  retry. Turn it off to keep using the cached events until they are due.
- **A refresh every `refresh_interval` minutes**, counted from when the data was loaded.
  Cards showing the same calendars over the same dates share one cache, so one card's
  refresh serves the others.
- **All calendars at once.** Every calendar is requested in parallel, so a load takes as
  long as the slowest calendar rather than the sum of all of them.
- **At once after a change made on the card.** Adding, editing or deleting an event through
  the card's [dialogs](/features/actions#home-assistants-own-dialogs) refetches straight
  away, on that card and on every other Calendar Card Pro card on the page that shows the
  changed calendar. A new event could have gone to any calendar that accepts new events, so
  after one every card showing such a calendar refreshes. A card that is not on the page, on
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

## ⚠️ When a Calendar Fails to Load

A calendar can fail to load because its integration returns an error, because Home
Assistant is restarting, or because it does not answer within 30 seconds. The card then:

- names it in a line at the bottom of the card, such as "Couldn't load: Ben", using the
  calendar's name in Home Assistant, or its entity id when Home Assistant does not know it;
- keeps showing that calendar's last loaded events, for up to 24 hours;
- offers no Edit or Delete for those events, which may be a day out of date, and never
  preselects that calendar for a [new event](/features/actions#add-event-button) (see
  [Editing & Deleting Events](/features/actions#when-the-card-leaves-them-out));
- tries again after 1 minute, then after 2, 4, 8 and so on, up to `refresh_interval`.

A calendar that has never loaded, for example because of a typo in its entity id, is named
straight away. The line uses your theme's error color, and card-mod can style it through
the `.fetch-error` class.

These are the `refresh_interval` and `refresh_on_navigate` options — see [Cache & Refresh in the configuration reference](/reference/configuration#cache-refresh).

For styling the card with card-mod and CSS variables, see [Theming & Card-Mod](/features/theming).
