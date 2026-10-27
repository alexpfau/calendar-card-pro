---
layout: home

hero:
  name: Calendar Card Pro
  text: A calendar card for Home Assistant
  tagline: Sleek, fast and highly customizable — display upcoming events beautifully.
  image:
    src: https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/header.png
    alt: Calendar Card Pro
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

This motivated me to create a **dedicated calendar card** that excels in one thing: **displaying upcoming events beautifully and efficiently**.

Built with **performance in mind**, the card leverages **intelligent refresh mechanisms** and **smart caching** to ensure a **smooth experience**, even when multiple calendars are in use.

## ✨ Features

- 🎨 **Sleek & Minimalist Design** – Clean, modern, and visually appealing layout.
- ✅ **Multi-Calendar Support** – Display multiple calendars with unique styling.
- 📅 **Compact & Expandable Views** – Adaptive views to suit different dashboard needs.
- 🗓️ **List, Columns & Grid** – Three layouts, with a [switcher on the card](/features/layout-appearance#header-toolbar) to change between them.
- ✏️ **Add & Edit Events** – Open, add, edit and delete events from the card through [Home Assistant's own dialogs](/features/actions#home-assistants-own-dialogs), as far as each calendar allows.
- ⚙️ **Visual Configuration Editor** – Intuitive interface for effortless card setup.
- 🔧 **Highly Customizable** – Fine-tune layout, colors, event details, and behavior.
- 🌦️ **Weather Integration** – Display weather forecasts alongside your calendar events.
- ⚡ **Optimized Performance** – Cached events on screen the moment a dashboard opens, and every calendar loaded in parallel.
- 💡 **Deep Home Assistant Integration** – Theme-aware with native ripple effects.
- 🌍 **Multi-Language Support** – [Available in 36 languages](/contributing#adding-translations), with the visual editor in 12. Community contributions welcome!

## 🔗 Dependencies

**Calendar Card Pro** requires at least **one calendar entity** in Home Assistant. It is compatible with any integration that generates `calendar.*` entities, with **CalDAV** and **Google Calendar** being the primary tested integrations.

::: warning Prerequisite
Ensure you have at least **one calendar integration set up** in Home Assistant before using this card.
:::
