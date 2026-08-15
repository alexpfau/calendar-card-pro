# Contributing & Roadmap

Calendar Card Pro is community-driven. Whether you want to report a bug, propose a feature, translate the card into your language or work on the code itself, this page covers how to get involved and what is planned next.

## 🚀 How to Contribute

Want to improve **Calendar Card Pro**? I welcome contributions of all kinds—whether it’s **fixing bugs, improving performance, or adding new features**!

### Getting Started

1. **Fork this repo** and clone it locally.
2. **Install dependencies**:
   ```sh
   npm install
   ```
3. **Start development**:
   ```sh
   npm run dev
   ```
   This emits **two** files into `dist/` — `calendar-card-pro-dev.js` and `editor-dev.js`.
   The card fetches the editor by URL the first time someone opens it, so both belong in
   the same directory when you install a development build.
4. **Verify before you push.** These are every gate CI runs, so a green local run should
   mean a green pull request:
   ```sh
   npx tsc --noEmit      # typecheck — deliberately not an npm script
   npm run lint
   npm run check:format  # prettier across the whole repo, docs included
   npm test
   npm run check:i18n    # translation wiring
   npm run check:docs    # docs and config parity — gates every PR, not only docs changes
   npm run build
   npm run check:bundle  # after the build; it reads dist/
   ```
5. **Open a Pull Request** against the `dev` branch.

💡 For detailed contribution guidelines, see [CONTRIBUTING.md](https://github.com/alexpfau/calendar-card-pro/blob/dev/CONTRIBUTING.md).

### Reporting a Bug

Released builds log errors only. Everything below that — the running commentary about
caching, refreshes and rendering — is compiled out, so the console stays quiet on a
normal dashboard.

That is the right default, but it is unhelpful when something _is_ wrong. To turn the
detail back on, open your browser's developer console and run:

```js
window.calendarCardProDebug = true;
```

Then reload the page and reproduce the problem. The card picks the flag up on its next
render, so no reinstall or rebuild is needed. Include the resulting console output in
your issue — it usually identifies the cause immediately.

For finer control, set a level instead: `0` errors only, `1` adds warnings, `2` adds
information, `3` adds full debug output.

```js
window.calendarCardProLogLevel = 1;
```

Neither setting persists. Reloading with the line removed, or simply opening the
dashboard in a new tab, returns the card to its normal quiet behavior.

::: tip Warnings Are Worth Reading
Level `1` is the useful one for configuration problems. Several warnings report a
setting the card could not use and what it fell back to — for example an invalid
`start_date` — which is exactly the information a bug report needs.
:::

## 📅 Roadmap & Planned Features

I am continuously working on improving **Calendar Card Pro**. Here’s what’s planned for upcoming releases:

- **New Features & Improvements** - Feature requests as proposed by community members.
- **Expanded Language Support** – Adding more languages (looking for community translations).

💡 Got a feature request? **Open a GitHub Issue** or start a **discussion**!

## 📖 Developer Documentation

For those interested in contributing code, I maintain detailed **[architecture documentation](/architecture)** that explains:

- **Code Organization** – Structure and module responsibilities.
- **Data Flow & Processing** – How events are fetched, stored, and displayed.
- **Performance Optimization** – Techniques for fast rendering and caching.
- **Design Principles** – Best practices for UI consistency and accessibility.

## 🌍 Adding Translations

**Calendar Card Pro** currently supports:

- **Bulgarian** (`bg`)
- **Catalan** (`ca`)
- **Czech** (`cs`)
- **Danish** (`da`)
- **Dutch** (`nl`)
- **English** (`en`)
- **English (British)** (`en-gb`)
- **Estonian** (`et`)
- **Finnish** (`fi`)
- **French** (`fr`)
- **German** (`de`)
- **Greek** (`el`)
- **Hebrew** (`he`)
- **Croatian** (`hr`)
- **Hungarian** (`hu`)
- **Icelandic** (`is`)
- **Italian** (`it`)
- **Latvian** (`lv`)
- **Lithuanian** (`lt`)
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
- **Turkish** (`tr`)
- **Ukrainian** (`uk`)
- **Vietnamese** (`vi`)
- **Chinese (Simplified)** (`zh-cn`)
- **Chinese (Traditional)** (`zh-tw`)

To add a new language:

1. **Create a new file** in `src/translations/languages/[lang-code].json`
2. **Copy the structure** from `en.json` and translate all values (never change the keys).
   The file must contain **every top-level** key present in `en.json`, and nothing else —
   these files are loaded by every dashboard, so the editor's strings do not belong here.
3. **Register it in `src/translations/localize.ts`** — this is two edits:
   - add the `import` for your JSON file
   - add an entry to the `TRANSLATIONS` map. **The key must be lowercase**
     (e.g. `'en-gb'`, `'zh-cn'`), because lookups lowercase the configured language.
4. **Register it in `src/translations/dayjs.ts`** — this is also **two** edits, and both
   are required. Forgetting the second one is a silent failure: the language will work
   everywhere except relative times, which quietly fall back to English.
   - add `import 'dayjs/locale/[lang-code]';`
   - add the base language code to the `supportedLocales` array
   - _Note:_ regional variants normally need no dayjs entry, since `mapLocale()` reduces
     them to their base code (e.g. `en-gb` → `en`). Only add one if dayjs ships a distinct
     locale you actually need (as with `zh-cn` / `zh-tw`).
5. **Add your language to the supported list above** on this page, in alphabetical order.
6. **Verify** with `npm run lint`, `npm run check:i18n` and `npm run build`
7. **Submit a Pull Request** with your changes

**Example**: To add German support, you would:

1. Create `src/translations/languages/de.json`
2. Copy the structure from `en.json` and translate all values (not keys)
3. Add `import deTranslations from './languages/de.json';` and `de: deTranslations,` in `localize.ts`
4. Add `import 'dayjs/locale/de';` **and** `'de',` to `supportedLocales` in `dayjs.ts`
5. Add a `- **German** (de)` entry to the list above

### Translating the Editor

The visual editor's strings are optional and live separately, in
`src/rendering/editor/translations/[lang-code].json`. The editor is available in 11 of the
35 languages: English, which lives in code, and the ten with a file here — nine translated
in full, plus British English, which carries only the strings where it differs from US
English. The other 24 render the editor in English, which is fully supported.

They are kept apart because they are the larger half of the translations by some margin,
and the editor is loaded only when someone opens it — so a dashboard never downloads them
at all. Putting them back in `languages/` would undo that, and `npm run check:i18n` fails
if you do.

English is not among them. It lives in `src/rendering/editor/strings.ts` and nowhere else,
so there is no second English table to disagree with it. Each file below holds the subset
of those keys its language translates, keyed identically.

A partial translation is safe to ship. Each key falls back on its own, so anything you
leave out simply renders in English rather than looking broken. Register a new file with an
`import` and an `EDITOR_LANGUAGE_STRINGS` entry in `translations/index.ts`, using the same
lowercase key as the language itself.

## 🏆 Acknowledgements

- **Original design inspiration** from [Calendar Add-on & Calendar Designs](https://community.home-assistant.io/t/calendar-add-on-some-calendar-designs/385790) by **[@kdw2060](https://github.com/kdw2060)**.
- **Interaction patterns** inspired by Home Assistant’s [Tile Card](https://github.com/home-assistant/frontend/blob/dev/src/panels/lovelace/cards/hui-tile-card.ts), which is licensed under the [Apache License 2.0](https://github.com/home-assistant/frontend/blob/dev/LICENSE.md).
- **Material Design ripple interactions**, originally by Google, used under the [Apache License 2.0](https://github.com/material-components/material-components-web/blob/master/LICENSE).

Calendar Card Pro is released under the [MIT License](https://github.com/alexpfau/calendar-card-pro/blob/main/LICENSE). Full third-party attributions are listed in [NOTICE](https://github.com/alexpfau/calendar-card-pro/blob/main/NOTICE).
