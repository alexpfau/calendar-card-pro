---
title: Toolbar & Navigation
---

# Toolbar & Navigation

This page is for contributors changing the header toolbar: the date navigation, the view switcher,
the calendar filter, the menus, refresh and reset. No control writes the card's configuration. Most
change only what this device shows, while add and the configuration's own buttons run actions (a
new event, or any Home Assistant action), so this page is mostly about which state each control
owns. Users'
documentation is [Header Toolbar](/features/layout-appearance#header-toolbar); the map of the whole
card is the [architecture overview](/architecture).

## 🧰 Structure

`renderHeaderToolbar` in `rendering/toolbar.ts` draws the bar and `renderMainCardStructure` places
it.

- **One reader.** `resolveToolbar` in `config/config.ts` alone reads `toolbar:`, member by member,
  so a malformed value reads as that member's default. `show` defaults off; inside a shown bar every
  control defaults on except `reset`. Each control needs a `toolbar → key` row in the reference,
  which `check:docs` reconciles with the defaults.
- **No control, no DOM.** Without an available control the header renders byte for byte as it does
  without a toolbar. Keep its single child binding: a second one, even rendering nothing, adds a Lit
  marker and moves the snapshots.
- **Two rows.** `.header-container.has-toolbar` holds the action row
  (`.card-toolbar.toolbar-actions`: `.toolbar-start`, the switcher, `.toolbar-end`), drawn only
  while it holds a control, then the heading row (`.card-toolbar.toolbar-heading`). The title moves
  into the heading row as a label over the month, so `.header-container > h1.card-header` no longer
  reaches it; the descendant selector does either way.

## 🎛️ Controls

- **Native buttons.** Every control is a `<button>` styled from theme variables, never an `ha-*`
  element; the `--calendar-card-toolbar-*` properties are declared on `.card-toolbar`.
- **No card gesture.** Controls stop `pointerdown` and `click` (`stopCardGesture`) but never
  `keydown`, which Home Assistant's shortcuts need. The rows stop nothing and stay the card's for
  tap, hold, ripple and swipe. Every control is inert while the card is edited.
- **44px targets.** Each control answers a 44px-tall press through an invisible `::before` box that
  never overlaps a neighbor's. The month is the exception: its target reaches only 2px up and 10px
  down, about 41px at the default title size, so the title keeps its line for the card's tap.
- **The card stops being a button.** While the render draws a control or a tappable event
  (`_hostsControls`), `ha-card` drops `role="button"`, because a button may not contain another, and
  `tap_action` moves to an invisible native button drawn first (`TapControl`).
- **The configuration's own buttons.** `resolveToolbar` keeps a `toolbar → buttons` entry only
  where `isToolbarButton` accepts it, warning once about each one left out
  (`undrawableToolbarButtons`). A press runs `handleButtonAction`, which forwards Home Assistant's
  actions with the button's `entity`, else the first calendar.

::: warning The Editor Keeps Undrawable Buttons
The editor reads `toolbar → buttons` as written, never through `resolveToolbar`
(`rendering/editor/buttons.ts`): an entry the card cannot draw yet, such as one whose icon was just
cleared, is one somebody is still filling in. Reading the resolved list there deletes it on the
next edit.
:::

## 📅 Month & Paging

The heading row names the page and pages through dates. Paging changes the window asked for, never
the configuration.

- **The month.** `monthHeading` in `utils/paging.ts` names the month of the page's first day through
  `Intl`; the exact dates (`rangeLabel`) are its tooltip and a polite live region. Every month keeps
  the room of the widest, so paging never moves a control.
- **Measured, never oscillating.** `_syncHeadingMiddle` centers the arrows and chips on the month's
  capitals, and `_syncMonthFit` switches to the short month form below a measured width. Neither
  reads anything it sets, and neither changes the card's height.
- **The date picker.** The month button focuses a hidden date input, because Safari closes a picker
  only on blur, and the card tracks an open picker so the press that closes Chrome's opens nothing.
- **The page.** A page is a fixed first day (`_pageRequested`, null at home), fetched with
  `start_date` replaced by it and `show_past_events` forced on. Arrows and swipes step by the days
  on screen (`pageSpan`). The heading answers at once; the days stay those of `_pageShown`, dimmed,
  until the new page's events land, and the request generation discards the responses of pages
  passed by. Storage is under [What the Browser Stores](/architecture-data#what-the-browser-stores).
- **Nothing remembers a page.** A reload, a configuration change and the start of editing bring the
  card home.
- **Hiding leaves a way back.** `hide_when_empty` acts only at home and only while the legend hides
  no calendar (`_applyVisibility`): a card that hid itself on an empty page, or after its legend
  emptied it, would take the only way back with it.

## 🔀 View Switcher

There are three views at once: the configured `view`, the requested view (`requestedView`, the
device's choice, else `view`) and the effective view the width fit makes of it (`_effectiveView`).

- **No fetch.** The window's start is identical across views (`FETCH_TIME_KEYS`) and the load spans
  the longest of them (`loadedDaysToShow`), so each view draws a prefix of one load.
- **Per configuration.** `utils/view-choice.ts` stores the choice under a fingerprint of the raw
  configuration, so any edit resets every device. Old entries are pruned past `MAX_VIEW_CHOICES`,
  never deleted on edit, since no card learns which configuration it replaced.
- **What it offers.** Decided at render: the view on screen always, any other by
  `resolveColumnFitIfPicked` with the hysteresis a view on screen keeps. One that does not fit is
  `aria-disabled`; with fewer than two that fit there is no switcher.
- **What a pick draws.** The days a fresh load draws at that width. The band a view on screen
  keeps admits only the view, at its floor, where a fresh load would fall back to the list; it
  never adds a day. Reset refits `view` by the same rule.
- **Words or pictograms.** The words show from `UI.TOOLBAR_SWITCHER_LABEL_MIN_WIDTH` plus the
  commands' widths, which `stylesheet.test.ts` reconciles; `_syncToolbarLabelFit` only ever drops
  them.
- **While editing**, the switcher shows `view` and ignores presses, and a width measured then never
  overwrites the dashboard's fit.

## 🏷️ Calendar Filter

The filter (`legend`) changes what is drawn, never what is loaded.

- **Display only.** `_shownEvents` is `events` without the hidden calendars, a set replaced rather
  than mutated. Grouping, counts and the now-boundary timer read it; the cache, the page store, the
  request identity and the failure notice stay on `events`, so a press fetches nothing.
- **Synced.** The set shares the switcher's `view-choice.ts` entry. Cards on one page follow
  `LEGEND_CHANGED_EVENT`, other tabs the `storage` event (`hiddenCalendarsChange`). The switcher's
  view is not synced, and is written as a patch of its own half so a stale tab cannot overwrite it.
- **Chips fold by measurement.** `_syncLegendFit` folds the chips into the `menu` button after a
  render, never inside a resize, since either can change the card's height; unfolding needs
  `UI.LEGEND_UNFOLD_MARGIN` of room so the two cannot alternate.

## 📋 Menus

The filter's menu and the start group's overflow menu are modal `<dialog>` elements run by one
controller, `rendering/menu.ts`. `showModal()` puts them in the top layer, past `ha-card`'s
`overflow: hidden`.

- **Every close goes through `closeMenu`**, and the card closes a menu before anything takes its
  button away: in `willUpdate`, in `_applyVisibility`, on a change of width and on disconnect.
- **Opaque surfaces.** Both read their colors off hidden stand-ins (`surfaceColor` in
  `rendering/surface.ts`) and hand them over in a custom property, never writing the element's own
  background, so a card-mod rule on it still wins. They differ under an opaque theme:
  - `paintMenu` always sets `--calendar-card-legend-menu-surface`: the see-through background laid
    over the page color, or under an opaque theme the menu's own color back, because a theme may
    write its card background as a shorthand that is no background color.
  - `paintSelectedView` sets `--calendar-card-toolbar-selected-surface` only where the selected
    segment is see-through, or its color is no background color, so an opaque theme's switcher is
    exactly what the stylesheet paints.

## 📏 Narrow Cards

As the card narrows the bar gives way in a fixed order, keeping one line per row:

1. The switcher's words become pictograms.
2. The start group folds into a three-dot menu from its end, the configuration's buttons first, then
   add. Its first control never folds, and a menu never holds one control.
3. The end group never folds. Too narrow, it wraps onto its own line: below 274px beside refresh,
   318px beside refresh and reset or search, 362px beside all three.

`planStartGroup` in `utils/toolbar-fold.ts` plans from the card's width alone, with `UI` constants
the stylesheet tests reconcile, at render, from the width the resize observer reported, with no
hysteresis. Crossing a threshold can log a resize-observer loop error, which Home Assistant's
frontend discards, so only a page outside it, such as a test harness, shows one. Where the row still
overflows, `_syncStartFoldFit` folds one more control, never fewer.

## 🔄 Refresh & Reset

- **Refresh.** The button and the `refresh` action both go through `_requestRefresh`, which ignores
  a press while a load runs. The guard stays out of `refreshEvents`, which a write must be able to
  force. `_refreshPhase` shows a refresh someone asked for even when it is instant.
- **Reset** undoes this device's choices (`_differsFromConfiguration`): the page, the switcher's
  choice, the hidden calendars, and an expansion where compact limits show it, never while the card
  is edited. A press
  (`_resetToConfiguration`) forgets the stored choice in one write, refits `view` first because
  home's days follow the view on screen, then goes home. With nothing to undo the button is hidden
  with `visibility`, keeping its room. Its name, `ui.common.reset`, exists from Home Assistant
  2026.2; older versions get an English name for assistive technology (`UNLOCALIZED_RESET_NAME`).

## 🔍 Search Button

The magnifier (`renderSearchButton`) is drawn only with the date navigation, since a pick pages the
card. The panel is under [Search](/architecture-interaction#search).
