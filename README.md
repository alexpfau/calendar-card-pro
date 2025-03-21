# Calendar Card Pro for Home Assistant

[![hacs][hacs-img]][hacs-url] [![GitHub Release][github-release-img]][github-release-url] [![Downloads][github-downloads-img]][github-release-url]

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/header.png" alt="Calendar Card Pro Preview" width="100%">

## Table of Contents

- [1️⃣ Overview](#1️⃣-overview)
- [2️⃣ Installation](#2️⃣-installation)
- [3️⃣ Usage](#3️⃣-usage)
- [4️⃣ Configuration Guide](#4️⃣-configuration-guide)
- [5️⃣ Examples](#5️⃣-examples)
- [6️⃣ Contributing & Roadmap](#6️⃣-contributing--roadmap)

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
- 🔧 **Highly Customizable** – Fine-tune layout, colors, event details, and behavior.
- ⚡ **Optimized Performance** – Smart caching, progressive rendering, and minimal API calls.
- 💡 **Deep Home Assistant Integration** – Theme-aware with native ripple effects.
- 🌍 **Multi-Language Support** – [Available in 24 languages](#-adding-translations), community contributions welcome!
- 🧩 **Modular & Extensible** – Designed for future enhancements and easy customization.

### 🔗 Dependencies

**Calendar Card Pro** requires at least **one calendar entity** in Home Assistant. It is compatible with any integration that generates `calendar.*` entities, with **CalDAV** and **Google Calendar** being the primary tested integrations.

⚠️ **Important:** Ensure you have at least **one calendar integration set up** in Home Assistant before using this card.

<p>&nbsp;</p>

## 2️⃣ Installation

### 📦 HACS Installation (Recommended)

The easiest way to install **Calendar Card Pro** is via **[HACS (Home Assistant Community Store)](https://hacs.xyz/)**.

[![Open in HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=alexpfau&repository=calendar-card-pro&category=plugin)

#### Steps:

1. Ensure **[HACS](https://hacs.xyz/docs/setup/download)** is installed in Home Assistant.
2. Go to **HACS → Frontend → Custom Repositories**.
3. Add this repository: `https://github.com/alexpfau/calendar-card-pro`
4. Install **Calendar Card Pro** from HACS.
5. **Clear your browser cache** and reload Home Assistant.

### 📂 Manual Installation

<details>
<summary>📖 Click to expand manual installation instructions</summary>

#### Steps:

1. **Download** the latest release:  
   👉 [calendar-card-pro.js](https://github.com/alexpfau/calendar-card-pro/releases/latest)

2. **Move the file** to your Home Assistant `www` folder:  
   /config/www/

3. **Navigate to:**
   Home Assistant → Settings → Dashboards → Resources → Add Resource

4. **Add the resource** to your Lovelace Dashboard:

   ```yaml
   url: /local/calendar-card-pro.js
   type: module
   ```

5. **Clear cache & refresh** your browser to apply changes.

</details>

<p>&nbsp;</p>

## 3️⃣ Usage

Once **Calendar Card Pro** is installed, follow these steps to add and configure it in your Home Assistant dashboard.

### 📌 Adding the Card to Your Dashboard

1. **Ensure a Calendar Integration is Set Up**  
   Calendar Card Pro requires at least one `calendar.*` entity in Home Assistant (e.g., **Google Calendar, CalDAV**).
2. **Open Your Dashboard for Editing**

   - Navigate to **Home Assistant → Dashboard**
   - Click the three-dot menu (⋮) → **Edit Dashboard**

3. **Add Calendar Card Pro**

   - Click the ➕ **Add Card** button
   - Search for `"Calendar"` or scroll to find `"Calendar Card Pro"`
   - Select the card to add it to your dashboard

4. **Initial Setup & Configuration**
   - By default, the card will **automatically detect available calendars** and select the first one.
   - Use the **YAML mode** for advanced customization.

### ⚙️ Customizing the Card

Calendar Card Pro offers a range of **customization options** to match your needs.

- **Control which events are displayed**

  - Set `days_to_show` to define how many days are visible.
  - Use `max_events_to_show` to limit the number of events in compact mode.

- **Customize colors, fonts, and layout**

  - Apply different colors per calendar using the `color` option.
  - Adjust font sizes for event details, dates, and other elements.
  - Modify separators and spacing for a personalized look.

- **Modify tap/hold actions**
  - Set `tap_action` and `hold_action` to `expand`, `navigate`, or other HA-supported actions.

##### YAML Configuration (Example)

```yaml
type: custom:calendar-card-pro
title: 'Upcoming Events'
entities:
  - entity: calendar.family
    color: '#e63946' # Custom color for family events
  - entity: calendar.work
    color: '#457b9d' # Custom color for work events
days_to_show: 5
max_events_to_show: 5
show_location: true
```

### 🚀 Next Steps

- Explore the [📚 Configuration Guide](#4️⃣-configuration-guide) for a **detailed list of options**.
- Check out the [💡 Examples](#5️⃣-examples) section for **pre-configured setups**.
- Get involved! Check out the [Contributing & Roadmap](#6️⃣-contributing--roadmap) section to learn **how to contribute** and see **upcoming features**.

<p>&nbsp;</p>

## 4️⃣ Configuration Guide

### ⚙️ Variables

| Variable                | Type    | Default                         | Description                                                            |
| ----------------------- | ------- | ------------------------------- | ---------------------------------------------------------------------- |
| **Core Settings**       |         |                                 |                                                                        |
| entities                | array   | `[]`                            | List of calendar entities to display                                   |
| days_to_show            | number  | `3`                             | Number of days to display                                              |
| max_events_to_show      | number  | `undefined`                     | Maximum number of events to show when collapsed                        |
| language                | string  | `''`                            | Language for translations (uses HA language if empty)                  |
| **Header**              |         |                                 |                                                                        |
| title                   | string  | `''`                            | Title displayed at the top of the card                                 |
| title_font_size         | string  | `''`                            | Font size for the title                                                |
| title_color             | string  | `''`                            | Text color for the title                                               |
| **Layout and Spacing**  |         |                                 |                                                                        |
| background_color        | string  | `'var(--ha-card-background)'`   | Background color of the card                                           |
| row_spacing             | string  | `'5px'`                         | Spacing between rows                                                   |
| additional_card_spacing | string  | `'0px'`                         | Additional padding around the card                                     |
| vertical_line_width     | string  | `'2px'`                         | Width of the vertical line separator                                   |
| vertical_line_color     | string  | `'#03a9f4'`                     | Color of the vertical line separator                                   |
| horizontal_line_width   | string  | `'0px'`                         | Width of horizontal lines between days                                 |
| horizontal_line_color   | string  | `'var(--secondary-text-color)'` | Color of horizontal lines between days                                 |
| **Date Column**         |         |                                 |                                                                        |
| date_vertical_alignment | string  | `'middle'`                      | Vertical alignment of date column (`'top'`, `'middle'`, or `'bottom'`) |
| weekday_font_size       | string  | `'14px'`                        | Font size for weekday names                                            |
| weekday_color           | string  | `'var(--primary-text-color)'`   | Text color for weekday names                                           |
| day_font_size           | string  | `'26px'`                        | Font size for day numbers                                              |
| day_color               | string  | `'var(--primary-text-color)'`   | Text color for day numbers                                             |
| show_month              | boolean | `true`                          | Whether to show month names                                            |
| month_font_size         | string  | `'12px'`                        | Font size for month names                                              |
| month_color             | string  | `'var(--primary-text-color)'`   | Text color for month names                                             |
| **Event Column**        |         |                                 |                                                                        |
| show_past_events        | boolean | `false`                         | Whether to show events that have already ended                         |
| event_font_size         | string  | `'14px'`                        | Font size for event titles                                             |
| event_color             | string  | `'var(--primary-text-color)'`   | Text color for event titles                                            |
| time_24h                | boolean | `true`                          | Whether to use 24-hour time format                                     |
| show_end_time           | boolean | `true`                          | Whether to show event end times                                        |
| time_font_size          | string  | `'12px'`                        | Font size for event times                                              |
| time_color              | string  | `'var(--secondary-text-color)'` | Text color for event times                                             |
| time_icon_size          | string  | `'14px'`                        | Size of the clock icon                                                 |
| show_location           | boolean | `true`                          | Whether to show event locations                                        |
| remove_location_country | boolean | `true`                          | Whether to remove country names from locations                         |
| location_font_size      | string  | `'12px'`                        | Font size for event locations                                          |
| location_color          | string  | `'var(--secondary-text-color)'` | Text color for event locations                                         |
| location_icon_size      | string  | `'14px'`                        | Size of the location icon                                              |
| **Actions**             |         |                                 |                                                                        |
| tap_action              | object  | `{ action: 'none' }`            | Action when tapping the card                                           |
| hold_action             | object  | `{ action: 'none' }`            | Action when holding the card                                           |
| **Cache and Refresh**   |         |                                 |                                                                        |
| refresh_interval        | number  | `30`                            | Time in minutes between data refreshes                                 |

### 🗂️ Entity Configuration

The `entities` array accepts either:

1. **A simple entity ID** (default styling applies)
2. **An advanced object configuration** (custom styling per entity)

#### Example:

```yaml
entities:
  - calendar.family # Simple entity ID (default styling)
  - entity: calendar.work # Advanced entity configuration
    color: '#1e90ff' # Custom event color for this calendar
```

##### Explanation:

- A **simple string** (e.g., `calendar.family`) will apply the card’s **default styles**.
- An **object with `entity` and optional parameters** allows customization per calendar:
  - `entity`: The **calendar entity ID** (required).
  - `color`: Custom event title color (optional) – **Overrides** the default `event_color` setting.

### 🏗️ Event Display & Compact Mode

#### Default Behavior

By default, **Calendar Card Pro** displays all events for the next **3 days** (including today). This means:

- If there are **no events** in the next 3 days, the card will show an **empty state**.
- If there are **many events**, all will be displayed, making the card **taller**.
- The **card height adapts dynamically** based on content.
- By default, **past events from today are hidden**, but you can set `show_past_events: true` to display them.

#### Compact Mode

To control **Calendar Card Pro's size**, enable **compact mode** by setting `max_events_to_show`. This:

- Limits the number of events displayed at once.
- Maintains a **consistent card height**.
- Dynamically updates as new events appear.

You can **toggle between compact and full views** by configuring `tap_action` or `hold_action`.

### 🎛️ Actions

Both `tap_action` and `hold_action` support the following options:

| Action Type      | Description                                                               |
| ---------------- | ------------------------------------------------------------------------- |
| **expand**       | Toggles between compact and full view (when `max_events_to_show` is set). |
| **more-info**    | Opens the **More Info** dialog in Home Assistant.                         |
| **navigate**     | Navigates to a different **dashboard view**.                              |
| **call-service** | Calls a **Home Assistant service**.                                       |
| **url**          | Opens an **external URL**.                                                |

**Additional Parameters:**

- `navigation_path`: Path for **navigate** action.
- `url_path`: URL for **url** action.
- `service`: Home Assistant service for **call-service** action.
- `service_data`: Service payload for **call-service** action.

##### Example: Expand View on Tap

```yaml
tap_action:
  action: expand
```

##### Example: Navigate to Calendar Dashboard

```yaml
tap_action:
  action: navigate
  navigation_path: /lovelace/calendar
```

### 🏗️ Material Design Interaction

**Calendar Card Pro** integrates Home Assistant’s **native interaction patterns** for a seamless experience:

- **Ripple Effect** – Provides **visual feedback** on hover and touch.
- **Hold Actions** – Displays a **visual indicator** when the hold threshold is reached.
- **Keyboard Navigation** – Fully supports **Enter/Space** for activation.
- **Haptic Feedback** – Aligns with Home Assistant’s **design language**.

### 🔄 Smart Cache System

**Calendar Card Pro** efficiently handles API calls and refreshes:

- **Minimized API Polling** – Fetches new data **only when necessary**.
- **Automatic Refresh** – Updates **every `refresh_interval` minutes** (default: `30`).
- **Smart Caching** – Stores events locally with cache lifetime equal to the refresh interval.
- **Rate-Limited Refresh** – When manually refreshing the page, new data is fetched only if at least 5 seconds have passed since the last update, preventing excessive API calls.
- **Reactive Updates** – Events update when:
  - A **calendar entity changes**.
  - **Home Assistant reconnects** after a disconnection.
  - The **dashboard becomes active again**.

### ⚡ Progressive Rendering

To maintain performance, **Calendar Card Pro** progressively renders events:

- **Renders events in small batches** to prevent UI lag.
- **Prevents browser freezing** with optimized rendering.
- **Ensures smooth interactions** even for large event lists.

<p>&nbsp;</p>

## 5️⃣ Examples

This section provides different **configuration setups** to help you get started with **Calendar Card Pro**.

### 📅 Basic Configuration

A simple setup displaying events from a **single calendar**. Automatically **adapts to themes** and **dark/light mode**.

**With Home Assistant default theme** (light mode):  
<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_1_basic_native.png" alt="Basic Configuration" width="600">

**Using my favorite [iOS Theme](https://github.com/basnijholt/lovelace-ios-themes)** (ios-dark-mode-blue-red-alternative):  
<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_1_basic_ios.png" alt="Basic Configuration" width="600">

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.family
days_to_show: 3
show_location: false
show_month: false
```

### 🗂️ Multiple Calendars with Compact Mode

This setup includes **multiple calendars**, each with a **custom color**. The **compact mode** ensures that only a limited number of events are shown at once. Screenshots again showing **my favorite [iOS Theme](https://github.com/basnijholt/lovelace-ios-themes)** (ios-dark-mode-blue-red-alternative).

**Compact view**:  
<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_2_advanced_compact.png" alt="Advanced Configuration" width="600">

**After tap ➡️ expanded view**:  
<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_2_advanced_expanded.png" alt="Advanced Configuration" width="600">

```yaml
type: custom:calendar-card-pro
title: Upcoming events
entities:
  - entity: calendar.family
    color: '#ff6c92' # Red for family events
  - entity: calendar.work
    color: '#86ebda' # Blue for work events
  - entity: calendar.personal
    color: '#c2ffb3' # Green for personal events
days_to_show: 7
max_events_to_show: 3 # Always only show 3 events
tap_action:
  action: expand # Tap to expand/collapse
```

### 🎨 Complete Configuration with All Options

A fully **customized** configuration demonstrating **all available options**, including **styling, layout, and interactions**. Though you could **go all out**—and I didn’t—and create a **completely different look** if you wanted. Screenshot using the beautiful **[Bubble Theme](https://github.com/Clooos/Bubble)**.

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_3_complete.png" alt="Complete Configuration" width="600"><br>

```yaml
type: custom:calendar-card-pro

# Core Settings
entities:
  - entity: calendar.family
    color: '#ffdaea'
  - entity: calendar.work
    color: '#b3ffd9'
days_to_show: 10
max_events_to_show: 10
language: en

# Header
title: 📅 Full Calendar Demo
title_font_size: 26px
title_color: '#baf1ff'

# Layout and Spacing
background_color: '#eeeeee50'
row_spacing: 10px
additional_card_spacing: 0px
vertical_line_width: 0px
vertical_line_color: '#baf1ff'
horizontal_line_width: 2px
horizontal_line_color: '#baf1ff80'

# Date Column
date_vertical_alignment: middle
weekday_font_size: 14px
weekday_color: '#baf1ff'
day_font_size: 32px
day_color: '#baf1ff'
show_month: true
month_font_size: 12px
month_color: '#baf1ff'

# Event Column
show_past_events: false
event_font_size: 14px
event_color: '#baf1ff'
time_24h: true
show_end_time: true
time_font_size: 12px
time_color: '#baf1ff'
time_icon_size: 14px
show_location: true
remove_location_country: true
location_font_size: 12px
location_color: '#baf1ff'
location_icon_size: 14px

# Actions
tap_action:
  action: expand
hold_action:
  action: navigate
  navigation_path: calendar

# Cache and Refresh
refresh_interval: 15 # Auto-refresh events every 15 minutes
```

<p>&nbsp;</p>

## 6️⃣ Contributing & Roadmap

### 🚀 How to Contribute

Want to improve **Calendar Card Pro**? I welcome contributions of all kinds—whether it’s **fixing bugs, improving performance, or adding new features**!

#### Getting Started

1. **Fork this repo** and clone it locally.
2. **Install dependencies**:
   ```sh
   npm install
   ```
3. **Start development**:
   ```sh
   npm run dev
   ```
4. **Open a Pull Request** with your changes.

💡 For detailed contribution guidelines, see [CONTRIBUTING.md](./CONTRIBUTING.md).

### 📅 Roadmap & Planned Features

I am continuously working on improving **Calendar Card Pro**. Here’s what’s planned for upcoming releases:

- **Enhanced Event Details** – Support for event descriptions, recurring event indicators, and more.
- **Visual Configuration Editor** – Configure all options through an intuitive UI without writing YAML.
- **Expanded Language Support** – Adding more languages (looking for community translations).

💡 Got a feature request? **Open a GitHub Issue** or start a **discussion**!

### 📖 Developer Documentation

For those interested in contributing code, I maintain detailed **[architecture documentation](./docs/architecture.md)** that explains:

- **Code Organization** – Structure and module responsibilities.
- **Data Flow & Processing** – How events are fetched, stored, and displayed.
- **Performance Optimization** – Techniques for fast rendering and caching.
- **Design Principles** – Best practices for UI consistency and accessibility.

### 🌍 Adding Translations

**Calendar Card Pro** currently supports:

- **Czech** (`cs`)
- **Danish** (`da`)
- **Dutch** (`nl`)
- **English** (`en`)
- **Finnish** (`fi`)
- **French** (`fr`)
- **German** (`de`)
- **Greek** (`el`)
- **Hebrew** (`he`)
- **Hungarian** (`hu`)
- **Icelandic** (`is`)
- **Italian** (`it`)
- **Norwegian Bokmål** (`nb`)
- **Norwegian Nynorsk** (`nn`)
- **Polish** (`pl`)
- **Portuguese** (`pt`)
- **Russian** (`ru`)
- **Slovenian** (`sl`)
- **Spanish** (`es`)
- **Swedish** (`sv`)
- **Ukrainian** (`uk`)
- **Vietnamese** (`vi`)
- **Chinese (Simplified)** (`zh-cn`)
- **Chinese (Traditional)** (`zh-tw`)

To add a new language:

1. **Create a new file** in `src/translations/languages/[lang-code].json`
2. **Update the localize file** in `src/translations/localize.ts`
3. **Translate all strings** to your language.ations/localize.ts`
4. **Submit a Pull Request** with your changes.
5. **Submit a Pull Request** with your changes.

### 🏆 Acknowledgements

### 🏆 Acknowledgements

- **Original design inspiration** from [Calendar Add-on & Calendar Designs](https://community.home-assistant.io/t/calendar-add-on-some-calendar-designs/385790) by **[@kdw2060](https://github.com/kdw2060)**.
- **Interaction patterns** inspired by Home Assistant’s [Tile Card](https://github.com/home-assistant/frontend/blob/dev/src/panels/lovelace/cards/hui-tile-card.ts), which is licensed under the [Apache License 2.0](https://github.com/home-assistant/frontend/blob/dev/LICENSE.md).
- **Material Design ripple interactions**, originally by Google, used under the [Apache License 2.0](https://github.com/material-components/material-components-web/blob/master/LICENSE).der the [Apache License 2.0](https://github.com/home-assistant/frontend/blob/dev/LICENSE.md).
- **Material Design ripple interactions**, originally by Google, used under the [Apache License 2.0](https://github.com/material-components/material-components-web/blob/master/LICENSE).
  <!--Badges-->
  <!--Badges-->
  [hacs-img]: https://img.shields.io/badge/HACS-Custom-orange.svg
  [hacs-url]: https://github.com/alexpfau/calendar-card-pro/actions/workflows/hacs-validate.yml
  [github-release-img]: https://img.shields.io/github/release/alexpfau/calendar-card-pro.svgyml
  [github-downloads-img]: https://img.shields.io/github/downloads/alexpfau/calendar-card-pro/total.svg
  [github-release-url]: https://github.com/alexpfau/calendar-card-pro/releasesendar-card-pro/total.svg
  [github-release-url]: https://github.com/alexpfau/calendar-card-pro/releases
