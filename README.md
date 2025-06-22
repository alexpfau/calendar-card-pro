<a name="top"></a>

# Calendar Card Pro for Home Assistant

[![hacs][hacs-img]][hacs-url] [![GitHub Release][github-release-img]][github-release-url] [![Downloads][github-downloads-img]][github-release-url] [![Downloads@latest][github-latest-downloads-img]][github-release-url]

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/header.png" alt="Calendar Card Pro Preview" width="100%">

## ☕ Support This Project

If you find **Calendar Card Pro** useful, consider supporting its development:

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/alexpfau)
[![GitHub Sponsors](https://img.shields.io/badge/Sponsor%20on%20GitHub-30363d?style=for-the-badge&logo=github&logoColor=white)](https://github.com/sponsors/alexpfau)

<p>&nbsp;</p>

## Table of Contents

- [1️⃣ Overview](#1️⃣-overview)
- [2️⃣ What's New](#2️⃣-whats-new)
- [3️⃣ Installation](#3️⃣-installation)
- [4️⃣ Usage](#4️⃣-usage)
- [5️⃣ Features & Configuration](#5️⃣-features--configuration)
- [6️⃣ Configuration Variables](#6️⃣-configuration-variables)
- [7️⃣ Examples](#7️⃣-examples)
- [8️⃣ Contributing & Roadmap](#8️⃣-contributing--roadmap)

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
- 🌍 **Multi-Language Support** – [Available in 29 languages](#-adding-translations), community contributions welcome!

### 🔗 Dependencies

**Calendar Card Pro** requires at least **one calendar entity** in Home Assistant. It is compatible with any integration that generates `calendar.*` entities, with **CalDAV** and **Google Calendar** being the primary tested integrations.

⚠️ **Important:** Ensure you have at least **one calendar integration set up** in Home Assistant before using this card.

<p align="right"><a href="#top">⬆️ back to top</a></p>

## 2️⃣ What's New

**➡️ View the [Full Release Notes](./docs/RELEASE_NOTES.md) for a complete list of features.**

### Latest Release: v3.0

- **⚙️ Visual Configuration Editor**: New visual editor for easy, guided configuration, with smart validation and auto-upgrade of deprecated settings
- **🌦️ Weather Integration**: Display [weather forecasts](#weather-integration) alongside your events
- **🕒 Improved Time Format Detection**: Automatically detects and respects all Home Assistant time format settings (12h, 24h, language-based, and system-based)
- **⚠️ Breaking Changes**: List parameter renames/removals:
  - `vertical_line_color` → `accent_color`
  - `max_events_to_show` → `compact_events_to_show`
  - `horizontal_line_width` → `day_separator_width`
  - `horizontal_line_color` → `day_separator_color`

### v2.4

- 🌟 **Today Indicator**: Highlight today with [customizable dot, pulse, glow effect, emoji, or custom icon](#-today-indicator)
- 🎨 **Today's Date Styling**: Customize the [appearance of today's date](#-date-column-customization) in the calendar with dedicated color options (`today_weekday_color`, `today_day_color`, `today_month_color`)
- 🚦 **Event Progress Bars**: Visualize how far an event has progressed with optional [progress bars](#progress-bar-display)
- ✂️ **Split Multi-Day Events**: Display [multi-day events on every day they cover](#split-multi-day-events)
- 🧠 **Enhanced Compact Mode Controls**: More precise control over [what's displayed in compact vs expanded views](#-compact-view-management--event-limits)

### v2.3

- ⏳ **Countdown Display** - [Show how much time remains](#-countdown-display) until an event starts with the new `show_countdown` option
- 🌅 **Weekend Day Styling** - [Style weekend days](#weekend-day-styling) differently with dedicated color options
- 📆 **Relative Date Offsets** - Define a [floating start date](#dynamic-start-date-with-relative-offsets) relative to the current day instead of fixed dates

### v2.2

- ⚙️ **Advanced event filtering** - Include or exclude specific events with [`blocklist` and `allowlist` patterns](#filtering-by-event-name) per entity
- 🔄 **Filter duplicate events** - [Remove redundant events](#filtering-duplicate-events) that appear in multiple calendars
- 🌍 **Smart country filtering** - Precise control over [country name display in locations](#-time--location-information)
- 🏷️ **Enhanced calendar labels** - In addition to emojis and text labels, you can now also use [Material Design icons and custom images](#-entity-configuration)
- 🎨 **Customizable empty day styling** - Control how [empty days appear](#-calendar-events-display) with `empty_day_color`

### v2.1

- 📅 **Week numbers & visual separators** - Better visual organization with [week number pills and customizable separators](#-week-numbers--visual-separators)
- 📊 **Per-calendar event limits** - Control how many events appear from [each calendar separately](#-managing-event-numbers)
- 📏 **Fixed height control** - Set [exact card height](#-card-dimensions--scrolling) with improved scrolling behavior

### v2.0

- 🌈 **Custom styling per calendar** - Add [accent colors for vertical lines](#-visual-styling--colors) and opaque backgrounds to create visual hierarchy
- 🏷️ **Calendar labels** - Add [emoji or text identifiers](#-entity-configuration) for each calendar source
- 🔧 **Advanced display controls** - [Per-calendar time and location display settings](#-time--location-information)
- 📆 **Custom start date** - View calendars from [any date](#core-settings), not just today
- 📱 **Maximum height with scrolling** - Set a [maximum card size](#-card-dimensions--scrolling) with scrollable content

<div style="background-color: rgba(3, 169, 244, 0.1); padding: 12px; margin: 20px 0;">
  <h4 style="margin: 0; display: inline;">
    ⬇️ <a href="#5️⃣-features--configuration">View Complete Features Documentation</a>
  </h4>
</div>

<p align="right"><a href="#top">⬆️ back to top</a></p>

## 3️⃣ Installation

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

<p align="right"><a href="#top">⬆️ back to top</a></p>

## 4️⃣ Usage

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
4. **Configure with the Visual Editor**
   - Click the three dots (⋮) in the top-right corner of the card
   - Select **"Configure"** to open the visual editor
   - Follow the intuitive interface to customize your calendar

> **Note:** The visual configuration editor is currently only available in English, while the calendar itself supports 29 languages.

### ⚙️ Customizing the Card

Calendar Card Pro offers two ways to customize your card:

1. **Visual Editor (Recommended)**

   - Open the comprehensive visual editor
   - Organized panels guide you through all available options
   - Changes are previewed in real-time
   - Smart validation prevents configuration errors

2. **YAML Configuration (Advanced)**
   - Use YAML configuration for advanced customization or automation
   - Reference the [📚 Configuration Variables](#6️⃣-configuration-variables) section for all available options

### 🚀 Next Steps

- **Try the Visual Editor** - Open the card configuration and explore the intuitive editor panels to customize your calendar
- **Discover Advanced Features** - Check out [✨ Features & Configuration](#5️⃣-features--configuration) to learn about specialized capabilities like weather integration and event filtering
- **See Examples** - Browse the [💡 Examples](#7️⃣-examples) section for inspiration and pre-configured setups
- **Reference Configuration** - For advanced YAML customization, use the [📚 Configuration Variables](#6️⃣-configuration-variables) as a complete reference
- **Get Involved!** - Check out [Contributing & Roadmap](#8️⃣-contributing--roadmap) to learn how to contribute or see upcoming features

<p align="right"><a href="#top">⬆️ back to top</a></p>

## 5️⃣ Features & Configuration

### ⚙️ Visual Configuration Editor

Calendar Card Pro includes a comprehensive visual editor that makes configuration intuitive and accessible—no YAML required!

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_editor.png" alt="Visual Configuration Editor" width="600"><br>

#### Editor Organization

The editor is organized into logical panels that guide you through all configuration options:

- **Calendar Entities** - Add, remove, and configure calendar sources
- **Core Settings** - Basic card configuration like title, days to show, and language
- **Appearance & Layout** - Visual styling, spacing, and card dimensions
- **Date Display** - Date formatting, today indicators, and weekend styling
- **Event Display** - Event content, time/location settings, and filtering options
- **Weather Integration** - Configure weather forecasts in your calendar
- **Interactions** - Set up tap and hold behaviors

#### Key Features

- **Live Preview** - See changes immediately as you configure the card
- **Context-Aware Options** - Settings appear only when they're relevant
- **Smart Validation** - Input validation prevents configuration errors
- **Automatic Config Upgrader** - Detects deprecated settings from older versions

> **Note:** The visual configuration editor is currently only available in English, while the calendar itself supports 29 languages. Calendar settings applied through the editor will still display properly in your configured language.

<details>
<summary>Configuration Upgrader Details</summary>

When you open the editor with a configuration that uses deprecated parameters, the editor will detect this and offer a one-click upgrade. Example:

- `vertical_line_color` → `accent_color`
- `max_events_to_show` → `compact_events_to_show`

Simply click "Update config..." to automatically migrate to the current parameter names.

</details>

### Core Settings

#### 🗂️ Entity Configuration

Calendar Card Pro can display events from multiple calendar entities in Home Assistant. The `entities` array accepts either:

1. **A simple entity ID** (default styling applies)
2. **An advanced object configuration** (custom styling per entity)

```yaml
entities:
  - calendar.family # Simple entity ID (default styling)
  - entity: calendar.work
    # Advanced object with custom styling (see options below)
    color: '#1e90ff'
    accent_color: '#ff6347'
```

##### Available Properties for Entity Configuration Objects:

| Property               | Type    | Description                                                                                                                    |
| ---------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| entity                 | string  | **Required.** The calendar entity ID                                                                                           |
| label                  | string  | Calendar label displayed before event titles. Supports text/emoji, MDI icons (`mdi:icon-name`), or images (`/local/image.jpg`) |
| color                  | string  | Custom color for event titles from this calendar                                                                               |
| accent_color           | string  | Custom color for the vertical line and event background (when event_background_opacity is >0)                                  |
| show_time              | boolean | Whether to show event times for this calendar (overrides global show_time setting)                                             |
| show_location          | boolean | Whether to show event locations for this calendar (overrides global show_location setting)                                     |
| compact_events_to_show | number  | Maximum number of events to show from this calendar (works with global compact_events_to_show)                                 |
| blocklist              | string  | RegExp pattern to specify events to exclude (e.g., "Private\|Conference")                                                      |
| allowlist              | string  | RegExp pattern to specify events to include (e.g., "Birthday\|Anniversary")                                                    |

This structure gives you granular control over how information from different calendars is displayed.

#### 🔍 Event Filtering

Calendar Card Pro provides powerful filtering capabilities to control exactly which events appear on your dashboard:

> **Visual Editor:** Set up filters in the entity configuration panels. For each calendar entity, you can specify blocklist/allowlist patterns and configure duplicate filtering from the "Calendar Entities" section.

##### Filtering by Event Name

```yaml
entities:
  - entity: calendar.work
    blocklist: 'Private|Conference' # Hide events with these words
  - entity: calendar.personal
    allowlist: 'Birthday|Anniversary' # Only show events with these words
```

These filters use regular expressions, allowing for flexible pattern matching:

- **Blocklist**: Hide events that match specified patterns
- **Allowlist**: Only show events that match specified patterns
- **Priority**: When both are specified, allowlist takes precedence

##### Filtering Duplicate Events

When you subscribe to multiple calendars that might contain the same events (like shared family calendars), you can eliminate duplicates:

```yaml
entities:
  - calendar.personal # Events from this calendar are prioritized
  - calendar.family # Duplicates from this calendar will be hidden
filter_duplicates: true
```

The duplicate detection compares:

- Event title
- Start and end times
- Event location
- Calendar order (calendars listed first have priority)

This is especially useful for:

- Shared household calendars
- Work calendars with team events
- Any scenario where you might see the same event in multiple calendars

##### Advanced Filtering Techniques

You can combine filtering features with labels and accent colors to create sophisticated displays. For example, to apply different styling to specific event types within the same calendar:

```yaml
entities:
  - entity: calendar.family
    allowlist: 'shopping|grocery' # Only show shopping-related events
    label: '🛒' # Add shopping cart label to these events
    accent_color: '#1e88e5' # Blue accent for shopping events
  - entity: calendar.family
    allowlist: 'birthday|anniversary' # Only show celebration events
    label: '🎉' # Add celebration label to these events
    accent_color: '#e91e63' # Pink accent for celebration events
  - entity: calendar.family
    blocklist: 'shopping|grocery|birthday|anniversary' # Show all other events
    accent_color: '#607d8b' # Neutral accent for all other events
    # No label for remaining events
```

This technique lets you:

- Apply different labels and colors to different event types from the same calendar
- Create category-based visual organization without needing multiple calendar sources
- Use accent colors with backgrounds (when event_background_opacity > 0) for even more distinction
- Avoid needing to create separate calendars for different event categories

#### 📊 Compact View Management & Event Limits

Calendar Card Pro offers powerful controls for managing what appears in compact and expanded views:

```yaml
# Total days to fetch from API and display when expanded
days_to_show: 7

# Event limit for compact mode
compact_events_to_show: 5 # Preferred: New parameter name

# Day limit in compact mode
compact_days_to_show: 2 # Fewer days to display in compact mode

# Ensure complete days are shown
compact_events_complete_days: true # Never cut off a day's events mid-day
```

##### Entity-Level vs. Global Event Limits

In addition, you can control how many events are displayed in compact mode from each calendar independently:

entities:

```yaml
- entity: calendar.family # Show all events from family calendar (no limit)
- entity: calendar.work
  compact_events_to_show: 2 # Only show 2 most important work events
```

This feature provides several important behaviors:

- **Entity limits are applied first**: Each calendar is restricted to its specific maximum
- **Global limit is applied second**: Total events across all calendars are then limited
- **Chronological order is preserved**: Events remain sorted by date/time
- **Different behavior in views**: In compact view, both entity and global limits apply; in expanded view, all limits are removed and all events within the configured date range are displayed

##### Controlling Days in Compact Mode

The `compact_days_to_show` parameter lets you display fewer days in compact mode:

```yaml
days_to_show: 7 # Show 7 days when expanded
compact_days_to_show: 2 # Show only the next 2 days with events in compact mode
```

This is useful for dashboards where you want an initial view showing just the most immediate events, with the ability to expand to view the entire week.

##### Preserving Complete Days

When using event limits, the `compact_events_complete_days` parameter ensures that partial days are never shown:

```yaml
compact_events_to_show: 5
compact_events_complete_days: true
```

When enabled, this feature ensures that if at least one event from a day is shown, all events from that day will be displayed. This prevents confusion that might arise when some events from a day are visible but others are hidden.

For example, with `compact_events_to_show: 5` and `compact_events_complete_days: true`:

- If the first 5 events are spread across 2 days, all events from those 2 days will be shown
- This might result in showing more than 5 events total, but ensures you never miss events from partially shown days

##### Benefits of These Controls

These flexible view controls allow you to:

- **Create concise dashboard views**: Show just what's immediately relevant
- **Prioritize important calendars**: Give more visual space to key calendars
- **Prevent overwhelming views**: Limit verbose calendars (like school schedules)
- **Provide complete context**: Ensure users can see all events for any shown day
- **Support easy expansion**: Allow users to see the full calendar with a single tap

### Split Multi-Day Events

Calendar Card Pro can display multi-day events on each day they cover, making it easier to see all ongoing events and potential conflicts:

```yaml
# Global setting for all calendars
split_multiday_events: true

# Entity-specific settings
entities:
  - entity: calendar.family
    split_multiday_events: true # Show family events on each day
  - entity: calendar.work
    split_multiday_events: false # Show work events only on first day (default)
```

When enabled, multi-day events are split in a way that preserves their original properties:

- **All-day events** appear as single-day all-day events on each day they cover
- **Timed multi-day events** are split into:
  - First day: Event from start time to end of day (e.g., 10:00-23:59)
  - Middle days: Full all-day events
  - Last day: Event from start of day to end time (e.g., 00:00-15:00)

This feature is especially useful for:

- Visualizing event conflicts across multiple days
- Seeing all active events for a given day at a glance
- Getting a clearer picture of on-call schedules, multi-day conferences, or travel

The setting can be applied globally to all calendars or controlled separately for each calendar entity.

### Dynamic Start Date with Relative Offsets

Calendar Card Pro offers flexible options for controlling which dates are displayed, allowing you to create both fixed and dynamic date ranges:

#### 📅 Start Date Configuration

The `start_date` parameter can be configured in multiple ways:

- **Fixed dates**: Use a specific date in YYYY-MM-DD format

  ```yaml
  start_date: '2025-07-01' # Always start from July 1st, 2025
  ```

- **Relative date expressions**: Use dynamic offsets relative to the current date
  ```yaml
  start_date: "today+7"  # Always show events starting 7 days in the future
  start_date: "+3"       # Shorthand for today+3 (3 days from today)
  start_date: "today-2"  # Show events starting from 2 days ago
  start_date: "-1"       # Shorthand for today-1 (yesterday)
  ```

When using `start_date` with `days_to_show`, the calendar will display exactly that number of days starting from the specified date:

```yaml
start_date: '2025-07-01'
days_to_show: 14 # Shows July 1-14, 2025
```

```yaml
start_date: '+7' # One week from today
days_to_show: 7 # Shows a 7-day window starting one week from today
```

#### 🔄 Dynamic vs. Fixed Date Ranges

- **Fixed date range**: Using a specific date for `start_date` creates a static calendar view that always shows the same range
- **Dynamic date range**: Using relative offsets creates a "floating" window that automatically adjusts as time passes

### Layout & Appearance

#### 📐 Card Dimensions & Scrolling

Calendar Card Pro offers flexible options for controlling the card's size and scroll behavior:

```yaml
# Fixed height - card always maintains exactly this height
height: '300px'

# Maximum height - card grows with content up to this height
max_height: '300px'

# Additional padding inside the card
additional_card_spacing: '10px'
```

The card offers two distinct height control mechanisms:

- **Fixed Height (`height`)**: Creates a card with exactly the specified height regardless of content amount. This is ideal when you need a card that perfectly fits a specific dashboard layout.

- **Maximum Height (`max_height`)**: Allows the card to grow naturally up to the specified limit. This provides flexibility while still ensuring the card doesn't become too large.

Both options provide:

- Automatic scrolling when content exceeds the available space
- Modern, clean scrollbars that only appear during hover/scrolling
- Consistent behavior across desktop and mobile browsers

#### 🎨 Visual Styling & Colors

Customize the appearance of your calendar with various styling options:

```yaml
# Card background and title
title: 'My Calendar'
title_font_size: '20px'
title_color: 'var(--primary-color)'
background_color: 'var(--ha-card-background)'

# Event appearance
event_background_opacity: 15 # 0-100 scale for background color intensity
vertical_line_width: '3px' # Width of the colored event indicator line
```

The `event_background_opacity` setting (ranging from 0-100) works together with each calendar's `accent_color` to create semi-transparent backgrounds for events. At 0 (default), events have no background color. Higher values create more intense backgrounds.

When styling your calendar, you can use:

- CSS color values (`#ff6c92`, `rgba(255,0,0,0.5)`)
- Home Assistant theme variables (`var(--primary-color)`)
- Named colors (`red`, `blue`)

#### 📏 Spacing & Alignment

Fine-tune the spacing and alignment of your calendar elements:

```yaml
# Spacing between elements
day_spacing: '8px' # Space between different calendar days
event_spacing: '6px' # Internal padding within each event

# Date column alignment
date_vertical_alignment: 'top' # Options: 'top', 'middle', 'bottom'
```

The `date_vertical_alignment` option controls how dates align with their events, which is especially noticeable when a day has many events. The default `middle` setting centers the date between its events, while `top` aligns it with the first event and `bottom` with the last event.

#### 📅 Week Numbers & Visual Separators

For improved organization with longer calendar views, you can enable week numbers and visual separators:

```yaml
# Week number configuration
show_week_numbers: 'iso' # 'iso', 'simple', or null to disable
show_current_week_number: true # Show week number for the first week
first_day_of_week: 'monday' # 'monday', 'sunday', or 'system'

# Week number styling
week_number_font_size: '12px'
week_number_color: 'var(--primary-text-color)'
week_number_background_color: '#03a9f450'

# Separator configuration
day_separator_width: '1px' # Line between days
day_separator_color: '#03a9f430'
week_separator_width: '2px' # Line between weeks
week_separator_color: '#03a9f480'
month_separator_width: '3px' # Line between months
month_separator_color: '#03a9f4'
```

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_4_week_numbers.png" alt="Week Numbers" width="600"><br>

This feature creates a sophisticated visual hierarchy with:

- **Week Number Indicators**: Pill-shaped badges showing the current week number
- **Visual Separators**: Horizontal lines of varying thickness to distinguish between days, weeks, and months
- **Smart Precedence**: When multiple separators could appear at once (like when a week also changes month), the most significant one (month) takes priority

The separators follow an intelligent precedence system:

- When multiple separators could appear simultaneously (e.g., a day that's both the start of a week and a month), the most significant one (month) takes visual priority
- This creates a clean visual hierarchy: months > weeks > days

Week numbers can be displayed using either:

- **ISO Week Numbering**: Weeks start on Monday, and the first week of the year is the one containing the first Thursday (ISO 8601 standard)
- **Simple Week Numbering**: Counts weeks starting from January 1st

#### 📆 Date Column Customization

Control the appearance of the date column for a personalized calendar view:

```yaml
# Base date column styling
weekday_font_size: '14px'
weekday_color: 'var(--primary-text-color)'
day_font_size: '26px'
day_color: 'var(--primary-text-color)'
month_font_size: '12px'
month_color: 'var(--primary-text-color)'

# Special styling for weekends (inherits from base when not specified)
weekend_weekday_color: '#e67c73' # Weekend day names
weekend_day_color: '#e67c73' # Weekend day numbers
weekend_month_color: '#e67c73' # Weekend month names

# Special styling for today (inherits from base/weekend when not specified)
today_weekday_color: '#03a9f4' # Today's weekday name
today_day_color: '#03a9f4' # Today's day number
today_month_color: '#03a9f4' # Today's month name
```

The date column appears on the left side of each day's events and helps users quickly identify when events occur. By default, all dates use the base styling, but you can apply special styling to:

- **Weekend days** (Saturday and Sunday) using the `weekend_*` parameters
- **Today's date** using the `today_*` parameters

When special styling parameters are not specified, they will inherit from the base styling. If today falls on a weekend, today styling takes precedence over weekend styling.

#### 🌟 Today Indicator

Calendar Card Pro provides a sophisticated way to highlight the current day with a customizable indicator:

> **Visual Editor:** Configure today indicators in the "Date Display" section, where you can choose from dots, pulses, glows, custom icons, emojis or images, and adjust their position.

```yaml
# Enable and choose indicator type
today_indicator: true # Enable basic dot indicator (default)
today_indicator: pulse # Animated pulsing dot
today_indicator: glow # Glowing dot
today_indicator: mdi:star # Any Material Design icon
today_indicator: 🎯 # Emoji
today_indicator: /local/custom-indicator.png # Image path

# Position the indicator precisely with CSS-like coordinates
today_indicator_position: "15% 50%" # Centered left in the date column (default)
today_indicator_position: "15% 15%" # Top left
today_indicator_position: "85% 15%" # Top right
```

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_today_indicator.png" alt="Today Indicator" width="600"><br>

The indicator is precisely positioned and always properly centered on the coordinates specified, making it ideal for creating visual emphasis on today's date.

Available indicator types:

- `true` or `dot`: Simple dot indicator
- `pulse`: Animated pulsing dot
- `glow`: Glowing dot with subtle light effect
- `mdi:icon-name`: Any Material Design Icon
- Emoji characters: Any emoji like `🎯` or `⭐`
- Image path: Any image URL or local path

The `today_indicator_position` parameter accepts CSS-like position values in the format "x% y%", allowing precise placement of the indicator anywhere within the date column.

### Event Content & Display

#### 📅 Calendar Events Display

Control how event information is presented on your calendar:

```yaml
# Event title appearance
event_font_size: '14px'
event_color: 'var(--primary-text-color)'

# Empty days display
show_empty_days: true # Show days with no events
empty_day_color: 'var(--secondary-text-color)' # Color for "No events" text
```

When `show_empty_days` is set to `true`, days without events will display a "No events" message. This helps maintain visual consistency across your calendar, especially when showing longer date ranges.

The new `empty_day_color` parameter lets you customize the color of this message to match your theme or stand out as needed.

#### ⏱️ Time & Location Information

Configure how event times and locations are displayed:

```yaml
# Time display options
show_time: true # Show event start/end times
show_single_allday_time: false # Hide time for single-day all-day events
time_24h: false # Use 12-hour format (AM/PM)
show_end_time: true # Show event end time
time_font_size: '12px'
time_color: 'var(--secondary-text-color)'
time_icon_size: '14px'

# Location display options
show_location: true
remove_location_country: true # Remove country names from addresses
location_font_size: '12px'
location_color: 'var(--secondary-text-color)'
location_icon_size: '14px'
```

The `remove_location_country` parameter offers three modes:

```yaml
# Option 1: Don't remove any country information
remove_location_country: false

# Option 2: Use built-in country detection
remove_location_country: true

# Option 3: Specify exactly which countries to remove (perfect for international users)
remove_location_country: "USA|United States|Canada"
```

These options provide significant flexibility:

- **Option 1 (false)**: Show complete addresses with all country information (best for international users)
- **Option 2 (true)**: Apply smart country detection to clean up addresses (good for most users)
- **Option 3 (regex pattern)**: Precisely control which countries to remove while keeping others visible (perfect for displaying domestic addresses without country while preserving international location details)

**Example scenario**: If you live in the USA but frequently have events in other countries, you could use:

```yaml
remove_location_country: 'USA|United States|U.S.A.|U.S.'
```

This would keep location details like "Paris, France" intact while simplifying domestic addresses to just city and state.

#### ⏳ Countdown Display

Show how much time remains until an event starts with the countdown display feature:

```yaml
# Enable countdown display for events
show_countdown: true
```

When enabled, a subtle countdown string appears next to each upcoming event, showing the remaining time in a natural language format like "in 3 days" or "in 2 hours". This helps users quickly identify how soon events will begin.

#### 🕒 Past Events Display

Control visibility of events that have already occurred:

```yaml
show_past_events: true # Show today's events that have already ended
```

When enabled, past events appear with reduced opacity (60%) to visually distinguish them from upcoming events.

#### Weekend Day Styling

Weekend days (Saturday and Sunday) can be styled differently from weekdays to make them stand out in your calendar. You can customize:

- `weekend_weekday_color`: Sets the text color for weekday names (e.g., "Sat", "Sun")
- `weekend_day_color`: Sets the text color for the day number
- `weekend_month_color`: Sets the text color for the month name

Example configuration:

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.personal
  - calendar.work
weekend_weekday_color: '#E67C73'
weekend_day_color: '#E67C73'
weekend_month_color: '#E67C73'
```

This styling helps users quickly distinguish weekend days from weekdays, making the calendar more visually informative and easier to scan.

#### Progress Bar Display

Calendar Card Pro can display a progress bar for events that are currently running, showing how much of the event has completed.

The progress bar appears in the same space as the countdown display (they're mutually exclusive - a countdown shows for future events, while a progress bar shows for running events). This provides a clean, visual indication of your event's progress without taking up additional space.

**To enable progress bars:**

```yaml
show_progress_bar: true
```

You can customize the appearance of the progress bars:

```yaml
show_progress_bar: true
progress_bar_color: '#03a9f4'
progress_bar_height: '10px'
progress_bar_width: '80px'
```

The progress bar is especially useful for tracking ongoing meetings, webinars, or appointments, giving you a quick visual reference of how much time remains.

### 🌦️ Weather Integration

Calendar Card Pro can display weather forecasts alongside your calendar events, providing a complete view of both your schedule and the expected weather conditions.

> **Visual Editor:** Access all weather settings in the "Weather Integration" section of the editor, where you can select your weather entity and configure display options for both date and event positions.

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.family
days_to_show: 5
weather:
  entity: weather.forecast_home
  position: both # Options: 'date', 'event', or 'both'
  date:
    # Date column shows condition icon and high temperature only
    show_conditions: true
    show_high_temp: true
    show_low_temp: false
    icon_size: '16px'
    font_size: '14px'
    color: '#3498db'
  event:
    # Event row shows just the temperature (no icon)
    show_conditions: false
    show_temp: true
    font_size: '13px'
    color: 'var(--secondary-text-color)'
```

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_weather.png" alt="Weather Integration" width="600"><br>

This flexible configuration allows you to create a personalized experience that shows exactly the weather information you need, where you need it.

#### Weather Configuration Options

| Option                    | Type    | Default                     | Description                                                                                 |
| ------------------------- | ------- | --------------------------- | ------------------------------------------------------------------------------------------- |
| `entity`                  | string  | -                           | Weather entity to use for forecasts                                                         |
| `position`                | string  | `date`                      | Where to show weather data: `'date'` (date column), `'event'` (next to events), or `'both'` |
| `date → show_conditions`  | boolean | `true`                      | Whether to show weather condition icons in date column                                      |
| `date → show_high_temp`   | boolean | `true`                      | Whether to show high temperature in date column                                             |
| `date → show_low_temp`    | boolean | `false`                     | Whether to show low temperature in date column                                              |
| `date → icon_size`        | string  | `14px`                      | Size of weather icons in date column                                                        |
| `date → font_size`        | string  | `12px`                      | Size of weather text in date column                                                         |
| `date → color`            | string  | `var(--primary-text-color)` | Color of weather text and icons in date column                                              |
| `event → show_conditions` | boolean | `true`                      | Whether to show weather condition icons in event column                                     |
| `event → show_temp`       | boolean | `true`                      | Whether to show temperature in event column                                                 |
| `event → icon_size`       | string  | `14px`                      | Size of weather icons in event column                                                       |
| `event → font_size`       | string  | `12px`                      | Size of weather text in event column                                                        |
| `event → color`           | string  | `var(--primary-text-color)` | Color of weather text and icons in event column                                             |

#### Weather Display Positions

You can choose where weather information appears in your calendar:

- `date`: Shows daily forecasts in the date column (left side)
- `event`: Shows hourly forecasts next to event titles
- `both`: Displays weather in both positions simultaneously

#### Position-Specific Configuration

Each display position can be customized independently with different content and styling:

**Date Column Weather:**

- `show_conditions`: Show weather condition icon (sun, cloud, rain, etc.)
- `show_high_temp`: Show high temperature
- `show_low_temp`: Show low temperature
- `icon_size`: Weather icon size
- `font_size`: Temperature text size
- `color`: Text and icon color

**Event Weather:**

- `show_conditions`: Show weather condition icon
- `show_temp`: Show temperature
- `icon_size`: Weather icon size
- `font_size`: Temperature text size
- `color`: Text and icon color

#### Benefits and Use Cases

Weather integration is particularly useful for:

- Planning outdoor activities based on weather conditions
- Seeing at a glance if you'll need an umbrella for your appointments
- Preparing for weather changes during multi-day events
- Quickly checking the forecast for specific event times

The feature automatically matches weather data to the correct time periods:

- Daily forecasts for the date column
- Hourly forecasts for specific event times

### Actions & Interactions

#### 🔄 Expandable Calendar View

One of Calendar Card Pro's most powerful features is the ability to toggle between compact and expanded views:

```yaml
# Limit events in compact view
compact_events_to_show: 5

# Enable expand/collapse with tap
tap_action:
  action: expand
```

When a `compact_events_to_show` limit is set, the card displays that number of events initially, adding a subtle indicator when more events are available. The `expand` action then allows users to toggle between this compact view and the full list of events.

When using expansion with both global and per-calendar limits:

- In compact view: Both global and per-calendar limits are enforced
- In expanded view: Only per-calendar limits remain active, while the global limit is removed
- Entity-specific limits are always respected in both views
- The expand/collapse state persists until manually toggled or the page is reloaded

**Example scenario**: If you have a configuration like this:

```yaml
entities:
  - entity: calendar.family
    # No limit for family calendar
  - entity: calendar.work
    compact_events_to_show: 2
    # Never show more than 2 work events
  - entity: calendar.holidays
    compact_events_to_show: 1
    # Only show 1 holiday event
compact_events_to_show: 4
# Show at most 4 events total in compact mode

tap_action:
  action: expand
```

In compact mode, you'll see at most 4 events total, with work showing at most 2 and holidays showing at most 1.
In expanded mode after tapping, the global limit of 4 is removed, but you'll still only see 2 work events and 1 holiday event, while all family events within your configured `days_to_show` range will be visible.

#### 👆 Custom Tap & Hold Actions

Calendar Card Pro supports all standard Home Assistant actions:

```yaml
# Navigate to another view on tap
tap_action:
  action: navigate
  navigation_path: /lovelace/calendar

# Open a URL on long press
hold_action:
  action: url
  url_path: https://calendar.google.com
```

##### Available Actions:

| Action Type    | Description                                   | Additional Parameters                                     |
| -------------- | --------------------------------------------- | --------------------------------------------------------- |
| `expand`       | Toggle between compact and full calendar view | None                                                      |
| `more-info`    | Open the Home Assistant entity dialog         | None                                                      |
| `navigate`     | Go to another Lovelace view                   | `navigation_path: /lovelace/view`                         |
| `url`          | Open external URL or internal page            | `url_path: https://example.com`                           |
| `call-service` | Call any Home Assistant service               | `service: domain.service`, `service_data: { key: value }` |
| `none`         | Disable the action                            | None                                                      |

All actions integrate seamlessly with Home Assistant's native ripple effect and haptic feedback for a polished user experience.

### Performance & Theme Integration

#### ⚡ Efficient Rendering & Caching

Calendar Card Pro uses several techniques to ensure smooth performance:

```yaml
# Cache and refresh settings
refresh_interval: 30 # Minutes between data refresh
refresh_on_navigate: false # Keep cache when switching dashboard views
```

The card's advanced rendering engine:

- Processes events in small batches (typically 5-10 at a time)
- Uses requestAnimationFrame for smooth visual updates
- Prioritizes visible content first
- Prevents the browser's main thread from blocking during large calendar loads

Smart caching minimizes API calls to your calendar integrations. By default, data refreshes every 30 minutes and when navigating between views, but you can adjust this behavior with `refresh_interval` and `refresh_on_navigate`.

#### 🎨 Theme Integration & Card-Mod Support

Calendar Card Pro seamlessly integrates with all Home Assistant themes and fully supports card-mod customization:

- **Automatic Theme Detection**: Uses your active Home Assistant theme variables
- **Standard Card Structure**: Follows HA conventions for consistent styling
- **CSS Customization**: Accessible structure for easy card-mod targeting

##### Customization Examples with Card-Mod:

**Custom title styling:**

```yaml
type: custom:calendar-card-pro
title: Family Schedule
card_mod:
  style: |
    ha-card .header-container h1.card-header {
      width: 100%;
      text-align: center;
      font-weight: bold;
      border-bottom: 1px solid var(--primary-color);
      float: none !important; /* Override the default float:left */
    }
```

**Highlight today's events:**

```yaml
type: custom:calendar-card-pro
card_mod:
  style: |
    /* Make today's events stand out */
    .day-table.today .event-title {
      font-size: 16px !important;     /* Larger text */
      font-weight: bold !important;   /* Bold text */
      color: var(--accent-color) !important; /* Use theme accent color */
    }

    /* Add subtle left border pulse animation */
    .day-table.today .event {
      border-left-width: 4px !important;
      transition: border-left-color 1s ease-in-out;
      animation: todayPulse 3s infinite alternate;
    }

    @keyframes todayPulse {
      from { border-left-color: var(--accent-color); }
      to { border-left-color: var(--primary-color); }
    }
```

**Highlight tomorrow's events:**

This works analogously to "today" as seen above, but using the "tomorrow" class. For example:

```yaml
type: custom:calendar-card-pro
card_mod:
  style: |
    /* Make tomorrow's events stand out */
    .day-table.tomorrow .event-title {
      font-size: 16px !important;     /* Larger text */
      font-weight: bold !important;   /* Bold text */
      color: var(--accent-color) !important; /* Use theme accent color */
    }
```

**Frameless calendar integration:**

```yaml
type: custom:calendar-card-pro
card_mod:
  style: |
    ha-card {
      border-radius: 0;
      border: none;
      box-shadow: none;
      background: transparent !important;
    }
```

**Move time into the same row as the event title:**

```yaml
card_mod:
  style: |
    div.event-content {
      display: grid;
      grid-template-areas: 
        "title time"
        "location location";
      grid-template-columns: 1fr auto;
      column-gap: 10px;
      row-gap: 0px;
    }

    div.summary {
      grid-area: title;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    div.time {
      grid-area: time;
      white-space: nowrap;
    }

    div.location {
      grid-area: location;
      white-space: normal;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    div.time-location {
      display: contents;
    }
```

These examples demonstrate how Calendar Card Pro can be customized to match any dashboard design using card-mod's powerful CSS customization capabilities.

<p align="right"><a href="#top">⬆️ back to top</a></p>

## 6️⃣ Configuration Variables

| Variable                                   | Type              | Default                                            | Description                                                                                                                                                                                                                                                 |
| ------------------------------------------ | ----------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Core Settings**                          |                   |                                                    |                                                                                                                                                                                                                                                             |
| `entities`                                 | array             | Required                                           | List of calendar entities with optional styling (see Entity Configuration below)                                                                                                                                                                            |
| `start_date`                               | string            | Today                                              | Custom start date for the calendar (YYYY-MM-DD format). Also supports relative date expressions like `today+7` to display events starting 7 days from today, or `today-3` to show events from 3 days ago. You can also use shorthand notation `+7` or `-3`. |
| `days_to_show`                             | number            | `3`                                                | Number of days to display                                                                                                                                                                                                                                   |
| `compact_days_to_show`                     | number            | -                                                  | Number of days to display in compact mode                                                                                                                                                                                                                   |
| `compact_events_to_show`                   | number            | -                                                  | Number of events to show in compact mode                                                                                                                                                                                                                    |
| `compact_events_complete_days`             | boolean           | `false`                                            | When true, shows all events for days that have at least one event displayed                                                                                                                                                                                 |
| `show_empty_days`                          | boolean           | `false`                                            | Whether to show days with no events (with "No events" message)                                                                                                                                                                                              |
| `filter_duplicates`                        | boolean           | `false`                                            | Remove duplicate events that appear in multiple calendars                                                                                                                                                                                                   |
| `split_multiday_events`                    | boolean           | `false`                                            | Display multi-day events on each day they cover                                                                                                                                                                                                             |
| `language`                                 | string            | `System`, fallback `en`                            | Interface language (auto-detects from HA)                                                                                                                                                                                                                   |
| **Header**                                 |                   |                                                    |                                                                                                                                                                                                                                                             |
| `title`                                    | string            | -                                                  | Card title                                                                                                                                                                                                                                                  |
| `title_font_size`                          | string            | `--calendar-card-font-size-title`                  | Card title font size                                                                                                                                                                                                                                        |
| `title_color`                              | string            | `--calendar-card-color-title`                      | Card title font color                                                                                                                                                                                                                                       |
| **Layout and Spacing**                     |                   |                                                    |                                                                                                                                                                                                                                                             |
| `background_color`                         | string            | `--ha-card-background`                             | Card background color                                                                                                                                                                                                                                       |
| `accent_color`                             | string            | `#03a9f4`                                          | Vertical line separator color                                                                                                                                                                                                                               |
| `vertical_line_width`                      | string            | `2px`                                              | Vertical line separator width                                                                                                                                                                                                                               |
| `day_spacing`                              | string            | `5px`                                              | Spacing between different calendar day rows (replaces row_spacing)                                                                                                                                                                                          |
| `event_spacing`                            | string            | `4px`                                              | Vertical padding within each event                                                                                                                                                                                                                          |
| `additional_card_spacing`                  | string            | `0px`                                              | Additional top/bottom padding for the card                                                                                                                                                                                                                  |
| `height`                                   | string            | `auto`                                             | Sets a fixed, exact height for the card regardless of content amount (always this height, never more or less)                                                                                                                                               |
| `max_height`                               | string            | `none`                                             | Allows the card to grow with content up to this maximum height limit                                                                                                                                                                                        |
| **Week Numbers and Horizontal Separators** |                   |                                                    |                                                                                                                                                                                                                                                             |
| `show_week_numbers`                        | string            | `null`                                             | Week number display method ('iso', 'simple', or null to disable)                                                                                                                                                                                            |
| `show_current_week_number`                 | boolean           | `true`                                             | Whether to show week number for the first/current week in view                                                                                                                                                                                              |
| `week_number_font_size`                    | string            | `14px`                                             | Font size for week number pills                                                                                                                                                                                                                             |
| `week_number_color`                        | string            | `var(--primary-text-color)`                        | Text color for week number pills                                                                                                                                                                                                                            |
| `week_number_background_color`             | string            | `#03a9f450`                                        | Background color for week number pills                                                                                                                                                                                                                      |
| `first_day_of_week`                        | string            | `system`                                           | First day of week ('monday', 'sunday', or 'system')                                                                                                                                                                                                         |
| `day_separator_width`                      | string            | `0px`                                              | Width of separator line between days                                                                                                                                                                                                                        |
| `day_separator_color`                      | string            | `var(--secondary-text-color)`                      | Color of separator line between days                                                                                                                                                                                                                        |
| `week_separator_width`                     | string            | `0px`                                              | Width of separator line between weeks                                                                                                                                                                                                                       |
| `week_separator_color`                     | string            | `#03a9f450`                                        | Color of separator line between weeks                                                                                                                                                                                                                       |
| `month_separator_width`                    | string            | `0px`                                              | Width of separator line between months                                                                                                                                                                                                                      |
| `month_separator_color`                    | string            | `var(--primary-text-color)`                        | Color of separator line between months                                                                                                                                                                                                                      |
| **Today Indicator**                        |                   |                                                    |
| `today_indicator`                          | boolean or string | `false`                                            | Today indicator type: `true`/`dot` (basic dot), `pulse` (animated dot), `glow` (glowing effect), custom MDI icon (e.g., `mdi:star`), emoji, or image path                                                                                                   |
| `today_indicator_position`                 | string            | `15% 50%`                                          | Position of today indicator in CSS-like format (x% y%)                                                                                                                                                                                                      |
| `today_indicator_color`                    | string            | `#03a9f4`                                          | Color of the today indicator                                                                                                                                                                                                                                |
| `today_indicator_size`                     | string            | `6px`                                              | Size of the today indicator                                                                                                                                                                                                                                 |
| **Date Column**                            |                   |                                                    |                                                                                                                                                                                                                                                             |
| `date_vertical_alignment`                  | string            | `middle`                                           | Vertical alignment of date column (`top`, `middle`, or `bottom`)                                                                                                                                                                                            |
| `weekday_font_size`                        | string            | `14px`                                             | Weekday name font size                                                                                                                                                                                                                                      |
| `weekday_color`                            | string            | `--primary-text-color`                             | Weekday name font color                                                                                                                                                                                                                                     |
| `day_font_size`                            | string            | `26px`                                             | Day numbers font size                                                                                                                                                                                                                                       |
| `day_color`                                | string            | `--primary-text-color`                             | Day numbers font color                                                                                                                                                                                                                                      |
| `show_month`                               | boolean           | `true`                                             | Whether to show month names                                                                                                                                                                                                                                 |
| `month_font_size`                          | string            | `12px`                                             | Month name font size                                                                                                                                                                                                                                        |
| `month_color`                              | string            | `--primary-text-color`                             | Month name font color                                                                                                                                                                                                                                       |
| `weekend_weekday_color`                    | string            | `var(--primary-text-color)`                        | Color for the weekday name (e.g., "Sat", "Sun") on weekend days                                                                                                                                                                                             |
| `weekend_day_color`                        | string            | `var(--primary-text-color)`                        | Color for the day number on weekend days                                                                                                                                                                                                                    |
| `weekend_month_color`                      | string            | `var(--primary-text-color)`                        | Color for the month name on weekend days                                                                                                                                                                                                                    |
| `today_weekday_color`                      | string            | `var(--primary-text-color)`                        | Color for the weekday name (e.g., "Sat", "Sun") on today's date                                                                                                                                                                                             |
| `today_day_color`                          | string            | `var(--primary-text-color)`                        | Color for the day number on today's date                                                                                                                                                                                                                    |
| `today_month_color`                        | string            | `var(--primary-text-color)`                        | Color for the month name on today's date                                                                                                                                                                                                                    |
| **Event Column**                           |                   |                                                    |                                                                                                                                                                                                                                                             |
| `event_background_opacity`                 | number            | `0`                                                | Background opacity (0-100) for events using entity accent color                                                                                                                                                                                             |
| `show_past_events`                         | boolean           | `false`                                            | Whether to show today's events that have already ended                                                                                                                                                                                                      |
| `show_countdown`                           | boolean           | `false`                                            | Show how much time remains until an event starts                                                                                                                                                                                                            |
| `show_progress_bar`                        | boolean           | `false`                                            | Whether to show a progress bar for currently running events                                                                                                                                                                                                 |
| `progress_bar_color`                       | string            | `var(--secondary-text-color)`                      | Color of the progress bar                                                                                                                                                                                                                                   |
| `progress_bar_height`                      | string            | `calc(var(--calendar-card-font-size-time) * 0.75)` | Height of the progress bar                                                                                                                                                                                                                                  |
| `progress_bar_width`                       | string            | `60px`                                             | Width of the progress bar                                                                                                                                                                                                                                   |
| `empty_day_color`                          | string            | `--primary-text-color`                             | Color for "No events" text on empty days                                                                                                                                                                                                                    |
| `event_font_size`                          | string            | `14px`                                             | Event title font size                                                                                                                                                                                                                                       |
| `event_color`                              | string            | `--primary-text-color`                             | Event title font color                                                                                                                                                                                                                                      |
| `show_time`                                | boolean           | `true`                                             | Whether to show event times                                                                                                                                                                                                                                 |
| `show_single_allday_time`                  | boolean           | `true`                                             | Whether to show time display for all-day single-day events                                                                                                                                                                                                  |
| `time_24h`                                 | boolean           | `System`                                           | Whether to use 24-hour time format (auto-detects from HA)                                                                                                                                                                                                   |
| `show_end_time`                            | boolean           | `true`                                             | Whether to show event end times                                                                                                                                                                                                                             |
| `time_icon_size`                           | string            | `14px`                                             | Clock icon size (replaces time_location_icon_size)                                                                                                                                                                                                          |
| `time_font_size`                           | string            | `12px`                                             | Event time font size                                                                                                                                                                                                                                        |
| `time_color`                               | string            | `--secondary-text-color`                           | Event time font color                                                                                                                                                                                                                                       |
| `show_location`                            | boolean           | `true`                                             | Whether to show event locations                                                                                                                                                                                                                             |
| `remove_location_country`                  | boolean or string | `true`                                             | Whether to remove country names from locations. Can be boolean (`true`/`false`) or a regex pattern string (e.g., `"USA \| United States \| Canada"`) to specify which countries to remove                                                                   |
| `location_icon_size`                       | string            | `14px`                                             | Location icon size (replaces time_location_icon_size)                                                                                                                                                                                                       |
| `location_font_size`                       | string            | `12px`                                             | Event location font size                                                                                                                                                                                                                                    |
| `location_color`                           | string            | `--secondary-text-color`                           | Event location font color                                                                                                                                                                                                                                   |
| **Weather**                                |                   |                                                    |                                                                                                                                                                                                                                                             |
| `weather`                                  | object            | -                                                  | Weather configuration object containing the below settings                                                                                                                                                                                                  |
| `weather → entity`                         | string            | -                                                  | Home Assistant weather entity to use for forecasts                                                                                                                                                                                                          |
| `weather → position`                       | string            | `date`                                             | Where to show weather data: `date` (in date column), `event` (next to events), or `both` (in both positions)                                                                                                                                                |
| `weather → date`                           | object            | -                                                  | Configuration for weather display in the date column                                                                                                                                                                                                        |
| `weather → event`                          | object            | -                                                  | Configuration for weather display next to events                                                                                                                                                                                                            |
| **Actions**                                |                   |                                                    |                                                                                                                                                                                                                                                             |
| `tap_action`                               | object            | `none`                                             | Action when tapping the card                                                                                                                                                                                                                                |
| `hold_action`                              | object            | `none`                                             | Action when holding the card                                                                                                                                                                                                                                |
| **Cache and Refresh**                      |                   |                                                    |                                                                                                                                                                                                                                                             |
| `refresh_interval`                         | number            | `30`                                               | Time in minutes between data refreshes                                                                                                                                                                                                                      |
| `refresh_on_navigate`                      | boolean           | `true`                                             | Whether to force refresh data when navigating between dashboard views                                                                                                                                                                                       |

<p align="right"><a href="#top">⬆️ back to top</a></p>

## 7️⃣ Examples

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
compact_events_to_show: 3 # Always only show 3 events
tap_action:
  action: expand # Tap to expand/collapse
```

### 🌈 Multiple Calendars with Custom Styling

This example demonstrates how to use **accent colors** and **background opacity** to create visual distinction between different calendars. The accent colors are used for both the vertical line and a semi-transparent background.

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_3_custom_styling.png" alt="Custom Styling" width="600">

```yaml
type: custom:calendar-card-pro
entities:
  - entity: calendar.family
    accent_color: '#ff6c92'
  - entity: calendar.work
    accent_color: '#1e88e5'
  - entity: calendar.personal
    accent_color: '#43a047'
days_to_show: 5
compact_events_to_show: 5
event_background_opacity: 20
vertical_line_width: 5px
event_spacing: 6px
```

### 📆 Multiple Calendars with Week Numbers and Separators

This configuration showcases the **week number display** and **visual separators** features. It creates a clear hierarchy with different separator widths for weeks and months.

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_4_week_numbers.png" alt="Week Numbers and Separators" width="600">

```yaml
type: custom:calendar-card-pro
entities:
  - entity: calendar.personal
    accent_color: '#03a9f4'
  - entity: calendar.family
    accent_color: '#ff6c92'
days_to_show: 5
compact_events_to_show: 5
vertical_line_width: 5px
event_spacing: 5px
show_week_numbers: iso
week_separator_width: 1px
week_separator_color: '#03a9f450'
month_separator_width: 1.5px
month_separator_color: var(--secondary-text-color)
```

### 🎨 Full Configuration

A fully **customized** configuration demonstrating **all available options**, including **styling, layout, and interactions**. Though you could **go all out**—and I didn’t—and create a **completely different look** if you wanted. Screenshot using the beautiful **[Bubble Theme](https://github.com/Clooos/Bubble)**.

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_5_complete.png" alt="Complete Configuration" width="600"><br>

```yaml
type: custom:calendar-card-pro

# Core Settings
entities:
  - entity: calendar.family
    color: '#ffdaea'
  - entity: calendar.work
    color: '#b3ffd9'
start_date: '2025-07-01'
days_to_show: 10
compact_events_to_show: 10
language: en

# Header
title: 📅 Full Calendar Demo
title_font_size: 26px
title_color: '#baf1ff'

# Layout and Spacing
background_color: '#eeeeee50'
accent_color: '#baf1ff'
vertical_line_width: 0px
row_spacing: 10px
additional_card_spacing: 0px

# Week Numbers and Horizontal Separators
day_separator_width: 2px
day_separator_color: '#baf1ff80'

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

<p align="right"><a href="#top">⬆️ back to top</a></p>

## 8️⃣ Contributing & Roadmap

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

- **Enhanced Event Details** – Support for event descriptions, and more.
- **New Features & Improvements** - Feature Requests as proposed by community members.
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

- **Bulgarian** (`bg`)
- **Catalan** (`ca`)
- **Czech** (`cs`)
- **Danish** (`da`)
- **Dutch** (`nl`)
- **English** (`en`)
- **Finnish** (`fi`)
- **French** (`fr`)
- **German** (`de`)
- **Greek** (`el`)
- **Hebrew** (`he`)
- **Croatian** (`hr`)
- **Hungarian** (`hu`)
- **Icelandic** (`is`)
- **Italian** (`it`)
- **Norwegian Bokmål** (`nb`)
- **Norwegian Nynorsk** (`nn`)
- **Polish** (`pl`)
- **Portuguese** (`pt`)
- **Romanian** (`ro`)
- **Russian** (`ru`)
- **Slovak** (`sk`)
- **Slovenian** (`sl`)
- **Spanish** (`es`)
- **Swedish** (`sv`)
- **Thai** (`th`)
- **Ukrainian** (`uk`)
- **Vietnamese** (`vi`)
- **Chinese (Simplified)** (`zh-cn`)
- **Chinese (Traditional)** (`zh-tw`)

To add a new language:

1. **Create a new file** in `src/translations/languages/[lang-code].json`
2. **Copy the structure** from an existing language file (e.g., `en.json`)
3. **Update the localize file** in `src/translations/localize.ts` to include your new language
4. **Update the dayjs file** in `src/translations/dayjs.ts` to include your new language
5. **Translate all strings** to your language
6. **Submit a Pull Request** with your changes

**Example**: To add German support, you would:

1. Create `src/translations/languages/de.json`
2. Copy the structure from `en.json` and translate all values (not keys)
3. Add the import and mapping in `localize.ts`

### 🏆 Acknowledgements

- **Original design inspiration** from [Calendar Add-on & Calendar Designs](https://community.home-assistant.io/t/calendar-add-on-some-calendar-designs/385790) by **[@kdw2060](https://github.com/kdw2060)**.
- **Interaction patterns** inspired by Home Assistant’s [Tile Card](https://github.com/home-assistant/frontend/blob/dev/src/panels/lovelace/cards/hui-tile-card.ts), which is licensed under the [Apache License 2.0](https://github.com/home-assistant/frontend/blob/dev/LICENSE.md).
- **Material Design ripple interactions**, originally by Google, used under the [Apache License 2.0](https://github.com/material-components/material-components-web/blob/master/LICENSE).

<p align="right"><a href="#top">⬆️ back to top</a></p>

 <!--Badges-->

[hacs-img]: https://img.shields.io/badge/HACS-Custom-orange.svg
[hacs-url]: https://github.com/alexpfau/calendar-card-pro/actions/workflows/hacs-validate.yml
[github-release-img]: https://img.shields.io/github/release/alexpfau/calendar-card-pro.svg
[github-downloads-img]: https://img.shields.io/github/downloads/alexpfau/calendar-card-pro/total.svg
[github-latest-downloads-img]: https://img.shields.io/github/downloads/alexpfau/calendar-card-pro/latest/total.svg
[github-release-url]: https://github.com/alexpfau/calendar-card-pro/releases
