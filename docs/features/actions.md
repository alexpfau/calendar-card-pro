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

| Action Type    | Description                                   | Additional Parameters                                     |
| -------------- | --------------------------------------------- | --------------------------------------------------------- |
| `expand`       | Toggle between compact and full calendar view | None                                                      |
| `more-info`    | Open the Home Assistant entity dialog         | None                                                      |
| `navigate`     | Go to another Lovelace view                   | `navigation_path: /lovelace/view`                         |
| `url`          | Open external URL or internal page            | `url_path: https://example.com`                           |
| `call-service` | Call any Home Assistant service               | `service: domain.service`, `service_data: { key: value }` |
| `none`         | Disable the action                            | None                                                      |

All actions integrate seamlessly with Home Assistant's native ripple effect and haptic feedback for a polished user experience.
