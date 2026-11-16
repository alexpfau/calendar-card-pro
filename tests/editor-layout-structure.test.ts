import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import { changeField, goEntry, keysOf, mountEditor } from './helpers/editor-host';
import type * as Types from '../src/config/types';
import { schemaCtx } from '../src/rendering/editor/field-index';
import * as Filter from '../src/rendering/editor/filter';
import { corpus } from '../src/rendering/editor/gates';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import * as EditorLocalize from '../src/rendering/editor/localize';
import { ENTRY_GROUPS, type HeadingDef, PAGES } from '../src/rendering/editor/pages';
import { PANELS, type SchemaCtx } from '../src/rendering/editor/panels';
import {
  type EditorWorkspace,
  WORKSPACES,
  baseViewForWorkspace,
} from '../src/rendering/editor/workspace';

/**
 * A builder's fields in order, each by the label it resolves, flattened the way a page lifts
 * them. A collapsible would be recorded as one entry and **not** recursed into; no builder
 * emits one (asserted below), and a heading would read `— Heading —`.
 *
 * 🚨 The label path does **not** accumulate through named grids, and getting that wrong is
 * how this helper first reported a false pass. Storage nesting and label nesting are
 * separate mechanisms: a named grid nests data, but Home Assistant qualifies a label only
 * under `ha-form-expandable`, so `computeLabel` is handed a path that grew through
 * expandables alone. Threading storage names into it here made `blockScope`'s `titleKey`
 * stamp redundant — the key resolved through the invented path instead — so deleting the
 * stamp left this file green while every `time_grid.*` label in the live editor humanized.
 * The path stays empty because nothing above recurses into an expandable.
 */
function outline(schema: ReadonlyArray<HaFormSchema>): string[] {
  return schema.flatMap((node): string[] => {
    if ('type' in node && node.type === 'expandable') {
      return [`[${node.title ?? node.name}]`];
    }

    if ('schema' in node) {
      return outline(node.schema);
    }

    const label = EditorLocalize.computeLabel('en', node, []);

    return 'selector' in node ? [label] : [`— ${label} —`];
  });
}

/**
 * One calendar's sub-form as the editor renders it.
 *
 * 🚨 Go through `withholdInertFields`, never `subform.schema`. View scoping is applied
 * there, one layer below the declaration, so a test reading the declared schema is
 * measuring something no user sees — and will happily fail on a duplicate call that
 * changes nothing, which is a green light dressed as a guard.
 *
 * @param subform - Sub-form as declared by its panel
 * @param ctx - Schema context, whose workspace decides the scoping
 * @returns The nodes the element hands to `ha-form`
 */
function renderedSubform(
  subform: { schema: ReadonlyArray<HaFormSchema>; path: ReadonlyArray<string> },
  ctx: SchemaCtx,
): HaFormSchema[] {
  return Filter.withholdInertFields(subform.schema, ctx.workspace ?? ctx.view, 'entity');
}

/**
 * A schema context for one workspace, built the way the element builds it.
 *
 * 🚨 `view` is `baseViewForWorkspace(workspace)`, not the workspace. They coincide for
 * the three view workspaces and diverge for Shared, which has no view of its own and
 * builds as list. Passing `'shared'` as the view would not compile, and passing the
 * card's displayed view would make Shared's contents follow whatever the card happened
 * to show.
 *
 * @param workspace - Workspace being rendered
 * @returns Context for the panel builders
 */
function ctxFor(workspace: EditorWorkspace): SchemaCtx {
  const view = baseViewForWorkspace(workspace);
  return {
    config: buildConfig({ view, entities: [{ entity: 'calendar.anna' }] }),
    view,
    workspace,
    language: 'en',
  };
}

/**
 * One panel's schema as the element renders it.
 *
 * 🚨 Mirrors `_renderPanel`, which withholds inert fields before anything else touches
 * the schema. Walking `panel.build(ctx)` raw would make every workspace identical — and
 * Shared exists precisely because withholding is what distinguishes it, so a test reading
 * the declaration would report Shared as covered while measuring list four times.
 *
 * @param panel - Panel definition
 * @param ctx - Schema context, whose workspace decides the withholding
 * @returns The nodes the element hands to `ha-form`
 */
function renderedPanel(
  panel: (typeof PANELS)[number],
  ctx: SchemaCtx,
): ReadonlyArray<HaFormSchema> {
  return Filter.withholdInertFields(panel.build(ctx), ctx.workspace ?? ctx.view);
}

/** The density fields, alike in Columns and Grid; each block keeps its own helper wording. */
const DENSITY = ['Minimum Day Width', 'Fewest Day Columns', 'When Too Narrow'];

function layoutOutline(view: Types.EffectiveView): string[] {
  const config = buildConfig({ view, entities: [{ entity: 'calendar.anna' }] });
  const ctx: SchemaCtx = { config, view, language: 'en' };
  const panel = PANELS.find((candidate) => candidate.id === 'layout');
  if (panel === undefined) {
    throw new Error('Layout panel not found — it was renamed, and this test now proves nothing');
  }
  return outline(panel.build(ctx));
}

describe('Layout panel structure', () => {
  // Pinned by value rather than walked. A test that iterates the schema and asserts each
  // entry resolves would stay green while an entry left the schema, which is the failure
  // this file exists to make loud. Which heading each field sits under is the registry's
  // (`tests/editor-page-registry.test.ts`).
  it('builds the grid workspace the axis first, then the card box and the density', () => {
    expect(layoutOutline('grid')).toEqual([
      'First Hour',
      'Last Hour',
      'Grid Lines Every',
      'Height Per Hour',
      'Hour Label Width',
      'Show Hour Labels',
      'Axis Labels Every',
      'Weekend Shading',
      'Today Shading',
      'Now Line',
      'Most All-Day Rows',
      // Directly above the cap it decides the meaning of: how many events may sit side by
      // side only reads once the reader has been shown how overlaps are drawn.
      'Overlapping Events',
      'Most Events Side By Side',
      'Additional Card Spacing',
      'Card Height',
      ...DENSITY,
    ]);
  });

  // `blockScope` stamps `titleKey`, which is the only reason these resolve their block's own
  // wording. Drop the stamp and each humanizes or takes another view's label, which no other
  // gate would report.
  it('resolves the time grid fields through their block-qualified keys', () => {
    expect(layoutOutline('grid')).toContain('Height Per Hour');
    expect(EditorLocalize.lookup('en', 'time_grid.hour_height')).toBe('Height Per Hour');
  });

  it('leaves list and column on the order they always had, the event gap added in place', () => {
    // Outer to inner: between days, between a day's events, inside each event.
    const expected = [
      'Day Spacing',
      'Event Gap',
      'Event Spacing',
      'Additional Card Spacing',
      'Card Height',
    ];
    expect(layoutOutline('list')).toEqual(expected);
    expect(layoutOutline('column')).toEqual([...expected, ...DENSITY]);
  });
});

/**
 * The presentation every builder has handed to the page registry: a builder emits fields and
 * the named scopes that store them, and nothing else. A heading, a row or a collapsible in a
 * builder would render nowhere, since pages lift each field into a form of its own, while
 * `check:i18n` kept its strings alive. Stated as a property over every panel, workspace and
 * corpus state, so a builder nobody has written yet is covered.
 */
describe('No builder emits presentation', () => {
  it('builds no heading, row or collapsible in any panel, workspace or corpus state', () => {
    const found = new Set<string>();
    let nodes = 0;
    let states = 0;
    for (const state of corpus()) {
      states += 1;
      const ctx = schemaCtx(state.config, state.workspace, 'en');
      for (const panel of PANELS) {
        const walk = (schema: ReadonlyArray<HaFormSchema>): void => {
          for (const node of schema) {
            nodes += 1;
            if ('type' in node && node.type === 'constant')
              found.add(`${panel.id} heading ${node.name}`);
            if ('type' in node && node.type === 'expandable')
              found.add(`${panel.id} collapsible ${node.name}`);
            if ('type' in node && node.type === 'grid' && node.name === '')
              found.add(`${panel.id} row`);
            if ('schema' in node) walk(node.schema);
          }
        };
        walk(panel.build(ctx));
        for (const subform of panel.subforms?.(ctx) ?? []) walk(subform.schema);
      }
    }
    console.info(`builder presentation: ${states} corpus states, ${nodes} nodes walked`);
    expect(nodes).toBeGreaterThan(10_000);
    expect([...found].sort()).toEqual([]);
  });
});

/**
 * The Day Header panel as each workspace builds it.
 *
 * What every date shares first, then the header's geometry and week numbering, then the
 * exceptions by the kind of day: today, with its indicator right after it, then past days and
 * weekends.
 */
describe('Day Header panel structure', () => {
  function dayHeader(workspace: EditorWorkspace, options: Partial<Types.Config> = {}): string[] {
    const panel = PANELS.find((candidate) => candidate.id === 'day_header');
    if (panel === undefined) throw new Error('Day Header panel not found');
    const ctx = ctxFor(workspace);
    return outline(renderedPanel(panel, { ...ctx, config: { ...ctx.config, ...options } }));
  }

  const SHARED_START = [
    'Weekday Font Size',
    'Weekday Color',
    'Day Number Font Size',
    'Day Number Color',
    'Show Month',
    'Month Font Size',
    'Month Color',
  ];
  const BY_DAY = [
    'Numbering',
    "Today's Date Scale",
    "Today's Font Weight",
    "Today's Weekday Color",
    "Today's Day Number Color",
    "Today's Month Color",
    'Style',
    'Indicator Color',
    // The fade first: it is what a past day is usually given, and it needs nothing else.
    'Past Date Opacity',
    'Past Date Scale',
    'Past Font Weight',
    'Weekend Weekday Color',
    'Weekend Day Number Color',
    'Weekend Month Color',
  ];
  const GAP_AND_RULE = ['Day Header Gap', 'Day Header Rule Width', 'Day Header Rule Color'];

  it('shows the list workspace its alignment, and no gap or rule', () => {
    expect(dayHeader('list')).toEqual(['Vertical Alignment', ...SHARED_START, ...BY_DAY]);
  });

  it.each(['column', 'grid'] as const)('shows the %s workspace its gap and rule', (workspace) => {
    expect(dayHeader(workspace)).toEqual([...SHARED_START, ...GAP_AND_RULE, ...BY_DAY]);
  });

  it('shows the shared workspace only what every view shares', () => {
    expect(dayHeader('shared')).toEqual([...SHARED_START, ...BY_DAY]);
  });

  it('hides every month color while the month is hidden', () => {
    const outline = dayHeader('list', { show_month: false });

    expect(outline).not.toContain('Month Color');
    expect(outline).not.toContain("Today's Month Color");
    expect(outline).not.toContain('Weekend Month Color');
    expect(outline).toContain('Weekend Day Number Color');
  });
});

describe('No collapsible opens onto fewer than two controls', () => {
  // The same complaint one level down, and the reason four disclosures disappeared from
  // this editor. A group whose contents are conditional on its own first field collapses
  // to that one field on a fresh card: `Location` was a single checkbox behind a
  // disclosure captioned as though it were about location styling, `Description` the same,
  // and Day Header's `Today Indicator` and `Week Numbers` were one dropdown each. A reader
  // could not discover that the card can show a location, or mark today, without opening a
  // group that gave no reason to think it held the switch.
  //
  // Two is the threshold because a disclosure is a trade — one row of chrome and a click,
  // against however many rows it hides. At one control the trade is never worth taking.
  //
  // The remedy differs by case and the test deliberately does not care which was used:
  // the content switches were promoted to a visible run and their groups now hold styling
  // only, while Day Header's two became headed runs because their labels — `Style` and
  // `Numbering` — mean nothing without the caption. Both satisfy this.
  //
  // Default config, because that is the state a new user meets; a group that fills up once
  // its switch is on was never the problem.
  /** Every operable control below a node, across rows and nested groups alike. */
  function controls(schema: ReadonlyArray<HaFormSchema>): number {
    return schema.reduce(
      (total, node) =>
        'schema' in node ? total + controls(node.schema) : total + ('selector' in node ? 1 : 0),
      0,
    );
  }

  function thin(schema: ReadonlyArray<HaFormSchema>, where: string, found: string[]): void {
    for (const node of schema) {
      if ('type' in node && node.type === 'expandable') {
        const held = controls(node.schema);
        if (held < 2) {
          found.push(`${where}/${node.title ?? node.name} holds ${held}`);
        }
        thin(node.schema, where, found);
      } else if ('schema' in node) {
        thin(node.schema, where, found);
      }
    }
  }

  /** Operable controls a workspace shows, panels and per-calendar sub-forms alike. */
  const reach = new Map<EditorWorkspace, number>();

  for (const workspace of WORKSPACES) {
    it(`${workspace} has no one-control disclosure`, () => {
      const ctx = ctxFor(workspace);
      const found: string[] = [];
      let seen = 0;

      for (const panel of PANELS) {
        const schema = renderedPanel(panel, ctx);
        seen += controls(schema);
        thin(schema, `${workspace}/${panel.id}`, found);

        // The per-calendar subform is reached through `subforms`, not through `build`, so
        // a walk of the panels alone never sees its thirty-odd fields. It is flat today;
        // this is what notices if it stops being.
        for (const sub of panel.subforms?.(ctx) ?? []) {
          const rendered = renderedSubform(sub, ctx);
          seen += controls(rendered);
          thin(rendered, `${workspace}/${panel.id}:subform`, found);
        }
      }

      // The denominator, beside the verdict rather than in a step of its own: an empty
      // `found` proves nothing if the walk reached nothing, and a walk that silently
      // stopped covering the editor is exactly the failure this file already had once.
      //
      // Ninety rather than a hundred because Shared withholds every view-scoped key by
      // design and legitimately walks fewer controls than any single view. The constant
      // is only a floor under "did the walk reach the editor"; the test below carries the
      // part that used to be implied in it.
      reach.set(workspace, seen);
      expect(seen, 'the walk found no controls at all').toBeGreaterThan(90);
      expect(found).toEqual([]);
    });
  }

  it('shows Shared strictly fewer controls than List, and not far fewer', () => {
    // 🚨 The failure this replaces a magic number with. A Shared workspace that stopped
    // withholding would be byte-identical to List — which is what an earlier Shared
    // actually was, measured across 63 configurations, and why it was deleted. Equality
    // here is the whole feature quietly doing nothing, and no count-against-a-constant
    // can see it because both numbers would be comfortably above any floor.
    const shared = reach.get('shared');
    const list = reach.get('list');

    expect({ shared, list }).toEqual({ shared: expect.any(Number), list: expect.any(Number) });
    expect(shared!).toBeLessThan(list!);
    expect(list! - shared!).toBeLessThan(20);
  });
});

describe('The card and a calendar entry caption the same switches alike', () => {
  // `heading_details` is deliberately shared. A calendar's fields have been captioned
  // `show_time` / `show_location` / `show_description` with it for as long as they have had
  // headings, and the Events page asks the same question one level up — so it reuses the key
  // rather than introducing an English-only one beside a translated one. That reuse is only
  // defensible while both surfaces really do put the same switches under it in the same order,
  // which is what this asserts, both from the page registry: the Events page's heading and the
  // entry page's group of that name.
  //
  // The card run carries others the entry does not; the claim is that the shared three agree
  // on order and caption, not that the two lists are equal.
  const SHARED = ['show_time', 'show_location', 'show_description'];

  const under = (headings: ReadonlyArray<HeadingDef>): string[] =>
    (headings.find((heading) => heading.key === 'heading_details')?.fields ?? [])
      .map(([id]) => id.slice(id.indexOf(':') + 1))
      .filter((name) => SHARED.includes(name));

  it('puts the three shared switches under it in the same order on both', () => {
    const events = PAGES.find((page) => page.id === 'events');
    if (events === undefined) {
      throw new Error('the Events page was renamed, and this test now proves nothing');
    }

    // Both halves pinned by value: an empty pair would agree with itself.
    expect(under(events.headings)).toEqual(SHARED);
    expect(under(ENTRY_GROUPS)).toEqual(SHARED);
  });
});

/**
 * Two fields in a row carrying the same label.
 *
 * `row()` is an `ha-form` grid, so a pair reads side by side on a desktop and **stacks**
 * on a phone — where two identical labels one above the other leave no way to tell which
 * control is which. That is the 390px-only class of defect, invisible to a wide capture.
 *
 * Pinned by value rather than asserted empty, because the one live instance is an open
 * product decision rather than an oversight, and a test that merely tolerated it would
 * let a *second* one arrive unnoticed. When the pair below is resolved, delete its entry
 * and this fails until the list matches again.
 */
describe('No two adjacent fields share a label', () => {
  function adjacentDuplicates(workspace: EditorWorkspace): string[] {
    const ctx = ctxFor(workspace);
    const found: string[] = [];

    for (const panel of PANELS) {
      // 🚨 A subform's `path` is not decoration, and dropping it fails silently in the
      // one direction that looks like success. `computeLabel` resolves
      // `lookup(qualified) ?? lookup(bare) ?? humanize(name)`, so an empty path makes the
      // qualified lookup a no-op: `accent_color` inside the calendar subform stops
      // resolving `entity.accent_color`, and a field whose bare key does not exist at all
      // falls through to `humanize()` — which returns a plausible sentence-case label
      // rather than an error. An earlier version of this test read the subform that way
      // and reported `Label type` and `Days of week`; the editor shows `Label Type` and
      // `Days of the Week`. It still found the one real duplicate below, which is the
      // trap: the answer was right and the evidence was worthless.
      const surfaces: Array<[string, ReadonlyArray<HaFormSchema>, ReadonlyArray<string>]> = [
        [panel.id, panel.build(ctx), []],
      ];
      for (const subform of panel.subforms?.(ctx) ?? []) {
        surfaces.push([`${panel.id}/subform`, subform.schema, subform.path]);
      }

      for (const [where, schema, path] of surfaces) {
        // Collapsibles are skipped rather than recursed into: a label repeated across a
        // disclosure boundary is not adjacent to anything, and folding it in here would
        // report pairs no reader can see at once.
        const labels: Array<{ label: string; name: string }> = [];
        const walk = (nodes: ReadonlyArray<HaFormSchema>): void => {
          for (const node of nodes) {
            if ('type' in node && node.type === 'expandable') continue;
            if ('schema' in node) walk(node.schema);
            else if ('selector' in node) {
              labels.push({
                label: EditorLocalize.computeLabel('en', node, path),
                name: String(node.name),
              });
            }
          }
        };
        walk(schema);

        for (let i = 1; i < labels.length; i++) {
          if (labels[i].label !== '' && labels[i].label === labels[i - 1].label) {
            found.push(
              `${where}: "${labels[i].label}" = ${labels[i - 1].name} + ${labels[i].name}`,
            );
          }
        }
      }
    }

    return [...new Set(found)].sort();
  }

  // The accent mode and the color it governs were both `Accent Color`, on the card and again
  // on the per-calendar subform. The color now reads "Custom Accent Color", and the mode, which
  // the color control draws as one "Accent Color", keeps that name, so every name on a page is
  // its own (`tests/editor-unique-names.test.ts`).
  const KNOWN: string[] = [];

  for (const workspace of WORKSPACES) {
    it(`has no such pair in the ${workspace} workspace`, () => {
      expect(adjacentDuplicates(workspace)).toEqual(KNOWN);
    });
  }
});

describe('Sub-forms are view-scoped like the panels above them', () => {
  // 🚨 This is a reconciliation, not a list, and that is the whole point. `VIEW_SCOPE` is
  // the single statement of which views a key applies to, so comparing what the editor
  // renders against what that rule permits fails on the *next* per-calendar key someone
  // scopes, with no second table to keep in step. A test naming `compact_events_to_show`
  // and `split_multiday_events` would pass forever while the third key went unwithheld.
  //
  // 🚨 It asserts on `renderedSubform`, not on `subform.schema`, and the distinction is
  // the entire difference between coverage and decoration. The withholding happens in
  // `withholdInertFields`, one layer below the declaration — so a test reading
  // `subform.schema` measures a schema nobody renders. An earlier version of this file did
  // exactly that, and it "detected" a reverted duplicate call in `calendarsSubforms` that
  // was provably invisible to users: the live editor rendered byte-identical field and
  // heading counts in all three workspaces with that call removed. The test failed, the
  // editor did not change, and the failure read as protection. Assert on the layer the
  // element actually calls, or the invariant only restates whichever call you just wrote.
  function fieldNames(nodes: ReadonlyArray<HaFormSchema>): string[] {
    return nodes.flatMap((node): string[] => {
      if ('schema' in node) return fieldNames(node.schema);

      return 'selector' in node ? [String(node.name)] : [];
    });
  }

  for (const workspace of WORKSPACES) {
    it(`renders the sub-form scoped to ${workspace}`, () => {
      const ctx = ctxFor(workspace);
      let seen = 0;
      let subforms = 0;

      for (const panel of PANELS) {
        for (const subform of panel.subforms?.(ctx) ?? []) {
          subforms += 1;
          const where = `${panel.id}/${subform.path.join('.')}`;
          const rendered = fieldNames(renderedSubform(subform, ctx));
          seen += rendered.length;

          expect({
            where,
            offered: fieldNames(subform.schema).filter((name) => !rendered.includes(name)),
          }).toEqual({
            where,
            offered: fieldNames(subform.schema).filter(
              (name) =>
                !fieldNames(
                  Filter.withholdInertFields(subform.schema, ctx.workspace ?? ctx.view, 'entity'),
                ).includes(name),
            ),
          });
        }
      }

      // A null has to prove it can be non-zero. Without these the whole describe passes
      // when `subforms()` returns nothing at all.
      expect(subforms).toBeGreaterThan(0);
      expect(seen).toBeGreaterThan(15);
    });
  }
});

describe('No entry page heading is left captioning nothing', () => {
  // 🚨 Withholding a key can empty the heading above it, and a stranded heading is worse
  // than no heading: it makes a claim about whatever follows it, so it silently relabels
  // the next section. `## Multi-Day Events` held exactly one control, `split_multiday_events`,
  // which grid withholds — so scoping a calendar's fields is the first change able to strand
  // one. The entry page draws its headings from `ENTRY_GROUPS` and each over the fields the
  // workspace builds, so this reads the drawn page, where a stranded heading would show. A
  // heading whose settings wait in its Add row or behind its gate line names them there, so it
  // captions something too.
  for (const workspace of WORKSPACES) {
    it(`draws a field, an Add row or a gate line under every heading in ${workspace}`, async () => {
      const editor = await mountEditor({
        type: 'custom:calendar-card-pro',
        entities: ['calendar.anna'],
      });
      await changeField(editor, 'workspace:editing_workspace', workspace);
      await goEntry(editor, keysOf(editor, 'entry')[0]);
      const page = editor.shadowRoot!.querySelector('.entry-page');
      const headings = [...(page?.querySelectorAll('[data-heading]') ?? [])];

      // Without this the test passes on a page with no headings at all, which is the state a
      // bad refactor would produce.
      expect(headings.length).toBeGreaterThan(2);
      expect(
        headings
          .filter((heading) => heading.querySelector('[data-field], .add-row, .gate-line') === null)
          .map((heading) => heading.getAttribute('data-heading')),
      ).toEqual([]);
      editor.remove();
    });
  }
});
