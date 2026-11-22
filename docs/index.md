---
layout: home

hero:
  name: Calendar Card Pro
  text: A calendar card for Home Assistant
  tagline: Four layouts, from a few lines on a phone to the whole family's week on a wall tablet, set up in the visual editor.
  image:
    src: https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/header_landing.png
    alt: "Calendar Card Pro for Home Assistant: a family's week in grid view, under a toolbar with a layout switcher and a chip for each calendar"
  actions:
    - theme: brand
      text: Get started
      link: /guide/installation
    - theme: alt
      text: See example stories
      link: /reference/examples
    - theme: alt
      text: Configuration reference
      link: /reference/configuration
    - theme: alt
      text: View on GitHub
      link: https://github.com/alexpfau/calendar-card-pro
---

<script setup>
import { ref } from 'vue'

const size = ref('narrow')
</script>

## 🗓️ Every Layout, One Card

The same calendars in every layout. Pick one, or let the [toolbar](/features/header-toolbar) switch
between them: on a narrow card, in one column of a Sections dashboard or on a phone, and on a wide
one, from two columns to a wall tablet.

<div class="showcase">
<div class="showcase-tabs" role="tablist">
<button role="tab" :aria-selected="size === 'narrow'" :class="{ on: size === 'narrow' }" @click="size = 'narrow'">📱 Narrow card</button>
<button role="tab" :aria-selected="size === 'wide'" :class="{ on: size === 'wide' }" @click="size = 'wide'">🖥️ Wide card</button>
</div>
<div v-show="size === 'narrow'" class="showcase-grid narrow">
<figure>
<img class="light-only" src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/showcase_list_narrow.png" alt="A narrow list card for Wednesday, October 21: Ben's business trip and the compost collection all day, Anna at the office now, Leo's nap at 12:30 and coffee with Jana at 16:00, each with the face of whose it is" width="380">
<img class="dark-only" src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/showcase_list_narrow_dark.png" alt="A narrow list card for Wednesday, October 21: Ben's business trip and the compost collection all day, Anna at the office now, Leo's nap at 12:30 and coffee with Jana at 16:00, each with the face of whose it is" width="380">
<figcaption><b>List</b> · what is next, in a few lines</figcaption>
</figure>
<figure>
<img class="light-only" src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/showcase_list_toolbar_narrow.png" alt="The same card with its toolbar: a layout switcher, then October 2026 with arrows and a home button, and Wednesday and Thursday listed beneath, each date with its forecast" width="380">
<img class="dark-only" src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/showcase_list_toolbar_narrow_dark.png" alt="The same card with its toolbar: a layout switcher, then October 2026 with arrows and a home button, and Wednesday and Thursday listed beneath, each date with its forecast" width="380">
<figcaption><b>List with the toolbar</b> · page through the days</figcaption>
</figure>
<figure>
<img class="light-only" src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/showcase_grid_narrow.png" alt="The same narrow card as a grid: Wednesday and Thursday against the hours from 7 to 22, all-day plans above them, each event as long as it runs and a line at the current time" width="380">
<img class="dark-only" src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/showcase_grid_narrow_dark.png" alt="The same narrow card as a grid: Wednesday and Thursday against the hours from 7 to 22, all-day plans above them, each event as long as it runs and a line at the current time" width="380">
<figcaption><b>Grid</b> · the day on an hour axis</figcaption>
</figure>
<figure>
<img class="light-only" src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/showcase_month_narrow.png" alt="The same narrow card as a month: six weeks with a colored stripe for each calendar on every day, today highlighted, and Wednesday's six events listed beneath" width="380">
<img class="dark-only" src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/showcase_month_narrow_dark.png" alt="The same narrow card as a month: six weeks with a colored stripe for each calendar on every day, today highlighted, and Wednesday's six events listed beneath" width="380">
<figcaption><b>Month</b> · the month, and the day beneath</figcaption>
</figure>
</div>
<div v-show="size === 'wide'" class="showcase-grid wide">
<figure>
<img class="light-only" src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/showcase_columns_medium.png" alt="Columns on a card two sections wide: Wednesday to Saturday side by side under the toolbar, each day's events in a column under its date and forecast" width="1100">
<img class="dark-only" src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/showcase_columns_medium_dark.png" alt="Columns on a card two sections wide: Wednesday to Saturday side by side under the toolbar, each day's events in a column under its date and forecast" width="1100">
<figcaption><b>Columns</b> · the days side by side</figcaption>
</figure>
<figure>
<img class="light-only" src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/showcase_grid_wide.png" alt="A wide grid: the family's week from Wednesday to Tuesday on an hour axis, a chip for each calendar in the toolbar, all-day plans such as Tom's birthday above the hours, and shared plans in gold with every face on them" width="1100">
<img class="dark-only" src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/showcase_grid_wide_dark.png" alt="A wide grid: the family's week from Wednesday to Tuesday on an hour axis, a chip for each calendar in the toolbar, all-day plans such as Tom's birthday above the hours, and shared plans in gold with every face on them" width="1100">
<figcaption><b>Grid</b> · a family's week, hour by hour</figcaption>
</figure>
<figure>
<img class="light-only" src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/showcase_month_wide.png" alt="A wide month: October 2026 in six weeks, multi-day plans such as a business trip and a weekend at the lake as bars across the days, the rest as lines with their time, and +N more where a day is full" width="1100">
<img class="dark-only" src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/showcase_month_wide_dark.png" alt="A wide month: October 2026 in six weeks, multi-day plans such as a business trip and a weekend at the lake as bars across the days, the rest as lines with their time, and +N more where a day is full" width="1100">
<figcaption><b>Month</b> · six weeks at a glance</figcaption>
</figure>
</div>
</div>

Each layout has a page of its own: [List](/features/list-view), [Columns](/features/column-view),
[Grid](/features/grid-view) and [Month](/features/month-view), with its
[narrow form](/features/month-view#the-narrow-month).

## 🎬 See It Move

The same card on a phone and on a wall tablet: paging through the days, switching layouts,
opening an event, a day's "+N more" and hiding calendars, in 30 seconds.

<video class="clip" src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/showcase_tour.mp4" poster="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/showcase_tour_poster.jpg" width="800" height="612" loop muted playsinline controls preload="metadata" aria-label="The narrow card pages two days ahead and back to today, switches from List to Grid and to Month and picks Friday; then the wide card opens Party at Tom's in its popover, switches from Grid to Columns and to Month, opens Thursday's +3 more, hides Ben's and Leo's calendars with their chips and shows them again, and goes back to Grid"></video>

<style>
.showcase-tabs { display: flex; gap: 8px; margin: 16px 0; }
.showcase-tabs button {
  padding: 6px 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
  color: var(--vp-c-text-2);
}
.showcase-tabs button.on {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-1);
  color: var(--vp-c-white);
}
.showcase-grid { display: grid; gap: 24px; align-items: start; }
.showcase-grid.narrow { grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr)); }
.showcase-grid figure { margin: 0; }
.showcase-grid img { display: block; width: 100%; max-width: 100%; height: auto; }
.showcase-grid figcaption { margin-top: 6px; font-size: 14px; color: var(--vp-c-text-2); }
.showcase-grid .dark-only, .dark .showcase-grid .light-only { display: none; }
.dark .showcase-grid .dark-only { display: block; }
</style>

## 🔍 About

**Calendar Card Pro** is a calendar card for Home Assistant that you can work with right on the dashboard. It shows your events in **four layouts**, has a **toolbar** to page through the dates and switch between them, and lets you **open, add and edit events** in a popover of its own.

**Calendar Card Pro** was inspired by a beautiful [calendar design using button-card and Hass calendar add-on](https://community.home-assistant.io/t/calendar-add-on-some-calendar-designs/385790) shared in the Home Assistant community. While the original design was visually stunning, implementing it with **button-card** and **card-mod** led to **performance issues**.

This motivated me to create a **dedicated calendar card**.

## ✨ Features

- 🗓️ **[Four Layouts](/features/layouts)** – Stack the days as an agenda, lay them [side by side](/features/column-view), draw them [hour by hour](/features/grid-view), each event sized by how long it runs, or show [the whole month](/features/month-view).
- 🧰 **A Toolbar on the Card** – [Page through the dates, switch layouts, show or hide each calendar and refresh](/features/header-toolbar), each device remembering its layout and which calendars it shows.
- ✏️ **Add & Edit Events** – Open, add, edit and delete events from the card in [its own popover](/features/actions#the-event-popover), as far as each calendar allows.
- ✅ **Many Calendars, One Card** – Give each calendar its own color, label or [a person's photo](/features/core-settings#showing-a-persons-picture) and its own filters; an event on several calendars [can be merged into one](/features/filtering#labeling-coloring-shared-events).
- ⚙️ **Visual Editor** – Set the card up in the UI, with a [search box](/features/editor#search) that finds any setting by name or YAML key.
- 🌦️ **Weather** – [Forecasts](/features/weather) in the date column or beside each event.
- 🎨 **Fits Your Theme** – Follows your Home Assistant theme and its primary color, with [custom properties](/features/theming) for finer styling.
- ⚡ **Optimized Performance** – Cached events on screen the moment a dashboard opens, every calendar loaded in parallel, and the visual editor downloaded only when you open it.
- 🌍 **Multi-Language Support** – [Available in 39 languages](/contributing#adding-translations), with the visual editor in 13. Community contributions welcome!

## 🔗 Requirements

**Calendar Card Pro** needs at least one **calendar entity** in Home Assistant, from any integration that creates `calendar.*` entities, such as Local Calendar, Google Calendar or CalDAV. Whether you can add, edit and delete events from the card depends on the calendar's integration and on the event itself; [Editing & Deleting Events](/features/actions#editing-deleting-events) has the details.
