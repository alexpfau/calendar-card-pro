# Contributing & Roadmap

Calendar Card Pro is community-driven. Whether you want to report a bug, propose a feature, translate the card into your language or work on the code itself, this page covers how to get involved and where plans are tracked.

## 🚀 How to Contribute

Contributions of all kinds are welcome, from **bug fixes and performance work** to **new features**.

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
   This emits **two** files into `dist/`, `calendar-card-pro-dev.js` and `editor-dev.js`.
   Install both in the same folder when you try a development build.
4. **Verify before you push.** These are every gate CI runs, so a green local run should
   mean a green pull request:
   ```sh
   npx tsc --noEmit      # typecheck — deliberately not an npm script
   npm run lint
   npm run check:format  # prettier across the whole repo, docs included
   npm test
   npm run check:i18n    # translation wiring
   npm run check:docs    # docs and config parity — gates every PR, not only docs changes
   npm run docs:build    # compiles the docs site; catches pages check:docs cannot parse
   npm run build
   npm run check:bundle  # after the build; it reads dist/
   ```
5. **Open a Pull Request** against the `dev` branch.

💡 For detailed contribution guidelines, see [CONTRIBUTING.md](https://github.com/alexpfau/calendar-card-pro/blob/dev/CONTRIBUTING.md).

### Reporting a Bug

Report a bug as a [new issue on GitHub](https://github.com/alexpfau/calendar-card-pro/issues/new/choose),
after checking that you are on the latest version, that a refresh with a cleared browser cache
does not fix it, and that it has not been reported yet. The bug form asks for:

- what happens, what you expected, and the steps that reproduce it
- your card's YAML configuration
- your browser, Home Assistant version, Calendar Card Pro version and device
- the browser console output, which usually identifies the cause immediately

Remove anything private from the YAML and the console output before you post them. For
questions rather than bugs, use the
[community forum thread](https://community.home-assistant.io/t/calendar-card-pro-a-beautiful-high-performance-calendar-card-for-home-assistant/863711).

Released builds log errors only. To turn the detail on, open your browser's developer console
and run:

```js
window.calendarCardProDebug = true;
```

Then reproduce the problem **without reloading the page**, because a reload turns logging off
again. Switching to another dashboard view and back, or opening the card's editor, is enough
to get a fully logged render. Include the resulting console output in your issue.

For finer control, set a level instead: `0` errors only, `1` adds warnings, `2` adds
information, `3` adds full debug output.

```js
window.calendarCardProLogLevel = 1;
```

Neither setting persists: to turn either off, reload the page or open the dashboard in a new
tab.

::: tip Warnings Are Worth Reading
Level `1` is the useful one for configuration problems. Several warnings report a
setting the card could not use and what it fell back to — for example an invalid
`start_date` — which is exactly the information a bug report needs.
:::

## 📅 Roadmap & Planned Features

Requests and plans are tracked in the project's
[GitHub issues](https://github.com/alexpfau/calendar-card-pro/issues). Feature requests carry the
[`enhancement`](https://github.com/alexpfau/calendar-card-pro/issues?q=is%3Aissue+is%3Aopen+label%3Aenhancement)
label, and larger themes are grouped under labels starting with `epic:`, one per theme. What
has shipped is listed in [What's New](/guide/whats-new).

Got a feature request? Search the open issues first, and if yours is already there, add your
use case to it. Otherwise open one with the **Feature Request** form, which asks for the
problem it solves and how you would use it.

Translations into more languages are always welcome: [Adding Translations](#adding-translations)
explains how, for the card and for its editor.

## 📖 Developer Documentation

For those interested in contributing code, I maintain detailed **[architecture documentation](/architecture)**
in five parts:

- **[Overview](/architecture)** – how the code is organized, which module owns what, the design
  principles, and a checklist for adding an option.
- **[Data Loading & Caching](/architecture-data)** – how events are fetched, cached and kept up to
  date, and what keeps the card fast.
- **[Rendering & Views](/architecture-rendering)** – how the list, column and grid layouts are drawn.
- **[Interaction & Event Writes](/architecture-interaction)** – taps, the popover, and how events are added, changed and deleted.
- **[Toolbar & Navigation](/architecture-toolbar)** – the header toolbar and paging through dates.

## 🌍 Adding Translations

Adding a language to the card takes one JSON file of strings and a few registrations; the
[visual editor](#translating-the-editor) can be translated too, in part or in full. These are
the languages **Calendar Card Pro** currently supports:

::: details Supported Languages

- **Bulgarian** (`bg`)
- **Catalan** (`ca`)
- **Chinese (Simplified)** (`zh-cn`)
- **Chinese (Traditional)** (`zh-tw`)
- **Croatian** (`hr`)
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
- **Hungarian** (`hu`)
- **Icelandic** (`is`)
- **Italian** (`it`)
- **Korean** (`ko`)
- **Latvian** (`lv`)
- **Lithuanian** (`lt`)
- **Norwegian Bokmål** (`nb`)
- **Norwegian Nynorsk** (`nn`)
- **Polish** (`pl`)
- **Portuguese** (`pt`)
- **Romanian** (`ro`)
- **Russian** (`ru`)
- **Serbian (Cyrillic)** (`sr`)
- **Serbian (Latin)** (`sr-latn`)
- **Slovak** (`sk`)
- **Slovenian** (`sl`)
- **Spanish** (`es`)
- **Swedish** (`sv`)
- **Thai** (`th`)
- **Turkish** (`tr`)
- **Ukrainian** (`uk`)
- **Vietnamese** (`vi`)

:::

To add a new language:

1. **Create a new file** in `src/translations/languages/[lang-code].json`
2. **Copy the structure** from `en.json` and translate all values (never change the keys).
   The file must contain **every top-level** key present in `en.json`, and nothing else:
   the editor's strings go in [their own file](#translating-the-editor).
3. **Register it in `src/translations/localize.ts` and `language-codes.ts`** — three edits:
   - add the `import` for your JSON file
   - add an entry to the `TRANSLATIONS` map. **The key must be lowercase**
     (e.g. `'en-gb'`, `'zh-cn'`).
   - add the same lowercase code to `CARD_LANGUAGES` in
     `src/translations/language-codes.ts`. `npm run check:i18n` fails if the list and the
     files disagree.
4. **Register it in `src/translations/dayjs.ts`** — this is **two** edits, and both
   are required. Without the second, the language works everywhere except relative times,
   which quietly fall back to English.
   - add `import 'dayjs/locale/[lang-code]';`
   - add the base language code to the `supportedLocales` array
5. **Add your language to the supported list above** on this page, in alphabetical order.
6. **Verify** with `npm run lint`, `npm run check:i18n` and `npm run build`
7. **Submit a Pull Request** with your changes

::: details Regional & Script Variants

- Regional variants normally need no dayjs entry, since `mapLocale()` reduces them to their
  base code (e.g. `en-gb` → `en`). Only add one if dayjs ships a distinct locale you actually
  need (as with `zh-cn` / `zh-tw`).
- Check which script a dayjs locale is written in before you import it. Day.js names its
  Serbian Latin locale `sr` and its Cyrillic one `sr-cyrl`, the opposite of what Home
  Assistant and the browser mean by `sr`. A language whose dayjs locale goes by another name
  also needs an entry in `DAYJS_LOCALE_NAMES` in the same file.

:::

::: details Example: Adding German

1. Create `src/translations/languages/de.json`
2. Copy the structure from `en.json` and translate all values (not keys)
3. Add `import deTranslations from './languages/de.json';` and `de: deTranslations,` in `localize.ts`,
   and `'de',` to `CARD_LANGUAGES` in `language-codes.ts`
4. Add `import 'dayjs/locale/de';` **and** `'de',` to `supportedLocales` in `dayjs.ts`
5. Add a ``- **German** (`de`)`` entry to the list above

:::

### Translating the Editor

The visual editor's strings are optional and live separately, in
`src/rendering/editor/translations/[lang-code].json`. The editor is available in 12 of the
38 languages: English, which lives in code, and the eleven with a file here — nine translated
in full, Korean in part, plus British English, which carries only the strings where it
differs from US English. The other 26 render the editor in English, which is fully supported.

Keep the editor's strings out of `src/translations/languages/`; `npm run check:i18n` fails if
they are there. English lives only in `src/rendering/editor/strings.ts`, and a translation file
uses the same keys, holding only the ones its language translates.

A partial translation is safe to ship. Each key falls back on its own, so anything you
leave out simply renders in English rather than looking broken. Register a new file with an
`import` and an `EDITOR_LANGUAGE_STRINGS` entry in `translations/index.ts`, using the same
lowercase key as the language itself.

## 🏆 Acknowledgments

- **Original design inspiration** from [Calendar Add-on & Calendar Designs](https://community.home-assistant.io/t/calendar-add-on-some-calendar-designs/385790) by **[@kdw2060](https://github.com/kdw2060)**.
- **Interaction patterns** inspired by Home Assistant’s [Tile Card](https://github.com/home-assistant/frontend/blob/dev/src/panels/lovelace/cards/hui-tile-card.ts), which is licensed under the [Apache License 2.0](https://github.com/home-assistant/frontend/blob/dev/LICENSE.md).
- **Material Design ripple interactions**, originally by Google, used under the [Apache License 2.0](https://github.com/material-components/material-components-web/blob/master/LICENSE).

Calendar Card Pro is released under the [MIT License](https://github.com/alexpfau/calendar-card-pro/blob/main/LICENSE). Full third-party attributions are listed in [NOTICE](https://github.com/alexpfau/calendar-card-pro/blob/main/NOTICE).
