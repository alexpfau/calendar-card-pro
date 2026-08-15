# Column view — rationale and superseded alternatives

This file archives the revision history, rejected alternatives, and source-verified reasoning
removed from the current column-view specification. It is for audit and context only.

**The spec in [column-view.md](./column-view.md) is authoritative where the two files
disagree.**

> **[v15] Two density keys were renamed, and the new names were substituted into the entries
> below.** `min_column_width_px` → `min_day_width`, and `min_width_fallback` →
> `min_days_fallback`. Entries here that discuss those keys therefore read with names that did
> not yet exist when the entry was written. This is the one case where archived text is
> rewritten rather than annotated: a rename changes no ruling, and leaving the old spelling in
> place would make the corpus un-greppable and imply two distinct keys once existed. Nothing
> had shipped, so no migration exists. See A3-F in the spec for the full record.

> **[v14] One archived constraint no longer holds.** Several entries below (A3-B-3, D2,
> G-section) warn that the `editor` translation section is **all-or-nothing** — that a
> partially translated section defeats `hasEditorTranslations()` and renders every missing
> key as its raw name in the UI, so new editor keys must go into all 11 editor languages or
> none. That hazard has been removed, and the mechanism it described is gone entirely: the
> editor's strings moved to `src/rendering/editor/translations/`, where `lookup()` resolves
> each key on its own, falling back requested language → English. A partial translation is
> safe to ship. The entries are left unedited as a record of what was true when they were
> written; see _Adding or changing a translation_ in `AGENTS.md` for current behaviour.

The archived sections below mirror the pre-split document so a reader can jump directly to
the rationale for a spec section without reading this file linearly.

---

## Archived V8 Rationale Snapshot

**Status:** planning complete, no code written. **Target release:** v4.0.0.

**Scope:** a second view (`view: 'column'`) that renders the existing agenda list rotated —
days side by side as columns rather than stacked — without changing how the list view looks
for anyone who does not opt in.

This is a working engineering document, not user documentation. It records the decisions,
their reasoning, and the phased sequence that keeps the existing view safe. It supersedes the
earlier `column-view-phase1-design.md` draft.

## Revision history

- **v1** — first full plan.
- **v2 / v3** — two independent structured reviews with disjoint scopes (design/config;
  structure/risk) were run against v1, then again against v3. Every claim marked CONFIRMED in
  this document was verified against source rather than accepted from the review. v3 also
  folded in five maintainer corrections, the load-bearing one being that _"no impact on list
  view"_ means **no visible change for users**, not no code change.
- **v4** — folds in the second-pass reviews and **reverses v3's headline decision.** v3 read
  the relaxed constraint as licence to rewrite the list day block from `<table>` to flex so a
  single `DayBlock` served both views. That was an over-correction: the drift it was meant to
  prevent lives in **leaves**, not containers, so the rewrite bought nothing that leaf
  extraction does not — while putting every existing user at pixel-regression risk. Phase 1
  returns to extraction (A3-A), which makes the no-visible-change constraint hold **by
  construction** and restores a hard automated gate. Three further v4 changes: the per-entity
  compact cap must **not** rotate (A3-D), the override taxonomy needs a **fourth kind** (D5),
  and the narrow-screen view switch has a **severe editor-preview defect** that must be fixed
  (A3-C.4). `show_empty_days` is resolved as an **auto sentinel** (`null` / `true` / `false`
  select) rather than a bare per-view default, because a flat key plus a two-state switch
  makes "auto" unreachable (A3-B-3); that fix is generalised into D5 kind 1 so it cannot
  recur on the next key.
- **v5 — correctness pass.** A third review was run **cold**: the reviewer was given the repo,
  this file path and four questions, and nothing else — no summary, no list of contested or
  reversed decisions, no statement of what the author expected. Its claims were then verified
  against source before being acted on. v5 folds in the surviving findings plus an
  executability read-back (can this plan be _followed_, as distinct from is it _right_).
  Four substantive changes: **phase 3 is folded into phase 4** (C); the Phase 0 Stage 2
  determinism gate now **names a clock strategy** (fake timers); **A3-B-3's consumer
  enumeration was incomplete and is corrected**, which turns out to hide a shippable defect;
  and **every citation in the document has been re-based against `origin/dev`**, with each
  section now stating which tree it was verified against. See F6 — the reason all four were
  needed is one root cause, and the document had already noticed it once without generalising.
- **v6 — implementation pass.** The first revision written **while building** rather than
  while reviewing, so its corrections come from code that now exists. Phase 0 Stage 0 is
  **shipped** (`scripts/check-i18n.mjs`, `npm run check:i18n`, CI step) — and building it
  proved the plan's own spec for it wrong: the stated rule would have **rejected `en-gb`** and
  failed CI on day one, and the "~50 lines" estimate was ~6× low. Six further corrections were
  verified against source and applied: `compact_events_complete_days` was documented
  **backwards** (it _includes_ whole days and can exceed the cap, rather than dropping them);
  four citation ranges had drifted again (`render.ts:83→86`, `renderDateColumn :622→:611`,
  `parseIndicatorPosition :390→:382`, `AGENTS.md:82-127→:119-163`); the `cross-env` advice was
  moot (it is already a devDependency used by `build`); and "conflict-heavy **rebase**" is
  replaced by "manual port", because that word must not sit beside a frozen branch whose
  commits must survive as ancestors to preserve attribution. Two scope findings are recorded
  where the work happens rather than resolved: **Phase 2b is under-scoped** (five
  `_matchedConfig` consumers, not one) and **Stage 2's "hard gate" has no executable design**.
  Four Phase 4 blockers are recorded in **G10–G13** — `effectiveView` vs `requestedView`,
  flex-vs-grid, compact-mode MVP scope, and the measurement spike — deliberately **left open**,
  because they are architectural decisions for the maintainer, not implementation details.
  **Stage 1 is also shipped** (`tests/`, `npm test`, CI step, 55 tests), and it found a live
  crash while being written: `normalizeEntities` threw on a null entry, which a bare `-` in
  YAML produces, taking down `setConfig` and rendering a red error box instead of the card.
  That is the strongest available evidence for Phase 0's premise — lint, `tsc` and the build
  were all green on it, because the value enters as untyped YAML at the one boundary the type
  system does not cross.
- **v7 — Phase 0 complete.** Stage 2 is **shipped** (PR #390): the list-view DOM equality
  gate that Phase 1's entire safety argument rests on. v6 recorded that the "hard gate" had
  no executable design; all five gaps are now closed and the answers are in Stage 2. The one
  that changed the design most: the gate does **not** construct the card element. The pipeline
  it renders — `groupEventsByDay` → `renderGroupedEvents` → Lit — is exactly what `render()`
  does for the populated case, and those pure functions _are_ the surface Phase 1 touches, so
  driving them directly is both simpler and more targeted than mocking `hass`, `callApi` and an
  async fetch. The gate was **mutation-tested before being called a gate**, against the
  specific failure mode of a snapshot that captures an empty card and passes regardless: three
  realistic extract-a-renderer mistakes each fail 10 of 11 tests. v6's fake-timer strategy is
  confirmed rather than merely proposed, with zero production changes as predicted. **F2's
  "goldens as a review artifact" is now resolved, not just flagged** — the gate exists, so F2
  is wrong rather than stale, and its clause is corrected in place. Phase 0 is complete:
  all three stages shipped, 66 tests **at that point**, and the production bundle grew by
  **exactly 3 bytes** —
  `t&&`, the null guard from PR #389. Measured, not assumed: reverting that one file and
  rebuilding gives 347940 bytes (`686eaa59…`) against 347943 (`30f7b8ec…`). Every other part
  of Phase 0 — the tests, the i18n script, the CI steps, the `tsconfig` widening — is
  bundle-neutral, which is the property that let a test suite be added to a project whose
  stated reason for having none is bundle size. **A gap in the gate was then found and closed
  (PR #390), which is why the count above is 70 rather than 66.** The gate passed no weather
  forecasts, leaving Phase 1's _first_ extraction — the weather block — entirely uncovered
  while every assertion still passed. The general lesson is recorded in Stage 2: mutation
  testing proves the tests you have are load bearing, but says nothing about a branch no
  fixture reaches, so render-surface coverage has to be argued separately from assertion
  sensitivity. Auditing for the same shape then found three more (PR #390, final count
  **73**), including `parseIndicatorPosition` — a second of Phase 1's four named extraction
  targets left entirely uncovered. All four holes were the same structural fault:
  **default-off options are invisible to a suite built from default config**, no matter how
  sensitive its assertions are. That rule, and the gate's explicit boundary, are in Stage 2.
- **v8 — design pass.** Two changes, both structural rather than corrective. First, this
  document **split in two**: `column-view.md` is now a ~770-line current-state spec, and this
  file is the archived rationale. The v5–v7 passes had grown the single file to 1,756 lines, at
  which point it was simultaneously the thing you read to implement and the thing you read to
  understand _why_ — and the implementation half was buried. The split is lossless: verified by
  a punctuation-insensitive word-set diff showing **zero words removed**, with A3-A's
  `date_vertical_alignment` → `align-self` analysis confirmed byte-identical (both extracts
  sha256 `a01c6a905b0439a4`). Ten commit-SHA citations were replaced with PR references in the
  same pass — the SHAs resolved locally but were reachable only from session-internal
  checkpoint refs, so they were dead for every other reader; `git cat-file -t` succeeding does
  not make a SHA citable. Second, **D6 adds the `column:` per-view override block**, raised by
  the maintainer and reframing the config question from _"what does this key mean in column
  view?"_ to _"is there one value a user would want in both views at once?"_ — a stronger test,
  forced by `view: auto` making one card instance render both. That **removes D5's kind 4**,
  which was the double-meaning trap with help text attached, and dissolves G12's internal
  contradiction as a side effect. The supporting per-key audit was run by a subagent
  deliberately denied the shortlist already formed in discussion, and **converged 6/6** on the
  highest-concern keys while adding four findings that had been missed — including that
  `first_day_of_week` and `weather.position` are **fetch-time**, so G10 forbids overriding
  them, and the shallow-merge semantics of `setConfig` — which turn out to constrain how the
  override block must resolve inheritance.

Changes from v3 are marked **[v4]**; changes from v4 are marked **[v5]**; changes from v5 are
marked **[v6]**; changes from v6 are marked **[v7]**; changes from v7 are marked **[v8]**.

> **[v5] Which tree a citation refers to.** This plan was drafted while the author's worktree
> sat on the frozen #339 branch (decision 9), so a large number of `file.ts:NNN` references
> were taken from **that** tree. `dev` and the frozen branch have diverged, non-uniformly, and
> in places structurally: **`time-grid` does not exist on `dev` at all** — no `view` config key,
> no `grid.ts`, no `render-grid.ts`, no controllers, and zero `!== 'time-grid'` editor gates.
> Every section below now carries a **Verified against** line. Unless a line says otherwise,
> line numbers are `origin/dev` at `29b8226` and can be checked directly. Citations that exist
> only on the frozen branch are labelled inline as **[frozen]** and must not be looked for on
> `dev`.

---

## A. Decisions ledger

### A1. Approved by maintainer

| #   | Decision                                                                               | Note                                                                                                                                                                                                                                                                                                                                          |
| --- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | View name is **`column`**                                                              | `view: 'list' \| 'column'`                                                                                                                                                                                                                                                                                                                    |
| 2   | **`navigation_days` is deleted**, folded into `days_to_show`                           | Not renamed — removed                                                                                                                                                                                                                                                                                                                         |
| 3   | Column-view MVP excludes overlap lanes, time axis, now-line                            | Those are time-grid's                                                                                                                                                                                                                                                                                                                         |
| 4   | **Date at the top** of each column                                                     | Confirmed sound: list's date column is `day_font_size × 1.75` = 45.5px (`styles.ts:46`) + padding ≈ 43–50% of a 128px column. **[v5]** The arithmetic is unchanged and still correct; the 128px comparator is superseded by decision 14's provisional 160px, which makes the ratio ≈ 34–39% — the conclusion holds more comfortably, not less |
| 5   | **Header rule is fully configurable** — width, colour                                  | Reverses my "start closed" proposal                                                                                                                                                                                                                                                                                                           |
| 6   | Between-day chrome rotates 90°; within-day chrome untouched                            | The organising thesis                                                                                                                                                                                                                                                                                                                         |
| 7   | `date_vertical_alignment` **ignored** in column view                                   | Naming harmonisation with a future `date_horizontal_alignment` explicitly out of scope now                                                                                                                                                                                                                                                    |
| 8   | **[v4 — RE-REPLACED]** Phase 1 is **shared leaf extraction**; list keeps its `<table>` | v2 said extraction (right scope, wrong reason: I thought list markup was frozen). v3 said table→flex axis refactor (wrong scope: over-corrected on learning it wasn't). v4 returns to extraction on the correct reason — the drift lives in leaves, not containers. See A3-A / C-Phase 1                                                      |
| 9   | #339 branch is **frozen**, not rebased                                                 | lenaxia's 4 commits preserved as ancestors for attribution                                                                                                                                                                                                                                                                                    |
| 10  | Feature milestone is **v4.0.0**                                                        | See G5 — a choice, not a semver requirement                                                                                                                                                                                                                                                                                                   |

### A2. Previously open — now resolved **[v3]**

| #       | Resolution                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 11 + 12 | **Merged into one design: the view itself falls back to list below a width threshold.** Not column-count clamping. See A3-C.                                                                                                                                                                                                                                                                                                                                                                                                         | You flagged that 11 and 12 described the same issue. They did.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 13      | **[v4] Approved in principle, but re-scoped** — a DOM snapshot cannot gate the Phase 1 refactor, because the DOM is now _allowed_ to change. See A3-A and the new section C0. **[v5] Corrected:** this row was missed by the v4 pass and read as though the gate had become manual. It has not. The automated gate is **retained and tightened**, and it is the _list_ DOM that must be byte-identical across Phase 1 — see **Phase 0 Stage 2**, which owns it. **[v7] Shipped (PR #390) and mutation-tested — the gate now exists** | **[v5]** The _visual_ check in Home Assistant covers the **column** view, which has no baseline to be identical to. It does **not** replace the automated list-DOM gate; the two cover different things and both are required before Phase 1 merges                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 14      | **Approved:** "fully flexible here, let's try out once we have a first implementation." Measure `min_day_width` in Phase 4.                                                                                                                                                                                                                                                                                                                                                                                                          | **[v5] A provisional value is now fixed so Phase 4 is buildable: `min_day_width = 160`.** This is a **starting point, not a result** — it is to be measured and revised in Phase 4, and the plan is not "correct" until it has been. It is not a free choice, however: (a) **128 is disproven**, not neutral — the narrow-column analysis below showed titles wrapping badly at that width, so the inherited #339 default must not ship unchanged; (b) `atomic-calendar-revive` ships `min-width: 150px` on its Planner columns, which is the only real-world number available and brackets the answer from below; (c) 160 leaves the decision-4 date-header arithmetic at ≈ 34–39% of column width rather than 43–50%, which is the margin the header band needs for weather (D2). **[v4] Two facts still bank before measuring:** the number does **double duty** — usable column-width floor _and_ the multiplier in A3-C's view-switch threshold — so a wrong value produces two _aligned_ bad outcomes (cramped columns that also fail to trigger the list fallback) |

---

## A3. Maintainer corrections **[v3]**

### A3-A. "No impact on list view" = no _visible_ change, not no code change

**Verified against:** `origin/dev` @ `29b8226`, except the three grid opacity values, which are
**[frozen]** — `styles.ts` on `dev` is 703 lines and has no grid section at all.

> _"what we do in code is our thing, and we are free to do what's needed. our final
> architecture should be optimized to cover both views."_

This removes the constraint decision 8 was built on. The consequences are large enough that
the phasing was reconsidered from scratch rather than patched.

**What I found when I actually checked the markup, rather than assuming:**

The seam is already much further along than v2 assumed.

- `.content-container` (`render.ts:86` **[v6 — was `:83`]**) holds day-blocks and separators as **siblings**. The
  card-level axis flip is a _container_ change, not a restructure.
- Each day is **already one self-contained node** — `<table class="day-table">`
  (`render.ts:678-692`). The day boundary is already in the right place for a shared
  component.

So the only genuinely axis-bound part is the day's **internals**: `rowspan`
(`render.ts:930`) welds the date cell to the left edge and cannot produce a date-on-top
variant.

**Where #339's duplication actually came from.** [v4 — corrected] v3 said the rowspan table
_forced_ the duplication. That is wrong, and the distinction changes the phasing. The drift
#339 exhibits is entirely in **leaves**, not containers — three different past-event opacities
for one concept (`styles.ts:487-488` list `0.6`; `:986-987` grid `0.55` **[frozen]**;
`:1061-1062` grid all-day `0.55` **[frozen]**). The grid re-implemented the _leaf_ renderers.
It did not have to: every leaf the shared block needs is already DOM-agnostic —
`.event-content` (`render.ts:942-1003`), `renderDateColumn` (`:490-611`), colour precedence
(`:497-516`). A flex grid container could have consumed those leaves unchanged. The rowspan
blocked reuse of the **container**, and container reuse is not what prevents drift. **Sharing
the leaves is.**

**Therefore: list keeps its table.** [v4 — REVERSES v3's headline change]

v3 proposed converting list's day block from `<table>` to flex so a single flip-able
`DayBlock` served both views. That was an over-correction, and I am reversing it:

- The two goals v3 fused are separable. _Kill the drift_ → extract shared **leaf** renderers.
  _Serve both views_ → give column its **own** flex container consuming those leaves.
- List needs date-on-**left**. Only column needs date-on-**top**. So only column needs the
  non-table container; list never has to change.
- Parallel containers over shared leaves is **exactly the `ViewAdapter.render` shape** the
  adapter work wants. **[v5]** That work was phase 3 and is now **folded into phase 4** — see
  section C. By Phase 5 there are three renderers anyway (table list / flex column / grid).
  Forcing two of them to share one flip-able DOM is _less_ consistent with the adapter, not
  more.
- The risk asymmetry is the decisive part. Rewriting list's container puts **100% of existing
  users** at pixel-regression risk to serve a view they do not use, gated only by human
  screenshot comparison. Leaf extraction leaves the list container untouched, which satisfies
  the no-visible-change constraint **by construction rather than by probability** — and
  restores a hard automated gate (list DOM must be byte-identical; see Phase 0).
- The relaxed constraint (A3-A) _permits_ code change; it is not a mandate to change the list
  renderer, and should not be spent where it buys nothing.

**The concrete proof that unification was riskier than v3 priced it.** v3 claimed
`date_vertical_alignment`'s `vertical-align` maps to `align-self`, "equivalent". **It does
not,** and the failure is invisible to a template diff:

- `.date-column` is `position: relative` (`styles.ts:317`, reinforced by an inline
  `style="position: relative;"` on the `<td>` itself at `render.ts:931`);
  `.today-indicator-container` is `position: absolute; height: 100%` (`styles.ts:332-340`).
  Under `rowspan` (`render.ts:926-937`) that `100%` resolves against the **full stacked height
  of the day**, so with the default `today_indicator_position: '15% 50%'` the indicator centres
  over the whole day block.
- In flex, `align-self: center` overrides `align-items: stretch` and **shrinks the item to
  content height** — collapsing `height: 100%` to roughly one line of date text. The indicator
  would snap from the full day to the ~50px date band.
- The correct mapping is two-part: keep the date column `align-self: stretch` and move its
  _content_ with `justify-content` on an inner flex column. v3's one-line mapping was wrong.

Blast radius is bounded (`today_indicator` defaults `false`, `config.ts:61`), so this would
have hit only opted-in users on multi-event days — which is precisely the kind of defect that
survives a screenshot pass. It is retained here as the worked example of why the list
container is not worth touching. **[v5] This analysis is load-bearing and must survive any
future restructuring of this document intact:** it is the only worked proof in the plan that a
human screenshot pass does not catch this class of bug, and the `false` default is exactly why
it would go unnoticed.

**Target structure — one flip, not two:**

```
.content-container   flex-direction: column (list)  |  row (column view)
list day block       unchanged <table> + rowspan     (date on left)
column day block     new flex container              (date on top)
both                 consume the SAME leaf renderers
```

Carry-overs that still apply, to the **column** container only:

- `.date-column` fixed width → `flex: 0 0 <width>`.
- Events pane → `flex: 1` **plus `min-width: 0`**. Without it long titles won't let the pane
  shrink; `table-layout: fixed` (`styles.ts:287-296`, property at `:290`) handles this
  implicitly today. Still the classic flex trap, now confined to new code.
- The week-number separator (`<table class="week-row-table">`, `render.ts:246-312`; the
  `<table>` itself is emitted at `:289`) stays as-is for list; column defers week numbers
  entirely (D5).

### A3-B. `show_empty_days` — my "force it on" was wrong

**Verified against:** `origin/dev` @ `29b8226`. **[v5]** This section's citations were already
`dev`-based and survive re-verification almost unchanged — see F6 for why that is significant
rather than incidental.

`days_to_show` bounds a **calendar-day window**
(`events.ts:1287-1293`; hard post-filter `:71-92`). `show_empty_days: false` (the default)
then **filters empty days out of the rendered set** (`:393-398`) — rendering already expects
gaps (`render.ts:725-727`). With `true`, missing days are generated (`:505-545`, `:561-598`,
the placeholder itself carrying `_isEmptyDay: true` at `:586`).

So in column view the key selects between two different products:

| Value             | Column view means                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| `false` (default) | **Dense agenda columns.** One column per day-with-events; columns may be **non-contiguous** (Mon, Thu, next Tue). |
| `true`            | **Stable week grid.** `days_to_show` contiguous columns regardless of content.                                    |

**Resolution: do not force. Support both, default unchanged.** Forcing `true` would silently
change what `days_to_show` means for anyone switching an existing card, and would spray empty
columns across a light calendar — the opposite of the density motivating #263.

Consequence not to miss: with `false`, the column _count_ varies as events change, so under
`flex: 1` column widths visibly shift between glances. Fix in CSS with a `max-width` guard,
**not** in config — one meaning per key.

Also confirmed and to be preserved: `hide_when_empty` deliberately counts events **as if
expanded** (`calendar-card-pro.ts:236-239`) so `compact_events_to_show: 0` cannot hide a card
that could then never be tapped open; and _a placeholder is not content_ (`:243-251`). Empty
**columns** must not count as content either.

### A3-B-2. …and the column _default_ — the argument **[v4]**

Not forcing was right. What the second-pass critique surfaced is that I then left the
**default** unexamined, and I had already built the machinery to change it (D5 kind 1,
per-view default, user-overridable) before declining to use it on the key where it matters
most.

**The argument for flipping the default to `true` in column view:**

- **Spatial adjacency implies temporal contiguity.** In a list, skipped days are invisible —
  each row is labelled and you read top-to-bottom, so nothing suggests Tuesday should have
  been between them. In columns, Mon | Thu | next-Tue sitting side by side _reads_ as a broken
  week. The plan mitigates width _jitter_ (the `max-width` guard) and gives gap _legibility_
  nothing.
- **"Days side-by-side" evokes a grid.** The stable Mon–Sun week is what most people picture,
  and dense mode stays one toggle away.
- **There is no back-compat cost.** `view: column` is new; no existing card can be affected by
  its default. This is the cleanest possible moment to choose, and the argument that stopped me
  forcing it (silently redefining `days_to_show` for existing cards) does not apply to a
  per-view default at all.

**The argument for keeping the flat `false`:**

- It maximises density, which is #263's actual motivation.
- One default across views is simpler to explain and to hold in mind.
- If kept, non-contiguity needs a **real affordance** — a wider gutter at a skipped-day
  boundary, or a marker — not just the width guard. Shipping non-contiguous-by-default with no
  legibility signal is the one outcome to avoid.

**My own counterweight, which the critique did not price:** the column header shows weekday
_and_ date (D2). So non-contiguity is **detectable**, not invisible — a user reading "Mon 3 /
Thu 6" has the information. The risk is real but smaller than "looks broken".

### A3-B-3. RULED: `true` for column — but a bare per-view default is a trap **[v4]**

**Ruling:** column defaults to showing empty days. **The objection that reshaped it, which the
first draft had missed:** a bare per-view default breaks down the moment the user touches the
control.

**The trap.** `show_empty_days` is one flat key. If column merely _defaults_ differently, then
as soon as a user sets it — for any reason, in either view — that single value applies to both.
And because the editor renders it as a **switch**, there is no way back: a switch has two
positions, so "unset / auto" is unreachable once written. The user must open YAML and delete
the line.

**And the responsive fallback makes this certain, not hypothetical.** A3-C means a column card
_is_ a list card below the threshold. Column and list are not alternative configurations a
user picks between — they are **the same card at two widths**, and essentially every column
user is also a list user on their phone. So a per-view default collision is not an edge case
for view-switchers; it is guaranteed for everyone.

**Fix: give the key an explicit auto sentinel and render it as a select.**

| Stored value             | Meaning             | List view       | Column view     |
| ------------------------ | ------------------- | --------------- | --------------- |
| `null` **(new default)** | **Auto — per view** | hide empty days | show empty days |
| `true`                   | Always show         | show            | show            |
| `false`                  | Never show          | hide            | hide            |

**Back-compat, corrected. [v5] — the v4 enumeration was incomplete, and the gap hides a
shippable defect.**

This paragraph carried the document's only _"verified against `origin/dev`"_ stamp, and it is
the one that was wrong. It listed three consumers and concluded the change was free. There is a
**fourth**, and it is not the same kind of consumer as the other three.

**The three rendering consumers behave as claimed.** `events.ts:394`
(`if (!config.show_empty_days)`), `:488`, `:520` are genuine _truthiness_ checks, so `null` is
falsy and behaves **identically to `false`** in every existing render path. That much survives.

**The fourth consumer is `editor.ts:899-900`, and it is a compound gate, not a truthiness
check:**

```ts
this.getConfigValue('show_empty_days', false) || !this.getConfigValue('hide_when_empty', false);
```

Two things follow that the v4 text missed:

1. **It supplies its own hardcoded `false`.** `getConfigValue` resolves
   `this._config[path] ?? defaultValue` (`editor.ts:230`), so this call site reaches its own
   literal `false` whenever the key is unset — making it a **second source of truth for the
   default**, independent of `DEFAULT_CONFIG`. Flipping `DEFAULT_CONFIG.show_empty_days` to
   `null` does **not** flip this. The two sources then disagree.
2. **Therefore the claim "zero call-site changes" is deleted.** It was false. `editor.ts` is
   touched by this change regardless — and separately, `addBooleanField('show_empty_days')` at
   `editor.ts:896` is itself the switch that becomes the tri-state select, so the file is in
   scope twice over.

**The defect this ships if left alone.** Take `hide_when_empty: true` with `show_empty_days`
unset (`null`, the new default) in **column** view:

- Rendering resolves `null` → auto → **column shows empty days**, and consumes
  `empty_day_text` at `events.ts:501`.
- The editor gate evaluates `false || !true` → **`false`**, and hides the `empty_day_text`
  field.

So the card renders a string the user cannot see a control for. This is not a cosmetic
mismatch; it is the editor actively concealing the only field governing visible output.

**The fix, specified.** The gate must ask the _resolved_ question, not the raw one. Introduce
the same resolution the renderer uses — auto resolves per view — and gate on that:

```ts
// editor.ts, replacing the raw getConfigValue call in the empty-day-text gate
const emptyDaysResolved = resolveShowEmptyDays(this._config); // null → per-view default
… emptyDaysResolved || !this.getConfigValue('hide_when_empty', false) …
```

`resolveShowEmptyDays` is the same helper D5 kind 1 already requires for the renderer; the
editor must import it rather than re-deriving the default. **Acceptance:** with
`hide_when_empty: true` and `show_empty_days` unset, the `empty_day_text` field is visible in
column view and hidden in list view, matching what each actually renders.

**The type still widens:** `show_empty_days: boolean` → `boolean | null` (`types.ts:22`).

**Why this one mattered out of proportion to its size.** It is the single claim in the plan
stamped as source-verified, and it is the one with the incomplete enumeration. Three consumers
were found by searching `events.ts`; the fourth lives in `editor.ts` and answers a different
question. A grep scoped to where the author expected the answer to be will confirm a hypothesis
without testing it. See F6.

**The editor pattern already exists.** `show_week_numbers` is exactly this shape — default
`null` (`config.ts:48`), rendered via `addSelectField` with a `'null'` **string** option
(`editor.ts:1109-1113`), converted back to real `null` in `_valueChanged`
(`:588-591`) and `_selectChanged` (`:660`). We add `show_empty_days` to that same special-case
branch. No new machinery.

**Cost, stated honestly:** the control changes from a switch to a 3-option select for
_everyone_, including list-only users. That is an editor change, not a card-rendering change,
so it does not violate A3-A — but it is visible, and it is the price of a reachable "auto".
Use the select in **both** views, not a switch in list and a select in column: the trap is
symmetric, and a list user toggling the switch would otherwise silently pin column behaviour
too.

**Labels:** `Automatic`, `Always show`, `Never show` — with per-view help text (D5 kind 4)
under `Automatic` spelling out what it resolves to in the current view. Three new translation
keys across all **11** editor languages **[v5 — was 10]**. Of the 35 language files, 11 carry
an `editor` section (`AGENTS.md:127`); the other 24 omit it entirely and fall back to English,
which is supported. **Carry the warning across:** `hasEditorTranslations()` returns true when
the section has _one or more_ keys, so a **partially** translated `editor` section defeats the
fallback — every key you fail to add renders as the **raw key name** in the UI, not as English.
Add all three keys to all 11, or none.

**Consequence for the gap affordance:** with `Automatic` giving contiguous columns by default,
a skipped-day marker is no longer owed in Phase 4. It becomes optional polish for people who
deliberately choose `Never show`.

### A3-C. Narrow screens — view fallback, not column clamping

**Verified against:** `origin/dev` @ `29b8226`. **[v5]** No `src/` citations in this section —
it is design reasoning. The modal-width figures remain unverified against a running HA, as
stated below.

> _"users can set a screen width above which column [view] would be active, and underneath
> list view would be shown."_

Adopted; supersedes both 11 and 12. It is better _and_ simpler than clamping: list view is
already designed for narrow screens, whereas two cramped columns is a compromise nobody
asked for. It also makes `ResponsiveColumnsController` unnecessary — a width observer
picking a renderer replaces it.

Default threshold is computable, not magic:

```
min_day_width × days_to_show  +  card padding  +  (days_to_show − 1) × gutter
```

Rule the user can hold in their head: **above the threshold you get the columns you asked
for; below it you get list.** No silent day-dropping.

Three risks to design against:

1. **Oscillation.** Switching view changes card height → may add/remove a dashboard
   scrollbar → changes width → switches back. Needs hysteresis (separate up/down
   thresholds), not a single breakpoint.
2. **HA masonry/sections quantise column widths**, so the observed width jumps in steps
   rather than sweeping. Test at real HA layout widths, not by dragging a browser.
3. **Both renderers must be live** in the same bundle — no lazy loading under the one-file
   rollup constraint.

**Two further failure modes, and the first is severe.** [v4]

**4. The editor preview will show LIST for most column configs — MANDATORY to fix.** HA's
card-edit dialog renders its live preview in a narrow modal (roughly 400–560px on desktop,
narrower on mobile). The threshold above is ≈900px for a 7-day column card and ≈420px+ for
3 days. So the preview sits **below** the threshold and renders **list** while the user is
configuring **column** — they set column-only keys and never see them take effect. This
breaks the primary tool for building the feature, and clamping never had it (a clamped column
is still a column).

> **[v5] These threshold figures move with decision 14.** The ≈900px / ≈420px numbers were
> computed from the disproven 128px floor. At the provisional **160px** the same formula gives
> ≈**1120px + padding + gutters** for 7 days and ≈**480px+** for 3. Recompute them when the
> measured value lands in Phase 4. **The direction of the inequality does not change** — raising
> the floor pushes the threshold _further above_ the modal width, so failure mode 4 gets
> strictly worse, not better, and the mitigation below becomes more necessary rather than less.

_Mitigation, non-negotiable and cheap:_ **the editor preview must render the selected view
regardless of measured width.** Decouple preview rendering from the responsive switch. Verify
the actual modal width in HA early in Phase 4 — the exact numbers above come from review and
are unverified against a running instance, but the direction of the inequality is not in doubt.

**5. The same YAML becomes two products by viewport, with keys silently inert.** Below the
threshold the list path runs, so every column-only key (`day_header_separator_*`, the
per-column compact rotation, the column gutter) is dead and every list-only behaviour (global
compact budget, `week-row-table` separators) is live — with no signal. A user debugging "my
header separator doesn't show" may simply be 20px under.

_Disposition:_ accepted cost, mitigated by documentation and by the D5 kind-4 help text
naming which view each key is live in. **I am not reverting to clamping**, and the critique's
recommendation to reconsider it is declined on this ground: clamping bottoms out at **one
column = one day**, which is strictly less useful on a phone than a list of `days_to_show`
days. The fallback is the better narrow-screen answer; it just needs the preview fixed and the
key liveness documented.

### A3-D. Compact mode in column view — the rotation is correct

**Verified against:** `origin/dev` @ `29b8226`. **[v5]** The `events.ts` budget citations
(`:409-475`, `:413-441`, `:350-391`) re-verify **exact**. Two citations in this section were
stale and are corrected inline below.

> _"couldnt there also be a compact mode in column view, in which `compact_events_to_show`
> limits the number of events per day…?"_

**I was wrong to call this degenerate.** The reasoning:

- **List:** card height ≈ **Σ** events → capping the sum caps the height → _global_ budget.
- **Column:** card height ≈ **max** over columns → capping the max caps the height →
  _per-column_ budget.

Same user-level meaning — _"how tall is the card when collapsed"_ — rotated through a
different height function. That is decision 6 (the organising thesis) applied to the height
budget. The key keeps **one** meaning; only the mechanism differs, which is exactly what a
ViewAdapter is for.

**The rotation applies to the GLOBAL budget only.** [v4] The critique caught me extending it
too far, and it was right; see the per-entity bullet below.

Caveats, all manageable:

- The current mechanism **is** global — one `totalEventsShown` counter (`events.ts:409-475`),
  `break` at the budget, silent `slice`. So this is **new per-day code in the adapter, not
  key reuse**. That is the real cost, and it is small.
- `compact_events_complete_days` is **inapplicable** per-column. [v4 — reason corrected]
  v3 justified this with "there is no partial-day problem once each column has its own
  budget", which is **backwards**: a per-column cap _does_ truncate days. The correct reason
  is that `complete_days` is a **cross-day inclusion filter under a shared budget**
  (`events.ts:413-441`). A per-column budget has no shared pool and makes no day-inclusion
  decision — every column renders. There is nothing for it to decide. Ignore + annotate.
  _The reason matters:_ on the v3 phrasing a future reader could "restore" the key on a
  false premise.

  > **[v6] What that filter actually does, corrected against source.** Both v3 and v4
  > described it as "drops whole days that would not fit so the last day is never cut off".
  > It does the opposite: the first pass marks a day _started_ if **even one** of its events
  > fits the remaining budget, and the second pass then keeps the **entire** day unfiltered
  > (`filteredDays = days.filter(day => daysStarted.has(dayKey))`, `events.ts:435-440`). So it
  > **includes every complete day reached before the budget was exhausted, and can exceed the
  > configured maximum.** The conclusion above is unaffected — it is still a cross-day
  > inclusion filter with no per-column meaning — but anyone reasoning about the event cap
  > from the old description would have the sign wrong.

- `compact_days_to_show` maps to **fewer columns** when collapsed. Coherent.
- **Per-entity `compact_events_to_show` must NOT be re-based per column.** [v4 — REVERSED]
  v3 said it "must be re-based per column". That is wrong, and it is the one place the
  rotation changes user semantics rather than preserving them.
  - _Mechanism, verified:_ `entityConfigEventCounts` is created at `events.ts:354`
    **[v5 — was `:340`]**, **before** the `for (const day of days)` loop at `:356`
    **[v5 — was `:342`]**, and accumulates across the whole window.
  - _Why it must not rotate:_ the per-entity cap is a **temporal** cap — "show the **next 1**
    bin collection / next 1 birthday" — not a height cap. Re-basing it per column turns
    "next 1 birthday" into "1 birthday **per column**", i.e. up to `days_to_show` birthdays.
    Nobody asked for that.
  - _Why no height framing rescues it:_ the global key bounds card height, so Σ→max is a
    genuine rotation of one meaning. The per-entity key bounds **nothing** about height, so
    there is no invariant to preserve. The symmetry is a global-budget symmetry.
  - _Disposition:_ leave per-entity as a global temporal cap in **both** views. It is pure
    data (`events.ts:350-391`), view-independent, and already correct. This is **less** code
    than re-basing.
- Expand is already tap/hold (`calendar-card-pro.ts:660` hold, `:663` and `:704` tap, both
  calling `toggleExpanded()` at `:862-866`) **[v5 — was `:539,542,583,729`, which on `dev` are
  the weather-subscription and cache-key paths, not the interaction handlers]**, so "on click we
  toggle" needs no new interaction.

**The residual cost — a view-switch surprise that must be surfaced, not hidden.** [v4]
Same data, same `compact_events_to_show: 3`: list shows 3 events _total_; column shows up to
3 × `days_to_show`. That is correct under a **height-space** mental model ("keep my card
short") and surprising under a **data-space** one ("hide all but 3 of my events"). Both
models are real. The height-space reading is the one that justifies the rotation, so the key
becomes a **kind-4 override** (D5) and carries per-view editor help text saying what it caps
in each view. Silence here would be the failure mode.

This may make a separate `max_events_per_column` key **unnecessary** _for the collapsed-height
job_. [v4 — narrowed] It does **not** make it unnecessary outright: compact is an
**expandable** cap (tap to reveal all), whereas a hard cap is **permanent** truncation for a
kiosk/at-a-glance card with no interaction. Different questions. Defer it — do not conclude
it is never needed.

### A3-E. Separator defaults — two different mechanisms

**Verified against:** `origin/dev` @ `29b8226`. **[v5]** The `SEPARATOR_SPACING` finding below
— including the comment/value mismatch — re-verifies **exact** and is unchanged.

> _"i like the proposal to default all separator widths to 0px … this is what you meant,
> right?"_

Partly — and the distinction matters.

- **Widths already default `0px` today** (`config.ts:53` day, `:55` week, `:57` month
  **[v5 — was `:51-56`]**). Rotating the rules is a visual no-op out of the box. No decision
  needed.
- **What you described — extra horizontal space at a month break — is the _spacing
  multiplier_** (`SEPARATOR_SPACING`: week `1×`, month `1.5×`, `constants.ts:87-92`). In list
  it is margin above/below the rule. A uniform CSS `column-gap` **cannot** vary one gutter.

**Resolution:**

1. List keeps its derived multipliers **unchanged** — invisible to users, honours A3-A's
   _visible_-change constraint.
2. Column-view MVP drops multipliers; documented, not silent.
3. An **explicit opt-in gutter key defaulting `0px`** is added later, implemented with spacer
   tracks. Additive, non-breaking.

Optional and defaulting to `0px` is the right shape; it is a _new_ key rather than the
existing widths.

_(Fix in passing: `constants.ts:90` comment says "2x day_spacing"; the value on `:91` is
`1.5`.)_

---

## B. The header divider — concrete spec

**Verified against:** `origin/dev` @ `29b8226`.

### B1. Naming: `day_header_separator_width` / `day_header_separator_color`

House pattern is `{scope}_separator_{width,color}` — width and colour only, no style key
(all three existing separators hardcode `solid`). This follows it exactly. Reviewed and
confirmed SOUND: semantic, view-neutral, consistent with the `DEPRECATED_CONFIG_MAP`
precedent.

**Why not anything containing "horizontal":** this codebase already made and corrected that
mistake. `DEPRECATED_CONFIG_MAP` (`editor.ts:67-72` **[v5 — was `:71-72`]**; consumed at
`:381` and `:453`) records `horizontal_line_width` →
`day_separator_width` — an _appearance_ name replaced by a _semantic_ one. Appearance names
are exactly what break when a layout rotates, which is the subject of this plan.

**Why not reuse `day_separator_*`:** that key means _between days_ and under decision 6
rotates to the vertical rule between columns. The header rule is a new element — inside a
day, between its header and its events.

### B2. Defaults — two deliberate deviations, both signed off

```
day_header_separator_width: '1px'                  // family default is '0px'
day_header_separator_color: 'var(--divider-color)' // family uses text-colour tokens
```

**Deviation 1 — visible by default.** CONFIRMED SAFE: this is a _within-column_ element that
exists only in column view, so it cannot affect list view and does not violate the
zero-impact constraint. The other three separators default `0px` because they are optional
emphasis; this one is structural — it tells the eye where a header ends and events begin.

**Deviation 2 — a non-text colour token. [CHANGED: now an explicit sign-off, not a
recommendation.]** `var(--divider-color)` appears **nowhere in the codebase today**
(confirmed 0 matches). The existing family is text tokens plus accent-at-alpha — note
`#03a9f450` is `accent_color` at 50-alpha, so the family already encodes brand through the
accent.

I still recommend `--divider-color`: it is HA's semantic token for exactly this, is
theme-aware, and sits below text tokens in contrast — appropriate for chrome drawn once per
column. Using accent-at-alpha instead would make the header rule look like a week separator
and destroy that marker's meaning.

**But it introduces a new token family for one key.** Both choices are defensible; the point
of recording it here is that it is a _conscious_ deviation, so nobody later "fixes" it as an
inconsistency. Alternative: `var(--secondary-text-color)`, matching `day_separator_color` —
heavier, and seven at once will read as a lot of grey. A `_style` key can be added later,
non-breaking.

### B3. Editor

Follows the established separator block pattern (`editor.ts:1155-1197`, the `day_separator`
block **[v5 — was `:1205-1248`, which on `dev` straddles the week/month blocks]**; `week` at
`:1199-1241` and `month` at `:1243+` repeat it): a toggle writing
`1px`/`0px`, revealing width and colour when enabled. Only difference: the toggle starts
**on**.

New editor translation keys, in all files carrying an `editor` section (**11** of 35
**[v5 — was 10]**, per `AGENTS.md:127`):
`day_header_separator`, `show_day_header_separator`, `day_header_separator_width`,
`day_header_separator_color`. **All four keys into all 11 files, or none** — a partially
translated `editor` section defeats `hasEditorTranslations()` and renders the missing keys as
**raw key names**, not as English.

---

## C. Phases **[v5 — Phase 3 folded into Phase 4]**

**Verified against:** `origin/dev` @ `29b8226`.

Phases 0–2b are **refactors that ship in ordinary 3.x releases**. This is the load-bearing
property of the plan: they merge into `dev` continuously, so **`dev` drift stops being a
problem**. Only phases 4–5 need a long-lived branch.

> **[v5] Phase 3 no longer exists as a separate phase. Its work moves into Phase 4.**
>
> Phase 3 was "build the `ViewAdapter` abstraction", scheduled to ship in 3.x _before_ the
> second view existed. That was wrong for two reasons:
>
> 1. **You cannot see the seam with one implementation.** An adapter designed against list
>    alone encodes list's shape as though it were the general shape. The abstraction gets
>    built correctly while building the second view, not before it — so it is now part of
>    Phase 4, developed against two concrete implementations at once.
> 2. **It made a speculative 3.x deliverable, and it created the exact coupling the phasing
>    existed to prevent.** A `ViewAdapter` shipped in 3.x has to guess at the discriminator
>    set, and the only other consumer that would validate those guesses is the time grid —
>    Phase 5. So Phase 3 had a _de facto_ dependency on a phase three steps later. Folding it
>    into Phase 4 removes both the speculation and the inverted dependency.
>
> **The conformance gate does not move.** It stays where it is — immediately before Phase 5 —
> because its job is to check that the _shipped_ 3.x refactors are faithful, and that job is
> unchanged by where the adapter gets built.
>
> Phase numbering is left alone: there is no Phase 3, and Phase 4 keeps its number. Renumbering
> would invalidate every "Phase 4"/"Phase 5" reference in the issues and in the frozen branch's
> commit messages for no gain.

**What changed from v2 and why.** v2's Phase 1 extracted leaf renderers and touched no markup,
because I believed the list DOM was frozen. v3, on learning it wasn't, replaced that with a
table→flex rewrite of the list day block. **v4 reverses back to extraction** (A3-A): the
rewrite put every existing user at pixel-regression risk to buy a unified `DayBlock` that was
never required to prevent the drift motivating it. v2's scope was right; v2's _reasoning_ was
wrong, and v3 corrected the reasoning by over-correcting the scope. Phase 0 still comes first,
but it is now a cheap gate on a low-risk step rather than a net under a risky one.

### Phase 0 — safety net · ships 3.x · risk: none **[v3 — NEW]**

**Stage 0 — i18n integrity. Zero dependencies. Do this regardless of everything else.**
✅ **SHIPPED** as `scripts/check-i18n.mjs` + `npm run check:i18n` + a CI step. This exact class
of bug has now bitten **twice during this work** and once in the comparable card (ACR PR
#1812, a whole missing `planner` section in `es.json`). `AGENTS.md:119-163`
**[v6 — was `:82-123`, which points at the README section]** documents it as the single most
error-prone area of the codebase. It was the cheapest high-value thing on this entire plan.

> **[v6] Two corrections this stage forced, recorded because the plan was wrong, not just thin.**
>
> 1. **The rule as written was incorrect.** "Every `TRANSLATIONS` key has a matching dayjs
>    import and `supportedLocales` entry" **rejects `en-gb`**, which legitimately has neither
>    because `mapLocale()` reduces it to `en` (`dayjs.ts:66-118`). Implemented as specified it
>    would have failed on `dev` on day one. The shipped script replicates `mapLocale()` and
>    reads the `zh-cn`/`zh-tw` special cases _out of_ `dayjs.ts`, so it tracks that function
>    rather than becoming a second stale source of truth.
> 2. **"~50 lines" was ~6× low** — the real trap list needs ~330 with docs. Every source
>    extraction is guarded so that a pattern matching nothing exits 2 with "the script needs
>    updating": a regex that silently matched nothing would report a clean run over an empty
>    set, which is the one outcome worse than a false alarm.
>
> Verified against 11 deliberately broken fixtures, including the Catalan/Romanian silent
> `supportedLocales` fallback and the regex-rot guard. Reports one pre-existing warning:
> `image_label_note` and `start_date` are defined in `en.json` but never referenced.

**Stage 1 — pure-logic tests. [v5 — three deliverables, not four.]** `vitest` as a
devDependency, **3** files: translation parity, the `getBaseCacheKey` bug (Phase 2b), config
validation/change-detection.

✅ **SHIPPED** as `tests/` + `npm test` + a CI step, in two commits: the crash fix below, then
the suite. 55 tests across three files — `config.test.ts` (`toValidNumber`,
`normalizeNumericOptions`, `normalizeEntities`, `hasConfigChanged`), `translations.test.ts`
(runtime resolution, editor fallback, per-language relative times), and `environment.test.ts`
(a UTC guard, added while verifying that `test.env.TZ` actually takes effect — it does, but
only as a behaviour of the runner, so it is now asserted rather than assumed).

> **[v6] Stage 1 paid for itself before it was finished: it found a live crash.**
> `normalizeEntities` guarded its object branch with `typeof item === 'object' && item.entity`.
> Because `typeof null === 'object'`, a null entry reached `item.entity` and threw. That is not
> an exotic input — a bare `-` list item, a trailing `-` left mid-edit, or `entities: [~]` all
> parse to null. The only caller is `setConfig`, which has no `try`/`catch`, so the throw
> escapes into HA's card lifecycle: **a typo in one list item renders a red error box instead
> of the calendar.** The `.filter(Boolean)` directly below proves dropping malformed entries
> was always the intent; the guard just never accounted for null reaching it. Fixed in its own
> commit so it is backportable to a 3.5.x patch without dragging in a test runner.
>
> This is worth recording because it is evidence for the _premise_ of Phase 0, not just a
> bug. The plan argues the existing gates are blind to the class of failure the column view
> will introduce. Here that was literal: lint, `tsc` and the build were all green on this
> crash, because the value enters as untyped YAML at the `setConfig` boundary, which is
> exactly where the type system stops.

> **[v6] Runner decided: `vitest` + `happy-dom`.** Stage 2 needs a DOM to render Lit into and
> Stage 1 does not, but choosing the environment once avoids re-litigating it mid-phase.
> `happy-dom` is roughly a fifth of `jsdom`'s install footprint, renders Lit correctly, and is
> swappable for `jsdom` by changing one `environment` string if a real gap appears. Both are
> devDependencies, so the bundle-size rationale that bars runtime dependencies does not apply.
> Verified rather than argued: `dist/calendar-card-pro.js` is byte-identical before and after
> (sha256 `30f7b8ec…71ce8`, 347943 bytes) and contains no trace of the runner, because rollup's
> only input is `src/calendar-card-pro.ts`.

> **[v6] The suite is mutation-tested, because a test that cannot fail is worse than none.**
> Five deliberate regressions were introduced and each produced a failure naming its cause:
> reverting the null guard, dropping `'ca'` from `supportedLocales`, capitalizing a
> `TRANSLATIONS` key, truncating `de.json`'s `editor` section, and removing the TZ pin. The
> `'ca'` case is the Catalan/Romanian silent failure reproduced on demand — `check-i18n.mjs`
> catches it statically, this catches it behaviourally, and the two are deliberately not the
> same check.

> **[v6] `tests/` is held to the same standard as `src/`.** `tsconfig`, `eslint` and the
> `format` glob were widened to cover it, so tests are typechecked by the existing `tsc` gate
> rather than being a second, laxer dialect of the codebase. Confirmed bundle-neutral: adding
> `tests/**/*` to `tsconfig.json` leaves the output hash unchanged.

> **[v6] Stage 1's cache test cannot ship in Phase 0 — the plan is circular here.** It lists
> "the `getBaseCacheKey` bug" as a Phase 0 deliverable, but a test asserting the _fixed_
> behaviour fails until Phase 2b lands, and one asserting today's behaviour would have to be
> rewritten by the same PR that fixes it. Sequencing: **Phase 0 Stage 1 ships only tests that
> pass on `dev` today** (translation parity, config validation/change-detection); the cache
> regression test ships **with** the Phase 2b fix, as the evidence that the fix works. This
> also keeps Phase 2b independently revertable, which is the point of splitting it out.

> **[v5] The `grid.ts` maths test target is dropped.** v4 listed it as a fourth file. It cannot
> be written: `grid.ts` **does not exist on `dev`** — it lives only on the frozen
> `alexpfau-review-339-time-grid` branch, and decision 9 explicitly forbids pulling it forward.
> A Phase 0 test target that requires a file Phase 0 is not allowed to create is not a
> deliverable. It returns with Phase 5, when the module it tests returns.

**Stage 2 — list-view DOM equality fixture.** [v4 — now a real gate] Serialize the list
render across the soak fixtures. Under v3's rewrite this could only ever be a review artifact,
because the DOM was _meant_ to change. Under v4 the list DOM must not change at all, so this
becomes a genuine pass/fail gate for Phase 1 — cheaper and stricter than the screenshot
comparison v3 was forced to rely on. It keeps its value through phases 2–5 as the guarantee
that adding views never disturbs the list.

> **[v5] The gate is non-deterministic unless it names a clock strategy, so here is the
> strategy: freeze time with fake timers.**
>
> The list render is time-dependent — `render.ts` reads the current date to decide today,
> weekend and past-event state, so the same fixture serialized on two different days produces
> two different DOMs and the gate fails for reasons that have nothing to do with the change
> under test. v4 asserted byte-identical output without saying how time is held still.
>
> **Strategy: `vi.useFakeTimers()` + `vi.setSystemTime(<fixed ISO instant>)` in the test
> setup.** This freezes `Date.now()` and the `new Date()` constructor **globally**, which
> includes every call dayjs makes internally, because dayjs has no independent clock. It
> requires **zero production changes** — no `now` parameter threaded through `render.ts`, no
> signature churn on the very functions Phase 1 is extracting. One line of test setup, and the
> fixture becomes reproducible.
>
> Pin the frozen instant to a date that exercises the interesting branches — mid-week, not
> month-start, with fixture events straddling it so past/future/today all appear — and pin `TZ`
> alongside it (`TZ=… vitest run`, already specified above) since the two together determine
> which local day an instant falls in.
>
> **Documented fallback, not the plan of record:** if fake timers prove insufficient — most
> plausibly if some path captures a timestamp outside the faked window — the codebase already
> has the seam for injection. `start-date.ts:156-168` takes an explicit reference date rather
> than reading the clock, and is the precedent to follow. **Do not reach for this first**; it is
> materially more invasive than a setup line. If you find a concrete reason fake timers cannot
> work here, that is a finding to report, not an implementation detail to absorb silently.

> **[v7] SHIPPED — PR #390.** The five gaps below are closed; the answers are recorded
> here because each one changed what "byte-identical" means in practice.
>
> - **What is rendered, and into what.** _Not_ the card element. The pipeline under test is
>   `groupEventsByDay` → `renderGroupedEvents` → Lit, rendered into a detached `<div>` — which
>   is exactly what `calendar-card-pro.ts` `render():884` does for the populated case.
>   Constructing the element would require a fake `hass`, a mocked `callApi`
>   (`events.ts:1167`) and an awaited async fetch, none of which the gate is about and all of
>   which could fail for unrelated reasons. **The pure functions _are_ the surface Phase 1
>   touches**, so this is both simpler and more targeted. Grouping and rendering are kept
>   together deliberately: grouping decides day boundaries, ordering and survival; rendering
>   turns that into the table. "The list DOM must not change" means both.
> - **Serialization normalisation.** Verified by inspecting real output rather than assumed.
>   Lit emits three marker forms here: `<!--?lit$095926250$-->` carries a **per-render random
>   id** and must be stripped or every run differs; `<!---->` is empty and is stripped for
>   readability; `<!--?-->` is deterministic and is **kept**, because branch position is real
>   signal. Two `lit-part` patterns tried first turned out to be SSR-only and never fire —
>   they were removed rather than left in looking like a guarantee.
> - **Where the baselines live and how they are approved.** Committed under
>   `tests/__snapshots__/`, so an intended change appears in the PR diff as a snapshot change
>   a reviewer has to look at. Sanctioned update path: review that diff, then re-run the suite
>   with vitest's `-u` flag. Stated in the file's own docblock, because a gate with no approved
>   update path gets deleted the first time list DOM legitimately changes.
> - **Which fixtures.** Enumerated in `tests/fixtures.ts`, each mapped in a table to the branch
>   it holds open — past, currently-running, upcoming, location, all-day, multi-day, and a
>   future-only day. Ten snapshots cover default, single event, empty calendar, empty days,
>   past events, week numbers + separators, split multi-day, compact, location + end time, and
>   a non-English language. The frozen instant is **Wednesday 2026-06-17T10:00Z** — mid-week
>   and mid-month on purpose, so neither the week-boundary nor the month-boundary separator is
>   permanently on and therefore permanently untested.
> - **The command, and whether CI runs it.** `npm test`, already wired into `ci.yml` by
>   Stage 1. No new step needed.
>
> **Mutation-tested before being called a gate.** The specific failure mode to rule out was a
> snapshot that captures an empty card and passes regardless of changes. Three realistic
> extract-a-renderer mistakes: renaming a CSS class, hardcoding the date column's `rowspan`,
> and dropping the weekend modifier from `date-column`. Each fails **10 of 11** tests. The
> survivor every time is the clock-freeze guard, which correctly does not depend on render
> output. Snapshots confirmed stable across repeat runs.
>
> **Two incidental confirmations.** The clock strategy above is now verified rather than
> proposed — `events.ts` calls `new Date()` in eight places and fake timers cover all of them,
> with zero production changes, exactly as predicted. And the serialized `date-column` cell
> renders as `<td class="date-column " rowspan="4">`, which is the element **A3-A**'s
> `align-self` analysis concerns; the gate now pins its current structure before that analysis
> is acted on.

> **[v7] A gap in the shipped gate, found and closed (PR #390).** The gate as first shipped
> passed **no `weatherForecasts` at all**. The parameter is optional, so every weather branch
> short-circuited to `nothing` — and Phase 1's scope section below names weather as the
> **first** extraction. The gate did not cover the first step of the refactor it exists to
> protect, and would have agreed perfectly with a broken weather renderer. This is the same
> "passes while empty" failure the mutation testing above was designed to rule out, surviving
> in one corner because the mutation set only probed code the fixtures already reached.
>
> Worth recording as a method note: **mutation testing proves the tests you have are load
> bearing; it cannot tell you about a branch no fixture reaches.** Coverage of the render
> _surface_ has to be argued separately from sensitivity of the assertions.
>
> Closed by pinning a `WEATHER` fixture to the frozen dates — daily keyed `YYYY-MM-DD`, hourly
> `YYYY-MM-DD_H` with a **non-padded** hour, matching what `findDailyForecast` and
> `findForecastForEvent` actually look up. An unpinned fixture silently renders nothing and
> produces a passing, empty snapshot, which is the trap this whole section is about. Four
> cases: date position, event position (a **separate** render site reading the hourly
> forecast, so an extraction could fix one and break the other), both-with-low-temp, and UV
> suppressing the low temp. That last is an interaction between two independent flags
> (`show_low_temp === true && !showUvIndex && templow !== undefined`) that no other case
> reaches; it asserts on the output directly as well as snapshotting, so the _absence_ of
> `weather-temp-low` is stated rather than left for a reader to spot in 1300 lines. Four
> further mutations confirm the new cases bite — including the suppression removal, which
> survived everything before this commit.

> **[v7] The rest of the same gap, found by audit rather than by luck (PR #390).** Finding
> the weather hole raised the question of whether it was the only one, which is answerable
> mechanically: enumerate every behavioural config key `render.ts` reads, and check each
> against the fixtures. Three more branches were reachable by no test, all for the same
> structural reason — **they default to `false`**, so a suite built from default config never
> renders them and never will, however many assertions it accumulates.
>
> The significant one is `today_indicator`. `renderTodayIndicator` returns early when it is
> falsy, and **`parseIndicatorPosition` is reachable only through it** — so the fourth of
> Phase 1's four named extraction targets had no coverage whatsoever. Two of the four were
> dark. `show_countdown` and `show_progress_bar` gate branches inside `.event-content`, the
> third target. All three are now pinned, asserting the observable effect
> (`today-indicator-container`, `left:85%;top:15%`, `progress-bar`) as well as snapshotting.
>
> **The generalisable rule: default-off options are invisible to a default-config suite.**
> Enumerate them from the source and check each one, rather than trusting that a suite which
> catches mutations is therefore complete. Both holes here were of that shape, and neither
> was visible from inside the test file.
>
> One mutation pair came back with **zero** kills and was investigated rather than recorded as
> a survivor: `show_progress_bar` is checked twice, at `render.ts:902` and again at
> `:954`/`:973`, and either check alone is dead because the first already forces
> `progressPercentage` to `null`. Removing both does change output and fails 13 of 18. They
> are equivalent mutants, not gaps — noted in the test because an extraction that keeps only
> one of the two guards is still correct and must not be read as a regression.
>
> **The gate's boundary, stated so it is not assumed wider than it is:** it covers
> `renderGroupedEvents` and everything below it. It does **not** cover `renderMainCardStructure`
> or `renderCardContent` (the loading and error states), because it deliberately never builds
> the custom element. All four Phase 1 extraction targets are inside the covered subtree, so
> the boundary is correct for Phase 1 — but a later phase that touches the card shell needs
> its own gate, and should not read this one as protection it does not provide.

**This requires an `AGENTS.md` amendment, not a silent violation.** The file says "no test
framework… Keep it that way", with **bundle size** as the rationale — which does not apply,
since a runner is a devDependency and never enters the shipped file. Amend the rationale
explicitly so the next contributor isn't caught between the doc and the repo.

> **[v6] The amendment is now overdue, and it is two claims, not one.** As of Stage 0 and
> Stage 1 the repo contradicts `AGENTS.md` in two places: "there are only **four** npm scripts,
> do not invent others" (there are now six — `check:i18n` and `test`), and "no test framework".
> Both were deliberate and both are argued above, but the doc is the first thing an agent
> reads, so leaving it stale trains the next contributor to distrust it. Proposed wording is
> held for the maintainer to apply rather than edited in place, per the standing instruction
> that `AGENTS.md` changes are proposed, not made.

> **[v6] The `cross-env` question dissolved — TZ is pinned in config, not on the command
> line.** Earlier revisions debated `cross-env` vs a bare `TZ=… vitest run` prefix. Neither is
> needed: `vitest.config.mjs` sets `test.env.TZ`, which Vitest applies before a worker's first
> `Date` use. This is better than either shell form because it holds however the suite is
> invoked — `npm test`, `npx vitest`, a watch run, or an IDE's inline runner — rather than only
> through the one script that carries the prefix. Verified empirically rather than assumed: on
> a host in `Europe/Berlin`, the suite reports offset `0` and `Intl` resolves to `UTC`, and
> removing the pin fails `environment.test.ts`. That guard exists precisely because this is a
> runner behaviour rather than a language guarantee.

**Do not merge lenaxia's 2,022-line suite wholesale.** Its approach is right, its size isn't.
Prune to the parts covering code we keep.

### Phase 1 — shared leaf renderers · ships 3.x · risk: **low** **[v4 — RE-SCOPED]**

**v3 had this as a table→flex rewrite of the list day block, at medium risk. Reversed — see
A3-A.** List keeps its `<table>` and `rowspan`. Phase 1 extracts the axis-agnostic **leaf**
renderers into shared functions that the list's existing table consumes **unchanged**, and
that column (Phase 4) and time-grid (Phase 5) consume from their own containers.

Leaves to extract, all already verified DOM-agnostic — **citations re-based to `dev`
@ `29b8226` [v5]**:

- `.event-content` subtree (`render.ts:942-1003` **[was `:939-1000`]**) — title, time,
  location.
- Date content and colour precedence (`renderDateColumn` `:490-611` **[was `:487-608`]**,
  precedence `:497-516` **[was `:497-513`]**).
- Today-indicator geometry (`parseIndicatorPosition` `:358-382` **[was `:355-379`]**).
- Weather rendering (`:526-575` **[was `:528-572`]**) — **see the nesting fork below; this is
  not a sibling of `renderDateColumn`.**

> **[v5] Resolved: the weather / `renderDateColumn` nesting fork.**
>
> The four bullets above read as four peers. They are not. There is **no `renderWeather`
> function on `dev`** — weather is rendered **inline inside `renderDateColumn`**, at
> `render.ts:526-575`, which is wholly contained in `renderDateColumn`'s span of `:490-611`. So
> the list names _a container and its own child_ as sibling extraction targets. Taken
> literally, you would extract the same code twice and have to decide, mid-extraction, which
> one owns it.
>
> **Decision: extract weather FIRST, as its own leaf, and have `renderDateColumn`'s extraction
> call it.** Nesting, not duplication. Weather is the more reusable of the two — column and
> time-grid both want a weather glyph without wanting list's date-column structure — and it is
> the smaller, more self-contained block, so it is the safer thing to move first.
>
> **Call-signature consequence, in one sentence:** the extracted date-content renderer takes the
> weather data as an already-rendered `TemplateResult` (or `nothing`) passed in by its caller,
> rather than taking the raw forecast and rendering it internally — which keeps the date leaf
> ignorant of weather config and lets column and time-grid supply their own weather placement
> without re-implementing the date content.
>
> Order within Phase 1 therefore: weather → date content → `.event-content` →
> `parseIndicatorPosition`. The last two are genuinely independent of the first two and can be
> done in either order.

> **[v7] The gate covers this ordering — but only since the follow-up commits in PR #390.** Because
> weather is first out, it is the extraction most in need of a baseline, and the Stage 2 gate
> as originally shipped had none: it passed no forecasts, so every weather branch rendered
> `nothing`. `parseIndicatorPosition`, fourth in the list, was equally uncovered — reachable
> only when `today_indicator` is set, which no test did. **Two of the four targets below were
> dark in the gate built to protect them.** Both are now pinned; see Stage 2 for the audit and
> the general rule. Whoever starts Phase 1 should also know the gate pins **two** weather
> render sites — the date-column block named above **and** `renderEventWeather`
> (`render.ts:1050+`), a separate function reading the _hourly_ forecast. The nesting decision
> above concerns the date one; do not let the event one fall through the extraction unnoticed
> just because this bullet list does not mention it.

**The contract is stronger than v3's, and automatable: list-view DOM must be byte-identical
before and after.** Extraction that changes list output is a bug by definition. This restores
a hard gate that v3's rewrite had forfeited — see Phase 0.

Watch the two traps found earlier, which make text-diffing the extraction _necessary but not
sufficient_:

- `renderEvent` interpolates ~7 locals computed _before_ the extraction boundary; they must be
  passed, not recomputed.
- Accent, background and padding live on the wrapper `<td class="event">` (`render.ts:938-941`,
  the `classMap` at `:939` and the inline `border-inline-start` / `background-color` at `:940`
  **[v5 — was `:937`]**; `styles.ts:458-483` **[was `:463-488`]**) with a position class
  computed at `render.ts:916-922` **[v5 — v4 wrote `styles.ts:913-919`, but `styles.ts` is 703
  lines; the position classes are built in `render.ts`]**. A future column wrapper must
  reproduce those; the _leaf_ must not absorb them.

Deferred out of Phase 1, and no longer on the critical path: removing the layout table (a11y),
RTL, and the duplicate `.today-indicator-container` rule (`styles.ts:332-340` / `:364-370`
**[v5 — was `:336-344` / `:368-373`]**; still a genuine duplicate on `dev` — the second
declaration drops `top`/`left`/`width`/`height` and adds `color`).
The duplicate rule can be deleted independently — it needs no restructure.

**Acceptance.** [v4 — inverted] With the list container untouched, a serialized-DOM equality
assertion on the list path is a **real automated gate** again, not a review artifact. Run it
across the soak fixtures. Visual confirmation in HA is still worth one pass, but it is now
corroboration rather than the sole gate.

Soak fixtures (reused by every later phase): longest-title wrapping, `date_vertical_alignment`
at all three values, `today_indicator: true` on a multi-event today, RTL, week numbers on,
`max_height` scrolling, narrow HA sections column.

### Phase 2 — presentation models · ships 3.x · risk: low **[v4 — cache fix split out]**

`EventPresentation` and `DayHeaderModel`: the data both views need, computed once,
independent of markup.

**[v4] Caveat to check before building these.** If Phase 1's shared leaves and Phase 4's column
both consume the raw `EventsByDay` types happily, these models are abstraction ahead of need.
Name the consumer that forces them, or **[v5 — was "fold them into Phase 3"]** fold them into
**Phase 4**, where the adapter — now built there — gives them one. Do not build them
speculatively.

### Phase 2b — cache-key fix · ships 3.x **now**, independently · risk: low **[v4 — SPLIT OUT]**

**This is a live list-view bug today and should not wait for the column epic.** It needs no
column view, no models and no adapter, so coupling it to this plan only delays a user-facing
fix and enlarges the blast radius of an unrelated release.

CONFIRMED real: `processEvents` splits multi-day events pre-cache (call at `events.ts:707`,
definition at `:772` **[v5 — was `:649`]**) and bakes
`_entityLabel` (`:671` **[v5 — was `:642`]**; also assigned at `:268-270`), then caches the
already-split array; `getBaseCacheKey`
(`:1389-1441` **[v5 — was `:1369-1415`]**) includes instanceId, entityIds, daysToShow,
showPastEvents, startDate,
filterDuplicates, per-entity patterns and `VERSION.CURRENT` — but **not**
`split_multiday_events` or entity-label config. A warm-cache toggle of `split_multiday_events`
returns stale, wrongly-split data.

> **[v5] Re-verified on `dev` @ `29b8226`: the bug is real and the analysis is unchanged.**
> Only the line numbers moved. The absence of `split_multiday_events` and of any entity-label
> field from `getBaseCacheKey` is confirmed by reading the whole function.

It is a behaviour-**changing** bugfix, not a behaviour-preserving refactor: fixing it changes
what the user sees. Fine for 3.x — but label it honestly so it gets tested as a fix.

Severity is bounded: `VERSION.CURRENT` is in the key, so every release flushes the cache. It
only bites a user toggling config without a version bump inside TTL.

**Mandatory before Phase 4/5 regardless:** column forces `split: true` and time-grid forces
`split: false` (`grid.ts:573-586`), so cross-view cache collision is _guaranteed_ unless
effective split semantics and view identity enter the key. Shipping it early simply means that
dependency is already satisfied.

> **[v6] The scope above is too narrow — adding `split` + label to the key does not close the
> bug class.** Verified on `dev`: the cached event carries a whole `_matchedConfig` object
> (`events.ts:670`), and **five** separate consumers prefer it over live config —
> `getEntitySetting` (`:1066`), `getEntityLabel` (`:1034`), `getEntityColor` (`:954`),
> `getEntityAccentColorWithOpacity` (`:991`) and the split override (`:748-751`). So a warm
> cache can also serve stale `show_time`, `show_location`, `show_description`, accent and
> background colours, per-entity compact limits and per-entity split overrides — none of which
> are in the key either.
>
> Two ways to close it, and the choice is a **maintainer decision, not an implementation
> detail**: (a) cache the **raw API events** and re-run config-dependent processing on every
> read, which makes the whole class structurally impossible; or (b) keep caching processed
> events and key the complete, order-sensitive, normalised per-entity config — which must then
> be re-verified against all five consumers above, not just labels.
>
> (a) is the smaller long-term surface and removes `_matchedConfig` staleness by construction;
> (b) is the smaller diff today. **Unresolved — do not start Phase 2b until this is ruled on**,
> because the two produce different cache keys and different tests.

> **[v9] RULED: (a). Shipped as `a463a94`.** The decision turned out not to be a judgement
> call — implementation found a defect that **(b) provably cannot fix**, and two of the [v6]
> consumer counts were wrong.
>
> **(b) was not viable.** The cache round-trips through `JSON.stringify`/`JSON.parse`
> (`cacheEvents` / `getValidCacheEntry`), so a cache-hit `_matchedConfig` is always a
> freshly-parsed plain object. `applyPerEntityCompaction` identifies an entity's config block
> with `config.entities.findIndex((e) => … e === matchedConfig)` — a **reference-identity**
> compare. On every cache hit that returned `-1`, degrading the compaction bucket key from
> `entityId__configIdx` to bare `entityId`. So a fresh fetch and a cache hit computed
> **different buckets from identical config**. No cache key repairs a broken object reference,
> and the JSON round-trip is not the only mechanism: `calendar-card-pro.ts:726` re-runs
> `normalizeEntities` on every `setConfig`, and `config.ts:227` `.map()`s to fresh object
> literals, so the reference breaks even on a cold cache after any config edit. Only
> re-deriving from the live config closes it — which is (a).
>
> **The consumer list was wrong twice over.** [v6] says "five"; `grep` finds **eight**, and the
> three it missed are the load-bearing ones: the per-day copy-through (`events.ts:302`), the
> compaction reference compare (`:398` — the defect above), and two sites in `leaves.ts`
> (`:248`, `:253`) that [v6] could not have seen because Phase 1 had not yet created that file.
> The corrected table is in the spec. **Standing lesson: an inventory in this document is a
> claim to re-verify, not a fact to build on.**
>
> **Why the key narrowed rather than widened.** Under (a) the key describes only what
> determines the API response. `filter_duplicates` and the allow/blocklist patterns are
> processing, applied on read, so they left the key. This is safe in both directions: a
> narrower key produces _more_ hits, never a config that stops taking effect, and
> `VERSION.CURRENT` is already in the key so every release flushes everything. No migration.
>
> **`show_past_events` stayed, deliberately.** It is equally redundant — it never reaches
> `getTimeWindow` and is applied at render time in `groupEventsByDay` — but it is also baked
> into `generateDeterministicId`, which feeds `_instanceId` and therefore the key regardless.
> Removing it from one place alone is a no-op that widens the diff. Tracked as a non-blocking
> follow-up in §D7.
>
> **Copying, not call-ordering.** `processEvents` decorated its input in place. With (a) that
> input may be the cached payload, so it now `.map()`s to copies. Merely moving `cacheEvents`
> _before_ processing would also have been safe today, but that is temporal coupling — an
> invisible ordering dependency a later edit breaks silently. The copy makes the invariant
> local and self-evident. Mutation testing confirms the distinction is pinned, not decorative.
>
> **A load-bearing ordering trap inside the copy.** `getEntityLabel` short-circuits on
> `event._matchedConfig`, so `_matchedConfig` must be written to the copy _before_ the label is
> derived **from the copy**. The obvious object-literal rewrite —
> `{ ...event, _matchedConfig: X, _entityLabel: getEntityLabel(id, config, event) }` — is
> wrong, because `event` inside the literal still carries the _previous_ config. A mutation
> that derives from `event` is killed by the duplicate-entity test.
>
> **An aliasing bug fixed incidentally.** `events.filter(…)` returned the _same object
> references_ to two config blocks naming the same entity, so the second block's decoration
> overwrote the first and both entries rendered with the last block's label and colour. Copying
> is the fix; the pre-existing comment "even if same entity, process independently" was
> aspirational until now. Event _count_ is unchanged, and the list-DOM snapshot did not move.
> Disclosed to the maintainer because it ships in 3.x.
>
> **Verification.** Six tests in `tests/event-cache.test.ts`, each written red-first, plus a
> five-mutation run against `src/utils/events.ts` — cache-hit-skips-reprocessing (the original
> bug), decorate-in-place, derive-label-from-original, cache-disabled (control), and
> cache-processed-not-raw. **All five killed.** Green tests alone would not have distinguished
> the copy from in-place mutation.

### ~~Phase 3~~ — `ViewAdapter` · **[v5 — FOLDED INTO PHASE 4]**

> **[v5] This is no longer a phase. It is the design record for the adapter that gets built
> _inside_ Phase 4.** See section C for the rationale. Everything below stands as analysis —
> the interface sizing, the discriminator classification, the corrected claim — it simply is
> not a separate 3.x deliverable any more, and nothing ships from it before Phase 4.
>
> **Provenance warning, and it is load-bearing for this section specifically:** the site counts
> and every `grid.ts` / `render-grid.ts` / `*-controller.ts` citation in the table below are
> **[frozen]** — they describe `alexpfau-review-339-time-grid`, not `dev`. On `dev` there are
> **zero** `view === 'time-grid'` discriminators, because there is exactly one view. The "19
> sites" are 19 sites _on the frozen branch_. Read this section as _"here is what the adapter
> will have to absorb when time-grid returns in Phase 5"_, not as a description of code you can
> open today.

**[CHANGED — v1's interface was mis-sized.]** v1 claimed four methods (`capabilities` /
`buildFetchPlan` / `render` / `getCardSize`) would retire 19 discriminator checks. Verified
against all 19 sites **[frozen]**: **the four named methods cleanly absorb about 3.**
Classification:

| Concern                               | Sites                                                                                                                     | Covered by v1's interface? |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Render dispatch                       | `calendar-card-pro.ts:882` **[frozen]**                                                                                   | ✅ `render`                |
| Fetch plan override                   | `calendar-card-pro.ts:676`, `grid.ts:573-586` **[frozen]**                                                                | ✅ `buildFetchPlan`        |
| Card size                             | `grid.ts:646` **[frozen]**                                                                                                | ✅ `getCardSize`           |
| **Config validation / normalisation** | `config.ts:286` **[frozen]**                                                                                              | ❌ no method               |
| **Change-detection for refetch**      | `config.ts:410,415,416` **[frozen]**                                                                                      | ❌ no method               |
| **Controller lifecycle**              | `responsive-columns-controller.ts:6,44,63,80,86`; `now-line-controller.ts:86` **[frozen — neither file exists on `dev`]** | ❌ not a render/fetch call |
| **Post-update imperative hook**       | `calendar-card-pro.ts:290-294,298-317` **[frozen]**                                                                       | ❌ no method               |
| Interaction model                     | `calendar-card-pro.ts:753,758` **[frozen]**                                                                               | ~ only via `capabilities`  |
| Card-shell flags                      | `render.ts:50,54,66` **[frozen]**                                                                                         | ~ only via `capabilities`  |

`config.ts:410-419` **[frozen]** diffs _previous vs current_ config to decide whether to
refetch —
`buildFetchPlan` builds a plan, it does not answer "did a data-affecting key change?"
Different operations. And the controllers are Lit `ReactiveController`s with
`hostConnected`/`hostUpdated`/`hostDisconnected` + observer lifecycles; a stateless
`render(state) → template` cannot own an observer's lifetime.

**Revised interface spec — name every facet before writing code:**
`capabilities` (a _typed descriptor_, not a word — it silently does ~12 sites of work and
must drive controller construction, shell classes, ripple suppression and handler wiring),
`normalizeConfig`, `fetchInputsChanged(prev, cur)`, `buildFetchPlan`, `controllers()`,
`render`, `afterRender(host)`, `getCardSize`.

**Revised claim:** replace scattered `view === 'time-grid'` string literals with one
declarative capability descriptor. Not "four methods retire 19 checks". Note `config.ts:416`
**[frozen]** partly evaporates once decision 2 deletes `navigation_days`.

> **[v5] What building this inside Phase 4 changes in practice.** The eight-facet interface
> above was derived by looking at where _time-grid_ diverges from list. Built during Phase 4 it
> is instead derived from where **column** diverges from list, and only the facets column
> actually needs are implemented. The remaining facets stay in this document as the known
> shape of the problem, and the conformance gate — which is where time-grid gets ported onto
> whatever Phase 4 built — is what proves the sizing was right. That ordering is the whole
> point of the fold: the gate tests the abstraction against a second consumer, which is a test
> the old Phase 3 could not run at the time it shipped.

### Conformance gate (scratch branch, not shipped) \*\*[v5 — priced, sequenced and given a

failure path]\*\*

**Reviewed as a genuine strength — keep it exactly where it is.** Port #339's time-grid onto
the abstraction before Phase 4 hardens it. It cannot go earlier (nothing to conform to) and
must not go later (designing around list+column then discovering time-grid doesn't fit would
force a breaking re-abstraction _after_ `view` is public). **[v5] Folding Phase 3 into Phase 4
does not move it:** it still sits immediately before Phase 5, and it still tests the adapter
built in Phase 4 against a second consumer.

Probes it must answer:

- Per-view config overrides in **all four directions** of the D5 taxonomy — column forces
  `split_multiday_events: true`; time-grid forces split `false`; `show_empty_days` is _not_
  forced in either (A3-B); `compact_events_complete_days` is _ignored_ in column; and the
  global `compact_events_to_show` is **reinterpreted** in column (kind 4). **[v4]** All four
  must be expressible **without lying to the editor** — a hidden control, a disabled control,
  a normal control and a normal control with per-view help text are four different renderings.
- Fetch planning must be per-view — time-grid's window is far wider than list's.
- **[v3]** Compact-budget shape must be per-view: global sum (list) vs per-column max
  (column). If the adapter cannot express that, it is under-sized. **[v4]** Note the two
  compaction stages are _sequential and composed_ — per-entity (`events.ts:350-391`) then
  global (`:409-475`) **[v5 — was `:340-378` / `:388-468`; corrected to A3-D's ranges, which
  re-verify exact on `dev`]** — so the adapter hooks in **two** places, not one. Price it as
  such.

**[v5] Sequencing.** It runs on a **scratch branch off the Phase 4 branch**, after Phase 4's
adapter and column renderer are functionally complete but _before_ `view` is released. Inputs:
the Phase 4 branch, plus `alexpfau-review-339-time-grid` as a read-only source. Output: a
findings note plus, if it passes, a merged set of adapter corrections back into Phase 4. The
scratch branch is then abandoned — **it is not the branch Phase 5 is built on**; Phase 5
rebuilds on lenaxia's commits as ancestors (see Phase 5), and this gate must not become a
shortcut that loses that attribution.

**[v5] Definition of done.** All four override directions above expressible through the
adapter, with the editor rendering each correctly; time-grid's fetch window derivable via
`buildFetchPlan` without a `view ===` literal outside the adapter; both controllers
constructible via `controllers()` with their observer lifetimes intact; and **no new
`view === 'time-grid'` string outside the adapter module**. The port does not need to _run_
correctly end to end — it needs to _compile and wire_ without reaching around the abstraction.
That is the cheapest thing that actually answers the question, and drawing the line here is
what keeps the gate from becoming Phase 5 done early.

**[v5] Honest price. This is a branch port, not a review step, and v4 priced it as the
latter.** The frozen branch carries `grid.ts`, `render-grid.ts`, two controllers and edits
across `calendar-card-pro.ts`, `config.ts`, `editor.ts` and `render.ts`. By the time the gate
runs, `dev` will have moved by everything in Phases 0–2b **plus** Phase 4's own changes to
several of those same files — and the frozen branch has already diverged materially (its
`styles.ts` has a grid section `dev` has never had; its `editor.ts` has a view select at
`:774-777` that does not exist on `dev`). So the port is a **conflict-heavy manual port across
7+ files that both sides have edited**, not a cherry-pick. Budget it as **comparable to a
small phase in its own right — days, not an afternoon** — and treat any estimate below that as
a sign the divergence has not been looked at. The number is uncomfortable and it is the real
one; discovering it during the port is strictly worse than budgeting for it now.

> **[v6] Deliberate wording change: "rebase" → "manual port".** Earlier revisions called this
> a "conflict-heavy rebase". Given that `alexpfau-review-339-time-grid` is **frozen** and its
> commits must survive as ancestors of Phase 5 to preserve lenaxia's attribution, "rebase" is
> the one word that must not appear next to it — it names the exact operation that would
> destroy the requirement. The work is a manual port **into a scratch branch**; the frozen ref
> is read and never moved.

**[v5] Failure path — what happens if the gate fails after Phases 1–2b have shipped to 3.x.**
This is the case v4 left unanswered, and it is the one that matters, because by then the
refactors are in users' hands.

- **Phases 0–2b are safe regardless.** They are behaviour-preserving refactors plus one
  bugfix; none of them exposes `view` or the adapter as public API. A gate failure does not
  retract them and does not require a revert. This is the payoff for making them independently
  shippable, and it is why the 3.x/v4 split exists.
- **The adapter is _not_ public API** — it is internal, and Phase 4's `view` key is the only
  public surface. So a failure is caught while `view` is still unreleased, which is precisely
  the window the gate was placed to protect.
- **Therefore the failure path is: fix the abstraction inside Phase 4 and re-run the gate.**
  Phase 4 does not ship until it passes. That is a schedule cost on v4.0.0, not a
  compatibility problem, and no already-shipped 3.x release is affected.
- **The one genuinely bad outcome** is discovering that a _Phase 1 or 2_ extraction shape is
  wrong for time-grid — that would be shipped code that needs changing. Mitigation: the
  Phase 1 leaves are deliberately axis-agnostic and consumed unchanged by list, so re-shaping
  them is another behaviour-preserving refactor in 3.x rather than a break. Accept it as a
  known, bounded risk; do not pretend it is zero.
- **Escalation, if the gate fails on something structural:** stop and re-scope rather than
  widening the adapter until time-grid fits. An adapter that grows a facet per failed probe is
  how you end up with the discriminator soup this whole exercise exists to remove.

### Phase 4 — column view **+ the `ViewAdapter` abstraction** · v4 branch · risk: medium

**[v5 — absorbed Phase 3]**

`view: 'list' | 'column'` becomes public API. Section D. **[NEW] Includes an editor gate
audit — see D4.** **[v5]** Also includes building the `ViewAdapter` itself, designed against
list and column together rather than against list alone — see the folded Phase 3 section above
for the interface analysis, and section C for why it moved here.

### Phase 5 — time-grid · v4 branch · risk: medium

Rebuilt on lenaxia's four commits as **ancestors** so `git log` retains authorship, plus
`Co-authored-by` trailers and a release-note credit. Deferred retro findings are the
checklist: blank slot-interval dropdown; all-day off-by-one in the detail overlay; frozen
clock when the now-line is disabled; dead swipe in 7-day mode; unguarded
`navigator.clipboard`; `hide_when_empty` window mismatch; now-line re-rendering the whole card
every 60s; the 35-day default fetch; ~8 shipped config options silently ignored; 6 runtime
i18n keys present only in `en.json`; `time_grid_interval_minutes` being a zoom control.

---

## D. Column view specification (phase 4)

> **Verified against `origin/dev` @ `29b8226`.** All `src/` citations in D1, D2, D3 and D5 have
> been re-based against `dev` and are marked **[v5]** where they moved. **D4 is the exception
> and is flagged inline** — its subject matter (existing editor view gates) does not exist on
> `dev` at all. See F6.

### D1. Element mapping **[CHANGED — separators are a re-implementation, not a rotation]**

| Element                   | List today                  | Column                                        | Keys                                 |
| ------------------------- | --------------------------- | --------------------------------------------- | ------------------------------------ |
| Per-event accent          | vertical, left of event     | **unchanged**                                 | `vertical_line_width`                |
| Day separator             | horizontal between days     | **vertical between columns (re-implemented)** | `day_separator_*`                    |
| Week separator            | horizontal at boundary      | **vertical (re-implemented)**                 | `week_separator_*`                   |
| Month separator           | horizontal at boundary      | **vertical (re-implemented)**                 | `month_separator_*`                  |
| Header rule               | _(does not exist)_          | **horizontal, under header**                  | `day_header_separator_*` **(new)**   |
| Week number badge         | own full-width row          | **deferred — see D5**                         | `show_week_numbers`, `week_number_*` |
| Day spacing               | vertical gap                | **column gutter**                             | `day_spacing`                        |
| Event spacing             | vertical gap                | **unchanged**                                 | `event_spacing`                      |
| Today indicator           | absolute in date cell       | **absolute in header band**                   | `today_indicator*`                   |
| Weekday / day / month     | vertical stack, left        | **horizontal, in header**                     | `weekday_*`, `day_*`, `month_*`      |
| Weather                   | in date column              | **header, single-line-or-hide — see D2**      | existing weather keys                |
| Event content             | `.event-content`            | **byte-identical**                            | all                                  |
| `date_vertical_alignment` | positions date in tall cell | **ignored** (harmlessly unused)               | —                                    |

**v1 said "separators simply become vertical rules, keys unchanged." That was misleading.**
There are three different renderers, none axis-swappable:

- Day separator: `<div class="separator">` with inline `borderTop*`, `width:100%`
  (`render.ts:676` **[v5 — was ~`:673`]**; `styles.ts:262-265` **[v5 — was `:266-269`]**).
- Week separator when `show_week_numbers === null`: a separate border-top renderer
  (`render.ts:222-245` **[v5 — was `:219-231`]**).
- Week separator when `show_week_numbers !== null`: **an entire `<table class="week-row-table">`**
  whose rule is structurally welded to the week-number pill in one table row
  (`render.ts:246-312`, the `<table>` itself at `:289` **[v5 — was `:243-297`]**;
  `styles.ts:195-261` **[v5 — was `:196-262`]**).

**The spacing multipliers cannot survive rotation.** `createSeparatorStyle`
(`render.ts:131-179` **[v5 — was `:128-165`]**) derives `marginTop`/`marginBottom` from
`day_spacing × multiplier`,
where `SEPARATOR_SPACING` is WEEK 1×, MONTH **1.5×** (`constants.ts:87-92` — note the source
_comment_ on `:90` wrongly says "2x"; pre-existing bug, fix in passing). CSS grid
`column-gap` is a **single uniform value for all tracks** — you cannot widen only the gutter
between columns 3 and 4. So the month/week spacing differential is silently dropped, which
would violate acceptance criterion E1.

> **[v5] Re-verified exact on `dev`.** `constants.ts:87` opens `SEPARATOR_SPACING: {`, `:89` is
> `WEEK: 1`, `:90` is the comment reading "2x", `:91` is `MONTH: 1.5`, `:92` closes. The claim
> and the incidental comment bug both stand unchanged.

**Decision needed:** either (a) drop the multipliers in column view and document it, or (b)
use explicit spacer tracks in the grid template to reproduce them. Recommend (a) for MVP —
the rule itself still renders at the boundary, only the extra breathing room is lost.

**Mitigant that makes this phaseable:** all three separator widths default `0px`
(`config.ts:53` day / `:55` week / `:57` month **[v5 — was `:51-56`]**) and
`show_week_numbers` defaults `null` (`config.ts:48` **[v5 — was `:46`]**), so **rotation is
a no-op for a default config** and this rewrite only affects users who opted in.

### D2. Header

A horizontal variant of `renderDateColumn` (`render.ts:490-611` **[v5 — was `:487-608`]**).
Same DOM classes, same
custom properties, so theming carries over. **Colour precedence preserved exactly**: base →
weekend → today (`render.ts:497-516` **[v5 — was `:497-513`]**) — CONFIRMED pure data,
DOM-independent.

**Today highlighting needs zero new keys** — `today_weekday_color`, `today_day_color`,
`today_month_color` already exist with top precedence. (ACR's Planner ships with _no_ today
indicator; we get it on day one.)

Today indicator relocation is MECHANICALLY SOUND: `parseIndicatorPosition`
(`render.ts:358-382` **[v6 — was `:358-390`]**) emits `position:absolute` + percentages +
`translate(-50%,-50%)` inside
a `position:relative` container; that transfers cleanly. Caveat: `'15% 50%'` resolves to a
different visual spot in a short wide band. Documented, not fixed.

**[NEW] Weather must be single-line-or-hide.** "Mon 13 Nov" at 26/14/12px already consumes
most of a **160px** column **[v5 — was 128px; see decision 14, which now sets a provisional
160px minimum]**; weather (`render.ts:526-575` **[v5 — was `:528-572`]**) adds icon +
temperature (~40–50px). If
it wraps, _every_ column gains a second header line — a fixed density cost paid on every day.
Decide truncate-or-drop rather than wrap, and document the header band's fixed per-column
vertical budget. Interacts with decision 14.

### D3. Height and overflow **[CHANGED — substantially rewritten]**

Equal heights via CSS grid `align-items: stretch`.

**Uncapped column view is safe by default, and v1's worry was overstated.** Column height is
bounded by the _busiest day_; list height is the _sum_ over days. For constant per-event
height `max(eᵢ) ≤ Σ(eᵢ)` unconditionally, so column is shorter. This is categorically unlike
#339, whose height was bounded by a _configured time axis_ (16h → 768px) that exists whether
or not events fill it. Content-bounded whitespace is not axis-bounded whitespace. Verified
against all-day chips, `show_empty_days` (sets a floor, never a ceiling) and forced
`split_multiday_events` (list sums every split instance; column takes only the max).

**The one regime where it flips** is narrow-column line-wrapping under a skewed distribution:
per-event height is _not_ constant across layouts (see decision 14). At 100px/event in column
vs 40px in list, `[8,1,1,1,1,1,1]` gives column ≈ 850px vs list ≈ 650px. Needs _both_ skew
and wrapping to bite — a corner, not the common case, and still content-bounded and still
clippable. It is an argument for decision 14, not against the layout.

**`compact_events_to_show` reused as a per-column cap — REVERSED in v3.** The _mechanism_
finding stands and is CONFIRMED: it is a **global budget across all days**, not per-day.
`totalEventsShown` accumulates over the whole window (`events.ts:410` **[v5 — was `:396`]**),
`break`s when
exhausted (`:450` **[v5 — was `:439`]**), and silently `slice(0, remainingEvents)`
(`:470`, with `remainingEvents` computed at `:463` **[v5 — was `:456`]**). Naively rotating
that
gives 5 events _total_ across 7 columns.

> **[v5] Range corrected to match A3-D.** v4 cited the global compaction block as `:388-468`
> here and `:409-475` in A3-D — the same code, two different ranges. A3-D's is the correct one
> and re-verifies exact on `dev`; the three leaf citations above are now inside it. The
> mechanism claim itself is unchanged and re-confirmed by reading the loop.

**But the conclusion I drew from it was wrong** (see A3-D). List height ≈ **Σ**, column
height ≈ **max**; capping the sum and capping the max both mean _"how tall is the card when
collapsed."_ The key keeps one user-level meaning and the mechanism rotates — which is
decision 6, not a semantic change. The mechanism finding therefore means **new per-day code
in the adapter**, not that the key is unsalvageable.

**There is also no "+N more" affordance anywhere in the list path** (confirmed). The only
overflow pill in the codebase is grid-view's (`render-grid.ts:346-354`, backed by
`grid.ts` `hiddenCounts`).

**Resolution [v4 — revised]:**

1. **Column view implements compact as a per-column budget**, reusing the _global_
   `compact_events_to_show` with its meaning rotated (D5 kind 4). Tap/hold to expand already
   exists (`calendar-card-pro.ts:660` hold, `:663` and `:704` tap, `toggleExpanded()`
   `:862-866` **[v5 — was `:539,542,583,729`, which on `dev` are the weather-subscription and
   cache-key paths]**). Post-MVP, but planned for — not excluded.
2. **`compact_events_complete_days` is inapplicable** per-column — it makes a _cross-day
   inclusion_ decision under a _shared_ budget, and a per-column budget has neither. Ignored +
   annotated. **Per-entity `compact_events_to_show`** (`events.ts:350-391`) **stays global in
   both views** — see A3-D; re-basing it would multiply a temporal cap by `days_to_show`.
3. **`max_events_per_column` is deferred, not dismissed.** Rotated compact covers the
   _collapsed, expandable_ height job, so it is not needed for MVP. It does **not** cover the
   _permanent_ truncation job (kiosk / at-a-glance, no interaction), which is a different
   question. Defer; revisit with real usage.
4. **If any cap ships, a per-column "+N more" is mandatory** — lift the markup/style of the
   grid pill, compute `hidden = eᵢ − cap` locally. Do **not** reuse the list compact path's
   silent slice. MVP can make it informational and still satisfy #263: the user _sees_ there
   is more and is not misled.
5. **`max_height` confirmed safe** — `styles.ts:145` sets `max-height` and `:148` sets
   `overflow-y: auto` (both inside `.content-container`, `:144-148`
   **[v5 — was `:151-154`]**), so it **scrolls rather than clips**. Inherit unchanged.

### D4. Editor gate audit **[NEW]** **[v5 — ENTIRELY FROZEN-BRANCH; retitled and re-tensed]**

> **[v5] Read this section as future work, not as a description of code you can open.** Every
> citation below is **[frozen]** — it describes `alexpfau-review-339-time-grid`. On
> `origin/dev` there are **zero** `view === 'time-grid'` gates in `editor.ts`, no `view` select,
> and no `view` key in `config.ts` or `types.ts` at all, because `dev` has exactly one view.
> `grep -rn "time-grid\|timeGrid\|time_grid" src/` returns nothing on `dev`.
>
> The v4 text opened _"Every current editor gate assumes exactly two views"_ in the present
> tense. That is false on `dev` and was the single most misleading sentence in the document
> for anyone trying to execute from it — you would open `editor.ts`, find nothing matching, and
> not know whether you were looking in the wrong place or reading a stale plan. The finding
> itself is sound; only its tense and its provenance were wrong.
>
> **What survives, restated correctly:** when time-grid returns in Phase 5, these gates will be
> _created_, and if they are written as binary `!== 'time-grid'` checks they will silently
> mis-include column. The audit below is therefore a **Phase 5 obligation** and a **Phase 4
> design constraint** (do not introduce a binary gate that Phase 5 has to unpick), not a
> Phase 4 code-reading task. The two items that _are_ actionable on `dev` today are called out
> as such.

Gates as they exist on the frozen branch, and what each becomes with three views:

- `editor.ts:774-777` **[frozen — no view select exists on `dev`]** — the `view` select
  hardcodes two options; needs a `view_column` translation key.
- `:778` (`days_to_show`) **[frozen]** — benign for column by luck. Make it explicit.
- `:826` (Compact Mode) **[frozen; the Compact Mode block is at `:868-884` on `dev`]** —
  **[v3]** shows for column by default, and per A3-D that is now
  _correct_. Make it explicit rather than accidental, and hide
  `compact_events_complete_days` within it for column.
- `:870` (`show_empty_days`) **[v5 — on `dev` this is `addBooleanField('show_empty_days')` at
  `:896`, with its visibility gate at `:899-900`; ACTIONABLE ON `dev` TODAY]** —
  **[v4] becomes a 3-option select in _both_ views**, not a
  switch. A3-B-3: `null` (Automatic) / `true` (Always show) / `false` (Never show), with
  `null` as the new default. Add it to the existing `'null'`-string special case at
  `editor.ts:588-591` and `:660` alongside `show_week_numbers`. Per-view help text under
  Automatic. Three new translation keys × **11** editor languages
  **[v5 — was 10; 35 language files exist, 11 contain an `editor` section, per `AGENTS.md:127`]**.
  **The `editor.ts:899-900` gate must be corrected at the same time — see A3-B-3, where it is
  a shippable defect rather than a cosmetic one.**
- `:908` **[frozen]** — correctly grid-only, unchanged.

> **[v5] Translation warning, carried over from `AGENTS.md:119-163`.** The `editor` section is
> **all-or-nothing**. `hasEditorTranslations()` returns true if the section has _one or more_
> keys, so adding these three keys to only some of the 11 editor languages does not fall back
> to English — every key you missed renders as the **raw key name** (`show_empty_days_auto`) in
> the UI. Either add all three keys to all 11 files, or add them to none and let the whole
> section fall back. Never leave it half-done.

Convert each binary `!== 'time-grid'` to explicit per-view logic **when those gates are
written**. Round-trip the visual
editor for a column config to confirm no forced-override key silently drops user input.

**[v4] The editor's live preview must render the _selected_ view, not the width-measured
one.** This is the mitigation for A3-C.4 and belongs here because it is an editor concern:
the card-edit modal is narrower than any realistic column threshold, so an unmitigated
responsive switch would show list while the user configures column — making every column-only
control appear to do nothing. Decouple preview rendering from the responsive switch, and
verify the real modal width in HA early in Phase 4.

### D5. Forced config and week numbers **[NEW]**

**Forced config must not leave inert editor toggles.** Time-grid's precedent
(`grid.ts:573-586`) force-clones config at fetch time with no escape, while the editor renders
the corresponding toggles unconditionally. **[v4]** **Four** distinguishable kinds of per-view
behaviour are needed, and the adapter must express all four:

| Kind                                                                      | Example                                                                | Editor treatment                                                         |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1. **Per-view default**, user-overridable — **requires an auto sentinel** | `show_empty_days` (`null` = auto, `true`/`false` = pinned)             | **Select**, never a switch. Must offer "Automatic" as a reachable option |
| 2. **Hard force**, structurally required                                  | `split_multiday_events: true` — a column _is_ a day                    | Disabled + annotated "Set automatically in column view"                  |
| 3. **Ignored**, meaningless in this view                                  | `compact_events_complete_days`, `date_vertical_alignment`              | Hidden                                                                   |
| 4. **Reinterpreted** — same control, rotated meaning                      | global `compact_events_to_show` (Σ in list → max-per-column in column) | Normal control **+ per-view help text** stating what it caps             |

**Kind 1 carries a hard requirement, added in v4 after the maintainer caught the hole.** A
per-view _default_ alone is not enough, because config is a **single flat namespace**: the
moment the user sets the key it applies to every view, and a two-state control (switch) makes
"unset" unreachable — the only way back is hand-editing YAML.

**A3-C makes this certain rather than theoretical.** With the responsive fallback, a column
card _is_ a list card below the threshold, so column and list are not alternatives a user
chooses between — they are the same card at two widths. Any kind-1 key without an auto
sentinel will collide for essentially every user.

**So: a key is only eligible for kind 1 if it has an explicit auto/unset value that is
selectable in the editor.** For booleans that means widening to `boolean | null` and rendering
a 3-option select. The codebase already does exactly this for `show_week_numbers`
(`config.ts:48`, `editor.ts:1109-1113`, `:588-591`, `:660`) — reuse that path, do not invent a
second one. If a key cannot take a sentinel, it is not kind 1; pick another kind.

> **[v5] Re-verified exact on `dev`.** `config.ts:48` is `show_week_numbers: null`; the
> `'null'`-string round-trip special case at `editor.ts:588-591` and `:660` is unchanged; the
> `addSelectField` call is at `:1109-1113`. This pattern is the precedent A3-B-3's fix reuses,
> and it survives this pass untouched.

**Kind 4 is new in v4** and exists because of `compact_events_to_show`. It is editable, has
the same default, and is shown in the editor — but its _meaning_ rotates between views
(A3-D). None of kinds 1–3 fit: it is not defaulted differently, not forced, not ignored. The
critique's framing is worth recording, because it is a check on my own reasoning: **a key with
truly one meaning is kind 1 and needs no special handling.** Needing a slot at all is evidence
that "one meaning, rotated mechanism" is a _user-model_ claim rather than an implementation
one — true enough to justify the rotation, not true enough to leave unlabelled. The help text
is what makes the surprise survivable instead of silent.

Note also that **per-entity** `compact_events_to_show` stays **kind 1** — it does not rotate
at all (A3-D). Two keys of the same name, two different kinds, which is itself a reason to be
explicit in the editor copy.

`show_empty_days` was kind 2 in v2; **[v3]** it became an ordinary key in no kind at all
(A3-B); **[v4]** it is the canonical **kind 1** key, and the reason kind 1 now requires an auto
sentinel — see **A3-B-3**.

**Week numbers are deferred in column MVP.** `show_week_numbers` is tri-state
(`editor.ts:1109-1113` **[v5 — v4 wrote `:1159-1163`, which on `dev` is `day_separator_width`;
the document cited `:1109-1113` correctly two paragraphs above, so this was an internal
inconsistency, not a drift]**) and its non-null path renders the full-width `week-row-table`.
In a
column layout the placement is genuinely incoherent for partial weeks: a 7-day window starting
mid-week spans **two** ISO weeks, its first column is not a week-start, and a window can
legitimately need 0, 1 or 2 badges on non-adjacent columns. Options were (a) place on the true
week-start column only, or (b) defer. **Recommend (b) for MVP**, ignored-and-documented per
the `date_vertical_alignment` precedent, revisit with real usage. Default is `null`, so this
affects only opted-in users.

---

## D6. Per-view config overrides **[NEW v8]**

### How this arrived

The maintainer raised it unprompted, and reframed the problem correctly:

> "We are trying to interpret every key that we have already for list view and what meaning
> that would have for column view. I think that's the right approach, however, we should not
> overstress this. […] since we auto-switch between those two views depending on window
> widths, maybe it's smart to have separate variables in a few places to allow users to
> configure things separately, instead of giving existing variables a double-meaning in those
> two views, and then users can only configure one view so that it works for them, and on
> auto-switch (i.e., desktop vs. smartphone), the other view is broken because we are reusing
> a variable."

They noted they had no concrete example in mind. **`day_spacing` is that example**, and it is
not marginal: at `24px` it costs 144px of a seven-column grid. Two more were found by audit
(`show_location`, `compact_events_to_show`); see the shortlist below.

The plan's own framing had been weaker throughout §D — it asked _"what does this key mean in
column view?"_, which admits the answer "something reasonable" and stops there. The stronger
test is whether **one value can serve both views simultaneously**, which is forced by
`view: auto`: the same card instance renders column on a desktop and list on a phone.

### The width inversion — why intuition misleads here

Every reviewer's first instinct is that column view has _more_ room, because it is triggered by
a wide card. The opposite is true of the space that matters:

| Context                              | Per-event horizontal budget |
| ------------------------------------ | --------------------------- |
| 7 columns in a 1200px card, 8px gaps | **~164px**                  |
| Same at 1600px                       | ~228px                      |
| List view on a ~390px phone          | **~300px**                  |

A wide card divided seven ways yields per-item widths **below mobile**. So the failure mode is
not "column view is roomy, defaults are fine" — it is that a config tuned on a phone is
actively too generous once it becomes columns.

### Alternatives rejected

| Option                                     | Why rejected                                                                                        |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Reuse every key with rotated meaning       | The double-meaning trap. Also the status quo the maintainer objected to.                            |
| Flat prefixed keys, `column_show_location` | ~90 keys × 2 = an unusable editor and an unreadable config table.                                   |
| Only new keys, no inheritance              | Forces users to restate their entire config twice to change one thing.                              |
| Separate card instances per view           | Defeats `view: auto` entirely; the user would maintain two cards and a conditional wrapper.         |
| **Nested `column:` with inheritance**      | **Chosen.** Additive, one new key at the top level, absent block = today's behaviour byte for byte. |

### Neutrality of the audit

The per-key classification below was produced by an **independent subagent** that was
deliberately **not** given the shortlist already formed during the design discussion, so its
findings would be a genuine cross-check rather than an echo. This was the maintainer's explicit
requirement ("to ensure remaining neutral and finding all cases").

**Result: 6 of 6 agreement** on the highest-concern keys — `show_location`, `show_description` +
`description_max_lines`, `show_end_time`, `day_spacing`, `compact_events_to_show`, and the
`weather.date.*` group. Convergence from two independent passes is why the classification is
treated as settled rather than provisional.

Four findings were **new** and are the reason the audit was worth running:

1. **`first_day_of_week` is fetch-time**, not presentation. It feeds week-relative `start_date`
   resolution, so it can move the fetch window. It had not been considered.
2. **`weather.position` is fetch-time** — it selects which forecast subscriptions start. The
   natural feature request "weather in the column header only" therefore cannot be an override
   of it, and needs a render-only key.
3. **The separator family rotates** (`day_separator_*`, `week_separator_*`, `month_separator_*`):
   a horizontal rule between day rows becomes a vertical rule between columns. Missed entirely
   in the original pass.
4. **`setConfig` merges shallowly**, which constrains how the override block resolves. See below.

### Config merge semantics — the constraint on how `column:` resolves

The audit reported that some `WeatherPositionConfig` fields are ignored per position. Verified
directly against source:

| Field                             | `weather.date`             | `weather.event`         |
| --------------------------------- | -------------------------- | ----------------------- |
| `show_high_temp`, `show_low_temp` | read (`render.ts:540,546`) | not read                |
| `show_temp`                       | not read                   | read (`render.ts:1091`) |
| `daily_forecast_fallback`         | not read                   | read (`render.ts:1083`) |

> **[v8] This is by design, not a defect — an earlier draft of this section called it one and
> was wrong.** The two positions render different things: a date badge shows a day's high/low,
> an event row shows that event's temperature. They _should_ have different keys. The defaults
> confirm the intent — `config.ts:118-136` gives `date` and `event` **disjoint** default sets,
> not one shared set. The editor offers only the applicable toggles per position
> (`editor.ts:1539-1617`), so the UI cannot produce a dead combination. Hand-written YAML can,
> and the key is then silently ignored — no error, no crash, nothing renders wrongly. That is
> acceptable and **no change is proposed**. The only residue is that a single
> `WeatherPositionConfig` interface spans both sets, so TypeScript does not reject the dead
> combinations; that is cosmetic and not worth a rename against shipped keys (F3).

**What the check did turn up, which matters far more.** `setConfig` merges with a single
shallow spread (`calendar-card-pro.ts:719`):

```ts
let mergedConfig = { ...Config.DEFAULT_CONFIG, ...config };
```

So a user-supplied nested block **replaces** the default block wholesale — supply
`weather.date.show_low_temp` and every sibling default under `weather` is gone, including the
entire `weather.event` block. The card survives this because both call sites guard with
`config.weather?.date || {}` (`render.ts:538`, `:1076`) and every read uses the `!== false` /
`=== true` idiom, so an absent key resolves to its documented default. That is deliberate and
well-built; nothing to fix.

**But that idiom cannot be reused for the override block, and this is the design constraint:**

| Expression                             | `undefined` | `false` | Suitable for                |
| -------------------------------------- | ----------- | ------- | --------------------------- |
| `block.key !== false`                  | `true`      | `false` | defaults with a `true` base |
| `block.key === true`                   | `false`     | `false` | defaults with `false` base  |
| **`'key' in block`** / `!== undefined` | `false`     | `true`  | **the `column:` block**     |

Both truthiness idioms conflate "not set here" with "set to `false`". For `column:` those must
differ: `column.show_location: false` has to mean _off in column view_ while the top-level key
stays `true` for list view — that inversion is the whole point of the block. So resolution is
**presence-based**, and inheritance falls back to the already-merged top-level value, never to
`DEFAULT_CONFIG`. An acceptance test must cover exactly this: an explicit `false` in the
override block against a `true` top-level.

**Consequence for the type.** The precedent to copy from `WeatherConfig` is its _shape_ — one
option type, two rendering contexts, separately configurable — not a permissive spread.
`ColumnOverrides` is a narrowed type listing only category-B keys. `Partial<Config>` would
re-admit every category-E key that G10 forbids, across ~90 keys.

### Why this abolishes D5's kind 4

D5 previously carried a fourth behaviour kind, _"Reinterpreted — same control with rotated
meaning"_, whose sole example was `compact_events_to_show`, with the editor treatment "normal
control + per-view help text".

That is the double-meaning trap wearing a label. Help text does not resolve it: the user still
cannot set the key to two different values, and the auto-switch still breaks whichever view they
did not tune. **The override block is the general mechanism that kind 4 was a broken special
case of.** Anything previously kind 4 is now either category B (override-eligible, stated not
inferred) or category C (distinct new key). Kinds 1–3 are unaffected.

This also dissolves G12's internal contradiction as a side effect: with `compact_events_to_show`
out of MVP (ruled) and the override block available for it later, there is no longer a key that
must simultaneously mean two things.

### Full per-key classification

Categories: **A** shared · **B** override-eligible · **C** axis-rotated (new key) ·
**D** structurally forced or meaningless · **E** fetch-time, never overridable.

**A — shared.** Semantic rather than layout, so a single value serves both views:
`language`, `title`, `title_font_size`, `title_color`, `background_color`, `accent_color`,
`hide_when_empty`, `time_24h`, the entire colour family (`weekday_color`, `day_color`,
`month_color`, the three `weekend_*`, the three `today_*`, `today_indicator_color`,
`event_color`, `empty_day_color`, `time_color`, `location_color`, `description_color`,
`progress_bar_color`), `weather.{date,event}.color`, `weather.{date,event}.uv_index_threshold`,
`weather.event.daily_forecast_fallback`, `entities[].color`, `entities[].accent_color`,
`entities[].label_icon_color`, and both action blocks (`tap_action`, `hold_action`, with all
their sub-keys — interaction behaviour must not change because the layout did).

**B — override-eligible.** Density, sizing and visibility keys where the 164px-vs-300px
inversion bites: `show_empty_days`, `empty_day_text`, `vertical_line_width`, `event_spacing`,
`additional_card_spacing`, `height`, `max_height`, `today_indicator`, `today_indicator_size`,
`weekday_font_size`, `day_font_size`, `show_month`, `month_font_size`,
`event_background_opacity`, `event_font_size`, `show_countdown`, `show_countdown_allday`,
`show_progress_bar`, `progress_bar_height`, `progress_bar_width`,
`event_icon_vertical_alignment`, `show_time`, `show_single_allday_time`,
`time_two_digit_hours`, `show_end_time`, `time_font_size`, `time_icon_size`, `show_location`,
`remove_location_country`, `location_font_size`, `location_icon_size`, `show_description`,
`description_max_lines`, `description_font_size`, `description_icon_size`, ~~the
`weather.date.*` and `weather.event.*` presentation sub-keys (`show_conditions`,
`show_high_temp`, `show_low_temp`, `show_temp`, `show_uv_index`, `icon_size`, `font_size`)~~,
and the per-entity render flags (`entities[].label`, `.show_time`, `.show_location`,
`.show_description`, `.compact_events_to_show`) subject to the precedence question below.

> **[v18] The weather sub-keys are struck through because they are not override-eligible,
> and never were.** `weather` is a whole-object `FETCH_TIME_KEY` (`view.ts:198`), and no
> weather key appears in `COLUMN_OVERRIDE_KEYS` — so `column: { weather: … }` fails
> validation rather than taking effect. Listing them here as Category B described a
> capability the card does not have.
>
> The classification reasoning still holds in the abstract: these keys really are pure
> presentation, and a narrow column really would want different ones. What it missed is
> that eligibility is decided per _top-level key_, and `weather` is claimed whole by the
> fetch boundary before its sub-keys are ever considered. Splitting the object so its
> presentation half could be overridden is possible but has never been specified, and is
> not required by anything currently planned — the column-view weather design reuses
> `show_conditions` with view-dependent _meaning_ rather than a per-view value.

**C — axis-rotated.** Covered by the table in the spec.

**D — structurally forced or meaningless.** `compact_events_complete_days` (no coherent
cross-day pool once the budget is per-column), `split_multiday_events` and
`entities[].split_multiday_events` (a column _is_ a day — forced true), `date_vertical_alignment`
(positions a rowspan date cell that column view does not have — see A3-A), the week-number
family (`show_week_numbers`, `show_current_week_number`, `week_number_font_size`,
`week_number_color`, `week_number_background_color`), deferred per D5.

**E — fetch-time.** Listed exhaustively in the spec.

### Highest-concern shortlist, with realistic values

1. **`show_location: true`** — `Humboldt-Universität zu Berlin, Unter den Linden 6, 10117
Berlin, Deutschland` is unremarkable in a list row and wraps to several lines in a 164px
   column, so the busiest day dictates the height of every column.
2. **`show_description: true` + `description_max_lines: 3`** — can triple event height in a
   column.
3. **`show_end_time: true` + `show_countdown: true`** — `09:00 - 10:30` plus `in 2 hours`
   competes with the title on one line.
4. **`day_spacing: 18px`** — pleasant list rhythm; removes 108px from a seven-column grid
   before content.
5. **`compact_events_to_show: 3`** — three events total when collapsed, or up to 21 if
   reinterpreted per column. This is exactly the ambiguity kind 4 institutionalised.
6. **`show_month: true` with date weather** — a header reading
   `Wednesday 12 August 🌧 23°/17° UV6` wraps every column and raises total grid height.

### Cost, and what is deliberately deferred

The editor is ~2,000 lines and the most fragile file in the repo (§F, and the HA 2026.5+
`ha-input` breakage). Every new control needs a string in all 11 editor-translated languages,
and a _partial_ `editor` section renders raw key names in the UI rather than falling back to
English (`AGENTS.md`, translations section). So the editor cost is real and non-linear.

The proposal is therefore **YAML-first for a curated subset of category B**, with editor
controls following. Documented as such, which is what E1 requires — an excluded key must be
documented as excluded rather than silently inert. **Awaiting explicit maintainer confirmation**
that editor controls may lag the YAML support by a release.

---

## E. Cross-cutting acceptance criteria

> **Verified against `origin/dev` @ `29b8226`.** This section carries no `src/` line citations;
> the `AGENTS.md` reference in criterion 2 re-verifies at `AGENTS.md:119-163`.

Both come from ACR's PlannerView hitting **the same two traps** we found in #339, in an
independent codebase, on the same feature type. That makes it a pattern, so it gets named.

1. **No silent config no-ops.** Every existing option either works in column view or is
   documented as not applicable. (ACR shipped `dimFinishedEvents` inert in the Planner —
   issue #1790. #339 silently ignores ~8 shipped options.) Current documented-N/A list:
   `date_vertical_alignment`, `compact_events_to_show` (+ `compact_days_to_show`,
   `compact_events_complete_days`), week numbers, week/month separator _spacing multipliers_.
2. **Every new user-visible string exists in all language files at ship time**, not after.
   (ACR shipped Spanish missing the whole `planner` section — PR #1812. #339 added 6 runtime
   keys to `en.json` only.) Note the all-or-nothing trap in `AGENTS.md`: a _partial_ `editor`
   section defeats the whole-language English fallback and renders raw key names.

**HA soak list — list view must be pixel-identical after phases 1–2b**
**[v5 — was "phases 1–3"; Phase 3 no longer exists, and Phase 4 is where visible change is
*permitted* for opted-in users but still forbidden for everyone else]\*\***:** default config;
compact
mode (all three keys); `max_height` scrolling; multi-day spans under both
`split_multiday_events` settings; all-day events; day weather and per-event weather; entity
labels; per-entity `show_time`/`show_end_time`/text colour; `show_empty_days: true`; a week and
a month boundary in the same window; `today_indicator` with a non-default position;
non-default `vertical_line_width`; **RTL\*\* (the accent is `border-inline-start`, a logical
property — confirm it still flips after extraction); countdown and progress-bar states.

> **[v5] The pixel-identity obligation does not end at Phase 2b.** Phase 4 introduces `view`,
> but a user who does not set it must still get byte-identical list output. Re-run this soak
> list at the end of Phase 4 as well — that is the phase most likely to break it, because it is
> the phase that touches the shared leaves for a second consumer. See A3-A for the worked
> example of a change that passes a screenshot review and still breaks list rendering.

**[NEW] Phase 2 adds warm-cache cases**, which the v1 list omitted entirely — it tested both
split settings but never _toggled_ one against a populated cache, the exact scenario that
exercises the key. With a warm cache: flip `split_multiday_events`; change an entity label;
change an allow/block pattern. Confirm the view updates.

---

## F. Constraints that bind implementation

> **Verified against `origin/dev` @ `29b8226`.** F1's sentinel re-verifies exact at
> `rollup.config.mjs:10`; F3's consumers were re-based (see inline). **F6 is rewritten** — it
> was the one item in this document that was _about_ branch provenance, and it was itself
> written in a branch-dependent way.

1. **Build sentinel.** `rollup.config.mjs:10` tests `NODE_ENV === 'prod'` — _not_
   `'production'`. `NODE_ENV=production npx rollup -c` silently produces a **dev** build while
   reporting success.
2. **Testing — resolved in v3, see Phase 0.** Gates today are `npx tsc --noEmit`,
   `npm run lint`, both rollup forms, then manual HA soak. `npm run format` covers
   `src/**/*.ts` only — **not** JSON. v3 adds a staged safety net _before_ the refactor:
   zero-dependency i18n parity first, then `vitest` for pure logic, then DOM goldens as a
   review artifact. AGENTS.md's "no test framework" is stated alongside "bundle size is a
   design constraint"; a devDependency does not enter the bundle, so the rationale does not
   apply — **amend the doc rather than silently violating it.**

   > **[v6] "DOM goldens as a review artifact" is stale — Phase 0 Stage 2 now specifies them
   > as a hard pass/fail gate.** The two statements contradict; Stage 2's is the newer and
   > stricter one and wins. Left here rather than silently rewritten so the change of status is
   > visible. See Stage 2 for what the gate still needs before it is executable. Also note
   > `npm run check:i18n` (shipped) now sits between Type check and Build in CI, so the gate
   > list above is one item short.
   >
   > **[v7] Contradiction resolved — the gate shipped (PR #390), so F2's wording is now
   > simply wrong rather than merely stale.** Read this clause as: DOM goldens are a **hard
   > pass/fail gate**, mutation-tested, running in CI via `npm test`. The gate list in F2 is
   > two items short, not one — `check:i18n` **and** `test` both sit between Type check and
   > Build. The prose above is preserved only as the record of what was believed in v3.

3. **Config migration is editor-only.** `DEPRECATED_CONFIG_MAP` (`editor.ts:67-72`) is consumed
   solely at
   `editor.ts:381` and `:453` **[v5 — was `:308,380`]**. A YAML-only user's deprecated key is
   _silently ignored_, never
   migrated. Renaming any **shipped** key is a real break for YAML users regardless. (Does not
   affect the 11→8 renames — those never shipped.)
4. **Attribution.** lenaxia's four commits stay as ancestors. Never squash him out.
5. **Communication.** A public epic issue tracks this work and links the column-view requests
   (#14, #263, #253). #339 gets an informational note that column view lands first and that its
   time-grid work is retained for phase 5 — not a verdict on that proposal.
6. **[REWRITTEN in v5] `hide_when_empty` was the first symptom of a document-wide problem, and
   v4 treated it as a one-off.**

   _The finding, corrected:_ `hide_when_empty` exists on `origin/dev`. It landed in commits
   that the frozen `alexpfau-review-339-time-grid` branch does not have. **Any plan item
   touching it must be written against `dev`** — that directive was correct in v4 and is
   retained unchanged.

   _What v4 got wrong:_ the deictic "not visible in **this worktree's** `src/`". There is no
   single "this worktree" — the plan is read from whichever tree the reader has checked out,
   and it is now maintained from a `dev`-based one where `hide_when_empty` is plainly present.
   A statement whose truth depends on the reader's checkout is not a usable constraint.

   _Why this item is worth keeping rather than deleting — it is the plan's own fingerprint of
   its largest defect._ The author noticed that the two trees had diverged **for one key**,
   wrote a careful note about that one key, and did not generalise the observation. But the
   divergence was never key-specific: it affects **every** `src/` citation in the document, and
   the sections drafted from the frozen tree (A3-D, D3, D4, and every `grid.ts` /
   `*-controller.ts` reference) drifted or went stale while the sections the author happened to
   verify against `dev` stayed exact. The drift is **non-uniform** — `styles.ts` −4 lines,
   `render.ts` +3, `events.ts` +14, `editor.ts` +26 — so no global offset would have rescued
   it. F6 is the moment the problem was visible and was recorded as a footnote instead of a
   process rule. **The v5 rule it should have become: every section states the branch its
   citations were verified against, and `dev` is the default.** See the revision-history note
   at the top of this document.

   _Phase 4 obligation, unchanged:_ specify `hide_when_empty`'s interaction with column view.
   `visibleEventCount` windows by `days_to_show`, so the count and the rendered column set must
   not disagree. **[v5]** Note this now interacts with the A3-B-3 defect: with
   `hide_when_empty: true` and `show_empty_days: null`, the two features disagree about what
   "empty" means unless the resolved value is used consistently.

---

## G. Open questions

> **Verified against `origin/dev` @ `29b8226`.** No `src/` citations in this section. **[v5]**
> Items 6 and 8 remain genuinely open and cannot be closed on paper; item 9 remains true.

> **[v6] Blockers raised by an independent review pass, recorded not decided.** Each needs a
> maintainer ruling; none can be resolved by reading the source. Items G10–G13 are **hard
> prerequisites for Phase 4 implementation** — an engineer cannot start Phase 4 without them.
> They are listed here rather than inline so they cannot be mistaken for settled design.
>
> - **G10. `requestedView` vs `effectiveView` is undefined.** The width fallback is specified
>   as render dispatch, but it changes **data** semantics upstream: `show_empty_days: null`
>   resolves per-view, global compaction switches from a shared budget to per-column, and
>   column forces `split_multiday_events: true`. The proposed helper takes `this._config`,
>   which below the breakpoint still says `column` while the card is rendering `list` — so it
>   resolves for the wrong view. Splitting also happens _before_ caching, so an effective-view
>   transition may require reprocessing rather than a re-render. Needs: both terms named
>   explicitly, every resolver and adapter hook taking `effectiveView`, and a stated rule for
>   what a transition invalidates (regroup / reprocess / refetch).
> - **G11. Phase 4's outer layout is specified two incompatible ways.** `.content-container`
>   is a row-direction **flex** container and width is described with `flex: 1`, but D1 needs
>   CSS-grid `column-gap` and spacer tracks and D3 gets equal heights from grid
>   `align-items: stretch`. Flex and grid differ materially in max-width behaviour, spacer
>   tracks, variable column counts and equal-height mechanics. One must be chosen, with the
>   concrete track/flex rule written out.
> - **G12. Compact-mode MVP scope contradicts itself three times.** A3-D maps
>   `compact_days_to_show` to fewer columns and makes the cap per-column; D3 says column
>   "implements" per-column compaction and then calls it Post-MVP; E1 lists both keys as not
>   applicable. Rule it in or out and update A3-D, D3, D5, E1 and G2 **together**.
> - **G13. Phase 4 needs a measurement spike before implementation.** Minimum column width,
>   hysteresis band, weather truncate-or-drop, header vertical budget, whether
>   `min_day_width` is public config, and — most consequentially — **which column
>   count drives the threshold**. With `show_empty_days: false` the formula still uses
>   `days_to_show`, so a 7-day config with events on 2 days demands a 7-column-wide container
>   before it will show 2 columns, which defeats dense mode outright.
>
> Two further findings are recorded in place rather than here because they affect work that
> ships **before** v4.0.0: the Phase 2b cache scope (see the note in Phase 2b) and the Phase 1
> DOM-gate test design (see Phase 0 Stage 1).

1. ~~Decisions 11, 12, 13, 14~~ **SETTLED in v3** — see A2 and A3.
2. ~~Does `compact_events_to_show` render "+N more"?~~ **SETTLED: it does not.** The key _is_
   reusable per-column though — see A3-D and D3.
3. **Separator spacing multipliers in column view** — drop and document. **SETTLED in A3-E**;
   an explicit opt-in gutter key defaulting `0px` is additive later.
4. **Does column view ship in v4.0.0 alone, with time-grid in v4.1?** Recommendation: yes.
   Column view is the more frequently requested of the two and depends on none of the
   time-axis work; shipping them together would gate it on work it does not need.
5. **v4.0.0 is a milestone choice, not a semver necessity.** Nothing in phases 0–4 is breaking
   — `view` is additive and defaults to `list`. Worth naming as a deliberate choice.
   _Opportunity:_ if a major is happening anyway, it is the natural moment to batch other
   deferred breaking changes (e.g. retiring the editor-only deprecation map). Flagged, not
   scoped.
6. **[v3] Still genuinely open:** the hysteresis band for the view-switch threshold (A3-C).
   Needs a real HA dashboard to tune; cannot be decided on paper.
7. **[v4] RULED:** `show_empty_days` defaults to showing empty days in column view — but via an
   **auto sentinel**, not a bare per-view default. `null` (Automatic) / `true` / `false`,
   rendered as a select. See **A3-B-3**. Back-compat verified free; no gap affordance owed.
   **[v5] The "back-compat verified free" half of this is now known to be wrong** — there is a
   fourth consumer and a shippable defect. The _ruling_ stands; the cost estimate does not. See
   A3-B-3.
8. **[v4] To verify in HA, not on paper:** the actual card-edit modal width, which determines
   how severe A3-C.4 is (the mitigation is mandatory regardless). **[v5]** Now also determines
   whether the provisional `min_day_width: 160` (decision 14) survives measurement.
   **[v6] MEASURED — 480px.** A3-C.4 is real and severe: a user configuring a 7-day column view
   watches the preview fall back to list _while editing_. The mitigation is load-bearing.
9. **No runtime or visual HA testing has happened on any of this yet.** **[v6] Superseded** —
   Phase 2b was A/B-verified against the live instance, and the G13 spike measured six
   placements there.
10. **[v5] Un-decided and un-decidable on paper: the real rendered width of an HA masonry or
    sections column.** Every threshold in A3-C and decision 14 is arithmetic over an assumed
    container width. The arithmetic is sound; the input is a guess. First measurement task in
    Phase 4. **[v6] MEASURED for sections; still open for masonry and panel** — every view on
    the test instance is `hui-sections-view`, so no masonry sample existed to measure. The
    sections result falsified the assumed input: a default section is **500px**, not the
    ~1200px the sizing argument had assumed. See the methodology note below, and G14 in the
    spec for the ruling that followed.

### G13 spike methodology — and the discarded first attempt **[NEW v6]**

Recorded because the first attempt produced a **plausible, internally consistent, and wrong**
table, and the failure mode is not obvious.

**What was wrong.** The first pass drove Playwright's `setViewportSize` across a range of
widths and measured the card after each resize, without reloading. HA's sections layout does
not settle synchronously after a viewport change — it recomputes column count and width
asynchronously, and the measurement landed mid-transition. The resulting series was
**non-monotonic**: some narrower viewports reported _wider_ cards than wider ones.

**Why that was nearly missed.** A non-monotonic table is physically impossible for this layout,
which is what exposed it. But it was not obviously garbage — the numbers were all in a
believable range, and the table contained rows supporting **both** available conclusions. Read
one way it showed the card capped at 500px regardless of viewport; read another it showed the
card growing past 500px. Either reading was defensible from the same data, so the spike would
have "confirmed" whichever hypothesis was held going in. **A measurement that can support
either conclusion is not evidence.** The tell was the physical impossibility, not the numbers.

**The method that works:**

1. **Reload the page at each viewport width.** Do not resize a live page. The layout is only
   trustworthy after a fresh load at the target width.
2. **Query the inner `div.content` inside `hui-sections-view`**, not the view host. The host
   spans the viewport; the content box is the width a card actually gets.
3. **Read the CSS custom properties directly** rather than inferring the cap from observed
   widths — `--ha-view-sections-column-max-width` and `--ha-view-sections-column-min-width`.
   This is what established that 500px is a **themeable default, not a hard cap**, which the
   observed widths alone could not have distinguished.

Point 3 is the one that changed the ruling. Had the spike only sampled widths, 500px would have
looked like an immovable ceiling, and the design would have been built around working within
it. Reading the property revealed it as a default the user can raise — which is what makes
`min_day_width` a coherent escape hatch rather than a token gesture.

---

## H. Explicitly out of scope

> **Verified against `origin/dev` @ `29b8226`.** No `src/` citations in this section.
> **[v5] The document-length/split recommendation is deliberately not actioned in v5** — a
> restructure bundled with a correctness pass would make neither reviewable. Proposed
> separately. If it happens, **A3-A's worked `date_vertical_alignment` → `align-self` failure
> analysis must survive it intact**: it is the proof that a screenshot pass misses this class
> of bug, and `today_indicator` defaults to `false` (`config.ts:61`), which is precisely why
> such a break would go unnoticed.

Overlap lanes, time axis, now-line (time-grid's, phase 5); paging and date-range navigation
(#185); per-person lanes (#203); `date_horizontal_alignment` and its naming harmonisation;
line-style keys for any separator; interactive expand on the "+N more" pill.

---

## Archived Y2 Pre-Split Spec Snapshot

The section below is the `column-view.md` text as it stood immediately before the Y2 split
that produced the short current-state spec. It is retained as archival rationale and history;
the current spec remains the authority when this snapshot disagrees with code or with the spec.

## Column view — design and implementation plan

**Status:** Phases 0, 1, 2 and 2b are complete and shipped in 3.x. **Phase 4 — the column
view itself — is substantially implemented** on `feature/column-view-v4` and is being
live-tested. Phase 5 (time grid) has not started. **Target release:** v4.0.0.

| Phase | What it covers                         | State                                                                                                 |
| ----- | -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 0     | DOM golden gate, i18n integrity script | Shipped in 3.x (PR #390)                                                                              |
| 1     | Shared leaf renderers (`leaves.ts`)    | Shipped in 3.x                                                                                        |
| 2     | Presentation models                    | Shipped in 3.x                                                                                        |
| 2b    | Cache correctness                      | Shipped in 3.x                                                                                        |
| 4     | Column view + `ViewAdapter`            | **In progress** — renders, with density, week numbers, separators, progress bar and per-event weather |
| 5     | Time grid                              | Not started; commits preserved on the frozen `alexpfau-review-339-time-grid`                          |

**Scope:** a second view (`view: 'column'`) that renders the existing agenda list rotated —
days side by side as columns rather than stacked — without changing how the list view looks
for anyone who does not opt in.

This is the current implementation specification. Historical arguments and superseded
alternatives are archived in [column-view-rationale.md](./column-view-rationale.md).
Open work that no section here owns is indexed in
[v4-backlog.md](./v4-backlog.md) — **read that before starting a stage**.

::: warning Before Editing A Template
The DOM gate is whitespace-sensitive in a way that is not obvious and has a destructive
failure mode. See [§F.8](#f-constraints-that-bind-implementation).
:::

---

### A. Decisions ledger

#### A1. Approved and settled decisions

| #       | Decision                                                                           | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1       | View name is **`column`**                                                          | `view: 'list' \| 'column'`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2       | **`navigation_days` is deleted**, folded into `days_to_show`                       | Removed, not renamed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 3       | Column-view MVP excludes overlap lanes, time axis, now-line                        | Those belong to time-grid.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 4       | **Date at the top** of each column                                                 | The original 128px comparator is superseded by decision 14's 160px provisional, itself now corrected to the shipped 140px **[v12]**; the date header remains sound and has more room.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 5       | **Header rule is fully configurable** — width, colour                              | Start visible by default.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 6       | Between-day chrome rotates 90°; within-day chrome stays untouched                  | The organising thesis.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 7       | `date_vertical_alignment` is **ignored** in column view                            | Naming harmonisation with a future `date_horizontal_alignment` is out of scope.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 8       | Phase 1 is **shared leaf extraction**; list keeps its `<table>`                    | The drift lives in leaves, not containers. See A3-A and Phase 1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 9       | #339 branch is **frozen**, not rebased                                             | lenaxia's four commits are preserved as ancestors for attribution.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 10      | Feature milestone is **v4.0.0**                                                    | This is a choice, not a semver requirement.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 11 + 12 | Below a width threshold, the **view falls back to list**                           | Do not clamp the number of columns. See A3-C.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 13      | The list DOM equality gate is retained, tightened, shipped, and mutation-tested    | Phase 0 PR #390 delivered `tests/list-dom.test.ts`; Phase 1 must keep it green.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 14      | `column.min_day_width` ships at **140**, is **measured**, and is **public config** | **[v12] The shipped default is 140, not the 160 G13 reported.** G13 measured the floor a column survives at correctly, but computed the fit as `160 × 3 + 20 = 500` against a measured 500px section — arithmetic carrying no term for the card's own horizontal padding, which is real. Restoring the full formula leaves 140 as the largest floor that still fits three columns in a default section, which is the constraint that sets the number. 128 remains disproven. G14 makes it a user-facing key — the escape hatch that keeps decision 11+12 ("do not clamp the number of columns") viable. **[v12] It lives inside `column:`**, not at the top level: it is Category C, meaningless in list view. |

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#a-decisions-ledger)

---

### A3. Maintainer corrections and current rulings

#### A3-A. "No impact on list view" = no _visible_ change, not no code change

**Verified against:** `origin/dev` @ `29b8226`, except the three grid opacity values, which are
**[frozen]** — `styles.ts` on `dev` is 703 lines and has no grid section at all.

> _"what we do in code is our thing, and we are free to do what's needed. our final
> architecture should be optimized to cover both views."_

This removes the constraint decision 8 was built on. The consequences are large enough that
the phasing was reconsidered from scratch rather than patched.

**What I found when I actually checked the markup, rather than assuming:**

The seam is already much further along than v2 assumed.

- `.content-container` (`render.ts:86` **[v6 — was `:83`]**) holds day-blocks and separators as **siblings**. The
  card-level axis flip is a _container_ change, not a restructure.
- Each day is **already one self-contained node** — `<table class="day-table">`
  (`render.ts:678-692`). The day boundary is already in the right place for a shared
  component.

So the only genuinely axis-bound part is the day's **internals**: `rowspan`
(`render.ts:930`) welds the date cell to the left edge and cannot produce a date-on-top
variant.

**Where #339's duplication actually came from.** [v4 — corrected] v3 said the rowspan table
_forced_ the duplication. That is wrong, and the distinction changes the phasing. The drift
#339 exhibits is entirely in **leaves**, not containers — three different past-event opacities
for one concept (`styles.ts:487-488` list `0.6`; `:986-987` grid `0.55` **[frozen]**;
`:1061-1062` grid all-day `0.55` **[frozen]**). The grid re-implemented the _leaf_ renderers.
It did not have to: every leaf the shared block needs is already DOM-agnostic —
`.event-content` (`render.ts:942-1003`), `renderDateColumn` (`:490-611`), colour precedence
(`:497-516`). A flex grid container could have consumed those leaves unchanged. The rowspan
blocked reuse of the **container**, and container reuse is not what prevents drift. **Sharing
the leaves is.**

**Therefore: list keeps its table.** [v4 — REVERSES v3's headline change]

v3 proposed converting list's day block from `<table>` to flex so a single flip-able
`DayBlock` served both views. That was an over-correction, and I am reversing it:

- The two goals v3 fused are separable. _Kill the drift_ → extract shared **leaf** renderers.
  _Serve both views_ → give column its **own** flex container consuming those leaves.
- List needs date-on-**left**. Only column needs date-on-**top**. So only column needs the
  non-table container; list never has to change.
- Parallel containers over shared leaves is **exactly the `ViewAdapter.render` shape** the
  adapter work wants. **[v5]** That work was phase 3 and is now **folded into phase 4** — see
  section C. By Phase 5 there are three renderers anyway (table list / grid column / grid
  time-axis). Forcing two of them to share one flip-able DOM is _less_ consistent with the
  adapter, not more.
- The risk asymmetry is the decisive part. Rewriting list's container puts **100% of existing
  users** at pixel-regression risk to serve a view they do not use, gated only by human
  screenshot comparison. Leaf extraction leaves the list container untouched, which satisfies
  the no-visible-change constraint **by construction rather than by probability** — and
  restores a hard automated gate (list DOM must be byte-identical; see Phase 0).
- The relaxed constraint (A3-A) _permits_ code change; it is not a mandate to change the list
  renderer, and should not be spent where it buys nothing.

**The concrete proof that unification was riskier than v3 priced it.** v3 claimed
`date_vertical_alignment`'s `vertical-align` maps to `align-self`, "equivalent". **It does
not,** and the failure is invisible to a template diff:

- `.date-column` is `position: relative` (`styles.ts:317`, reinforced by an inline
  `style="position: relative;"` on the `<td>` itself at `render.ts:931`);
  `.today-indicator-container` is `position: absolute; height: 100%` (`styles.ts:332-340`).
  Under `rowspan` (`render.ts:926-937`) that `100%` resolves against the **full stacked height
  of the day**, so with the default `today_indicator_position: '15% 50%'` the indicator centres
  over the whole day block.
- In flex, `align-self: center` overrides `align-items: stretch` and **shrinks the item to
  content height** — collapsing `height: 100%` to roughly one line of date text. The indicator
  would snap from the full day to the ~50px date band.
- The correct mapping is two-part: keep the date column `align-self: stretch` and move its
  _content_ with `justify-content` on an inner flex column. v3's one-line mapping was wrong.

Blast radius is bounded (`today_indicator` defaults `false`, `config.ts:61`), so this would
have hit only opted-in users on multi-event days — which is precisely the kind of defect that
survives a screenshot pass. It is retained here as the worked example of why the list
container is not worth touching. **[v5] This analysis is load-bearing and must survive any
future restructuring of this document intact:** it is the only worked proof in the plan that a
human screenshot pass does not catch this class of bug, and the `false` default is exactly why
it would go unnoticed.

**Target structure — one flip, not two:**

```
.content-container   flex-direction: column (list)  |  CSS grid, N tracks (column view)
list day block       unchanged <table> + rowspan     (date on left)
column day block     new grid cell content           (date on top)
both                 consume the SAME leaf renderers
```

> **[v8, G11] The column container is CSS grid, not row-direction flex.** The `min-width: 0`
> carry-over below was written for a flex container and is superseded: `minmax(0, 1fr)` on the
> grid tracks solves the same shrink-to-content problem once, on the container, rather than
> requiring an explicit escape on every child. The `align-self` analysis above is unaffected —
> `align-items: stretch` is the default in grid too, and `align-self: center` shrinks the item
> to content height in grid exactly as it does in flex.

Carry-overs that still apply, to the **column** container only:

- `.date-column` fixed width → the date is a header band above the events, not a side column,
  so this becomes a block-level header rather than a sized flex item (D2).
- ~~Events pane → `flex: 1` **plus `min-width: 0`**~~ **[v8]** superseded by G11's
  `minmax(0, 1fr)`. The underlying trap is real and unchanged — a bare `1fr` is
  `minmax(auto, 1fr)` and refuses to shrink below content width, so a long title overflows the
  card. `table-layout: fixed` (`styles.ts:287-296`, property at `:290`) handles this implicitly
  in list view today. G11 fixes it once on the grid container instead of per child.
- The week-number separator (`<table class="week-row-table">`, `render.ts:246-312`; the
  `<table>` itself is emitted at `:289`) stays as-is for list; column defers week numbers
  entirely (D5).

#### A3-B. `show_empty_days` resolves through an explicit auto sentinel

**Verified against:** `origin/dev` @ `29b8226`.

> **[v17] Superseded — the sentinel was not built, and will not be.** Ruled by the
> maintainer on 2026-08-12: `show_empty_days` **stays `boolean`**. It is not widened to
> `boolean | null`, there is no `Automatic` option, and no resolver reads an unset value.
>
> What ships instead is the general mechanism rather than a key-specific one:
> `show_empty_days` is a member of both `COLUMN_DEFAULT_OVERRIDES` and
> `COLUMN_OVERRIDE_KEYS` (`view.ts:436`, `:35`). In column view the column default of
> `true` **stands on its own and does not inherit the top-level value at all**; the escape
> hatch is `column: { show_empty_days: false }`. That delivers every outcome the three-row
> table below describes, without a sentinel and without a third control state.
>
> This is the same move [v8] already made against kind 4 in D5 — the override block turned
> out to be the general solution that a per-key special case was approximating. The
> argument is recorded at `view.ts:404-431`, including why the rule is deliberately _not_
> "inherit unless the user said otherwise": that variant needs a record of which keys were
> typed by hand, and makes two cards with identical effective list behaviour render
> differently in column view depending on whether a value was typed or defaulted.
>
> **What survives:** everything below about what the two views need — a list reads fine
> with blank days omitted, a column grid does not, because the columns stop corresponding
> to consecutive days. That requirement is unchanged and is exactly what the column default
> satisfies. **What does not:** the `null` row of the table, the `boolean | null` widening,
> the 3-option select, and the `show_week_numbers` sentinel pattern cited as precedent.

`days_to_show` bounds a **calendar-day window** (`events.ts:1287-1293`; hard post-filter
`:71-92`). `show_empty_days: false` filters empty days out of the rendered set (`:393-398`);
`show_empty_days: true` generates placeholder days (`:505-545`, `:561-598`, placeholder
`_isEmptyDay: true` at `:586`). Rendering already expects gaps (`render.ts:725-727`).

Column view must support both products:

| Stored value             | Meaning                  | List view       | Column view     |
| ------------------------ | ------------------------ | --------------- | --------------- |
| `null` **(new default)** | **Automatic — per view** | hide empty days | show empty days |
| `true`                   | Always show              | show            | show            |
| `false`                  | Never show               | hide            | hide            |

Column therefore defaults to contiguous columns, but not through a bare per-view default. The
key is flat config, and the responsive fallback means the same card is column above the
threshold and list below it. Once a user sets a flat boolean, it applies to both views; with a
switch there is no way back to unset/auto except editing YAML.

Implementation requirements:

- Widen `show_empty_days` from `boolean` to `boolean | null` (`types.ts:22`).
- Add a resolver used by render and editor paths: `null` resolves by **effective view**, not
  merely requested `this._config.view`.
- Replace `addBooleanField('show_empty_days')` (`editor.ts:896`) with a 3-option select,
  following the existing `show_week_numbers` pattern: default `null` (`config.ts:48`),
  `'null'` string option (`editor.ts:1109-1113`), round-tripped at `editor.ts:588-591` and
  `:660`.
- The `empty_day_text` gate at `editor.ts:899-900` must ask the resolved question. With
  `hide_when_empty: true` and `show_empty_days` unset, the field is visible in column view and
  hidden in list view.
- Labels: `Automatic`, `Always show`, `Never show`, with per-view help text under
  `Automatic`. Add the three editor translation keys to `en.json`, and to any other language
  file whose `editor` section you can complete. A partial section is fine — `translateEditorKey()`
  falls back per key, so an untranslated label renders in English.

  > **[v14]** Superseded detail. This bullet previously required adding the keys "to every
  > language file that has an `editor` section, or to none", because the old whole-language
  > swap turned a partial section into raw key names in the UI. That hazard is gone:
  > `hasEditorTranslations()` has been deleted and the fallback now resolves per key. See
  > _Adding or changing a translation_ in `AGENTS.md`.

`hide_when_empty` counts events as if expanded (`calendar-card-pro.ts:236-239`), so
`compact_events_to_show: 0` cannot hide a card that can never be tapped open. A placeholder is
not content (`:243-251`), and empty **columns** must not count as content either.

If a user chooses `Never show`, the column count varies as events change. Fix width jitter in
CSS with a `max-width` guard, not by changing key semantics. A skipped-day marker is optional
polish for `Never show`, not required for the MVP default.

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#a3-b-show_empty_days--my-force-it-on-was-wrong)

#### A3-C. Narrow screens fall back to list view

**Verified against:** `origin/dev` @ `29b8226`. The modal-width figures still need live HA
verification.

> **[v16] Partly superseded by A3-G.** The wholesale flip described here is now the _default_
> case rather than the only one: width first reduces the column count down to
> `min_days_to_show`, and this fallback fires below that floor. Since `min_days_to_show`
> defaults to `days_to_show`, everything below still describes default behaviour exactly. The
> threshold formula is unchanged — it is now `computeColumnThresholdPxFor(config, days)`
> evaluated at `days_to_show`. Risks 1-5 all survive intact.

Users can set a screen width above which column view is active; underneath, render list view.
This supersedes column-count clamping. List view is already designed for narrow screens, while
cramped columns are not useful. The fallback threshold is computed from:

```
min_day_width × days_to_show  +  card padding  +  (days_to_show − 1) × gutter
```

User-facing rule: **above the threshold you get the columns you asked for; below it you get
list.** Do not silently drop days.

Design against these risks:

1. **Oscillation.** Switching view changes card height, which can change dashboard width and
   switch the view back. Use hysteresis: separate up/down thresholds.
2. **HA masonry/sections quantise widths.** Test at real Home Assistant layout widths.
3. **Both renderers live in one bundle.** No lazy loading under the one-file Rollup constraint.
4. **Editor preview must render the selected view, not the measured fallback.** The card-edit
   modal is narrower than realistic column thresholds, so an unmitigated fallback would show
   list while users configure column-only options. Decouple preview rendering from the
   responsive switch and verify the modal width in Phase 4.
5. **Keys are viewport-live.** Below the threshold, column-only keys are inert and list-only
   behaviour is live. Accept this cost, document it, and use D5 kind-4 help text to name which
   view each key affects.

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#a3-c-narrow-screens--view-fallback-not-column-clamping)

#### A3-D. Compact mode rotates the global height budget

**Verified against:** `origin/dev` @ `29b8226`. The `events.ts` budget ranges `:409-475`,
`:413-441`, and `:350-391` re-verify exact.

> **[v8] G12 ruling — the two compact keys are split.** `compact_days_to_show` is **in MVP**;
> `compact_events_to_show` is **out**. The analysis below is why the rotation is correct, and
> stands as the design for when it ships — but it is **not MVP scope**, and D6 (not a shared
> key with per-view help text) is now the mechanism it will use.
>
> **[v14] Superseded — the split did not survive implementation.** _Neither_ key ships in
> column view: the whole compact family is inert there (commit `376bdcc`), and the tap/hold
> `action: 'expand'` that drives it is a measured flat no-op. The G12 split was a scoping
> decision made before it was clear that in a grid these keys remove columns rather than
> reduce height. What replaces compact mode in column view is the density framework
> (`min_days_to_show` + the width-fallback rule), which degrades column _count_ against
> available width instead of trading it for width. See D8 and the density section.

The user-level meaning of `compact_events_to_show` is _how tall the card is when collapsed_.
That meaning rotates through different height functions:

- **List:** height ≈ **Σ** events, so a global budget caps height.
- **Column:** height ≈ **max** over columns, so a per-column budget caps height.

Column view would therefore implement compact mode as a per-column budget. That is new adapter
code, not reuse of the current `totalEventsShown` loop (`events.ts:409-475`). Tap/hold
expansion already exists (`calendar-card-pro.ts:660`, `:663`, `:704`, `toggleExpanded()` at
`:862-866`). **Deferred past MVP per G12**, because a per-column budget is a genuinely
different algorithm and it is the half that entangles with G10's transition rule.

Limits and related keys:

> **[v14] Two rows below were overtaken by implementation and are corrected in place.**
> The compact family was ruled inert in column view wholesale (commit `376bdcc`), for a
> reason this section did not anticipate: it analysed each key as a _height_ control and
> asked how the height budget rotates, but in a grid every one of them removes **content
> or columns** while the card occupies identical width. A collapsed column card is not
> shorter — it is emptier. The struck rows are kept rather than deleted because the
> rotation analysis remains the right design for if per-column compaction ever ships;
> only the interim behaviour changed. See D8 for the full inert set.

- `compact_events_complete_days` is inapplicable per-column. It is a cross-day inclusion
  filter under a shared budget (`events.ts:413-441`); a per-column budget has no shared pool
  and renders every column. Ignore and annotate.
- ~~**`compact_days_to_show` maps to fewer columns when collapsed — in MVP.** The unit is "days"
  in both views, so it needs neither an override nor a new key; it is simply N.~~
  **[v14] Reversed — it is inert in column view.** The unit does map cleanly, which is why
  this looked safe; the problem is what the mapping _means_. Capping the day slice deletes
  trailing columns from a grid whose width does not shrink, so "compact" renders three wide
  columns where seven narrow ones were configured. That is not a compact card, it is a
  different card. The user's framing settles it: a compact toggle that trades column count
  for column width is not a height control at all.
- ~~Per-entity `compact_events_to_show` must stay global in both views (`events.ts:350-391`). It
  is a temporal cap — e.g. next one birthday — not a height cap; rebasing it per column would
  multiply the cap by `days_to_show`.~~
  **[v14] The rebasing argument stands; the conclusion drawn from it does not.** Rebasing
  per column would indeed multiply the cap, so it was not done — but _leaving it global_ in
  column view is not the safe fallback this row assumed. The bucket at `events.ts:419` is
  keyed `${entityId}__${configIdx}`, i.e. **one budget per entity per card**, so a cap of 1
  on a single-entity card yields exactly one event in the entire grid and collapses every
  column but one. Both options were unacceptable; the key is inert in column view instead.
  This is the correction referenced from D8.
- **[v8]** When per-column compaction does ship, it is configured as `column.compact_events_to_show`
  under D6's override block, **not** as the same flat key carrying two meanings. `view: column`
  falls back to list below a width breakpoint, so one card instance renders both views and a
  single value cannot serve both.
- `max_events_per_column` is deferred, not dismissed. Rotated compact covers the collapsed,
  expandable height job; it does not cover permanent kiosk-style truncation.
- If any cap ships, a per-column `+N more` indicator is mandatory. Lift the grid pill style,
  compute `hidden = eᵢ − cap` locally, and do not reuse the list path's silent slice.
- `max_height` inherits unchanged: `.content-container` sets `max-height` at `styles.ts:145`
  and `overflow-y: auto` at `:148` inside `:144-148`, so it scrolls rather than clips.

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#a3-d-compact-mode-in-column-view--the-rotation-is-correct)

#### A3-E. Separator defaults and spacing multipliers

**Verified against:** `origin/dev` @ `29b8226`. The `SEPARATOR_SPACING` finding, including the
comment/value mismatch, re-verifies exact.

Separator widths already default to `0px` today (`config.ts:53` day, `:55` week, `:57` month).
Rotating the rules is a default-config visual no-op.

The extra horizontal space at week/month breaks is not a width default; it is the spacing
multiplier (`SEPARATOR_SPACING`: week `1×`, month `1.5×`, `constants.ts:87-92`). In list view
it becomes margin above/below the rule. A uniform CSS `column-gap` cannot vary one gutter.

Resolution:

1. List keeps its derived multipliers unchanged.
2. Column-view MVP drops the multipliers and documents the loss.
3. A later explicit opt-in gutter key, defaulting `0px`, can reproduce them with spacer tracks.

`constants.ts:90` says "2x day_spacing"; the value at `:91` is `1.5`. Fix that incidental
comment when nearby.

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#a3-e-separator-defaults--two-different-mechanisms)

---

#### A3-F. Density key rename **[v15]**

Two Category C keys were renamed before shipping. Nothing had been released, so no migration
is needed and `DEPRECATED_CONFIG_MAP` is deliberately not involved:

| Old name              | New name            | Why                                                                                                                                                                                                                        |
| --------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `min_column_width_px` | `min_day_width`     | `column` appears in zero of the 93 shipped keys; `day` appears in 14. In a time grid the time axis is itself a column, so `min_column_width_px` would be genuinely ambiguous there. No shipped key carries a `_px` suffix. |
| `min_width_fallback`  | `min_days_fallback` | It named the wrong gate. The fallback fires when `min_days_to_show` will not fit — a _days_ floor, not a width. Raising `min_days_to_show` triggers it at a **wider** card with the width key untouched.                   |

The identifiers moved with them: `ColumnMinWidthFallback` → `ColumnMinDaysFallback`,
`resolveMinWidthFallback` → `resolveMinDaysFallback`.

**Both names were substituted throughout this document and the rationale log, including inside
historical entries.** That is a deliberate departure from the rule that archived rulings are
never rewritten. The rule exists so a superseded _decision_ is not falsified; a rename alters
no decision, only a spelling. Leaving the old spelling in place would make
`grep min_day_width` miss half the discussion and invite a reader to conclude two distinct
keys once existed. This table is the record of the old names.

Dropping `_px` costs nothing at runtime: `normalizeColumnValue` parses with
`Number.parseFloat`, so `min_day_width: '140px'` resolves to `140` and an unparseable value
falls back to the default. It does move the unit out of the key name, so the reference row and
the feature-page prose now state "in pixels" explicitly.

#### A3-G. Density framework — width reduces the column count before it changes the view **[v16]**

**Verified against:** `feature/column-view-v4` @ `74ab6e4`. Shipped; `view.ts:1092-1204` is the
implementation and `tests/width-settle.test.ts` pins it.

**Ruled.** Column view no longer answers a single yes/no question about width. It renders as
many columns as the width carries — never more than `days_to_show`, never fewer than
`min_days_to_show` — and only when even that floor will not fit does `min_days_fallback` decide
between the list layout and holding the floor with narrower columns.

Three Category C keys, all inside `column:`:

| Key                 | Type                | Default        | Role                                               |
| ------------------- | ------------------- | -------------- | -------------------------------------------------- |
| `min_day_width`     | number (px)         | `140`          | Width one column needs before another one is added |
| `min_days_to_show`  | number              | `days_to_show` | Floor — the card never renders fewer columns       |
| `min_days_fallback` | `'list' \| 'cramp'` | `'list'`       | What happens when even the floor will not fit      |

**This supersedes two earlier rulings**, both of which forbade exactly what now ships:

1. **A3-C's** "above the threshold you get the columns you asked for; below it you get list. Do
   not silently drop days." The wholesale flip is now the _default_ case rather than the only
   case — see the collapse property below.
2. **G13's** "the rendered column count is determined by grouping, never by available width",
   which recorded auto-fit as the _rejected_ alternative. The objection there was honesty, not
   mechanism: a user who asks for 7 days and is shown 3 has no signal explaining the difference.
   That objection stands and is answered by keeping the **default floor at `days_to_show`**, so
   no user sees a silent drop until they ask for one.

**The defaults collapse to the old behaviour exactly.** `min_days_to_show` defaults to
`days_to_show`, which makes the staircase one step high: either every configured column fits, or
none do and `'list'` returns the list layout — the same two outcomes, at the same threshold,
inside the same 16px band. The generalization is inert until a user lowers the floor. This is
why it could ship without waiting for the honesty affordance, which remains a release blocker in
D7 and gates any future change to these defaults.

**Neither new key is a `FETCH_TIME_KEY`, and neither may become one.** Reducing the column count
renders a subset of a fetch already sized to `days_to_show`, so every transition on this
staircase is render-side and costs zero `callApi` invocations — the same G10 guarantee that
governs the view switch itself.

The mechanism is specified in D6-B.

---

#### A3-H. The view vocabulary is `list` / `column` / `grid` **[v17]**

**Ruled by the maintainer, 2026-08-12.** The `view` key takes exactly these three values.
`list` and `column` ship in v4.0.0; `grid` is reserved now and built later (Phase 5).

Nothing is added to the code for `grid` — this ruling reserves the _name_, nothing else.
`validateView` continues to reject it until the view exists.

**Why decide it before building it.** `view: column` becomes user-authored YAML at v4.0.0,
and after that the value is effectively unrenameable. The runtime gained a deprecation
_notice_ in `dev` (PR #408) but still has no migration path: a renamed key is reported on
the console and then ignored, and `DEPRECATED_CONFIG_MAP` is consulted only by the editor's
upgrader. So a later rename of a shipped `view` value would silently revert affected cards
to `list`. Naming the third value now costs nothing and prevents an inconsistent trio.

Two candidates were rejected:

- **`time-grid`**, used on the frozen `alexpfau-review-339-time-grid` branch. Rejected as a
  compound where the siblings are single words, and because `time-` describes the axis of
  one possible grid rather than the view's identity.
- **`day-grid`**, for the same reason in the other direction.

`grid` also matches the vocabulary already used throughout the grid-view feasibility
assessment, so no existing analysis needs restating.

---

### B. Header divider

**Verified against:** `origin/dev` @ `29b8226`.

#### B1. Naming

Use `day_header_separator_width` and `day_header_separator_color`. The house pattern is
`{{scope}}_separator_{{width,color}}`; all existing separators hardcode `solid`, so there is no
style key.

Do not use an appearance name such as `horizontal_*`. The codebase already corrected that
pattern via `DEPRECATED_CONFIG_MAP` (`editor.ts:67-72`, consumed at `:381` and `:453`):
`horizontal_line_width` became `day_separator_width`. Appearance names break when layouts
rotate.

Do not reuse `day_separator_*`: that key means between days and rotates to the vertical rule
between columns. The header rule is inside a day, between its header and events.

#### B2. Defaults

```
day_header_gap: '8px'
day_header_separator_width: '0px'
day_header_separator_color: 'var(--divider-color)'
```

**The width ruling was reversed after live review.** This section originally specified `1px`,
on the argument that the element exists only inside column view and is structural — it marks
where the header ends and the event list begins — so making it visible could not affect list
view and did not violate A3-A. That reasoning is still correct as far as it goes, and it is
why the implementation was right to reject a later attempt to re-derive `0px` from local
consistency with the list separators. It was overturned on evidence, not on consistency: seen
on a real dashboard alongside the coloured accent bars beside each event, a full-width
horizontal rule reads as a table border and dates the card.

The rule therefore ships **off** and is opt-in by giving it a width. Do not re-derive either
value; both are ruled here.

`day_header_gap` exists because the original spec left the header-to-events spacing implicit,
and the implementation supplied it as 4px of header padding plus 4px of separator margin. That
made the gap an emergent property of two unrelated rules, so switching the rule off halved it —
which is precisely the collapse that made "no rule" look wrong in the first place. The gap is
now the header's own, unaffected by the rule; when a rule is shown it sits centred inside the
gap rather than adding to one side.

`var(--divider-color)` is a conscious new token-family choice. It is Home Assistant's semantic
divider token, theme-aware, and less text-like than `var(--secondary-text-color)`. Do not
"fix" it back to the existing separator family as an inconsistency. A `_style` key can be
added later without breaking config. **This half of B2 stands unchanged.**

#### B3. Editor

Follow the existing separator block pattern (`editor.ts:1155-1197` for `day_separator`; week
at `:1199-1241`; month at `:1243+`): a toggle writing `1px`/`0px`, revealing width and colour
when enabled. The header separator toggle starts **off**, matching the reversed B2 default and
every other separator toggle in the editor.

Add editor translation keys to every language file with an `editor` section:
`day_header_separator`, `show_day_header_separator`, `day_header_separator_width`,
`day_header_separator_color`, `day_header_gap`. Add all five keys to all editor-translated
files, or to none.

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#b-the-header-divider--concrete-spec)

---

### C. Phases

**Verified against:** `origin/dev` @ `29b8226`, except frozen-branch citations explicitly
marked inline.

Phases 0–2b are refactors or fixes that ship in ordinary 3.x releases. Only phases 4–5 need a
long-lived v4 branch. There is no separate Phase 3: the `ViewAdapter` is built inside Phase 4
against both list and column implementations.

#### Phase 0 — safety net — complete in PR #390

Phase 0 is complete and merged as PR #390 on `dev`. Its detailed build staging is now history.
It delivered:

- `scripts/check-i18n.mjs`, `npm run check:i18n`, and a CI step.
- A Vitest + happy-dom test suite under `tests/`, now **73 tests**, wired into CI via
  `npm test`.
- `tests/list-dom.test.ts`, the list-view DOM equality gate that Phase 1 must keep green.

The gate covers `renderGroupedEvents` and everything below it. It does not cover
`renderMainCardStructure` or `renderCardContent`, because it deliberately does not construct
the custom element. All four Phase 1 extraction targets are inside the covered subtree.

The key finding that governs Phase 1: **an option that defaults to `false` renders nothing, so
a test suite built from default config never reaches it.** Four branches were initially missed
for that reason, including two of Phase 1's four extraction targets: weather and
`parseIndicatorPosition`. Enumerate default-off render options from source and pin each one;
mutation testing proves assertions are load-bearing, not that every branch is reached.

That prediction was then tested. An adversarial mutation audit of the 18-test gate ran 59
mutations; **22 survived**. The gate reliably catches structural DOM changes — element names,
class names, ordering, `rowspan`, both weather render sites — but passes three whole classes of
refactoring bug:

1. **Default-off branches are unreached**, as predicted: `show_description`, `filter_duplicates`,
   `remove_location_country`, `compact_events_complete_days`, and the one-token
   `today_indicator_position` fallback all survived a flipped default.
2. **Default-true options are never exercised in their `false` branch.** Twelve of them,
   including `show_month`, `show_time`, `show_location`, `show_end_time` and five weather
   toggles. Emitting bogus DOM from the `false` branch passes.
3. **Whole-logic deletion in code that no-ops under default config.** The colour-precedence
   chain is the severe case — see the Phase 1 traps below.

The audit also found the gate cannot distinguish `''` from `nothing`, and that its assertions
are Vitest external snapshots, i.e. an approval oracle regenerable with `vitest -u` — which
during a refactor means a genuine regression can be "fixed" by regenerating it. **Tests added to
close these holes use explicit inline assertions, not snapshots**, and each is proven to fail
under the mutation it exists to catch.

Phase 1 does not begin until the holes intersecting its four extraction targets are closed.

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#phase-0--safety-net--ships-3x--risk-none-v3--new)

#### Phase 1 — shared leaf renderers — ships 3.x — risk: low — ✅ **complete**

List keeps its `<table>` and `rowspan`. Phase 1 extracts axis-agnostic leaf renderers into
shared functions that the list's existing table consumes unchanged, and that column and
time-grid consume from their own containers.

**Outcome:** all four targets extracted into a new module, `src/rendering/leaves.ts`.
`render.ts` fell from 1120 to 680 lines; the gate stayed green at 86/86 after every step and
the snapshot file was **never regenerated**. Exports: `renderDateWeather`,
`renderDateContent`, `renderLabel`, `renderEventTitle`, `renderEventWeather`,
`renderEventContent`, `renderTodayIndicator`, and the `EventContentParts` interface.

**Verified live**, not only against the offline snapshot: the `ccp-current-testing` HA tab
renders five A/B pairs (baseline, weather at both sites, colour precedence + today
indicator, the `show_time: false` time-block shapes 4/5, and labels/location/description),
each pairing the HACS production card against the dev build under the identical config. A
browser probe reads both cards' `shadowRoot.innerHTML`, normalises away lit's per-instance
comment markers, and diffs. **All five pairs came out byte-identical against real calendar
data.** The probe carries a negative control asserting that the five different configs
produce five different markups, so an over-eager normaliser cannot pass by flattening
everything to a constant. Probe lives beside the deploy skill as `ab-dom-diff.mjs`; it is
worth re-running at the end of Phases 2, 3 and 4, which make the same "nothing visible
changes" claim.

Extract in this order:

1. Weather rendering (`render.ts:526-575`). There is no `renderWeather` function on `dev`;
   weather is inline inside `renderDateColumn` (`render.ts:490-611`). Extract weather first as
   its own leaf.
2. Date content and colour precedence (`renderDateColumn` `:490-611`, precedence `:497-516`).
   The date-content renderer takes weather as an already-rendered `TemplateResult` or
   `nothing`, rather than raw forecast data.
3. `.event-content` subtree (`render.ts:942-1003`) — time, location, description. **Not** the
   title: `renderEventTitle` is already a standalone exported function (`render.ts:1012`),
   called at `:943`. Nothing to extract there.
4. Today-indicator geometry (`parseIndicatorPosition` `:358-382`).

Target 3 is the branchiest of the four and the spec previously understated it. The time block
(`:944-985`) is a triple-nested ternary with **six** distinct output shapes, not one:

| #   | Condition                     | `.time-actual`          | Sibling           |
| --- | ----------------------------- | ----------------------- | ----------------- |
| 1   | `shouldShowTime` + countdown  | icon + `<span>`         | `.time-countdown` |
| 2   | `shouldShowTime` + progress   | icon + `<span>`         | `.progress-bar`   |
| 3   | `shouldShowTime` alone        | icon + `<span>`         | —                 |
| 4   | `!shouldShowTime` + countdown | **empty**               | `.time-countdown` |
| 5   | `!shouldShowTime` + progress  | **empty**               | `.progress-bar`   |
| 6   | none of the above             | not emitted (`nothing`) | —                 |

Shapes 4 and 5 differ from 1 and 2 _only_ by the emptiness of `.time-actual`, which makes
"reuse the populated one" the single most likely extraction bug in Phase 1.

The Stage 2 gate pins both weather render sites: the date-column block and
`renderEventWeather` (`render.ts:1050+`), which reads the hourly forecast. Do not let the event
weather path fall through the extraction just because the date-column path is named first.

The contract is strict: list-view DOM must be byte-identical before and after. Extraction that
changes list output is a bug. Watch four traps:

- `renderEvent` interpolates locals computed before the extraction boundary; pass them rather
  than recomputing. Six of them: `eventTime`, `eventLocation`, `eventDescription`,
  `shouldShowTime`, `countdownStr`, `progressPercentage`. They are now a named
  `EventContentParts` object so the column container has one documented thing to satisfy.
- Accent, background, padding, and position classes live on the wrapper `<td class="event">`
  (`render.ts:938-941`, `styles.ts:458-483`, position classes at `render.ts:916-922`). Future
  column wrappers reproduce those; leaves do not absorb them.
- **The colour-precedence chain is invisible to default-config tests.** `:497-516` resolves
  base → weekend → today, today winning. But all six weekend/today colour keys default to
  `undefined` (`config.ts:75-80`), so every `||` falls through to base and **both `if` blocks
  are complete no-ops** under default config. Deleting the entire chain produces identical
  output for every default fixture. Any test protecting target 2 must set the weekend and
  today colour keys explicitly, and must include a **today that falls on a weekend** to pin
  the precedence order.
- **Three "render nothing" idioms coexist in the extracted region** and are not
  interchangeable in the DOM: `nothing`, the empty string `''`, and an empty `html` tagged
  template. **Phase 1 preserves each exactly as-is.** Normalising them is behaviourally safe
  but violates the byte-identical contract, and folding a cosmetic cleanup into a structural
  extraction is how refactors go wrong. Normalise later as its own change, if at all. The
  `preserves no-output idioms at extraction seams` test in `tests/list-dom.test.ts` is the
  forcing function: it fails at each extraction seam by design, and is repointed only after
  each idiom has been confirmed byte-for-byte.

##### 🚨 The whitespace trap — governs every later extraction

Discovered during Phase 1 and **not** obvious from reading the gate. The gate's serializer
normalises whitespace **between tags only** (`/>\s+</g` → `>\n<`). Whitespace **adjacent to a
text node survives verbatim into the snapshot** — the literal source indentation of, say, an
event title becomes part of the oracle.

The rule that follows: **preserve the original absolute indentation verbatim inside every
moved template, even when it looks wrong at the new nesting depth.** `renderEventContent`'s
body is indented to column 8 in a top-level function because that is where it sat inside
`renderEvent`. `leaves.ts` carries a header comment saying so, so nobody "tidies" it.

**[v20] Correction — this was wrong, and it was wrong while claiming to be verified.**
**Prettier _does_ reformat inside `html` tagged templates.** Run `npm run format` on a
single-line template and it reflows the embedded HTML, re-indenting and breaking lines.
What it preserves is whitespace it _already finds_, so every pre-existing template
round-trips unchanged — which is almost certainly how the claim passed verification in the
first place, since nothing then in the tree could have falsified it. A template deliberately
written to carry **none** is the case that breaks, and it gets the indentation put straight
back. **Pin those with `// prettier-ignore`** — `leaves.ts:122` carries one on the weather
badge, added after `npm run format` restored the exact spaces a fix had just removed and
turned five tests red. Found by the C6 implementation when its own tests caught the
reversal.

The superseded sentence claimed the opposite and is removed rather than struck through:
leaving it in place put a false reassurance directly beneath the rule it undermines, and
gave anyone who found the `prettier-ignore` a document telling them it was unnecessary.

If a snapshot diff appears during a later extraction, it is a whitespace error. Fix the
indentation. **Do not run `vitest -u`** — that launders the change past review, and the
whole point of the gate is that it is the one artefact the refactorer does not get to edit.
Making the serializer whitespace-insensitive is defensible (interior whitespace has no
user-visible effect) but must be a separate, separately reviewed commit — never bundled with
an extraction.

##### Deviations from the plan as written

Both are internal, reversible, and touch no config key or public surface.

1. **Leaves live in a new `src/rendering/leaves.ts`, not in `render.ts`.** The plan says
   column and time-grid consume the leaves "from their own containers"; leaving the leaves in
   the list module would make those containers import from the list. Reversible with `git mv`.
2. **Targets 3 and 4 each moved as a cluster, not as the single named function.** Target 4
   names only `parseIndicatorPosition`, but its sole caller is `renderTodayIndicator` and both
   it and `renderIndicatorByType` are axis-agnostic — moving only the geometry would have
   `render.ts` importing a private helper back for one call. Likewise target 3 forced
   `renderLabel`, `renderEventTitle` and `renderEventWeather` to move: `.event-content` calls
   the title, which calls the other two, so leaving them behind creates a backwards
   `leaves.ts → render.ts` import.

   Target 3 as written says of the title "Nothing to extract there." That was wrong — it is
   not extra work, but it is not a no-op either. `renderEventTitle` was exported from
   `render.ts` with **no external consumers**, so moving it changed no call site outside the
   two rendering modules.

Deferred out of Phase 1: removing the layout table, RTL, and the duplicate
`.today-indicator-container` rule (`styles.ts:332-340` / `:364-370`).

Soak fixtures reused by later phases: longest-title wrapping, `date_vertical_alignment` at
all three values, `today_indicator: true` on a multi-event today, RTL, week numbers on,
`max_height` scrolling, narrow HA sections column.

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#phase-1--shared-leaf-renderers--ships-3x--risk-low-v4--re-scoped)

#### Phase 2 — presentation models — ships 3.x — risk: low — ✅ **complete**

`EventPresentation` and `DayHeaderModel` are only built if a named consumer needs them. If the
Phase 1 shared leaves and the Phase 4 column renderer can consume raw `EventsByDay` types
happily, do not build presentation models speculatively; fold them into Phase 4 if the adapter
creates the need.

**Ruling: one of the two is justified, the other is not.**

`EventPresentation` — **built**, in a new module `src/rendering/presentation.ts`. The named
consumer is the Phase 4 column renderer. §D1 requires the column view's `.event-content` to be
**byte-identical** to the list's, and that content is driven entirely by `EventContentParts`,
which roughly 120 lines of dense branching inside `renderEvent` produce — the all-day vs. timed
past-event split with its iCal exclusive-end adjustment, the entity `show_time` override, the
multi-day all-day detection that matches translated strings, the three-clause `shouldShowTime`
and the four-clause countdown gate. The only two ways to get a byte-identical
`EventContentParts` in a second view are to duplicate that branching (which would drift) or to
share the builder. That is a real consumer, so the YAGNI clause is satisfied rather than
violated.

`buildEventPresentation` takes neither the day, the event index, nor the weather forecasts.
Needing none of them is what demonstrates the result is genuinely axis-agnostic.

`DayHeaderModel` — **not built.** Phase 1 already removed the need: `renderDateContent` takes
only primitives that any container has to hand and performs its own weekend→today colour
precedence internally, which left `renderDateColumn` a four-line composition. There is no
derived data such a model would carry. §D2's column header differs from the list header in
**markup axis only**, which is a renderer concern, not a model concern. Fold it into Phase 4 if
that phase ever creates the need.

**Outcome:** `renderEvent` fell from 172 lines to 55, of which the markup block is untouched and
still at its original indentation. `render.ts` fell 680 → 562. Left behind as list-specific or
too trivial to be a drift risk: `dayDate` / `isWeekendDay` (they feed the date **cell**, not the
event) and the first/middle/last positional classes (one-line derivations from `index`).

**Verification.** The extracted block was diffed line-by-line against the original and is
byte-identical, so the move is proven rather than believed. The gate passes 86/86 with the
snapshot **never regenerated**, which is the actual DOM-neutrality proof. Two independent
corroborations: removing the now-unused `FormatUtils` and `EventUtils` imports from `render.ts`
confirms the extraction was complete, and all five idiom-guard assertions still hold —
including #5 on the `${index === 0 …}` seam, which is the **Phase 4** cut point and was
deliberately untouched here. Unlike Phase 1 this phase moves no markup, so the whitespace trap
does not apply.

Two deviations from strict move-discipline, both deliberate and both comment- or dead-code
only: a dead `tomorrow` local was dropped (assigned, mutated, never read — invisible to `tsc`
because `noUnusedLocals` is off, and to eslint because the `setDate` call counts as a use), and
one comment that was already factually wrong was corrected (`isEmptyDay` adds no CSS class; it
gates time, countdown and progress).

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#phase-2--presentation-models--ships-3x--risk-low-v4--cache-fix-split-out)

#### Phase 2b — cache correctness — SHIPPED — ships 3.x independently — risk: low

**Status: complete.** Commit `a463a94` on `feature/column-view`.

This was a live list-view bug and did not wait for the column epic. `fetchEventData` cached
the _output_ of `processEvents`, while `getBaseCacheKey` covered only fetch inputs — entity
ids, window, `show_past_events`, `filter_duplicates`. Every other config key `processEvents`
reads was therefore invisible to the cache, so editing one had no visible effect until the
entry expired.

Two defects followed, with different mechanisms:

1. **Value staleness.** `_matchedConfig` and `_entityLabel` were frozen into the cached event,
   so an edited per-entity label, colour or toggle was ignored on a hit.
2. **Reference staleness.** `applyPerEntityCompaction` (`events.ts:398`) identifies an entity's
   config block by `config.entities.findIndex((e) => e === matchedConfig)` — a reference check.
   Two independent mechanisms broke that reference, so the lookup returned `-1` and the
   compaction bucket key silently degraded from `entityId__configIdx` to bare `entityId`,
   merging two config blocks into one shared budget:
   - the cache round-trips through `JSON.stringify`/`JSON.parse`, so a cache-hit
     `_matchedConfig` is a freshly-parsed object; and
   - `normalizeEntities` runs on **every** `setConfig` (`calendar-card-pro.ts:726`) and
     `config.ts:227` maps to fresh object literals.

   The second mechanism is the load-bearing one, and is stronger than an earlier draft of this
   section recorded: the identity breaks on every `setConfig`, not only on a cache hit, so the
   defect was **permanent rather than warm-cache-only**. Live A/B measurement confirmed it —
   see below.

Defect 2 settled the maintainer decision: **cache raw API events and reprocess on every read.**
Widening the key was not a viable alternative — no cache key repairs a broken object reference.

The scope was wider than the earlier draft of this section recorded. It named five
`_matchedConfig` consumers; there are **eight**, and the three it missed are the two that
matter most:

| Site                    | Role                                                                        |
| ----------------------- | --------------------------------------------------------------------------- |
| `events.ts:302`         | copies `_matchedConfig` through into the per-day event ⟵ _missed_           |
| `events.ts:398`         | compaction bucket key — **reference-identity compare** ⟵ _missed, defect 2_ |
| `events.ts:797-800`     | per-entity `split_multiday_events` override                                 |
| `events.ts:1003`        | `getEntityColor`                                                            |
| `events.ts:1040`        | `getEntityAccentColorWithOpacity`                                           |
| `events.ts:1083`        | `getEntityLabel`                                                            |
| `events.ts:1115`        | `getEntitySetting`                                                          |
| `leaves.ts:248`, `:253` | event colour and label-icon colour ⟵ _missed_                               |

All read only _derived_ config state, which is exactly why reprocessing on read is sufficient.

Both paths now route through one `processRawEvents` helper, so a hit and a refetch provably
agree. The key drops `filter_duplicates` and the allow/blocklist patterns, which are
processing concerns applied on read. `showPastEvents` stays for now: it is redundant (it never
reaches `getTimeWindow`, and is applied at render time in `groupEventsByDay`) but is also baked
into `generateDeterministicId`, so removing it here alone would widen the diff without changing
behaviour. Tracked in §D7.

**Not user-breaking, so it ships in 3.x safely:** the key already carries the version string,
so every release invalidates all caches; and a _narrower_ key causes more hits, never a config
that stops taking effect.

`processEvents` now copies each event rather than decorating it in place, since its input may
be the cached payload. That incidentally fixed an aliasing bug — two config blocks naming the
same entity selected the same objects, so the second overwrote the first and both copies
rendered with the last block's config.

Six tests in `tests/event-cache.test.ts` pin this, all confirmed load-bearing by mutation
testing. The list-view DOM snapshot is unchanged.

**Live A/B verification** (dev `?v=252` against the HACS release, `ccp-current-testing`), read
out of the rendered shadow DOM rather than eyeballed:

| Test              | Config                                              | prod (before)             | dev (after)              |
| ----------------- | --------------------------------------------------- | ------------------------- | ------------------------ |
| aliasing          | same entity twice, labels `AAA`/`BBB`               | `BBB`, `BBB`, `BBB`       | `AAA`, `BBB`, `AAA`      |
| compaction bucket | same entity twice, both `compact_events_to_show: 1` | **1 row** (budget shared) | **2 rows** (own budgets) |
| regression        | plain 3-calendar card, no per-entity config         | identical                 | identical                |

The compaction row is the useful one: prod renders 1 row on a **cold** load as well as a warm
one, which is the direct observation that defect 2 was never cache-specific. It also only
reproduces when _both_ blocks set the same small budget — with budgets `1` and `3` the larger
budget absorbs the second event and the merge is invisible, which is why an earlier draft of
this test showed nothing.

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#phase-2b--cache-key-fix--ships-3x-now-independently--risk-low-v4--split-out)

#### Adapter shape inside Phase 4

Frozen-branch provenance is load-bearing here: the time-grid files and citations describe
`alexpfau-review-339-time-grid`, not `dev`. On `dev` there is no `time-grid` view.

The adapter replaces scattered view string checks with a declarative capability descriptor and
only the facets column actually needs. The known full shape is:

```
capabilities
normalizeConfig
fetchInputsChanged(prev, cur)
buildFetchPlan
controllers()
render
afterRender(host)
getCardSize
```

The four-method v1 shape (`capabilities` / `buildFetchPlan` / `render` / `getCardSize`) only
absorbed render dispatch, fetch plan override, and card size on the frozen branch. It did not
cover config validation, refetch change detection, controller lifecycle, post-update hooks,
interaction model, or card-shell flags.

#### Conformance gate — scratch branch before Phase 5

After Phase 4's adapter and column renderer are functionally complete but before `view` is
released, manually port #339's time-grid onto a scratch branch off the Phase 4 branch. Inputs:
the Phase 4 branch plus `alexpfau-review-339-time-grid` as read-only source. Output: findings
and, if it passes, adapter corrections merged back into Phase 4. The scratch branch is then
abandoned.

The gate must prove:

- All four D5 override kinds are expressible without lying to the editor.
- Time-grid fetch windows derive through `buildFetchPlan`, without new `view === 'time-grid'`
  strings outside the adapter module.
- Both compaction stages are hookable: per-entity (`events.ts:350-391`) then global
  (`:409-475`).
- Controllers can be constructed through `controllers()` with observer lifetimes intact.

It does not need to run correctly end to end; it must compile and wire without reaching around
the abstraction. If it fails, fix the abstraction inside Phase 4 and rerun. Phases 0–2b remain
safe because they have no public `view` API. The frozen branch is read and never moved; this
is a manual port, not a rebase.

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#conformance-gate-scratch-branch-not-shipped-v5--priced-sequenced-and-given-a)

#### Phase 4 — column view plus `ViewAdapter` — v4 branch — risk: medium

`view: 'list' | 'column'` becomes public API. Phase 4 builds the column renderer and the
`ViewAdapter` abstraction together, designed against list and column at the same time. Section D
is the implementation spec.

> **[v14] The `ViewAdapter` half of this phase was never built, and this is now a known,
> accepted deviation rather than an oversight to be silently carried.** `git grep -i viewadapter
src/` returns zero hits on the v4 branch. Column view shipped as **ten hard-coded binary view
> gates** — `effectiveView === 'column'` or `!== 'column'` — instead of an abstraction.
>
> This is not, in itself, wrong. The rationale log's own argument for cancelling Phase 3
> ([rationale :719-731](./column-view-rationale.md)) — _"you cannot see the seam with one
> implementation; an adapter designed against list alone encodes list's shape as though it were
> the general shape"_ — applies with almost equal force to an adapter designed against list and
> column, which are both day-partitioned. The independent grid-view feasibility review reached
> the same conclusion and explicitly recommended **not** generalising now.
>
> What _is_ wrong is the consequence nobody recorded: the **pre-Phase-5 conformance gate at
> :716-736 has therefore never run**, even though it is specified to run _before `view` ships_.
> Two of the ten gates are semantic rather than cosmetic, and both are written in the negative
> form that silently mis-answers for a third view:
>
> | Site            | Gate                                                             | Why the negative form is a trap                                                                                                                                                                                                           |
> | --------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | `events.ts:207` | `compactLimitsApply = !isExpanded && effectiveView !== 'column'` | Sits under a 30-line comment arguing compact caps are meaningless **in grid layouts** — reasoning that applies verbatim to a time grid. A third view inherits list's answer against the comment's own logic.                              |
> | `events.ts:229` | `ignorePerEntityOverride` keyed on `=== 'column'`                | Column force-splits multi-day events; the frozen prototype force-splits them _off_ because the list splitter emits synthetic middle segments that land in the wrong band. A third view needs a **third** answer, not either existing one. |
>
> Neither is visible to the test suite: both branches are reachable only under non-default
> config, and `compact_days_to_show` defaults `undefined`. This is exactly the failure mode
> :922-923 was written to forbid.
>
> **Ruling:** do not build the adapter. Do name the two semantic gates —
> `viewAppliesCompactLimits(view)` and `viewForcesMultidaySplit(view)` — so the decision is
> stated once, in the positive, and a new view must answer it explicitly rather than inherit
> list's answer by falling through a `!==`. That is ~15 lines, no config-surface change, and it
> discharges :922-923 without pretending one more view reveals the seam.

#### Phase 5 — time-grid — v4 branch — risk: medium

Rebuild on lenaxia's four commits as ancestors so `git log` retains authorship, plus
`Co-authored-by` trailers and release-note credit. Deferred retro findings are the checklist:
blank slot-interval dropdown; all-day off-by-one in the detail overlay; frozen clock when the
now-line is disabled; dead swipe in 7-day mode; unguarded `navigator.clipboard`;
`hide_when_empty` window mismatch; now-line re-rendering the whole card every 60s; the 35-day
default fetch; about eight shipped config options silently ignored; six runtime i18n keys
present only in `en.json`; and `time_grid_interval_minutes` being a zoom control.

> **[v14] "Four commits" is right for attribution and wrong for the rebuild base.**
> `origin/dev..origin/alexpfau-review-339-time-grid` is **seven** commits: four by
> `mikekao@amazon.com` (`72ce3a3`, `f2115e3`, `3b1198f`, `6f9da8a`) — the ones authorship
> depends on — and three subsequent maintainer commits. The branch is FROZEN: never rebase,
> force-push or delete it.
>
> The three maintainer commits are not incidental; `d9cceb6` is **prior art on questions this
> branch has since re-litigated independently**, and reaching the same answers twice is itself
> evidence:
>
> - It renamed `time_grid_breakpoint_{three,seven}_day_px` → **`min_day_column_width_px`** and
>   `time_grid_max_days` (a `1|3|7` enum) → **`max_day_columns`** (`1..31`), on the stated
>   grounds that keys solving the _day-column_ problem "which a future column view shares" must
>   lose the view prefix, "since renaming after release would be a breaking change". That is the
>   same conclusion D6 reached for Category C, arrived at eight months earlier from the other
>   side. It also means the column-count-versus-width lever was invented twice independently.
> - It replaced the whole-language editor-translation swap with a **per-key** fallback
>   (requested → English → raw key), using a `\u0000` sentinel to distinguish a missing key from
>   a legitimately empty translation. `AGENTS.md` documents the all-or-nothing hazard this
>   removes: `hasEditorTranslations()` returns true on **one** key, so a partially translated
>   `editor` block renders every missing key as its raw name. The column editor will add roughly
>   15–20 keys across 35 language files, which is precisely the moment a translator does half
>   the block. **Port this hunk forward before the column editor lands** — it is ~10 lines and
>   needs no contact with the frozen branch.
>
>   **[v14] Done.** Ported as `translateEditorKey()` in `localize.ts`; `hasEditorTranslations()`
>   is deleted, `check:i18n` downgraded the partial-section error to a warning, and
>   `tests/translations.test.ts` pins the per-key chain. Written independently rather than
>   cherry-picked, so the frozen branch is untouched.

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#c-phases-v5--phase-3-folded-into-phase-4)

---

### D. Column view specification

> **Verified against `origin/dev` @ `29b8226`.** All `src/` citations in D1, D2, D3 and D5 are
> `dev` citations. D4 uses frozen-branch citations where marked.
>
> **[v9] Caveat — that verification predates Phases 1, 2 and 2b, which moved code.** Citations
> in D1 and D2 were re-verified against the Phase 4a branch and corrected; several renderers
> named here now live in `leaves.ts`, not `render.ts` (`renderDateContent` `leaves.ts:129`,
> `renderDateWeather` `:54`, `parseIndicatorPosition` `:475`, `renderTodayIndicator` `:508`).
>
> **[v9] D3, D4 and D5 have since been re-verified too, with a different outcome worth
> recording.** D3 turned out to carry no code citations at all — it is pure design reasoning,
> so nothing in it can rot. D4's and D5's `dev` citations were all _substantively correct_ but
> uniformly **one line early**; they have been corrected in place. That is a materially
> different failure from D1/D2, where the cited function had been reduced from 121 lines to 4
> and the instruction built on it was therefore wrong. An off-by-one wastes a minute; a stale
> premise sends a phase down the wrong path.
>
> The rule stands regardless of which kind you hit: **a line number in this document is
> evidence of intent, never of location.** Re-derive from the code. D4's `[frozen]` citations
> remain unverifiable by design — they describe a branch that must not be touched.
>
> **[Phase 4b] A third stale premise, and the one that generalises.** D1 described `.date-content`
> as the list view's flex container to be flipped into a row. The class is **dead CSS** — defined
> in `styles.ts`, emitted by nothing, absent from the Phase 0 snapshot. Building the column header
> by flipping it would have produced a header styled by a rule the browser never applies.
>
> All three stale premises share one signature: **the spec described `dev` as it was when the
> paragraph was written, not as it is.** Two were moved code; this one was code that never ran.
> The stylesheet is not evidence that a class is used — `grep` `src/` for the emission site, and
> check the snapshot.

#### D1. Element mapping

> **§D6 governs the key names.** This table predates the `column:` override block; where the
> two disagree, §D6's Category A/B/C taxonomy is the ruling. Four rows were corrected in the
> Phase 4b pass after a subsession read this table alone and designed a vertical
> `day_separator_*` border that §D6 had already resolved into `day_header_separator_*`.

| Element                   | List today                  | Column                                | Keys                                         |
| ------------------------- | --------------------------- | ------------------------------------- | -------------------------------------------- |
| Per-event accent          | vertical, left of event     | **unchanged**                         | `vertical_line_width`                        |
| Day separator             | horizontal between days     | **replaced by the header rule** (§D6) | `day_separator_*` → `day_header_separator_*` |
| Week separator            | horizontal at boundary      | **vertical, full height** (§D5)       | `week_separator_*`                           |
| Month separator           | horizontal at boundary      | **vertical, full height** (§D5)       | `month_separator_*`                          |
| Header rule               | does not exist              | **horizontal, under header**          | `day_header_separator_*`                     |
| Week number badge         | own full-width row          | **per-column header row** (§D5)       | `show_week_numbers`, `week_number_*`         |
| Day spacing               | vertical gap                | **column gutter, same key** (§D6)     | `day_spacing`                                |
| Event spacing             | vertical gap                | **unchanged**                         | `event_spacing`                              |
| Today indicator           | absolute in date cell       | **absolute in header band**           | `today_indicator*`                           |
| Weekday / day / month     | vertical stack, left        | **horizontal, in header**             | `weekday_*`, `day_*`, `month_*`              |
| Weather                   | in date column              | **header, single-line-or-hide**       | existing weather keys                        |
| Event content             | `.event-content`            | **byte-identical**                    | all                                          |
| `date_vertical_alignment` | positions date in tall cell | **ignored**                           | —                                            |

Separators are not axis-swappable. Existing list paths are a day separator emitted by
`renderHorizontalSeparator` (`render.ts:178-201`, called from `renderDay` at `:388-389`;
`styles.ts:262-265`), a week separator through the same helper when `show_week_numbers === null`
(`renderWeekSeparator`, `render.ts:220-243`), or a full `<table class="week-row-table">` when
`show_week_numbers !== null` (`renderWeekRow`, `render.ts:244-308`, table at `:287`;
`styles.ts:195-261`). Column re-implements these as vertical rules.

Spacing multipliers are dropped in column MVP. `createSeparatorStyle` (`render.ts:131-179`)
derives margins from `day_spacing × multiplier`; `SEPARATOR_SPACING` is week `1×`, month
`1.5×` (`constants.ts:87-92`). CSS `column-gap` is uniform, so it cannot widen only one
gutter. Default widths are all `0px` (`config.ts:53`, `:55`, `:57`), so this is a default-config
no-op and only affects users who opted into those separators.

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#d1-element-mapping-changed--separators-are-a-re-implementation-not-a-rotation)

#### D2. Header

> **[v9] Citation corrected — and the work is smaller than this section originally claimed.**
> D2 was written against pre-Phase-1 `dev`, where `renderDateColumn` was a 121-line function at
> `render.ts:490-611` that rendered the date parts and weather inline. **Phase 1 already
> extracted it.** On the current branch `renderDateColumn` is a four-line composition
> (`render.ts:323-334`) over two leaves that are **already axis-agnostic**:
> `Leaves.renderDateContent` (`leaves.ts:129-199`) and `Leaves.renderDateWeather`
> (`leaves.ts:54`). `renderDateContent`'s own docstring states the intent verbatim: weather is
> passed in "so a container can position the badge independently — the column view puts it in
> the day header, the list view stacks it under the month."
>
> **So Phase 4b must not build a horizontal variant of anything.** It calls
> `Leaves.renderDateContent` from a horizontal container and supplies different CSS. The
> weekday / day / month `<div>`s, the colour precedence chain, and the translation lookups are
> shared verbatim — which is what makes D1's "preserve DOM classes" free rather than a
> discipline to enforce by review.

Render the header by calling `Leaves.renderDateContent` (`leaves.ts:129-199`) from a horizontal
container. It already owns the colour precedence chain base → weekend → today
(`leaves.ts:136-155`) and emits `.weekday` / `.day` / `.month` divs unchanged, so no DOM or
colour logic is duplicated.

The axis lives entirely in CSS, but not by flipping an existing class. `.date-content`
(`styles.ts:324-329`) looks like the natural thing to reuse and is **dead CSS** — nothing in
`src/` emits that class, and it appears zero times in the Phase 0 DOM snapshot; the last commit
to touch `class="date-content"` is `92f8c60`. `Leaves.renderDateContent` emits its three divs
_bare_, with no wrapper, which is precisely what lets each view supply its own. So the column
view brings its own `.column-date-content` wrapper rather than reviving the dead one — adding a
wrapper to the list path would change the list DOM and break the Phase 0 gate. `.date-column`
(`styles.ts:310-322`) is list-only — it is a fixed-width table cell — and is **not** reused
either.

::: warning Verified During Phase 4b
This paragraph originally claimed `.date-content` was the list view's flex container and that
the column header was its row equivalent. It is not; it is unreferenced. Corrected after
grepping `src/`, the snapshot and the git history rather than reading the stylesheet alone.
:::

Today highlighting needs no new keys: `today_weekday_color`, `today_day_color`, and
`today_month_color` already exist with top precedence. `Leaves.parseIndicatorPosition` (`leaves.ts:475`, consumed by `Leaves.renderTodayIndicator`
`leaves.ts:508`) emits absolute positioning plus percentages and
`translate(-50%,-50%)` inside a relative container, so it transfers mechanically to the header
band. Document that positions such as `15% 50%` resolve visually differently in a short wide
band.

**[v9, ruled by the maintainer] Weather truncates; it is never dropped.** At the 160px
provisional, G13 measured date + weather on one line at roughly 157px — it fits, with nothing to
spare. When it does not fit, the temperature text elides rather than the badge disappearing, and
the header stays one line high. Dropping it instead would have let the floor fall to ~130px, but
a user who configured weather would sometimes not see it with no explanation — the same silent
config/render divergence G14 rejected for columns.

**[v12] The shipped floor is 140px, and this is why the ruling still holds at that width.** 140
is set by the three-columns-in-a-500px-section fit (decision 14), not by the header, so it lands
17px under G13's 157px header measurement — meaning at the default, in the worst case, the
temperature elides. That is exactly the behaviour ruled for here, so the truncate-not-drop rule
is what makes 140 viable rather than something 140 contradicts. A user who wants the header
uncompressed raises the key. Weather is rendered by `Leaves.renderDateWeather` (`leaves.ts:54`), which the header
container positions itself; document the fixed header vertical budget as one line.

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#d2-header)

#### D3. Height and overflow

**[v8, G11]** Equal heights come from CSS grid `align-items: stretch`, which is the default —
so this is free once the container is a grid. See G11 for the ruled track definition
(`repeat(N, minmax(0, 1fr))`) and why `minmax(0, 1fr)` rather than a bare `1fr` is the
load-bearing detail.

Uncapped column view is safe by default: column height is bounded by the busiest day, while
list height is the sum over days. For constant event height, `max(eᵢ) ≤ Σ(eᵢ)`. This differs
from time-grid's configured time axis, which creates whitespace whether events fill it or not.

The regime where column can be taller is narrow-column line wrapping under skewed event
distribution: event height is not constant across layouts. This argues for the Phase 4
measurement spike and the 160px provisional minimum, not against column layout.

**[v8, G12] Compact scope is settled:** `compact_days_to_show` is in MVP (it simply sets N);
`compact_events_to_show` is **out**. The A3-D requirements — per-column budget,
`compact_events_complete_days` ignored, per-entity cap kept global, `max_events_per_column`
deferred, `+N more` mandatory if any cap ships — describe the design for when per-column
compaction ships, not MVP. `max_height` is inherited unchanged in both cases.

> **[v14] Superseded — this is the second site stating the ruling A3-D corrects, and it is
> stated here in the opposite direction.** `compact_days_to_show` does **not** ship in MVP.
> The entire compact family is inert in column view: `compact_days_to_show`,
> `compact_events_to_show` (global and per-entity), `compact_events_complete_days`, and the
> `action: 'expand'` gesture that drives them. See the D8 table for the verified set.
>
> "It simply sets N" was the argument, and it is wrong on the layout: three wide columns in the
> space of five narrow ones is a **different card**, not a denser one — the horizontal axis has
> no equivalent of a list's vertical truncation. `max_height` is genuinely inherited unchanged,
> so that clause stands.
>
> The A3-D design notes remain the design for any future per-column compaction. What does not
> survive is the MVP scope line in this paragraph.

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#d3-height-and-overflow-changed--substantially-rewritten)

#### D4. Editor gate audit

Every citation in this subsection marked `[frozen]` describes `alexpfau-review-339-time-grid`,
not `origin/dev`. On `dev` there is no `view === 'time-grid'` gate, no view select, and no
`view` key.

When time-grid returns in Phase 5, binary `!== 'time-grid'` gates must not silently include
column. Phase 4 must avoid introducing any binary gate that Phase 5 has to unwind.

Frozen-branch gates and their three-view outcomes:

- `editor.ts:774-777` `[frozen]`: the `view` select needs a `view_column` translation key.
- `:778` `[frozen]`: `days_to_show` is benign for column by luck; make it explicit.
- `:826` `[frozen]`: Compact Mode shows for column and that is correct. Make it explicit and
  hide `compact_events_complete_days` for column.
  > **[v14] Reversed.** Compact Mode is **wholly** inert in column view, so the instruction is
  > not "hide one key" but "the whole section does nothing". Hiding it outright is the wrong
  > fix — a user who set a compact cap in list view and switched to column would watch their
  > configuration vanish from the editor with no explanation, which is the silent
  > config/render divergence G14 rejected. Annotate instead, via the conditional helper-text
  > idiom already used at `editor.ts:1119-1124`. Same treatment as `today_indicator_position`.
- `editor.ts:897` on `dev`: `show_empty_days` becomes the A3-B-3 3-option select in both
  views, not a switch. Correct the `:900-902` visibility conditional at the same time.
- `:908` `[frozen]`: correctly grid-only, unchanged.

Convert binary view exclusions to explicit per-view logic when those gates are written.
Round-trip the visual editor for a column config to confirm no forced-override key silently
drops user input.

The editor live preview must render the selected view rather than the width-measured one; this
is the A3-C.4 mitigation.

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#d4-editor-gate-audit-new-v5--entirely-frozen-branch-retitled-and-re-tensed)

#### D5. Forced config, override taxonomy, and week numbers

The adapter must express three per-view behaviour kinds without leaving inert editor toggles:

> **[v17] Two of the three rows below are superseded.** The middle row still stands.
>
> **Kind 1 — the auto sentinel was not built.** `show_empty_days` ships as a plain
> `boolean`; per-view defaults are expressed by `COLUMN_DEFAULT_OVERRIDES` plus the
> `column:` block, not by a `null` value in the flat key. See the [v17] banner on A3-B.
> This is the second time the override block has absorbed a kind from this table — [v8]
> removed kind 4 for the same reason, recorded in the note directly below. The taxonomy is
> therefore now **two** kinds, not three: _forced_ and _inert_. A per-view default is no
> longer a kind at all, because it is no longer an editor problem — it is a config
> resolution problem, solved before the editor sees a value.
>
> **Kind 3 — "Hidden" is wrong, and D8 says so at length.** Inert keys are **annotated,
> never hidden**. The reason is structural rather than aesthetic: the narrow-viewport
> fallback belongs to `column` itself, so a card configured `view: column` renders **as a
> list** below its threshold. Both layouts are live for the same card at the same time, and
> hiding a list-only control because column is selected removes the only control for the
> layout that card actually uses on a phone. The key is not inert for the card; it is inert
> for one of the two layouts the card renders. The full argument, and the
> conditional-`helper-text` idiom that should ship instead, are in D8.

| Kind                                                          | Example                                                   | Editor treatment                  |
| ------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------- |
| 1. **Per-view default**, user-overridable, with auto sentinel | `show_empty_days` (`null` = auto)                         | Select with reachable `Automatic` |
| 2. **Hard force**, structurally required                      | `split_multiday_events: true` — a column is a day         | Disabled + annotated              |
| 3. **Ignored**, meaningless in this view                      | `compact_events_complete_days`, `date_vertical_alignment` | Hidden                            |

Kind 1 requires an explicit auto/unset value selectable in the editor. For booleans that means
`boolean | null` and a 3-option select. Reuse the `show_week_numbers` path — **[v9] verified on
`dev`**: default `null` at `config.ts:49`, the 3-option select at `editor.ts:1110-1114`, and the
`'null'`-string-to-real-`null` conversion in **both** handlers, `editor.ts:589-593` and
`:661-662`. That the conversion exists in two places is the load-bearing detail: a select emits
the string `'null'`, so a kind-1 boolean needs the same treatment in both paths or the sentinel
round-trips as a truthy string. If a key cannot take a sentinel, it is not kind 1.

> **[v8] A fourth kind was removed.** Earlier revisions carried a kind 4,
> _"Reinterpreted — same control with rotated meaning"_, whose only example was
> `compact_events_to_show`. It is deleted: **D6's override block is the general solution to
> the problem kind 4 was a special case of.** A control whose meaning silently rotates
> between views is precisely the double-meaning trap D6 exists to prevent. Anything that
> would have been kind 4 is now either an override-eligible key (category B) or a distinct
> new key (category C). See the rationale for the full argument.

> **[v10] `split_multiday_events` is no longer kind 2.** It ships as a **divergent column
> default** (D6) — `true` in column view, `false` in list, reachable through the block. The
> row above is kept as the historical example of a structural force, but the key itself moved,
> on the maintainer's ruling: _"the default must be to always force-split them in column view
> … even though it doesn't make sense for users to switch this off. But hey, we never know."_
> A hard force would have meant a disabled editor control, and there is no reason to spend one:
> the default already produces the honest layout for every user who does not think about it,
> and the block is there for the one who does. This is the second key in
> `COLUMN_DEFAULT_OVERRIDES`, after `show_empty_days`, and it arrived by the same argument —
> a grid makes an absence look like a statement.
>
> **Why it is a render-time split rather than a fetch-time one.** `split_multiday_events` is
> deliberately **not** a `FETCH_TIME_KEY`, so the stored event array is shared across views and
> a width-driven view change must not refetch (G10, E-crit 3). Splitting therefore happens in
> `groupEventsByDay`, as a guarded top-up pass over the already-stored events. Three properties
> make that safe, and all three were checked rather than assumed: `processMultiDayEvents` is
> **idempotent** (a segment no longer spans days, so `isMultiDayEvent` rejects it on a second
> pass), so it does not matter how the stored array was processed; the `days_to_show` filter has
> **already** run on that array, so re-splitting cannot change which events survive; and
> `groupEventsByDay` sorts within and across days _after_ grouping, so insertion order is
> irrelevant. Moving the split itself into the grouping function — the obvious alternative —
> would have reordered it against that filter and changed list-view output.
>
> **[v11] Per-entity precedence is overridden in column view.** `shouldSplitEvent` consults
> `_matchedConfig.split_multiday_events` before the global, so before this ruling an entity
> that set it `false` stayed unsplit in column view. That preserved the documented precedence
> and was left open in v10 — but live testing made the cost concrete rather than theoretical:
> a card with the opt-out on one calendar and not the other rendered **two different truth
> standards side by side**, one calendar's multi-day event spanning its columns while the
> other's sat in its start column carrying `until Friday, Aug 14` and left Friday's column
> blank. On the maintainer's ruling the column default now wins: **a per-entity
> `split_multiday_events: false` is inert in column view**, joining `compact_events_to_show`
> in that category (A3-D). List view is untouched — there a multi-day event is one row that
> names its own end date, so nothing is concealed and the documented precedence still holds.
>
> The argument is the same one that made the divergent default: a column is a claim about a
> single day, so an unsplit event does not merely render differently, it makes every later
> column it covers assert an absence that is false. Precedence is a convenience; structural
> honesty is not negotiable per entity. Mechanically this is an `ignorePerEntityOverride`
> flag threaded `groupEventsByDay` → `processMultiDayEvents` → `shouldSplitEvent`, set only
> on the column render-time top-up. `_matchedConfig` is **not** mutated — it is shared state
> on the event objects, and every other consumer of it (labels, colours, `show_time`) must
> keep reading the user's real value.
>
> **Editor obligation.** This is the third column-inert key, after `today_indicator_position`
> and the compact-mode cluster, and it inherits the same unresolved problem: the editor
> currently offers the control with no indication that column view ignores it. Tracked with
> the others under the per-view editor surface question (D7).
>
> **[v10] Deferred to the grid view.** A grid conventionally lifts multi-day events out of the
> per-day columns into a dedicated band between the date header and the grid body. For all-day
> events that is near-universal; for _timed_ multi-day events the field splits — Apple Calendar
> draws them across the grid body (**the maintainer's preference**), Google pins them to the
> top band, which leaves the grid looking empty for hours that are in fact busy. Revisit when
> the grid view is designed; column view's force-split is not a commitment either way.

##### Week numbers — designed, no longer deferred

**The original deferral rested on a premise that only holds for a spanning row.** Earlier
revisions argued placement was "genuinely incoherent" because a 7-day window can span two ISO
weeks and need zero, one, or two badges on non-adjacent columns. That is a real objection to a
single header row spanning the grid — it would have to draw a badge over column 0 and another
over column 5 with nothing between. It is not an objection to a **per-column** badge, where
each column independently shows its own or shows none, and the "non-adjacent" case is simply
two columns that each answer for themselves.

**Ruled, on the maintainer's proposal: a third header row directly above the weekday.** The
column header is already a named-area grid (`styles.ts:972`); this adds one row:

```
grid-template-areas:
  'week    week    .'         <- new
  'weekday weekday .'
  'day     month   weather'
```

The badge reuses the list view's `.week-number` pill, so the existing
`week_number_font_size`, `week_number_color` and `week_number_background_color` options
carry over untouched, and the two numbering modes keep working through the same helper.

**The load-bearing detail: the row must be reserved in every column, not only the ones that
start a week.** An empty grid area collapses, so a week-start column would render a taller
header and push its own weekday, day number and entire event stack down relative to its
neighbours — the header row would stop scanning as a row of days. This is the same
constraint that ruled out a leading track for the today indicator in D8-A, and it has the
same shape of fix: emit the pill in every column when week numbers are on, and set
`visibility: hidden` on the columns that do not begin a week. That reserves the exact height
from the real element rather than from a guessed value, keeps one code path, and is correctly
ignored by assistive technology. When `show_week_numbers` is `null` — the default — no row is
added at all and the header is unchanged, so the cost is paid only by users who opted in.

`show_current_week_number: false` keeps its list-view meaning: it suppresses the badge on the
**first** column only, which is usually a partial week (`render.ts:476`). In column view it
suppresses the badge and nothing else, because there is no separator bound up with it to fall
back to.

**Do not carry the list's week/day-separator coupling over — the premise was false.** Earlier
revisions of this section claimed that in list view `hasWeekSeparator` fires when
`show_week_numbers !== null` **or** `week_separator_width !== '0px'`, so switching week numbers
on implicitly switches a week separator on, and that column view should keep that. **The
premise does not survive reading the code.** `hasWeekSeparator` (`render.ts:385-386`) has
exactly one consumer, at `:391`, where it **suppresses the day separator**. With week numbers
on and `week_separator_width: '0px'`, `renderWeekRow` sets `--separator-display: none` and
nothing is drawn — no week rule appears. So the flag is not a coupling that turns a separator
_on_; it is day-separator _suppression_, and it exists only because the list's week-number pill
is a full-width row that physically occupies the slot a day separator would otherwise take.

Column view has no such collision: the week pill lives inside the column header, and the
separator lives in the gutter between columns. Carrying the flag over would silently delete
the day rule at every week boundary for anyone who turned week numbers on — a regression
wearing the costume of a feature. **Ruled: pure width-driven precedence** (see D9). Two unit
tests pin it, and live test card 3 is the visual proof — week pills 33/34/35 render with all
14 day rules intact.

**Sequencing: implement immediately after the separators**, not before. The two share boundary
detection — a week-start column is exactly a column that would carry a week separator — and
building them together means detecting it once.

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#d5-forced-config-and-week-numbers-new)

#### D6. Per-view config overrides — the `column:` block (new v8)

**Ruled, with maintainer sign-off.** A nested `column:` block carries per-view values. Any key
absent from it inherits the top-level value; an absent block reproduces today's behaviour
exactly.

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.family
view: column
days_to_show: 7
show_location: true # list view: plenty of room
day_spacing: 16px
column:
  show_location: false # column view: ~166px per column is not enough
  day_header_gap: 4px # a new key (Category C), no top-level counterpart
```

> Note the asymmetry in that block: `show_location` is an **override** of the top-level key,
> whereas `day_header_gap` is a **new key** that has no top-level counterpart. Both live inside
> `column:`, but only the first participates in inheritance. See the Category C table below.

##### Why a shared key is not enough

The plan previously asked, per key, _"what does this mean in column view?"_. That is the wrong
test. `view: column` falls back to list below a width breakpoint, so **one card instance renders
column on a desktop and list on a phone**. The real test is stronger:

> Is there a single value the user would want in **both views at once**?

Where the answer is no, a shared key is not a simplification — it is a guarantee that tuning
one view breaks the other.

##### The sizing intuition is backwards

Column view is triggered by a **wide card** but produces **narrow content boxes**. Using the
**measured** placement widths from the G13 spike rather than a hypothetical card width, and the
largest column count that clears the floor at each (computed at the 160px provisional; the shipped 140px floor is more permissive, so these counts are a lower bound) **[v12]**:

| Context                              | Columns | Horizontal budget per event |
| ------------------------------------ | ------- | --------------------------- |
| Default HA section, 500px (measured) | 3       | **~161px**                  |
| `column_span: 2`, 1032px (measured)  | 6       | ~165px                      |
| `column_span: 3`, ~1564px (derived)  | 7       | ~217px                      |
| List view on a ~390px phone          | 1       | **~300px**                  |

Per-item width in column view is **smaller than mobile list view at every reachable placement** —
the original estimate of ~164px for a hypothetical 1200px card turns out to describe the typical
case almost exactly, for the wrong reason. Any text-density setting tuned on a phone is too
generous in a column.

Note that the first row is the _default_ placement and it caps at three columns, which is why
G14 rules that the card falls back to list rather than clamping, and why
`min_day_width` is public.

##### Eligibility — the boundary follows from G10

G10 rules that a view transition must **never** refetch. Therefore the block may contain only
**render-time and grouping-time** keys. A fetch-time key inside it would fire a Home Assistant
API call on every resize across the breakpoint.

| Cat.  | Meaning                         | In `column:`?             |
| ----- | ------------------------------- | ------------------------- |
| **A** | Shared — semantic, not layout   | No — pointless            |
| **B** | Override-eligible               | **Yes**                   |
| **C** | Axis-rotated                    | No — **new key** instead  |
| **D** | Structurally forced/meaningless | No — see D5 kinds 2 and 3 |
| **E** | Fetch-time                      | **Never** — G10           |

Category E, exhaustively: `entities` (and `entities[].entity`, `.blocklist`, `.allowlist`),
`start_date`, `days_to_show`, `first_day_of_week`, `show_past_events`, `filter_duplicates`,
`weather` / `weather.entity` / `weather.position`, `refresh_interval`, `refresh_on_navigate`.

Two of these are easy to get wrong. **`first_day_of_week`** feeds week-relative `start_date`
resolution, so it can move the fetch window. **`weather.position`** determines which forecast
subscriptions are started, so "show weather in the column header only" cannot be expressed as
an override of it — it needs a render-only key.

##### Category C keys get new names, not overrides

Where the same value means a rotated thing, reusing the name inside `column:` still forces the
user to hold two meanings for one word. These get distinct keys:

| List-view key              | Column-view meaning                | Resolution                                             |
| -------------------------- | ---------------------------------- | ------------------------------------------------------ |
| `day_spacing`              | vertical gap → horizontal gutter   | reuse — "gap between days" in both                     |
| `day_separator_*`          | horizontal rule → vertical rule    | new `column.day_header_separator_*`                    |
| `week_separator_*`         | horizontal rule → vertical rule    | reuse — full-height vertical rule                      |
| `month_separator_*`        | horizontal rule → vertical rule    | reuse — full-height vertical rule                      |
| `compact_days_to_show`     | day rows → columns                 | ~~reuse — the unit is "days" in both~~ **inert [v14]** |
| `compact_events_to_show`   | total budget → per-column budget   | **out of MVP** (G12)                                   |
| `today_indicator_position` | tall date cell → short header band | needs a real dashboard (G13)                           |

> **[v14] The `compact_days_to_show` row is corrected in place** rather than cross-referenced,
> because the table is a lookup and a reader who consults one row will not read D8. "The unit is
> days in both" is true and was still the wrong conclusion: the unit surviving translation does
> not mean the _effect_ does. Dropping day rows shortens a list; dropping columns widens the
> survivors into the freed space, so the card is the same size and merely holds less. The whole
> compact family is inert — see D8 for the verified set.

`day_spacing` is the concrete case that motivated this: at `day_spacing: 24px`, seven columns
lose **144px** to gutters before any content is laid out.

##### Precedent in this codebase

`WeatherConfig` already does exactly this: `date?: WeatherPositionConfig` and
`event?: WeatherPositionConfig` — one option shape, two rendering contexts, configured
separately (`types.ts:147-168`).

> **Copy its shape, not its merge.** The disjoint field sets under `date` and `event` are
> deliberate — the two positions render different things, and `config.ts:118-136` gives them
> disjoint _defaults_ to match. What does not carry over is the resolution idiom. `setConfig`
> merges shallowly (`calendar-card-pro.ts:719`), and the weather renderers compensate with
> `config.weather?.date || {}` plus `!== false` / `=== true` reads, so an absent key falls back
> to its default. **That idiom cannot be used here**, because it conflates "not set" with "set
> to `false`" — and `column.show_location: false` against a top-level `true` is precisely the
> case the block exists to express. Resolution is therefore **presence-based** (`'key' in
block`), inheriting from the merged top-level value, never from `DEFAULT_CONFIG`.
> `ColumnOverrides` is its own narrowed type, not a re-use of `Config`.

##### Constraints this satisfies

- **F3** — additive. No shipped key is renamed, so no YAML-only user breaks.
  (`DEPRECATED_CONFIG_MAP` is editor-only, `editor.ts:381` and `:453`.)
- **G10** — no fetch-time key present, so a breakpoint crossing never refetches.
- **E1** — every excluded key is documented as excluded, not silently inert.

##### Scope — ruled

> **[v8] Both open questions ruled by the maintainer.** Neither is a permanent exclusion: both
> are **MVP-scope deferrals**, and both are listed in [D7](#d7-deferred-past-mvp--required-before-the-first-production-release)
> as release blockers for v4.0.0.

- **Per-entity precedence — deferred past MVP.** `entities` is category E, so the array cannot
  be overridden. Per-entity _render_ flags (`entities[].show_location`) are category B and so
  are eligible in principle, but addressing them needs a scheme — patch by array index, or by
  entity id — and neither is obviously right. Array index is brittle against reordering; entity
  id breaks when the same calendar appears twice with different display settings, which is a
  supported pattern. **MVP has no `column.entities`.** The card-level override applies to every
  entity, exactly as the top-level key does today.
- **Editor exposure — deferred past MVP, YAML-only first.** The block is YAML-only for
  development and internal testing. This is not a shipping position: the editor is ~2,000 lines
  and the most fragile file in the repo, and every control needs a string in all 11
  editor-translated languages — a _partial_ `editor` section renders raw key names rather than
  falling back to English. Building those controls against a spec that is still moving would
  mean building them twice, so they follow the block rather than accompany it.
- **Divergent column defaults — a carve-out of the inheritance rule (new v10).** Two keys are
  wrong at their shipped default in a grid of days. `show_empty_days` is the case in hand: a
  _list_ of events reads perfectly well with blank days omitted, but a _grid_ with the blank
  columns missing stops corresponding to consecutive days, and the card silently becomes a
  different thing than it looks like. Such keys are listed in `COLUMN_DEFAULT_OVERRIDES` and
  **do not inherit their top-level value in column view at all** — the column default stands
  until the `column:` block overrides it:

  ```yaml
  view: column
  column:
    show_empty_days: false # the only way to switch it off for columns
  ```

  The rejected alternative was "inherit only where the user left the top level untouched",
  which needs a record of which keys were typed by hand and produces the surprising result
  that two cards with identical _effective_ list behaviour render differently in column view
  depending on whether a value was written or defaulted. One sentence of documentation beats a
  distinction invisible in the YAML. Every member of the table must also be a member of
  `COLUMN_OVERRIDE_KEYS`, or the escape hatch fails validation and the default becomes
  unconditional; a test enforces that. The cost is that column view can no longer return the
  configuration by identity, which is why `effectiveConfig` memoizes on configuration **and**
  view.

- **`split_multiday_events` joined that table — the block is lifted (amended v10).** A column
  _is_ a day, so an unsplit multi-day event makes the card lie: it renders in its start column
  only, and every later column it spans asserts "no upcoming events" while a tracked event is
  in progress. Confirmed on a live card. This was recorded as **blocked**, on the reasoning
  that splitting happens in `processMultiDayEvents` inside `processRawEvents` — the **fetch and
  cache-hydration** path, not per render — so a per-view value would force a reprocess on every
  width-threshold crossing, breaching the refetch-free guarantee of G10 and E-crit 3.

  **The premise was right and the conclusion was wrong.** It assumed the split has to happen
  where it happens today. It does not: `processMultiDayEvents` is idempotent, so a second pass
  at _render_ time costs nothing on an array that was already split and produces the right
  answer on one that was not. The key stays out of `FETCH_TIME_KEYS`, the stored array stays
  shared between views, no width transition invokes `callApi`, and G10 and E-crit 3 are
  untouched. See the [v10] note in §D5 for the three properties that make the render-time pass
  safe, and why moving the split wholesale into `groupEventsByDay` would not have been.

> Full audit, per-key classification and rejected alternatives:
> [column-view-rationale.md](./column-view-rationale.md#d6-per-view-config-overrides-new-v8)

##### D6-B. The density framework — how width picks a column count **[v16]**

Mechanism for [A3-G](#a3-g-density-framework--width-reduces-the-column-count-before-it-changes-the-view-v16).
Shipped at `view.ts:1092-1204`; the ruling, the supersessions and the key table live in A3-G and
are not repeated here.

**The width one column costs.** Every threshold derives from a single unit —
`min_day_width + gutter` — where the gutter is `column.day_spacing`, falling back to the
top-level `day_spacing`, defaulting to 10px (`columnGutterPx`). The width needed for `d` columns
is `computeColumnThresholdPxFor`:

```
min_day_width × d  +  COLUMN_CARD_PADDING_PX  +  (d − 1) × gutter
```

`computeColumnThresholdPx` is now this function evaluated at `days_to_show`, which is why A3-C's
formula is unchanged rather than replaced.

**Inverting it, rather than looping.** The function above is monotonic in `d`, so `fitColumns`
solves it in closed form:

```
d ≤ (width − COLUMN_CARD_PADDING_PX + gutter) / (min_day_width + gutter)
```

floored, clamped to `[0, days_to_show]`, with a `1e-9` epsilon. The epsilon is not decoration: a
fractional gutter makes a quotient that is mathematically `3` evaluate as `2.9999999999999996`
and floor to `2`, so an exact boundary would resolve to the wrong column count.

**Thresholds at defaults** (`min_day_width: 140`, gutter 10, padding 16):

| Columns | Enter (px) | Leave (px) |
| ------- | ---------- | ---------- |
| 3       | 488        | 472        |
| 4       | 638        | 622        |
| 5       | 788        | 772        |
| 6       | 938        | 922        |
| 7       | 1088       | 1072       |

**Hysteresis applies to the width, not to each threshold.** `VIEW_SWITCH_HYSTERESIS_PX` is 32
and is applied as ±16 — growing costs half a band, shrinking is granted half a band, and a width
inside a band holds whatever is already rendered. Applying it to the measured width rather than
to each boundary is the same Schmitt trigger in the one form that survives having more than one
boundary to defend.

That matters because column reduction introduces `days_to_show − min_days_to_show + 1`
boundaries where there was one, spaced one unit apart. Bands wider than half that spacing would
overlap, and a single width could then satisfy the enter condition for one count and the leave
condition for the next — oscillation rather than damping. `columnHysteresisHalfBandPx` clamps
the half-band to `(spacing − 1) / 2` for exactly this. At defaults the spacing is 150px and the
clamp never binds; it binds only for a user who has driven `min_day_width` down near the gutter,
which is a configuration the card deliberately permits.

**Before the first measurement the card is optimistic** — it renders `days_to_show` columns
rather than the list layout, for the reason documented on `resolveEffectiveView`: rendering list
and then swapping flashes the wrong thing on every load of a card that is wide enough. As with
the view switch, that optimism is a bet rather than an observation and must not seed the
trigger, which is why `resolveColumnFitOnMeasurement` refuses the band when
`previousMeasuredWidthPx` is `null`. A `null` previous layout deliberately lands in the _growing_
branch via a previous count of zero, so a card must qualify at the enter threshold for a column
it has never been wide enough for.

**Return shape.** `resolveColumnFit` returns `{ view, columns }` rather than a view alone.
`columns` is `0` in list view, because a column count is not a thing the list layout has.
Keeping both in one record is what lets the host detect a change in either with one comparison —
a width change that drops a column without changing the view still has to re-render, and a host
tracking only the view would miss it.

#### D7. Deferred past MVP — required before the first production release

**[v8]** MVP here means "the column view renders correctly and is testable", not "shippable".
Several deliberate deferrals make the MVP tractable; every one of them is a **release blocker
for v4.0.0** and none may be dropped silently. This section exists so that the distinction
survives — a deferral recorded only in the section that deferred it is a deferral that gets
forgotten.

| Deferred                                | Deferred in | Why deferred                                                                                                                | Release requirement                                                                                                                |
| --------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Editor controls for `column:`**       | D6          | Spec still moving; would be built twice                                                                                     | Full editor support, strings in all 11 languages                                                                                   |
| **`column.entities[]` overrides**       | D6          | Addressing scheme unresolved (index vs id)                                                                                  | Ruled and implemented, or documented as N/A                                                                                        |
| **`compact_events_to_show` overrides**  | G12         | Per-column budget is a different algorithm                                                                                  | Ruled in or documented as N/A (E1 forbids silence)                                                                                 |
| **Week / month separator overrides**    | D6          | Axis-rotated; needs its own visual design                                                                                   | Ruled in or documented as N/A                                                                                                      |
| **View-scoped keys flagged in editor**  | D8          | Ships with editor support as a whole                                                                                        | Must ship — E1 is otherwise carried by docs alone                                                                                  |
| **Editor too-narrow warning**           | G14         | Editor support as a whole is post-MVP                                                                                       | Must ship — it is what makes G14's ruling honest                                                                                   |
| **Feedback for a bad key in `column:`** | 4a / D-1    | `Logger.warn` is silent in prod builds                                                                                      | Editor prevents it at source; docs list valid keys                                                                                 |
| **Honesty affordance for auto-fit**     | A3-G        | A truncated card looks like a complete one                                                                                  | Ship before any change to the A3-G defaults                                                                                        |
| **Progress bar in column view**         | —           | Renders via the shared leaf but is never exercised: it defaults off, so the suite (built from default config) cannot see it | Verified live at adequate width **[v18]**; narrow-column geometry is backlog C5, and a test that turns the option on is still owed |

The E1 acceptance criterion is what enforces this: _no silent config no-ops_. Anything still
deferred at release must appear in the documented not-applicable list, so a user who sets it
learns that it does nothing. Silence is the failure mode, not the deferral itself.

**[v9] The last row is the one place E1 is currently carried by documentation alone**, so it is
recorded rather than assumed. Phase 4a's `validateColumnOverrides` reports a forbidden or
unrecognised key inside `column:` through `Logger.warn` — and `Logger.warn` produces **no output
whatsoever in the HACS production build**. The chain: `rollup.config.mjs:38-42` replaces
`CURRENT_LOG_LEVEL: 1` with `0` when `isProd`; `LogLevel.WARN` is `1` (`utils/logger.ts:10-17`);
the guard at `utils/logger.ts:244` is `if (currentLogLevel < level) return`, so `0 < 1`
suppresses every warning. A YAML user who writes `column: { entities: [...] }` today gets the key
silently ignored with no feedback anywhere.

**Ruled: leave it silent for MVP; close it with the editor, not the logger.** Three reasons.
The `column:` block is not hand-authored in the intended flow — editor support is already a D7
release blocker, and a control that cannot emit an invalid key is a stronger guarantee than a
console message the user has to know to look for. Home Assistant itself ignores unknown keys in
card config without complaint, so a console error here would be louder than the platform norm
for the same mistake. And escalation is purely additive: raising this to `Logger.error`, or
surfacing a card-level banner, can be done later without changing a single call site, because
`validateColumnOverrides` already detects every case and classifies it into four buckets. The
detection is done; only the delivery is deferred.

Until the editor ships, the documented valid-key list is the contract. That makes the
`docs/reference/configuration.md` rows for `column:` load-bearing rather than descriptive — a
key missing from that table is, for a YAML user, a key that fails silently.

**Non-blocking follow-up (not a release blocker).** Phase 2b left `show_past_events` in
`getBaseCacheKey`. It is redundant there — it never reaches `getTimeWindow`, so it cannot
affect the API response, and it is applied at render time in `groupEventsByDay` — but it is
also baked into `generateDeterministicId` (`helpers.ts`), which feeds `_instanceId` and hence
the key anyway. Removing it from one place alone changes no behaviour, so it was left out of
the Phase 2b diff. Drop it from both, together, whenever that file is next touched.

#### D8. Keys that do not apply in every view — the editor must say so

**Ruled: no option may be inert in a view without the editor saying so.** This is the D5
kind-3 row ("ignored, meaningless in this view") escalated from a table cell to a policy,
because kind 3 is no longer hypothetical.

**[v14] The inert set is now eight options, not three.** It grew twice after this section
was first written — once when the compact-mode family was ruled inert wholesale, and once
when live measurement settled two cases that code reading had gotten wrong. Every row
below is verified against the running card, not inferred from source:

| Option                                       | Why it is inert in column view                                                                        |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `date_vertical_alignment`                    | Nothing to align against — the header is its own row (A3-A)                                           |
| `today_indicator_position`                   | The percentage model does not survive the axis flip (D8-A)                                            |
| `compact_events_to_show`                     | Caps events per _card_; in a grid that deletes content from columns rather than shortening the card   |
| `compact_events_to_show` (per-entity)        | **Same, and worse** — the bucket is keyed per entity per card, so one cap collapses every column      |
| `compact_days_to_show`                       | Caps the day slice, which deletes trailing **columns** — the card occupies identical width either way |
| `compact_events_complete_days`               | The height budget rotates per column, not per card (A3-D)                                             |
| `action: 'expand'` (tap / hold / double-tap) | Nothing to expand once the caps above are inert — the gesture is a flat no-op                         |
| `split_multiday_events` (per-entity)         | Overridden by the column force-default; the `column:`-level key is the escape hatch                   |

Three of these need their provenance stated, because each contradicts something written
earlier in this document and the earlier text is the more intuitive reading:

- **Per-entity `compact_events_to_show` is not column-safe.** A3-D:262-264 recorded it as
  safe on the assumption that a per-entity cap distributes per day. It does not: the bucket
  at `events.ts:419` is keyed `${entityId}__${configIdx}` — **one budget per entity per
  card**. A cap of 1 on a single-entity card therefore yields exactly one event in the
  whole grid, collapsing a 3-column layout to a single populated column. A3-D is corrected,
  not extended.
- **`action: 'expand'` is _unconditionally_ inert.** An earlier reading of the
  `!isExpanded && !showEmptyDays` filter at `events.ts:497-505` predicted that `expand`
  stayed live in the narrow case of `column: { show_empty_days: false }` combined with a
  compact cap, toggling the column count. **Measured: it does not.** A column card held at
  five columns across a real click while an otherwise-identical list card moved from two
  events to five on the same gesture and the same `compact_events_to_show: 2` — proving
  `isExpanded` genuinely flipped and the column render simply does not consume it. The
  likely mechanism is that with `show_empty_days: false` the empty days are never generated,
  so the filter operates on a list that never held them. The mechanism is unconfirmed; the
  behaviour is not. **Do not re-derive this from source and re-open it** — the source reads
  misleadingly, and the table needs no conditional caveat.
- **Per-entity `split_multiday_events` loses to the column force-default.** Measured: a
  card setting it `false` per entity is byte-identical to the control that sets nothing —
  the event still splits across three columns. Setting it inside `column:` _is_ honoured
  (the same fixture renders once). The precedence chain is therefore
  `column:` explicit > `COLUMN_DEFAULT_OVERRIDES` > per-entity > top-level, which is
  coherent — a per-view force-default must outrank a per-entity preference or it is not a
  force-default — but it makes the per-entity switch silently ineffective, which is exactly
  what this section exists to forbid.

E1 forbids silent config no-ops, and a control that visibly does nothing when you drag it
is the loudest possible violation of that: worse than an option that is missing, because
the user concludes the feature is broken rather than absent.

**Hiding the field when `view: column` is selected is not an option, and the reason is
structural rather than aesthetic.** There is no third `auto` mode — the narrow-viewport
fallback belongs to `column` itself (`types.ts:135`), so a card configured
`view: column` renders **as a list** on any dashboard narrower than its threshold. Both
layouts are live for the same card at the same time. Hiding `today_indicator_position`
because column view is selected would therefore remove the only control for the layout
that card actually uses on a phone. The key is not inert for the card; it is inert for
one of the two layouts the card renders.

That leaves the field in place, and the question is only how it is annotated.

**Baseline, and what should ship: a conditional `helper-text` note under the field.** The
idiom already exists and is used about twenty times in `editor.ts`, including
**conditionally on config state** — `week_number_note_iso` versus `week_number_note_simple`
at `editor.ts:1119-1124` swap on `first_day_of_week`. A note that appears only when
`view` is `column`, reading approximately _"List view only — column view places the
indicator for you"_, is the same construction against a different condition. Cost: one
render branch and one string per language. It is additive, so it cannot regress list view.

**Recorded but not planned: two configuration surfaces.** A tabbed editor with separate
list and column sections would express the split exactly, and would also solve D6's
unbuilt `column:` controls in the same stroke — every override key would simply appear in
both tabs. It is recorded here so the idea is not lost, **not** adopted. It is a rewrite of
the editor's structure, it multiplies the surface every future option has to be added to,
and it would double the translation burden across all 11 editor languages. Revisit only if
building D6's override controls one at a time proves worse.

**Sequencing.** Editor work as a whole is post-MVP (D7), so this ships with it rather than
before it — but it is a **release blocker for v4.0.0**, on the same footing as the `column:`
controls, and for the same reason: it is what makes the deferral honest. Until then the
documented not-applicable list is the contract, exactly as for D7's last row. Both
`date_vertical_alignment` and `today_indicator_position` are already documented as
list-view-only in `docs/features/layout-appearance.md`.

**One thing to fix while implementing this**: the inert set is currently spread across
prose in three sections and no single place in code. A named export in `view.ts` — the
counterpart to `COLUMN_ONLY_KEYS` — would let the editor drive its notes from the same
list the docs check reads, so the two cannot drift. `NOT_YET_IMPLEMENTED_KEYS` is the
wrong home: those keys are unfinished, whereas these are finished and deliberately
scoped, and conflating "not built yet" with "does not apply here" would make the first
category impossible to burn down.

**[v14] That export is now overdue rather than merely desirable.** It was proposed when
the set was three static rows; it is eight, it grew twice in one development cycle, and
two of its rows exist only because a live measurement contradicted a plausible reading of
the source. A list that volatile cannot be maintained as prose in three places — the
`[v14]` pass above found the D8 table describing less than half the real set while the
implementation had been correct for two commits. Build the export **before** the editor
annotations, not alongside them, so the annotation work has a single source to read.

##### D8-A. Why `today_indicator_position` is inert rather than remapped

Recorded because the obvious fix does not work, and the next person will try it.

The default `15% 50%` is calibrated for the list view's date cell — roughly 66px wide,
text centred — where 15% puts the dot in the margin beside the date. It is not a bug in
positioning: measured live, the value resolves to 14.8% / 50.0%, exactly as configured.

A column header is the full track width (176px measured at a 3-column span) with its date
flush left, so the same 15% resolves **into** the day number. No percentage fixes this:

- **Re-anchoring does not help.** `.column-date-content` is full-width too, so there is no
  box in the header whose width tracks the date text.
- **Right-anchored values are worse than wrong.** At 95% the dot sits in the gutter,
  nearer the _next_ day's content than the day it marks. With a 10px gutter the ambiguity
  is unavoidable, not merely tight.
- **A width-dependent default is not a default.** Any percentage correct at 176px is wrong
  at 300px, and the column width is set by the dashboard, not by config.

All four candidate placements were built as live test cards and reviewed before this was
settled. **Ruling: column view emits the indicator as a leading item on the weekday row** —
an unambiguous `● Tue` at any column width. It shares the weekday's grid cell rather than
taking a track of its own, because a leading track would indent today's day number
relative to every other column and break the alignment of the number row. The weekday is
padded aside by exactly `today_indicator_size + 4px`, driven by a class the renderer sets
from the _rendered_ result rather than from `isToday`, so a value resolving to no
indicator does not reserve space for a dot that is not there.

`today_indicator`, `today_indicator_size` and `today_indicator_color` all apply normally
in both views. Only `_position` is inert.

**[v13] Ruled:** `today_indicator_color` is now in `COLUMN_OVERRIDE_KEYS` alongside
`today_indicator` and `_size`. Its absence was an oversight, not a decision — a card could
override whether the dot appears and how large it is, but not its colour, which is an
arbitrary hole in an otherwise complete cluster. `_position` remains correctly absent from
that list: an override for an inert key would be a no-op wearing the costume of a feature.

---

#### D9. Separators between columns — shipped, live-verified

Column view carries all three of the list view's separators, rotated 90°: `day_separator_*`,
`week_separator_*` and `month_separator_*` each draw a **vertical rule in the gutter** rather
than a horizontal rule between rows. All three default to `0px`, so the default card is
unchanged, and all six keys are override-eligible inside the `column:` block.

**Precedence is pure and width-driven: month > week > day.** A boundary draws exactly one
rule, of the highest-ranking kind whose own width is non-zero. Each kind is gated only on its
own width — never on `show_week_numbers` — which is the D5 correction above. A boundary is
never doubled, and a rule is only emitted for column index **k ≥ 1**, so no card ever opens
with a leading rule.

**Geometry: full height for all three.** An earlier proposal gave the day rule a shorter span
(events only, mirroring the list) and the week/month rules a full span. The maintainer
overruled it — _"lets use full height for all three separators"_ — and the result is visually
much cleaner, because the three kinds then differ only in width and colour rather than in two
dimensions at once.

**Technique: an overlaid grid item with a negative inline-start margin.** The rule is an
_additional_ item placed in the same cell as the column it precedes, `align-self: stretch`,
`justify-self: start`, offset by `calc(-0.5 * (gap + width))` so it centres in the gutter.
Tracks stay `repeat(N, minmax(0, 1fr))` and `column-gap` is untouched.

Three alternatives were tried and rejected, each for a concrete reason worth keeping:

| Rejected                               | Why                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------ |
| Extra `auto` tracks for the gutters    | `column-gap` applies on **both** sides of the new track, so every gutter doubles     |
| `border-inline-start` on `.day-column` | The grid sets `align-items: start`, so the border stops at that column's own content |
| Absolute positioning                   | The x-offset is unknowable without subgrid                                           |

**Explicit grid placement is mandatory on both the columns and the separators.** Explicitly
placed items lay out before auto-placed ones, so mixing the two pushes auto-placed day columns
onto row 2 and the card collapses.

Because the grid uses `align-items: start`, a stretched separator contributes nothing to row
sizing, so every rule is exactly as tall as the tallest column and all rules are identical in
length. That is what makes the full-height choice cheap.

**The `SEPARATOR_SPACING` multipliers are dropped** (week 1×, month 1.5×, `constants.ts:87-92`).
CSS `column-gap` is uniform across the grid; widening the gutter at one boundary would require
per-track sizing and buys nothing once the rules differ by width and colour.

**Live verification** — 8 purpose-built cards on `ccp-current-testing`, all passing: default
(no rules), day-only (14 identical full-height rules, none leading), full precedence across a
window straddling both a week and a month boundary (month rule _replaces_ the week rule, never
doubles), week numbers + day rules coexisting (the D5 proof), centring inside a 24 px gap,
`day_spacing: 0` straddle, and a `column:` override producing rules where the top level says
`0px`.

---

---

### E. Cross-cutting acceptance criteria

> **Verified against `origin/dev` @ `29b8226`.** The `AGENTS.md` reference re-verifies at
> `AGENTS.md:119-163`.

1. **No silent config no-ops.** Every existing option either works in column view, is
   overridable per view via the `column:` block (D6), or is documented as not applicable.
   Current documented-N/A list: `date_vertical_alignment`, `compact_events_to_show`,
   `compact_events_complete_days`, week numbers, and week/month separator spacing multipliers.
   **[v10]** `split_multiday_events` left this list: it is not forced and not N/A, but a
   divergent column default (D5, D6) — `true` in column view, and reachable through the block. `compact_days_to_show` is **not**
   N/A — the unit is "days" in both views (D6, category C). G12's compact-scope contradiction
   is resolved by D6: `compact_events_to_show` is out of MVP, and the override block is the
   mechanism for it later, so no key needs two meanings.
2. **Every new user-visible string exists in all language files at ship time.** A partial
   `editor` section defeats the whole-language English fallback and renders raw key names.
3. **No fetch on a view transition.** Crossing the `view: column` width-fallback breakpoint must
   not issue a
   Home Assistant API call (G10). This is the invariant that bounds D6's override block to
   render-time and grouping-time keys, and it is testable: cross the breakpoint with a warm
   cache and assert zero `callApi` invocations.
4. **An override of `false` beats an inherited `true`.** **[v8]** The `column:` block resolves
   by _presence_, not truthiness, so `column: {show_location: false}` against a top-level
   `show_location: true` must render locations in list view and omit them in column view. The
   codebase's existing `!== false` idiom (`render.ts:540`) cannot express this, so the test
   guards against reaching for it out of habit. The mirror case — `false` at top level,
   `true` in the block — must hold too.

HA soak list — list view must be pixel-identical after phases 1–2b and rechecked after Phase 4:
default config; compact mode (all three keys); `max_height` scrolling; multi-day spans under
both `split_multiday_events` settings; all-day events; day weather and per-event weather; entity
labels; per-entity `show_time`/`show_end_time`/text colour; `show_empty_days: true`; week and
month boundary in one window; `today_indicator` with a non-default position; non-default
`vertical_line_width`; RTL; countdown and progress-bar states.

Phase 2 adds warm-cache cases: with a populated cache, flip `split_multiday_events`, change an
entity label, and change an allow/block pattern. Confirm the view updates.

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#e-cross-cutting-acceptance-criteria)

---

### F. Constraints that bind implementation

> **Verified against `origin/dev` @ `29b8226`.**

1. **Build sentinel.** `rollup.config.mjs:10` tests `NODE_ENV === 'prod'`, not `'production'`.
   `NODE_ENV=production npx rollup -c` silently produces a dev build while reporting success.
2. **Current gates.** Use `npx tsc --noEmit`, `npm run lint`, `npm run check:i18n`,
   `npm test`, both Rollup forms, and manual HA soak where appropriate. DOM goldens are now a
   hard pass/fail gate running in CI through `npm test`. `AGENTS.md` is stale about the script
   count and test framework; amend it separately rather than silently violating it.
3. **Config migration is editor-only.** `DEPRECATED_CONFIG_MAP` (`editor.ts:67-72`) is consumed
   solely at `editor.ts:381` and `:453`. A YAML-only user's deprecated key is silently ignored,
   never migrated. Renaming any shipped key is a real YAML break.
4. **Attribution.** lenaxia's four commits stay as ancestors. Never squash him out.
5. **Communication.** A public epic issue tracks this work and links the column-view requests
   (#14, #263, #253). #339 gets an informational note that column view lands first and that its
   time-grid work is retained for Phase 5.
6. **Branch provenance.** Every `src/` citation is branch-specific. `dev` is the default source
   unless a citation is explicitly marked `[frozen]`. Frozen-branch sections describe
   `alexpfau-review-339-time-grid` and must not be mistaken for code present on `dev`.
7. **`hide_when_empty` in column view.** Specify its interaction with column rendering.
   `visibleEventCount` windows by `days_to_show`, so the count and rendered column set must not
   disagree. With `hide_when_empty: true` and `show_empty_days: null`, resolved empty-day
   semantics must be used consistently. **[v6] Largely resolved by G14:** because the column
   count is never reduced by width, the only source of divergence left is an explicit
   `show_empty_days: false`, which is the _same_ suppression the list view already applies — so
   the existing window is correct and no reconciliation is needed. What remains is narrow: prove
   the resolved (not raw) `show_empty_days` value feeds both the count and the grouping.
8. **🚨 The whitespace trap — binds every template edit, not just extractions. [v19]**
   The DOM gate's serializer normalises whitespace **between tags only** (`/>\s+</g` → `>\n<`).
   Whitespace **adjacent to a text node survives verbatim into the snapshot**, so the literal
   source indentation of an event title is part of the oracle. The rule: **preserve the original
   absolute indentation verbatim inside every moved template, even when it looks wrong at the new
   nesting depth.** If a snapshot diff appears, it is a whitespace error — fix the indentation.
   **Never run `vitest -u`** to make it go away; that launders the change past review, and the
   gate's whole value is that it is the one artefact the refactorer does not get to edit.
   Verified by running it, which the claim this replaces was not: **prettier _does_ reformat
   inside `html` tagged templates** and will put deliberate whitespace straight back. It is
   careful about whitespace it _already finds_ — existing templates round-trip unchanged,
   and it breaks as `</span\n><span` so no new text node appears between inline elements.
   That asymmetry is why the false claim survived: a template deliberately written to have
   **no** whitespace is the one case that breaks, and it gets the indentation put straight
   back. **Deliberate whitespace needs `// prettier-ignore`.** The counter-example is in the
   tree: `leaves.ts:122`, on the weather badge, added after `npm run format` put the
   phantom-space bug back and turned five tests red.
   **Proving a snapshot diff is whitespace-only:** collapse only what the serializer
   already normalises — `norm = (s) => s.replace(/>\s+</g, '><')` — and compare. A match
   proves no text, text-adjacent-indentation, attribute or element change anywhere in the
   file. Stripping _all_ whitespace is weaker and will pass a real text-adjacent
   regression.
   **🚨 The trap has a second face, and it bites the renderer rather than the gate. [v20]**
   Template whitespace inside a flex item is _usually_ invisible — a flex container drops the
   whitespace between its items, and an item's own leading run collapses because it is
   line-leading. Both halves of `renderEventWeather` relied on that, and the stylesheet said so
   outright. It is only true while nothing precedes that run on the line. Add a `::before` and
   the leading whitespace is no longer line-leading, so it renders — but only in the span whose
   template writes literal text immediately before a binding (`UV${...}`), because lit fuses the
   indent into that text node while a binding-first span gets a standalone whitespace node that
   is discarded anyway. The symptom was a single 3.34px space on one side of one middot, which
   read as an asymmetric separator and was diagnosed twice as a stray margin. Two rules follow.
   **Never assume template whitespace is inert because a container is flex** — check whether
   generated content precedes it. And when it does render, **fixing it in the template is the
   move you cannot make**: that whitespace is text-adjacent, so `norm` above cannot certify the
   snapshot diff, and any template shared with the list view is therefore CSS's problem. The fix
   that worked was taking the `::before` out of flow, which restores the collapse rather than
   compensating for it.
   **Promoted here from Phase 1 in [v19].** It was written during Phase 1 and lived under a
   heading marked ✅ complete, where a reader checking the live constraints before touching a
   template would never see it — while the text itself says it "governs every later extraction".
   The full derivation stays in [§C Phase 1](#phase-1--shared-leaf-renderers--ships-3x--risk-low---complete).

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#f-constraints-that-bind-implementation)

---

### G. Open questions

> **Verified against `origin/dev` @ `29b8226`.** No `src/` citations in this section. **[v5]**
> Items 6 and 8 remain genuinely open and cannot be closed on paper; item 9 remains true.

> **[v6→v8] G10–G13 are now RULED.** Raised by an independent review pass as hard Phase 4
> prerequisites, then delegated to the implementation lead ("you decide what's best"). Three
> were decidable on paper; only G13 needs measurement, and it shrank because one of its
> sub-questions was a defect rather than an open parameter. **All four are reversible** — the
> maintainer may override any of them before Phase 4 starts.
>
> - **G10. `requestedView` vs `effectiveView` — RULED: name both, thread `effectiveView`.**
>   The width fallback is not render dispatch; it changes **data** semantics upstream
>   (`show_empty_days: null` resolves per-view, compaction switches from a shared budget to
>   per-column, column forces `split_multiday_events: true`). Below the breakpoint
>   `this._config.view` still reads `column` while the card renders `list`, so every one of
>   those resolves for the wrong view.
>   - **`requestedView`** = the config value. **`effectiveView`** = what is actually rendered
>     after the width fallback. Both names appear in code; neither is implicit.
>   - Every resolver and `ViewAdapter` hook takes **`effectiveView` as an explicit parameter**
>     and none reads `this._config.view`. This is the enforceable half: a resolver that takes
>     no view argument is a bug, catchable by inspection.
>   - **Transition rule** — cheapest sufficient action, keyed on which resolved value changed:
>
>     | Resolved value that changed | Action        | Why                                 |
>     | --------------------------- | ------------- | ----------------------------------- |
>     | `split_multiday_events`     | **regroup**   | [v10] splitting moved into grouping |
>     | `show_empty_days`           | **regroup**   | affects grouping only               |
>     | compaction only             | **re-render** | presentation only                   |
>     | —                           | re-render     | default                             |
>
>     **[v10] the first row was amended, and the ruling is unaffected.** It said
>     **reprocess**, because splitting ran in `processEvents` upstream of grouping. As
>     implemented it runs _inside_ `groupEventsByDay` as an idempotent top-up, so the two
>     divergent defaults now need the same, cheaper action. Nothing above depends on this —
>     "never refetch" was always the load-bearing clause, and reprocess was merely the most
>     expensive rung still permitted by it. §D5 [v10] carries the reasoning.
>
>   - **Never refetch.** Raw event data is identical across a view transition; only its
>     processing differs. This is the invariant that bounds D6's override block, and it is
>     testable (E3).
>
> - **G11. Outer layout — RULED: CSS Grid.**
>   ```css
>   grid-template-columns: repeat(N, minmax(0, 1fr));
>   column-gap: <gutter>;
>   /* align-items: stretch is the default — equal heights come free */
>   ```
>   where **N is the number of columns actually rendered**, not `days_to_show` (G13).
>   Equal heights are free in flex too, so that was never the discriminator. The real reason:
>   **`minmax(0, 1fr)` is the only formulation that survives a long event title.** A bare `1fr`
>   means `minmax(auto, 1fr)`, which refuses to shrink below content width and overflows the
>   card. Flex `flex: 1` carries the identical `min-width: auto` trap and needs an explicit
>   `min-width: 0` on **every** child — one omission and a single long title blows out the
>   layout. Grid fixes it once, on the container.
> - **G12. Compact-mode scope — RULED: split the two keys.** A3-D, D3 and E1 contradicted each
>   other because they were answering about **two different keys** as though it were one
>   question.
>
>   | Key                      | MVP     | Rationale                                                                                 |
>   | ------------------------ | ------- | ----------------------------------------------------------------------------------------- |
>   | `compact_days_to_show`   | **IN**  | In column view it means "render this many columns". It is N.                              |
>   | `compact_events_to_show` | **OUT** | A per-column budget is a different algorithm, and it is the half that entangles with G10. |
>
>   D6 removes the residue: with `compact_events_to_show` out of MVP and the override block
>   available for it later, no key needs to carry two meanings.
>
>   **[v14] The split has since been superseded by a wholesale exclusion: `compact_days_to_show`
>   is now OUT too, and with it the rest of the family.** Kept here as the log of what was ruled
>   at the time — the reasoning above is sound about the _unit_ and wrong about the _effect_.
>   See D3 and D8 for the current position, and the D8 warning against re-deriving the
>   `action: 'expand'` row from source.
>
> - **G13. Measurement spike — RUN. See "G13 spike results" at the end of this section.**
>   One sub-question was a **defect**, not an open parameter: with `show_empty_days: false` the
>   threshold formula still used `days_to_show`, so a 7-day config with events on 2 days
>   demanded a 7-column-wide container before showing 2 columns — defeating dense mode
>   outright. **Ruled: the threshold uses the rendered column count**, which is already known
>   at render time because grouping precedes it. Same N as G11. **The spike has now run:**
>   `min_day_width: 160` survived measurement (**[v12] the shipped default is 140** —
>   the measurement stands, the value drawn from it did not; see the G13 results below), 128 is
>   confirmed disproven, and the
>   card-edit modal measured 480px. **`min_day_width` is now ruled public config**
>   (G14). Still open after the spike: the hysteresis band, weather truncate-or-drop (which
>   _sets_ the minimum), and the header vertical budget. The default-width finding it surfaced
>   is ruled in **G14** below.
>
> Two further findings are recorded in place rather than here because they affect work that
> ships **before** v4.0.0: the Phase 2b cache scope (see the note in Phase 2b) and the Phase 1
> DOM-gate test design (see Phase 0 Stage 1).

1. ~~Decisions 11, 12, 13, 14~~ **SETTLED in v3** — see A2 and A3.
2. ~~Does `compact_events_to_show` render "+N more"?~~ **SETTLED: it does not.** **[v8, G12]**
   The key is **out of MVP**; when per-column compaction ships it is configured through D6's
   `column:` override block rather than by reusing the flat key — see A3-D and D3.
3. **Separator spacing multipliers in column view** — drop and document. **SETTLED in A3-E**;
   an explicit opt-in gutter key defaulting `0px` is additive later.
4. **Does column view ship in v4.0.0 alone, with time-grid in v4.1?** Recommendation: yes.
   Column view is the more frequently requested of the two and depends on none of the
   time-axis work; shipping them together would gate it on work it does not need.
5. **v4.0.0 is a milestone choice, not a semver necessity.** Nothing in phases 0–4 is breaking
   — `view` is additive and defaults to `list`. Worth naming as a deliberate choice.
   _Opportunity:_ if a major is happening anyway, it is the natural moment to batch other
   deferred breaking changes (e.g. retiring the editor-only deprecation map). Flagged, not
   scoped.
6. **[v3] Still genuinely open:** the hysteresis band for the view-switch threshold (A3-C).
   Needs a real HA dashboard to tune; cannot be decided on paper.
7. **[v4] RULED:** `show_empty_days` defaults to showing empty days in column view — but via an
   **auto sentinel**, not a bare per-view default. `null` (Automatic) / `true` / `false`,
   rendered as a select. See **A3-B-3**. Back-compat verified free; no gap affordance owed.
   **[v5] The "back-compat verified free" half of this is now known to be wrong** — there is a
   fourth consumer and a shippable defect. The _ruling_ stands; the cost estimate does not. See
   A3-B-3.
8. **[v4] To verify in HA, not on paper:** the actual card-edit modal width, which determines
   how severe A3-C.4 is (the mitigation is mandatory regardless). **[v5]** Now also determines
   whether the provisional `min_day_width: 160` (decision 14) survives measurement.
   **[v6] MEASURED: 480px, i.e. two columns. A3-C.4 is severe. 160px survives.** See G13
   results.
9. **No runtime or visual HA testing has happened on any of this yet.**
10. **[v5] Un-decided and un-decidable on paper: the real rendered width of an HA masonry or
    sections column.** Every threshold in A3-C and decision 14 is arithmetic over an assumed
    container width. The arithmetic is sound; the input is a guess. First measurement task in
    Phase 4. **[v6] MEASURED — see G13 results below. The input was wrong.**

---

#### G13 spike results — measured 2026-08-10 on a live HA instance

Chromium against a live dashboard, **reloading at each viewport width**. Live resizing does
not settle and produces non-monotonic garbage (a 900px viewport reported a wider content box
than a 1024px one); every number below is steady-state after reload.

**The mechanism.** HA's sections view lays out **fixed-width** columns, not fluid ones:

```
--ha-view-sections-column-max-width: 500px
--ha-view-sections-column-min-width: 320px
column-gap: 32px
grid-template-columns: 500px 500px        /* at a 1920px viewport */
```

Both custom properties are themeable and `column_span` is exposed in the section editor, so
**500px is a default, not a cap**.

**Measured — card content box:**

| Placement                   | viewport | content box |
| --------------------------- | -------- | ----------- |
| sections, `column_span: 1`  | ≥ 1440   | **500px**   |
| sections, `column_span: 1`  | 1280     | 464px       |
| sections, `column_span: 1`  | 768–1024 | 336px       |
| sections, `column_span: 1`  | 430      | 414px       |
| sections, `column_span: 2`  | ≥ 1440   | **1032px**  |
| **card-edit modal preview** | 1920     | **480px**   |

_Derived_ (arithmetic over the measured 500 + 32): span-3 ≈ 1564px, span-4 ≈ 2096px. Not
measured — creating those sections would have required writing to the dashboard.

Every view on the instance is `hui-sections-view`; **no masonry or panel sample was obtained**,
so their behaviour remains unmeasured.

**Measured — text widths at the card's real fonts** (Roboto; weekday and title 14px, day
number 26px, time 12px):

| String               | width |
| -------------------- | ----- |
| `Mon 13 Nov`         | 76px  |
| `Wed 24 Sept`        | 79px  |
| `Mittwoch 24. Sept.` | 117px |
| `12° 22°/14°`        | 73px  |
| `10:00 - 11:30`      | 69px  |
| `Team Standup`       | 91px  |

**`min_day_width: 160` survives measurement.** **[v12 — superseded as the shipped
value; the measurement below stands, the conclusion drawn from it did not.** 160 is a valid
_header_ floor, but the constant is also the multiplier in A3-C's view-switch threshold, and the
fit arithmetic that accepted 160 omitted the card's horizontal padding. The shipped default is
**140**; see decision 14 and the derivation comment on `COLUMN_DEFAULTS`.**] A single-line D2 header carrying date
plus weather needs 76 + 73 + gap ≈ **157px**, and the longest common localised date form
(`Mittwoch 24. Sept.`, 117px) still needs padding around it. 128px cannot fit date and weather
on one line — **confirming it is disproven, not merely superseded**. If weather is *dropped*
from the header rather than truncated, the floor falls to roughly 130px, so **the D2
truncate-or-drop decision sets the minimum\*\* and must be made before the constant is frozen.

**Resulting column counts** at 160px + 8px gutter:

| Card width                | columns |
| ------------------------- | ------- |
| 480px (editor preview)    | 2       |
| 500px (default section)   | **3**   |
| 1032px (`column_span: 2`) | 6       |
| 1564px (span 3, derived)  | 9       |

**A3-C.4 is confirmed real and severe.** The editor preview is 480px — two columns — which is
below the threshold for any multi-day config. A user configuring a 7-day column view would
watch the preview fall back to list while editing. The mandated mitigation (**the preview
renders the _selected_ view, not the width-measured one**) is load-bearing, not defensive.

##### G14. The default-width finding — RULED

A 7-day column view needs ~1184px of content box. That is **not reachable in a default HA
section at any viewport width** — it requires `column_span: 3`, a panel view, or a raised
theme variable. §D6's "7 columns in a 1200px card" describes a placement the user must
deliberately construct, not the default one.

**[v6 correction]** An earlier draft of this section argued from "the default `days_to_show:
7`" and concluded the out-of-the-box experience was a _permanent silent fallback to list_.
Both halves were wrong. `DEFAULT_CONFIG.days_to_show` is **3** (`config.ts:20`), and with the
real gutter — `day_spacing: '10px'` (`config.ts:40`) — the default config computes to:

```
3 × 160px + 2 × 10px = 500px
```

against the G13-measured default section content box of **500px**. So at a ≥1440px viewport
the default configuration does not fall back at all; it fits exactly, with zero margin. At
1280px, where the section measures 464px, it _does_ fall back. The honest characterisation is
**knife-edge and viewport-dependent**, not permanently failing.

Treat "fits exactly" as _at the boundary_ rather than as confirmed-fitting: the 500px figure
is the measured content box of `div.content`, and the card's own padding is drawn from inside
it, which is within the error bar of this arithmetic. The point stands either way — the
default lands on the threshold rather than far below it.

The ruling below is unaffected. It never depended on the column count; only this motivating
example did.

**Ruled: the rendered column count is determined by grouping, never by available width. The
card never silently drops columns because they do not fit.**

> **[v16] Superseded by A3-G.** Width _does_ now reduce the column count, down to a floor the
> user sets (`min_days_to_show`). The honesty objection below was not overruled — it was
> answered by defaulting that floor to `days_to_show`, so the reduction range is empty unless a
> user opens it deliberately. Everything below remains the reason the _default_ is what it is,
> and mechanisms 1 and 3 shipped as described.

Precisely: N is `days_to_show`, minus any days suppressed by an explicit `show_empty_days:
false` (the content-driven reduction already ruled in G13). Width never enters the calculation.
This is the same N as G11's `repeat(N, minmax(0, 1fr))` and the same N as G13's threshold input,
so all three remain consistent.

The rejected alternative was to render `⌊width / min_day_width⌋` columns, capped at
days available — a 500px card would then show a tidy 3-day column view out of the box. It was
rejected because it makes the card **quietly disagree with its own configuration**: a user who
asks for 7 days and sees 3 has no signal explaining the difference, and the same config renders
a different number of days on desktop and tablet. Silent divergence between config and render is
worse than an honest fallback.

Three mechanisms carry the decision instead:

1. **`min_day_width` becomes public config** (upgrading decision 14, and closing the
   G13 sub-question of whether it should be). It is the user's escape hatch: the threshold is
   theirs to lower. A user who genuinely wants 7 columns in a 500px card can set it to `70` and
   get them. The card's opinion about legibility becomes a default, not a rule.
2. **The width fallback to list view stays exactly as designed.** When the configured column
   count does not fit, the card falls back to list _wholesale_ — it never renders a degraded
   column view. This is the already-ruled behaviour; the finding does not change it.
3. **The editor warns at configuration time.** When
   `days_to_show × min_day_width + gutters` exceeds a reference width, the editor
   surfaces a warning naming the arithmetic and the remedies: raise `column_span`, use a panel
   view, reduce `days_to_show`, or lower `min_day_width`. The decision stays with the
   user; the card's job is to make the consequence visible _before_ they hit it.

The warning is **computed statically, never measured**. The editor cannot know the card's
deployed width — its own preview is 480px (A3-C.4) while the real placement may be 500px or
1032px — so any measurement it took would be of the wrong element. It compares the configured
arithmetic against the documented 500px default-section reference instead, which is truthful
regardless of where the card ends up.

**Consequences to carry into implementation:**

- **`days_to_show` stays a single global value and stays in Category E.** A per-view default
  (column defaults to 3, list to 7) was considered and is **architecturally forbidden**: it
  would change the fetch window at the width breakpoint, violating E3's requirement that
  crossing the breakpoint with a warm cache performs zero `callApi` invocations. The same rule
  that puts `days_to_show` in Category E rules out a per-view default for it.
- **The F7 `hide_when_empty` interaction dissolves.** Under the rejected alternative, rendered
  columns would have been fewer than `days_to_show` by construction, so `visibleEventCount`
  (windowed by `days_to_show`) and the rendering would have diverged and needed reconciling.
  With the column count pinned to `days_to_show`, the existing window is already correct. **No
  change required** — recorded here so the reconciliation is not re-derived later.
- **New key cost.** `min_day_width` becoming public means: a `DEFAULT_CONFIG` entry, a
  documentation row (`check:docs` enforces defaults ↔ reference-table parity), an editor
  control, and an **English** editor string. **[v20]** It no longer means a string in every
  translated language: resolution is per key with a fallback to English, so a new key simply
  appears in English everywhere until someone translates it. There are 10 translation files,
  not 11 — English is not one of them.
- **The editor warning is a v4.0.0 release blocker, not an MVP blocker** — consistent with the
  standing ruling that editor support for `column:` may follow YAML-only internal testing. It is
  registered in §D7.
- The default-config experience — `view: column` with the real default `days_to_show: 3`,
  which lands exactly on the 500px section threshold and so falls back to list on narrower
  viewports — is now a **documented, warned-about consequence** rather than an unhandled one.
  It must be stated plainly in the user docs, not only in the editor.

---

### H. Explicitly out of scope

Overlap lanes, time axis, now-line (time-grid's, Phase 5); paging and date-range navigation
(#185); per-person lanes (#203); `date_horizontal_alignment` and its naming harmonisation;
line-style keys for any separator; interactive expand on the `+N more` pill.

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#h-explicitly-out-of-scope)
