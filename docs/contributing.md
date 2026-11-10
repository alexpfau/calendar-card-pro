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

::: details Words From the Browser

A few words come from the browser's `Intl` rather than from your file: "Now", the countdown's
"tomorrow" and hours, the month and "Today" in the toolbar, the date in a multi-day event's
end, and the "and" or "or" that joins names in the editor. Check that Chromium carries your
language by running `Intl.RelativeTimeFormat.supportedLocalesOf(['xx'])` in Chrome's console,
with your code in place of `xx`. If it answers `[]` and your readers also read a language
Chromium does carry, as Nynorsk readers read Bokmål, add that pair to `INTL_FALLBACKS` in
`src/translations/intl-locales.ts`.

:::

::: details Dates in a Sentence

A multi-day event's end names its last day, as in "until Monday, Jan 5 at 17:00". Your browser
writes that date in the card's language, so its order, its punctuation and the form of its
month are your language's own: "do pondělí 5. ledna", "eddig: jan. 5., hétfő", "~ 1월 5일
월요일". Where your language shortens a month to a number ("5. 1."), the card names it in full
instead. `months` names the months in the date column, and stands in for the browser's month
only where the browser has no data for your language, as Chromium has none for Icelandic.

The weekday in that date is yours: `fullDaysOfWeek`, put where your language puts the weekday.
Write each day the way your language writes it there: in lower case if it writes weekdays that
way inside a date, and in whatever form `multiDay` asks for. Polish `do` takes the genitive, so
its days read "do poniedziałku", not "do poniedziałek", and Estonian `kuni` the terminative,
"kuni reedeni". A day that takes an article carries it too: Greek writes "έως την Παρασκευή"
but "έως το Σάββατο", so each of its days has its own. Where every day takes the same article,
it can end `multiDay` instead, as in Spanish "hasta el viernes". If your word for "until"
follows the date instead of preceding it, use your word for "ends", the word your `endsToday`
begins with, and the card sets it off with your `separator` as it does `endsToday`: Finnish writes
"päättyy maanantaina 5. tammikuuta". A label works the same way: Turkish writes "bitiş: 5 Oca
Pazartesi".

`daysOfWeek` is different. Those are the short day names beside each date, and they take a
capital wherever a label would.

`npm run check:i18n` warns about a capitalized day your language writes in lower case. It
cannot check the ending, so check that yourself.

:::

::: details Times in a Sentence

`at` puts an event's end time in a sentence: after `endsToday` or `endsTomorrow`, as in "ends
tomorrow at 0:30", and after a date, as in "until Friday, Oct 23 at 17:00". The card writes
`at`, a space and the time. Two placeholders let a language write it its own way:

- `{time}` in `at` is where the time goes, for a language that marks a time with a suffix
  rather than a word before it. Hungarian's `at` is `{time}-kor`, so a date ends "okt. 23.,
  péntek 17:00-kor". Korean's is `{time}` alone, since a time after a date takes nothing there,
  and so are Lithuanian's and Chinese's, which write a date and its time side by side as CLDR
  does: "penktadienio 17:00", "10月23日星期五 17:00".
- `{at}` in `endsToday` and `endsTomorrow` is where the time goes, written with `at`, for a
  language that puts it inside the phrase. Hungarian's `endsTomorrow` is
  `holnap {at} ér véget`, so its card reads "holnap 0:30-kor ér véget". An all-day event has
  no time, and reads the phrase without it: "holnap ér véget". Anything written onto `{at}`
  with no space between goes with it, so Korean's `내일 {at}에 종료` reads "내일 0:30에 종료",
  and "내일 종료" all day. Chinese sets the time off with a space on each side, and both go
  with it between two Chinese characters: `明天 {at} 结束` reads "明天 0:30 结束", and
  "明天结束" all day.

No other string takes a placeholder. `npm test` fails if one is left in an event's time.

`separator` joins two parts of an event's time where English writes ", ": the all-day label and
what follows it, "All day, ends tomorrow", and a start time and the phrase saying when it ends,
"22:30, ends tomorrow at 0:30". Write what your language puts between two clauses there. Most
write ", ". Chinese writes "，", with no space, since the mark carries its own: "整天，明天结束".
Thai writes a space alone: "ตลอดวัน สิ้นสุดพรุ่งนี้". `npm run check:i18n` fails on a separator
holding a word, a tab or two spaces in a row. It warns on one the next word would touch, and
where your separator and CLDR disagree about your language writing ", ".

Where only the word before a time changes with the hour, write the one most hours take, as CLDR
and Home Assistant do: Ukrainian `at` is "о", though 11:00 reads "об одинадцятій", and Spanish
is "a las", though 1:00 is "a la una".

Where a time's ending changes with the number, no single string can carry it: Turkish writes
"0:30'da" but "17:00'de". Write the end as a label instead, as Turkish does with `bitiş: yarın`
and `saat`, which reads "bitiş: yarın saat 0:30".

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
