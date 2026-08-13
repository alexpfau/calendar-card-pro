# Verification Practices

Worked instances behind the verification rules in
[`AGENTS.md`](../../AGENTS.md#reference). Every example here is a real failure from this
repository, kept because **a rule without its instance cannot be falsified** — the instance
is what lets the next person settle a doubt in thirty seconds instead of reasoning from
prose.

`AGENTS.md` carries the rules and one falsifier each; this file carries the evidence. If the
two ever disagree, the code decides and both are wrong.

---

## Why _verified_ needs saying

These documents lean hard on the word _verified_ — it appears over a hundred times across
them — so it is worth saying what it has to mean. **A claim that no available case could
have falsified has not been verified; it has been untested**, and "verified, not assumed" is
the label most likely to end up attached to exactly that. The worked example is the Prettier
claim above: every template in the tree at the time round-tripped through `npm run format`
unchanged, so the check passed honestly and the proposition was untestable — the only case
that breaks it did not exist until v4 work created it. The author was not careless; the
claim was unfalsifiable.

So when writing one: say **how** you checked, and prefer a claim that ships with its own
falsifier. _"Delete `leaves.ts:122` and run `npm test`"_ cannot go quietly stale the way
_"prettier does not reformat templates"_ did, because anyone who doubts it can settle it in
thirty seconds.

There is a sharper trap inside that, because a measurement can be precise, honest, and
still incapable of contradicting you. **A metric derived from the fix's own hypothesis
cannot falsify that hypothesis.** The weather-overflow fix is the worked example: the bug
was believed to be _overhang_, so overhang was what got measured, and three successive
versions each drove it down — 113.3px, then 26.6px, then −0.8px — while the row was still
visibly broken. At −0.8px nothing overflowed at all and the browser was severing every chip
mid-token (`30°` / `UV` / `7 · Sonni` / `g`), which is the _same_ defect the maintainer
originally reported. The number confirmed the belief by construction, and only an
observation from outside that frame — a screenshot taken after the number already looked
finished — broke it.

The safeguard is not "measure more carefully", it is **look at the artefact once with the
metric switched off**, and then encode the outside-the-frame observation so it cannot be
lost. `tests/stylesheet.test.ts` does that at the level it can reach — it is a unit test
over the stylesheet source, so it pins the declaration (`content: '\200B'`) rather than the
rendered line boxes, under the name _"gives the browser somewhere legal to break between
chips"_, with the measured failure it prevents written above it. Deleting that declaration
turns it red. Two independent instances landed the same day: the same review then wrote a
chip-integrity probe that reported a confident `FAIL` twice — once counting a zero-width
space's own client rect as a line break, once counting _correct_ word-boundary wrapping as
damage. A probe that cannot tell the good case from the bad one is not evidence in either
direction.

The same day produced the companion rule, from the other direction: **pick the example most
likely to break the claim, not the one most likely to represent it.** A test of the weather
language mapping caught a real error — that `toHaLanguage` is correct but unreachable for
codes outside the card's 35, because `getEffectiveLanguage` resolves them away first — only
because it used `pt-br`. The representative choice, `nl`, would have passed on the spot and
shipped the untested claim. Both of that day's genuine catches were credited by their own
authors to luck rather than method, and neither was — but they are **two disciplines, and
they want applying separately**. This one is about _which case you pick before you look_;
the paragraph above is about _whether you look again once the result already reads as
correct_. Neither substitutes for the other: input selection would not have caught the
overflow, because the number looked finished whatever the input, and a second look would not
have caught the mapping error, because the representative input passes cleanly every time.
All they share is that both feel like luck afterwards, and neither is.

**The sharpest instance of input selection so far is `整天`, and it is worth holding because
the representative case was picked from the right category.** The countdown's word-joiner
rule was justified against Korean and Japanese strings, which the card does not ship — no
`ko.json`, no `ja.json`, so the stated evidence was unreproducible by anyone who read it.
The languages that _do_ ship and _do_ reproduce it are `zh-CN` / `zh-TW`, whose all-day
strings `formatEventTime` composes out of words ending in an ideograph (UAX #14 class ID,
which no rule welds to a following AL, so LB31 permits the break). Measured across 96 rows
at five widths:

|                                        | class | before | after |
| -------------------------------------- | ----- | ------ | ----- |
| `整天, 明天结束` (`format.ts:519`)     | ID    | 16     | 0     |
| `整天, 直到 17. 8月` (`format.ts:529`) | ID    | 36     | 0     |
| `整天` (`format.ts:66`)                | ID    | **0**  | 0     |
| `all day, ends tomorrow`               | AL    | 0      | 0     |

The third row is the lesson. **Same language, same script, same line-break class — and it
never reproduces**, because two characters never make the browser look for a break at that
junction. `整天` is the obvious "representative Chinese case"; picking it would have cleared
the rule and shipped the bug. So "pick the case most likely to break the claim" is not
satisfied by picking the right _language_ or the right _script_ — the property that matters
here is length, and it is one the categories do not expose. When a claim is about layout,
the input has to be long enough to force the layout to make the decision.

There is a **third** failure mode neither discipline reaches, and it is the one that needs
another person. A probe can be correct, correctly configured, honestly reported — and
measuring the wrong thing. Two instances, both from the editor-localization work: a
term-agreement check that case-folded both sides, so a disagreement that was _purely_
capitalisation read as agreement, in the one language whose capitalisation was most wrong;
and a translation-oracle probe that read Home Assistant's core string table while the
vocabulary it needed sat in the lazily-loaded `lovelace` fragment, taking the corpus from
1,889 keys to 7,341. Neither is caught by a self-test, because both reach a known string
fine. Neither is caught by stating the configuration, because both configurations were
stated. **The only thing that caught either was somebody deriving the same number a
different way** — which is why a figure worth relying on should say which corpus and which
method produced it, and why two routes agreeing is worth more than one route being careful.

**But a second person is not always required, and assuming so is expensive.** Where two of
your own measures have a _known relationship_, check that first — it needs no oracle, no
second derivation, and no idea what the right answer is. Measuring how many labels are
Title Case under two strengths of one rule, `EVERY non-initial word capitalised` must be a
subset of `ANY non-initial word capitalised`, so `EVERY ≤ ANY` always. A run reporting
`ANY=21, EVERY=22` is therefore wrong on its face, and it was: the two predicates had
silently drifted to different character classes, `/^[A-Z0-9]/` against `/^[A-Z]/`, so the
digit token in `"ISO 8601"` counted for one measure and not the other. Each predicate reads
as correct in isolation — the defect is that they were meant to be the same rule. Falsifier,
thirty seconds: give the two strengths one shared predicate and the violation disappears;
change one to `/^[A-Z0-9]/` and `"ISO 8601"` brings it back.

That is a different instrument from the three above rather than a fourth instance of them.
Those all needed a second derivation to surface; this one announced itself from a single
run, because the numbers had a relationship to violate. **Prefer measures that can
contradict each other**, and when a run produces several, spend the ten seconds asking what
must be true between them before asking whether any of them matches the world.

**Its domain is narrow, though, and this paragraph is the wrong lesson if that goes
unsaid.** It fires only when you already hold two numbers that _must_ relate. Of the day's
defects it would have caught exactly one: the character class that named two absent glyphs
produced a plausible count, the case-folded oracle produced a plausible agreement rate, the
core-only corpus produced a plausible yield, and the mutation harness produced a plausible
pass. **Nothing internal contradicts any of them**, which is precisely why they needed a
second derivation. So reach for the invariant first because it is cheap, and do not let it
displace the expensive thing — one of five is a good return on ten seconds and a poor
substitute for somebody deriving the number a different way.

And when the check reads a source file, note which question you are asking. **Regex a file
for its _shape_ — which identifier is imported, how a map key is spelled — and import it for
its _values_.** `scripts/check-i18n.mjs` already works this way and says so: the wiring in
`localize.ts` and `dayjs.ts` is matched with patterns because importing them would evaluate
the shape away, while the editor's strings are imported outright "so there is no pattern to
go stale". Counting the keys in `EDITOR_STRINGS` is a question about values, and I answered
it with a regex and reported a number that was wrong by six. The rule existed and did not
fire, because the measurement happened in a shell one-liner rather than in the script that
states it — which is the more useful half of the lesson.

The split is not the whole guard, though, because not every question is shape or values.
**A pattern that finds nothing looks exactly like a fact that is not there.** This file's
own quotations are the demonstration: the sentence quoted above really is in
`check-i18n.mjs`, and a naive search for it says otherwise, because it wraps across two
lines of a block comment with a continuation marker landing in the middle of the phrase.

```bash
grep -c "no pattern to go stale" scripts/check-i18n.mjs              # 0  — reads as absent
perl -0pe 's/\n\s*\*\s*/ /g' scripts/check-i18n.mjs \
  | grep -c "no pattern to go stale"                                  # 1  — actually present
```

Note where the silence actually comes from: `grep` **exits 1** on no match, so a chain that
checks status catches this loudly. It is reading the _count_ that throws the signal away.
That is why the rule below is about the usage rather than the tool — the warning existed and
was discarded, which is a harder habit to see than a missing one.

That matters here more than in most repos: the files worth quoting are largely block-comment
prose, and a wrapped phrase is the common case rather than the exception. `check-i18n.mjs`
carries `assertFound()` for exactly this — it would rather fail loudly than report a clean
run over an empty set — but a shell one-liner has no such thing. So the sharper form of the
rule is **not "avoid regexes" but "do not run one where a zero match cannot announce
itself"**: flatten continuations before matching prose, and when a check finds nothing,
confirm the pattern can match something before believing the absence.

**A zero-match guard sees total staleness, never partial.** The `AGENTS.md` link check shipped
matching only `./`-prefixed links and carried a guard that errors when it finds none — which could
not fire, because seven `./` links kept the count non-zero while a link written `docs/foo.md` went
unresolved. Verified: appending a bad non-`./` link left `check:docs` green, and the same target
with `./` errored either way, so that is the control rather than the test. **The stronger invariant
is a reconciliation, not a count** — every relative link in the file must be one the check
_resolved_, so a pattern that stops matching a subset fails as loudly as one that stops matching
everything.

**Flattening is necessary and not sufficient, because a formatter rewrites more than
whitespace.** Verifying that a merge had preserved another session's paragraphs took three
passes and the first two were confidently wrong: exact-line `grep -F` reported 8 of 39
lines missing (prettier had re-wrapped them), flattening whitespace still reported 8
(prettier had also rewritten `*emphasis*` to `_emphasis_`), and normalising both reported
6 — the true number, all six being text a later commit had deliberately superseded. Each
omitted normalisation produced a _false positive_ that read as lost work, which is the
direction that provokes an unnecessary "restore", so it is worth being exact:

The general rule is to **normalise every dimension the writer does not control** — and
whitespace plus emphasis is not all of them. Use the three-dimension normaliser below
rather than a two-dimension one; **the order in it is load-bearing**, because flattening
first destroys the line boundary the prefix rule needs.

🚨 **A markup-free fragment does not survive reflow either**, which is the tempting
shortcut and is wrong. `suspect the reader before the translation` contains no markup at
all, and a raw search for it in `editor-localization.md` returns **false** — it is present,
wrapped, with the blockquote's `> ` landing between _the_ and _reader_. Measured on that
exact phrase: raw ✗, whitespace+emphasis ✗, prefix→emphasis→flatten ✓, flatten→prefix ✗.
Three of the four ways to ask return the wrong answer.

**A mutation that changes no observable behaviour is evidence about the corpus, not the code.**
Stage 0 wrote two falsifiers for a glossary-parser bug and both reported IMMUNE with the fix
reverted — one mutated a term nothing currently violates, so there was nothing to lose; the
other landed in a neighbouring table rather than the one under test. Both printed clean, and
a reverted fix that still passes reads as "the bug was never real". The working shape is two
steps, and the first is the one that gets skipped: **plant a real violation, confirm it is
caught, and only then mutate.** Verified that way here — with a wrong German term planted,
`check:i18n` raises the warning; bolding the decided cell leaves it raised, which is what
proves the emphasis-stripping fix is live. Without the planted violation both states report
zero and the test is vacuous.

The general form is the positive control from the probe rules, moved one level up: a green
result only means something if you have shown the thing can go red.

**And once you know how to search, the harder question is what for: a withdrawn
_observation_ is cheap, a withdrawn _instruction_ is not.** Annotating the finding is the
easy half. The expensive half is every place it was already turned into a rule, because a
rule is the half that gets acted on. This happened three times in one day, by three
different mechanisms, and the wording never survived intact in any of them:

- **Prose → imperative.** A retracted claim about Swedish weekday casing survived three
  sections away in "Rules a session must follow", in the imperative voice. Two sessions
  were about to lowercase their weekdays on the strength of a note its own author had
  already withdrawn.
- **Prose → parsed table.** The same decision survived again as cells in the glossary's
  casing table, which `check-i18n.mjs` reads. Worth knowing that the question **"does the
  machine read that _field_, or merely that _table_?"** is what sizes the problem: here it
  parsed the table for an unrelated purpose, so the blast radius was documentary. Had the
  cell fed the casing rule, the identical edit would have silently exempted two languages
  from the check that exists to catch the defect.
- **Doc → code.** A paragraph describing the glossary matcher as case-sensitive was
  restored as "lost content" when it was in fact superseded — by a **code** change that had
  made the matcher word-start and case-insensitive. A document-to-document audit is
  structurally blind to this: both documents agreed, and the code disagreed with both.

So when you withdraw a finding, **grep for its consequences rather than its wording**, and
check the other artefact classes: the imperative restatement, the parsed table, the test
that pins it, the code it describes. The falsifier for the last kind is the cheapest — take
the claim the document makes and run it. Restoring that matcher paragraph took one
counter-example to settle: `sv weekday_color := "Vardag färg"` passes under the restored
text and is caught by the code, so the document was describing the defect.

**In Markdown the blockquote marker is a third dimension, and it is the same defect as the
block-comment `*` above.** Verifying that a nine-session merge had preserved every session's
glossary prose, the normaliser here — whitespace plus emphasis — still reported two of
seventeen claims missing. Both were present. `> ` continuation markers sat inside the
phrases, so `It is not one key but six` does not match a source reading
`It is not one key\n> but **six**`. Markdown puts a marker at the head of every wrapped
line of a blockquote exactly as a block comment does, and this file's own prose is largely
inside `>` callouts, so it is the common case rather than the exception:

```js
const norm = (s) =>
  s
    .replace(/^\s*>\s?/gm, ' ') // blockquote continuation
    .replace(/[`*_]/g, '') // code spans and emphasis
    .replace(/\s+/g, ' ');
```

**And a self-test that only checks one direction covers only the failure you thought of.**
The probe that found this carried a sentinel that must _not_ match — good against false
positives, blind to false negatives, which is the direction that actually bit. A search
harness needs both: a phrase known present that must be found, and one known absent that
must not be. Cheapest form is to run it against a phrase you have just read with your own
eyes; if that comes back missing, the normaliser is wrong, not the corpus.

**Three sessions hit this on the same document in one evening**, which makes it a property
of the corpus rather than of any reader — this repo's design docs are largely blockquoted
prose, so a quoted phrase spanning a marker is the common case.

Note which way it failed: two **false positives**, reading as another session's work lost in
a conflict resolution — the direction that provokes an unnecessary "restore", which is the
same asymmetry recorded above. The cheap guard is the one that generalises: **before
believing a phrase is absent, strip every marker a formatter or a container may have
inserted, and prove the probe can still fail** on a phrase you know is not there.

**And once you have flattened, stop counting with `grep -c`.** The two halves of that
advice destroy each other: `-c` reports _matching lines_, flattening produces exactly one
line, so the count saturates at 1 and a duplicated phrase is indistinguishable from a
unique one. This is not hypothetical — it is how the duplicated paragraph directly above
was verified as removed. The count came back 1, which read as _exactly one occurrence,
fix confirmed_, and would have read the same with the duplicate still in place. The fix
happened to be correct; the proof of it was vacuous.

The saturation is total rather than marginal, and `-c` is the wrong tool for counting
occurrences even before you flatten anything. Run this against this file: the flattened
`-c` says **1** where the real count is in the hundreds, and even unflattened `-c`
undercounts, because it is counting lines that contain a match rather than matches.

```bash
perl -0pe 's/\n\s*/ /g' AGENTS.md | grep -o -c 'the'      # 1 — saturated
perl -0pe 's/\n\s*/ /g' AGENTS.md | grep -o 'the' | wc -l # the real number
grep -o -c 'the' AGENTS.md                                # lines, not matches
grep -o 'the' AGENTS.md | wc -l                           # the same real number
```

Deliberately no exact figures there: writing them down changes them, since the sentence
recording the count is itself more text to match. The falsifier that _cannot_ drift is the
one on fixed input, and it is the one to reach for —

```bash
printf 'a a\n' | grep -o -c 'a'         # 1 — wrong
printf 'a a\n' | grep -o 'a' | wc -l    # 2 — right
```

**And the exact inverse of that paragraph is the fourth failure mode: a probe whose own
structure supplies the finding.** A pattern that matches nothing looks like absence; a
pattern that matches can smuggle the answer into the question, and the result is worse,
because it arrives as a _positive claim that looks like evidence_ rather than a null that
looks like a fact. Two instances, from opposite ends of the same day:

- The editor plan's structural-glyph inventory was produced by a regex character class,
  `/[\u00a0\u2265\u2264\u2192\u2014]/`, run over the string table. That asks _which keys
  match any member_. The class's **contents** were then written up as the finding — "the
  table uses these characters" — and two of them occur nowhere in it. Stage 0 nearly
  hardcoded the list into a check that would have guarded two characters that do not exist
  while passing forever.
- A chip-integrity probe reported **73 severed chips**, with `30°` and `15°` among the
  examples, on a row where nothing was severed at all. It counted client rects, and the
  zero-width space added to fix an unrelated bug gives every chip a second rect. The
  instrument guaranteed the answer.

Both were run honestly, both reported a number, and in both the number was a property of
the tool rather than of the code. The guard is the same one the paragraphs above ask for
from the other direction: **before believing a positive result, establish that the probe
could have returned the opposite one.** For a character class, that means enumerating what
actually occurs rather than testing membership of a list you wrote; for a geometric
measurement, it means checking a case you know to be clean and confirming it reads clean.

So: `grep -o … | wc -l`, and prove the counter can exceed 1 before trusting that it
returned 1.

Note the shape, because it is the one this section is least able to warn you about: a
_zero_ is loud once you know to distrust it, and the paragraph above tells you to. A
**one** looks like the answer you wanted.
