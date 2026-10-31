---
layout: home

hero:
  name: Calendar Card Pro
  text: A calendar card for Home Assistant
  tagline: Sleek, fast and highly customizable — display upcoming events beautifully.
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

features:
  - icon: 🎨
    title: Sleek & Minimalist
    details: Clean, modern layout that fits naturally into any Home Assistant dashboard.
  - icon: ✅
    title: Multi-Calendar Support
    details: Display any number of calendars, each with its own styling and filters.
  - icon: ⚙️
    title: Visual Editor
    details: Configure every option from the UI — no YAML required.
  - icon: 🌦️
    title: Weather Integration
    details: Show forecasts alongside your events, in the date column or next to each event.
  - icon: ⚡
    title: Optimized Performance
    details: Cached events on screen the moment a dashboard opens, and every calendar loaded in parallel.
  - icon: 🌍
    title: 36 Languages
    details: The card in 36 languages and its visual editor in 12, with community contributions welcome.
---

## 🔍 About

**Calendar Card Pro** was inspired by a beautiful [calendar design using button-card and Hass calendar add-on](https://community.home-assistant.io/t/calendar-add-on-some-calendar-designs/385790) shared in the Home Assistant community. While the original design was visually stunning, implementing it with **button-card** and **card-mod** led to **performance issues**.

This motivated me to create a **dedicated calendar card**. It started out doing one thing well, **displaying upcoming events beautifully and efficiently**, and has since grown into a calendar you can work with right on the dashboard: **three layouts**, a **toolbar** to page through the dates and switch between them, and **adding, opening and editing events** through Home Assistant's own dialogs.

**Performance** is still the foundation: cached events are on screen the moment a dashboard opens, every calendar loads in parallel, and the visual editor is only downloaded when you open it.

## ✨ Features

- 🗓️ **List, Columns & Grid** – Stack the days as an agenda, lay them [side by side](/features/column-view), or draw them [hour by hour](/features/grid-view), each event sized by how long it runs.
- 🧰 **A Toolbar on the Card** – [Page through the dates, switch layouts, show or hide each calendar and refresh](/features/layout-appearance#header-toolbar), each device remembering its own choices.
- ✏️ **Add & Edit Events** – Open, add, edit and delete events from the card through [Home Assistant's own dialogs](/features/actions#home-assistants-own-dialogs), as far as each calendar allows.
- ✅ **Many Calendars, One Card** – Give each calendar its own color, label or [a person's photo](/features/core-settings#showing-a-persons-picture) and its own filters; an event on several calendars [can be merged into one](/features/core-settings#labeling-coloring-shared-events).
- ⚙️ **Visual Editor** – Every option in the UI, with a [search box](/features/editor#search-customized-only) that finds any setting by name or YAML key. No YAML required.
- 🌦️ **Weather** – [Forecasts](/features/weather) in the date column or beside each event.
- 🎨 **Fits Your Theme** – Follows your Home Assistant theme and its primary color, with [custom properties](/features/theming) for finer styling.
- ⚡ **Optimized Performance** – Cached events on screen the moment a dashboard opens, and every calendar loaded in parallel.
- 🌍 **Multi-Language Support** – [Available in 36 languages](/contributing#adding-translations), with the visual editor in 12. Community contributions welcome!

## 🔗 Requirements

**Calendar Card Pro** needs at least one **calendar entity** in Home Assistant, from any integration that creates `calendar.*` entities, such as Local Calendar, Google Calendar or CalDAV. Adding, editing and deleting events from the card works wherever that integration supports it.
