# Column view — design and implementation plan

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

Changes from v3 are marked **[v4]**; changes from v4 are marked **[v5]**; changes from v5 are
marked **[v6]**.

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

| #       | Resolution                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 11 + 12 | **Merged into one design: the view itself falls back to list below a width threshold.** Not column-count clamping. See A3-C.                                                                                                                                                                                                                                                                                                                                   | You flagged that 11 and 12 described the same issue. They did.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 13      | **[v4] Approved in principle, but re-scoped** — a DOM snapshot cannot gate the Phase 1 refactor, because the DOM is now _allowed_ to change. See A3-A and the new section C0. **[v5] Corrected:** this row was missed by the v4 pass and read as though the gate had become manual. It has not. The automated gate is **retained and tightened**, and it is the _list_ DOM that must be byte-identical across Phase 1 — see **Phase 0 Stage 2**, which owns it | **[v5]** The _visual_ check in Home Assistant covers the **column** view, which has no baseline to be identical to. It does **not** replace the automated list-DOM gate; the two cover different things and both are required before Phase 1 merges                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 14      | **Approved:** "fully flexible here, let's try out once we have a first implementation." Measure `min_day_column_width_px` in Phase 4.                                                                                                                                                                                                                                                                                                                          | **[v5] A provisional value is now fixed so Phase 4 is buildable: `min_day_column_width_px = 160`.** This is a **starting point, not a result** — it is to be measured and revised in Phase 4, and the plan is not "correct" until it has been. It is not a free choice, however: (a) **128 is disproven**, not neutral — the narrow-column analysis below showed titles wrapping badly at that width, so the inherited #339 default must not ship unchanged; (b) `atomic-calendar-revive` ships `min-width: 150px` on its Planner columns, which is the only real-world number available and brackets the answer from below; (c) 160 leaves the decision-4 date-header arithmetic at ≈ 34–39% of column width rather than 43–50%, which is the margin the header band needs for weather (D2). **[v4] Two facts still bank before measuring:** the number does **double duty** — usable column-width floor _and_ the multiplier in A3-C's view-switch threshold — so a wrong value produces two _aligned_ bad outcomes (cramped columns that also fail to trigger the list fallback) |

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
min_day_column_width_px × days_to_show  +  card padding  +  (days_to_show − 1) × gutter
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

> **[v6] The gate is called "hard pass/fail" but has no executable design.** The clock strategy
> above is settled; the mechanics are not, and each of these changes what "byte-identical"
> means. Before Phase 1 can be gated, this stage must specify:
>
> - **What is rendered, and into what.** The card is a Lit element with a shadow root, so a
>   test must construct it, feed it `hass` + config, `await el.updateComplete`, and serialize
>   `shadowRoot.innerHTML` — none of which is stated. `happy-dom` (Stage 1) covers this.
> - **Serialization normalisation.** Raw `innerHTML` carries Lit's comment markers (`<!--?lit$…
-->`), whose ids vary between runs. Either strip them or accept that the diff is noise.
> - **Where the baselines live and how they are approved.** `__snapshots__` vs committed
>   fixtures, and the review rule for an _intended_ change — a gate with no sanctioned update
>   path gets bypassed the first time list DOM legitimately changes.
> - **Which fixtures.** "The soak fixtures" names no file; the set must be enumerated and
>   committed, including at least one all-day, one multi-day, one empty-day and one past-event
>   case, or the gate will pass while missing the branches most likely to regress.
> - **The command, and whether CI runs it.** An unrun gate is a comment.
>
> Note this also **contradicts F2**, which still describes goldens as "a review artifact, not a
> gate". One of the two statements has to give; Stage 2's framing is the newer one, so F2 is
> what needs updating — flagged, not silently changed.

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
>   `min_day_column_width_px` is public config, and — most consequentially — **which column
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
   whether the provisional `min_day_column_width_px: 160` (decision 14) survives measurement.
9. **No runtime or visual HA testing has happened on any of this yet.**
10. **[v5] Un-decided and un-decidable on paper: the real rendered width of an HA masonry or
    sections column.** Every threshold in A3-C and decision 14 is arithmetic over an assumed
    container width. The arithmetic is sound; the input is a guess. First measurement task in
    Phase 4.

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
