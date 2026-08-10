# Performance & Caching

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

These are the `refresh_interval` and `refresh_on_navigate` options — see [Cache & Refresh in the configuration reference](/reference/configuration#cache-refresh).

For styling the card with card-mod and CSS variables, see [Theming & Card-Mod](/features/theming).
