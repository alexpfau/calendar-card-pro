# Installation

Calendar Card Pro installs like any other custom Lovelace card. HACS is the recommended route because it handles updates for you; manual installation is available if you do not use HACS.

## 📦 HACS Installation (Recommended)

The easiest way to install **Calendar Card Pro** is via **[HACS (Home Assistant Community Store)](https://hacs.xyz/)**.

[![Open in HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=alexpfau&repository=calendar-card-pro&category=plugin)

### Steps

1. Ensure **[HACS](https://hacs.xyz/docs/setup/download)** is installed in Home Assistant.
2. Go to **HACS → Frontend → Custom Repositories**.
3. Add this repository: `https://github.com/alexpfau/calendar-card-pro` as type `Dashboard`
4. Install **Calendar Card Pro** from HACS.
5. **Clear your browser cache** and reload Home Assistant.

## 📂 Manual Installation

<details>
<summary>📖 Click to expand manual installation instructions</summary>

### Steps

1. **Download** both files from the latest release:  
   👉 [calendar-card-pro.js](https://github.com/alexpfau/calendar-card-pro/releases/latest) and
   [editor.js](https://github.com/alexpfau/calendar-card-pro/releases/latest)

2. **Put both files** into a folder of their own under `www`:  
   /config/www/calendar-card-pro/

3. **Navigate to:**
   Home Assistant → Settings → Dashboards → Resources → Add Resource

4. **Add the resource** to your Lovelace Dashboard:

```yaml
url: /local/calendar-card-pro/calendar-card-pro.js
type: module
```

5. **Clear cache & refresh** your browser to apply changes.

::: warning Both Files, In Their Own Folder
The card ships as two files: `calendar-card-pro.js` and `editor.js`. Both must sit in the
same folder, and only `calendar-card-pro.js` is named as a resource — the card fetches the
editor itself, the first time you open it, so a dashboard never downloads it.

Copying just `calendar-card-pro.js` leaves you with a card that renders normally but
cannot be configured: opening the visual editor reports that a file is missing.

Use a subfolder rather than dropping the files straight into `/config/www/`. That folder
is shared by every hand-installed card, theme and script, and `editor.js` is a common
enough name that another file can take it — in which case the card finds a file where it
expects its editor, and the editor still will not open. A folder of its own removes the
question. HACS does all of this for you, which is why it is the recommended route.
:::

::: tip A Manual Install Downloads More Than a HACS One
Home Assistant serves a pre-compressed `.gz` file when it finds one beside the original,
and does not compress on the fly. HACS writes those files as it installs; copying the
release files by hand does not, and nothing on the release page provides them.

So a hand-installed card costs 188 KB and its editor 293 KB, where a HACS install pays
57 KB and 83 KB. Everything works either way — this is transfer size, not function — but
it is one more reason to prefer HACS where you can.
:::

</details>
