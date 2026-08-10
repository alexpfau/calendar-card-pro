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
  folded in five maintainer corrections, the load-bearing one being that *"no impact on list
  view"* means **no visible change for users**, not no code change.
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

Changes from v3 are marked **[v4]**.

---

## A. Decisions ledger

### A1. Approved by maintainer

| # | Decision | Note |
|---|---|---|
| 1 | View name is **`column`** | `view: 'list' \| 'column'` |
| 2 | **`navigation_days` is deleted**, folded into `days_to_show` | Not renamed — removed |
| 3 | Column-view MVP excludes overlap lanes, time axis, now-line | Those are time-grid's |
| 4 | **Date at the top** of each column | Confirmed sound: list's date column is `day_font_size × 1.75` = 45.5px (`styles.ts:46`) + padding ≈ 43–50% of a 128px column |
| 5 | **Header rule is fully configurable** — width, colour | Reverses my "start closed" proposal |
| 6 | Between-day chrome rotates 90°; within-day chrome untouched | The organising thesis |
| 7 | `date_vertical_alignment` **ignored** in column view | Naming harmonisation with a future `date_horizontal_alignment` explicitly out of scope now |
| 8 | **[v4 — RE-REPLACED]** Phase 1 is **shared leaf extraction**; list keeps its `<table>` | v2 said extraction (right scope, wrong reason: I thought list markup was frozen). v3 said table→flex axis refactor (wrong scope: over-corrected on learning it wasn't). v4 returns to extraction on the correct reason — the drift lives in leaves, not containers. See A3-A / C-Phase 1 |
| 9 | #339 branch is **frozen**, not rebased | lenaxia's 4 commits preserved as ancestors for attribution |
| 10 | Feature milestone is **v4.0.0** | See G5 — a choice, not a semver requirement |

### A2. Previously open — now resolved **[v3]**

| # | Resolution | Note |
|---|---|---|
| 11 + 12 | **Merged into one design: the view itself falls back to list below a width threshold.** Not column-count clamping. See A3-C. | You flagged that 11 and 12 described the same issue. They did. |
| 13 | **Approved in principle, but re-scoped** — a DOM snapshot cannot gate the Phase 1 refactor, because the DOM is now *allowed* to change. See A3-A and the new section C0. | The gate for "no visible change" is now visual, in Home Assistant. |
| 14 | **Approved:** "fully flexible here, let's try out once we have a first implementation." Measure `min_day_column_width_px` in Phase 4. | No value fixed now. **[v4] Bank two facts before measuring:** (a) **128 is demonstrably too low** — my own narrow-column analysis showed titles wrapping badly at that width, so it is a *disproven* inherited default from #339, not a neutral starting point; do not ship it unchanged. (b) The number does **double duty** — usable column-width floor *and* the multiplier in A3-C's view-switch threshold — so a wrong value produces two *aligned* bad outcomes (cramped columns that also fail to trigger the list fallback). |

---

## A3. Maintainer corrections **[v3]**

### A3-A. "No impact on list view" = no *visible* change, not no code change

> *"what we do in code is our thing, and we are free to do what's needed. our final
> architecture should be optimized to cover both views."*

This removes the constraint decision 8 was built on. The consequences are large enough that
the phasing was reconsidered from scratch rather than patched.

**What I found when I actually checked the markup, rather than assuming:**

The seam is already much further along than v2 assumed.

- `.content-container` (`render.ts:83`) holds day-blocks and separators as **siblings**. The
  card-level axis flip is a *container* change, not a restructure.
- Each day is **already one self-contained node** — `<table class="day-table">`
  (`render.ts:678-692`). The day boundary is already in the right place for a shared
  component.

So the only genuinely axis-bound part is the day's **internals**: `rowspan`
(`render.ts:927`) welds the date cell to the left edge and cannot produce a date-on-top
variant.

**Where #339's duplication actually came from.** [v4 — corrected] v3 said the rowspan table
*forced* the duplication. That is wrong, and the distinction changes the phasing. The drift
#339 exhibits is entirely in **leaves**, not containers — three different past-event opacities
for one concept (`styles.ts:491-492` list `0.6`; `:986-987` grid `0.55`; `:1061-1062` grid
all-day `0.55`). The grid re-implemented the *leaf* renderers. It did not have to: every leaf
the shared block needs is already DOM-agnostic — `.event-content` (`render.ts:939-1000`),
`renderDateColumn` (`:487-608`), colour precedence (`:497-513`). A flex grid container could
have consumed those leaves unchanged. The rowspan blocked reuse of the **container**, and
container reuse is not what prevents drift. **Sharing the leaves is.**

**Therefore: list keeps its table.** [v4 — REVERSES v3's headline change]

v3 proposed converting list's day block from `<table>` to flex so a single flip-able
`DayBlock` served both views. That was an over-correction, and I am reversing it:

- The two goals v3 fused are separable. *Kill the drift* → extract shared **leaf** renderers.
  *Serve both views* → give column its **own** flex container consuming those leaves.
- List needs date-on-**left**. Only column needs date-on-**top**. So only column needs the
  non-table container; list never has to change.
- Parallel containers over shared leaves is **exactly the `ViewAdapter.render` shape** Phase 3
  wants. By Phase 5 there are three renderers anyway (table list / flex column / grid). Forcing
  two of them to share one flip-able DOM is *less* consistent with the adapter, not more.
- The risk asymmetry is the decisive part. Rewriting list's container puts **100% of existing
  users** at pixel-regression risk to serve a view they do not use, gated only by human
  screenshot comparison. Leaf extraction leaves the list container untouched, which satisfies
  the no-visible-change constraint **by construction rather than by probability** — and
  restores a hard automated gate (list DOM must be byte-identical; see Phase 0).
- The relaxed constraint (A3-A) *permits* code change; it is not a mandate to change the list
  renderer, and should not be spent where it buys nothing.

**The concrete proof that unification was riskier than v3 priced it.** v3 claimed
`date_vertical_alignment`'s `vertical-align` maps to `align-self`, "equivalent". **It does
not,** and the failure is invisible to a template diff:

- `.date-column` is `position: relative` (`styles.ts:321`); `.today-indicator-container` is
  `position: absolute; height: 100%` (`:336-341`). Under `rowspan` (`render.ts:925-932`) that
  `100%` resolves against the **full stacked height of the day**, so with the default
  `today_indicator_position: '15% 50%'` the indicator centres over the whole day block.
- In flex, `align-self: center` overrides `align-items: stretch` and **shrinks the item to
  content height** — collapsing `height: 100%` to roughly one line of date text. The indicator
  would snap from the full day to the ~50px date band.
- The correct mapping is two-part: keep the date column `align-self: stretch` and move its
  *content* with `justify-content` on an inner flex column. v3's one-line mapping was wrong.

Blast radius is bounded (`today_indicator` defaults `false`, `config.ts:59`), so this would
have hit only opted-in users on multi-event days — which is precisely the kind of defect that
survives a screenshot pass. It is retained here as the worked example of why the list
container is not worth touching.

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
  shrink; `table-layout: fixed` (`styles.ts:291-296`) handles this implicitly today. Still the
  classic flex trap, now confined to new code.
- The week-number separator (`<table class="week-row-table">`, `render.ts:243-297`) stays as-is
  for list; column defers week numbers entirely (D5).

### A3-B. `show_empty_days` — my "force it on" was wrong

Verified against latest `dev`. `days_to_show` bounds a **calendar-day window**
(`events.ts:1287-1293`; hard post-filter `:71-92`). `show_empty_days: false` (the default)
then **filters empty days out of the rendered set** (`:393-398`) — rendering already expects
gaps (`render.ts:722-724`). With `true`, missing days are generated (`:505-545`, `:561-598`).

So in column view the key selects between two different products:

| Value | Column view means |
|---|---|
| `false` (default) | **Dense agenda columns.** One column per day-with-events; columns may be **non-contiguous** (Mon, Thu, next Tue). |
| `true` | **Stable week grid.** `days_to_show` contiguous columns regardless of content. |

**Resolution: do not force. Support both, default unchanged.** Forcing `true` would silently
change what `days_to_show` means for anyone switching an existing card, and would spray empty
columns across a light calendar — the opposite of the density motivating #263.

Consequence not to miss: with `false`, the column *count* varies as events change, so under
`flex: 1` column widths visibly shift between glances. Fix in CSS with a `max-width` guard,
**not** in config — one meaning per key.

Also confirmed and to be preserved: `hide_when_empty` deliberately counts events **as if
expanded** (`calendar-card-pro.ts:236-239`) so `compact_events_to_show: 0` cannot hide a card
that could then never be tapped open; and *a placeholder is not content* (`:241-249`). Empty
**columns** must not count as content either.

### A3-B-2. …and the column *default* — the argument **[v4]**

Not forcing was right. What the second-pass critique surfaced is that I then left the
**default** unexamined, and I had already built the machinery to change it (D5 kind 1,
per-view default, user-overridable) before declining to use it on the key where it matters
most.

**The argument for flipping the default to `true` in column view:**
- **Spatial adjacency implies temporal contiguity.** In a list, skipped days are invisible —
  each row is labelled and you read top-to-bottom, so nothing suggests Tuesday should have
  been between them. In columns, Mon | Thu | next-Tue sitting side by side *reads* as a broken
  week. The plan mitigates width *jitter* (the `max-width` guard) and gives gap *legibility*
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
*and* date (D2). So non-contiguity is **detectable**, not invisible — a user reading "Mon 3 /
Thu 6" has the information. The risk is real but smaller than "looks broken".

### A3-B-3. RULED: `true` for column — but a bare per-view default is a trap **[v4]**

**Ruling:** column defaults to showing empty days. **The objection that reshaped it, which the
first draft had missed:** a bare per-view default breaks down the moment the user touches the
control.

**The trap.** `show_empty_days` is one flat key. If column merely *defaults* differently, then
as soon as a user sets it — for any reason, in either view — that single value applies to both.
And because the editor renders it as a **switch**, there is no way back: a switch has two
positions, so "unset / auto" is unreachable once written. The user must open YAML and delete
the line.

**And the responsive fallback makes this certain, not hypothetical.** A3-C means a column card
*is* a list card below the threshold. Column and list are not alternative configurations a
user picks between — they are **the same card at two widths**, and essentially every column
user is also a list user on their phone. So a per-view default collision is not an edge case
for view-switchers; it is guaranteed for everyone.

**Fix: give the key an explicit auto sentinel and render it as a select.**

| Stored value | Meaning | List view | Column view |
|---|---|---|---|
| `null` **(new default)** | **Auto — per view** | hide empty days | show empty days |
| `true` | Always show | show | show |
| `false` | Never show | hide | hide |

**Back-compat is free — verified against `origin/dev`.** Every consumer is a *truthiness*
check (`events.ts:394` `if (!config.show_empty_days)`, `:488`, `:520`), so `null` is falsy and
behaves **identically to `false`** in every existing path. Changing
`DEFAULT_CONFIG.show_empty_days` from `false` → `null` is a **no-op for list view with zero
call-site changes**. Only the type widens: `show_empty_days: boolean` → `boolean | null`
(`types.ts:22`).

**The editor pattern already exists.** `show_week_numbers` is exactly this shape — default
`null` (`config.ts:48`), rendered via `addSelectField` with a `'null'` **string** option
(`editor.ts:1109-1113`), converted back to real `null` in `_valueChanged`
(`:588-591`) and `_selectChanged` (`:660`). We add `show_empty_days` to that same special-case
branch. No new machinery.

**Cost, stated honestly:** the control changes from a switch to a 3-option select for
*everyone*, including list-only users. That is an editor change, not a card-rendering change,
so it does not violate A3-A — but it is visible, and it is the price of a reachable "auto".
Use the select in **both** views, not a switch in list and a select in column: the trap is
symmetric, and a list user toggling the switch would otherwise silently pin column behaviour
too.

**Labels:** `Automatic`, `Always show`, `Never show` — with per-view help text (D5 kind 4)
under `Automatic` spelling out what it resolves to in the current view. Three new translation
keys across all 10 editor languages.

**Consequence for the gap affordance:** with `Automatic` giving contiguous columns by default,
a skipped-day marker is no longer owed in Phase 4. It becomes optional polish for people who
deliberately choose `Never show`.

### A3-C. Narrow screens — view fallback, not column clamping

> *"users can set a screen width above which column [view] would be active, and underneath
> list view would be shown."*

Adopted; supersedes both 11 and 12. It is better *and* simpler than clamping: list view is
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

*Mitigation, non-negotiable and cheap:* **the editor preview must render the selected view
regardless of measured width.** Decouple preview rendering from the responsive switch. Verify
the actual modal width in HA early in Phase 4 — the exact numbers above come from review and
are unverified against a running instance, but the direction of the inequality is not in doubt.

**5. The same YAML becomes two products by viewport, with keys silently inert.** Below the
threshold the list path runs, so every column-only key (`day_header_separator_*`, the
per-column compact rotation, the column gutter) is dead and every list-only behaviour (global
compact budget, `week-row-table` separators) is live — with no signal. A user debugging "my
header separator doesn't show" may simply be 20px under.

*Disposition:* accepted cost, mitigated by documentation and by the D5 kind-4 help text
naming which view each key is live in. **I am not reverting to clamping**, and the critique's
recommendation to reconsider it is declined on this ground: clamping bottoms out at **one
column = one day**, which is strictly less useful on a phone than a list of `days_to_show`
days. The fallback is the better narrow-screen answer; it just needs the preview fixed and the
key liveness documented.

### A3-D. Compact mode in column view — the rotation is correct

> *"couldnt there also be a compact mode in column view, in which `compact_events_to_show`
> limits the number of events per day…?"*

**I was wrong to call this degenerate.** The reasoning:

- **List:** card height ≈ **Σ** events → capping the sum caps the height → *global* budget.
- **Column:** card height ≈ **max** over columns → capping the max caps the height →
  *per-column* budget.

Same user-level meaning — *"how tall is the card when collapsed"* — rotated through a
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
  budget", which is **backwards**: a per-column cap *does* truncate days. The correct reason
  is that `complete_days` is a **cross-day inclusion filter under a shared budget**
  (`events.ts:413-441` — it drops whole days that would not fit so the last day is never
  cut off mid-way). A per-column budget has no shared pool and makes no day-inclusion
  decision — every column renders. There is nothing for it to decide. Ignore + annotate.
  *The reason matters:* on the v3 phrasing a future reader could "restore" the key on a
  false premise.
- `compact_days_to_show` maps to **fewer columns** when collapsed. Coherent.
- **Per-entity `compact_events_to_show` must NOT be re-based per column.** [v4 — REVERSED]
  v3 said it "must be re-based per column". That is wrong, and it is the one place the
  rotation changes user semantics rather than preserving them.
  - *Mechanism, verified:* `entityConfigEventCounts` is created at `events.ts:340`,
    **before** the `for (const day of days)` loop at `:342`, and accumulates across the
    whole window.
  - *Why it must not rotate:* the per-entity cap is a **temporal** cap — "show the **next 1**
    bin collection / next 1 birthday" — not a height cap. Re-basing it per column turns
    "next 1 birthday" into "1 birthday **per column**", i.e. up to `days_to_show` birthdays.
    Nobody asked for that.
  - *Why no height framing rescues it:* the global key bounds card height, so Σ→max is a
    genuine rotation of one meaning. The per-entity key bounds **nothing** about height, so
    there is no invariant to preserve. The symmetry is a global-budget symmetry.
  - *Disposition:* leave per-entity as a global temporal cap in **both** views. It is pure
    data (`events.ts:350-391`), view-independent, and already correct. This is **less** code
    than re-basing.
- Expand is already tap/hold (`calendar-card-pro.ts:539,542,583,729`), so "on click we
  toggle" needs no new interaction.

**The residual cost — a view-switch surprise that must be surfaced, not hidden.** [v4]
Same data, same `compact_events_to_show: 3`: list shows 3 events *total*; column shows up to
3 × `days_to_show`. That is correct under a **height-space** mental model ("keep my card
short") and surprising under a **data-space** one ("hide all but 3 of my events"). Both
models are real. The height-space reading is the one that justifies the rotation, so the key
becomes a **kind-4 override** (D5) and carries per-view editor help text saying what it caps
in each view. Silence here would be the failure mode.

This may make a separate `max_events_per_column` key **unnecessary** *for the collapsed-height
job*. [v4 — narrowed] It does **not** make it unnecessary outright: compact is an
**expandable** cap (tap to reveal all), whereas a hard cap is **permanent** truncation for a
kiosk/at-a-glance card with no interaction. Different questions. Defer it — do not conclude
it is never needed.

### A3-E. Separator defaults — two different mechanisms

> *"i like the proposal to default all separator widths to 0px … this is what you meant,
> right?"*

Partly — and the distinction matters.

- **Widths already default `0px` today** (`config.ts:51-56`). Rotating the rules is a visual
  no-op out of the box. No decision needed.
- **What you described — extra horizontal space at a month break — is the *spacing
  multiplier*** (`SEPARATOR_SPACING`: week `1×`, month `1.5×`, `constants.ts:87-92`). In list
  it is margin above/below the rule. A uniform CSS `column-gap` **cannot** vary one gutter.

**Resolution:**
1. List keeps its derived multipliers **unchanged** — invisible to users, honours A3-A's
   *visible*-change constraint.
2. Column-view MVP drops multipliers; documented, not silent.
3. An **explicit opt-in gutter key defaulting `0px`** is added later, implemented with spacer
   tracks. Additive, non-breaking.

Optional and defaulting to `0px` is the right shape; it is a *new* key rather than the
existing widths.

*(Fix in passing: `constants.ts:90` comment says "2x day_spacing"; the value on `:91` is
`1.5`.)*

---

## B. The header divider — concrete spec

### B1. Naming: `day_header_separator_width` / `day_header_separator_color`

House pattern is `{scope}_separator_{width,color}` — width and colour only, no style key
(all three existing separators hardcode `solid`). This follows it exactly. Reviewed and
confirmed SOUND: semantic, view-neutral, consistent with the `DEPRECATED_CONFIG_MAP`
precedent.

**Why not anything containing "horizontal":** this codebase already made and corrected that
mistake. `DEPRECATED_CONFIG_MAP` (`editor.ts:71-72`) records `horizontal_line_width` →
`day_separator_width` — an *appearance* name replaced by a *semantic* one. Appearance names
are exactly what break when a layout rotates, which is the subject of this plan.

**Why not reuse `day_separator_*`:** that key means *between days* and under decision 6
rotates to the vertical rule between columns. The header rule is a new element — inside a
day, between its header and its events.

### B2. Defaults — two deliberate deviations, both signed off

```
day_header_separator_width: '1px'                  // family default is '0px'
day_header_separator_color: 'var(--divider-color)' // family uses text-colour tokens
```

**Deviation 1 — visible by default.** CONFIRMED SAFE: this is a *within-column* element that
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
of recording it here is that it is a *conscious* deviation, so nobody later "fixes" it as an
inconsistency. Alternative: `var(--secondary-text-color)`, matching `day_separator_color` —
heavier, and seven at once will read as a lot of grey. A `_style` key can be added later,
non-breaking.

### B3. Editor

Follows the established separator block pattern (`editor.ts:1205-1248`): a toggle writing
`1px`/`0px`, revealing width and colour when enabled. Only difference: the toggle starts
**on**.

New editor translation keys, in all files carrying an `editor` section (10 of 35):
`day_header_separator`, `show_day_header_separator`, `day_header_separator_width`,
`day_header_separator_color`.

---

## C. Phases **[v4 — Phase 1 re-scoped, cache fix split out]**

Phases 0–3 are **refactors that ship in ordinary 3.x releases**. This is the load-bearing
property of the plan: they merge into `dev` continuously, so **`dev` drift stops being a
problem**. Only phases 4–5 need a long-lived branch.

**What changed from v2 and why.** v2's Phase 1 extracted leaf renderers and touched no markup,
because I believed the list DOM was frozen. v3, on learning it wasn't, replaced that with a
table→flex rewrite of the list day block. **v4 reverses back to extraction** (A3-A): the
rewrite put every existing user at pixel-regression risk to buy a unified `DayBlock` that was
never required to prevent the drift motivating it. v2's scope was right; v2's *reasoning* was
wrong, and v3 corrected the reasoning by over-correcting the scope. Phase 0 still comes first,
but it is now a cheap gate on a low-risk step rather than a net under a risky one.

### Phase 0 — safety net · ships 3.x · risk: none **[v3 — NEW]**

**Stage 0 — i18n integrity. Zero dependencies. Do this regardless of everything else.**
A ~50-line script comparing every language file to `en.json`, plus a check that every
`TRANSLATIONS` key has a matching dayjs import and `supportedLocales` entry. This exact class
of bug has now bitten **twice during this work** and once in the comparable card (ACR PR
#1812, a whole missing `planner` section in `es.json`). `AGENTS.md:82-123` documents it as
the single most error-prone area of the codebase. It is the cheapest high-value thing on this
entire plan.

**Stage 1 — pure-logic tests.** `vitest` as a devDependency, ~4 files: translation parity,
`grid.ts` maths, the `getBaseCacheKey` bug (Phase 2b), config validation/change-detection.
`grid.ts` is already documented pure/no-DOM (`grid.ts:1-6`).

**Stage 2 — list-view DOM equality fixture.** [v4 — now a real gate] Serialize the list
render across the soak fixtures. Under v3's rewrite this could only ever be a review artifact,
because the DOM was *meant* to change. Under v4 the list DOM must not change at all, so this
becomes a genuine pass/fail gate for Phase 1 — cheaper and stricter than the screenshot
comparison v3 was forced to rely on. It keeps its value through phases 2–5 as the guarantee
that adding views never disturbs the list.

**This requires an `AGENTS.md` amendment, not a silent violation.** The file says "no test
framework… Keep it that way", with **bundle size** as the rationale — which does not apply,
since a runner is a devDependency and never enters the shipped file. Amend the rationale
explicitly so the next contributor isn't caught between the doc and the repo. Skip
`cross-env`; `TZ=… vitest run` works on macOS and Linux CI.

**Do not merge lenaxia's 2,022-line suite wholesale.** Its approach is right, its size isn't.
Prune to the parts covering code we keep.

### Phase 1 — shared leaf renderers · ships 3.x · risk: **low** **[v4 — RE-SCOPED]**

**v3 had this as a table→flex rewrite of the list day block, at medium risk. Reversed — see
A3-A.** List keeps its `<table>` and `rowspan`. Phase 1 extracts the axis-agnostic **leaf**
renderers into shared functions that the list's existing table consumes **unchanged**, and
that column (Phase 4) and time-grid (Phase 5) consume from their own containers.

Leaves to extract, all already verified DOM-agnostic:
- `.event-content` subtree (`render.ts:939-1000`) — title, time, location.
- Date content and colour precedence (`renderDateColumn` `:487-608`, precedence `:497-513`).
- Today-indicator geometry (`parseIndicatorPosition` `:355-379`).
- Weather rendering (`:528-572`).

**The contract is stronger than v3's, and automatable: list-view DOM must be byte-identical
before and after.** Extraction that changes list output is a bug by definition. This restores
a hard gate that v3's rewrite had forfeited — see Phase 0.

Watch the two traps found earlier, which make text-diffing the extraction *necessary but not
sufficient*:
- `renderEvent` interpolates ~7 locals computed *before* the extraction boundary; they must be
  passed, not recomputed.
- Accent, background and padding live on the wrapper `<td class="event">` (`render.ts:937`,
  `styles.ts:463-488`) with a position class (`:913-919`). A future column wrapper must
  reproduce those; the *leaf* must not absorb them.

Deferred out of Phase 1, and no longer on the critical path: removing the layout table (a11y),
RTL, and the duplicate `.today-indicator-container` rule (`styles.ts:336-344` / `:368-373`).
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
Name the consumer that forces them, or fold them into Phase 3 where `ViewAdapter` gives them
one. Do not build them speculatively.

### Phase 2b — cache-key fix · ships 3.x **now**, independently · risk: low **[v4 — SPLIT OUT]**

**This is a live list-view bug today and should not wait for the column epic.** It needs no
column view, no models and no adapter, so coupling it to this plan only delays a user-facing
fix and enlarges the blast radius of an unrelated release.

CONFIRMED real: `processEvents` splits multi-day events pre-cache (`events.ts:649`) and bakes
`_entityLabel` (`:642`), then caches the already-split array; `getBaseCacheKey`
(`:1369-1415`) includes instanceId, entityIds, daysToShow, showPastEvents, startDate,
filterDuplicates, per-entity patterns and `VERSION.CURRENT` — but **not**
`split_multiday_events` or entity-label config. A warm-cache toggle of `split_multiday_events`
returns stale, wrongly-split data.

It is a behaviour-**changing** bugfix, not a behaviour-preserving refactor: fixing it changes
what the user sees. Fine for 3.x — but label it honestly so it gets tested as a fix.

Severity is bounded: `VERSION.CURRENT` is in the key, so every release flushes the cache. It
only bites a user toggling config without a version bump inside TTL.

**Mandatory before Phase 4/5 regardless:** column forces `split: true` and time-grid forces
`split: false` (`grid.ts:573-586`), so cross-view cache collision is *guaranteed* unless
effective split semantics and view identity enter the key. Shipping it early simply means that
dependency is already satisfied.

### Phase 3 — `ViewAdapter`, internal only · ships 3.x · risk: low

**[CHANGED — v1's interface was mis-sized.]** v1 claimed four methods (`capabilities` /
`buildFetchPlan` / `render` / `getCardSize`) would retire 19 discriminator checks. Verified
against all 19 sites: **the four named methods cleanly absorb about 3.** Classification:

| Concern | Sites | Covered by v1's interface? |
|---|---|---|
| Render dispatch | `calendar-card-pro.ts:882` | ✅ `render` |
| Fetch plan override | `calendar-card-pro.ts:676`, `grid.ts:573-586` | ✅ `buildFetchPlan` |
| Card size | `grid.ts:646` | ✅ `getCardSize` |
| **Config validation / normalisation** | `config.ts:286` | ❌ no method |
| **Change-detection for refetch** | `config.ts:410,415,416` | ❌ no method |
| **Controller lifecycle** | `responsive-columns-controller.ts:6,44,63,80,86`; `now-line-controller.ts:86` | ❌ not a render/fetch call |
| **Post-update imperative hook** | `calendar-card-pro.ts:290-294,298-317` | ❌ no method |
| Interaction model | `calendar-card-pro.ts:753,758` | ~ only via `capabilities` |
| Card-shell flags | `render.ts:50,54,66` | ~ only via `capabilities` |

`config.ts:410-419` diffs *previous vs current* config to decide whether to refetch —
`buildFetchPlan` builds a plan, it does not answer "did a data-affecting key change?"
Different operations. And the controllers are Lit `ReactiveController`s with
`hostConnected`/`hostUpdated`/`hostDisconnected` + observer lifecycles; a stateless
`render(state) → template` cannot own an observer's lifetime.

**Revised interface spec — name every facet before writing code:**
`capabilities` (a *typed descriptor*, not a word — it silently does ~12 sites of work and
must drive controller construction, shell classes, ripple suppression and handler wiring),
`normalizeConfig`, `fetchInputsChanged(prev, cur)`, `buildFetchPlan`, `controllers()`,
`render`, `afterRender(host)`, `getCardSize`.

**Revised claim:** replace scattered `view === 'time-grid'` string literals with one
declarative capability descriptor. Not "four methods retire 19 checks". Note `config.ts:416`
partly evaporates once decision 2 deletes `navigation_days`.

### Conformance gate (scratch branch, not shipped)

**Reviewed as a genuine strength — keep it exactly where it is.** Port #339's time-grid onto
the abstraction before Phase 4 hardens it. It cannot go earlier (nothing to conform to) and
must not go later (designing around list+column then discovering time-grid doesn't fit would
force a breaking re-abstraction *after* `view` is public).

Probes it must answer:
- Per-view config overrides in **all four directions** of the D5 taxonomy — column forces
  `split_multiday_events: true`; time-grid forces split `false`; `show_empty_days` is *not*
  forced in either (A3-B); `compact_events_complete_days` is *ignored* in column; and the
  global `compact_events_to_show` is **reinterpreted** in column (kind 4). **[v4]** All four
  must be expressible **without lying to the editor** — a hidden control, a disabled control,
  a normal control and a normal control with per-view help text are four different renderings.
- Fetch planning must be per-view — time-grid's window is far wider than list's.
- **[v3]** Compact-budget shape must be per-view: global sum (list) vs per-column max
  (column). If the adapter cannot express that, it is under-sized. **[v4]** Note the two
  compaction stages are *sequential and composed* — per-entity (`events.ts:340-378`) then
  global (`:388-468`) — so the adapter hooks in **two** places, not one. Price it as such.

### Phase 4 — column view · v4 branch · risk: medium

`view: 'list' | 'column'` becomes public API. Section D. **[NEW] Includes an editor gate
audit — see D4.**

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

### D1. Element mapping **[CHANGED — separators are a re-implementation, not a rotation]**

| Element | List today | Column | Keys |
|---|---|---|---|
| Per-event accent | vertical, left of event | **unchanged** | `vertical_line_width` |
| Day separator | horizontal between days | **vertical between columns (re-implemented)** | `day_separator_*` |
| Week separator | horizontal at boundary | **vertical (re-implemented)** | `week_separator_*` |
| Month separator | horizontal at boundary | **vertical (re-implemented)** | `month_separator_*` |
| Header rule | *(does not exist)* | **horizontal, under header** | `day_header_separator_*` **(new)** |
| Week number badge | own full-width row | **deferred — see D5** | `show_week_numbers`, `week_number_*` |
| Day spacing | vertical gap | **column gutter** | `day_spacing` |
| Event spacing | vertical gap | **unchanged** | `event_spacing` |
| Today indicator | absolute in date cell | **absolute in header band** | `today_indicator*` |
| Weekday / day / month | vertical stack, left | **horizontal, in header** | `weekday_*`, `day_*`, `month_*` |
| Weather | in date column | **header, single-line-or-hide — see D2** | existing weather keys |
| Event content | `.event-content` | **byte-identical** | all |
| `date_vertical_alignment` | positions date in tall cell | **ignored** (harmlessly unused) | — |

**v1 said "separators simply become vertical rules, keys unchanged." That was misleading.**
There are three different renderers, none axis-swappable:
- Day separator: `<div class="separator">` with inline `borderTop*`, `width:100%`
  (`render.ts` ~`:673`; `styles.ts:266-269`).
- Week separator when `show_week_numbers === null`: a separate border-top renderer
  (`render.ts:219-231`).
- Week separator when `show_week_numbers !== null`: **an entire `<table class="week-row-table">`**
  whose rule is structurally welded to the week-number pill in one table row
  (`render.ts:243-297`; `styles.ts:196-262`).

**The spacing multipliers cannot survive rotation.** `createSeparatorStyle`
(`render.ts:128-165`) derives `marginTop`/`marginBottom` from `day_spacing × multiplier`,
where `SEPARATOR_SPACING` is WEEK 1×, MONTH **1.5×** (`constants.ts:87-92` — note the source
*comment* on `:90` wrongly says "2x"; pre-existing bug, fix in passing). CSS grid
`column-gap` is a **single uniform value for all tracks** — you cannot widen only the gutter
between columns 3 and 4. So the month/week spacing differential is silently dropped, which
would violate acceptance criterion E1.

**Decision needed:** either (a) drop the multipliers in column view and document it, or (b)
use explicit spacer tracks in the grid template to reproduce them. Recommend (a) for MVP —
the rule itself still renders at the boundary, only the extra breathing room is lost.

**Mitigant that makes this phaseable:** all three separator widths default `0px`
(`config.ts:51-56`) and `show_week_numbers` defaults `null` (`config.ts:46`), so **rotation is
a no-op for a default config** and this rewrite only affects users who opted in.

### D2. Header

A horizontal variant of `renderDateColumn` (`render.ts:487-608`). Same DOM classes, same
custom properties, so theming carries over. **Colour precedence preserved exactly**: base →
weekend → today (`render.ts:497-513`) — CONFIRMED pure data, DOM-independent.

**Today highlighting needs zero new keys** — `today_weekday_color`, `today_day_color`,
`today_month_color` already exist with top precedence. (ACR's Planner ships with *no* today
indicator; we get it on day one.)

Today indicator relocation is MECHANICALLY SOUND: `parseIndicatorPosition`
(`render.ts:355-379`) emits `position:absolute` + percentages + `translate(-50%,-50%)` inside
a `position:relative` container; that transfers cleanly. Caveat: `'15% 50%'` resolves to a
different visual spot in a short wide band. Documented, not fixed.

**[NEW] Weather must be single-line-or-hide.** "Mon 13 Nov" at 26/14/12px already consumes
most of a 128px column; weather (`render.ts:528-572`) adds icon + temperature (~40–50px). If
it wraps, *every* column gains a second header line — a fixed density cost paid on every day.
Decide truncate-or-drop rather than wrap, and document the header band's fixed per-column
vertical budget. Interacts with decision 14.

### D3. Height and overflow **[CHANGED — substantially rewritten]**

Equal heights via CSS grid `align-items: stretch`.

**Uncapped column view is safe by default, and v1's worry was overstated.** Column height is
bounded by the *busiest day*; list height is the *sum* over days. For constant per-event
height `max(eᵢ) ≤ Σ(eᵢ)` unconditionally, so column is shorter. This is categorically unlike
#339, whose height was bounded by a *configured time axis* (16h → 768px) that exists whether
or not events fill it. Content-bounded whitespace is not axis-bounded whitespace. Verified
against all-day chips, `show_empty_days` (sets a floor, never a ceiling) and forced
`split_multiday_events` (list sums every split instance; column takes only the max).

**The one regime where it flips** is narrow-column line-wrapping under a skewed distribution:
per-event height is *not* constant across layouts (see decision 14). At 100px/event in column
vs 40px in list, `[8,1,1,1,1,1,1]` gives column ≈ 850px vs list ≈ 650px. Needs *both* skew
and wrapping to bite — a corner, not the common case, and still content-bounded and still
clippable. It is an argument for decision 14, not against the layout.

**`compact_events_to_show` reused as a per-column cap — REVERSED in v3.** The *mechanism*
finding stands and is CONFIRMED: it is a **global budget across all days**, not per-day.
`totalEventsShown` accumulates over the whole window (`events.ts:396`), `break`s when
exhausted (`:439`), and silently `slice(0, remainingEvents)` (`:456`). Naively rotating that
gives 5 events *total* across 7 columns.

**But the conclusion I drew from it was wrong** (see A3-D). List height ≈ **Σ**, column
height ≈ **max**; capping the sum and capping the max both mean *"how tall is the card when
collapsed."* The key keeps one user-level meaning and the mechanism rotates — which is
decision 6, not a semantic change. The mechanism finding therefore means **new per-day code
in the adapter**, not that the key is unsalvageable.

**There is also no "+N more" affordance anywhere in the list path** (confirmed). The only
overflow pill in the codebase is grid-view's (`render-grid.ts:346-354`, backed by
`grid.ts` `hiddenCounts`).

**Resolution [v4 — revised]:**
1. **Column view implements compact as a per-column budget**, reusing the *global*
   `compact_events_to_show` with its meaning rotated (D5 kind 4). Tap/hold to expand already
   exists (`calendar-card-pro.ts:539,542,583,729`). Post-MVP, but planned for — not excluded.
2. **`compact_events_complete_days` is inapplicable** per-column — it makes a *cross-day
   inclusion* decision under a *shared* budget, and a per-column budget has neither. Ignored +
   annotated. **Per-entity `compact_events_to_show`** (`events.ts:350-391`) **stays global in
   both views** — see A3-D; re-basing it would multiply a temporal cap by `days_to_show`.
3. **`max_events_per_column` is deferred, not dismissed.** Rotated compact covers the
   *collapsed, expandable* height job, so it is not needed for MVP. It does **not** cover the
   *permanent* truncation job (kiosk / at-a-glance, no interaction), which is a different
   question. Defer; revisit with real usage.
4. **If any cap ships, a per-column "+N more" is mandatory** — lift the markup/style of the
   grid pill, compute `hidden = eᵢ − cap` locally. Do **not** reuse the list compact path's
   silent slice. MVP can make it informational and still satisfy #263: the user *sees* there
   is more and is not misled.
5. **`max_height` confirmed safe** — `styles.ts:151-154` sets `max-height` with
   `overflow-y: auto`, so it **scrolls rather than clips**. Inherit unchanged.

### D4. Editor gate audit **[NEW]**

Every current editor gate assumes exactly two views (`!== 'time-grid'`). A third view
silently mis-includes column:

- `editor.ts:774-777` — the `view` select hardcodes two options; needs a `view_column`
  translation key.
- `:778` (`days_to_show`) — benign for column by luck. Make it explicit.
- `:826` (Compact Mode) — **[v3]** shows for column by default, and per A3-D that is now
  *correct*. Make it explicit rather than accidental, and hide
  `compact_events_complete_days` within it for column.
- `:870` (`show_empty_days`) — **[v4] becomes a 3-option select in *both* views**, not a
  switch. A3-B-3: `null` (Automatic) / `true` (Always show) / `false` (Never show), with
  `null` as the new default. Add it to the existing `'null'`-string special case at
  `editor.ts:588-591` and `:660` alongside `show_week_numbers`. Per-view help text under
  Automatic. Three new translation keys × 10 languages.
- `:908` — correctly grid-only, unchanged.

Convert each binary `!== 'time-grid'` to explicit per-view logic. Round-trip the visual
editor for a column config to confirm no forced-override key silently drops user input.

**[v4] The editor's live preview must render the *selected* view, not the width-measured
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

| Kind | Example | Editor treatment |
|---|---|---|
| 1. **Per-view default**, user-overridable — **requires an auto sentinel** | `show_empty_days` (`null` = auto, `true`/`false` = pinned) | **Select**, never a switch. Must offer "Automatic" as a reachable option |
| 2. **Hard force**, structurally required | `split_multiday_events: true` — a column *is* a day | Disabled + annotated "Set automatically in column view" |
| 3. **Ignored**, meaningless in this view | `compact_events_complete_days`, `date_vertical_alignment` | Hidden |
| 4. **Reinterpreted** — same control, rotated meaning | global `compact_events_to_show` (Σ in list → max-per-column in column) | Normal control **+ per-view help text** stating what it caps |

**Kind 1 carries a hard requirement, added in v4 after the maintainer caught the hole.** A
per-view *default* alone is not enough, because config is a **single flat namespace**: the
moment the user sets the key it applies to every view, and a two-state control (switch) makes
"unset" unreachable — the only way back is hand-editing YAML.

**A3-C makes this certain rather than theoretical.** With the responsive fallback, a column
card *is* a list card below the threshold, so column and list are not alternatives a user
chooses between — they are the same card at two widths. Any kind-1 key without an auto
sentinel will collide for essentially every user.

**So: a key is only eligible for kind 1 if it has an explicit auto/unset value that is
selectable in the editor.** For booleans that means widening to `boolean | null` and rendering
a 3-option select. The codebase already does exactly this for `show_week_numbers`
(`config.ts:48`, `editor.ts:1109-1113`, `:588-591`, `:660`) — reuse that path, do not invent a
second one. If a key cannot take a sentinel, it is not kind 1; pick another kind.

**Kind 4 is new in v4** and exists because of `compact_events_to_show`. It is editable, has
the same default, and is shown in the editor — but its *meaning* rotates between views
(A3-D). None of kinds 1–3 fit: it is not defaulted differently, not forced, not ignored. The
critique's framing is worth recording, because it is a check on my own reasoning: **a key with
truly one meaning is kind 1 and needs no special handling.** Needing a slot at all is evidence
that "one meaning, rotated mechanism" is a *user-model* claim rather than an implementation
one — true enough to justify the rotation, not true enough to leave unlabelled. The help text
is what makes the surprise survivable instead of silent.

Note also that **per-entity** `compact_events_to_show` stays **kind 1** — it does not rotate
at all (A3-D). Two keys of the same name, two different kinds, which is itself a reason to be
explicit in the editor copy.

`show_empty_days` was kind 2 in v2; **[v3]** it became an ordinary key in no kind at all
(A3-B); **[v4]** it is the canonical **kind 1** key, and the reason kind 1 now requires an auto
sentinel — see **A3-B-3**.

**Week numbers are deferred in column MVP.** `show_week_numbers` is tri-state
(`editor.ts:1159-1163`) and its non-null path renders the full-width `week-row-table`. In a
column layout the placement is genuinely incoherent for partial weeks: a 7-day window starting
mid-week spans **two** ISO weeks, its first column is not a week-start, and a window can
legitimately need 0, 1 or 2 badges on non-adjacent columns. Options were (a) place on the true
week-start column only, or (b) defer. **Recommend (b) for MVP**, ignored-and-documented per
the `date_vertical_alignment` precedent, revisit with real usage. Default is `null`, so this
affects only opted-in users.

---

## E. Cross-cutting acceptance criteria

Both come from ACR's PlannerView hitting **the same two traps** we found in #339, in an
independent codebase, on the same feature type. That makes it a pattern, so it gets named.

1. **No silent config no-ops.** Every existing option either works in column view or is
   documented as not applicable. (ACR shipped `dimFinishedEvents` inert in the Planner —
   issue #1790. #339 silently ignores ~8 shipped options.) Current documented-N/A list:
   `date_vertical_alignment`, `compact_events_to_show` (+ `compact_days_to_show`,
   `compact_events_complete_days`), week numbers, week/month separator *spacing multipliers*.
2. **Every new user-visible string exists in all language files at ship time**, not after.
   (ACR shipped Spanish missing the whole `planner` section — PR #1812. #339 added 6 runtime
   keys to `en.json` only.) Note the all-or-nothing trap in `AGENTS.md`: a *partial* `editor`
   section defeats the whole-language English fallback and renders raw key names.

**HA soak list — list view must be pixel-identical after phases 1–3:** default config; compact
mode (all three keys); `max_height` scrolling; multi-day spans under both
`split_multiday_events` settings; all-day events; day weather and per-event weather; entity
labels; per-entity `show_time`/`show_end_time`/text colour; `show_empty_days: true`; a week and
a month boundary in the same window; `today_indicator` with a non-default position;
non-default `vertical_line_width`; **RTL** (the accent is `border-inline-start`, a logical
property — confirm it still flips after extraction); countdown and progress-bar states.

**[NEW] Phase 2 adds warm-cache cases**, which the v1 list omitted entirely — it tested both
split settings but never *toggled* one against a populated cache, the exact scenario that
exercises the key. With a warm cache: flip `split_multiday_events`; change an entity label;
change an allow/block pattern. Confirm the view updates.

---

## F. Constraints that bind implementation

1. **Build sentinel.** `rollup.config.mjs:10` tests `NODE_ENV === 'prod'` — *not*
   `'production'`. `NODE_ENV=production npx rollup -c` silently produces a **dev** build while
   reporting success.
2. **Testing — resolved in v3, see Phase 0.** Gates today are `npx tsc --noEmit`,
   `npm run lint`, both rollup forms, then manual HA soak. `npm run format` covers
   `src/**/*.ts` only — **not** JSON. v3 adds a staged safety net *before* the refactor:
   zero-dependency i18n parity first, then `vitest` for pure logic, then DOM goldens as a
   review artifact. AGENTS.md's "no test framework" is stated alongside "bundle size is a
   design constraint"; a devDependency does not enter the bundle, so the rationale does not
   apply — **amend the doc rather than silently violating it.**
3. **Config migration is editor-only.** `DEPRECATED_CONFIG_MAP` is consumed solely at
   `editor.ts:308,380`. A YAML-only user's deprecated key is *silently ignored*, never
   migrated. Renaming any **shipped** key is a real break for YAML users regardless. (Does not
   affect the 11→8 renames — those never shipped.)
4. **Attribution.** lenaxia's four commits stay as ancestors. Never squash him out.
5. **Communication.** A public epic issue tracks this work and links the column-view requests
   (#14, #263, #253). #339 gets an informational note that column view lands first and that its
   time-grid work is retained for phase 5 — not a verdict on that proposal.
6. **[NEW] `hide_when_empty` exists on `origin/dev`, not on our frozen branch.** It landed in
   the two commits `dev` is ahead by. It is therefore *not* visible in this worktree's `src/`,
   and any plan item touching it must be written against `dev`. Phase 4 must specify its
   interaction with column view: `visibleEventCount` windows by `days_to_show`, so the count
   and the rendered column set must not disagree.

---

## G. Open questions

1. ~~Decisions 11, 12, 13, 14~~ **SETTLED in v3** — see A2 and A3.
2. ~~Does `compact_events_to_show` render "+N more"?~~ **SETTLED: it does not.** The key *is*
   reusable per-column though — see A3-D and D3.
3. **Separator spacing multipliers in column view** — drop and document. **SETTLED in A3-E**;
   an explicit opt-in gutter key defaulting `0px` is additive later.
4. **Does column view ship in v4.0.0 alone, with time-grid in v4.1?** Recommendation: yes.
   Column view is the more frequently requested of the two and depends on none of the
   time-axis work; shipping them together would gate it on work it does not need.
5. **v4.0.0 is a milestone choice, not a semver necessity.** Nothing in phases 0–4 is breaking
   — `view` is additive and defaults to `list`. Worth naming as a deliberate choice.
   *Opportunity:* if a major is happening anyway, it is the natural moment to batch other
   deferred breaking changes (e.g. retiring the editor-only deprecation map). Flagged, not
   scoped.
6. **[v3] Still genuinely open:** the hysteresis band for the view-switch threshold (A3-C).
   Needs a real HA dashboard to tune; cannot be decided on paper.
7. **[v4] RULED:** `show_empty_days` defaults to showing empty days in column view — but via an
   **auto sentinel**, not a bare per-view default. `null` (Automatic) / `true` / `false`,
   rendered as a select. See **A3-B-3**. Back-compat verified free; no gap affordance owed.
8. **[v4] To verify in HA, not on paper:** the actual card-edit modal width, which determines
   how severe A3-C.4 is (the mitigation is mandatory regardless).
9. **No runtime or visual HA testing has happened on any of this yet.**

---

## H. Explicitly out of scope

Overlap lanes, time axis, now-line (time-grid's, phase 5); paging and date-range navigation
(#185); per-person lanes (#203); `date_horizontal_alignment` and its naming harmonisation;
line-style keys for any separator; interactive expand on the "+N more" pill.
