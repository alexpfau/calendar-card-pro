# Editor Localization to Full Coverage — Plan

**Investigation date:** 2026-08-13
**Repo state read:** `alexpfau/calendar-card-pro` @ branch `alexpfau-editor-localization-plan` (based on `feature/column-view-v4`), package version `3.5.0`
**HA frontend read:** `home-assistant-frontend` **20250109.2** (PyPI wheel, `hass_frontend/static/translations/`, 60 languages) and `home-assistant/frontend` @ `dev` (`LICENSE.md`, `src/translations/en.json`)
**Live HA read:** one instance, `frontend/get_translations` with `category: 'title'` and `category: 'selector'`

Every number below was produced by importing the modules or by a real build. Four builds
were run against modified translation files; **the working tree was restored after each**
(`git checkout -- src/rendering/editor/translations/`) and is clean.

> **Status: executed. All nine languages reached 312/312.**
> This was written as a plan, and the body below still reads as one — present tense,
> nothing yet done. What it planned has since been carried out: the nine languages it
> scopes are fully translated, the glossary it proposes exists as
> [`editor-glossary.md`](./editor-glossary.md) and is parsed by `check:i18n`, and the
> per-language handoff briefs it describes were generated, used and discarded. It is kept
> for §3 — the mining analysis, whose measurements are cited elsewhere and are the reason
> the pre-v4 archive was ultimately deleted rather than kept.

---

## 1. Verdict

**The regression is real, it is a regression in _depth_ rather than in _language count_,
and mining cannot fix it.**

All eleven languages the previous editor supported are still present — ten files plus
English in `strings.ts`. What was lost is completeness:

|                                   |  old editor | new editor |
| --------------------------------- | ----------: | ---------: |
| English keys                      |         239 |        312 |
| genuinely translated, 9 languages | **97–100%** | **36–43%** |

**Mining is finished.** Three sources were assessed by English text, as the standing rule
requires. Together they fill **≈75 of the 1,786 missing strings — 4.2%.** The archive is
already exhausted; the card's own strings and Home Assistant's frontend are worth almost
nothing as bulk sources. **95.8% of the work is genuine translation.**

That makes the glossary the main lever, not a nicety. It is the only artefact that can
keep nine independent sessions from rendering _event_ three different ways, and it is the
one place where Home Assistant's translations _are_ extremely valuable — as a terminology
oracle rather than a string mine.

**Bundle cost to the eager path: exactly zero.** Verified across four builds, not argued.

---

## 2. Scope, Re-derived

Read by importing the modules through `scripts/load-editor-schema.mjs`, because this is a
question about **values**. A regex over `strings.ts` has already produced a wrong answer
here once.

### 2.1 The string table

`EDITOR_STRINGS` holds **312 keys / 9,767 characters of English**.

| class              |    keys | median |     max | total chars |
| ------------------ | ------: | -----: | ------: | ----------: |
| label              |     183 |     15 |     151 |           — |
| **helper (prose)** |  **62** | **69** | **253** |   **5,332** |
| option label       |      56 |   10.5 |      26 |           — |
| panel              |       9 |     10 |      20 |           — |
| option description |       2 |     21 |      25 |           — |
| **all non-helper** | **250** | **15** | **151** |   **4,435** |

The prose is 20% of the keys and **55% of the characters**. It is the harder half, and
the half most likely to be done badly under time pressure.

Structural content that must survive translation:

- **7 keys carry placeholders**: `{band}`, `{count}`, `{query}`, `{width}`.
- **8 keys carry special glyphs**: `—` (U+2014, 7 keys) and `≥` (U+2265, 1 key). There is
  no `→` and no non-breaking space anywhere in the table. _(Corrected: the original named
  four characters, two of which do not exist. The probe was a regex character class, so it
  answered "which keys match any of these" and the class **contents** were written up as
  findings — a shape that can never report a member absent. A check hardcoding that list
  would have guarded two phantom characters while reporting success.)_
- **2 keys carry typographic quotes**: `filter.no_matches`, `entity.compact_events_to_show.helper`.

### 2.2 Current coverage, and the shape of the gap

| language                            | present |    missing | of which prose | of which labels |
| ----------------------------------- | ------: | ---------: | -------------: | --------------: |
| de                                  |     134 |        178 |             50 |             128 |
| et, it, lt, lv, nb, pl, sk, sv (×8) |     111 |        201 |         **62** |             139 |
| en-GB                               |      46 | _(see §5)_ |              — |               — |

**Total missing across the nine languages needing full coverage: 1,786.**

The brief's figure of 2,052 counts en-GB's 266 as a gap. It is not one — §5.

**Eight of the nine languages have zero prose translated.** Every one of the 62 `.helper`
strings is missing in all of them; German alone has 12. This is not visible in the
coverage percentages and it changes the work's character: the residual is not 201 strings
of the same kind, it is 139 short labels plus **62 sentences that have never been written
in that language at all**.

### 2.3 Why coverage percentage misleads, and what to sequence first

E10 already recorded this and it still holds: at 105 keys German was ~34% translated and
looked **entirely English**, because every translated key sat inside a _collapsed_ panel
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

::: info The Archive Has Since Been Deleted
This measurement is why. A source with one remaining fill in 1,786 is not a reference
worth the 184 KB, the checker surface policing its internal consistency, or the standing
risk that someone adds a translation to it and ships nothing — which had already happened
once (backlog Y22). The strings it was worth keeping are in
`src/rendering/editor/translations/`; the terminology decisions are in
[`editor-glossary.md`](./editor-glossary.md).
:::

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

### 3.4 Source 3 — Home Assistant's frontend: 4% as a mine, 57% as an oracle

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

> **Two traps in that one command, both found the hard way.**
>
> **The translations are not one file per language — they are one file per language _per
> fragment_.** `static/translations/` holds the core table plus 14 subdirectories
> (`lovelace`, `config`, `energy`, …), and card-editor vocabulary lives in **`lovelace`**.
> Reading only the top-level file gives 1,462 English keys; loading every fragment gives
> **5,884**. The figures in §3.4 and §3.8 were first measured core-only and understated the
> mine by more than half. Always merge every fragment.
>
> **`pip download` is not reproducible across environments.** On this machine pip resolves
> through a corporate proxy (`packagefeedproxy.microsoft.io`) whose index for this package
> **stops at `20250109.2`**, so the "latest" wheel here is over a year stale — the version
> in this document's header, and not the version Stage 0 measured against
> (`20260128.6`). Two sessions can follow this instruction faithfully and get corpora
> a year apart, which is how a glossary entry becomes unverifiable. **Pin the version
> explicitly and record it beside any evidence taken from it**, and if a lookup cannot be
> reproduced, compare corpus sizes before concluding the evidence is wrong.

**As a bulk mine it fails**, consistently across all nine languages:

| lang      |   missing | core-only fills | **+ fragments** | fill rate |
| --------- | --------: | --------------: | --------------: | --------: |
| de        |       178 |               4 |           **7** |      3.9% |
| et        |       201 |               3 |           **9** |      4.5% |
| it        |       201 |               3 |           **8** |      4.0% |
| lt        |       201 |               3 |           **9** |      4.5% |
| lv        |       201 |               3 |           **6** |      3.0% |
| nb        |       201 |               3 |           **9** |      4.5% |
| pl        |       201 |               2 |           **8** |      4.0% |
| sk        |       201 |               3 |           **9** |      4.5% |
| sv        |       201 |               3 |           **9** |      4.5% |
| **total** | **1,786** |          **27** |          **74** |  **4.1%** |

The core-only column is what this document originally reported, and it was low by 2.7×
because it missed the `lovelace` fragment. **The conclusion is unchanged**: 4.1% is still a
failed bulk mine, and 96% still needs genuine translation. Stage 0 measured 70 against this
74 on a newer corpus; the gap is normalisation, not substance.

The parent session measured 3 for German with an exact `trim()` match; loosening to
case-folded, quote-normalised, trailing-punctuation-stripped matching moves it to 4. **The
null is a property of the data, not of the probe.** The reason is structural: the editor's
vocabulary is _Day Header Gap_, _Show Countdown for All-Day Events_, _Progress Bar Height_.
None of that exists in a generic UI table — and the fragments, which _do_ carry dashboard
vocabulary, still only reach 4.1%.

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

| corpus      | matching | appear | unique | agree |           **differ** |
| ----------- | -------- | -----: | -----: | ----: | -------------------: |
| live scrape | strict   |     13 |      8 |     8 |                **0** |
| live scrape | loose    |     14 |      9 |     8 | **1** — `Start Date` |
| PyPI wheel  | strict   |     13 |      9 |     8 |       **1** — `Time` |
| PyPI wheel  | loose    |     14 |      9 |     8 | **1** — `Start Date` |

The `14` is the loose figure; the `0` is the strict one. Loosen the match **or** change the
corpus and a disagreement appears — and not the same one, since the wheel at strict
surfaces `Time` where the live corpus does not. Zero disagreements was true only at the
intersection of the strictest matching and one corpus, which is also the cell with the
smallest sample.

Across all nine languages: **112 comparisons, 12 disagreements** — §3.7.

### 3.6 Two rules the disagreements force

**Latvian's HA table is 20.5% untranslated English** — 300 of 1,462 values are byte-identical
to the English. It is why the oracle returns `Label` and `Location` for Latvian, where our
existing `Etiķete` and `Atrašanās vieta` are plainly better.

| lang | HA values left in English | verdict         |
| ---- | ------------------------: | --------------- |
| lv   |               300 (20.5%) | **weak oracle** |
| de   |                 86 (5.9%) | strong          |
| nb   |                 55 (3.8%) | strong          |
| it   |                 50 (3.4%) | strong          |
| sv   |                 47 (3.2%) | strong          |
| et   |                 36 (2.5%) | strong          |
| sk   |                 32 (2.2%) | strong          |
| pl   |                 25 (1.7%) | strong          |
| lt   |                 14 (1.0%) | strong          |

> **Rule 1 — reject any oracle value byte-identical to its English.** It is HA's gap, not
> evidence. Without this guard the oracle actively degrades Latvian.

**Rule 1 is validated by the numbers it changes.** Re-running the nine-language control
with the guard applied drops Latvian from **2 disagreements to 0** — its only two were
HA's untranslated `Label` and `Location`, now correctly excluded. The guard removes exactly
the false disagreements and leaves every real one standing.

**And the oracle does not know our domain.** `Location` in our editor is an event's place;
in HA it is frequently a device's or a file's. HA German offers _Standort_ and
_Speicherort_; ours is _Ort_, which is what a German calendar says. Ours is better.

> **Rule 2 — the oracle informs, it does not decide.** Where HA's term comes from a
> different domain sense, the calendar sense wins, and the glossary records the reason.

### 3.7 The twelve disagreements, and what they are worth

Guard applied, all nine languages: **112 comparisons, 12 disagreements.** They are not
noise, and they fall into three kinds.

> **One of the twelve was hidden by a bug in this analysis, and the bug is instructive.**
> The comparison originally case-folded both sides before testing equality, so a
> disagreement that is _purely_ one of capitalisation read as agreement. That concealed
> exactly one: Polish `start_date_mode`, ours `Data Początkowa` against HA's
> `Data początkowa`.
>
> The irony is the point. §3.7 below argues that terminology and orthography are
> independent axes — and the check written to measure the first had silently folded in the
> second, in the one language whose orthography is most wrong (§6.1). **A comparison that
> normalises away the property you are also trying to measure cannot report on it.** The
> corrected comparison is case-sensitive.

| lang   | comparisons | agree |              differ |
| ------ | ----------: | ----: | ------------------: |
| sv     |          14 |    14 |               **0** |
| lv     |          11 |    11 |               **0** |
| de     |           9 |     8 |                   1 |
| et     |          12 |    11 |                   1 |
| it     |          11 |    10 |                   1 |
| nb     |          14 |    13 |                   1 |
| **pl** |          14 |    13 | **1** — casing only |
| lt     |          14 |    11 |               **3** |
| sk     |          13 |     9 |               **4** |

**`Time` — and our own languages disagree with each other.** Three languages differ from
HA on it, in _opposite directions_:

|     | ours                   | HA                    | which is the clock-time sense |
| --- | ---------------------- | --------------------- | ----------------------------- |
| de  | Zeit _(general)_       | **Uhrzeit** _(clock)_ | HA                            |
| et  | **Kellaaeg** _(clock)_ | Aeg _(general)_       | ours                          |
| it  | **Orario** _(clock)_   | Ora _(hour)_          | ours                          |

The label sits on an event's start time, so the clock sense is the right one — which makes
HA correct for German and wrong for Estonian and Italian. **The finding is not that HA is
better; it is that our own three languages do not agree among themselves.** German reaches
for the general word where Estonian and Italian reach for the specific one. That is
precisely the divergence a glossary exists to end, and it is invisible from inside any one
language's file.

**`None` — grammar, not vocabulary.** Lithuanian (`Nėra` vs `Nė vienas`) and Slovak
(`Žiadna` vs `Žiadny`) each differ on the same three option keys, consistently. Slovak's is
a gender agreement that may legitimately differ _per key_ depending on the noun each option
modifies. Neither is resolvable without a native speaker, and a find-and-replace to HA's
term would produce confidently wrong Slovak.

**`Start Date` — the single most disputed key, and therefore a term, not a slip.** Four of
the twelve disagreements are this one key, in de, et, pl and sk. A term disputed in four of
nine languages is a glossary entry that was never decided, not four independent mistakes —
and it is the strongest argument in this document for building the glossary by checking
each domain term against HA's table rather than by decree. `Location` (nb) and `Label` (sk)
are one apiece.

**The most useful thing in this table is what it separates.** Polish's only terminology
disagreement is _purely casing_ — `Data Początkowa` against `Data początkowa` — while it
title-cases **85%** of its labels (§6.1). Swedish agrees 14/14 and the oracle says nothing
at all about its orthography, which is the same blindness from the other side. **Terminology
quality and orthographic quality are independent
axes**, and a session that checks only one will report a language as good when half of it
is wrong. The bug noted at the head of this section is what happens when a check confuses
them.

### 3.8 Combined yield

| source                             |   fills | share of 1,786 |
| ---------------------------------- | ------: | -------------: |
| archive (`editor-languages/`)      |       1 |          0.06% |
| card strings (`languages/`)        |       0 |             0% |
| HA frontend (wheel, **fragments**) |      74 |           4.1% |
| **total**                          | **≈75** |       **4.2%** |

Even taken at its most generous the three sources overlap slightly and land near 75.
**Round it to 4%. The remaining 96% is genuine translation work.**

> **Corrected from ≈28 / 2%.** The HA row was measured against the core translation table
> only; adding the 14 fragments — `lovelace` above all — takes it from 27 to 74. The
> headline conclusion is unchanged and was never close to the margin: a source that fills
> 4% of the gap is not a bulk mine, and the plan never rested on it. Recorded rather than
> silently patched because the original figure was quoted onward as "98% is genuine
> translation", which is now 96%.

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

_(This is a reading of the licence texts, not legal advice. It is not relied on below.)_

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

**The target is 36 keys**, and three independent derivations agree on it — §5.2. It is
also the one file that should be _generated_ rather than translated — §5.5.

### 5.1 The defensible method

Scan the English table for words with a genuine US/UK divergence, using a fixed, reviewable
list (`color/colour`, `customize/customise`, `centre`, `behaviour`, `catalogue`, `grey`,
`licence`, `-ise/-ize`, `-lled`, …). Every key whose English contains one is in scope;
every key that does not is out.

**Result: exactly 36 keys.**

| divergence                | key instances |
| ------------------------- | ------------: |
| `color → colour`          |            32 |
| `colors → colours`        |             2 |
| `customized → customised` |             2 |

No other divergence fires anywhere in the table. The card's own US spelling is deliberate
and stays; this concerns the _editor's_ British variant only.

### 5.2 Two independent artefacts confirm the same 36

**The old editor's own file.** Written by hand years earlier, it overrode **29 keys**, using
`color → colour` (×31) and `colors → colours` (×1) — and nothing else. A strict subset of
the 36, which additionally catch `customised`.

**Home Assistant's own `en-GB` table.** HA ships one, and it is the natural place to look
for a divergence set that is not somebody's invention. Extracting every word-level
substitution it actually performs and applying that vocabulary to our 312 strings returns
**exactly the same 36 keys — zero extra, zero missed**.

Three routes, two of them external, converging on one set. That is as settled as this gets.

### 5.3 But HA's en-GB is an input, not an authority

It is tempting to go further and take HA's _rate_ as the target. **That does not survive
inspection, in two separate ways.**

**The rate does not transfer between corpora.** HA's en-GB differs on **61 of 1,462 keys
(4.2%)**. Applying that rate to our 312 gives 13–15 keys. The measured answer is 36
(**11.5%**) — because our corpus is _colour-dense_: it configures a card's appearance, and
32 of its 312 keys contain the word `Color`. HA's general UI table is not shaped that way.
**Use HA's vocabulary, never HA's percentage**; the one transfers between corpora and the
other cannot.

**And the table is not purely British English.** Classified:

|                                |   keys |
| ------------------------------ | -----: |
| genuine spelling divergence    | **24** |
| **casing only**                | **23** |
| word choice, grammar and other |     14 |

The 23 casing entries are arbitrary Title-Casing — `Nothing playing → Nothing Playing`,
`Add event → Add Event`, `All day → All Day`. That is not a British convention, it is
contributor drift. The remainder mixes real word choice (`Movie → Film`,
`Neighbors → Neighbours`) with grammar edits (`Loads → Load`), style rewrites
(`shows quicker → shows more quickly`) and **one entry whose en-GB value is French**
(`ui.dialogs.voice_command.conversation_no_control`).

So roughly **40% of HA's en-GB is British English** and the rest is noise and at least one
outright bug. Mine it for vocabulary — which is what §5.2 does, successfully — and do not
inherit its rate, its casing habits or its errors.

### 5.4 The current file is wrong in three ways

|                                               |  count |
| --------------------------------------------- | -----: |
| present and correct                           |  **1** |
| present but **wrong**                         | **17** |
| **missing**                                   | **18** |
| **no-op entries** (byte-identical to English) | **28** |

The 28 no-ops are already shipping and do nothing. The 17 wrong ones **silently drop Title
Case**: `Event Color` is overridden as `Event colour`, so switching an editor to British
English currently changes the _capitalisation_ of seventeen labels as a side effect. The
single correct entry is `customized_only → Customised Only`, which preserves it — so the
file is not even internally consistent.

### 5.5 Recommendation: generate it, do not translate it

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

| lang       | multi-word labels | with mid-string capitals |                                        rate |
| ---------- | ----------------: | -----------------------: | ------------------------------------------: |
| **pl**     |                81 |                   **69** |                                     **85%** |
| de         |                64 |                       47 | 73% _(expected — German capitalises nouns)_ |
| it         |                83 |                        6 |                                          7% |
| nb, sk, sv |             44–83 |                      2–4 |                                          5% |
| et, lt, lv |             71–84 |                        2 |                                        2–3% |

`Odstęp Między Dniami`, `Kolor Wydarzeń`, `Tryb Kompaktowy`, `Pokaż Pasek Postępu`. The
2–7% baseline in the other languages is almost entirely the acronym `UV`, which is correct.

**Polish is a systematic English-orthography calque across all 111 existing strings** — the
clearest instance in the repo of exactly the "cheap translation" the maintainer wants
excluded, and it is already shipping. Italian has ~4 genuine instances (`Tipo di Etichetta`,
`Modalità Compatta`).

**Home Assistant independently agrees.** The one Polish string where HA has an opinion and
ours differs is `Start Date` — ours `Data Początkowa`, HA `Data początkowa`. The _words_ are
identical; only the capital is wrong. A second artefact, reached by a different route,
pointing at the same defect on the one string where it could.

### 6.2 Weekday casing — the question here was the wrong one

> **Superseded by the maintainer at `27ab357`, and the correction is to the _question_, not
> just the answer.** Home Assistant capitalises the full weekday name at `ui.weekdays.*` in
> **all nine languages** — including Polish and Italian, which certainly lowercase weekdays
> in running text. So HA is not making an orthographic claim; it is applying the ordinary
> **standalone-label** convention, where a UI label takes an initial capital regardless of
> how the word behaves inside a sentence. Two consequences, both against what is written
> below:
>
> - **"Swedish is probably wrong" is withdrawn as unsupported.** Three independent native
>   sources — the card's Swedish contributor, the editor's, and HA's — all write `Måndag`.
>   Agreement across three is weak evidence of correctness; it is not evidence of error,
>   and the paragraph below asserted error.
> - **Norwegian is a disagreement between two native sources, not a settled defect.** HA's
>   Norwegian contributors wrote `Mandag`; the card's wrote `mandag`. Both are native
>   choices about the same word, so "the editor is calquing English" is one reading rather
>   than the finding.
>
> The question for a native speaker is **not** "does this language capitalise weekdays" —
> it does not, in prose, and nobody disputes that — but **"does a standalone UI label take
> an initial capital here?"** Those have different answers and only the first was asked.
> **Do not change either language's weekday casing on the strength of this section.** The
> live discussion is in `editor-glossary.md` §3; it remains unresolved.
>
> Kept below unedited because the reasoning it illustrates — a cross-check between two
> artefacts finds only disagreements — is still correct, and because it is a clean example
> of a real defect being inferred from a two-key sample.

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
product, two words for _event_, in adjacent surfaces.

The oracle resolves it with evidence rather than taste: **HA German uses `Ereignis`**
(`component.event.title`). The editor is HA-idiomatic and the card is the outlier. Whether
to change the card is the maintainer's call and out of scope here, but the **editor keeps
`Ereignis`**, and the glossary records why.

> **Superseded — this conclusion is backwards, and so is its framing.** Stage 0 resolved
> it the other way on stronger evidence; see
> [`editor-glossary.md`](./editor-glossary.md) §4.
>
> `component.event.title` belongs to Home Assistant's `event` **entity** domain — a
> stateless occurrence such as a button press — not to calendars. It is a different
> concept that happens to share an English name, so reading the term there is exactly the
> Rule 2 domain mismatch §3.5 warns about. At HA's _calendar_ keys German says
> `Termin hinzufügen`, `Termin löschen`, `Termin bearbeiten`.
>
> **The card and Home Assistant agree with each other, against the editor.** So the editor
> changed to `Termin` and the card was not touched — which also disposes of the
> maintainer's call, since no card string moves and nothing on the eager path changes.
>
> The framing was wrong too: this is **not** a general card/editor split. Measured across
> all nine languages, eight already agree three ways. German was the only disagreement.

### 6.4 Slovak carries four disagreements, including grammatical ones

`None` is `Žiadna` (feminine) in our file and `Žiadny` (masculine) in HA's, across three
option keys. Which is right depends on the gender of the noun each option modifies, and it
may differ _per key_. `Label` is `Menovka` for us and `Štítok` for HA.

Slovak is the worst-agreeing language in the control — 9 of 13 (§3.7) — and this is the
concrete demonstration that the oracle cannot be applied mechanically: a find-and-replace
to HA's term would produce confidently wrong Slovak. Flag for the native pass.

### 6.5 Our own languages disagree with each other about "Time"

Not a divergence from HA but a divergence _among ourselves_, and the more serious of the
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

Add **start date** and **time** to the front of that list. They are not the most frequent
terms, but they are the _measured_ trouble spots: `Start Date` accounts for four of the
twelve oracle disagreements (de, et, pl, sk) and `Time` is rendered in two different senses
across our own languages (§6.5). A term disputed in four of nine languages is a glossary
entry nobody ever made.

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

| term        | evidence                                               | de               | notes                                                                                                   |
| ----------- | ------------------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------- |
| event       | HA `Ereignis`; card `Termin`; editor `Ereignis`        | **Ereignis**     | editor already aligned with HA; card is the outlier                                                     |
| entity      | HA `Entität`; editor `Wetter-Entität`                  | **Entität**      | agrees                                                                                                  |
| colour      | HA `Farbe`; editor `-farbe`                            | **Farbe**        | agrees 9/9                                                                                              |
| description | HA `Beschreibung`; editor `Beschreibung`               | **Beschreibung** | agrees 9/9                                                                                              |
| location    | HA `Standort`/`Speicherort`; editor `Ort`              | **Ort**          | _(see note)_ — read at a **device** key; HA's calendar key also says `Ort`, so there is no disagreement |
| time        | HA `Uhrzeit`; editor `Zeit`; et/it use the clock sense | **Uhrzeit**      | **de is our own outlier** — §6.5; the label is an event's start time                                    |
| calendar    | HA `Kalender`                                          | **Kalender**     | no editor key yet; net-new                                                                              |
| column      | _no HA evidence_                                       | _decide_         | net-new, and the term the whole v4 view is named for                                                    |

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
   for Polish, Italian, Slovak, Estonian, Lithuanian, Latvian; German capitalises nouns
   natively. **Weekday labels are excluded from this rule** — whether a standalone UI label
   takes an initial capital is a separate convention from prose orthography, it is
   unresolved for Norwegian and Swedish, and an earlier version of this rule told sessions
   to lowercase them on the strength of a claim since withdrawn. Leave weekday casing as
   you find it; see §6.2 and `editor-glossary.md` §3.
3. **Do not calque English word order.** A label is named for the thing it labels in that
   language's natural order.
4. **Prose is written as sentences, not translated word by word.** The 62 helpers explain
   _what the card does_; a helper that reads as a gloss of the English has failed even if
   every word is right.
5. **Preserve the register of the source.** `strings.ts` documents its own choices — the
   filter bar deliberately says _settings_ rather than _options_, because the reader is
   looking for a thing in a UI. Carry the distinction, do not flatten it.
6. **Placeholders, glyphs and quotes survive verbatim**, repositioned as the target
   grammar requires.

### 8.2 What can be checked mechanically

Extend `scripts/check-i18n.mjs` — it already imports these modules, so the additions are
cheap and cannot go stale:

| check                                | catches                                                                                                                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **key coverage / unknown keys**      | _already implemented_                                                                                                                                                                      |
| **placeholder integrity**            | a lost or renamed `{count}` — 7 keys at risk, and a silent runtime defect today                                                                                                            |
| **untranslated English left behind** | a value byte-identical to `strings.ts` — the `en.json` failure mode, and how §3.6 detects HA's own gaps                                                                                    |
| **glyph integrity**                  | `≥`, `→`, `—`, nbsp dropped or ASCII-ified — 8 keys                                                                                                                                        |
| **title-case calque**                | the Polish defect, as a per-language ratio against a threshold, with German exempted                                                                                                       |
| **cross-language term consistency**  | the `Time` defect (§6.5) — one language rendering a glossary term in a sense the other eight do not. Needs all nine files compared against each other, which no per-language review can do |
| **length ceiling**                   | a label far longer than its English risking layout breakage; warn, do not fail                                                                                                             |
| **glossary adherence**               | a decided term rendered a second way — the divergence the glossary exists to prevent                                                                                                       |
| **en-GB derivation**                 | the whole file, recomputed and compared (§5.5)                                                                                                                                             |

Every one of these is a **shape or integrity** question, which is what a mechanical check
can answer.

### 8.3 What cannot be checked, honestly stated

Nothing above can tell you whether `pēc 2 dienām` is correct Latvian, whether a helper
reads naturally, or whether _Žiadna_ or _Žiadny_ agrees with the right noun. AGENTS.md is
explicit about this and it does not change here.

**The residue is real and should be named rather than papered over:**

- **~1,786 strings will be machine-translated to a high standard and reviewed by nobody
  who speaks the language**, unless native reviewers are recruited.
- The glossary reduces _inconsistency_, not _incorrectness_.
- The mechanical checks catch structural damage and systematic calques. They cannot catch
  a fluent, well-formed, wrong translation.
- Latvian carries the most risk: weakest oracle (§3.6) and no in-repo second opinion.
  Note the control is _not_ evidence against this — Latvian agrees 11/11, but only because
  the guard excluded the keys where HA had nothing to say.

**Native reviewers exist and are already known to this project, which turns "unless
recruited" from a hope into a list.** The old editor's 97–100% coverage was not the
maintainer's work: those 239 keys lived inside the card's own language files under an
`editor` key until they were split out on 2026-08-12, and every one of the nine languages
has an external contributor who touched that section. Recovering the names needs
`git log -S'"editor"' -- src/translations/languages/<lang>.json` rather than `--follow` on
the current file, because the split moved the content between files and `--follow` credits
only the split commit.

|      | contributor   |      | contributor        |
| ---- | ------------- | ---- | ------------------ |
| `de` | Gerd Seyfarth | `sk` | Jose Riha          |
| `sv` | Jonas Hedberg | `et` | taims11            |
| `pl` | superdarco78  | `lv` | 256_pixels         |
| `nb` | mathiasbk     | `lt` | Nerijus Zaniauskas |
| `it` | papperone     |      |                    |

Two consequences. The **baseline was native-contributed**, so this is a regression against
genuinely reviewed work rather than against an earlier machine pass — which raises the bar
rather than lowering it. And the residue above has a concrete remedy: nine people who have
already done this exact task once. Latvian's extra risk is unchanged in kind but not
unaddressable — `256_pixels` is the second opinion §6 says the repo lacks.

Whether to ask them is the maintainer's call and nothing here should assume it. But the
plan should not describe native review as hypothetical when the list is recoverable in one
command.

**Recommended mitigation, in order of value:** ship the checks; put a
`docs/contributing.md` call-out inviting native corrections per language; and treat the
first release after this work as a correction window rather than a finished state. The
predecessor reached 97–100% over years of community contribution, which is worth
remembering before promising equivalence in one pass.

---

### 8.4 Verifying a finished language — what 312/312 does and does not mean

Added by the German session (Stage 1), because it is the first language to reach full
coverage and every question below cost it a round trip.

**312/312 is full coverage of `EDITOR_STRINGS`, and `EDITOR_STRINGS` is the whole painted
surface.** That was checked rather than assumed: every label in the live German editor was
read back and every one of the 162 was German, with zero console errors. There is no
second string source feeding the rendered UI.

> ⚠️ **`ha-test.mjs editor` reports three labels that look untranslated and are not.**
> Before the harness was fixed it listed `Date`, `Event`, `Column` and `Weather` amid
> otherwise-perfect German. None of them is on screen. The harness read `el.label` first,
> which for a container is Home Assistant's `computeLabel(schema)` result computed from the
> node's bare `name` — `date`, `event`, `column` — and then **discarded**, because
> `ha-form-expandable` paints `schema.title` instead and `ha-form-grid` paints nothing at
> all. The headers actually read `In der Tagesüberschrift`, `Neben jedem Termin` and
> `Spaltendichte`.
>
> **Two sessions independently concluded these were real gaps**, and neither could find a
> key for them — correctly, because no such key exists or should. The harness now prefers
> `schema.title` and suppresses grid labels entirely. If you see a bare English noun that
> matches a _group's config key_ rather than any English string in the table, suspect the
> reader before the translation.

**What settled it was the screenshot, not the property.** Two DOM probes disagreed with each
other and a third read of the same properties would not have broken the tie; the pixels did,
immediately. This is the §"look at the artefact with the metric switched off" discipline in
its narrowest useful form — when a label question turns on _which property the UI paints_,
no property read can answer it.

**Verify the deployed artefact before believing anything the live editor says.** A deploy
that races a rebuild ships a stale editor chunk and prints success; one session read
`Day Rule Width` from a bundle that predated the string being translated. Compare hashes,
do not trust the word "Deployed":

```bash
# Only editor-dev.js is informative for translation work. A translation-only change
# leaves calendar-card-pro-dev.js byte-identical *by design*, so it matches whoever
# deployed last — including another session that overwrote yours. Checking both and
# reading a green card row as confirmation is a false pass, measured 2026-08-13.
diff -q dist/editor-dev.js \
        /Volumes/config/www/community/calendar-card-pro-dev/editor-dev.js || echo "STALE"
```

**When it renders as English anyway, check a string you _changed_, not one you added.** A
missing key and a stale bundle both render English, so an untranslated key distinguishes
nothing. A key whose **old** translated form appears has no other explanation. Pair it with
a language you did not touch: if that one renders fully and yours does not, the bundle is
yours and the defect is in your file; if neither does, the bundle is stale.

**Three keys are byte-identical to their English in every language** and each session will
have to exempt them: `width_table.at_least` (`≥ {width} px`), `width_table.below`
(`< {width} px`) and `week_number_mode.option.iso.label` (`ISO 8601`). A comparison symbol
with a placeholder and the name of an ISO standard do not translate. `view` (`Layout`) is a
fourth for `it`, `nb` and `sv`. See `IDENTICAL_TO_ENGLISH_OK` in `check-i18n.mjs`.

**Two tests move when a language completes, and this section named only one.** Both in
`tests/editor-translations.test.ts`, both proving per-key fallback by naming a language
that lacked a key — so each fails the moment that language finishes.

The first was re-pointed at en-GB when German completed. The second,
`keeps partial languages readable…`, asserted `EDITOR_LANGUAGE_STRINGS.sv` lacked
`panel.weather.helper` and went red when Swedish did; the sv/nb session re-pointed it at
en-GB using `weekend_colors` / `weekend_colors.helper`.

**The lasting fix is the witness, not the language.** en-GB is partial _by construction_ —
its generator overrides a key only when the English value contains a word in
`SUBSTITUTIONS` (`scripts/en-gb.mjs`). `Weekend Colors` contains `colors` and is
overridden; its helper, _"Each of these falls back to its weekday equivalent when left
empty."_, contains no substitutable word and is not. That pairing is guaranteed by the
generator's rule rather than by the current state of a file, so it cannot rot the way a
hand-picked missing key does. **If you add a third fallback test, pick its witness the
same way**: from a rule that produces the gap, never from a language that merely happens
to have one.

Note the rule is _the value contains a substitutable word_, not _the label contains
"Color"_ — `customize`, `behavior` and `favorite` are in the table too, which is why two
of the 36 en-GB keys have nothing to do with colour. The `weekend_colors` pair holds
either way, but a witness chosen against the narrower reading might not.

---

## 9. Bundle Impact

Four real builds. `npx rollup -c`, `gzip -9`.

### 9.1 The eager path is untouched — verified, not argued

| build                         | card chunk raw | card chunk gzip |
| ----------------------------- | -------------: | --------------: |
| translations emptied to `{}`  |        187,849 |          56,845 |
| **today (real translations)** |    **187,849** |      **56,845** |
| synthetic full coverage (A)   |        187,849 |          56,845 |
| synthetic full coverage (C)   |        187,849 |          56,845 |

**Byte-identical in all four.** The two-entry build guarantees it structurally, and this is
the measurement that confirms it. Full localization costs every dashboard load **zero**.

### 9.2 The editor chunk roughly doubles

| build                                                |  editor raw | editor gzip |
| ---------------------------------------------------- | ----------: | ----------: |
| translations emptied                                 |     110,734 |      36,000 |
| **today** (1,068 keys)                               | **154,324** |  **45,486** |
| synthetic full coverage — A, random word sampling    |     306,792 |      95,227 |
| synthetic full coverage — C, consistent word mapping |     326,862 |      85,862 |

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

#### 9.2.1 Measured at real full coverage — the estimate held

§12 listed this as unresolvable until a language was genuinely complete and said to
re-measure rather than trust the projection. All nine are now at **312 / 312**, so it is
resolved. Two real builds, same method as above (`npx rollup -c`, `gzip -9`):

| build                                  |  editor raw | editor gzip |
| -------------------------------------- | ----------: | ----------: |
| translations emptied to `{}`           |     110,734 |      36,000 |
| **real full coverage, nine languages** | **292,653** |  **81,979** |

**81,979 falls inside the predicted 79,000–93,000, near the lower end.** The rise from the
45,486 measured mid-way is **+36,493 gzip**, inside the projected +34 to +47 KB.

The emptied row reproduces §9.2's emptied row to the byte — 110,734 / 36,000 — which is
worth stating because it establishes the two measurements are commensurable rather than
merely similar-looking.

**Both simulations overestimated, including the one argued to be the more realistic.**
Simulation C predicted 85,862 gzip against a real 81,979, high by 3,883 — **+4.7% of the
real figure**, or 4.5% of C's own, and the two are quoted here together so nobody later
reads them as a discrepancy. A predicted 95,227, high by 16% of real. So the bracketing worked, and the honest reading is that synthetic text
built from real vocabulary still compresses worse than the real thing — C preserved
word-level repetition but not the phrase-level repetition that real UI strings carry, where
the same handful of patterns recur across a hundred labels.

**And §9.1's zero-cost claim now holds against real data rather than synthetic.** The card
chunk is **byte-identical at 187,554 raw / 56,792 gzip** whether every editor translation
file contains `{}` or all 2,808 real strings. Verified by emptying them, building, restoring,
and building again in one pass — and compared with `cmp` and SHA-256 rather than by size,
which matters here specifically: on a change that only adds strings to a lazily-loaded
sibling chunk, equal _sizes_ are exactly what you would expect even if the contents had
moved, so a size comparison cannot distinguish the claim from its negation. (It differs from §9.1's 187,849 / 56,845 because unrelated
`styles.ts` work landed in between; the invariant being tested is that _translations_ do not
move it, and they do not.)

Full localization costs every dashboard load **zero**, measured, at full coverage.

### 9.3 The earlier decision does not flip — and the brief's figure is wrong

**There is no ~8.4 KB measurement in the repo.** The brief appears to merge two separate
findings:

- **X2** projected **~+18,000 B gzip** to translate the editor namespace across 11
  languages, and is recorded as **"Dissolved by X1"**.
- The **~4 KB gzip** figure is about splitting the **card's** strings per-language — 19,468 B
  across all 35 languages — and was rejected as _"a trap"_.

Neither is 8.4 KB, and neither says the decision should be revisited at full coverage. The
opposite: X1 was adopted **in anticipation of exactly this work**, concluding that _"the
projected ~+18,000 B gzip cost of translating the new editor namespace across 11 languages
moves entirely off the eager path… Nothing has to be cut."_

**That reasoning is vindicated** — §9.1 measures the eager cost at zero. **The projection
itself was low by roughly 2×** (+18 KB projected against +34–47 KB measured), which is
worth recording, but it changes nothing: the cost lands where the design put it.

### 9.4 Should the editor's translations be split per-language as well?

**No.**

|                                            |             gzip |
| ------------------------------------------ | ---------------: |
| a user who never opens the editor          | **0 either way** |
| a user who opens it, all languages bundled |          ~43,000 |
| a user who opens it, own language only     |           ~4,300 |
| **saving, per editor-opener**              |      **~39,000** |

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
- **The glossary is a hard dependency.** Nine sessions deciding _event_ independently is
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
(§5.5); and the mining output as a per-language starting file (~30 strings, but more
usefully the oracle evidence each session will need).

**It must compare the nine languages against each other, not just each against HA.** The
`Time` inconsistency (§6.5) shows up only in that comparison — German's `Zeit` disagrees
with no external source, so every per-language review would pass it. This is work only
Stage 0 can do, because it is the only point at which all nine files are in one context.

Everything downstream depends on this. It is also the session that should be reviewed most
carefully, because a wrong glossary entry is copied nine times.

**Stage 1 — Nine language sessions. Fully parallel.**

One session per language: `de`, `et`, `it`, `lt`, `lv`, `nb`, `pl`, `sk`, `sv`.

Each session was handed a generated `editor-l10n-<lang>.md` brief — coverage figures, the
strings mined from Home Assistant's frontend, and the working order below. Those nine files
are **not kept in the repository**. They were snapshots of a partial state, every one of
them describing a language that is now at 312/312, and they said so themselves: the
termbase in [`editor-glossary.md`](./editor-glossary.md) is the durable record, not the
brief. `scripts/l10n-handoff.mjs` regenerates one for any language on demand, which is the
right way to get a brief for a language that needs one — a stored copy would only ever
describe the day it was written.

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
  It optimises for consistency of _pass type_ over consistency _within a language_, and the
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
   the opposite. X1 was adopted _because_ full coverage was coming; X2 is marked
   "Dissolved by X1". The decision holds.
4. **Home Assistant's frontend as "the highest-value idea in this brief"** — as a bulk mine
   it yields **1.5%**. The parent session corrected this independently and is right; the
   correction is confirmed here at looser matching and extended to all nine languages.
   As a _terminology oracle_ it is genuinely valuable — 57% of probe terms — which is a
   different and smaller claim.
5. **"250 are labels, median 16 chars"** — measured median is **15**.
6. **"106 of 312 keys matched by English text"** (archive) — importing gives **104**.
7. **The parent session's "0 disagreements"** for the German oracle — true in exactly one
   of four corpus × matching-strength combinations, and that one has the smallest sample.
   Loosen the match or change the corpus and a disagreement appears; the two figures quoted
   together (`14 appear`, `0 differ`) come from different matching strengths. With the
   English guard applied across nine languages: **112 comparisons, 12 disagreements**. §3.5, §3.7.
8. **Unstated in the brief, and material:** eight of the nine languages have **zero** prose
   translated, so the residual is 62 sentences per language, not 201 labels. §2.2.
9. **Also unstated, and it changes how sessions are reviewed:** terminology quality and
   orthographic quality are **independent**. Polish's _only_ terminology disagreement is
   pure casing while it title-cases 85% of its labels. Checking one axis says nothing about
   the other. §3.7.
10. **A later suggestion that en-GB should carry ~15–20 keys**, extrapolated from HA's own
    en-GB differing on 4.8% of its table — **the rate does not transfer**. Our corpus is
    colour-dense (32 of 312 keys contain `Color`), so the measured answer is 36 (11.5%).
    Applying HA's _vocabulary_ rather than its _percentage_ returns exactly those 36. §5.3.
11. **And a correction to this document.** Its own oracle comparison case-folded both sides,
    so a purely-capitalisation disagreement read as agreement — concealing one, in the
    language whose capitalisation is most wrong. Count corrected from 11 to **12**. §3.7.
12. **Two more corrections to this document, both found by Stage 0 reading it as a
    specification.** The glyph inventory in §2.1 named `→` and a non-breaking space,
    **neither of which exists** in the table — the probe was a regex character class, so it
    reported which keys matched _any_ member and the class contents were written up as
    findings. And the HA mine was measured against the **core** table only, missing the 14
    fragments where dashboard vocabulary lives; 27 fills became **74**. §2.1, §3.4, §3.8.
13. **A reproducibility defect in this document's own method.** It tells the reader to
    `pip download home-assistant-frontend`, which is **not deterministic across
    environments**: on this machine pip resolves through a corporate proxy whose index for
    that package is over a year stale, so "latest" here is `20250109.2` while Stage 0
    measured `20260128.6`. That is how a glossary entry becomes unverifiable — a lookup
    that genuinely exists in one corpus and genuinely does not in another, with both
    sessions following the same instruction. Pin the version. §3.4.

## 12. Things I Could Not Establish

::: tip Read This as a Record, Not a To-Do List
**Maintainer ruling, 2026-08-14: none of the open questions below gate the v4 release.**
Native review happens *after* v4 ships, through the issues and pull requests a published
translation attracts — which reaches actual speakers of each language, rather than whoever
can be asked in advance. Nothing here is a pre-release checklist.

What stays load-bearing is the *reasoning*: several of these look like one-line fixes and
are not. Lowercasing a weekday is half the fix at most where the preposition governs case,
and a find-and-replace to Home Assistant's term produces confidently wrong Slovak. Keep
those warnings whatever happens to the questions.
:::

- **Whether any individual existing translation is correct.** Everything in §6 is a
  _systematic_ defect visible from structure or cross-artefact disagreement. Establishing
  correctness needs native speakers, and nothing in this repo can substitute.
- **Whether a standalone weekday label takes an initial capital in Norwegian and Swedish.**
  Not the question this document originally asked — it asked whether those languages
  capitalise weekdays, which they do not in prose and which nobody disputes. The maintainer
  reframed it at `27ab357` after a third source (HA's `ui.weekdays.*`, capitalised 9/9)
  showed the convention at issue is standalone-label capitalisation, not orthography. Still
  unresolved, and now asking the right thing. §6.2.
- **Whether `Žiadna` or `Žiadny` is right per key in Slovak.** It depends on the modified
  noun's gender and may differ between the three keys. Needs a native speaker.
- **The true bundle figure at real full coverage.** §9.2 is a bracketed simulation from
  synthetic text and is honest about that. It resolves exactly when the first language is
  genuinely complete — **re-measure after Stage 1's first session** rather than trusting
  the estimate.

  > **Resolved.** All nine reached 312/312 and it was measured: **81,979 gzip**, inside the
  > predicted 79,000–93,000. Both simulations ran high, C by 4.5%. §9.2.1.

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
- [`editor-glossary.md`](./editor-glossary.md) — the termbase this plan called for,
  decided across all nine languages. It supersedes §6.3 and corrects the `location` row
  in §7.4.
