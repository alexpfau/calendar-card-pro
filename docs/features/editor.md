# Visual Configuration Editor

Calendar Card Pro includes a comprehensive visual editor that makes configuration intuitive and accessible—no YAML required!

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_editor.png" alt="Visual Configuration Editor" width="600"><br>

To open it, click the three dots (⋮) in the top-right corner of the card and select **Configure**. If you have not added a card yet, start with [Usage](/guide/usage).

## 🗂️ Editor Organization

The editor is organized into logical panels that guide you through all configuration options:

- **Calendar Entities** - Add, remove, and configure calendar sources
- **Core Settings** - Basic card configuration like title, days to show, and language
- **Appearance & Layout** - Visual styling, spacing, and card dimensions
- **Date Display** - Date formatting, today indicators, and weekend styling
- **Event Display** - Event content, time/location settings, and filtering options
- **Weather Integration** - Configure weather forecasts in your calendar
- **Interactions** - Set up tap and hold behaviors

## ✨ Key Features

- **Live Preview** - See changes immediately as you configure the card
- **Context-Aware Options** - Settings appear only when they're relevant
- **Smart Validation** - Input validation prevents configuration errors
- **Automatic Config Upgrader** - Detects deprecated settings from older versions

::: info Editor Language Support
The visual configuration editor is currently available in **11 languages**, while the calendar itself supports **35 languages**. If your language is not among the 11, the editor falls back to English — calendar settings applied through it still display correctly in all 35 supported languages. Community contributions for additional editor translations are welcome!
:::

## 🔄 Configuration Upgrader

When you open the editor with a configuration that uses deprecated parameters, the editor detects this and offers a one-click upgrade. The full set of renames it handles:

| Deprecated | Current |
| ---------- | ------- |
| `max_events_to_show` | `compact_events_to_show` |
| `vertical_line_color` | `accent_color` |
| `horizontal_line_width` | `day_separator_width` |
| `horizontal_line_color` | `day_separator_color` |
| `row_spacing` | `day_spacing` |

`max_events_to_show` is also upgraded when it appears on an individual entry under `entities:`.

Click **"Update config..."** to automatically migrate to the current parameter names.

::: warning YAML Is Not Migrated Automatically
The upgrader runs **only in the visual editor**. There is no runtime migration, so a deprecated option written directly in YAML is silently ignored and the card falls back to the default — it does not keep working under the old name. If you manage your card in YAML, use the current names from the [Configuration Variables reference](/reference/configuration).
:::
