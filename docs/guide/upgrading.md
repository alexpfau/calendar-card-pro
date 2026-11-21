# Upgrading & Going Back

v6 keeps every card written for v5 working, but a major release changes some things on a card you
already have. This page lists them, starting with the one that matters most on a shared screen.
It also says what the visual editor changes when it first opens an older card, and how to go
back to v5.3 if you need to.

## 💾 Before You Upgrade

Back up each dashboard's YAML first: edit the dashboard, open **⋮ → Raw configuration editor**
and copy everything. Going back to v5.3 is possible, but a card the v6 editor has saved needs a
hand edit to look as it did (see [Going Back to v5.3](#going-back-to-v53)).

## 🔒 Hidden Fields Now Show in the Event Details

Since v6 a tap on an event opens its details, and the details show the whole event: its
location and description included, even where the calendar hides them in its rows.

```yaml
entities:
  - entity: calendar.anna
    private: true
```

- **`show_location: false` and `show_description: false`** on a calendar, **Never Show** in the
  visual editor, used to keep that field out of the event details as well as the rows. They now
  hide it in the rows only.
- **`private: true`** is what keeps a calendar's events to themselves: the card shows **Private**
  in place of their title, location and description, in the rows and in the details, and the
  details open read-only. See
  [Keeping a Calendar Private](/features/core-settings#keeping-a-calendar-private).
- **Opening an event with a place in its location** sends that name from your browser to
  Open-Meteo's geocoding service, to draw a map; see
  [Maps & Locations](/features/actions#maps-locations). A private calendar sends nothing.
- **To keep the old tap**, add `event_tap_action: { action: none }`; a tap on an event then does
  what a tap on the card does, and nothing opens.

## 🔄 What Else Changes on an Existing Card

These hold for a card written by hand as well as one the editor saved. Each names the option
that brings the old behavior back.

### A Tap Opens the Event

`event_tap_action` now defaults to `details`, so a tap on an event, or Enter on one, opens it in
the card's popover in every layout. Before, a tap on an event was a tap on the card.

- A tap on an event no longer runs `tap_action`, such as `expand` or `navigate`; the title and
  the space around the events still do.
- Enter on an event no longer runs `event_hold_action`; a hold still does.
- `open_links` no longer draws links in event rows, since the popover has them.
- In Grid, an event on a calendar that allows changes can be dragged to another time.
- The popover offers **Edit** and **Delete** where the calendar allows them;
  `allow_event_edit: false` and `allow_event_delete: false` keep it read-only.

To keep a card as it was, add `event_tap_action: { action: none }`, or set **Event Tap Action**
to Nothing on the editor's **Taps & Refresh** page. See
[Tapping an Event](/features/actions#tapping-an-event).

### Columns Give Way a Day at a Time

A column card too narrow for all its days used to turn into a list as soon as one day did not
fit. It now drops one column at a time, always keeping today, down to two, and draws a list only
below that. To keep the v5 behavior, set `min_days_to_show` in `column:` to your number of days:

```yaml
view: column
days_to_show: 7
column:
  min_days_to_show: 7
```

See [Showing Fewer Columns on Narrow Cards](/features/column-view#showing-fewer-columns-on-narrow-cards).

### The View Switcher Offers Month

A card showing the toolbar's view switcher now offers Month beside List, Columns and Grid, and
loads six weeks of events so it is ready to switch. A layout too wide for the card is no longer
dimmed. To offer the three it offered before, and load only the card's own days:

```yaml
toolbar:
  show: true
  view_switcher_layouts: [list, column, grid]
```

See [Switching Between Layouts](/features/header-toolbar#switching-between-layouts).

### Heights in Grid

- Under a short fixed `height`, Grid used to squeeze its hours until events were clipped. An
  hour now stays at least `24px` tall, or `hour_height` where that is smaller, and below that
  the events area scrolls.
- Where a Sections dashboard's Layout tab gives the card a number of rows, Grid fits its hours to
  them.

See [Height in Grid View](/features/layout-appearance#height-in-grid-view).

### Colors & Lines

- **The week-number pill** above this week now takes the light wash of today's date tile, with
  its number in a deeper shade. For the v5 look, set:

  ```yaml
  week_number_background_color: 'color-mix(in srgb, var(--primary-color, #03a9f4) 31%, transparent)'
  week_separator_color: 'color-mix(in srgb, var(--primary-color, #03a9f4) 31%, transparent)'
  week_number_color: 'var(--primary-text-color)'
  ```

- **The rule under the date row** in Columns and Grid is the theme's text color at 18%, and
  Grid's day, hour and all-day rules are the divider color at 75%. For the v5 lines:

  ```yaml
  column:
    day_header_separator_color: 'var(--divider-color)'
  time_grid:
    day_header_separator_color: 'color-mix(in srgb, var(--divider-color) 50%, transparent)'
    day_separator_color: 'color-mix(in srgb, var(--divider-color) 50%, transparent)'
    hour_line_color: 'color-mix(in srgb, var(--divider-color) 50%, transparent)'
    allday_band_line_color: 'color-mix(in srgb, var(--divider-color) 50%, transparent)'
  ```

Colors you set yourself are drawn as written. See
[Week Numbers & Visual Separators](/features/layout-appearance#week-numbers-visual-separators)
and [Grid Lines](/features/grid-view#grid-lines).

### No Option Freezes the Old Defaults

`config_version`, which the editor writes, says which layout format a card's YAML is in. It
decides how the editor reads top-level values when it opens a card, not which defaults the card
uses. A card without it gets every change on this page, as one with it does.

### A File per Editor Language

The editor's translations ship as a file per language, such as `editor-de.js` for German. The
Marketplace and HACS install them all. A manual install needs the file for each language its
editor uses; without it the editor opens in English. See
[Manual Installation](/guide/installation#manual-installation).

## ✏️ What the Editor Does on Opening

Opening an older card in the visual editor upgrades it as it opens, and says so at the top of
the editor with **Undo**. Nothing is kept until you press **Save**, and a card you never open in
the editor keeps working as it is.

- **Weather** written before v6, a top-level `weather:` with an `entity`, becomes
  [weather per layout](/features/weather#weather-per-layout): the entity moves to
  `weather_entity`, and List, Columns and Grid each take the old options as their own
  `weather:`. The card looks the same.
- **Top-level values on a List or Grid card** that could mean List or every layout are kept for
  List, as v5 drew them, and the editor offers **Use Them for Every Layout** instead.
- **The options only List reads** move into `list:`.

See [Upgrading Weather From v5](/features/editor#upgrading-weather-from-v5) and
[Adopting the Layout Format](/features/editor#adopting-the-layout-format) for the details.

## ↩️ Going Back to v5.3

v5.3 reads a card v6 saved without breaking, but leaves out what it does not know. Four things
need attention.

1. **Private calendars are shown in full.** v5.3 ignores `private: true`, so every title,
   location and description of a private calendar shows again. **Before you go back, remove
   those calendars from the card, or remove the card.**
2. **Weather disappears** from a card the v6 editor converted. Put the top-level block back, with
   the options of the layout you use most:

   ```yaml
   # Saved by the v6 editor
   weather_entity: weather.home
   list:
     weather:
       position: date
       date:
         show_conditions: true
         show_high_temp: true
   ```

   ```yaml
   # What v5.3 reads
   weather:
     entity: weather.home
     position: date
     date:
       show_conditions: true
       show_high_temp: true
   ```

   The leftover `weather_entity` and layout `weather:` lines cause only a console warning in
   v5.3, and v6 reads its own again if you come back.

3. **The card loses its height.** v5.3 ignores `card_height` and `card_max_height`, so the card
   grows with its events again. When v6's editor sets **Card Height** to Fixed or Maximum, it
   clears that layout's `height` and `max_height`, so nothing is left for v5.3 to read, and
   v5.3's editor deletes a top-level `card_height` and `card_max_height` when it saves. Add
   `height` or `max_height` back; in v5.3 they size the events area under the header, so set
   them smaller than the whole card by its title and toolbar.
4. **Start hours are ignored.** v5.3 has no `starts_after` or `starts_before`, so a calendar
   narrowed by them shows all its events again, and a calendar listed twice to divide its events
   by hour shows every event in both entries.

A card set to `view: month` opens as a list in v5.3. Everything else v6 added stays in the YAML,
unused, and v5.3's editor keeps it, apart from the top-level heights in point 3.

To install v5.3.0:

- **Home Assistant 2026.11 or later:** **Settings → Marketplace → Calendar Card Pro → ⋮ →
  Install another version → v5.3.0**. If you chose **Include pre-releases** in the same menu,
  choose **Exclude pre-releases** as well.
- **Home Assistant 2026.10 or earlier:** **HACS → Calendar Card Pro → ⋮ → Redownload → Need a
  different version? → v5.3.0**, and turn off the card's **Pre-release** switch if you turned it
  on.

Then reload the browser. The editor's language files (`editor-de.js` and the others) stay in the
card's folder; v5.3 never loads them.

::: details Why Excluding Pre-Releases Alone Does Not Go Back
Excluding pre-releases only stops new ones from being offered. A v6 beta already installed stays
until a newer stable version is out, so pick v5.3.0 under **Install another version** as well.
:::
