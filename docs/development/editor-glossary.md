# Editor Glossary — Decided Terminology

**Corpus:** `home-assistant-frontend` **20260128.6** (PyPI wheel, every translation
fragment merged — 7,341 English keys).
**Editor table read:** `EDITOR_STRINGS`, 312 keys, imported rather than parsed.
**Comparisons are case-sensitive** throughout. A comparison that case-folds cannot report
on capitalisation, and capitalisation is one of the two things this document decides.

This is the termbase the nine language sessions work from. It exists because nine sessions
deciding _event_ independently is a divergence nobody can repair afterwards without
re-reading all nine files, and because a settings UI that calls one thing by two names
reads as sloppiness far more than an imperfect single string does.

**It is a decision record, not generated output.** Edit it by hand. `scripts/check-i18n.mjs`
parses the `**Decided**` and `**Rejected:**` lines out of it, so an edit here changes what
CI enforces — which is the point.

---

## 1. How To Use This

1. **Find your language's column.** Use the decided form. If it differs from what the file
   says today, the file is what changes.
2. **Read the sense line.** It is there so you check your word against the _meaning_, not
   against a neighbour's word. Where the nine split, they usually split on sense.
3. **Where a cell is `—`, decide it and write it back here** before using it, so the next
   session finds it decided.
4. **Inflect freely.** The decided form is the citation form. Nothing here asks you to
   write ungrammatical text to satisfy a table; a compound, a case ending or an enclitic
   article is expected.

## 2. Two Rules For Reading Home Assistant

Home Assistant's own translations are the register an HA card editor should be written in,
and they are the only per-language oracle available. They are not authoritative.

> **Rule 1 — reject any HA value byte-identical to its English.** That is HA's own
> translation gap, not evidence. Latvian's table is ~20% English, so without this guard
> the oracle degrades the language it is least able to help. Applied across the terms
> below it fires **17 times**, eight of them Latvian.

> **Rule 1 has a false-positive class, and it matters.** `Position` in German and Swedish,
> and `Layout` in German and Swedish, are byte-identical to the English _because the word
> is the same in those languages_. Rule 1 correctly refuses them **as evidence** — it
> cannot tell a loanword from a gap — but the word can still be right. Where that happens
> the entry says so, and the decision rests on our own files instead.

> **And the two _can_ be told apart, by looking one string wider.** A translation gap
> leaves the **whole string** in English; a loanword leaves **one word inside a translated
> sentence**. HA German's `Label` is a loanword by that test — `Label hinzufügen`,
> `Keine Labels verfügbar`, `Label konnte nicht erstellt werden` — where a genuine gap
> reads `Add label`. The test is mechanical, it costs one extra lookup, and it is what
> decided the German `label` entry below. Use it before concluding a term has no evidence.

> **Rule 2 — the domain sense wins.** Look a term up at a _calendar_ key wherever one
> exists. This is not a nicety; it reverses conclusions. Reading `event` at HA's `event`
> **entity** domain — a button press, a doorbell — instead of at
> `ui.components.calendar.event.*` is what produced the recommendation that German should
> say `Ereignis`, when HA's own calendar UI says **Termin**. Three further terms below
> (`weekday`, `size`, `position`) are decided against HA for the same reason.

## 3. Casing — One Decision Per Language

Terminology and orthography are **independent axes**. Polish agrees with Home Assistant on
essentially every term while title-casing 80% of its multi-word labels. A session that
checks its vocabulary, finds agreement and reports the language clean will have missed the
larger defect. So casing is decided once here, per language, and checked separately.

English uses Title Case for labels. Almost no other language does.

| language | rule                                                         | mid-string capitals today | verdict                                              |
| -------- | ------------------------------------------------------------ | ------------------------: | ---------------------------------------------------- |
| de       | **Nouns are capitalised** — German orthography, not a calque |                       73% | correct, exempt from the check                       |
| et       | Sentence case                                                |                        3% | correct                                              |
| it       | Sentence case                                                |                        2% | correct                                              |
| lt       | Sentence case                                                |                        0% | correct                                              |
| lv       | Sentence case                                                |                        0% | correct                                              |
| nb       | Sentence case                                                |                        5% | correct                                              |
| **pl**   | Sentence case                                                |                   **80%** | **systematic calque — fix all 111 existing strings** |
| sk       | Sentence case                                                |                        0% | correct                                              |
| sv       | Sentence case                                                |                        5% | correct                                              |

Measured over multi-word labels, counting non-initial words whose first character is
upper-case, with all-caps acronyms (`UV`) excluded because they are correct. The check
in `check-i18n.mjs` recomputes this and warns above 15%, which cleanly separates the 0–5%
languages from Polish and leaves room for proper nouns.

**Weekday casing — resolved by the `sv`/`nb` session (Stage 1). Both editor files were
already right, and the apparent Norwegian disagreement was an artefact of comparing two
different contexts.**

The question was correctly reframed as **"does a standalone UI label take an initial
capital here?"** rather than "does this language capitalise weekdays". Two pieces of
evidence settle it, and neither was available while the question was still being asked as
an orthography question.

**1. Home Assistant answers it in the identical control.** The strings at issue are the
option labels of `first_day_of_week`, a `select` whose values are `system` / `monday` /
`sunday`. Home Assistant ships that same control on its profile page, and its option
labels are `ui.panel.profile.first_weekday.values.*` — **`Måndag` (sv), `Mandag` (nb)**.
Not the generic `ui.weekdays.*` cited earlier but the same widget for the same purpose, so
it needs no argument from analogy.

**And HA Swedish demonstrates the standalone/prose split inside its own language**, which
is what makes it a convention rather than carelessness. Same corpus, same contributors:

| context                                                       | HA `sv`                        |
| ------------------------------------------------------------- | ------------------------------ |
| standalone option (`first_weekday.values.monday`)             | `Måndag`                       |
| string-initial (`backup…schedule_options.mon`)                | `Måndag kl {time}`             |
| **mid-sentence** (`backup…next_backup_description.mon`)       | `nästa **m**åndag kl. {time}`  |

So HA Swedish lowercases the weekday in running prose — correct Swedish — and capitalises
it as a standalone label. That is the standalone-label convention shown, not assumed.
(HA's Norwegian has no prose evidence: both `backup` strings are untranslated English
there, so Rule 1 excludes them.)

**2. The Norwegian "disagreement between two native sources" does not exist.** The card's
`nb.json` carries _two_ weekday arrays, and its contributor applied exactly the same split:

|                  | used at                                    | context         | `nb`       | `sv`       |
| ---------------- | ------------------------------------------ | --------------- | ---------- | ---------- |
| `daysOfWeek`     | `leaves.ts` — the day header's weekday cell | standalone label | `Man`      | `Mån`      |
| `fullDaysOfWeek` | `format.ts` — `«{weekday}, 3 mars kl …»`    | running text    | `mandag`   | `Måndag`   |

The `mandag` that was read as contradicting the editor is the **running-text** form. Its
actual counterpart — the standalone one — is `Man`, **capitalised, agreeing with the editor
and with HA**. Two artefacts were compared at different keys and the mismatch was attributed
to the language.

**Decision: leave both. `Måndag`/`Söndag` (sv) and `Mandag`/`Søndag` (nb) are correct**, and
this is no longer an open question for a native speaker.

> **Corpus caveat, per §7.** The HA evidence above was read from wheel **`20250109.2`**, not
> the `20260128.6` this document is otherwise pinned to — `pip` on this machine resolves
> through the proxy §7 describes, whose index for this package stops there, and the explicit
> pin fails outright. The corpus reports 5,884 English keys, which is the older-wheel
> signature §7 gives. Both keys used here (`ui.panel.profile.first_weekday.values.*` and the
> `backup` schedule strings) are present in it. This row is unlikely to be
> version-sensitive in the way `location` was — the profile control predates both wheels —
> but it has **not** been re-read on the newer corpus, and that is the honest state of it.

> **One residual, in the card and therefore out of this document's scope.** Swedish's
> `fullDaysOfWeek` is `Måndag` — capitalised in a running phrase, where HA Swedish writes
> `nästa måndag` and where Norwegian's `fullDaysOfWeek` is correctly lowercase. That is a
> plausible defect in `src/translations/languages/sv.json`, which is native-contributed and
> on the eager path. Recorded, not touched.

### 3.1 Casing is not the only orthographic calque — compounding is the other

**Found by the German session (Stage 1), and it is the German equivalent of Polish's
title-case defect.** German writes a noun-noun compound solid or with a hyphen; a space
between the two is the well-known _Deppenleerzeichen_, and it is what the editor shipped:

| shipped                     | English              | correct                    |
| --------------------------- | -------------------- | -------------------------- |
| `Wochentag Schriftgröße`    | Weekday Font Size    | `Wochentag-Schriftgröße`   |
| `Zeit Symbol Größe`         | Time Icon Size       | `Uhrzeit-Symbolgröße`      |
| `Wochenende Wochentag Farbe`| Weekend Weekday Color| `Wochentagsfarbe am Wochenende` |
| `Abstand Tag`               | Day Spacing          | `Tagesabstand`             |

**24 of German's 134 existing strings, ~18%.** It is a calque of English's noun-stacking,
it came in from the pre-v4 archive rather than being introduced by the rebuild, and — the
part that matters here — **the same contributor wrote `Akzentfarbe`, `Hintergrundfarbe`,
`Tagestrenner` and `Kalender-Entität` correctly.** So it is not a knowledge gap; it is what
happens when a qualified English label is rendered word by word in order.

Home Assistant settles it independently: `State color` → `Zustandsfarbe`, `Calendar color`
→ `Kalenderfarbe`, `Background alignment` → `Hintergrundausrichtung`, and `RGB color` →
`RGB-Farbe` where an acronym forces the hyphen. Never a space.

**This is not a German-only concern.** Swedish _särskrivning_ and Norwegian _særskriving_
are the same error under different names, and both languages are in the nine. Danish,
Dutch and Finnish compound the same way. **The sessions for `sv` and `nb` should check
their files for it specifically**, because §3's casing check is blind to it — the two are
independent axes in exactly the way terminology and casing are, and a language can pass the
casing check while every second label is spaced wrongly.

No mechanical check is proposed. The English side of these labels is genuinely two words,
so a check would have to know which pairs are compounds in the target language, and that is
the translator's judgement rather than a shape question. It is recorded here instead.

**The rule German applies, stated once so it is not re-derived eight times:** compounds are
written solid where that stays readable, and hyphenated (Duden's _Bindestrich zur besseren
Lesbarkeit_) where it does not. In practice the simple heads — `Farbe`, `Höhe`, `Breite`,
`Größe`, `Abstand` — go solid with the correct _Fugenelement_ (`Wochentagsfarbe`,
`Monatsfarbe`, `Tagesabstand`), and the compound heads — `Schriftgröße`, `Symbolgröße`,
`Zeilenlimit`, `Hintergrundfarbe` — take the hyphen (`Wochentag-Schriftgröße`,
`Wochennummer-Hintergrundfarbe`). Where the qualifier is a whole phrase rather than a noun,
German prefers the prepositional form to a three-element compound: `Wochentagsfarbe am
Wochenende`, not `Wochenend-Wochentagsfarbe`.

#### 3.1.1 Measured for `sv` and `nb` — the prediction held

**Both languages carried it, and the calque test is even cleaner than German's.** Measured
by the `sv`/`nb` session (Stage 1) over the 111 pre-existing strings in each:

| language | wrongly split | of 111 | German's rate for comparison |
| -------- | ------------: | -----: | ---------------------------: |
| `nb`     |    **17**     | 15%    | 24 of 134 (18%)              |
| `sv`     |    **11**     | 10%    | —                            |

German's test was that the same contributor also wrote compounds correctly, so it is
rendering rather than ignorance. Here the **same qualifier** appears both ways within a few
lines of one file, which is the same argument without the inference:

| language | correct, solid                              | split, adjacent key                  |
| -------- | ------------------------------------------- | ------------------------------------ |
| `nb`     | `Ukenummerfarge` (Week Number Color)        | `Ukenummer bakgrunnsfarge`           |
| `nb`     | `Fremdriftslinjefarge`, `Fremdriftslinjehøyde` | `Fremdriftslinje bredde`          |
| `nb`     | `Ukedagsfarge` (Weekday Color)              | `Helg ukedagsfarge`                  |
| `sv`     | `Veckodagsfärg` (Weekday Color)             | `Veckonummer färg` (Week Number Color) |
| `sv`     | `Månadsfärg`                                | `Helg månadsfärg`                    |

**And the two languages split the _same English string_ differently**, which no knowledge
gap explains: `UV Index Threshold` is `UV-indextröskel` in Swedish, correctly, and
`UV-indeks terskel` in Norwegian, wrongly.

The pattern across all 28 is that **the longer the English, the likelier it was rendered
word by word** — `Week Number Color` survives as a compound where the three-word
`Week Number Background Color` does not. That is the signature of translating in order
rather than naming the thing.

**No mechanical check was added, and the German session's reasoning for that is confirmed
rather than merely inherited.** The candidate enumeration is easy — multi-word labels whose
non-initial words are lower-case — but it returns 37 candidates for `sv` of which only 11
are defects, because `Visa tid`, `Dagar att visa`, `Vertikal justering` and `Fast höjd` are
all correct multi-word phrases. Separating them needs a noun lexicon, which is the
translator's judgement. Note also that the casing check cannot help even in principle:
särskrivning leaves the second word **lower-case**, and that check counts capitals, so the
two defects are invisible to each other by construction.

**The rule for both languages**, so it is not re-derived: noun-noun compounds are written
solid, with the linking `-s` where the first element takes one (`hendelsesavstand`,
`beskrivelsesfarge`). A hyphen appears only where an acronym or a phrase forces it
(`UV-indeksterskel`, `Idag-indikator`, `I dag-markør`). Bokmål additionally reduces three
identical consonants to two — `etikett` + `type` = `etikettype`, which is why the shipped
`Etiketttype` was wrong and Swedish's `Etikettyp` was right. Where a three-element compound
stops being readable, both languages prefer the prepositional form to a longer solid one:
`Bakgrunnsfarge for ukenummer`, not `Ukenummerbakgrunnsfarge`.

## 4. The Core Noun — `event`

The card and its editor disagree on the word for a calendar entry. **In German only.** The
plan recorded this as a general problem and resolved it towards `Ereignis`; both halves of
that are wrong, and the evidence is unambiguous.

|                     | de          | et       | it     | lt     | lv       | nb        | pl         | sk       | sv        |
| ------------------- | ----------- | -------- | ------ | ------ | -------- | --------- | ---------- | -------- | --------- |
| HA, calendar domain | **Termin**  | sündmus  | evento | įvykis | notikums | hendelse  | wydarzenie | udalosť  | händelse  |
| our card            | **Termin**e | sündmusi | evento | įvykių | notikumu | hendelser | wydarzeń   | udalosti | händelser |
| our editor          | _Ereignis_  | Sündmuse | evento | Įvykio | Notikuma | Hendelse  | Wydarzeń   | udalosti | Händelse  |

Eight of nine already agree three ways. German is the only disagreement, and there the
card and Home Assistant agree with each other against the editor.

`component.event.title` — the key the earlier reading used — belongs to Home Assistant's
`event` **entity** domain, which models a stateless occurrence such as a button press. It
is a different concept that happens to share an English name. At
`ui.components.calendar.event.add` HA German says `Termin hinzufügen`, at `.delete`
`Termin löschen`, at `.edit` `Termin bearbeiten`.

**Decision: the editor changes to `Termin`. The card is already correct and must not be
touched.** That reverses the plan's recommendation and, usefully, removes the eager-bundle
question entirely — no card string changes, so nothing on the eager path moves.

---

## 5. Terms

Ordered by measured risk, not by frequency. `time` and `start date` lead because they are
where the nine languages were _measured_ to diverge; a term nobody ever decided is more
dangerous than a frequent one everybody already renders the same way.

### time — the clock time printed on an event row

Not a duration, not a general "time" in the abstract. The key heads the group containing
`show_time`, `show_end_time`, `time_two_digit_hours` and `time_font_size`, so it is the
`14:30` on the row.

**The nine do not agree with each other, and that is the finding.** German, Lithuanian,
Latvian, Norwegian, Polish, Slovak and Swedish reach for the general word; Estonian and
Italian reach for the specific one. HA disagrees with us in three languages _in opposite
directions_ — it is more specific than us in German and less specific in Estonian and
Italian. Since the sense is a clock time, HA is right for German and wrong for the other
two.

|             | de      | et       | it     | lt     | lv    | nb  | pl   | sk  | sv  |
| ----------- | ------- | -------- | ------ | ------ | ----- | --- | ---- | --- | --- |
| **Decided** | Uhrzeit | Kellaaeg | Orario | Laikas | Laiks | Tid | Czas | Čas | Tid |
| HA          | Uhrzeit | Aeg      | Ora    | Laikas | _!EN_ | Tid | Czas | Čas | Tid |
| editor now  | _Zeit_  | Kellaaeg | Orario | Laikas | Laiks | Tid | Czas | Čas | Tid |

German changes. The five languages whose single word covers both senses keep it — `Tid`,
`Czas`, `Čas`, `Laikas`, `Laiks` are what a clock time is called in those languages, and
there is no more specific alternative that a UI would use.

### start date — the day the card's window begins

Disputed in four of nine languages, which is what promoted it here. It is a term nobody
ever decided rather than four separate slips.

|             | de             | et               | it             | lt            | lv            | nb        | pl                | sk               | sv         |
| ----------- | -------------- | ---------------- | -------------- | ------------- | ------------- | --------- | ----------------- | ---------------- | ---------- |
| **Decided** | Startdatum     | Alguskuupäev     | Data di inizio | Pradžios data | Sākuma datums | Startdato | Data początkowa   | Počiatočný dátum | Startdatum |
| HA          | _Anfangsdatum_ | _Alguse kuupäev_ | Data di inizio | Pradžios data | Sākuma datums | Startdato | Data początkowa   | _Dátum začiatku_ | Startdatum |
| editor now  | Startdatum     | Alguskuupäev     | Data di inizio | Pradžios data | Sākuma datums | Startdato | _Data Początkowa_ | Počiatočný dátum | Startdatum |

Only Polish changes, and only in capitalisation — `Data Początkowa` to `Data początkowa`.
That single difference was invisible to the earlier analysis because it case-folded before
comparing, in the one language whose capitalisation is most wrong.

German, Estonian and Slovak keep their existing forms against HA: `Startdatum` matches the
Norwegian and Swedish `Startdato`/`Startdatum` we already ship, Estonian compounding is
normal, and both Slovak forms are idiomatic. These are judgement calls with no better
arbiter, taken once here so they are not taken again nine times.

### event — a calendar entry with a start and an end

See §4 for the evidence. HA row is the noun extracted from `ui.components.calendar.event.add`.

|             | de     | et      | it     | lt     | lv       | nb       | pl         | sk      | sv       |
| ----------- | ------ | ------- | ------ | ------ | -------- | -------- | ---------- | ------- | -------- |
| **Decided** | Termin | sündmus | evento | įvykis | notikums | hendelse | wydarzenie | udalosť | händelse |
| HA          | Termin | sündmus | evento | įvykis | notikums | hendelse | wydarzenie | udalosť | händelse |

**Rejected:** de `Ereignis`

### calendar — a calendar entity supplying events

|             | de       | et       | it         | lt          | lv        | nb       | pl        | sk       | sv       |
| ----------- | -------- | -------- | ---------- | ----------- | --------- | -------- | --------- | -------- | -------- |
| **Decided** | Kalender | Kalender | Calendario | Kalendorius | Kalendārs | Kalender | Kalendarz | Kalendár | Kalender |
| HA          | Kalender | Kalender | Calendario | Kalendorius | Kalendārs | Kalender | Kalendarz | Kalendár | Kalender |

### entity — a Home Assistant entity

Whatever the user's own HA sidebar says, because that is where they learned the word.

|             | de      | et   | it     | lt        | lv      | nb      | pl    | sk     | sv      |
| ----------- | ------- | ---- | ------ | --------- | ------- | ------- | ----- | ------ | ------- |
| **Decided** | Entität | Olem | Entità | Subjektas | Vienība | Entitet | Encja | Entita | Entitet |
| HA          | Entität | Olem | Entità | Subjektas | Vienība | Entitet | Encja | Entita | Entitet |

### weather — the weather integration and its forecast

|             | de     | et  | it    | lt   | lv           | nb  | pl     | sk      | sv    |
| ----------- | ------ | --- | ----- | ---- | ------------ | --- | ------ | ------- | ----- |
| **Decided** | Wetter | Ilm | Meteo | Orai | Laikapstākļi | Vær | Pogoda | Počasie | Väder |
| HA          | Wetter | Ilm | Meteo | Orai | _!EN_        | Vær | Pogoda | Počasie | Väder |

Latvian is ours; HA has no translation there.

### location — the place an event happens

An event's venue, not a device's whereabouts and not a position on screen. Italian is
decided against our own file: `Posizione` is the _position_ sense and collides with the
`position` term below, where Italian needs the same word for a different thing. HA's
calendar-domain key says `Luogo`.

|             | de  | et      | it          | lt    | lv              | nb    | pl          | sk          | sv    |
| ----------- | --- | ------- | ----------- | ----- | --------------- | ----- | ----------- | ----------- | ----- |
| **Decided** | Ort | Asukoht | Luogo       | Vieta | Atrašanās vieta | Sted  | Lokalizacja | Miesto      | Plats |
| HA          | Ort | Asukoht | Luogo       | Vieta | Notikuma vieta  | _!EN_ | Lokalizacja | Umiestnenie | Plats |
| editor now  | Ort | Asukoht | _Posizione_ | Vieta | Atrašanās vieta | Sted  | Lokalizacja | Miesto      | Plats |

**Rejected:** it `Posizione`

German agrees three ways — HA's calendar key, our editor and the natural German word are
all `Ort`. The plan recorded this as a term where we _override_ HA; that came from reading
HA's generic selector key, which is the device sense. There is no disagreement.

> **This row is the version-sensitive one.** The deciding key,
> `ui.components.calendar.event.location`, exists in wheel `20260128.6` and **not** in
> `20250109.2`. On the older corpus the only `Location` keys are the device, storage,
> backup and condition senses, all of which give German `Standort`/`Speicherort` and
> Italian `Posizione` — so the Italian change above looks unfounded rather than merely
> newer. Pin the version before concluding this row is wrong; §7.

Latvian is internally inconsistent today: `location` is `Atrašanās vieta` but
`location_font_size` says `Adreses ...` (_address_). One of them is wrong.

### description — an event's description text

|             | de           | et        | it          | lt        | lv       | nb          | pl   | sk    | sv          |
| ----------- | ------------ | --------- | ----------- | --------- | -------- | ----------- | ---- | ----- | ----------- |
| **Decided** | Beschreibung | Kirjeldus | Descrizione | Aprašymas | Apraksts | Beskrivelse | Opis | Popis | Beskrivning |
| HA          | Beschreibung | Kirjeldus | Descrizione | Aprašymas | Apraksts | Beskrivelse | Opis | Popis | Beskrivning |

Agrees nine ways with Home Assistant and with our own files. Nothing to decide.

### label — the small text tag drawn beside an event

|             | de    | et   | it        | lt      | lv      | nb      | pl       | sk        | sv      |
| ----------- | ----- | ---- | --------- | ------- | ------- | ------- | -------- | --------- | ------- |
| **Decided** | Label | Silt | Etichetta | Etiketė | Etiķete | Etikett | Etykieta | Štítok    | Etikett |
| HA          | _!EN_ | Silt | Etichetta | Etiketė | _!EN_   | Etikett | Etykieta | Štítok    | Etikett |
| editor now  | Label | Silt | Etichetta | Etiketė | Etiķete | Etikett | Etykieta | _Menovka_ | Etikett |

**Rejected:** sk `Menovka`

**German decided by the German session (Stage 1): `Label`, the loanword.** Rule 1 flags
HA's German `Label` as English-identical, and here that is a **false positive of a kind the
rule cannot see but a reader can** — the surrounding string is translated and only the noun
is kept: `Label hinzufügen`, `Neues Label „{name}“ hinzufügen`, `Keine Labels verfügbar`,
`Label konnte nicht erstellt werden`. **An untranslated gap leaves the whole string in
English; a loanword leaves one word in a German sentence.** That distinction is mechanical
and is the better test — see the note under Rule 1.

`Beschriftung` was the alternative and loses on two counts: our label may be text, an icon
_or_ an image, and `Beschriftung` means specifically written text; and the reader has
already learned `Label` from HA's own sidebar, which is the same argument the `entity` entry
makes. Our editor and the pre-v4 archive both already wrote `Label-Typ`.

Because the decided form is byte-identical to the English, `de:entity.label` is listed in
`IDENTICAL_TO_ENGLISH_OK` in `scripts/check-i18n.mjs` with that reason.

Slovak moves to HA's `Štítok`. `Menovka` is a nameplate; `Štítok` is what the Slovak user
sees everywhere else in Home Assistant. A native speaker may overrule this — it is decided
on the align-with-HA rule, not on Slovak intuition.

### all day — an event with no clock time

|             | de        | et         | it              | lt         | lv         | nb         | pl         | sk       | sv     |
| ----------- | --------- | ---------- | --------------- | ---------- | ---------- | ---------- | ---------- | -------- | ------ |
| **Decided** | Ganztägig | Terve päev | Tutto il giorno | Visą dieną | Visu dienu | Hele dagen | Cały dzień | Celý deň | Heldag |
| HA          | Ganztägig | Terve päev | Tutto il giorno | Visą dieną | Visu dienu | Hele dagen | Cały dzień | Celý deň | Heldag |

The card renders the same concept lower-case and mid-sentence (`ganztägig`, `cały dzień`),
which is correct there and is not a divergence. Estonian's card string is `kogu päev`
against HA's `Terve päev`; both are idiomatic, and the label form decided here is HA's.

### today — the current day

|             | de    | et   | it   | lt       | lv     | nb    | pl      | sk   | sv    |
| ----------- | ----- | ---- | ---- | -------- | ------ | ----- | ------- | ---- | ----- |
| **Decided** | Heute | Täna | Oggi | Šiandien | Šodien | I dag | Dzisiaj | Dnes | I dag |
| HA          | Heute | Täna | Oggi | Šiandien | Šodien | I dag | Dzisiaj | Dnes | I dag |

### layout — list layout versus column layout

The v4 term the whole view system is named for. Four languages keep the loanword.

|             | de     | et       | it           | lt         | lv          | nb      | pl    | sk         | sv     |
| ----------- | ------ | -------- | ------------ | ---------- | ----------- | ------- | ----- | ---------- | ------ |
| **Decided** | Layout | Paigutus | Layout       | Išdėstymas | Izkārtojums | Layout  | Układ | Rozloženie | Layout |
| HA          | _!EN_  | Paigutus | Disposizione | Išdėstymas | Izklājums   | Oppsett | Układ | Rozloženie | _!EN_  |

German and Swedish are the Rule 1 false-positive case: HA leaves `Layout` because that
_is_ the German and Swedish word, and our files independently chose it. Italian and
Norwegian keep our loanword against HA — `Disposizione` is arrangement and `Oppsett` is
setup or configuration, and neither is what a layout picker means.

### columns — the vertical divisions of the column layout

|             | de      | et     | it      | lt         | lv       | nb       | pl      | sk     | sv       |
| ----------- | ------- | ------ | ------- | ---------- | -------- | -------- | ------- | ------ | -------- |
| **Decided** | Spalten | Veerud | Colonne | Stulpeliai | Kolonnas | Kolonner | Kolumny | Stĺpce | Kolumner |
| HA          | Spalten | Veerud | Colonne | Stulpeliai | Kolonnas | Kolonner | Kolumny | Stĺpce | Kolumner |

Net-new — no editor key is translated yet. Taken wholesale from HA's grid-card vocabulary,
which is the closest concept the user already has a word for.

### list — the list layout

|             | de    | et      | it    | lt      | lv       | nb    | pl    | sk     | sv    |
| ----------- | ----- | ------- | ----- | ------- | -------- | ----- | ----- | ------ | ----- |
| **Decided** | Liste | Loetelu | Lista | Sąrašas | Saraksts | Liste | Lista | Zoznam | Lista |
| HA          | Liste | Loetelu | Lista | Sąrašas | _!EN_    | Liste | Lista | Zoznam | Lista |

Latvian `Saraksts` is judgement — HA has no translation and we have no string yet.

### compact — compact mode

|                | de           | et            | it                  | lt                   | lv                | nb            | pl                | sk              | sv           |
| -------------- | ------------ | ------------- | ------------------- | -------------------- | ----------------- | ------------- | ----------------- | --------------- | ------------ |
| **Decided**    | Kompaktmodus | Kompaktrežiim | Modalità compatta   | Suglaudintas režimas | Kompaktais režīms | Kompakt modus | Tryb kompaktowy   | Kompaktný režim | Kompakt läge |
| HA (_compact_) | Kompakt      | Kompaktne     | Compatto            | Kompaktiškas         | _!EN_             | Kompakt       | Kompaktowy        | Kompaktný       | Kompakt      |
| editor now     | Kompaktmodus | Kompaktrežiim | _Modalità Compatta_ | Suglaudintas režimas | Kompaktais režīms | Kompakt modus | _Tryb Kompaktowy_ | Kompaktný režim | Kompakt läge |

Italian and Polish change in capitalisation only, per §3.

### position — where something sits on the card

|             | de       | et    | it         | lt      | lv       | nb       | pl      | sk     | sv       |
| ----------- | -------- | ----- | ---------- | ------- | -------- | -------- | ------- | ------ | -------- |
| **Decided** | Position | Asend | Posizione  | Padėtis | Pozīcija | Posisjon | Pozycja | Poloha | Position |
| HA          | _!EN_    | Asend | _Apertura_ | Padėtis | Pozīcija | Posisjon | Pozycja | Poloha | _!EN_    |

German and Swedish are Rule 1 false positives again — `Position` is the word in both.
Italian's HA value is rejected under Rule 2: `Apertura` is a cover's _opening_ percentage,
a different concept that shares a key name.

### separator — the rule drawn between days or weeks

No HA evidence for _separator_. HA's nearest decided concept is **Divider**, which is the
same object under a different English name, so it is used as evidence and labelled as such.

|                | de          | et       | it       | lt        | lv         | nb    | pl       | sk         | sv       |
| -------------- | ----------- | -------- | -------- | --------- | ---------- | ----- | -------- | ---------- | -------- |
| **Decided**    | Trennlinie  | Eraldaja | Divisore | Skirtukas | Atdalītājs | Deler | Dzielnik | Rozdeľovač | Avdelare |
| HA (_divider_) | Trennlinie  | Eraldaja | Divisore | Skirtukas | Atdalītājs | Deler | Dzielnik | Rozdeľovač | Avdelare |
| editor now     | Trennlinien | —        | —        | —         | —          | —     | —        | —          | —        |

German already says `Trennlinien` for the panel title, which corroborates the borrowed
evidence independently.

### day header — the date row heading each day's events

**No evidence in any source.** Genuinely undecided in six languages, and one of the
highest-risk terms precisely because nothing external will arbitrate it.

|             | de               | et  | it  | lt  | lv  | nb            | pl  | sk  | sv        |
| ----------- | ---------------- | --- | --- | --- | --- | ------------- | --- | --- | --------- |
| **Decided** | Tagesüberschrift | —   | —   | —   | —   | Dagoverskrift | —   | —   | Dagrubrik |

Constraint for whoever decides it: it heads a _day_, not a column and not a card, and the
same word must be used in `panel.day_header` and in every `day_header_*` key.

**Swedish and Norwegian decided by the `sv`/`nb` session (Stage 1), and they agree with
German by construction rather than by imitation** — all three are Germanic and reach for
the same compound, _day_ + _heading_.

Swedish `Dagrubrik` has a second argument behind it. HA Swedish renders `Title` as
`Rubrik`, which the `title` entry below **rejects** for an event's title precisely because
`Rubrik` means a section heading rather than a headline. A day header _is_ a section
heading, so the word this glossary turns down in one place is the right one here — the two
decisions corroborate each other instead of conflicting.

Norwegian `Dagoverskrift` uses `overskrift`, the ordinary Bokmål word for a heading, and
compounds cleanly into the keys that need it — `Avstand under dagoverskrift`,
`Strek under dagoverskrift`.

### progress bar — the bar showing how far through an event we are

|             | de                 | et           | it                 | lt              | lv             | nb              | pl            | sk             | sv                |
| ----------- | ------------------ | ------------ | ------------------ | --------------- | -------------- | --------------- | ------------- | -------------- | ----------------- |
| **Decided** | Fortschrittsbalken | Edenemisriba | Barra di progresso | Progreso juosta | Progresa josla | Fremdriftslinje | Pasek postępu | Lišta priebehu | Förloppsindikator |

No HA evidence; taken from our own existing strings, which already render it consistently
across `show_progress_bar`, `progress_bar_color`, `progress_bar_height` and
`progress_bar_width`. Polish is decapitalised per §3.

### countdown — the time remaining until an event starts

|             | de        | et      | it                  | lt                     | lv                | nb         | pl         | sk            | sv         |
| ----------- | --------- | ------- | ------------------- | ---------------------- | ----------------- | ---------- | ---------- | ------------- | ---------- |
| **Decided** | Countdown | Loendur | Conto alla rovescia | Atgalinis skaičiavimas | Atpakaļskaitīšana | Nedtelling | Odliczanie | Odpočítavanie | Nedräkning |

No HA evidence; extracted from our own `show_countdown` in all nine.

### week number — the ISO week number

|             | de           | et           | it               | lt               | lv             | nb        | pl             | sk           | sv          |
| ----------- | ------------ | ------------ | ---------------- | ---------------- | -------------- | --------- | -------------- | ------------ | ----------- |
| **Decided** | Wochennummer | Nädalanumber | Numero settimana | Savaitės numeris | Nedēļas numurs | Ukenummer | Numer tygodnia | Číslo týždňa | Veckonummer |
| HA (_week_) | Woche        | nädal        | settimana        | savaitė          | nedēļa         | uke       | tydzień        | týždeň       | vecka       |

The compound is ours; the `week` stem is corroborated by HA's `rrule.week`. Polish is
decapitalised per §3.

### today indicator — the marker showing the current day or time

|             | de               | et                      | it              | lt                      | lv                  | nb           | pl               | sk                   | sv             |
| ----------- | ---------------- | ----------------------- | --------------- | ----------------------- | ------------------- | ------------ | ---------------- | -------------------- | -------------- |
| **Decided** | Heute-Markierung | Tänase päeva indikaator | Indicatore oggi | Šiandienos indikatorius | Šodienas indikators | I dag-markør | Wskaźnik dzisiaj | Identifikátor dneška | Idag-indikator |

**German and Norwegian were undecided because their current strings are ungrammatical.**
`Heute Indikator` is not a German compound — German needs `Heute-Indikator` or a
prepositional phrase such as `Markierung für heute`; `I dag indikator` has the same problem
in Norwegian. Which one reads better is a native judgement, so it was left to those two
sessions rather than guessed here. The current strings must not simply be kept.

**German decided by the German session (Stage 1): `Heute-Markierung`.** The hyphen is what
makes the compound legal, and `Markierung` is chosen over `Indikator` because it is the
plainer word and because it compounds cleanly into the three sub-labels the group needs —
`Markierungsfarbe`, `Markierungsgröße`, `Markierungsposition` — where `Indikator` would give
`Indikatorfarbe`, readable but stiff.

**Norwegian decided by the `sv`/`nb` session (Stage 1): `I dag-markør`**, on the same two
grounds, which is convergence rather than copying — the shipped `I dag indikator` is
særskriving, and the hyphen is what makes an attributive phrase legal in Bokmål. `i dag` is
two words in Bokmål, so the hyphen also stops `dag` binding to `markør` and being read as
_day marker_. `Markør` compounds into the sub-labels the group needs — `Markørfarge`,
`Markørstørrelse`, `Markørposisjon`.

**Swedish keeps `Idag-indikator` and needs no change**, and the difference from Norwegian is
real rather than inconsistency: Swedish writes `idag` solid, so the compound needs no space
resolving and `-indikator` attaches directly.

### color — any colour setting

|             | de    | et   | it     | lt     | lv    | nb    | pl    | sk    | sv   |
| ----------- | ----- | ---- | ------ | ------ | ----- | ----- | ----- | ----- | ---- |
| **Decided** | Farbe | Värv | Colore | Spalva | Krāsa | Farge | Kolor | Farba | Färg |
| HA          | Farbe | Värv | Colore | Spalva | Krāsa | Farge | Kolor | Farba | Färg |

Agrees nine ways across all three artefacts. The single most frequent term in the table —
32 of 312 keys — and the one that needed the least deciding.

### icon — an MDI icon

|             | de     | et    | it    | lt         | lv    | nb   | pl    | sk    | sv   |
| ----------- | ------ | ----- | ----- | ---------- | ----- | ---- | ----- | ----- | ---- |
| **Decided** | Symbol | Ikoon | Icona | Piktograma | Ikona | Ikon | Ikona | Ikona | Ikon |
| HA          | Symbol | Ikoon | Icona | Piktograma | Ikona | Ikon | Ikona | Ikona | Ikon |

German says `Symbol`, not `Icon`, and that is what HA says too.

### background — a background colour or fill

|             | de          | et    | it     | lt    | lv   | nb       | pl  | sk      | sv       |
| ----------- | ----------- | ----- | ------ | ----- | ---- | -------- | --- | ------- | -------- |
| **Decided** | Hintergrund | Taust | Sfondo | Fonas | Fons | Bakgrunn | Tło | Pozadie | Bakgrund |
| HA          | Hintergrund | Taust | Sfondo | Fonas | Fons | Bakgrunn | Tło | Pozadie | Bakgrund |

### title — the card's title, and an event's title

|             | de    | et        | it     | lt          | lv         | nb     | pl    | sk    | sv       |
| ----------- | ----- | --------- | ------ | ----------- | ---------- | ------ | ----- | ----- | -------- |
| **Decided** | Titel | Pealkiri  | Titolo | Pavadinimas | Virsraksts | Tittel | Tytuł | Názov | Titel    |
| HA          | Titel | _Nimetus_ | Titolo | Pavadinimas | Virsraksts | Tittel | Tytuł | Názov | _Rubrik_ |

Estonian and Swedish keep ours against HA under Rule 2: an event's title is a headline
(`Pealkiri`, `Titel`), where HA's `Nimetus` is a designation and `Rubrik` is a section
heading on a dashboard.

### width — a width in pixels

|             | de     | et    | it        | lt     | lv      | nb     | pl        | sk    | sv    |
| ----------- | ------ | ----- | --------- | ------ | ------- | ------ | --------- | ----- | ----- |
| **Decided** | Breite | Laius | Larghezza | Plotis | Platums | Bredde | Szerokość | Šírka | Bredd |
| HA          | Breite | Laius | Larghezza | Plotis | _!EN_   | Bredde | Szerokość | Šírka | Bredd |

Latvian `Platums` is ours, from `progress_bar_width`.

### height — a height in pixels

|                    | de   | et     | it      | lt      | lv       | nb    | pl       | sk    | sv   |
| ------------------ | ---- | ------ | ------- | ------- | -------- | ----- | -------- | ----- | ---- |
| **Decided**        | Höhe | Kõrgus | Altezza | Aukštis | Augstums | Høyde | Wysokość | Výška | Höjd |
| HA (_icon height_) | Höhe | kõrgus | Altezza | aukštis | augstums | høyde | Wysokość | Výška | höjd |

Two independent routes agree exactly: HA's `Icon height` and our own `progress_bar_height`.

### size — a font size or icon size

|             | de    | et     | it         | lt    | lv     | nb        | pl      | sk      | sv      |
| ----------- | ----- | ------ | ---------- | ----- | ------ | --------- | ------- | ------- | ------- |
| **Decided** | Größe | Suurus | Dimensione | Dydis | Izmērs | Størrelse | Rozmiar | Veľkosť | Storlek |
| HA          | Größe | _Maht_ | Dimensione | Dydis | _!EN_  | _!EN_     | _!EN_   | Veľkosť | Storlek |

Estonian is decided against HA under Rule 2: `Maht` is capacity or volume — HA's key is a
_backup_ size in bytes — where a font size is `suurus`, which is what our own files already
say. Latvian, Norwegian and Polish come from our files, HA having no translation.

### accent — the accent colour

|             | de          | et                 | it      | lt       | lv      | nb          | pl     | sk          | sv         |
| ----------- | ----------- | ------------------ | ------- | -------- | ------- | ----------- | ------ | ----------- | ---------- |
| **Decided** | Akzentfarbe | Esiletõstmise värv | Accento | Akcentas | Akcents | Aksentfarge | Akcent | Zvýraznenie | Accentfärg |
| HA          | Akzentfarbe | Esiletõstmise värv | Accento | Akcentas | _!EN_   | Aksentfarge | Akcent | Zvýraznenie | Accentfärg |

### font — the typeface, as it appears in `Font Size`

**No HA evidence at all** — the word does not occur anywhere in 7,341 English keys. Taken
from our own files, where all nine already render it.

|             | de      | et   | it   | lt      | lv    | nb     | pl       | sk    | sv   |
| ----------- | ------- | ---- | ---- | ------- | ----- | ------ | -------- | ----- | ---- |
| **Decided** | Schrift | Font | Font | Šriftas | Fonts | Skrift | Czcionka | Písmo | Font |

Swedish is inconsistent today — `Fontstorlek` in most keys but `Beskrivning textstorlek`
in one. Pick `Font` and make it uniform, or pick `Text` and change them all; do not ship
both.

### spacing — vertical gap between elements

**No HA evidence.** Ours, and consistent across `day_spacing`, `event_spacing` and
`additional_card_spacing`.

|             | de      | et   | it         | lt     | lv       | nb      | pl     | sk      | sv      |
| ----------- | ------- | ---- | ---------- | ------ | -------- | ------- | ------ | ------- | ------- |
| **Decided** | Abstand | Vahe | Spaziatura | Tarpas | Atstarpe | Avstand | Odstęp | Medzera | Avstånd |

### opacity — the 0–100 opacity of a fill

**No usable HA evidence, and this one is a trap.** HA renders _opacity_ as
**transparency** in Lithuanian (`skaidrumas`), Norwegian (`gjennomsiktighet`) and Polish
(`Przezroczystość`) — the semantically inverted concept. A slider labelled _transparency_
whose higher values make things more solid is a defect, so HA cannot be copied here.

|             | de        | et  | it      | lt  | lv  | nb       | pl  | sk             | sv       |
| ----------- | --------- | --- | ------- | --- | --- | -------- | --- | -------------- | -------- |
| **Decided** | Deckkraft | —   | Opacità | —   | —   | Opasitet | —   | Nepriehľadnosť | Opacitet |

The four remaining blanks need a native decision: either the language's genuine opacity
word, or a rephrasing of the label so the inversion cannot arise. Do not copy HA's.

**Norwegian decided by the `sv`/`nb` session (Stage 1): `Opasitet`**, and the trap this
entry warns about is exactly why. HA Norwegian's `gjennomsiktighet` is _transparency_, the
inverted concept, so it is unusable. The two native alternatives both fail on other grounds:
`ugjennomsiktighet` is the correct antonym and unusably clumsy for a slider label, and
`dekkevne` — the word Norwegian graphics software uses — is a paint metaphor that reads
oddly against a background tint. `Opasitet` is in Bokmålsordboka, and it is what the file
**already used** in `Hendelse bakgrunnsopasitet`, so the term was in effect chosen by the
original contributor; this entry records it rather than introducing it.

### show / hide — the verbs on every toggle

|                    | de         | et    | it       | lt     | lv      | nb    | pl    | sk       | sv   |
| ------------------ | ---------- | ----- | -------- | ------ | ------- | ----- | ----- | -------- | ---- |
| **Decided** (show) | anzeigen   | Näita | Mostra   | Rodyti | Rādīt   | Vis   | Pokaż | Zobraziť | Visa |
| **Decided** (hide) | ausblenden | Peida | Nascondi | Slėpti | Paslēpt | Skjul | Ukryj | Skryť    | Göm  |
| HA (show)          | einblenden | Kuva  | Mostra   | Rodyti | Parādīt | Vis   | Pokaż | Zobraziť | Visa |

German and Estonian keep ours against HA, because ours is already used consistently across
every `show_*` key and both are idiomatic. **Slovak is inconsistent today** — `Zobraziť`
in most keys but `Zobrazovať` in `show_time`; unify on `Zobraziť`.

Word order is the language's own: German puts the verb last (`Zeit anzeigen`), the others
put it first. Do not calque the English order.

### none — the "no such thing" option

**No single decided form, deliberately.** The string appears at three keys —
`entity.label_type`, `today_indicator_style` and `week_number_mode` — and in gendered
languages it must agree with the noun each one modifies, which is a different noun each
time. All three currently carry one identical form per language, which cannot be right for
all three.

|             | de   | et     | it  | lt   | lv  | nb    | pl   | sk  | sv    |
| ----------- | ---- | ------ | --- | ---- | --- | ----- | ---- | --- | ----- |
| **Decided** | Ohne | Puudub | —   | Nėra | —   | Ingen | Brak | —   | Ingen |

Italian, Latvian and Slovak must decide **per key**. Slovak's `Žiadna` is feminine and HA's
is `Žiadny`; which is right depends on the noun, and may differ between the three.

**German decided by the German session (Stage 1): `Ohne`, and one form does cover all
three.** German _can_ decide this once where the gendered languages cannot, because `Ohne`
is a preposition and does not agree with anything — which sidesteps the problem rather than
solving it three times. HA German does inflect (`Kein` at `conversation-agent-picker.none`
for _der Agent_, `Keine` at `tts-voice-picker.none` for _die Stimme_), so the per-key
warning above is real for German too; `Ohne` is the standard German UI answer to it and is
what a formatting dropdown says. It also reads correctly in all three option lists, where a
`Kein-` form would have to agree with `das Label`, `der Stil` and `die Nummerierung` in turn.

**A language whose "none" word is invariant should say so here rather than deciding three
times.** That is the transferable half of this entry.

### default — the "leave it alone" option

|             | de       | et        | it          | lt         | lv          | nb       | pl       | sk         | sv       |
| ----------- | -------- | --------- | ----------- | ---------- | ----------- | -------- | -------- | ---------- | -------- |
| **Decided** | Standard | Vaikimisi | Predefinito | Numatytoji | Noklusējums | Standard | Domyślny | Predvolený | Standard |
| HA          | Standard | Vaikimisi | Predefinito | Numatytoji | Noklusējums | Standard | Domyślny | Predvolený | Standard |

Gendered languages inflect to the noun; the citation form is masculine.

### top / bottom — vertical alignment options

|                      | de    | et     | it    | lt       | lv     | nb   | pl   | sk   | sv     |
| -------------------- | ----- | ------ | ----- | -------- | ------ | ---- | ---- | ---- | ------ |
| **Decided** (top)    | Oben  | Üleval | Alto  | Viršuje  | Augšā  | Topp | Góra | Hore | Topp   |
| **Decided** (bottom) | Unten | All    | Basso | Apačioje | Apakšā | Bunn | Dół  | Dole | Botten |

### date — a calendar date

|             | de    | et      | it   | lt   | lv     | nb   | pl   | sk    | sv    |
| ----------- | ----- | ------- | ---- | ---- | ------ | ---- | ---- | ----- | ----- |
| **Decided** | Datum | Kuupäev | Data | Data | Datums | Dato | Data | Dátum | Datum |
| HA          | Datum | Kuupäev | Data | Data | _!EN_  | Dato | Data | Dátum | Datum |

### week — a calendar week

|             | de    | et    | it        | lt      | lv     | nb  | pl      | sk     | sv    |
| ----------- | ----- | ----- | --------- | ------- | ------ | --- | ------- | ------ | ----- |
| **Decided** | Woche | Nädal | Settimana | Savaitė | Nedēļa | Uke | Tydzień | Týždeň | Vecka |
| HA          | Woche | nädal | settimana | savaitė | nedēļa | uke | tydzień | týždeň | vecka |

### weekday — a day of the week, Monday to Sunday

**Home Assistant's term is rejected outright, in every language.** HA's only `weekday` key
is `ui.components.calendar.event.rrule.weekday`, which means a _working day_ as opposed to
a weekend. Our sense is any of the seven days, so copying HA here is not a near-miss but
the wrong concept.

**It is wrong in four of the nine** on wheel `20260128.6` — it `giorno feriale`, lv
`darbdiena`, sk `pracovný deň`, sv `vardag` — and the other five happen to coincide with
our sense rather than confirm it. On the older `20250109.2` it was wrong in five, Polish
rendering `dzień powszedni` where this corpus has the correct `dzień tygodnia`; so the
count is corpus-dependent and the rejection is not.

|             | de         | et         | it                     | lt             | lv            | nb         | pl             | sk           | sv         |
| ----------- | ---------- | ---------- | ---------------------- | -------------- | ------------- | ---------- | -------------- | ------------ | ---------- |
| **Decided** | Wochentag  | Nädalapäev | Giorno della settimana | Savaitės diena | Nedēļas diena | Ukedag     | Dzień tygodnia | Deň v týždni | Veckodag   |
| HA          | _rejected_ | _rejected_ | _rejected_             | _rejected_     | _rejected_    | _rejected_ | _rejected_     | _rejected_   | _rejected_ |

Slovak shipped HA's wrong sense: `weekday_font_size` read `Veľkosť písma pracovného dňa`.
Fixed to `dňa v týždni`. Italian's `giorno settimana` is missing the article.

**Rejected:** sk `pracovný deň`; sk `pracovného dňa`; it `giorno feriale`; lv `darbdiena`; sv `vardag`; pl `dzień powszedni`

---

## 6. What This Glossary Cannot Settle

Named rather than papered over.

- **Whether any individual decision is correct.** Everything above is decided from
  cross-artefact evidence and from sense. That catches divergence and domain mismatch. It
  cannot tell you whether `Kellaaeg` is the word an Estonian would actually reach for.
- **~~Norwegian and Swedish weekday casing.~~ Resolved by the `sv`/`nb` session (Stage 1);
  see §3.** Kept here as a pointer because two earlier documents sent sessions the wrong
  way on it. The reframing to "does a standalone UI label take an initial capital" was what
  made it answerable: Home Assistant ships the _identical_ control at
  `ui.panel.profile.first_weekday.values.*` and capitalises there while lowercasing
  `nästa måndag` mid-sentence, and the card's Norwegian file makes the same split between
  its `daysOfWeek` (`Man`) and `fullDaysOfWeek` (`mandag`). The apparent
  card-versus-editor disagreement was two different contexts being compared.
- **Slovak `Žiadna` versus `Žiadny`,** per key. It depends on the gender of the noun each
  option modifies and may differ between the three keys.
- **The remaining undecided cells** — four languages' `opacity`, six languages'
  `day header`. These are marked `—` rather than guessed, and the sessions that own those
  languages must decide and record them. German `label`, German and Norwegian
  `today indicator`, Norwegian `opacity` and Swedish and Norwegian `day header` have since
  been decided by their Stage 1 sessions.

## 7. Evidence Index — Every Term's HA Key

**Cite the key, not the conclusion.** A glossary row nobody can re-derive is a guess with
a footnote, and the corpus moves: `ui.components.calendar.event.location` — the key that
decides `location`, and the one that reversed the plan's reading of it — **does not exist
in wheel `20250109.2` at all**. On that older corpus the only `Location` keys are the
device and storage senses, so German returns `Standort`/`Speicherort` and Italian returns
`Posizione`, and the decision below looks unfounded rather than merely older.

On `20260128.6` there are **five** keys whose English is exactly `Location`. Four are the
device, storage, backup and condition senses; exactly one is the calendar's. That is the
whole of Rule 2 in a single term.

So: **pin the version when you reproduce this, and if a key is missing, check the version
before concluding the glossary is wrong.**

A pin is not paranoia here. An unpinned `pip download` resolved to a year-old wheel on a
second machine, because a corporate proxy's index for this package stopped at
`20250109.2` — `pip index versions` there lists nothing newer and the explicit pin fails
outright with _No matching distribution found_. Two sessions followed the same instruction
faithfully and got corpora a year apart, neither able to see why the other's evidence would
not resolve. **Compare corpus sizes before disputing a row**: 5,884 English keys means the
older wheel, 7,341 means this one.

```bash
pip download home-assistant-frontend==20260128.6 --no-deps
unzip -q home_assistant_frontend-*.whl -d /tmp/hafe
HA_FRONTEND_TRANSLATIONS=/tmp/hafe/hass_frontend/static/translations \
  node scripts/l10n-oracle.mjs
```

| term            | HA key                                                                              | English at that key   |
| --------------- | ----------------------------------------------------------------------------------- | --------------------- |
| time            | `ui.components.selectors.selector.types.time`                                       | "Time"                |
| start date      | `ui.components.date-range-picker.start_date`                                        | "Start date"          |
| event           | `ui.components.calendar.event.add`                                                  | "Add event"           |
| calendar        | `ui.components.calendar.label`                                                      | "Calendar"            |
| entity          | `ui.panel.lovelace.editor.card.generic.entity`                                      | "Entity"              |
| weather         | `ui.panel.lovelace.strategy.home.summary_list.weather`                              | "Weather"             |
| location        | `ui.components.calendar.event.location`                                             | "Location"            |
| description     | `ui.components.calendar.event.description`                                          | "Description"         |
| label           | `ui.components.label-picker.label`                                                  | "Label"               |
| all day         | `ui.components.calendar.event.all_day`                                              | "All day"             |
| today           | `ui.components.calendar.today`                                                      | "Today"               |
| layout          | `ui.panel.lovelace.editor.edit_view.type`                                           | "Layout"              |
| columns         | `ui.panel.lovelace.editor.card.grid.columns`                                        | "Columns"             |
| list            | `ui.components.media-browser.list`                                                  | "List"                |
| compact         | `ui.panel.lovelace.editor.card.area.display_type_options.compact`                   | "Compact"             |
| position        | `ui.card.cover.position`                                                            | "Position"            |
| separator       | _none_                                                                              | —                     |
| day header      | _none_                                                                              | —                     |
| progress bar    | _none_                                                                              | —                     |
| countdown       | _none_                                                                              | —                     |
| week number     | _none_                                                                              | —                     |
| today indicator | _none_                                                                              | —                     |
| color           | `ui.panel.lovelace.editor.card.tile.color`                                          | "Color"               |
| icon            | `ui.panel.lovelace.editor.card.generic.icon`                                        | "Icon"                |
| background      | `ui.panel.lovelace.editor.edit_view.tab_background`                                 | "Background"          |
| title           | `ui.panel.lovelace.editor.edit_lovelace.title`                                      | "Title"               |
| width           | `ui.panel.lovelace.editor.edit_section.settings.column_span`                        | "Width"               |
| size            | `ui.panel.config.backup.size`                                                       | "Size"                |
| accent          | `ui.components.color-picker.colors.accent`                                          | "Accent"              |
| font            | _none_                                                                              | —                     |
| height          | _none_                                                                              | —                     |
| opacity         | _none_                                                                              | —                     |
| spacing         | _none_                                                                              | —                     |
| show            | `ui.components.data-table.settings.show`                                            | "Show column {title}" |
| hide            | `ui.components.data-table.settings.hide`                                            | "Hide column {title}" |
| none            | `ui.components.calendar.event.repeat.freq.none`                                     | "No repeat"           |
| default         | `ui.common.default`                                                                 | "Default"             |
| never           | `ui.components.calendar.event.repeat.end.never`                                     | "Never"               |
| top             | `ui.panel.lovelace.editor.edit_view_header.settings.badges_position_options.top`    | "Top"                 |
| bottom          | `ui.panel.lovelace.editor.edit_view_header.settings.badges_position_options.bottom` | "Bottom"              |
| date            | `ui.components.selectors.selector.types.date`                                       | "Date"                |
| month           | `ui.components.calendar.event.repeat.freq.monthly`                                  | "Monthly"             |
| weekday         | `ui.components.calendar.event.rrule.weekday`                                        | "weekday"             |
| weekday casing  | `ui.panel.profile.first_weekday.values.monday`                                       | "Monday"              |
| week            | `ui.components.date-range-picker.ranges.this_week`                                  | "This week"           |

## 8. How The Checks Read This File

`scripts/check-i18n.mjs` parses:

- `### <term> — <sense>` — an h3 opens a term; the text before the em dash is the term.
- the table row beginning `| **Decided** |` — nine cells in the order of that table's
  header row. `—` means undecided and is skipped rather than enforced.
- a line beginning `**Rejected:**` — `lang \`form\``pairs separated by`;`.

**Rejected forms are matched at a word start, case-insensitively, and only within the keys
the term governs** — the keys whose English contains the term. All three clauses earn their
place:

- **Word start** means the start of the value or any position after a non-letter. This is
  what makes case-insensitivity safe: rejecting German `Zeit` cannot fire on the legitimate
  `Uhrzeit`, because `zeit` sits mid-word there.
- **Case-insensitive** was arrived at by mutation, not by design. The first version matched
  case-sensitively and silently missed Swedish `Vardag` at the head of a label while
  catching the lower-case `vardag` — the form most likely to appear escaping the check that
  exists to find it.
- **Scoped to governed keys** is what keeps it precise: Italian `Posizione` is wrong for
  _location_ and right for _position_, so a whole-file scan could not tell them apart and
  would fire on correct strings.

Compounds are caught because they begin with the term — German `Ereignisfarbe` matches at
position zero, where any whole-word test would miss it. Inflected forms in the middle of a
phrase are **not** caught unless listed explicitly, which is why `weekday` rejects both
`pracovný deň` and the genitive `pracovného dňa` that our Slovak file actually shipped.

Separately, the _vocabulary_ and _casing_ checks share no normaliser. Both are
case-sensitive, so a divergence that is purely one of capitalisation — Polish
`Data Początkowa` against `Data początkowa` — is reported rather than folded away. That is
not a hypothetical: it is the defect a case-folding comparison hid, in the one language
whose capitalisation is most wrong.
