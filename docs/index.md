---
layout: home

hero:
  name: Calendar Card Pro
  text: A calendar card for Home Assistant
  tagline: Sleek, fast and highly customisable — display upcoming events beautifully.
  image:
    src: https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/header.png
    alt: Calendar Card Pro
  actions:
    - theme: brand
      text: Get started
      link: /guide/installation
    - theme: alt
      text: Configuration reference
      link: /reference/configuration
    - theme: alt
      text: View on GitHub
      link: https://github.com/alexpfau/calendar-card-pro

features:
  - icon: 🎨
    title: Sleek & minimalist
    details: Clean, modern layout that fits naturally into any Home Assistant dashboard.
  - icon: ✅
    title: Multi-calendar support
    details: Display any number of calendars, each with its own styling and filters.
  - icon: ⚙️
    title: Visual editor
    details: Configure every option from the UI — no YAML required.
  - icon: 🌦️
    title: Weather integration
    details: Show forecasts alongside your events, in the date column or next to each event.
  - icon: ⚡
    title: Optimised performance
    details: Smart caching, progressive rendering and minimal API calls.
  - icon: 🌍
    title: 35 languages
    details: Fully translated interface, with community contributions welcome.
---

## 🔍 About

**Calendar Card Pro** was inspired by a beautiful [calendar design using button-card and Hass calendar add-on](https://community.home-assistant.io/t/calendar-add-on-some-calendar-designs/385790) shared in the Home Assistant community. While the original design was visually stunning, implementing it with **button-card** and **card-mod** led to **performance issues**.

This motivated me to create a **dedicated calendar card** that excels in one thing: **displaying upcoming events beautifully and efficiently**.

Built with **performance in mind**, the card leverages **intelligent refresh mechanisms** and **smart caching** to ensure a **smooth experience**, even when multiple calendars are in use.

## ✨ Features

- 🎨 **Sleek & Minimalist Design** – Clean, modern, and visually appealing layout.
- ✅ **Multi-Calendar Support** – Display multiple calendars with unique styling.
- 📅 **Compact & Expandable Views** – Adaptive views to suit different dashboard needs.
- ⚙️ **Visual Configuration Editor** – Intuitive interface for effortless card setup.
- 🔧 **Highly Customizable** – Fine-tune layout, colors, event details, and behavior.
- 🌦️ **Weather Integration** – Display weather forecasts alongside your calendar events.
- ⚡ **Optimized Performance** – Smart caching, progressive rendering, and minimal API calls.
- 💡 **Deep Home Assistant Integration** – Theme-aware with native ripple effects.
- 🌍 **Multi-Language Support** – [Available in 35 languages](/contributing#adding-translations), community contributions welcome!

## 🔗 Dependencies

**Calendar Card Pro** requires at least **one calendar entity** in Home Assistant. It is compatible with any integration that generates `calendar.*` entities, with **CalDAV** and **Google Calendar** being the primary tested integrations.

⚠️ **Important:** Ensure you have at least **one calendar integration set up** in Home Assistant before using this card.

 <!--Badges-->

[hacs-img]: https://img.shields.io/badge/HACS-Custom-orange.svg
[hacs-url]: https://github.com/alexpfau/calendar-card-pro/actions/workflows/hacs-validate.yml
[github-release-img]: https://img.shields.io/github/release/alexpfau/calendar-card-pro.svg
[github-downloads-img]: https://img.shields.io/github/downloads/alexpfau/calendar-card-pro/total.svg
[github-latest-downloads-img]: https://img.shields.io/github/downloads/alexpfau/calendar-card-pro/latest/total.svg
[github-release-url]: https://github.com/alexpfau/calendar-card-pro/releases
