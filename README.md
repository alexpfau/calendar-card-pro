<a name="top"></a>

# Calendar Card Pro for Home Assistant

[![hacs][hacs-img]][hacs-url] [![GitHub Release][github-release-img]][github-release-url] [![Downloads][github-downloads-img]][github-release-url] [![Downloads@latest][github-latest-downloads-img]][github-release-url]

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/header.png" alt="Calendar Card Pro Preview" width="100%">

## ☕ Support This Project

If you find **Calendar Card Pro** useful, consider supporting its development:

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/alexpfau)
[![GitHub Sponsors](https://img.shields.io/badge/Sponsor%20on%20GitHub-30363d?style=for-the-badge&logo=github&logoColor=white)](https://github.com/sponsors/alexpfau)

<p>&nbsp;</p>

## 📖 Documentation

[![Read the Documentation](https://img.shields.io/badge/%F0%9F%93%96_Read_the_Documentation-calendar--card--pro.alexpfau.com-6a2654?style=for-the-badge&labelColor=3a2a6e)](https://calendar-card-pro.alexpfau.com)

This README covers installation and a quick start. **Everything else** — every configuration
option, all features and worked examples — lives on the
**[documentation site](https://calendar-card-pro.alexpfau.com)**, which is searchable and
always matches the latest release.

| | |
| --- | --- |
| 🚀 [Installation](https://calendar-card-pro.alexpfau.com/guide/installation) | Set the card up via HACS or manually |
| 📌 [Usage](https://calendar-card-pro.alexpfau.com/guide/usage) | Add the card and configure it visually |
| ✨ [Features & Configuration](https://calendar-card-pro.alexpfau.com/features/editor) | Weather, templates, layout, actions, and more |
| 📚 [Configuration Options](https://calendar-card-pro.alexpfau.com/reference/configuration) | Complete reference for every option |
| 💡 [Examples](https://calendar-card-pro.alexpfau.com/reference/examples) | Ready-made configurations to copy |
| 🆕 [Release Notes](https://calendar-card-pro.alexpfau.com/RELEASE_NOTES) | Full history of every release |

<p>&nbsp;</p>

## 1️⃣ Overview

### 🔍 About

**Calendar Card Pro** was inspired by a beautiful [calendar design using button-card and Hass calendar add-on](https://community.home-assistant.io/t/calendar-add-on-some-calendar-designs/385790) shared in the Home Assistant community. While the original design was visually stunning, implementing it with **button-card** and **card-mod** led to **performance issues**.

This motivated me to create a **dedicated calendar card** that excels in one thing: **displaying upcoming events beautifully and efficiently**.

Built with **performance in mind**, the card leverages **intelligent refresh mechanisms** and **smart caching** to ensure a **smooth experience**, even when multiple calendars are in use.

### ✨ Features

- 🎨 **Sleek & Minimalist Design** – Clean, modern, and visually appealing layout.
- ✅ **Multi-Calendar Support** – Display multiple calendars with unique styling.
- 📅 **Compact & Expandable Views** – Adaptive views to suit different dashboard needs.
- ⚙️ **Visual Configuration Editor** – Intuitive interface for effortless card setup.
- 🔧 **Highly Customizable** – Fine-tune layout, colors, event details, and behavior.
- 🌦️ **Weather Integration** – Display weather forecasts alongside your calendar events.
- ⚡ **Optimized Performance** – Smart caching, progressive rendering, and minimal API calls.
- 💡 **Deep Home Assistant Integration** – Theme-aware with native ripple effects.
- 🌍 **Multi-Language Support** – [Available in 35 languages](https://calendar-card-pro.alexpfau.com/contributing#adding-translations), community contributions welcome!

### 🔗 Dependencies

**Calendar Card Pro** requires at least **one calendar entity** in Home Assistant. It is compatible with any integration that generates `calendar.*` entities, with **CalDAV** and **Google Calendar** being the primary tested integrations.

⚠️ **Important:** Ensure you have at least **one calendar integration set up** in Home Assistant before using this card.

<p align="right"><a href="#top">⬆️ back to top</a></p>

## 2️⃣ Installation

### 📦 HACS Installation (Recommended)

The easiest way to install **Calendar Card Pro** is via **[HACS (Home Assistant Community Store)](https://hacs.xyz/)**.

[![Open in HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=alexpfau&repository=calendar-card-pro&category=plugin)

#### Steps:

1. Ensure **[HACS](https://hacs.xyz/docs/setup/download)** is installed in Home Assistant.
2. Go to **HACS → Frontend → Custom Repositories**.
3. Add this repository: `https://github.com/alexpfau/calendar-card-pro` as type `Dashboard`
4. Install **Calendar Card Pro** from HACS.
5. **Clear your browser cache** and reload Home Assistant.

### 📂 Manual Installation

<details>
<summary>📖 Click to expand manual installation instructions</summary>

#### Steps:

1. **Download** the latest release:  
   👉 [calendar-card-pro.zip](https://github.com/alexpfau/calendar-card-pro/releases/latest)

2. **Extract all files** into your Home Assistant `www` folder:  
   /config/www/

   The card ships as two files: `calendar-card-pro.js` and `editor.js`. Both must sit in
   the same folder, and `calendar-card-pro.js` is the only one you name as a resource —
   the card loads the editor itself, when you open it. HACS does all of this for you,
   which is why it is the recommended route.

3. **Navigate to:**
   Home Assistant → Settings → Dashboards → Resources → Add Resource

4. **Add the resource** to your Lovelace Dashboard:

```yaml
url: /local/calendar-card-pro.js
type: module
```

5. **Clear cache & refresh** your browser to apply changes.

</details>

<p align="right"><a href="#top">⬆️ back to top</a></p>

## 3️⃣ Quick Start

Add the card from your dashboard's **➕ Add Card** picker — search for `"Calendar"` — then click
the three dots (⋮) → **Configure** to open the visual editor.

> **Shortcut (Home Assistant 2026.6+):** In the card picker, switch to the **By entity** tab and pick any `calendar.*` entity. Calendar Card Pro is offered under **Community**, already pointed at that calendar and previewed with its real events.

Prefer YAML? This is a complete, working configuration:

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.family
days_to_show: 3
show_location: false
show_month: false
```

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_1_basic_native.png" alt="Basic Configuration" width="600">

Swap `calendar.family` for one of your own `calendar.*` entities and you have a working card.

**➡️ From here, [Usage](https://calendar-card-pro.alexpfau.com/guide/usage) walks you through multiple calendars, per-calendar colours and compact mode. Every available option is listed in the [Configuration reference](https://calendar-card-pro.alexpfau.com/reference/configuration), and more ready-made setups are in [Examples](https://calendar-card-pro.alexpfau.com/reference/examples).**

<p align="right"><a href="#top">⬆️ back to top</a></p>

## 4️⃣ What's New

**➡️ View the [Full Release Notes](https://calendar-card-pro.alexpfau.com/RELEASE_NOTES) for a complete list of features.**

### Latest Release: v4.0

- 🗓️ **Column View**: Lay the days [side by side, one column each](https://calendar-card-pro.alexpfau.com/features/column-view), instead of stacking them — the same agenda, rotated, with its own per-view overrides and a responsive fallback to the list layout
- ⚙️ **Rebuilt Visual Editor**: Nine panels built on Home Assistant's own form components, with [search, a customized-only filter](https://calendar-card-pro.alexpfau.com/features/editor#search-customized-only), per-calendar settings, and [per-view exceptions](https://calendar-card-pro.alexpfau.com/features/editor#column-view-exceptions)
- 🌍 **Nine Fully Translated Editor Languages**: German, Estonian, Italian, Latvian, Lithuanian, Norwegian Bokmål, Polish, Slovak and Swedish, complete — with per-string fallback so a partial translation still renders
- ⚡ **41% Smaller to Download**: The editor moved into a file the card fetches only when you open it, taking it and all its translations off the path every dashboard pays for
- 📏 **Per-Field Line Limits**: Cap the lines used by a title, time or location with [`title_max_lines`, `time_max_lines` and `location_max_lines`](https://calendar-card-pro.alexpfau.com/features/event-content#limiting-lines-per-field)
- 🌦️ **Weather in Column View**: A row of its own beneath the time, optionally [stating the condition in words](https://calendar-card-pro.alexpfau.com/features/weather#weather-in-the-column-layout) in your language
- ⚠️ **Breaking**: Manual installs now copy [two files](https://calendar-card-pro.alexpfau.com/guide/installation#manual-installation), `event_icon_vertical_alignment` defaults to `top`, and weather badges are styled through [custom properties](https://calendar-card-pro.alexpfau.com/features/theming#weather-custom-properties) instead of inline styles

### v3.5

- 🫥 **Empty State Control**: [Remove the card entirely](https://calendar-card-pro.alexpfau.com/features/event-content#calendar-events-display) when there are no upcoming events, or replace "No upcoming events" with [your own wording](https://calendar-card-pro.alexpfau.com/features/event-content#custom-empty-day-text)
- 📅 **Flexible Start Dates**: [Anchor the view to the week or a weekday](https://calendar-card-pro.alexpfau.com/features/start-date-offset#start-date-configuration) with `start_of_week`, `saturday`, and composable offsets like `start_of_week+7`
- 🏷️ **Templated Titles**: Render the card title from a [Home Assistant template](https://calendar-card-pro.alexpfau.com/features/title-templates#dynamic-titles-with-templates), updating live from sensors or the current date
- 🔎 **Suggested in the Card Picker**: Home Assistant 2026.6+ offers the card under **Community** when you [add a card by entity](https://calendar-card-pro.alexpfau.com/guide/usage#adding-the-card-to-your-dashboard) and pick a calendar
- 🐛 **Card Title Sizing**: Titles rendered as plain body text after Home Assistant dropped the Polymer font variables; they are back at their intended size and weight
- 🐛 **Failed Calendars No Longer Look Empty**: An unreachable calendar now shows an error instead of claiming there are no events — which could silently hide the card

### v3.4

- ⏳ **All-Day Countdown Control**: Hide countdowns on all-day events while keeping them on timed ones with [`show_countdown_allday`](https://calendar-card-pro.alexpfau.com/features/event-content#countdown-display)
- 🌤️ **Weather Across the Full Range**: Timed events beyond Home Assistant's hourly forecast horizon now [fall back to the daily forecast](https://calendar-card-pro.alexpfau.com/features/weather#weather-configuration-options) instead of showing nothing
- 🐛 **All-Day Countdowns Off By One**: Now measured in whole calendar days instead of from the current instant
- ⚡ **Faster Rendering**: Color resolution is cached, removing hundreds of forced layouts per refresh on large calendars

### v3.3

- 🌍 **Two New Languages**: British English and Latvian (35 total), with editor translations for Italian, British English, and Latvian (11 total)
- 🐛 **HA 2026.5+ Visual Editor**: Restored the text input fields, which vanished entirely after Home Assistant removed `ha-textfield`
- 🐛 **`event_color` Fix**: No longer ignored when no per-entity color is configured

_Older releases are covered in the [Full Release Notes](https://calendar-card-pro.alexpfau.com/RELEASE_NOTES)._

<p align="right"><a href="#top">⬆️ back to top</a></p>

## 5️⃣ Contributing

Want to improve **Calendar Card Pro**? I welcome contributions of all kinds — whether it's
**fixing bugs, improving performance, or adding new features**!

```sh
git clone https://github.com/alexpfau/calendar-card-pro.git
npm install
npm run dev
```

Then open a Pull Request against the `dev` branch.

- 📋 [Contributing guide](https://calendar-card-pro.alexpfau.com/contributing) — full workflow, coding standards, and how to add a translation
- 🏗️ [Architecture documentation](https://calendar-card-pro.alexpfau.com/architecture) — module responsibilities, data flow, and performance design
- 🌍 **Adding a translation?** The card speaks [35 languages](https://calendar-card-pro.alexpfau.com/contributing#adding-translations) and the visual editor 11 — new ones are always welcome.

💡 Got a feature request? **Open a GitHub Issue** or start a **discussion**!

### 🏆 Acknowledgements

- **Original design inspiration** from [Calendar Add-on & Calendar Designs](https://community.home-assistant.io/t/calendar-add-on-some-calendar-designs/385790) by **[@kdw2060](https://github.com/kdw2060)**.
- **Interaction patterns** inspired by Home Assistant's [Tile Card](https://github.com/home-assistant/frontend/blob/dev/src/panels/lovelace/cards/hui-tile-card.ts), which is licensed under the [Apache License 2.0](https://github.com/home-assistant/frontend/blob/dev/LICENSE.md).
- **Material Design ripple interactions**, originally by Google, used under the [Apache License 2.0](https://github.com/material-components/material-components-web/blob/master/LICENSE).

Calendar Card Pro is released under the [MIT License](./LICENSE). Full third-party attributions are listed in [NOTICE](./NOTICE).

<p align="right"><a href="#top">⬆️ back to top</a></p>

 <!--Badges-->

[hacs-img]: https://img.shields.io/badge/HACS-Custom-orange.svg
[hacs-url]: https://github.com/alexpfau/calendar-card-pro/actions/workflows/hacs-validate.yml
[github-release-img]: https://img.shields.io/github/release/alexpfau/calendar-card-pro.svg
[github-downloads-img]: https://img.shields.io/github/downloads/alexpfau/calendar-card-pro/total.svg
[github-latest-downloads-img]: https://img.shields.io/github/downloads/alexpfau/calendar-card-pro/latest/total.svg
[github-release-url]: https://github.com/alexpfau/calendar-card-pro/releases
