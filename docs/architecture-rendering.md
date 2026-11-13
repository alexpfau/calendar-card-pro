---
title: Rendering & Views
---

# Rendering & Views

This page is for contributors changing how events look, how one of the three layouts arranges them,
or how grid view measures and fits its blocks. The rule that matters most is on the overview: the
three views share one pipeline and differ only in arrangement
([Three Views, One Agenda](/architecture#three-views-one-agenda)). For the map of the whole card,
start at the [architecture overview](/architecture).

## 🧱 Shared Pipeline

A change meant for every view goes into the shared modules, or earlier into processing, never into
each renderer.

- **`render.ts`** draws the card shell (title, toolbar, states, errors, the ripple) and the list
  view, one table row per event, and exposes the other two renderers to the main component's view
  dispatch.
- **`column.ts`** lays the same leaves out as side-by-side day tracks, adding per-column headers
  and gutter separators.
- **`grid.ts`** draws the hour gutter, the timed columns, the all-day band and the now line, joining
  each all-day event's columns into one banner and placing blocks from `utils/grid.ts`. A timed
  event a full day or longer is a banner too (`multiday_banners`): grouping stamps its days
  `_gridBanner`, and the band draws its times at its ends.
- **`leaves.ts`** holds the axis-agnostic pieces: the date block, the event body, weather badges,
  the today indicator and the accent bar.
- **`presentation.ts`** computes everything about an event that does not depend on layout: ended,
  running (`isEventCurrentlyRunning`), the "Now" label, accent colors and the parts its body draws.
- **`styles.ts`** holds the CSS and the dynamic style properties; **`accent-text.ts`** pairs each
  color the `accent` sentinel governs with its custom property and imports no CSS, so the editor can
  read it.

`event_gap` is decided once (`hasEventGap`) and drawn per view: a spacer row in list, `row-gap` in
column, nothing in grid.

## 🎨 From Calendar to Row

What a row shows is resolved on the display copy, one module per step; `_source` is never changed
(see [Event Data Flow](/architecture-data#event-data-flow)).

- **Matching.** `processEvents` stamps `_matchedConfig`, the calendar entry an event matched, and
  per-calendar options are read from that stamp, not from the live configuration.
- **Names.** `utils/calendar-names.ts` is the one resolver wherever the card names a calendar:
  the first non-blank `name`, else Home Assistant's `friendly_name`, else the entity id.
- **Colors, icons and pictures.** `utils/entity-colors.ts` defines the `home-assistant` and
  `accent` sentinels and fetches registry colors once per page, only for a card that uses them.
  Icons and person pictures come from entity state on `hass`, with no fetch.
- **Text.** `text-replace.ts` applies `replace_pattern` for display only; `event-age.ts` turns a
  `YEAR=` marker into an age; `format.ts` formats dates, times and locations; `links.ts` returns
  text and link pieces, never markup, and links only `http` and `https`.
- **Weather.** `weather.ts` matches forecasts to events; `weather-i18n.ts` words conditions in the
  card's language, not the user's.

## 🧩 Stable DOM & Accessibility

The event markup is held stable because card-mod rules and the snapshot tests depend on it. The
accent stripe is the one structural exception: an `.event-accent-bar` element, the first child of
every list and column event and every timed grid event, painted from
`--calendar-card-event-accent-bar-color` (see
[Card & Event Classes](/features/theming#card-event-classes)). An intentional markup change means
reading the snapshot diff and committing it, never `vitest -u`.

- **Tap targets.** `activation.ts` marks a tappable event with a Lit property
  (`calendarCardEventTap`) that leaves no trace in the markup. List view puts `role="button"` on a
  `div.event-button` inside the cell, never on the `<td>`. Empty-day rows and the grid's `+N` block
  are never targets, and nothing is added while neither event action runs anything.
- **Day names.** Each event button is described by its day's header (`aria-describedby`,
  `dayLabelId`), so identical events on different days are announced apart.
- **Grid names.** `grid-accessibility.ts` names timed events independently of visual clipping and
  hides the visual subtree from the accessibility tree.

::: warning Grid Structure Observers
The card's mutation observers take any element added to or removed from the card for a change in
the grid's structure, and refit every block. Draw transient state, such as a press wash, a search
ring or a surface reading, through attributes, template-bound classes or custom properties, never
by adding an element from `updated()`.
:::

## 📐 Grid Geometry & Fitting

Grid view splits pure geometry from browser measurement, so the arithmetic is testable without a
layout engine.

- **`utils/grid.ts`** places events on the hour axis, lays out overlaps (cascaded or in lanes) and
  spans banners. It knows no pixels and takes the current instant as an input.
- **`grid-cascade-threshold.ts` and `grid-overflow-strip.ts`** turn post-render measurements into
  the two inputs it needs: the cascade threshold in minutes, and the `+N` strip's width as a share
  of the column.
- **`grid-time-fit.ts`** picks each block's time row from a fixed ladder and never truncates a
  clock reading.
- **`grid-title-fit.ts`** fits labels and titles after the grid's disclosure pass, in batched,
  bounded reads and writes, and compares text by line boxes rather than the font's content area.
- **`content-box.ts`** is how both read a box that cuts its text at its inline edges. Each such
  box keeps room there for marks and letters that lean past it, 0.125em rounded up to a whole
  pixel, padding given back by a negative margin, so its border box is wider than its text's
  space. A width is read as `clientWidth` less the padding, the whole pixels the fits were tuned
  against, which the whole-pixel room leaves exactly as it was. The title scroll reads it the same
  way, and the time beside the title (`title-fit.ts`) takes the padding off itself.
- **`title-words.ts`** splits grid titles so they wrap only at spaces.

## 🎞️ Scrolling Titles

`title-motion.ts` holds the pure timing and `title-motion-controller.ts` the per-card cohort, in
which the longest visible trip sets a common period. Movement and offscreen pausing are native CSS,
a whole-timeline `linear()` curve per moving span with one shared `CSSAnimation.startTime`, and
there is no per-frame JavaScript. A changed trajectory is admitted at a surviving member's native
iteration boundary, read from the engine's progress, since rounded clocks disagree at exact
rollovers. Reduced motion, disabled scrolling and disconnecting retire the effects.
