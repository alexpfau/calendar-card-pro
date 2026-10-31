<a name="top"></a>

# Calendar Card Pro for Home Assistant

[![hacs][hacs-img]][hacs-url] [![GitHub Release][github-release-img]][github-latest-url] [![Downloads][github-downloads-img]][github-release-url] [![Downloads@latest][github-latest-downloads-img]][github-latest-url]

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/header_landing.png" alt="Calendar Card Pro for Home Assistant: a family's week in grid view, under a toolbar with a layout switcher and a chip for each calendar" width="100%">

## ☕ Support This Project

If you find **Calendar Card Pro** useful, consider supporting its development:

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/alexpfau)
[![GitHub Sponsors](https://img.shields.io/badge/Sponsor%20on%20GitHub-30363d?style=for-the-badge&logo=github&logoColor=white)](https://github.com/sponsors/alexpfau)

<p>&nbsp;</p>

## 🎬 Video Review

[![Watch the v5 video review on YouTube](https://img.shields.io/badge/Watch_the_v5_Video_Review-Smart--Live%2C_in_German-c4302b?style=for-the-badge&logo=youtube&logoColor=white&labelColor=282828)](https://youtu.be/ptXdis8WHXo)

Smart-Live has the exclusive first video review of v5, in German: [Calendar Card Pro 5: Endlich ZEITRASTER für deinen Familienkalender in Home Assistant](https://youtu.be/ptXdis8WHXo)

<p>&nbsp;</p>

## 📖 Documentation

[![Read the Documentation](https://img.shields.io/badge/%F0%9F%93%96_Read_the_Documentation-calendar--card--pro.alexpfau.com-6a2654?style=for-the-badge&labelColor=3a2a6e)](https://calendar-card-pro.alexpfau.com)

This README covers installation and a quick start. **Everything else** — every configuration
option, all features and worked examples — lives on the
**[documentation site](https://calendar-card-pro.alexpfau.com)**, which is searchable and
always matches the latest release.

|                                                                                            |                                                          |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| 🚀 [Installation](https://calendar-card-pro.alexpfau.com/guide/installation)               | Set the card up via HACS or manually                     |
| 📌 [Usage](https://calendar-card-pro.alexpfau.com/guide/usage)                             | Add the card and configure it visually                   |
| ✨ [Features & Configuration](https://calendar-card-pro.alexpfau.com/features/editor)      | Layouts, the toolbar, weather, actions, theming and more |
| 📚 [Configuration Options](https://calendar-card-pro.alexpfau.com/reference/configuration) | Complete reference for every option                      |
| 💡 [Example Stories](https://calendar-card-pro.alexpfau.com/reference/examples)            | Complete cards for real setups, ready to copy            |
| 🆕 [Release Notes](https://calendar-card-pro.alexpfau.com/RELEASE_NOTES)                   | Full history of every release                            |

<p>&nbsp;</p>

## 1️⃣ Overview

### 🔍 About

**Calendar Card Pro** was inspired by a beautiful [calendar design using button-card and Hass calendar add-on](https://community.home-assistant.io/t/calendar-add-on-some-calendar-designs/385790) shared in the Home Assistant community. While the original design was visually stunning, implementing it with **button-card** and **card-mod** led to **performance issues**.

This motivated me to create a **dedicated calendar card**. It started out doing one thing well, **displaying upcoming events beautifully and efficiently**, and has since grown into a calendar you can work with right on the dashboard: **three layouts**, a **toolbar** to page through the dates and switch between them, and **adding, opening and editing events** through Home Assistant's own dialogs.

**Performance** is still the foundation: cached events are on screen the moment a dashboard opens, every calendar loads in parallel, and the visual editor is only downloaded when you open it.

### ✨ Features

- 🗓️ **List, Columns & Grid** – Stack the days as an agenda, lay them [side by side](https://calendar-card-pro.alexpfau.com/features/column-view), or draw them [hour by hour](https://calendar-card-pro.alexpfau.com/features/grid-view), each event sized by how long it runs.
- 🧰 **A Toolbar on the Card** – [Page through the dates, switch layouts, show or hide each calendar and refresh](https://calendar-card-pro.alexpfau.com/features/layout-appearance#header-toolbar), each device remembering its layout and which calendars it shows.
- ✏️ **Add & Edit Events** – Open, add, edit and delete events from the card through [Home Assistant's own dialogs](https://calendar-card-pro.alexpfau.com/features/actions#home-assistants-own-dialogs), as far as each calendar allows.
- ✅ **Many Calendars, One Card** – Give each calendar its own color, label or [a person's photo](https://calendar-card-pro.alexpfau.com/features/core-settings#showing-a-persons-picture) and its own filters; an event on several calendars [can be merged into one](https://calendar-card-pro.alexpfau.com/features/core-settings#labeling-coloring-shared-events).
- ⚙️ **Visual Editor** – Set the card up in the UI, with a [search box](https://calendar-card-pro.alexpfau.com/features/editor#search-customized-only) that finds any setting by name or YAML key.
- 🌦️ **Weather** – [Forecasts](https://calendar-card-pro.alexpfau.com/features/weather) in the date column or beside each event.
- 🎨 **Fits Your Theme** – Follows your Home Assistant theme and its primary color, with [custom properties](https://calendar-card-pro.alexpfau.com/features/theming) for finer styling.
- ⚡ **Optimized Performance** – Cached events on screen the moment a dashboard opens, and every calendar loaded in parallel.
- 🌍 **Multi-Language Support** – [Available in 36 languages](https://calendar-card-pro.alexpfau.com/contributing#adding-translations), with the visual editor in 12. Community contributions welcome!

### 🔗 Requirements

**Calendar Card Pro** needs at least one **calendar entity** in Home Assistant, from any integration that creates `calendar.*` entities, such as Local Calendar, Google Calendar or CalDAV. Whether you can add, edit and delete events from the card depends on the calendar's integration and on the event itself; [Editing & Deleting Events](https://calendar-card-pro.alexpfau.com/features/actions#editing-deleting-events) has the details.

<p align="right"><a href="#top">⬆️ back to top</a></p>

## 2️⃣ Installation

### 📦 HACS Installation (Recommended)

The easiest way to install **Calendar Card Pro** is via **[HACS (Home Assistant Community Store)](https://hacs.xyz/)**. It is listed in the HACS default repositories, so there is no custom repository to add.

[![Open in HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=alexpfau&repository=calendar-card-pro&category=plugin)

#### Steps:

1. Ensure **[HACS](https://hacs.xyz/docs/setup/download)** is installed in Home Assistant.
2. Open **HACS** and search for **Calendar Card Pro**, or use the button above.
3. Open it and select **Download**.
4. **Reload** Home Assistant in your browser, and clear the browser cache if an older version still shows.

### 📂 Manual Installation

<details>
<summary>📖 Click to expand manual installation instructions</summary>

#### Steps:

1. **Download** both files from the latest release:  
   👉 [calendar-card-pro.js](https://github.com/alexpfau/calendar-card-pro/releases/latest/download/calendar-card-pro.js)
   and [editor.js](https://github.com/alexpfau/calendar-card-pro/releases/latest/download/editor.js)

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

5. **Refresh** your browser. After a later update, clear its cache as well, or the old version can stay loaded.

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

**➡️ From here, the [Example Stories](https://calendar-card-pro.alexpfau.com/reference/examples) show complete cards to copy, from a family's week on a wall tablet to a small tile on a phone. [Usage](https://calendar-card-pro.alexpfau.com/guide/usage) covers adding and configuring the card, and every available option is listed in the [Configuration reference](https://calendar-card-pro.alexpfau.com/reference/configuration).**

<p align="right"><a href="#top">⬆️ back to top</a></p>

## 4️⃣ What's New

**➡️ View the [Full Release Notes](https://calendar-card-pro.alexpfau.com/RELEASE_NOTES) for a complete list of features.**

### Latest Release: v5.0

- 🗓️ **Grid View**: Set [`view: grid`](https://calendar-card-pro.alexpfau.com/features/grid-view) and days become columns against a shared hour axis, each event drawn at its real start time and sized by how long it runs. An event that starts inside a longer one is drawn on top of it, the way your calendar app draws a day, all-day events span their dates in a band above the axis, and a line marks the current time on today's column
- 🧰 **A Toolbar on the Card**: [`toolbar: { show: true }`](https://calendar-card-pro.alexpfau.com/features/layout-appearance#header-toolbar) adds the card's own controls to its header: page through the dates, switch between List, Columns and Grid, show or hide each calendar, and refresh, each device remembering its own choices. `reset: true` adds a button that puts a shared wall tablet back the way it is set up
- 👆 **Add, Open, Change & Delete Events**: an add button opens Home Assistant's own new-event dialog, and [`event_tap_action: details`](https://calendar-card-pro.alexpfau.com/features/actions#tapping-an-event) opens a tapped event in full, with Edit and Delete wherever the calendar allows them
- 📍 **Today & Now at a Glance**: today's date sits on a [soft tile](https://calendar-card-pro.alexpfau.com/features/layout-appearance#today-indicator), an event under way is [marked "Now" in green](https://calendar-card-pro.alexpfau.com/features/event-content#the-now-indicator), and accents follow your theme's primary color instead of a fixed blue. ⚠️ All three are on by default, and the accent bar beside each event is now [`.event-accent-bar`](https://calendar-card-pro.alexpfau.com/features/theming), so a card-mod rule styling `border-left` on `.event` no longer reaches it. The [release notes](https://calendar-card-pro.alexpfau.com/RELEASE_NOTES) say how to keep the v4 look
- 📚 **Example Stories**: [six complete cards](https://calendar-card-pro.alexpfau.com/reference/examples), each built for a real place in a home, from a family's wall tablet to a bin-day tile, with the YAML to copy and what each part adds
- ⚡ **Your Events the Moment the Dashboard Opens**: cached events draw straight away while the card checks for news in the background, every calendar is requested at once, `refresh_interval` is kept instead of doubled, and a calendar that fails to load is [named on the card](https://calendar-card-pro.alexpfau.com/features/performance#when-a-calendar-fails-to-load)

### v4.2

- 🧑 **Shared Events, Clearly Marked**: Merged duplicates show [every contributing calendar's label](https://calendar-card-pro.alexpfau.com/features/core-settings#labeling-coloring-shared-events) instead of only the first; set `duplicate_accent_color` to give shared events a color of their own
- 🐛 **Countdowns Follow Calendar Dates**: [Countdowns](https://calendar-card-pro.alexpfau.com/features/event-content#countdown-display) now say "tomorrow" for the next date and stop skipping days between later dates; same-day starts keep clock countdowns, while distant dates retain natural month/year wording

### v4.1

- 🏷️ **All-Day Events, as a Pill**: [`allday_badge`](https://calendar-card-pro.alexpfau.com/features/event-content#the-all-day-badge) draws a rounded pill in each calendar's own color, around the event title the way Google and Apple Calendar do, or beside the clock, `allday_badge_style` offers four shapes and `allday_badge_color` picks the color they are drawn in — each calendar's own, the row's own text color, or one you name. Off by default; try `allday_badge: title` first
- 🎨 **Follow Home Assistant's Calendar Colors and Icons**: Set `accent_color` to `home-assistant` and each calendar takes [the color Home Assistant holds for it](https://calendar-card-pro.alexpfau.com/features/core-settings). Set its `label` the same way for [that calendar's icon](https://calendar-card-pro.alexpfau.com/features/core-settings#following-the-icon-from-home-assistant)
- 🧑 **A Person's Photo in Front of Their Calendar**: Set a calendar's `label` to a person entity ID and the card shows [that person's picture](https://calendar-card-pro.alexpfau.com/features/core-settings#showing-a-persons-picture) — faces instead of words on a household dashboard

### v4.0

- 🗓️ **Column View**: Lay the days [side by side, one column each](https://calendar-card-pro.alexpfau.com/features/column-view), instead of stacking them — the same agenda, rotated, with its own per-view overrides and a responsive fallback to the list layout
- ⚙️ **Rebuilt Visual Editor**: Nine panels built on Home Assistant's own form components, with a [search box that finds any setting by name or YAML key](https://calendar-card-pro.alexpfau.com/features/editor#search-customized-only), a customized-only filter, per-calendar settings, and [per-view exceptions](https://calendar-card-pro.alexpfau.com/features/editor#view-exceptions)
- ⚡ **41% Smaller to Download**: The editor moved into a file the card fetches only when you open it, taking it and all its translations off the path every dashboard pays for

_Older releases are covered in the [Full Release Notes](https://calendar-card-pro.alexpfau.com/RELEASE_NOTES)._

<p align="right"><a href="#top">⬆️ back to top</a></p>

## 5️⃣ Contributing

Want to improve **Calendar Card Pro**? Contributions of all kinds are welcome, from bug fixes
and translations to new features. Pull requests go against the `dev` branch.

- 📋 [Contributing guide](https://calendar-card-pro.alexpfau.com/contributing) — setup, workflow, coding standards, and how to add a translation
- 🏗️ [Architecture documentation](https://calendar-card-pro.alexpfau.com/architecture) — module responsibilities, data flow, and performance design
- 🌍 **Adding a translation?** The card speaks [36 languages](https://calendar-card-pro.alexpfau.com/contributing#adding-translations) and the visual editor 12 — new ones are always welcome.
- 🐛 **Found a bug or have an idea?** [Open an issue](https://github.com/alexpfau/calendar-card-pro/issues/new/choose).
- 💬 **Questions?** Ask in the [community forum thread](https://community.home-assistant.io/t/calendar-card-pro-a-beautiful-high-performance-calendar-card-for-home-assistant/863711).

### 🏆 Acknowledgments

- **Original design inspiration** from [Calendar Add-on & Calendar Designs](https://community.home-assistant.io/t/calendar-add-on-some-calendar-designs/385790) by **[@kdw2060](https://github.com/kdw2060)**.
- **Interaction patterns** inspired by Home Assistant's [Tile Card](https://github.com/home-assistant/frontend/blob/dev/src/panels/lovelace/cards/hui-tile-card.ts), which is licensed under the [Apache License 2.0](https://github.com/home-assistant/frontend/blob/dev/LICENSE.md).
- **Material Design ripple interactions**, originally by Google, used under the [Apache License 2.0](https://github.com/material-components/material-components-web/blob/master/LICENSE).

Calendar Card Pro is released under the [MIT License](./LICENSE). Full third-party attributions are listed in [NOTICE](./NOTICE).

<p align="right"><a href="#top">⬆️ back to top</a></p>

 <!--Badges-->

[hacs-img]: https://img.shields.io/badge/HACS-Default-41BDF5.svg
[hacs-url]: https://my.home-assistant.io/redirect/hacs_repository/?owner=alexpfau&repository=calendar-card-pro&category=plugin
[github-release-img]: https://img.shields.io/github/release/alexpfau/calendar-card-pro.svg
[github-downloads-img]: https://img.shields.io/github/downloads/alexpfau/calendar-card-pro/total.svg
[github-latest-downloads-img]: https://img.shields.io/github/downloads/alexpfau/calendar-card-pro/latest/total.svg
[github-release-url]: https://github.com/alexpfau/calendar-card-pro/releases
[github-latest-url]: https://github.com/alexpfau/calendar-card-pro/releases/latest
