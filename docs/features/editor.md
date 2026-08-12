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

## 🔎 Search & Customized Only

The editor holds several hundred options, so it opens with a search box above the panels.

Typing filters every panel down to what matches and drops the panels — and the groups inside them — that have nothing left, so a match is never hidden behind a collapsed heading. What survives is expanded for you.

Search matches what is on screen: the name of a setting, the sentence explaining it, and the choices a dropdown offers. Typing `width` finds **Minimum Day Width**; typing `iso` finds the week-number control, because that is where the word appears. It also matches the YAML option name, so a key copied out of the [Configuration Options reference](/reference/configuration) leads straight to its control.

**Customized Only** hides everything still set to the value the card would use anyway, leaving exactly what this card changes. It reads values the way the card does, so a number written as `"3"` in YAML counts as untouched when `3` is the default, and a value the card rejects counts as untouched too — because that is what the card is using.

Three things follow their own rule under it, for reasons worth knowing:

- **Calendars** show only the ones you have given settings of their own, which is a quick way to see which calendars have a color or a label and which simply follow the card.
- **Per-calendar options** count as customized when they are set at all. Several of them mean "follow the card" when left alone, so `Show Time: Off` on one calendar is a real setting rather than a default.
- **Exceptions** are always shown, since an option you asked to differ in one layout is a customization by definition — even before you change its value.

::: tip Not Everything Is There To Be Found
The editor only offers the settings your current configuration calls for: a fixed card height appears once the height mode is fixed, and the compact-mode modifier appears once there is an event limit for it to modify. A search cannot turn up a control that is not on screen, so if nothing matches, check whether the option it depends on is switched on.
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
The upgrader runs **only in the visual editor**. There is no runtime migration, so a deprecated option written directly in YAML is ignored and the card falls back to the default — it does not keep working under the old name.

The card does tell you when this happens: each deprecated option found in your configuration is reported in the browser console, naming the current option to use in its place. Open your browser's developer tools and look for messages prefixed with `📅 Calendar Card Pro`. If you manage your card in YAML, use the current names from the [Configuration Options reference](/reference/configuration).
:::
