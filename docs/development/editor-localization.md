# Editor Localization to Full Coverage — Plan

**Investigation date:** 2026-08-13
**Repo state read:** `alexpfau/calendar-card-pro` @ branch `alexpfau-editor-localization-plan` (based on `feature/column-view-v4`), package version `3.5.0`
**HA frontend read:** `home-assistant-frontend` **20250109.2** (PyPI wheel, `hass_frontend/static/translations/`, 60 languages) and `home-assistant/frontend` @ `dev` (`LICENSE.md`, `src/translations/en.json`)
**Live HA read:** one instance, `frontend/get_translations` with `category: 'title'` and `category: 'selector'`

Every number below was produced by importing the modules or by a real build. Four builds
were run against modified translation files; **the working tree was restored after each**
(`git checkout -- src/rendering/editor/translations/`) and is clean.

> **Status: plan only. Nothing here is implemented.**
> The deliverable is the scope, the mining verdict, the glossary method, the quality bar
> and the session split. No string was translated in producing it, beyond the handful
> quoted as evidence.

---

## 1. Verdict

**The regression is real, it is a regression in *depth* rather than in *language count*,
and mining cannot fix it.**

All eleven languages the previous editor supported are still present — ten files plus
English in `strings.ts`. What was lost is completeness:

| | old editor | new editor |
|---|---:|---:|
| English keys | 239 | 312 |
| genuinely translated, 9 languages | **97–100%** | **36–43%** |

**Mining is finished.** Three sources were assessed by English text, as the standing rule
requires. Together they fill **≈30 of the 1,786 missing strings — 1.7%.** The archive is
already exhausted; the card's own strings and Home Assistant's frontend are worth almost
nothing as bulk sources. **98.3% of the work is genuine translation.**

That makes the glossary the main lever, not a nicety. It is the only artefact that can
keep nine independent sessions from rendering *event* three different ways, and it is the
one place where Home Assistant's translations *are* extremely valuable — as a terminology
oracle rather than a string mine.

**Bundle cost to the eager path: exactly zero.** Verified across four builds, not argued.

---

## 2. Scope, Re-derived

Read by importing the modules through `scripts/load-editor-schema.mjs`, because this is a
question about **values**. A regex over `strings.ts` has already produced a wrong answer
here once.

### 2.1 The string table

`EDITOR_STRINGS` holds **312 keys / 9,767 characters of English**.

| class | keys | median | max | total chars |
|---|---:|---:|---:|---:|
| label | 183 | 15 | 151 | — |
| **helper (prose)** | **62** | **69** | **253** | **5,332** |
| option label | 56 | 10.5 | 26 | — |
| panel | 9 | 10 | 20 | — |
| option description | 2 | 21 | 25 | — |
| **all non-helper** | **250** | **15** | **151** | **4,435** |

The prose is 20% of the keys and **55% of the characters**. It is the harder half, and
the half most likely to be done badly under time pressure.

Structural content that must survive translation:

- **7 keys carry placeholders**: `{band}`, `{count}`, `{query}`, `{width}`.
- **8 keys carry special glyphs**: `≥`, `→`, `—`, non-breaking space.
- **2 keys carry typographic quotes**: `filter.no_matches`, `entity.compact_events_to_show.helper`.

### 2.2 Current coverage, and the shape of the gap

| language | present | missing | of which prose | of which labels |
|---|---:|---:|---:|---:|
| de | 134 | 178 | 50 | 128 |
| et, it, lt, lv, nb, pl, sk, sv (×8) | 111 | 201 | **62** | 139 |
| en-GB | 46 | *(see §5)* | — | — |

**Total missing across the nine languages needing full coverage: 1,786.**

The brief's figure of 2,052 counts en-GB's 266 as a gap. It is not one — §5.

**Eight of the nine languages have zero prose translated.** Every one of the 62 `.helper`
strings is missing in all of them; German alone has 12. This is not visible in the
coverage percentages and it changes the work's character: the residual is not 201 strings
of the same kind, it is 139 short labels plus **62 sentences that have never been written
in that language at all**.

### 2.3 Why coverage percentage misleads, and what to sequence first

E10 already recorded this and it still holds: at 105 keys German was ~34% translated and
looked **entirely English**, because every translated key sat inside a *collapsed* panel
while the panel titles and helpers — the whole first screen — were missing. Translating
the panel chrome is what moved it.

The same logic applies to the remaining work. **Order each language's work by what renders
before an interaction**, not by key count.

---

## 3. Mining — Results

Every match below is on **English text, never key name**, per the standing rule.

### 3.1 The key-name trap, quantified again

Between `EDITOR_STRINGS` and the archive, **94 keys are spelled identically and only 53
carry the same English**. Matching by name would therefore mistranslate **41 keys**.
`language` and `language_mode` still hold each other's meanings.

### 3.2 Source 1 — the archived pre-v4 namespace: exhausted

`src/translations/editor-languages/` has 239 English leaves, 237 distinct after
normalisation. Matched against the live table by English text:

- **104 live keys have an English-text match** (the brief said 106; the difference is
  normalisation, and 104 is what the imported modules give).
- **0 ambiguous** — no English string maps to two different archive keys.
- Across the nine languages, those 104 matches fill **1 remaining gap** (German).

**The previous mining was exhaustive.** Every archive match except one is already in the
files. Three German entries disagree with the archive; those are rewordings, not gaps.

Residual after the archive: **1,785 of 1,786.**

### 3.3 Source 2 — the card's own 35 languages: 0 gaps, but a working oracle

Assessed because it had not been tried. It nearly produced a false negative worth
recording.

**The first probe returned zero and was wrong.** `flatten()` skipped arrays, and
`daysOfWeek`, `fullDaysOfWeek` and `months` are arrays — 26 real strings per language,
silently discarded. The corrected probe carries a self-test that asserts a known string
(`Monday`) is reachable before any absence is believed.

Corrected result: **2 English-text matches** (`Monday`, `Sunday`), filling **0 gaps** —
both are already translated everywhere. The null stands, now for a defensible reason: the
card's vocabulary is 34 strings of calendar chrome and the editor's is configuration
labels. They barely intersect.

**It earned its place as an oracle rather than a mine.** On its two overlapping keys it
immediately found a defect — §6.2.

### 3.4 Source 3 — Home Assistant's frontend: 1.5% as a mine, 57% as an oracle

The brief called this the highest-value idea in it. It is not, and the parent session's
correction is confirmed independently here, then extended.

**`frontend/get_translations` returns only `component.*` keys.** Verified directly against
a live instance with `category: 'title'`: every key returned was `component.*`. HA's
generic UI vocabulary (`ui.common.*`, `ui.panel.*`) is not served by that command.

**A better acquisition route than scraping a live page.** The `home-assistant-frontend`
**PyPI wheel** ships the built frontend including `hass_frontend/static/translations/` for
**60 languages**, already flattened to dotted keys. It is versioned, reproducible and needs
no instance. `home-assistant/frontend` on GitHub carries only `en.json`; the translations
live in Lokalise and are injected at build time, which is why `de.json` 404s there.

```bash
pip download home-assistant-frontend --no-deps
unzip -q *.whl -d x && ls x/hass_frontend/static/translations/
```

**As a bulk mine it fails**, consistently across all nine languages:

| lang | missing | unique fills | fill rate |
|---|---:|---:|---:|
| de | 178 | 4 | 2.2% |
| et, it, lt, lv, nb, sk, sv | 201 | 3 | 1.5% |
| pl | 201 | 2 | 1.0% |
| **total** | **1,786** | **27** | **1.5%** |

The parent session measured 3 for German with an exact `trim()` match; loosening to
case-folded, quote-normalised, trailing-punctuation-stripped matching moves it to 4. **The
null is a property of the data, not of the probe.** The reason is structural: the editor's
vocabulary is *Day Header Gap*, *Show Countdown for All-Day Events*, *Progress Bar Height*.
None of that exists in a generic UI table.

**As a terminology oracle it is strong.** Probed with 75 single domain terms, HA's German
table has an opinion on **43 (57%)** — `entity → Entität`, `icon → Symbol`,
`color → Farbe`, `show → Einblenden`, `default → Standard`, `calendar → Kalender`. That is
the register an HA card editor should be written in, and it is per-language, so the same
probe gives nine oracles.

### 3.5 The control, and why "zero disagreements" was an artefact

A null result proves nothing unless the probe can be shown to find something. The control
is to run the oracle against the strings each language **already has**: if it finds matches
there and none in the gap, the gap is genuinely out of the corpus's reach.

It does. Of German's 134 existing strings, **14 appear in HA's table**. The probe works;
the gap is simply domain vocabulary that a generic UI table does not contain.

**But the "zero disagreements" reported alongside that 14 does not survive.** The two
numbers come from different matching strengths, and reconciling them across both corpora
— a live-instance scrape and the PyPI wheel — puts the zero in exactly one of four cells:

| corpus | matching | appear | unique | agree | **differ** |
|---|---|---:|---:|---:|---:|
| live scrape | strict | 13 | 8 | 8 | **0** |
| live scrape | loose | 14 | 9 | 8 | **1** — `Start Date` |
| PyPI wheel | strict | 13 | 9 | 8 | **1** — `Time` |
| PyPI wheel | loose | 14 | 9 | 8 | **1** — `Start Date` |

The `14` is the loose figure; the `0` is the strict one. Loosen the match **or** change the
corpus and a disagreement appears — and not the same one, since the wheel at strict
surfaces `Time` where the live corpus does not. Zero disagreements was true only at the
intersection of the strictest matching and one corpus, which is also the cell with the
smallest sample.

Across all nine languages: **112 comparisons, 11 disagreements** — §3.7.

### 3.6 Two rules the disagreements force

**Latvian's HA table is 20.5% untranslated English** — 300 of 1,462 values are byte-identical
to the English. It is why the oracle returns `Label` and `Location` for Latvian, where our
existing `Etiķete` and `Atrašanās vieta` are plainly better.

| lang | HA values left in English | verdict |
|---|---:|---|
| lv | 300 (20.5%) | **weak oracle** |
| de | 86 (5.9%) | strong |
| nb | 55 (3.8%) | strong |
| it | 50 (3.4%) | strong |
| sv | 47 (3.2%) | strong |
| et | 36 (2.5%) | strong |
| sk | 32 (2.2%) | strong |
| pl | 25 (1.7%) | strong |
| lt | 14 (1.0%) | strong |

> **Rule 1 — reject any oracle value byte-identical to its English.** It is HA's gap, not
> evidence. Without this guard the oracle actively degrades Latvian.

**Rule 1 is validated by the numbers it changes.** Re-running the nine-language control
with the guard applied drops Latvian from **2 disagreements to 0** — its only two were
HA's untranslated `Label` and `Location`, now correctly excluded. The guard removes exactly
the false disagreements and leaves every real one standing.

**And the oracle does not know our domain.** `Location` in our editor is an event's place;
in HA it is frequently a device's or a file's. HA German offers *Standort* and
*Speicherort*; ours is *Ort*, which is what a German calendar says. Ours is better.

> **Rule 2 — the oracle informs, it does not decide.** Where HA's term comes from a
> different domain sense, the calendar sense wins, and the glossary records the reason.

### 3.7 The eleven disagreements, and what they are worth

Guard applied, all nine languages: **112 comparisons, 11 disagreements.** They are not
noise, and they fall into three kinds.

| lang | comparisons | agree | differ |
|---|---:|---:|---:|
| pl, sv | 14, 14 | 14, 14 | **0** |
| lv | 11 | 11 | **0** |
| de | 9 | 8 | 1 |
| et | 12 | 11 | 1 |
| it | 11 | 10 | 1 |
| nb | 14 | 13 | 1 |
| lt | 14 | 11 | **3** |
| sk | 13 | 9 | **4** |

**`Time` — and our own languages disagree with each other.** Three languages differ from
HA on it, in *opposite directions*:

| | ours | HA | which is the clock-time sense |
|---|---|---|---|
| de | Zeit *(general)* | **Uhrzeit** *(clock)* | HA |
| et | **Kellaaeg** *(clock)* | Aeg *(general)* | ours |
| it | **Orario** *(clock)* | Ora *(hour)* | ours |

The label sits on an event's start time, so the clock sense is the right one — which makes
HA correct for German and wrong for Estonian and Italian. **The finding is not that HA is
better; it is that our own three languages do not agree among themselves.** German reaches
for the general word where Estonian and Italian reach for the specific one. That is
precisely the divergence a glossary exists to end, and it is invisible from inside any one
language's file.

**`None` — grammar, not vocabulary.** Lithuanian (`Nėra` vs `Nė vienas`) and Slovak
(`Žiadna` vs `Žiadny`) each differ on the same three option keys, consistently. Slovak's is
a gender agreement that may legitimately differ *per key* depending on the noun each option
modifies. Neither is resolvable without a native speaker, and a find-and-replace to HA's
term would produce confidently wrong Slovak.

**`Start Date`, `Location`, `Label` — genuine term choices**, one each in de/et/sk, nb, sk.

**The most useful thing in this table is what it separates.** Polish agrees **14/14** on
terminology while title-casing **85%** of its labels (§6.1). Swedish agrees 14/14 while
probably capitalising weekdays wrongly (§6.2). **Terminology quality and orthographic
quality are independent axes**, and a session that checks only one will report a language
as good when half of it is wrong.

### 3.8 Combined yield

| source | fills | share of 1,786 |
|---|---:|---:|
| archive (`editor-languages/`) | 1 | 0.06% |
| card strings (`languages/`) | 0 | 0% |
| HA frontend (wheel) | 27 | 1.5% |
| **total** | **≈28** | **1.6%** |

Even taken at its most generous the three sources overlap slightly and land near 30.
**Round it to 2%. The remaining 98% is genuine translation work.**

### 3.9 Sources assessed and rejected

- **`home-assistant/frontend` GitHub `src/translations/*.json`** — English only; the rest
  is Lokalise-injected at build time. Use the wheel.
- **Sibling HACS cards with translated editors** — their strings are theirs, licences vary
  per repo, and the same domain-vocabulary mismatch that defeats HA's generic table applies
  with less quality assurance behind it. Not worth the audit.
- **HA blueprints** — the same problem, plus no per-language guarantee.

---

## 4. Licensing

Established rather than assumed, and the conclusion is that it is **not load-bearing**.

- **Home Assistant Frontend is Apache License 2.0** — read from `LICENSE.md` at
  `home-assistant/frontend@dev`.
- **Calendar Card Pro is MIT** — `LICENSE`.
- **`NOTICE` already attributes Home Assistant Frontend under Apache-2.0**, naming
  copyright and URL.

Apache-2.0 permits redistribution in source form provided the notices are retained and
modification is stated. Incorporating Apache-2.0 material into an MIT-licensed project is
routine and is exactly what `NOTICE` exists to record. **Copying the 27 mined strings is
permitted**, and the only action it requires is extending the existing `NOTICE` entry to
say that some editor translation strings derive from HA's frontend translations.

*(This is a reading of the licence texts, not legal advice. It is not relied on below.)*

**In practice the question is moot.** The bulk-copy yield is 27 strings out of 1,786. The
recommended use — checking a term against HA's table to decide a glossary entry — is
**reference, not redistribution**, and needs no permission at all. If any doubt arises, drop
the 27 and the plan is unchanged.

---

## 5. en-GB — Not a Gap

**en-GB must not be filled to 312.** It is a spelling variant layered over `strings.ts`,
so it should override only where British English genuinely differs. Filling it would ship
266 strings identical to the American ones, inflate the editor chunk for no benefit, and
guarantee silent divergence the next time an English string is edited.

### 5.1 The defensible method

Scan the English table for words with a genuine US/UK divergence, using a fixed, reviewable
list (`color/colour`, `customize/customise`, `centre`, `behaviour`, `catalogue`, `grey`,
`licence`, `-ise/-ize`, `-lled`, …). Every key whose English contains one is in scope;
every key that does not is out.

**Result: exactly 36 keys.**

| divergence | key instances |
|---|---:|
| `color → colour` | 32 |
| `colors → colours` | 2 |
| `customized → customised` | 2 |

No other divergence fires anywhere in the table. The card's own US spelling is deliberate
and stays; this concerns the *editor's* British variant only.

### 5.2 The method cross-checks against an independent artefact

The old editor's `en-GB.json` was written by hand years earlier and overrode **29 keys**,
using `color → colour` (×31) and `colors → colours` (×1) — and nothing else. That is a
strict subset of the 36 derived here, which additionally catch `customised`. Two
independent routes to the same divergence surface, one of them not consulted while deriving
it.

### 5.3 The current file is wrong in three ways

| | count |
|---|---:|
| present and correct | **1** |
| present but **wrong** | **17** |
| **missing** | **18** |
| **no-op entries** (byte-identical to English) | **28** |

The 28 no-ops are already shipping and do nothing. The 17 wrong ones **silently drop Title
Case**: `Event Color` is overridden as `Event colour`, so switching an editor to British
English currently changes the *capitalisation* of seventeen labels as a side effect. The
single correct entry is `customized_only → Customised Only`, which preserves it — so the
file is not even internally consistent.

### 5.4 Recommendation: generate it, do not translate it

en-GB is the one file that is fully mechanically derivable: apply the substitution list to
`strings.ts` and emit every key that changed. That makes it **generated output and a
check**, not a translation task — it cannot drift, it cannot lose Title Case, and it
cannot go stale when an English string is edited.

Ship it as a `check:i18n` assertion: recompute the expected en-GB and fail on any
difference. Cost is minutes; it removes a whole class of silent divergence permanently.

---

## 6. Quality — What Is Already Wrong

Auditing the existing 1,068 translated strings before adding 1,786 more turned up defects
that would otherwise be copied outward by sessions taking the current files as a style
reference. **These must be fixed as part of the work, not after it.**

### 6.1 Polish title-cases almost everything

English uses Title Case for labels. Polish uses sentence case. Measured over multi-word
labels — how many capitalise a non-initial, non-particle word:

| lang | multi-word labels | with mid-string capitals | rate |
|---|---:|---:|---:|
| **pl** | 81 | **69** | **85%** |
| de | 64 | 47 | 73% *(expected — German capitalises nouns)* |
| it | 83 | 6 | 7% |
| nb, sk, sv | 44–83 | 2–4 | 5% |
| et, lt, lv | 71–84 | 2 | 2–3% |

`Odstęp Między Dniami`, `Kolor Wydarzeń`, `Tryb Kompaktowy`, `Pokaż Pasek Postępu`. The
2–7% baseline in the other languages is almost entirely the acronym `UV`, which is correct.

**Polish is a systematic English-orthography calque across all 111 existing strings** — the
clearest instance in the repo of exactly the "cheap translation" the maintainer wants
excluded, and it is already shipping. Italian has ~4 genuine instances (`Tipo di Etichetta`,
`Modalità Compatta`).

### 6.2 Norwegian capitalises weekdays; Norwegian does not

The editor has `Mandag` / `Søndag`. The card's own native-contributed `nb.json` has
`mandag` / `søndag`, which is correct Norwegian. The editor is calquing English.

This was found by the card-strings oracle on the only two keys where the two files overlap
— a 2-key sample that produced a real defect, which is a fair argument for wiring the check
in permanently.

**And note what it cannot see.** Swedish also lowercases weekdays, and both files say
`Måndag`. They agree, so the oracle is silent, and both are probably wrong. A cross-check
between two artefacts only finds disagreements; where both share an error it reports
nothing. That one needs a native speaker.

### 6.3 The card and its own editor disagree on the core noun

German: the card renders `Keine anstehenden Termine`, the editor `Ereignisfarbe`. One
product, two words for *event*, in adjacent surfaces.

The oracle resolves it with evidence rather than taste: **HA German uses `Ereignis`**
(`component.event.title`). The editor is HA-idiomatic and the card is the outlier. Whether
to change the card is the maintainer's call and out of scope here, but the **editor keeps
`Ereignis`**, and the glossary records why.

### 6.4 Slovak carries four disagreements, including grammatical ones

`None` is `Žiadna` (feminine) in our file and `Žiadny` (masculine) in HA's, across three
option keys. Which is right depends on the gender of the noun each option modifies, and it
may differ *per key*. `Label` is `Menovka` for us and `Štítok` for HA.

Slovak is the worst-agreeing language in the control — 9 of 13 (§3.7) — and this is the
concrete demonstration that the oracle cannot be applied mechanically: a find-and-replace
to HA's term would produce confidently wrong Slovak. Flag for the native pass.

### 6.5 Our own languages disagree with each other about "Time"

Not a divergence from HA but a divergence *among ourselves*, and the more serious of the
two: German renders `Time` as the general `Zeit` while Estonian and Italian reach for the
clock-time sense (`Kellaaeg`, `Orario`). The label sits on an event's start time, so the
clock sense is right and **German is the outlier**.

Invisible from inside any single language's file, which is exactly why the glossary has to
be decided across all nine at once rather than per session. Full analysis in §3.7.

---

## 7. The Glossary — the Main Lever

Nine sessions, 1,786 strings, one product. Without a decided termbase they will diverge,
and divergence in a settings UI reads as sloppiness far more than an imperfect single
string does.

**The glossary lands before any bulk translation and is a hard dependency.**

### 7.1 Shape

One file, `docs/development/editor-glossary.md`, one table per term, nine columns. Each
entry records the **decision**, the **evidence**, and — where the decision contradicts an
obvious source — the **reason**.

### 7.2 The terms

Derived from what recurs in the table rather than guessed: **event, calendar, day header,
separator, countdown, progress bar, compact mode, column view, list view, entity, weather,
label, icon, colour, location, description, week number, today indicator, accent, spacing,
offset, threshold, show/hide, none, default, custom, position, height, width, opacity**.

### 7.3 How each entry is decided

1. **Do we already use it consistently?** Then keep it — the existing strings were
   native-contributed and mined from a 97–100% complete predecessor.
2. **Does HA have a term for the same concept?** Take it, subject to Rule 1 (reject
   English-identical) and Rule 2 (domain sense wins).
3. **Does the card use a term for the same concept?** Prefer agreement; where they differ,
   record which surface wins and why (§6.3).
4. **Otherwise it is a genuine decision** — take it once, write it down, and never take it
   again in nine separate places.

### 7.4 Worked evidence, already gathered

The mining scripts emit this per language. A sample of what it looks like decided:

| term | evidence | de | notes |
|---|---|---|---|
| event | HA `Ereignis`; card `Termin`; editor `Ereignis` | **Ereignis** | editor already aligned with HA; card is the outlier |
| entity | HA `Entität`; editor `Wetter-Entität` | **Entität** | agrees |
| colour | HA `Farbe`; editor `-farbe` | **Farbe** | agrees 9/9 |
| description | HA `Beschreibung`; editor `Beschreibung` | **Beschreibung** | agrees 9/9 |
| location | HA `Standort`/`Speicherort`; editor `Ort` | **Ort** | **overrides HA** — calendar sense, not device sense |
| time | HA `Uhrzeit`; editor `Zeit`; et/it use the clock sense | **Uhrzeit** | **de is our own outlier** — §6.5; the label is an event's start time |
| calendar | HA `Kalender` | **Kalender** | no editor key yet; net-new |
| column | *no HA evidence* | *decide* | net-new, and the term the whole v4 view is named for |

`column`, `separator` and `weather` have **no HA evidence in any of the nine languages**.
They are genuine decisions and are the highest-risk terms for divergence precisely because
nothing external will arbitrate them.

**A term already used in all nine files is not thereby settled.** `Time` is used
everywhere and is rendered inconsistently (§6.5). Stage 0 must therefore compare the nine
languages against **each other**, not only each against HA — the German `Zeit` outlier
agrees with nothing external and would survive any per-language review.

---

## 8. The Quality Bar, Made Checkable

"Native terms, no cheap translations" needs an operational definition, or it cannot be
reviewed and will not be met.

### 8.1 Rules a session must follow

1. **Match HA's term for the same concept** where the glossary records one, subject to
   Rules 1 and 2 of §3.6.
2. **Follow the language's own capitalisation convention**, not English's. Sentence case
   for Polish, Italian, Slovak, Estonian, Lithuanian, Latvian; lowercase weekdays for
   Norwegian and Swedish; German capitalises nouns natively.
3. **Do not calque English word order.** A label is named for the thing it labels in that
   language's natural order.
4. **Prose is written as sentences, not translated word by word.** The 62 helpers explain
   *what the card does*; a helper that reads as a gloss of the English has failed even if
   every word is right.
5. **Preserve the register of the source.** `strings.ts` documents its own choices — the
   filter bar deliberately says *settings* rather than *options*, because the reader is
   looking for a thing in a UI. Carry the distinction, do not flatten it.
6. **Placeholders, glyphs and quotes survive verbatim**, repositioned as the target
   grammar requires.

### 8.2 What can be checked mechanically

Extend `scripts/check-i18n.mjs` — it already imports these modules, so the additions are
cheap and cannot go stale:

| check | catches |
|---|---|
| **key coverage / unknown keys** | *already implemented* |
| **placeholder integrity** | a lost or renamed `{count}` — 7 keys at risk, and a silent runtime defect today |
| **untranslated English left behind** | a value byte-identical to `strings.ts` — the `en.json` failure mode, and how §3.6 detects HA's own gaps |
| **glyph integrity** | `≥`, `→`, `—`, nbsp dropped or ASCII-ified — 8 keys |
| **title-case calque** | the Polish defect, as a per-language ratio against a threshold, with German exempted |
| **cross-language term consistency** | the `Time` defect (§6.5) — one language rendering a glossary term in a sense the other eight do not. Needs all nine files compared against each other, which no per-language review can do |
| **length ceiling** | a label far longer than its English risking layout breakage; warn, do not fail |
| **glossary adherence** | a decided term rendered a second way — the divergence the glossary exists to prevent |
| **en-GB derivation** | the whole file, recomputed and compared (§5.4) |

Every one of these is a **shape or integrity** question, which is what a mechanical check
can answer.

### 8.3 What cannot be checked, honestly stated

Nothing above can tell you whether `pēc 2 dienām` is correct Latvian, whether a helper
reads naturally, or whether *Žiadna* or *Žiadny* agrees with the right noun. AGENTS.md is
explicit about this and it does not change here.

**The residue is real and should be named rather than papered over:**

- **~1,786 strings will be machine-translated to a high standard and reviewed by nobody
  who speaks the language**, unless native reviewers are recruited.
- The glossary reduces *inconsistency*, not *incorrectness*.
- The mechanical checks catch structural damage and systematic calques. They cannot catch
  a fluent, well-formed, wrong translation.
- Latvian carries the most risk: weakest oracle (§3.6) and no in-repo second opinion.
  Note the control is *not* evidence against this — Latvian agrees 11/11, but only because
  the guard excluded the keys where HA had nothing to say.

**Recommended mitigation, in order of value:** ship the checks; put a
`docs/contributing.md` call-out inviting native corrections per language; and treat the
first release after this work as a correction window rather than a finished state. The
predecessor reached 97–100% over years of community contribution, which is worth
remembering before promising equivalence in one pass.

---

## 9. Bundle Impact

Four real builds. `npx rollup -c`, `gzip -9`.

### 9.1 The eager path is untouched — verified, not argued

| build | card chunk raw | card chunk gzip |
|---|---:|---:|
| translations emptied to `{}` | 187,849 | 56,845 |
| **today (real translations)** | **187,849** | **56,845** |
| synthetic full coverage (A) | 187,849 | 56,845 |
| synthetic full coverage (C) | 187,849 | 56,845 |

**Byte-identical in all four.** The two-entry build guarantees it structurally, and this is
the measurement that confirms it. Full localization costs every dashboard load **zero**.

### 9.2 The editor chunk roughly doubles

| build | editor raw | editor gzip |
|---|---:|---:|
| translations emptied | 110,734 | 36,000 |
| **today** (1,068 keys) | **154,324** | **45,486** |
| synthetic full coverage — A, random word sampling | 306,792 | 95,227 |
| synthetic full coverage — C, consistent word mapping | 326,862 | 85,862 |

Method: synthesise the missing strings from **real vocabulary** for that language (its own
editor + card strings + HA's table), sized by that language's **measured** expansion factor
against English (de 1.14, sv 1.01, nb 1.03, lt 1.30; mean 1.18). Simulation A samples words
randomly, which destroys the repetition real UI strings have and so **overstates** gzip;
simulation C maps each English word to a fixed target word, preserving that repetition, and
is the more realistic. They bracket the answer.

Anchoring on real text — today's translations cost 43,590 raw / 9,486 gzip — and scaling
the projected real payload (~188 KB raw, from English character counts × measured expansion)
by each simulation's ratio gives **+43,000 to +57,000 gzip**.

> **Best estimate: the editor chunk goes from 45,486 to ~79,000–93,000 gzip — roughly
> double, +34 to +47 KB.**

### 9.3 The earlier decision does not flip — and the brief's figure is wrong

**There is no ~8.4 KB measurement in the repo.** The brief appears to merge two separate
findings:

- **X2** projected **~+18,000 B gzip** to translate the editor namespace across 11
  languages, and is recorded as **"Dissolved by X1"**.
- The **~4 KB gzip** figure is about splitting the **card's** strings per-language — 19,468 B
  across all 35 languages — and was rejected as *"a trap"*.

Neither is 8.4 KB, and neither says the decision should be revisited at full coverage. The
opposite: X1 was adopted **in anticipation of exactly this work**, concluding that *"the
projected ~+18,000 B gzip cost of translating the new editor namespace across 11 languages
moves entirely off the eager path… Nothing has to be cut."*

**That reasoning is vindicated** — §9.1 measures the eager cost at zero. **The projection
itself was low by roughly 2×** (+18 KB projected against +34–47 KB measured), which is
worth recording, but it changes nothing: the cost lands where the design put it.

### 9.4 Should the editor's translations be split per-language as well?

**No.**

| | gzip |
|---|---:|
| a user who never opens the editor | **0 either way** |
| a user who opens it, all languages bundled | ~43,000 |
| a user who opens it, own language only | ~4,300 |
| **saving, per editor-opener** | **~39,000** |

Against that: a second fetch boundary inside a panel that already fetched; a new failure
mode where a failed fetch silently renders English; nine more release assets; and
re-entering the `?hacstag=` trap class that X1 documented as real and reproduced in this
repo's own build.

The beneficiary population is the ~1% who open the editor, once, on a panel they opened
deliberately. **Trading a documented, reproduced failure mode for 39 KB on a deliberate
interaction is the wrong trade**, and it is the same trap X1 named when it rejected
per-language card strings for ~4 KB.

**Revisit only if** the editor chunk materially exceeds ~100 KB gzip, or telemetry ever
shows editor opens are common. Neither holds now.

---

## 10. Recommended Session Split

### 10.1 The constraints that decide it

- **File-level isolation is total.** Each language is one JSON file; nine sessions never
  touch the same file. Parallelism is free of merge cost. The one shared file,
  `translations/index.ts`, needs **no change at all** — all ten languages are already
  imported and registered.
- **The glossary is a hard dependency.** Nine sessions deciding *event* independently is
  the failure the glossary exists to prevent, and it cannot be repaired afterwards without
  re-reading all nine files.
- **Volume per session is 201 keys / ~8,400 English characters**, of which 62 are prose.
  That is a real job, not a batch chore. Three languages in one session means either three
  times the duration or a third of the care.
- **Some defects are pre-existing** (§6) and must be fixed by the session that owns the
  language, which already has the context.

### 10.2 The split

**Stage 0 — Foundations. One session. Blocking.**

Produces `editor-glossary.md` with every term decided across all nine languages; the
mechanical checks of §8.2 in `check-i18n.mjs`; the generated en-GB file and its assertion
(§5.4); and the mining output as a per-language starting file (~30 strings, but more
usefully the oracle evidence each session will need).

**It must compare the nine languages against each other, not just each against HA.** The
`Time` inconsistency (§6.5) shows up only in that comparison — German's `Zeit` disagrees
with no external source, so every per-language review would pass it. This is work only
Stage 0 can do, because it is the only point at which all nine files are in one context.

Everything downstream depends on this. It is also the session that should be reviewed most
carefully, because a wrong glossary entry is copied nine times.

**Stage 1 — Nine language sessions. Fully parallel.**

One session per language: `de`, `et`, `it`, `lt`, `lv`, `nb`, `pl`, `sk`, `sv`.

Each session owns its file end to end and, within it, works in this order:

1. **Fix the pre-existing defects** in the 111–134 strings already there (§6). Polish
   (casing), Norwegian (weekdays), Slovak (four term/grammar disagreements) and German
   (`Zeit`) have known ones; every session re-checks its own against the glossary. Note
   that a language agreeing 14/14 with HA is **not** thereby clean — Polish and Swedish
   both do, and both have orthographic defects (§3.7).
2. **Labels and panel chrome** — the first screen first, per §2.3, so the language is
   visibly correct early even if the session is interrupted.
3. **Remaining labels** — 139 strings.
4. **The 62 helpers** — last, deliberately: by then the session has decided every term the
   prose refers to, and the helpers explain the labels rather than being translated blind
   alongside them.

German is lighter (178 missing, 12 helpers already done); Polish is heavier (201 missing
plus 69 casing fixes).

**Stage 2 — Verification. One session.**

Runs the full gate suite, re-runs the glossary-adherence check across all nine now-complete
files, re-measures the bundle against §9.2, and produces the native-reviewer call-out for
`docs/contributing.md`.

### 10.3 Why not the alternatives

- **All nine in one session** — 1,786 strings at a quality bar that is the entire point of
  the exercise. Care would degrade, and the failure would be invisible in the diff.
- **Several languages per session** — no upside. Files do not collide, so batching buys no
  merge saving; it only splits attention. The one thing worth sharing across languages is
  the glossary, and that is Stage 0.
- **Labels and prose as separate passes across all languages** — considered and rejected.
  It optimises for consistency of *pass type* over consistency *within a language*, and the
  helper that explains a label is best written by whoever just chose that label's wording.
  Keep both in one session, ordered.

### 10.4 Dependency graph

```
Stage 0  glossary + checks + en-GB           [blocking]
            |
            +-- de   et   it   lt   lv   nb   pl   sk   sv      [9 parallel]
            |
Stage 2  verification + bundle re-measure + contributor call-out
```

---

## 11. Corrections to the Brief

Recorded because the brief asked for them explicitly.

1. **"total missing across all 10: 2052"** — correct arithmetically, misleading as scope.
   en-GB's 266 are not a gap. **The real figure is 1,786 across nine languages.**
2. **"~8.4 KB gzip" for the rejected per-language split** — no such measurement exists in
   the repo. The nearest are ~4 KB (card strings, rejected as a trap) and +18 KB (X2's
   projection). §9.3.
3. **"it should be revisited if the editor ever reached full coverage"** — the repo says
   the opposite. X1 was adopted *because* full coverage was coming; X2 is marked
   "Dissolved by X1". The decision holds.
4. **Home Assistant's frontend as "the highest-value idea in this brief"** — as a bulk mine
   it yields **1.5%**. The parent session corrected this independently and is right; the
   correction is confirmed here at looser matching and extended to all nine languages.
   As a *terminology oracle* it is genuinely valuable — 57% of probe terms — which is a
   different and smaller claim.
5. **"250 are labels, median 16 chars"** — measured median is **15**.
6. **"106 of 312 keys matched by English text"** (archive) — importing gives **104**.
7. **The parent session's "0 disagreements"** for the German oracle — true in exactly one
   of four corpus × matching-strength combinations, and that one has the smallest sample.
   Loosen the match or change the corpus and a disagreement appears; the two figures quoted
   together (`14 appear`, `0 differ`) come from different matching strengths. With the
   English guard applied across nine languages: **112 comparisons, 11 disagreements**. §3.5, §3.7.
8. **Unstated in the brief, and material:** eight of the nine languages have **zero** prose
   translated, so the residual is 62 sentences per language, not 201 labels. §2.2.
9. **Also unstated, and it changes how sessions are reviewed:** terminology quality and
   orthographic quality are **independent**. Polish agrees with HA 14/14 on terms while
   title-casing 85% of its labels. Checking one axis says nothing about the other. §3.7.

## 12. Things I Could Not Establish

- **Whether any individual existing translation is correct.** Everything in §6 is a
  *systematic* defect visible from structure or cross-artefact disagreement. Establishing
  correctness needs native speakers, and nothing in this repo can substitute.
- **Whether Swedish weekday capitalisation is wrong.** Both artefacts say `Måndag` and
  agree, so the oracle is blind (§6.2). One native speaker resolves it in a sentence.
- **Whether `Žiadna` or `Žiadny` is right per key in Slovak.** It depends on the modified
  noun's gender and may differ between the three keys. Needs a native speaker.
- **The true bundle figure at real full coverage.** §9.2 is a bracketed simulation from
  synthetic text and is honest about that. It resolves exactly when the first language is
  genuinely complete — **re-measure after Stage 1's first session** rather than trusting
  the estimate.
- **The wheel is `20250109.2`.** A newer HA frontend would shift the oracle's coverage
  slightly. Nothing in the plan depends on the exact version, but the terminology decisions
  should record the version they were taken against.
- **Actual editor-open rate.** §9.4 leans on the "~99% never open it" figure recorded in
  `multifile-distribution.md` rather than on a measurement of my own. The conclusion is
  insensitive to it — the trade is rejected on the failure mode, not on the percentage —
  but the number is inherited, not established.

---

## 13. Reference

- [`v4-backlog.md` § E10](./v4-backlog.md) — the translation backlog item this plan
  discharges, and the source of the "match on English text, never key name" rule.
- [`v4-backlog.md` § X1, § X2](./v4-backlog.md) — the lazy-editor decision and the
  translation budget it dissolved. §9.3 corrects the brief against these.
- [`multifile-distribution.md`](./multifile-distribution.md) — why the editor is its own
  chunk, and the `?hacstag=` trap that §9.4 declines to re-enter.
- [`editor-rebuild.md`](./editor-rebuild.md) — the schema-driven editor these strings
  label.
