# Split Multi-Day Events

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

Because each row stands for a day rather than for the event as a whole, a [countdown](/features/event-content#countdown-display) on a split row counts whole calendar days to that row's own date. A holiday starting Monday reads as "in 4 days" on its first row, "in 5 days" on the second, and so on, whether or not the original event had a start time.

The setting can be applied globally to all calendars or controlled separately for each calendar entity.

This is the `split_multiday_events` option — see [Event Column in the configuration reference](/reference/configuration#event-column).
