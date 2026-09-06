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

|                                                                                            |                                               |
| ------------------------------------------------------------------------------------------ | --------------------------------------------- |
| 🚀 [Installation](https://calendar-card-pro.alexpfau.com/guide/installation)               | Set the card up via HACS or manually          |
| 📌 [Usage](https://calendar-card-pro.alexpfau.com/guide/usage)                             | Add the card and configure it visually        |
| ✨ [Features & Configuration](https://calendar-card-pro.alexpfau.com/features/editor)      | Weather, templates, layout, actions, and more |
| 📚 [Configuration Options](https://calendar-card-pro.alexpfau.com/reference/configuration) | Complete reference for every option           |
| 💡 [Examples](https://calendar-card-pro.alexpfau.com/reference/examples)                   | Ready-made configurations to copy             |
| 🆕 [Release Notes](https://calendar-card-pro.alexpfau.com/RELEASE_NOTES)                   | Full history of every release                 |

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

1. **Download** both files from the latest release:  
   👉 [calendar-card-pro.js](https://github.com/alexpfau/calendar-card-pro/releases/latest)
   and [editor.js](https://github.com/alexpfau/calendar-card-pro/releases/latest)

2. **Put both files** into a folder of their own under `www`:  
   /config/www/calendar-card-pro/

   The card ships as two files: `calendar-card-pro.js` and `editor.js`. Both must sit in
   the same folder, and `calendar-card-pro.js` is the only one you name as a resource —
   the card loads the editor itself, when you open it. Use a subfolder rather than
   `/config/www/` directly: that folder is shared by every hand-installed card, and
   `editor.js` is a common enough name that another file can take it. HACS does all of
   this for you, which is why it is the recommended route.

3. **Navigate to:**
   Home Assistant → Settings → Dashboards → Resources → Add Resource

4. **Add the resource** to your Lovelace Dashboard:

```yaml
url: /local/calendar-card-pro/calendar-card-pro.js
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

**➡️ From here, [Usage](https://calendar-card-pro.alexpfau.com/guide/usage) walks you through multiple calendars, per-calendar colors and compact mode. Every available option is listed in the [Configuration reference](https://calendar-card-pro.alexpfau.com/reference/configuration), and more ready-made setups are in [Examples](https://calendar-card-pro.alexpfau.com/reference/examples).**

<p align="right"><a href="#top">⬆️ back to top</a></p>

## 4️⃣ What's New

**➡️ View the [Full Release Notes](https://calendar-card-pro.alexpfau.com/RELEASE_NOTES) for a complete list of features.**

### Latest Release: v5.0

- 🗓️ **Grid View**: Set [`view: grid`](https://calendar-card-pro.alexpfau.com/features/grid-view) and days become columns against a shared hour axis, each event drawn at its real start time and sized by how long it runs — the week view a calendar app gives you, in a Lovelace card. Overlapping events sit side by side, and when more overlap than will fit the rest collapse into a counted `+N` block
- 🕒 **A Line Across Today**: [`show_now_line`](https://calendar-card-pro.alexpfau.com/features/grid-view) marks the current time on today's column only, and only while it falls inside the hours you draw
- 🏷️ **An All-Day Band**: all-day and multi-day events get their own rows above the axis, spanning the days they cover, so they never compete with the hour grid for space
- ⚙️ **An Axis You Set**: `start_time`, `end_time`, `hour_height`, `slot_minutes` and `axis_width` decide which hours are drawn and how they are ruled, and the grid sheds columns or falls back to the list when it runs out of width
- 🐛 **Tap, Hold and Background Work**: a run over the card's shared machinery fixed defects every view has carried since v4 — a stray action sent on every tap of a default card, a hold indicator left stranded on the dashboard by a second finger or drawn away from your finger on a scrolled page, holds cancelled by the slightest movement, and cards that kept fetching after you switched dashboard tabs

### v4.2

- 🧑 **A Shared Event Shows Every Calendar's Label**: With duplicates filtered, an event two calendars hold kept one row and one label, so a lunch you and your partner both have showed only one of you. That row now draws [the label of every calendar it came from](https://calendar-card-pro.alexpfau.com/features/core-settings#labeling-coloring-shared-events) — both faces instead of one, with identical labels drawn once. Colors are unchanged, and nothing changes unless you both filter duplicates and label your calendars
- 🎨 **A Color for Events Two Calendars Share**: [`duplicate_accent_color`](https://calendar-card-pro.alexpfau.com/features/core-settings#labeling-coloring-shared-events) accents every merged event in a color of its own — the labels say who an event belongs to, this says at a glance that it is shared. Only fires across different calendars; unset, nothing changes

### v4.1

- 🏷️ **All-Day Events, as a Pill**: [`allday_badge`](https://calendar-card-pro.alexpfau.com/features/event-content#the-all-day-badge) draws a rounded pill in each calendar's own color, around the event title the way Google and Apple Calendar do, or beside the clock, `allday_badge_style` offers four shapes and `allday_badge_color` picks the color they are drawn in — each calendar's own, the row's own text color, or one you name. Off by default; try `allday_badge: title` first
- 🎨 **Follow Home Assistant's Calendar Colors and Icons**: Set `accent_color` to `home-assistant` and each calendar takes [the color Home Assistant holds for it](https://calendar-card-pro.alexpfau.com/features/core-settings). Set its `label` the same way for [that calendar's icon](https://calendar-card-pro.alexpfau.com/features/core-settings#following-the-icon-from-home-assistant)
- 🧑 **A Person's Photo in Front of Their Calendar**: Set a calendar's `label` to a person entity ID and the card shows [that person's picture](https://calendar-card-pro.alexpfau.com/features/core-settings#showing-a-persons-picture) — faces instead of words on a household dashboard
- 🗂️ **Split One Calendar by Event Type**: [`event_type`](https://calendar-card-pro.alexpfau.com/features/core-settings) takes `all`, `timed` or `all_day`, card-wide or per calendar — list one calendar twice for a color on each, and [**Duplicate** in the editor](https://calendar-card-pro.alexpfau.com/features/editor#per-calendar-panels-actions) builds it for you
- 🔍 **Two New Per-Calendar Filters**: [`allday_expires_at`](https://calendar-card-pro.alexpfau.com/features/core-settings#retiring-all-day-events-during-the-day) retires an all-day event partway through the day, so a bin collection stops sitting on the card until midnight, and [`days_of_week`](https://calendar-card-pro.alexpfau.com/features/core-settings#showing-a-calendar-on-weekdays-only) keeps one calendar to weekdays or weekends
- 💬 **Teams Meetings Get the Teams Icon**: online meetings show [the Teams logo instead of a map pin](https://calendar-card-pro.alexpfau.com/features/event-content#the-location-icon) automatically, in any language Teams writes them in — or set `location_icon` on a calendar to name a different one
- 🎂 **Ages on Birthdays, Counts on Anniversaries**: Write `YEAR=1976` in a birthday event's description and the card appends the age to the title — [nothing to configure](https://calendar-card-pro.alexpfau.com/features/event-content#birthday-ages-anniversary-counts), and it stays right every year
- ✏️ **Rewrite What an Event Says**: [`replace_pattern`, `replace_with` and `replace_field`](https://calendar-card-pro.alexpfau.com/features/core-settings#text-replacement) rewrite one field of a calendar's events as the card draws them, leaving the calendar untouched. [One Calendar, Many Purposes](https://calendar-card-pro.alexpfau.com/guide/one-calendar-many-purposes) puts this and three of the options above into a single card

### v4.0

- 🗓️ **Column View**: Lay the days [side by side, one column each](https://calendar-card-pro.alexpfau.com/features/column-view), instead of stacking them — the same agenda, rotated, with its own per-view overrides and a responsive fallback to the list layout
- ⚙️ **Rebuilt Visual Editor**: Nine panels built on Home Assistant's own form components, with a [search box that finds any setting by name or YAML key](https://calendar-card-pro.alexpfau.com/features/editor#search-customized-only), a customized-only filter, per-calendar settings, and [per-view exceptions](https://calendar-card-pro.alexpfau.com/features/editor#view-exceptions)
- ⚡ **41% Smaller to Download**: The editor moved into a file the card fetches only when you open it, taking it and all its translations off the path every dashboard pays for
- ⚡ **Fewer Round-Trips on Every Page Load**: One card load asked Home Assistant for the same events up to four times; requests are now deduplicated, and two display-only switches no longer discard a valid cache entry
- 🌍 **Eleven Editor Languages**: Nine newly translated in full — German, Estonian, Italian, Latvian, Lithuanian, Norwegian Bokmål, Polish, Slovak and Swedish — alongside US and British English, with per-string fallback so a partial translation still renders
- 📏 **Per-Field Line Limits**: Cap the lines used by a title, time or location with [`title_max_lines`, `time_max_lines` and `location_max_lines`](https://calendar-card-pro.alexpfau.com/features/event-content#limiting-lines-per-field)
- 🌦️ **Weather in Column View**: A row of its own beneath the time, optionally [stating the condition in words](https://calendar-card-pro.alexpfau.com/features/weather#weather-in-the-column-layout) in your language
- 🐛 **Dates, Clocks and Week Numbers**: [Week numbers](https://calendar-card-pro.alexpfau.com/features/layout-appearance#week-numbers-visual-separators) were wrong for one date in seven outside UTC, the clock format disagreed with Home Assistant's own locale data for 33 of its 64 languages, and `first_day_of_week: system` returned Monday to everyone
- ⚠️ **Breaking**: Manual installs now copy [two files](https://calendar-card-pro.alexpfau.com/guide/installation#manual-installation), `event_icon_vertical_alignment` defaults to `top`, and weather badges are styled through [custom properties](https://calendar-card-pro.alexpfau.com/features/theming#weather-custom-properties) instead of inline styles

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
