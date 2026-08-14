# Calendar Card Pro v4.0.0 — Independent Review

**Reviewer:** independent session, no authorship of the code under review.
**Branch reviewed:** `feature/column-view-v4` @ `cfa62b3`, compared against `origin/dev` (v3.6.0) and tag `v3.5.0`.
**Date:** 2026-08-14. **Status:** all seven findings fixed on `alexpfau-v4-independent-review`; see _Disposition_ below.

Every finding below carries the command that produced it. Where I could not reproduce
something, I say so. Where I initially measured something wrong, that is recorded too.

## Disposition

Every finding has been fixed on `alexpfau-v4-independent-review`, in six commits, each
with a test watched failing before it passed where the fix was in code. Findings are left
in their original wording below, with the fix recorded under each, so the reasoning that
produced them stays auditable.

| # | Finding | Fix |
| - | ------- | --- |
| 1 | List event-weather badge changed colour | `139b0e5` — restored `--secondary-text-color`; release note corrected |
| 2 | Nested weather lengths ignored bare numbers | `16d1f19` — `normalizeLengthOptions` now descends nested groups |
| 3 | Editor threw on non-array `entities` | `cd3200e` — guarded at the boundary in the editor's `setConfig` |
| 4 | Stale byte figures, wrong baseline | `1b09942` — re-measured against v3.6.0, level stated |
| 5 | `editor.js` in a shared namespace | `492e7f3` — install docs use a subfolder; adoption is a checked step |
| 6 | Manual installs uncompressed | `492e7f3` — release zip now ships a `.gz` beside each file |
| 7 | Two design docs contradicted each other | `d7` table rewritten as resolutions; this file updated |

One item found during the fixes is **not** fixed and is recorded at the end under
_Left open_.

## Verdict

**No finding below blocks the release.** The two headline promises hold under
measurement: list-view output is unchanged apart from three deliberate, identifiable
changes, and column view matches its specification on the points I could test
mechanically. What I did find is concentrated in **documentation accuracy** — including
one qualifier on a breaking-change note that will cause affected users to conclude the
change does not apply to them.

All eight gates pass on this branch:

```
npx tsc --noEmit          # clean
npm run lint              # clean
npm test                  # 1005 passed, 33 files
npm run check:i18n        # 0 errors, 7 warnings (all known fullDaysOfWeek casing)
npm run check:docs        # 0 errors, 9 warnings (all "code default undefined" notes)
npm run build && npm run check:bundle
                          # calendar-card-pro.js 188333 B, editor.js 292755 B
npm run docs:build        # not re-run; check:docs resolved 119 internal links
```

---

## Findings, by severity

### 1 — MEDIUM. The breaking-change note for the weather badge tells affected users it does not affect them

**What is wrong.** `docs/RELEASE_NOTES.md:13` says the event weather badge's new colour
affects "a card whose `weather:` block was written by hand rather than through the
editor". That qualifier is wrong. `weather.event.color` **has no default at all**, so it
is absent from every configuration — editor-written or hand-written — unless the user
explicitly set a colour. Every user with `weather.position: event` or `both` who has not
set `weather.event.color` sees the temperature change from
`--secondary-text-color` to `--primary-text-color`.

This matters more than a normal wording slip, because the note's whole job is to let a
reader decide whether a breaking change applies to them. As written, an editor-configured
user correctly concludes "not me" and is wrong.

**Reproduction — that the default is absent:**

```bash
cat > tests/zzz-weather-color.test.ts <<'EOF'
import { describe, expect, it } from 'vitest';
import * as Config from '../src/config/config';
describe('weather.event.color default', () => {
  it('is absent from DEFAULT_CONFIG', () => {
    const ev = (Config.DEFAULT_CONFIG.weather as Record<string, Record<string, unknown>>).event;
    expect(Object.keys(ev)).not.toContain('color');
    expect(ev.color).toBeUndefined();
  });
});
EOF
npx vitest run tests/zzz-weather-color.test.ts; rm tests/zzz-weather-color.test.ts
#  => 1 passed. DEFAULT_CONFIG.weather.event has keys:
#     show_conditions, show_temp, show_uv_index, uv_index_threshold,
#     daily_forecast_fallback, max_lines, icon_size, font_size  — no `color`.
```

**Reproduction — that the rendered colour actually changes.** Each tree's own DOM, own
custom properties and own stylesheet, rendered in real Chromium, badge located by
selector rather than by index (v4 adds a nesting level, so index walking misaligns):

```
event-weather badge, list view, default config
field       dev (v3.6.0)                      v4
 ! badge     [754,6,34,14]                     [754,4,34,18]
 ! glyphs    [769.8,6,18.2,14]                 [769.8,7,18.2,14]
   fontSize  "12px"                            "12px"
 ! color     "rgb(114, 114, 114)"              "rgb(33, 33, 33)"
   row       [80,4,721,18]                     [80,4,721,18]
```

Grey → near-black; badge box 14px → 18px tall; glyphs 1px lower. The **row height is
unchanged**, so nothing reflows — this is a colour and vertical-centering change, not a
layout break.

**Blocks release?** No. Only the qualifier was wrong; the change itself was disclosed.

**FIXED — `139b0e5`.** Investigating the maintainer's question turned this from a wording
fix into a code fix. `weather.event.color` is an **existing** key, on
`WeatherPositionConfig` since at least v3.5.0, and it **did** have a default —
`'var(--primary-text-color)'`, for both `date` and `event`, in v3.5.0 and v3.6.0.
Removing it in v4 was correct: the default was unreachable, because `setConfig` merges
shallowly and any card that actually shows weather supplies a `weather:` block that
replaces the whole sub-tree, and because the editor treats `weather` as an `ATOMIC_KEY`
and was baking that dead default into user YAML.

But the release note's second claim — "previously a single fallback served both" — was
also wrong, and that one hid the real defect. v3 chose the fallback **per position in the
renderer**: `dateConfig.color || 'var(--primary-text-color)'` and
`eventConfig.color || 'var(--secondary-text-color)'` (v3.6.0 `leaves.ts:88` and `:324`).
v4 gave the list placement primary, which reversed shipped behaviour *and* made list
disagree with v4's own column view, which kept secondary.

Restored to `--secondary-text-color`, so both placements now share one fallback. Verified
by re-running the same browser probe: `color` is now `rgb(114, 114, 114)` on both sides.
An existing test had pinned the regression — it asserted primary — and is replaced; two
new cases were watched failing first, one on the literal value and one asserting the two
placements are equal. The release note now describes what actually changed.

---

### 2 — MEDIUM-LOW. Bare numbers written against nested weather length options silently do nothing

**What is wrong.** `normalizeLengthOptions` turns `day_spacing: 4` into `'4px'` so the
option is not silently dropped — a good fix, and `src/config/config.ts:358` notes that
twenty-three shipped options needed it. But `src/config/config.ts:361-363` scopes it to
**top-level keys only**, and the four nested weather length options are left out:

- `weather.date.icon_size`, `weather.date.font_size`
- `weather.event.icon_size`, `weather.event.font_size`

Home Assistant's YAML parser types `font_size: 16` as a number. That reaches
`--calendar-card-weather-date-font-size: 16`, which is not a valid length, so the
declaration is invalid at computed-value time and the badge silently inherits instead.
Nothing errors and nothing is logged.

**Reproduction:**

```bash
cat > tests/zzz-coercion.test.ts <<'EOF'
import { describe, expect, it } from 'vitest';
import { buildConfig } from './fixtures';
import * as Config from '../src/config/config';
import * as Styles from '../src/rendering/styles';
import type * as Types from '../src/config/types';
describe('bare-number coercion coverage', () => {
  it('CONTROL: a top-level length option IS coerced', () => {
    const c = buildConfig({ day_spacing: 4 } as unknown as Partial<Types.Config>);
    Config.normalizeLengthOptions(c);
    expect(c.day_spacing).toBe('4px');           // passes
  });
  it('nested weather lengths are NOT coerced', () => {
    const c = buildConfig({ weather: { entity: 'weather.home', position: 'date',
      date: { icon_size: 20, font_size: 16 } } } as unknown as Partial<Types.Config>);
    Config.normalizeLengthOptions(c);
    const p = Styles.generateCustomPropertiesObject(c);
    expect(String(p['--calendar-card-weather-date-font-size'])).toMatch(/px$/);
  });
});
EOF
npx vitest run tests/zzz-coercion.test.ts; rm tests/zzz-coercion.test.ts
#  => CONTROL passes;  second fails:  AssertionError: expected '16' to match /px$/
```

The control is the point: it proves the probe can pass, so the failure is about the
nested path and not about my harness.

**Not a v4 regression.** v3.6.0 wrote the same bare number into an inline
`style="font-size: 16;"`, which the browser also discarded. The net user experience is
unchanged; v4 simply built the machinery that fixes this class and stopped one level
short.

**Blocks release?** No.

**FIXED — `16d1f19`.** The scope limit rested on a premise that does not hold: a nested
key's shipped default *is* visible, because `DEFAULT_CONFIG` carries the same nesting, so
both structures can be descended in step. `normalizeLengthOptions` now walks them
together. Descent requires a plain object on both sides, which excludes arrays —
`entities` has no per-index default, so walking it could only do harm — and excludes any
key the defaults do not describe, such as the `column:` block, whose keys
`resolveEffectiveConfig` already coerces against `COLUMN_DEFAULTS`. Four cases watched
failing first, plus an array guard and an idempotency case through the nesting, since
appending twice would give `16pxpx`.

---

### 3 — MEDIUM-LOW. The visual editor throws when `entities` is not a list — pre-existing, not a v4 regression

**What is wrong.** `src/rendering/editor/synthetic.ts:544` calls `.map()` on
`config.entities` without checking it is an array. The card guards this properly —
`normalizeEntities` returns `[]` for a non-array (`src/config/config.ts`, `if
(!Array.isArray(entities)) return []`) — so the card renders and the editor is the only
thing that breaks. That is the worst place for it: the user reaches for the editor
*because* their config is wrong.

**Reproduction.** I tested twelve legal-but-odd configurations against both the card's
normalizers and the editor element:

```
baseline (valid list)                      card=OK  editor=OK
bare string entities                       card=OK  editor=THREW: (config.entities ?? []).map is not a function
entities: {}                               card=OK  editor=THREW: (config.entities ?? []).map is not a function
entities: [null]  (a bare "-" in YAML)     card=OK  editor=OK
entities: [{}]                             card=OK  editor=OK
entities omitted entirely                  card=OK  editor=OK
entities: [123]                            card=OK  editor=OK
view: grid (reserved)                      card=OK  editor=OK
column: invalid key                        card=OK  editor=OK
column: fetch-time key                     card=OK  editor=OK
weather partial subtree                    card=OK  editor=OK
numbers where px expected                  card=OK  editor=OK
```

Ten of twelve pass, including `entities: [null]` — the real-world shape behind the v3.6.0
"one stray line of YAML" fix. Only the two non-array shapes fail.

**I then checked whether the editor rebuild introduced it. It did not:**

```bash
# in a worktree at origin/dev (v3.6.0), against the OLD hand-rolled editor
v3.6 editor  bare string entities     -> THREW: entities.forEach is not a function
v3.6 editor  entities: {}             -> THREW: entities.forEach is not a function
```

Same defect, different message. This has shipped for at least two releases.

**Blocks release?** **No** — v4 is no worse than the released baseline. (A background
audit I commissioned rated this a release blocker; I disagree, and the v3.6.0 run above
is why. Worth recording as an example of a finding that looks blocking until you measure
the baseline.)

**FIXED — `cd3200e`.** Guarded at the boundary, in the editor's own `setConfig`, rather
than at the eight call sites. The guard covers **array-ness only**, deliberately not the
card's `normalizeEntities`: that also expands a bare `calendar.family` into
`{entity: 'calendar.family'}`, which is right for the card, which only reads the result,
and wrong for the editor, which stores what it holds. Reaching for the normalizer first
turned two existing round-trip cases red in `editor-filter` and `editor-schema` — it
would have rewritten every user's compact list into objects on their first unrelated
edit. That constraint now has its own test. Eight config shapes covered, two watched
failing first.

---

### 4 — LOW. Release-notes byte figures are stale, and the baseline is not the previous release

**What is wrong.** Two separate issues in the same claim at `docs/RELEASE_NOTES.md:93`.

First, all six absolute figures are stale — measured at an earlier commit than the branch
head. I built each version from source and measured:

| figure                | claimed | actual  | delta |
| --------------------- | ------- | ------- | ----- |
| v3.5.0 raw            | 347,969 | 347,940 | 29    |
| v3.5.0 `gzip -6`      | 96,870  | 96,857  | 13    |
| v3.5.0 `gzip -9`      | 96,651  | 96,638  | 13    |
| v4.0.0 card raw       | 188,158 | 188,333 | 175   |
| v4.0.0 card `gzip -6` | 57,055  | 57,099  | 44    |
| v4.0.0 card `gzip -9` | 56,908  | 56,955  | 47    |
| v4.0.0 editor         | 82,802  | 82,834  | 32    |

Second, the comparison is against **v3.5.0**, but **v3.6.0 is tagged and published**
(`gh release list` shows it as `Latest`, published 2026-08-14). The stated baseline is one
release out of date.

**Reproduction:**

```bash
git worktree add /tmp/ccp-350 v3.5.0 --detach && cd /tmp/ccp-350 && npm ci && npm run build
for f in dist/*.js; do echo "$f raw=$(wc -c < $f) gzip6=$(gzip -c $f | wc -c) gzip9=$(gzip -9 -c $f | wc -c)"; done
#  v3.5.0  raw=347940  gzip6=96857  gzip9=96638
#  v3.6.0  raw=351905  gzip6=98419  gzip9=98197     (built the same way from origin/dev)
#  v4.0.0  card raw=188333 gzip6=57099 gzip9=56955
#          editor raw=292755 gzip6=82834 gzip9=82041
```

**The percentages survive both problems**, which is why this is LOW and not higher:

- vs v3.5.0: `1 − 57099/96857` = **41.1 %** wire, `1 − 188333/347940` = **45.9 %** raw → "41%" and "46%" both stand.
- vs v3.6.0: **42.0 %** wire, **46.5 %** raw.

So the published claim is *conservative* — the true improvement against what users
actually have installed is slightly larger. No user is misled in a harmful direction.

**Blocks release?** No.

**FIXED — `1b09942`.** Re-measured at the branch head, against v3.6.0:

| | raw | `gzip -9` |
| --- | --- | --- |
| v3.6.0 | 351,905 | 98,197 |
| v4.0.0 card | 188,866 | 57,166 |
| v4.0.0 editor | 292,946 | 82,102 |

That is **42%** over the wire and **46%** raw. The level is now stated, and it is `-9`
rather than the default `6` because that is what actually reaches a browser — confirmed
rather than assumed: the `.gz` HACS installed for v3.5.0 is 96,638 bytes, byte-for-byte
our own `gzip -9` of that same build. Updated on all four surfaces carrying the number
(notes lede, performance entry, README, What's New).

---

### 5 — LOW. `editor.js` lands in a shared namespace on manual installs, and the failure is unhandled

**What is wrong.** Two small things that compound.

`docs/guide/installation.md` tells manual installers to extract both files into
`/config/www/`, so the editor is served as `/local/editor.js`. That is a maximally
generic filename in a flat directory shared by every manually-installed card, theme and
script. HACS users are unaffected — HACS installs into a per-repository subdirectory.

If some other file wins that name, the dynamic import **succeeds** and returns a module
with no `CalendarCardProEditor` export. `src/calendar-card-pro.ts:149-171` wraps only the
`await import(...)` in its try/catch; the `customElements.define(...)` at line 170 sits
outside it. So the user gets an unhandled `TypeError: parameter 2 is not of type
'Function'` instead of the carefully written "one of the card's files is missing" message
directly above it.

**Observation supporting the collision risk** — the shared directory on a real instance
already holds 25 card directories, and one third-party card ships a file named
`bubble-pop-up-fix.js` alongside its main bundle:

```bash
ls -d /Volumes/config/www/community/*/ | wc -l     # 26 installed card directories
```

**Blocks release?** No — it needs a name collision to fire, and the recommended install
route (HACS) cannot hit it.

**FIXED — `492e7f3`.** Both mitigations applied. The installation docs, the README and
the release note now name `www/calendar-card-pro/` rather than `/config/www/`, and the
resource URL follows. Adoption of the imported component is now a checked step *inside*
the try/catch, so a file that resolves but is not the editor produces a message naming
the problem and the remedy instead of a raw `TypeError` about "parameter 2". Eight module
shapes covered — wrong export, empty module, non-constructor, `undefined`, `null`, and
the success and double-registration paths — all watched failing first.

---

### 6 — LOW. Manual installs receive both files uncompressed

**What is wrong.** Home Assistant serves a pre-compressed `.gz` sibling when one exists
and does not compress on the fly. HACS writes a `.gz` for every asset it downloads, so
HACS users get 57 KB + 83 KB. A manual installer extracting the zip has no `.gz` and
receives **188 KB + 293 KB**.

**Reproduction:**

```bash
curl -s -o /dev/null -D - --compressed http://homeassistant.local:8123/hacsfiles/calendar-card-pro/calendar-card-pro.js
#  Content-Encoding: gzip     Content-Length: 96638      <- HACS-installed, has a .gz sibling
curl -s -o /dev/null -D - --compressed http://homeassistant.local:8123/hacsfiles/calendar-card-pro-dev/editor-dev.js
#  (no Content-Encoding)      Content-Length: 292755     <- hand-copied, no .gz sibling
```

**Blocks release?** No. It is still an improvement on v3.5.0's 348 KB card for the same
installer, and the docs already steer people to HACS.

**FIXED — `492e7f3`.** It is fixable, and the fix is the one HACS already uses. First I
checked the mechanism holds for `/local/` and not only `/hacsfiles/`, because the whole
idea rests on it: a probe file copied to `/config/www/` with a `.gz` sibling came back
`Content-Encoding: gzip` with the compressed length, and the same file without one came
back raw. The release zip now writes a `gzip -9` copy beside each file, matching what
HACS installs. Ran the new packaging step locally: the zip holds four files and `dist/`
still holds two, so `check:bundle` and the `dist/*.js` asset glob are untouched. Both
install surfaces explain what the `.gz` files are for.

---

### 7 — LOW (documentation only). Two v4 design documents contradict each other on what is outstanding

`docs/development/v4-backlog.md` reports every item closed — 42 rows marked `**Done**`,
zero marked `Open`, `In progress`, `Blocked` or `Ruled`:

```bash
for s in Open "In progress" Blocked Ruled Done; do
  printf "%-14s %s\n" "$s" "$(grep -oE "\| +\*\*$s\*\*" docs/development/v4-backlog.md | wc -l)"
done
#  Open 0 / In progress 0 / Blocked 0 / Ruled 0 / Done 42
```

But `docs/development/column-view.md:312` still carries a table headed **"D7. Release
Blockers & Follow-Ups"** listing seven items in the imperative ("Rule and implement, or
document as unsupported"). I checked each against the code and they are in fact
satisfied — `column.entities[]` is documented as unsupported at
`docs/features/column-view.md:65`, compact is ruled inert by A3-D and enforced by
`viewAppliesCompactLimits`, progress-bar coverage exists as
`tests/progress-bar-width.test.ts`, and the schema-driven editor cannot emit an invalid
`column:` key.

So the table is stale rather than wrong-in-substance, but a reader arriving at the
specification sees seven open release blockers.

**Blocks release?** No. Internal documents only.

**FIXED.** §D7 is rewritten from an imperative "blockers" table into a table of
resolutions, one line each. The heading and anchor are kept because the rationale archive
cites §D7 in several places and E-crit 6 requires section identifiers to survive. A
caveat is recorded with it: the `column:` diagnostics are `Logger.warn`, and production
pins the log level to `ERROR`, so a YAML-only user sees nothing until they raise it from
the console — deliberate, but it means the editor is the only surface that *prevents* the
mistake rather than reporting it.

---

## Areas checked where I found nothing

Each of these is a real check with the command that cleared it, not an untested area.

**List-view DOM identity, 214 configuration permutations.** I built a differential
harness that flips every option in `DEFAULT_CONFIG` (booleans inverted, numbers,
colours, lengths, enums), plus twelve interaction combinations, and ran the identical
harness in a worktree at `origin/dev` and in this branch. Fixtures are byte-identical
between the trees (`diff` → 0 lines), so the only variable is the source.

Of 214 shared cases, 111 differ, and **every difference reduces to three deliberate
changes**: 106 cases are the multi-day weekday fix (`"All day, until Jun 19"` →
`"All day, until Friday, Jun 19"`, commit `e0783bd`, guarded by
`tests/multiday-weekday-parity.test.ts`); 3 are the weather badge markup change; 2 are
the `split_multiday_events` behaviour discussed below. Nothing else in list view moved.
The committed snapshot agrees — 17 entries before and after, and the only changed lines
are those same two things.

**List-view CSS and geometry identity, in real Chromium.** The DOM gate cannot see the
stylesheet, and the stylesheet changed substantially (77 rules → 121; 8 existing
selectors modified, including `.time` gaining `flex-wrap: wrap`, `.time-actual` losing
`flex-shrink: 0`, and `.time-countdown` / `.progress-bar` moving from
`margin-left: 8px` to `margin-inline-start: auto`). I rendered each tree's own DOM +
own custom properties + own stylesheet in headless Chromium across **10 configurations ×
4 viewport widths (1200/600/400/320)** and compared every element's bounding box and
eight computed properties.

Result: **the only geometry differences anywhere are the weekday-fix text getting wider
and the weather badge in finding 1.** The stylesheet changes that looked most alarming on
inspection — `flex-wrap`, the lost `flex-shrink`, the `auto` margins — move nothing at any
tested width, because `justify-content: space-between` already produced that layout. The
new `-webkit-line-clamp` on `.event-title` is inert at default config as intended.

**Column-view density: the editor's band table against the runtime.** `D8.5` requires the
editor's width-band explanation to be the same arithmetic the runtime uses. These are two
separate functions (`describeColumnLayoutBands` and `resolveColumnFit`), so I ran them
against each other across five configurations — defaults, a lowered floor, a `cramp`
floor, a very narrow `min_day_width`, and a large gutter. At every advertised band
boundary the runtime returns exactly that column count, and one pixel below it returns
strictly fewer. The single mismatch was my own assertion being wrong for
`min_days_fallback: 'cramp'`, which correctly *holds* the floor rather than reducing.

Also verified in the same run: at default configuration the card renders `days_to_show`
columns at every width from 100 px to 3000 px and never silently reduces (E-crit 5), and
a 1-px-at-a-time width sweep from 100 px to 2000 px never oscillates.

**Column-view specification spot-checks.** `minmax(0, 1fr)` tracks at
`src/rendering/column.ts:528`; week-number rows reserved with `visibility: hidden` at
`column.ts:394`; separator precedence month > week > day at `column.ts:98/123`; compact
family inert in column view via `viewAppliesCompactLimits`, consumed at `events.ts:207`
and `calendar-card-pro.ts:1205`. All match the specification text.

**Live rendering and the two-file split, on a real Home Assistant instance.** Deployed the
dev build (`?v=372`) and drove a real browser:

```
node ha-test.mjs check --view ccp-current-testing
#  26 cards rendered, "OK — no errors"
node ha-test.mjs editor --card 1
#  Editor dialog open: true   fields rendered: 144   kind: schema-driven
#  9 panels, 0 errors
```

The lazily-fetched editor loads and renders in a real browser. The production bundle names
`./editor.js` (not `./editor-dev.js` — the `replace()` trap in `AGENTS.md` did not fire),
`import.meta` survives esbuild, and the card defines the editor element itself so
`editor.js` never double-registers.

**HACS gzips secondary assets — so the editor's stated wire size is real.** This was the
one assumption in the size claim that could have been badly wrong. Evidence from a real
instance: `HA-Firemote` ships four `.js` files and has four `.gz`; `Bubble-Card` ships a
secondary `bubble-pop-up-fix.js` and has a `.gz` for it; `advanced-camera-card` is 1597/1597.
The single outlier (`hue-like-light-card`, 3 js / 1 gz) has two hand-placed leftovers from
2025 with unrelated names and dates. HACS gzips what it downloads.

**The v3.6.0 release-notes merge dropped nothing.** The flagged risk was a hand-merged
section. It is byte-identical apart from one trailing blank line:

```bash
diff <(git show origin/dev:docs/RELEASE_NOTES.md | sed -n '5,46p') <(sed -n '107,149p' docs/RELEASE_NOTES.md)
#  40a41
#  >            <- one added blank line, nothing else
```

**Documented YAML examples use only real option names.** `check:docs` verifies that every
option is documented, but not the reverse inside examples — a typo in an example is
copy-pasted straight into a user's dashboard. I scanned 40 markdown files, 108 YAML
blocks, 568 mapping keys against the union of `types.ts`, `DEFAULT_CONFIG` and the
`view.ts` key tables. 23 unknown keys, **all of them legitimate**: `card_mod` CSS
properties (`animation`, `border`, `overflow`, `float`, `transition`, `width`,
`background`, `display`) and the Lovelace resource `url`. No misspelled card options.
The 23 hits are also the probe's own proof it can return non-zero.

**Both "What's New" surfaces are consistent.** README carries `Latest Release: v4.0` plus
v3.6/v3.5/v3.4 — four entries, matching the retention rule (current major has one minor
line, topped up from the previous major to four). `docs/guide/whats-new.md` carries
`## Latest Release: v4.0` and every prior line back to v2.0. `check:docs` reconciles the
two against `RELEASE_NOTES.md` and passes with "16 release lines documented".

**Warnings for a mistyped `column:` key.** `validateColumnOverrides` produces tailored
diagnostics for four distinct classes of bad key, including a fetch-time key and a
top-level-only key. The strings ship in the production bundle but `CURRENT_LOG_LEVEL` is
pinned to `ERROR`, so they are invisible unless the user opts in via the console. This is
a deliberate, documented trade (`src/utils/logger.ts:22-37`) and the opt-in is advertised
in the release notes as "Diagnosable Released Builds". I flag it only because it is the
mitigation for the whole "silently does nothing" class, and it is opt-in.

---

## One measurement I got wrong, and the correction

My configuration matrix reported that `split_multiday_events: true` behaves differently
in v4: a two-day all-day event rendered as one row on `dev` and two rows on v4. That
looked like either a fix or a regression in list view, and it is neither.

The cause is that both harnesses call `groupEventsByDay` directly. v4 added a
**render-time** split pass inside that function (`src/utils/events.ts:225`) that v3.6.0
does not have; v3.6.0 splits only at fetch time, inside `processRawEvents`, which my
harness never invoked. A real user goes through the fetch path in both versions and sees
the event split in both. The committed list-DOM snapshots confirm it — the
`renders split multi-day events` entry is unchanged between the trees.

This is worth recording because the probe was correct, correctly configured, honestly
reported, and measuring the wrong thing — the exact failure mode
`verification-practices.md` names as #3. What caught it was asking *why* the two disagreed
rather than reporting *that* they did.

---

## A second measurement that nearly became a false alarm

After the fixes, the deploy harness reported the editor failing to open — `Editor dialog
open: false, fields rendered: 0` — where the pre-fix build had reported 144 fields. The
harness's own message said this is "usually edit mode or the click target, not a
regression", which is exactly the kind of reassurance worth distrusting, so I deployed the
pre-fix build back and re-ran: it passed, mine failed. That looked conclusive.

It was not. Both readings depended on `--card N`, an *index into the live dashboard*, and
the shared test tab is disposable and was being rebuilt by another session while I
measured — so the two runs were not opening the same card. Removing the dashboard from the
experiment settled it. Driving `getConfigElement()` directly in the browser returned
`<calendar-card-pro-dev-editor>`, registered, with no page errors; and rendering the editor
against two *fixed* configs gave byte-identical results on both builds:

| | pre-fix `cfa62b3` | after the six fixes |
| --- | --- | --- |
| list config — panels / forms / HTML length | 10 / 11 / 3783 | 10 / 11 / 3783 |
| column config — panels / forms / HTML length | 15 / 16 / 6076 | 15 / 16 / 6076 |

The lesson is the same one as the `split_multiday_events` correction above, arriving from
the opposite direction: there, a probe measured the wrong thing and manufactured a finding;
here, a probe measured a varying input and manufactured a regression. Both were caught by
asking what the probe could not distinguish, rather than by re-running it more carefully.

## Design decisions I would question rather than defects

**A3-C's wholesale fallback is right; the default that makes it invisible is the risk.**
`min_days_to_show` defaults to `days_to_show`, so the staircase has exactly one step
unless a user lowers the floor deliberately. That is a defensible, conservative default —
but it means the most likely first experience of column view on a phone is the card
silently rendering as a list, with the density framework that would have helped never
engaging. The layout-band table in the editor is the mitigation and it is honest; I would
watch the support load on "why is my column card a list" after release.

**The list container is not worth touching — I agree, and the A3-A proof holds.** I
re-derived the `align-self` argument against the current code: `.date-column` does carry
`position: relative` both in the stylesheet and inline on the `<td>` that holds the
`rowspan`, and `.today-indicator-container:not(.inline)` is `position: absolute; height:
100%`. The conclusion that flex/grid `align-self: center` would collapse that to the date
band is correct, and the `today_indicator: false` default is exactly why it would have
survived a screenshot pass.

---

## Left open

**A 1px vertical shift in the list event-weather badge.** The same browser probe that
caught the colour change also shows the badge box growing from 14px to 18px and its glyphs
sitting 1px lower, and the colour fix does not address it. The cause is the new
`.event-weather-text` wrapper: only its *child* span carries `font-size: 12px`, so the
wrapper itself inherits the 14px event font and its line box is taller.

It is left alone deliberately. The row height is unchanged at 18px, so nothing reflows and
no text moves relative to its neighbours — this is a taller invisible box, not a visible
shift of content. The one-line fix is to put the font size on the wrapper rather than on
its child, but that rule is unscoped and would also apply in column view, whose weather
row spacing was tuned live and signed off at `?v=288` (backlog C6). Trading a measured-
but-invisible difference in list view for an unmeasured change to a reviewed column layout
is the wrong way round on the eve of a release.

Reproduce with:

```
event-weather badge, list view, default config
field       dev (v3.6.0)                      v4 (after the colour fix)
 ! badge     [754,6,34,14]                     [754,4,34,18]
 ! glyphs    [769.8,6,18.2,14]                 [769.8,7,18.2,14]
   color     "rgb(114, 114, 114)"              "rgb(114, 114, 114)"
   row       [80,4,721,18]                     [80,4,721,18]
```

## Reproducing this review

Scratch harnesses were written to `/tmp/harness/` and are not committed. The worktree is
clean (`git status --short` → empty). Three temporary comparison worktrees were used and
have been removed; recreate them with:

```bash
git worktree add /tmp/ccp-dev  origin/dev --detach   # v3.6.0, the previous release
git worktree add /tmp/ccp-350  v3.5.0     --detach   # the baseline the notes used to cite
git worktree add /tmp/ccp-base cfa62b3    --detach   # this branch before the six fixes
```

No pull request was opened, no comment posted, and no branch other than this review
worktree's own was touched. The seven fixes are six commits on
`alexpfau-v4-independent-review`, which branches from `feature/column-view-v4` at
`cfa62b3` and is ready to merge back into it.

All eight gates are green after the fixes:

```
npx tsc --noEmit          # clean
npm run lint              # clean
npm test                  # 1029 passed, 34 files
npm run check:i18n        # 0 errors
npm run check:docs        # 0 errors
npm run build && npm run check:bundle
                          # calendar-card-pro.js 188866 B, editor.js 292946 B
```
