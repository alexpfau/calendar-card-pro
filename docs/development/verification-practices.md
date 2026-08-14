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

**A correct, validated, positive-controlled probe can still be the wrong _kind_ of
instrument — and no hardening fixes that.** Every mechanism below is a probe that lied:
saturated, matched a literal pipe, read the wrong artefact, exited 127. This one is
different and sits above all of them.

Two sessions searched a file for a set of phrases, agreed they were absent, and validated
the probe on both sides. The absence was **real**. But the decision resting on it was
whether the *concepts* were already present under different wording — and **a string probe
never addressed that question at all**. Two validated probes agreeing on a string tell you
nothing about a paraphrase.

Note what does *not* rescue it. A better regex finds more strings. `assertFound()` proves
the pattern can match. A positive control proves the probe fires. **All three make a
string probe more reliable at answering a question about strings**, and the question was
about meaning. The instrument was categorically wrong, and every technique in this file
would have hardened it in place.

So before hardening a probe, ask what *kind* of question the decision needs — presence of a
token, presence of a meaning, provenance, behaviour — and check the instrument answers that
kind. When the answer is *meaning*, there may be no mechanical instrument at all, and
editorial judgement is not a weaker substitute for one; it is the only thing in the right
category. Say so, rather than reaching for the probe that can run.

**And the rule has a second half that is easier to break than the first: a wrong-category
instrument cannot _veto_ a conclusion either.** The same session, one paragraph after stating
the rule, withheld a correct editorial argument *because its string probe had found nothing* —
treating the silence of an instrument with no standing as though it were a verdict. The
argument was about whether two sentences do the same work, which is readable, arguable and
settled by looking; it never needed a measurement, and it was right.

That is the under-claiming direction, and it pairs exactly with the selection bias recorded
further down. **Over-claiming from a probe that lied leaves a wrong artefact someone eventually
trips on. Under-claiming from a probe that stayed silent leaves nothing at all** — and *a
correct argument that was never made is indistinguishable from an argument nobody had*. One
failure is eventually discovered by its consequences; the other has none, which is why the
count of it in this file is zero and that zero means nothing.

The compact form: **an instrument in the wrong category can neither license a conclusion nor
forbid one.**

**And this is the one entry in the file that can only arrive by self-report — which is the
honest limit of everything else in it.** Every other finding here was caught by one of three
things: a probe, a control, or a second person reading an artefact. Under-claiming **produces no
artefact**, so none of those three can ever reach it. It gets written down only if whoever did it
volunteers it, unprompted, against their own interest.

So the single entry below is not evidence that the failure is rare. It is evidence of **a
reporting channel that was used once.** A count with a known bias should say which way it leans,
and this one leans all the way: the over-claiming column is populated by instruments, the
under-claiming column by candour alone.

Which is the boundary of the method this file argues for. **Mechanisms replaced memory
everywhere except the one place where nothing but self-report can reach** — and a mechanism
cannot be built for it, because the defect's signature is the absence of any output at all.

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
confuse it. Per-commit checking fixes generalising from one hash, and does
nothing about comparing to a `origin/…` last fetched nine pushes ago — but **that was not
what the disagreement turned out to be**, and an earlier version of this sentence said it
was. The commit had been authored *seconds* before the session measured, and a commit cannot
be contained in a branch tip that predates its own existence. No fetch, however current,
could have returned yes. Ref freshness matters when the answer *could* have changed; it
cannot manufacture one for a commit that did not yet exist.

**And that is why provenance is categorically different from the other two instruments,
rather than merely stronger.** Ancestry and behaviour both ask about *current state*, so both
inherit whatever ref or working tree they are read against. `-S` asks where content came
from — a property of **history**, and history does not move. It cannot be confused by a
merge, a rebase or a stale ref not because it is more careful but because **the question has
no time-varying term in it.**

Which is the general answer to most of this file: **prefer a question whose answer cannot
change while you are asking it.**

**But it searches the lines that changed, so the pattern must name the thing that changed —
not the structure around it.** Checking which commit set the Polish weekdays to their
genitive forms, `-S "fullDaysOfWeek"` returned a commit from years earlier and
`-G "fullDaysOfWeek"` returned three unrelated ones. **Neither found the commit that did
it.** The key name sits on a line that never changed; the *values* changed.
`-S "wtorku"` names it immediately, and a never-present control returns empty.

(`-S` counts occurrences, `-G` matches any diff line; a value edit that alters neither the
count nor the surrounding line is invisible to both.) So provenance is the same trap as
everything else here the moment the pattern is chosen from what you are looking **at**
rather than what you are looking **for** — and this instance is a boundary on advice given
two hours earlier in this same file.

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
> independently known.** A probe printing `searched AGENTS.md` beside
> `9b57481 touched verification-practices.md` surfaces the contradiction with nobody being
> careful.

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
outstanding. What a stale ref produces is *phantom* outstanding
work. The fetch prevents false alarms.

**But the guarantee attaches to the _zero_, not to the number — and an earlier version of
this paragraph did not say so.** Derived by the session whose reports prompted it, then
measured here:

```
stale ancestor  =>  ahead_stale >= ahead_real >= 0
  ahead_stale == 0    =>  ahead_real == 0            proof
  ahead_stale == N>0  =>  ahead_real in [0, N]       upper bound only
```

Measured against a ref held ten commits stale, with the real ref fetched in the same command:

```
ahead vs real ref     0
ahead vs stale ref   10
commits in the stale "ahead" list already integrated:  10 of 10
control: a commit genuinely absent from the real ref   correctly reported absent
```

So *"over-reports, therefore safe"* is sound for the **conclusion** _nothing is outstanding_
and unsound for any use of the **figure**. `ahead: 5` unfetched does not mean five commits
need merging — it means *at most* five, possibly none, and **the accompanying `git log` list
is not a work list**, because every member may already be integrated. Ten of ten were, above.

That distinction is what the seven "needs merging" reports actually were: not a number that
was too big, but a *list* treated as actionable when its contents were already in. Written
down as a rule: **`ahead: 0` needs no fetch; any non-zero figure means nothing until you
fetch.**

**An earlier version of this paragraph blamed a session's repeated "needs merging" reports
on that mechanism. That attribution was wrong, and the real cause is a failure mode this
file did not have.** They pushed a commit and measured immediately, post-fetch: `ahead: 1`.
Correct. I measured after merging it and got `0`. Also correct. The two commits are
**7m31s** apart, verified from the authored timestamps. **Neither of us was stale; `ahead` is
a time-varying quantity and neither report carried a timestamp.**

It happened **twice**, which is what makes it a pattern rather than a collision. The second
time they reported `3 ahead` seconds after authoring `cd0a7c7`; that commit reached the
integration branch **386 seconds** later. And the decisive detail is that they had run *my*
prescription: a post-fetch `--is-ancestor` printed `NOT YET` — a direct observation, not an
inference. **A command cannot be the fix for a disagreement it participates in.**

And the prescription I gave — `--is-ancestor` against a freshly fetched ref — does not fix
it either. That is still a point-in-time measurement: at 23:09 it says *not contained*, at
23:16 it says *contained*, and both are true. **No command can resolve a disagreement about
_when_.** The fix is notational rather than instrumental: *"1 ahead as of 23:09"* and
*"contained as of 23:16"* do not conflict and need no adjudication.

This is a distinct failure from every other entry here. Those are all measurements that were
**wrong**. This is two measurements that were **right**, reading as contradictory because the
dimension separating them was omitted from both — and it produced seven rounds of
adjudication that had nothing to adjudicate.

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
number as evidence, ask which proposition it could have falsified — and whether it will still
be able to falsify it when someone reads it.** If the answer is "not the one I am making",
the number is decoration however carefully it was measured.

**The second clause is not a refinement of the first; it rules out the comfortable fix.** The
session whose stale citation closed the loop above pointed out that its two instances had
*different mechanisms with identical output*: one SHA was genuinely cached for hours, the
other was read from the ref with `ls-remote` **at the moment of sending** and was overtaken
minutes later. So *"read it fresher"* cannot be the remedy — **no measurement of a moving ref
is current by the time anyone reads the sentence containing it.** Their formulation:

> A measurement of something that moves is a timestamp, not a fact.

Which is why the instrument both of us independently landed on is the one that survives:
*"none of my commits are reachable from `dev` or `main`"* does not go stale, because it is a
claim **about my commits**, not about `dev`'s position — `dev` may move however it likes and
the sentence stays true. Same shape as `git log -S` beating ancestry: **choose the phrasing
whose subject is the thing that does not move.** That covers byte-sizes-as-identity, SHAs-as-
non-interference and stale corrections as one defect, and it explains why the fix is a
different instrument rather than more diligence.

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

**Dislocation passes every gate that deletion and malformation would fail.** A string-replace
edit to *this file* split the callout above in two: the rule statement stayed at its anchor,
and its example — `A probe printing \`searched AGENTS.md\` beside …` — was deposited **160 lines
away**, glued to the end of an unrelated paragraph about byte density, trailing two stray `>`
markers.

Nothing caught it. Prettier reformatted it happily, `check:docs` passed, `docs:build` passed,
and VitePress rendered both halves as valid markdown, because **each half is individually
well-formed**. A rule with no example is a normal paragraph. An example with no rule is a
normal paragraph. Only the relation between them was destroyed, and no gate here checks
relations.

That makes it a third failure alongside the two already named. Deletion removes content and
a diff shows it. Malformation breaks syntax and a build catches it. **Dislocation preserves
every byte and every gate stays green** — which is why the defect it produced was, precisely,
_a rule separated from its instance_: the one thing this file exists to prevent, done to this
file, by the person maintaining it.

It was found only because a session asked me to audit tonight's figures for a *different*
defect — missing anchors on byte counts. The figures were fine. Third instance of the same
pattern: **going to check one thing is how the other thing gets found**, and it does not
work if you skip the check because you expect it to pass.

**And it is predictable rather than unlucky, which makes the third row stronger than "no gate
catches it".** Every gate listed validates *fragments independently*: prettier formats a
paragraph, `check:docs` resolves a link, VitePress parses a block. All three ask **is this
piece well-formed**. A rule-and-its-example is a **relation between** pieces, and no amount of
local validity ever sums to a relation — so the empty column is a **category boundary, not a
coverage gap**, and a fourth local gate would move it by nothing. Third instance of the
observation at the top of this file: *more of the wrong category does not help.*

Which also means dislocation is catchable **in principle**, and this repo already owns an
instrument of the right kind. `tests/list-dom.test.ts` serializes the whole rendered tree
(`container.innerHTML`) and pins it with `toMatchSnapshot()` — so a fragment's **position** is
part of what is checked, not merely its validity. That is why a moved node fails it and a
malformed-but-local change is not what it is for. Nobody has pointed a structural oracle at
prose here and this is not a proposal to; the useful part is that *uncatchable* would have been
the wrong note to leave.

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
alone, +18 invites a content explanation that the density figure refutes in one line.

`assertFound()` is the same idea one level down — it fails loudly rather than reporting a
clean run over an empty set. **A probe that names its inputs beats a reader who remembers the
list**, and three participants have now demonstrated the remembering approach failing, twice
by the person who had just written the warning down.

**Not a seventh dimension — a routing failure, which is a different diagnosis with a different
remedy.** The first version of this entry called emphasis-inside-a-phrase a new way for a search
to mislead. It is not new: `AGENTS.md` already prescribes a `norm()` that strips `` ` ``, `*` and
`_`, in a stated order, under **"normalise every dimension the writer does not control"** — and
another session had used that very block, verbatim, earlier the same evening. The tool existed,
was committed, and was not reached for.

Why it was not reached for is the useful part: **the question was framed as _counting tokens_
rather than as _searching prose_, and the framing chose the tooling.** Three tokens returned `1`
and one returned `0` in the same command, so it was not ignorance of emphasis — that line had
already been written down. A token count simply does not feel like a prose search.

The two diagnoses point opposite ways, which is why it matters:

- *open growing list* → learn more dimensions, keep a tally, stay alert — **the approach this
  file already shows does not fire**, since the dimension you hit is never the one you just
  learned.
- *tool exists, was not routed through* → **route every prose question through `norm()`,
  including the ones too small to look like searches.** Mechanical, needs no memory, and it
  predicts the next instance: it will also be somewhere the search does not look like a search.

One part **is** genuinely absent rather than unrouted — `norm()` does not normalise dashes, and
an em dash in the content against a hyphen in the pattern is the same class one character over.
And the ad-hoc replacement written for it got `norm()`'s stated **order** wrong too: flattening
first destroys the line-leading boundary the prefix rule needs. Both are arguments for using the
committed helper rather than improvising one per question.

**Seventh way a phrase search misleads: markdown emphasis markers sit _inside_ the phrase.**
Verifying the entry below, one of four tokens returned `0` — `an observation becomes an
instruction`. The text was present and correct; the source reads `an **observation becomes an
instruction**`, and the literal pattern cannot match across the `**`. The other three tokens
returned `1` and the negative control returned `0`, so **the run looked healthy and one true
statement read as missing.**

Two things make this worth its lines. It was hit **one minute after committing a finding about
verification**, in the verification of that very finding — which is the standing demonstration
that the dimension you are about to hit is never the one you just learned. And it fails in the
*safe* direction only by luck: had the token been one I expected to be absent, the `0` would
have confirmed a false belief.

The remedy is the one already stated for continuations, widened: **normalise the content to
match the question.** Flatten wraps when searching prose; strip `*`, `_` and backticks when
searching a phrase that might carry emphasis; and if a token comes back `0` while its
neighbours come back `1`, suspect the pattern before the text.

**The normaliser is itself a check, and it needs its own control.** Verifying the entry below,
two tokens returned `0`. The first diagnosis was right — em dash in the content, hyphen in the
pattern — so a dash-normalising step went in, and the tokens **still** returned `0`. At that
point the content looked wrong. It was not; the *fix* was broken.

```
printf 'a — b' | perl -0pe    's/[—–]/-/g'   ->  'a --- b'    three hyphens
printf 'a — b' | perl -CSD -0pe 's/[—–]/-/g' ->  'a — b'      no conversion
python3  s.replace('\u2014','-')             ->  'a - b'      correct
```

Without `-CSD`, perl treats the 3-byte UTF-8 em dash as three **bytes** and replaces each one,
so a single dash becomes `---` and the pattern misses by two characters. With `-CSD` it stops
matching altogether. **Both forms fail, in opposite directions, and both produce a plausible
`0`** — indistinguishable from the `0` the previous, correctly-diagnosed cause had produced.

That compounding is the point. A correct diagnosis, a fix that is itself defective, and an
unchanged symptom reads as *the diagnosis was wrong*, which sends the next attempt somewhere
worse. The only thing that separated them was **running the normaliser on a known input** —
`printf 'a — b'` — which is the same `assertFound()` idea applied one level up, to the tool
doing the checking rather than the thing being checked.

Generalised: **every layer between the question and the answer is a check.** The probe, the
normaliser, the control, and the control's control. This file has now recorded a failure at
each of them, and the regress stops in exactly one place — at a layer you have watched fail on
purpose.

**Labelling a claim's evidential standard is not modesty — it is routing.** Two sessions
arrived at the two halves of why it pays, and neither is the reason it is usually given.

*It buys correctability, not correctness.* One session wrote an inference, labelled it, and it
was wrong. The label did not improve the claim — it meant the premise could be corrected in one
line instead of untangled from a conclusion presented as fact. **The label does not change the
claim; it changes what happens to the claim next.**

*And it tells the next person which claims are cheap to attack.* The other supplied a
derivation it had no shell to run, said so, and named the command that would settle it. That
ordering — claim labelled unmeasured, then measured by someone else — is why the confirmation
was **informative rather than ceremonial**: there was no chance of mistaking it for something
already checked, so spending ten seconds on it was obviously worth it. It ran backwards from
every other check in this file, and it is the only one whose value was guaranteed in advance.

Both halves point the same way: an unlabelled claim gets believed or doubted. A labelled one
gets **routed** — to a correction, or to a shell.

**A hedge does not survive restatement, and no new evidence is needed to lose it.** A session
wrote to me *"the removal was **presumably** your release cleanup"* — honest, labelled as
inference, and reasonable. Twenty minutes later its own task summary read *"my worktree was
removed **during the release**"*. Same claim, qualifier gone, now asserted. **Nothing happened
in between.** No probe ran, nothing was searched, no fact arrived; the claim simply firmed up
by being restated in a more formal register. (It was also false — `package.json` on `main`
read `3.5.0`, so nothing had shipped.)

This is not a search failure and does not belong with the ways a pattern can mislead. It sits
one step earlier, at the moment an **observation becomes an instruction**. The asymmetry is
what makes it expensive: a withdrawn observation costs nothing, because the reader was still
deciding — a withdrawn instruction costs whatever was built on it. And summaries are exactly
where observations get promoted, because the register rewards confidence and a qualifier
reads as noise.

The guard is mechanical, like the artefact-naming one, and for the same reason — attention is
not available at the moment of restatement:

> **When restating a claim, carry the qualifier or carry the evidence. If you have neither,
> it was inference, and it belongs in the message rather than the summary.**

**The author supplies the missing piece for free, which is why they cannot see it is
missing.** A session reviewing a shared skill file found the sentence *"A third session (this
one) later replaced the whole view"*. Unambiguous to whoever wrote it; **`(this one)` has no
referent at all** for a reader next month, and none of the three participants who had edited
that file noticed.

That is the same shape as the absence-assertion two entries down, rotated into prose. The
author knows the run happened, so *"no output"* reads as evidence of absence. The author
knows which session, so *"this one"* reads as a reference. **In both cases the missing piece
is supplied silently by the only person who cannot notice it is missing** — which is also why
re-reading fails on both, and why the discriminating instrument is a *different reader* or a
*mechanism*, never a second look.

The practical form: **when writing a claim, ask what it depends on that is not in the text.**
A run having happened, a session being current, a ref not having moved, a corpus not having
been narrowed. Every one of those in this file was true when written and inert to its author.

**"This cannot be checked" is itself a claim, and it is usually a claim about the wrong
thing.** A session whose worktree I deleted reported an unclosable gap: its last
`ahead 0 / unpushed 0` could no longer be re-derived, because *the check that would settle the
question was the thing that was deleted*. Honest, and stated with the right humility.

It was still falsifiable. `git fsck --lost-found` on the surviving common git dir showed **no
dangling commits after their last measurement**, which settles the *committed* half outright —
a different question, bearing on the same worry, reachable from a repository the deletion had
not touched. Their caveat survived only for genuinely uncommitted work, a far smaller unknown
than the one they had declared.

The general form: **an unverifiability claim asserts that no instrument exists, over a space
nobody has enumerated.** It is the one kind of claim that feels maximally epistemically
cautious while actually being maximally strong — and it is the one most likely to stop a
search that would have succeeded. Treat *"there is no way to know"* exactly like any other
assertion: ask what a different question would have to look like to bear on it.

**Containment answers _is this work safe_. Nothing about it answers _is a session live in
that directory_.** Cleaning up after a parallel run, I deleted every branch whose tip was an
ancestor of the integration branch — correct, and reversible even if it had not been — and
removed their worktrees with it. One of those worktrees belonged to a **still-running
session**. Its shell could no longer be created, because a process cannot start in a working
directory that does not exist: `cd /tmp && pwd` failed, git failed, every tool failed. It had
to verify its own work through the GitHub API because the local repository that would have
answered was gone.

I framed this to them as a timing race — right at the moment of deletion, wrong if they had
pushed a minute later. **That is the wrong diagnosis.** A merged branch and a live worktree
are orthogonal properties, not the same fact at two times. Containment was true and stayed
true; it simply never spoke to the question that mattered.

```bash
git worktree list      # the "has anyone taken this" check for filesystem state
```

It costs nothing and would have said so outright. **Deleting a merged ref is harmless and
undoable; deleting a live worktree terminates a running session's ability to act.** Those
two are not degrees of one operation.

The sharpest part is what cannot be recovered. Their last measurement was `ahead 0, unpushed
0`, and I confirmed afterwards that all four of their commits are reachable and nothing was
orphaned. But **uncommitted work leaves no trace**, and the index that would have answered
was inside the deleted directory. *The check that would settle the question is the thing that
was deleted* — which is a worse position than a lost commit, because a lost commit is at
least knowable.

**Ancestry, provenance and content are three different instruments, and none subsumes the
others.** A session asking *is my work in `dev`* reached for content-existence; I had reached
for `git log -S`; a third had used `--is-ancestor`. All three of us believed we were asking
one question.

| instrument | asks | blind to |
|---|---|---|
| `merge-base --is-ancestor` | is this **hash** reachable | squash-merge, rebase, stale ref |
| `git log -S` | where did this **content** come from | nothing — history does not move |
| `git ls-tree` | does the **artefact** exist here | who put it there, and whether it is current |

**But pick by the repo's merge style, not by the table alone.** The session's stated reason for
distrusting ancestry was that a squash-merge produces a new hash, so `--is-ancestor` answers
*no* while the work sits in the tree. True in general, and **false here**: this repo merges
with merge commits — 60 of the last 60 on `dev` — so ancestry is sound, and measured against
`editor-glossary.md` the two instruments agreed in both directions, with a control on a file
that *is* present.

So the table is a guide to which question you are asking, not a licence to distrust the
cheapest instrument. A true general caution applied where its precondition does not hold is
the same defect as any other adjacent-question answer — it just happens to be conservative.

**And a conservative one is not merely invisible; it is selected for.** The session that made
this error put the sharper version: reaching for the stronger instrument **reads as rigour**,
so review rewards it, and nobody asks whether the precondition held. The careless version gets
caught and recorded. The over-careful version gets praised. So the ledger of these defects does
not just undercount — **it undercounts systematically, in the direction that feels best**, and
every list of them (including this one) is biased toward the errors that produced a wrong
answer rather than a needlessly expensive right one.

Note also that their claim failed the file's own standard in a specific way: *content beats
ancestry* was stated without its precondition, and **a rule with its precondition attached is
testable** — *"content beats ancestry where the remote squashes"* is falsified in ten seconds
by counting merge commits. Unqualified, it can only be believed or doubted. Same defect as Y6's
_"wired through the stylesheet"_: true, unfalsifiable, and silently scoped.

**`cmd && { ...; } || echo "not a repo"` reports the failure of the _last_ command in the
block, not the first.** Checking a directory with `cd X && { git status; grep -n "six rules" f; } ||
echo "X is not a repo"` printed **`X is not a repo`** — while `git status` in the same block had
just printed a clean working tree. The `grep` found nothing, exited 1, and `||` attached to the
whole chain. The message named the wrong subject entirely, and it named it *confidently*.

This is the same family as `grep -oc` saturating, but the mechanism is different and worth
separating: there the count discarded a signal, here the **`||` branch attributes one
command's failure to another**. Ask the question directly — `git rev-parse
--is-inside-work-tree` — rather than inferring it from whether a chain survived.

**The artefact-naming rule earns its keep only when the probe _succeeds_.** A session whose
directory had been deleted found that *every* command failed, including `echo` — and that is
the **easy** case, because it fails loudly and cannot be mistaken for a result. The dangerous
version is the probe that starts, reads something, and reports honestly about the wrong
thing: the same session, an hour earlier, had searched `AGENTS.md` for a passage a commit had
put in this file, and got a clean, confident, wrong answer.

So *"make the probe state which artefact it read"* is aimed at the successful run. **A failed
probe needs no help.** Which also means a session that has lost its shell entirely is in a
*better* epistemic position than one whose probe merely pointed somewhere unexpected — four
sessions verified their own work through the GitHub API tonight, and that route was strictly
more reliable for the question they were asking, because comparing content at a public ref
does not depend on any local tree being in a particular state.

**A harness failure is legible as a finding about the subject.** A session whose working
directory had been deleted ran `ls -d …/calendar-card-pro`, saw it fail, and briefly read
that as *the repository is gone*. It never ran — the shell could not establish a cwd. Same
shape as `timeout` returning 127: **the error was about the instrument, not about the thing
asked.** Both times the output was indistinguishable from a real negative finding.

Worth knowing concretely, since it is survivable: with the cwd gone, `bash`, `glob` and
`grep` all fail (ripgrep inherits the cwd), while `view` and `edit` keep working because they
take absolute paths. A session in that state can still read and write, and can verify from
the remote API — which is how two of them closed out.

**And the follow-up failure was worse than the original: I verified the reported instance
and not the class.** When the first session told me its worktree was gone, I confirmed *its*
work was safe, wrote the lesson above, and stopped. A **second** session then told me the
same thing. I never checked how many of the thirty-one worktrees I removed had live sessions
in them, because the question I was answering — *is this branch's work contained?* — has no
bearing on it.

That is the same shape as everything else in this file, committed while writing this file:
**a correct answer to an adjacent question**, followed by treating one confirmed instance as
the extent of the problem. The instance is evidence that the class exists; it is never
evidence of the class's size. After finding one, the next step is to enumerate the
population, not to record the lesson and move on.

**And the question that mattered was not "how many sessions" but "was anything lost" — a
different question with a different instrument and a better answer.** The session that supplied
the enumeration probe then supplied its successor: `workspace.yaml` records `branch:` beside
`cwd:`, so each affected session can be asked whether its branch reached the remote. They
specified **two** controls, and insisted on the negative one — *run it against an invented
branch name and confirm it reports AT RISK* — because "all safe" is otherwise
indistinguishable from `ls-remote` failing for every input.

Both controls passed. Seven branches were on origin, eight were not. **But eight was
over-reported**, because ~40 merged branches had been deleted in the same sweep, and a branch
that was pushed, merged and pruned looks identical to one never pushed. The follow-up probe —
searching merge-commit messages for the branch name — then **failed its own control**: a
branch known to be merged produced no match.

So the name-based instruments were abandoned for one that asks about **objects**:

```
git fsck --unreachable            356 unreachable commits, 135 from today
  copilot checkpoint: …            76   session infrastructure
  WIP/index/untracked on <branch>  58   stash triples, ~19 stashes
  other                             1   a throwaway probe commit
spot-check: 3 of 3 readable, showing real diffs (8, 38 and 48 changed lines)
```

**Nothing was lost.** Unreachable is not deleted — every one of those objects is still readable
today and will be until a `git gc` prunes them. The conclusion is therefore not *"9 sessions
unknown"* but *"no work is gone, and there is an open recovery window"*, which is both a better
answer and a **different question** from the one three successive probes were pointed at.

Worth noting what got it there: two instruments were discarded **because their controls failed**,
not because their answers looked wrong. The branch-name probe returned a plausible eight and the
merge-message probe returned plausible blanks; only the controls distinguished those from
findings.

**The count I twice declared unknowable was recoverable, and it was 2.5x what I reported.**
I wrote *"I still cannot enumerate which of the thirty-one had live sessions"* — in the same
document as the rule that an unverifiability claim asserts no instrument exists over a space
nobody has enumerated. An affected session, with no shell, pointed out that **session state
does not live in the worktree**: `~/.copilot/session-state/<id>/workspace.yaml` records the
`cwd`, and it survives the directory's deletion. The probe is one loop, and they shipped it
with a positive control — **their own session**, a known live-session-with-deleted-worktree,
which any correct run must flag.

```
workspace.yaml scanned                                   550
cwd no longer exists (all time)                          203
   ...restricted to tonight's window                      15   <- the answer
control: the reporting session appears                   yes ✓
```

**Six told me. Fifteen were hit.** Nine sessions had their working directory removed and
never said so, and I reported "six" to the maintainer as though it were the total — because
six was the number that had *arrived*, and nothing distinguishes a complete count from the
subset that happened to report. The `inuse.<pid>.lock` signal does not close the remaining
gap: 8 of the 15 carry one, but so do 2 of 2 surviving recent sessions, so it does not
discriminate live from finished at this sample size. **How many of the nine were live is
still open — but it is open at 9, not at 31, and the number is bounded rather than absent.**

Which makes this the file's own rule, applied to the file's own author, twice in one hour:
the first unverifiability claim was closed by `git fsck`, this one by a directory the
deletion could not reach. Both times the instrument was cheap, present, and simply never
looked for — because *"I cannot know that"* ends a search, and that is what it is for.

**And the mechanism is not carelessness — it is diligence pointed one level too low.** One of
the affected sessions put it exactly: *a report is a sample, and the instinct to verify a
report is precisely what stops you enumerating the population.* Confirming the reported case
is the responsible move, it succeeds, it consumes the attention, and it returns a reassuring
answer — after which nothing in the situation asks the second question, **because an incident
presents itself as an incident.** In the end six sessions were affected and I learned the
count only by being told five more times.

`git worktree list` would have cost nothing and was available throughout. So the failure was
not a missing capability but **a missing prompt** — which is the shape shared by every
integration and coverage gap recorded here. It is also the strongest evidence in this file
for its own thesis: the lesson from the first report was **already written down, by me, in
this document**, and it did not fire. Knowledge does not fire. Mechanisms do.

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
