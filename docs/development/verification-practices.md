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

**Why re-reading never finds these.** Not one defect recorded in this file was caught by
looking again at the same text — and the reason is structural rather than a lapse in care.
**Re-reading tests a claim against the same model that produced it**, so it can find a
transcription error and never a reasoning one. Every failure below was a reasoning error
wearing correct prose: the sentence was well-formed, the number was real, the command was
right. That is why running something worked, why a second look never did, and why a second
_person_ is a third instrument distinct from both — they bring a different model, which is
the only thing that can disagree.

**But count discriminating power, not agreeing checks.** The eager path being unchanged by
nine languages was reported as _"measured four independent ways"_. It was not: one
counterfactual — empty every translation file, rebuild, compare hashes — plus three
consistency checks that share its mechanism. The ordering is strict:

|                              | catches _the card contains those strings_ | catches _the card contains a derivative_             |
| ---------------------------- | ----------------------------------------- | ---------------------------------------------------- |
| empty-and-rebuild            | yes                                       | **yes**                                              |
| string-presence + control    | yes                                       | no                                                   |
| stability across nine merges | yes                                       | no — observational, confounded by nine other changes |

Anything failing the lower rows fails the top one; the converse is false. So the evidence
was **one dominant measurement**, and the three agreeing checks added confidence without
adding discrimination. **This is the same error as three confident figures on identical
data, in the flattering direction** — and it is harder to notice, because a pile of
agreeing results feels like corroboration rather than like the single result it actually
is. Ask which check could have come back different; that one is the evidence, and the rest
are its consequences.

**Three instruments worked across this whole file; nothing else did.** **Run it** — execute
the claim rather than inspecting the thing that makes it. **Derive it a second way** — a
different route to the same number, where agreement is evidence and disagreement is a
finding either way. **Hand it to someone whose model differs** — the only instrument that
reaches a reasoning error, because it is the only one not built from the reasoning under
test. Every entry below was caught by one of the three, and the ledger runs even between
participants only because of the third.

**And the third instrument works for a reason worth stating, because it is not rigour.** A
second reader is not more careful — several of this file's catches came from someone being
*less* invested and therefore reaching for a different measurement. **They have no stake in
the answer coming back the same, so the check that could disagree is the cheap one for them
and the expensive one for the author.** That is why _"review it again yourself"_ and _"have
someone review it"_ are not degrees of one intervention despite reading as though they are.

The corollary is the practical one: **you do not need the person, you need their
proposition.** Both times someone caught their own work here, a peer's rule was still in
context doing the peer's job. Which is the argument for stating rules as claims with testable
edges rather than as verdicts — a verdict can only be accepted or doubted; a claim with edges
can be probed by the author later, when the author has become a different reader.

**A claim can be true and still be the reason a defect shipped — if its scope was never
stated.** Backlog item Y6 read "the weather custom properties are wired through the
stylesheet", and they were. *For which view* was never asked. Every rule reading the event
badge's size and colour was scoped `.time-location .event-weather`, and only column view
puts the badge in that container, so in list view both options were dead and the badge
inherited the event row at defaults. **The entry that existed to track this documented it
as fixed.**

This is a different failure from the rest of this file. The others are claims that were
false, or checks structurally unable to fail. This one was **true and insufficient**, which
makes re-reading actively counterproductive: a second look confirms the sentence, because
the sentence is correct. It was found by rendering both views and asking which CSS actually
arrives — and only asked because a positive control fired next to the zero and made the zero
mean something. The commit that introduced it says in its own message *"the list view is
frozen"*, so the intent was right and recorded; the mechanism silently did not deliver it.
**When a verdict rests on a mechanism, name the scope the mechanism covers**, or the verdict
outlives the part of it that was ever checked.

**Do not present an unrun check as a result — especially not with plausible output.** While
correcting exactly this failure in others' work, I wrote "the en-GB prediction is run — it
holds" and set out two lines of `ha-selector` output I had not seen. The prediction did hold,
which is not mitigation: had it been wrong, a confident confirmation would have buried it.
Running it immediately afterwards also exposed that I had invented the identifier —
`filter_customized` returned `undefined`; the real key is `customized_only`, found by
enumerating what occurs (`EDITOR_STRINGS` matching `customi[sz]` → exactly two keys) rather
than testing membership of a name I had in mind. **Substance right, identifier invented, and
only running it could tell those apart.** A membership test returns `undefined` and leaves
you guessing which half was wrong.

The reviewer's correction was sharper than my own: two runs of `lookup()` at the source are
**one instrument twice, not two derivations**, so the browser remained the only thing that
could disagree. Surface is not independence. Run in the browser, it held —
`Search Settings` beside `Customised Only`, one falling back and one overridden.

**And match the instrument to the claim.** _"Prefer a test to prose"_ is the wrong _"Prefer a test to prose"_ is the wrong
generalisation. A claim about matching semantics — _does `Vardag` at the head of a label get
caught_ — is mechanically checkable in ten seconds and prose is the wrong instrument for it.
A claim about design intention — _these two checks deliberately share no normaliser_ — has
no ten-second test, and prose is exactly right. The recurring failure is not using prose;
it is **reaching for prose when a test existed**, which is the same error as reaching for a
size comparison when a hash existed.

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

🚨 **And a flattened search is honest only for the continuation style it was built for.**
Checking whether another session's fix had survived a merge, I grepped its error message and
got **0** — then flattened and *still* got 0, with a live control at 16, which felt
authoritative. It was not. My flattener joins **comment** continuations (`* `, `// `); the
message is split by a **string concatenation**:

```js
`${name}: rejected form \`…\` names a language but has no ` +
  'backticked term, so it is silently dropped — …',
```

The phrase spans a `' +` boundary the normaliser knew nothing about. This repo has at least
three continuation styles — markdown wrap, block-comment continuation, and string
concatenation — and flattening for one leaves you exactly as blind to the others as raw
grep, while feeling rigorous. **Two searches, both zero, both wrong, and the second was the
careful one.**

What settled it was neither: planting the violation and reading the exit code. The fix was
live, and the case that had been silent now fails. **Behaviour is the only representation
with no normalisation problem** — which is the argument for reaching for it first when the
question is "did this change arrive", rather than after two searches have failed.

**And there is a third instrument for that question, better than both: provenance.**
`git log -S"<distinctive string>" --all -- <path>` names the commit that introduced the text
currently in the tree. It settled a disagreement where one session's ancestry check said a
commit was merged and another's said it was not:

```bash
git log -S"names a language but has no" --all -- scripts/check-i18n.mjs
#   cd0a7c7 fix(check-i18n): catch a rejected form dropped from inside a Rejected line
```

It answers a different question from `--is-ancestor` — not _is this hash reachable_ but
_where did this content come from_ — so a merge, a squash, a rebase or a stale ref cannot
confuse it. The disagreement turned out to be the **freshness of the ref being compared
against**, not the commit: per-commit checking fixes generalising from one hash, and does
nothing about comparing to a `origin/…` last fetched nine pushes ago.

**Why the guard's own coverage keeps being the thing nobody checks.** Three times in one
evening a documented trap was walked into by the person who had just written the
documentation, twice having fixed the identical defect elsewhere minutes earlier. "Recall at
the moment of use is not a mechanism" is true and incomplete. The better account came from
the session that found the third: **writing a guard means holding the guarded thing in mind,
and the guard's own coverage is a second-order property that never enters that frame.** That
explains why it happens to exactly the people who should be immune, which _be careful_
cannot.

**And this is the limit of _watch it fail_, which is otherwise the strongest rule here.**
Seeing a check go red proves it detects **the case you had in mind**. It says nothing about
the superset the check claims to cover. The fifth defect of the evening was found in a guard
written an hour earlier by an author who *had* watched it fail — on the case they were
thinking of, which was not the case that mattered.

So the honest form is narrower than the slogan, and the narrowness is the content: **each
check here has been watched to fail on the case it was written for.** That is a real
guarantee and a smaller one than "this check works". `watch it fail` and `ask what it matches
a subset of` are therefore not the same rule at two strengths — the first tests the case you
imagined, the second asks what you did not imagine, and only the second could have caught
the two defects that came through this gap tonight.

The habit that follows is mechanical and cheap: **after writing any matcher, ask what it
matches a subset of.** Not "does it work" — it does — but "what is the superset it claims and
does not cover". Two real fixes tonight came from that question and none from re-reading the
code.

**Finally, on the durability of everything in this file.** _"A command with no stated reason
is indistinguishable from ceremony, and ceremony is what gets trimmed. Reasons survive
trimming; instructions don't."_ That is the account of how a `git fetch` fell out of
`AGENTS.md` between edits, and it is the reason this document is instances rather than rules:
**a rule erodes into ceremony and gets deleted; an instance carries its own justification and
resists that.**

**The list of failure dimensions is open — so make the probe name its inputs.** Phrase
search failed **six distinct ways** in a single evening, and this file kept growing a
dimension each time: a phrase wrapped across a block-comment marker; a phrase whose first
letter was capitalised by a sentence start; a phrase split by a `' +` string concatenation;
`grep -oc` saturating at 1 on flattened text; `\|` written inside `grep -E`, where
alternation is `|`, so it searched for a literal pipe; and finally **searching the wrong
artefact entirely** — probing `AGENTS.md` for a passage that a commit had put in this file.

That sixth one is the important one, because the session that hit it **had read the warning
about the previous five an hour earlier and was actively guarding against them.** Enumerating
dimensions does not work: the list is open, and remembering it is exactly the mechanism shown
above not to fire.

What caught it was not vigilance but a **contradiction between two facts already in hand** —
the commit was on the branch, and its content was not in the file searched. Both cannot be
true. So the guard that scales is cheaper than the list:

> **Make the probe state which artefact it read, and cross that against something
> independently known.**

**A stale remote-tracking ref over-reports and can never under-report — so the fetch buys
quiet, not safety.** This was asserted the other way round for most of an evening, including
by me: _fetch first or the number lies_. It does lie, but only in the harmless direction.

A remote-tracking ref advances only on fetch, so a stale tip is always an **ancestor** of the
real one. Commits can therefore only be *added* to the range `origin/x..HEAD`, never removed.
Measured against real history:

```
ref  0 behind -> ahead reads  0        (truth: 0)
ref  1 behind -> ahead reads  1
ref  3 behind -> ahead reads  3
ref 10 behind -> ahead reads 10
```

So **`ahead: 0` is trustworthy even unfetched** — you cannot wrongly conclude that nothing is
outstanding. What a stale ref produces is *phantom* outstanding work, which is exactly the
seven false "needs merging" reports one session sent. The fetch prevents false alarms.

Two boundaries, because the claim is only true inside them. It assumes the remote branch is
**append-only**: a force-push or rewrite breaks the ancestor property and the direction
guarantee with it. And it is about the *ahead* half only — the unpushed half,
`git rev-list --count @{u}..HEAD`, needs no fetch at all, because your own pushes update
`@{u}`. That half is fetch-independent by construction, which matters because unpushed work
is the genuine risk and the ahead count is the noisy one.

**And the sentinel that proves the probe works must be a phrase you have _read_, not one you
expect to be there.** Checking which findings had landed in this file, a session's probe
reported a passage absent. It was present. Its must-find sentinel was a phrase the author
*assumed* the file contained — so the sentinel failed, and by the rule above that means the
probe is wrong rather than the corpus. Re-run with a heading they had actually seen, both
directions passed and the reading inverted.

**An assumed sentinel is not a control; it is a second untested claim wearing one.** The
failure is quiet in the worst way: a control that returns zero looks exactly like a corpus
that lacks the thing, and it arrives attached to a real finding, which lends it credibility.
The bidirectional self-test caught it only because the *other* sentinel — the must-not-find
one — was genuinely absent, so the two disagreed.

**And one more, which is about the shape of the evidence rather than the instrument:
asserting something true and citing a measurement that could not have shown it false.**
Every summary tonight — mine included — closed with _"`dev` and `main` untouched"_ beside
their SHAs. The claim meant **"I never pushed to them"**. A SHA demonstrates **"they have not
changed"**. Those are different propositions, and the second was *false* while the first
stayed true: `dev` moved twice under us, from another session's work.

Citing a SHA reads as more rigorous than writing "I didn't push", and it is **less** — it
cannot distinguish the two claims, and it goes stale on top. The instrument that matches the
claim is ancestry, with a control:

```
40 of my commits   in dev: 0   in main: 0
control be4afc5    in dev: PRESENT   -> the test discriminates
```

The correction demonstrated itself on arrival: the session reporting it cited `dev` at
`be4afc5`, which was **also** stale — `f9db5b1` by then, with `be4afc5` an ancestor. Three
participants, one shape, and the last instance is inside the message identifying it.

The general form is the one worth keeping, because it is not about git: **before citing a
number as evidence, ask which proposition it could have falsified.** If the answer is "not
the one I am making", the number is decoration however carefully it was measured.

**The last variant is the sharpest, because the filter is correct and the number is true.**
Asked whether any of its commits had reached `dev` or `main`, a session filtered the range
with `git log --grep` on its session trailer and got **2**. Honest, and an answer to a
narrower question than the one asked: only two of its commits carried the trailer, so the
rest of the range was invisible to the filter. Reproduced here on the v4 range:

```
commits in origin/dev..HEAD                     326
of those carrying a Copilot-Session trailer     215
```

**A third of the work is outside the filter**, and a `0` computed over the 215 would look
exactly as reassuring as a `0` over all 326. Nothing is broken: the predicate is right, the
count is right, and the corpus was silently narrowed by the tool used to select it.

That is the whole evening in one shape. **Not wrong answers — correct answers to adjacent
questions**, which is precisely why re-reading never caught one: re-reading checks whether
the answer is right, and it always was. `grep -oc` returning `1` is correct *about lines*. A
card reading another session's fixtures shows *real* output. `ahead: 0` against a stale ref is
zero commits *against that ref*. Each is true, and none answers what was asked.

What settled this one was naming the commits and using no pattern at all — the second
derivation, which is the instrument that keeps working after ten variants have exhausted the
first.

**A measurement recorded in the present tense will be wrong; label it as a moment instead.**
A table in the glossary carried a per-language casing percentage under a heading reading
_"mid-string capitals today"_. Every figure in it was stale within a day, and the fix that
suggests itself — re-measure — makes it correct today and wrong again next week. Relabelling
does not.

The same applies to every byte figure in these files. The eager chunk was
`187,554 B / sha256:9d5724…` across all nine editor languages, correctly, and is now
`188,158 B / sha256:4917ba…` because the weather fix, a view-gating fix and the version bump
all touched it. **Neither number is wrong; the first was never a present-tense fact.** State
the commit a figure was taken at, and a reader who needs today's value knows to rebuild
rather than trusting a sentence.

**A byte figure is worth a density figure beside it.** When a size changes, _more content_ is
the reflexive explanation and is often wrong: dividing by character count separates volume
from encoding. Restoring Romanian diacritics moved the card chunk **187,554 → 187,572 B, +18
bytes, with the character count unchanged at 581** — so it was 18 characters each gaining one
UTF-8 byte, a pure substitution, and not a single character of new text. Reported as bytes
alone, +18 invites a content explanation that the density figure refutes in one line. A probe printing `searched AGENTS.md` beside
> `9b57481 touched verification-practices.md` surfaces the contradiction with nobody being
> careful.

`assertFound()` is the same idea one level down — it fails loudly rather than reporting a
clean run over an empty set. **A probe that names its inputs beats a reader who remembers the
list**, and three participants have now demonstrated the remembering approach failing, twice
by the person who had just written the warning down.

**Shared mutable state makes a measurement void without making it look void.** The dev
deploy slot and the live test dashboard are both shared across concurrent sessions, and
three separate failures came from it in one evening: a capture that turned out to have
measured *another session's* bundle; a mutation control confounded because a session
rewrote the test tab mid-run, so 8 cards became 5 and a card's language changed, reading as
a real difference; and — mine — replacing that view wholesale and destroying a fourth
session's test cards without knowing they existed.

None of the three is detectable afterwards. The guards belong **in the probe**: hash the
deployed artefact before *and* after each capture, and key on the card's **title** rather
than its index, so a rewritten tab exits non-zero instead of silently measuring someone
else's cards. That second one is the denominator rule a level up — a denominator proves
cards exist; a title proves they are *yours*.

The general form: **an environment you do not exclusively own is an input to the
measurement, and an unstated input is the one that changes.**

**A passing test whose fixture you did not create is not yet evidence.** Building live test
cards for the weekday-casing fix, I created three multi-day **all-day** events to exercise
`fullDaysOfWeek`. They cannot exercise it: that array is read only by the **timed** multi-day
branch, and the all-day branch renders a bare date — `All day, until Aug 18` — with no
weekday at all. The cards nevertheless showed `Do wtorku` and `Duminică` and looked correct
for hours, because another session had left six *timed* fixtures on the same calendar and my
cards were quietly reading those.

Deleting those fixtures as routine cleanup made three assertions fail at once, which is the
only reason it surfaced. Nothing was wrong with the assertions — they read real, correct
output. **The defect was that the fixture and the assertion were about different things, and
a green result cannot tell those apart.** The card text now records which fixture shape tests
which claim, because the distinction is not visible in the rendered output.

The general form is uncomfortable on a shared instance: **a test can be green because
something else in the environment happens to satisfy it**, and every observable is identical
to a test that works. It is the fixture equivalent of a control that cannot fail. Ask what
supplies the input, not only what asserts on the output.

**A mutation whose effect is _supposed_ to be invisible is a different trap, and a planted
violation cannot save you from it.** Testing a glossary guard, I mutated a rejected form by
**deleting** it when the guard exists to catch **malformation** — an entry the parser drops
because its backticks are gone. The two produce nearly identical diffs and mean opposite
things: deletion is the author changing their mind, which the guard is *correct* to pass in
silence; malformation is the author's intent surviving in a form nothing can read, which it
must catch. **Silence is the right output for one of them, and nothing in the output says
which one you ran.**

That is distinct from the vacuous-mutation family below. Those are mutations with *no*
effect, and a planted violation fixes them. Here the planting is fine — the mutation lands,
the harness's abort-on-no-match confirms the edit happened. What is wrong is that the edit
encodes a **decision** rather than a **malformation**, and no amount of confirming it landed
can tell you that. The check is one level further up: before believing a mutation's silence,
confirm the mutation expresses the failure the guard is *for*.

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

🚨 **Case is a fourth dimension, and it is the one you must not fold blindly.** It is
deliberately absent from the block above. A fragment quoted mid-sentence will not match the
same words at a sentence start, and whether a phrase is capitalised depends on where in a
sentence it lands — which changes when the prose around it is edited. Measured on
`editor-localization.md`, same normaliser, case-folding the only variable:

| fragment                                                                     | as-is       | folded |
| ---------------------------------------------------------------------------- | ----------- | ------ |
| `suspect the reader before the translation` (wrapped, spans a `>` marker)    | found       | found  |
| `none of them is on screen` (source: `… perfect German. **None** of them …`) | **missing** | found  |
| `verify the deployed artefact` (source: `**Verify** the deployed artefact`)  | **missing** | found  |

Note which cases failed: **the hard one passed and the two trivial ones failed.** The
marker-spanning phrase the normaliser was written for matched; two single-line
markup-free fragments did not, purely because they were quoted lower-cased from a commit
message.

**But it must stay a caveat rather than a fifth `.replace()`, because the right answer
depends on the question:**

| question                         | case                                                   |
| -------------------------------- | ------------------------------------------------------ |
| _did this text survive a merge?_ | **fold** — a sentence-initial capital is noise         |
| _is this capitalised correctly?_ | **preserve** — capitalisation is the property measured |

This repo has been bitten in both directions: case-folding hid Polish `Data Początkowa` from
the term check, and case-_sensitivity_ silently missed Swedish `Vardag` at the head of a
label. §7 of the glossary is emphatic that a comparison which normalises away the property
it measures cannot report on it — and putting `.toLowerCase()` into the shared block is
exactly how it would be copied into a terminology check where it is wrong.

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

**Knowing this paragraph exists does not protect you from it.** Verifying a claim about
these two files, I ran `grep -oc` over the flattened corpus and got `1` for each of six
tokens — six confirmations, every one meaningless, because `-c` counts matching _lines_ and
flattening had made the corpus one line. I was searching **this file**, in which the trap is
documented with the exact command above, and `grep -o -c` was one of the very tokens I was
searching for. Nothing about having written or read it helped.

What caught it was the positive control in the same run: the word _verified_ also returned
`1`, and it should return dozens. **The control is a mechanism; documentation is only
knowledge, and knowledge does not fire.** That is the argument for pairing every count with
a control that must exceed one, rather than for writing a better warning — a warning has to
be recalled at the moment of use, and this one was not, by the person who had just read it.

**A control is itself a check, and fails the same way.** Auditing whether the split above
lost any prose, a second session built a sentence-set differential and gave it the obvious
control: delete a sentence, confirm the audit notices. It reported the same count either
way. The victim it had picked **was already absent** — so removing it changed nothing, and
a control that cannot change the answer proves exactly as much as no control at all. On a
baseline that was also wrong (`HEAD~1` rather than the real split parent, 16 sentences
instead of 282), that combination produced a confident false positive: _one sentence lost_,
from an audit structurally unable to report otherwise.

The fix is one word: the victim must be **known-present** before you remove it, which means
confirming its presence is a step, not an assumption. The full sequence there was **broken
baseline → failed control → false positive → resolved**, and the only reason none of it
shipped is that the session treated a non-discriminating control as a defect in the
instrument rather than as a pass.

So the rule has a second half. _Pair every negative with a positive control_ — and then
**check that the control itself can move the result**, because a control is not a different
kind of thing from the check it guards. It is the same kind of thing, one level up, with
the same failure mode and no third level watching it.

**The strongest version of this is elsewhere in this file, and I wrote both halves.** It
records that _a zero-match guard sees total staleness, never partial_. Minutes later I added
`checkAgentsLinks()` to `check-docs.mjs` with a matcher requiring a leading `./`, guarded by
a count that must be non-zero — so a link written `docs/development/x.md` escaped the check
entirely while seven surviving `./` links held the count up and the guard reported a clean
run. Exactly the failure the sentence above it describes, in code, by its author, in the
same hour. A third session found it.

Three instances in one evening, and the interval between stating a rule and violating it
ranged from minutes to none. The conclusion is not that anyone was careless — it is that
**recall at the moment of use is not a mechanism you can rely on, including your own.** What
worked each time was something that ran: a control that had to exceed one, a planted
violation, a second reader. The fix that session added is the right shape — an *invariant*
beside the threshold, asserting every relative link in the file is one the check resolved,
so a coverage hole surfaces as drift between two measures rather than waiting for a broken
link to exist. Its docblock says outright that the invariant is vacuous on today's corpus
and needs a planted violation to discriminate, which is the honest form of a check that
cannot currently fail.

**And a null has a third failure mode, below the pattern: the run may never have happened.**
A zero can mean the thing is genuinely absent, or that the pattern went stale — both are
above. The third is that nothing executed at all, and it is the quietest, because every
observable is identical to a clean run.

Verifying a probe's usage guard, another session ran
`TITLE=… timeout 90 node probe-word-wrap.mjs` and asserted on the **absence** of the usage
message. It printed `guard is transparent ✓`. **`timeout` does not exist on macOS** —
confirmed on this machine, along with `gtimeout`; the shell returns **127** and the command
never runs. The absence being read as evidence was the absence of any execution.

```bash
command -v timeout           # nothing on macOS
timeout 5 echo hi; echo $?   # 127 -- 'hi' never printed
```

The assertion would have passed identically had the probe file been deleted. Their fix was
to assert on **positive markers** that differ per outcome: `::error::TITLE is required` with
exit 2, versus `net::ERR_UNSAFE_PORT` with exit 1 — the latter proving chromium actually
launched and navigated, which no absence could show.

The transferable form is narrower and more useful than _"prefer positive markers"_: **an
assertion on absence is evidence only if the run is independently known to have happened.**
A missing binary is precisely the failure that removes that witness silently. Before
believing a null, ask what would prove the code ran at all — an exit code you predicted, a
line only that path emits, a side effect you can see.

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
