# ⚙️ Visual Configuration Editor

Calendar Card Pro includes a comprehensive visual editor that makes configuration intuitive and accessible—no YAML required!

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_editor.png" alt="Visual Configuration Editor" width="600"><br>

## Editor Organization

The editor is organized into logical panels that guide you through all configuration options:

- **Calendar Entities** - Add, remove, and configure calendar sources
- **Core Settings** - Basic card configuration like title, days to show, and language
- **Appearance & Layout** - Visual styling, spacing, and card dimensions
- **Date Display** - Date formatting, today indicators, and weekend styling
- **Event Display** - Event content, time/location settings, and filtering options
- **Weather Integration** - Configure weather forecasts in your calendar
- **Interactions** - Set up tap and hold behaviors

## Key Features

- **Live Preview** - See changes immediately as you configure the card
- **Context-Aware Options** - Settings appear only when they're relevant
- **Smart Validation** - Input validation prevents configuration errors
- **Automatic Config Upgrader** - Detects deprecated settings from older versions

> **Note:** The visual configuration editor is currently available in 11 languages. Calendar settings applied through the editor will still display properly in all 35 supported languages.

<details>
<summary>Configuration Upgrader Details</summary>

When you open the editor with a configuration that uses deprecated parameters, the editor will detect this and offer a one-click upgrade. Example:

- `vertical_line_color` → `accent_color`
- `max_events_to_show` → `compact_events_to_show`

Simply click "Update config..." to automatically migrate to the current parameter names.

</details>
