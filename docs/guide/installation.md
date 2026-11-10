# Installation

Calendar Card Pro installs the standard way for a custom Lovelace card. HACS is the recommended route because it handles updates for you; manual installation is available if you do not use HACS.

## 📦 HACS Installation (Recommended)

The easiest way to install **Calendar Card Pro** is via **[HACS (Home Assistant Community Store)](https://hacs.xyz/)**. It is listed in the HACS default repositories, so there is no custom repository to add.

[![Open in HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=alexpfau&repository=calendar-card-pro&category=plugin)

### Steps

1. Ensure **[HACS](https://hacs.xyz/docs/setup/download)** is installed in Home Assistant.
2. Open **HACS** and search for **Calendar Card Pro**, or use the button above.
3. Open it and select **Download**.
4. **Reload** Home Assistant in your browser, and clear the browser cache if an older version still shows.

## 📂 Manual Installation

<details>
<summary>📖 Click to expand manual installation instructions</summary>

### Steps

1. **Download** both files from the latest release:  
   👉 [calendar-card-pro.js](https://github.com/alexpfau/calendar-card-pro/releases/latest/download/calendar-card-pro.js) and
   [editor.js](https://github.com/alexpfau/calendar-card-pro/releases/latest/download/editor.js)

2. **Put both files** into a folder of their own under `www`:  
   /config/www/calendar-card-pro/

3. **Navigate to:**
   Home Assistant → Settings → Dashboards → Resources → Add Resource

4. **Add the resource** to your Lovelace Dashboard:

```yaml
url: /local/calendar-card-pro/calendar-card-pro.js
type: module
```

5. **Refresh** your browser. After a later update, clear its cache as well, or the old version can stay loaded.

::: warning Both Files, In Their Own Folder
Keep `calendar-card-pro.js` and `editor.js` together, in a folder of their own, and add only
`calendar-card-pro.js` as a resource. Without `editor.js` beside it, the card renders normally
but cannot be configured: opening the visual editor reports that a file is missing. Use a
subfolder rather than `/config/www/` itself, where another file called `editor.js` can take
its place and stop the editor from opening.
:::

::: details Compressing the Files Yourself
Home Assistant serves a pre-compressed `.gz` beside a file when it finds one. HACS writes one
for every file it installs; a manual install has none, so the card transfers at its full
564 KB and the editor at 531 KB, once per version before the browser caches both.

For a smaller transfer, create the `.gz` files beside the originals:

```bash
gzip -9 -k calendar-card-pro.js editor.js
```

That brings the card to 158 KB and the editor to 163 KB. Delete or regenerate the `.gz`
files with every update: Home Assistant serves a stale `.gz` in preference to a newer `.js`.
:::

</details>

## 🧭 Browser Support

Calendar Card Pro runs in any current browser and in the Home Assistant Companion apps. The
minimum versions are:

- **On an iPhone or iPad,** iOS or iPadOS 15 or later, on the last update the device offers:
  15.8 for one that stops at iOS 15, and 16.7 for one that stops at iOS 16.
- **On Android,** what counts in the Companion app is the version of the Android System
  WebView, numbered like Chrome. The card has been tested from Chromium 92 onward, and is
  confirmed on a Shelly Wall Display, an Android 7 panel whose WebView stops at Chrome 119, and
  in the headless Chromium 119 of a screenshot add-on.
- **The visual editor** needs Chrome 98 or later.

::: details Colors in Older Browsers
Older versions draw some colors more simply. Before Chrome 125 and Safari 18 the today tile and
the green of an event under way use a simpler mix. Before Chrome 111 and Safari 16.2 the tile is
a solid color and an event under way keeps the usual text color; focus rings and the search's
selected result are drawn in the solid accent there, and a day you press to add an event washes
gray. From Safari 16.2 to 17, a tinted event in column or grid view washes in the card's accent
under the pointer or a press, rather than in its own text color.
:::
