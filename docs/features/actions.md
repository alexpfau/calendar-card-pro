# Actions & Interactions

## 🔄 Expandable Calendar View

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

## 👆 Custom Tap & Hold Actions

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

### Available Actions:

Calendar Card Pro handles one action itself — `expand` — and forwards **everything else to Home Assistant's own action handler**. That means any action Home Assistant supports works here, including ones added after this page was written.

The commonly used ones:

| Action Type                       | Description                                       | Additional Parameters                                     |
| --------------------------------- | ------------------------------------------------- | --------------------------------------------------------- |
| `expand`                          | Toggle between compact and full calendar view     | None                                                      |
| `more-info`                       | Open the Home Assistant entity dialog             | None                                                      |
| `navigate`                        | Go to another Lovelace view                       | `navigation_path: /lovelace/view`                         |
| `url`                             | Open external URL or internal page                | `url_path: https://example.com`, `open_tab: _blank`       |
| `perform-action` / `call-service` | Call any Home Assistant action (service)          | `service: domain.service`, `service_data: { key: value }` |
| `toggle`                          | Toggle the target entity                          | None                                                      |
| `assist`                          | Open the Assist dialog                            | None                                                      |
| `fire-dom-event`                  | Fire a DOM event (used by browser_mod and others) | Any additional keys are passed through                    |
| `none`                            | Disable the action                                | None                                                      |

::: tip
Home Assistant renamed `call-service` to `perform-action` in 2024.8. Both names still work; `perform-action` is preferred for new configurations.
:::

Because these are forwarded, the parameters are Home Assistant's own — see the [Home Assistant actions documentation](https://www.home-assistant.io/dashboards/actions/) for the full list.

All actions integrate seamlessly with Home Assistant's native ripple effect and haptic feedback for a polished user experience.

Actions are set via the card's `tap_action` and `hold_action` options — see [Actions in the configuration reference](/reference/configuration#actions).
