import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as Filter from '../src/rendering/editor/filter';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import * as EditorLocalize from '../src/rendering/editor/localize';
import { PANELS, type SchemaCtx } from '../src/rendering/editor/panels';
import {
  type EditorWorkspace,
  WORKSPACES,
  baseViewForWorkspace,
} from '../src/rendering/editor/workspace';

/**
 * The Layout panel's rendered order, flattened the way a reader sees it.
 *
 * Collapsibles are recorded as one entry and **not** recursed into, because the point of
 * every assertion here is what the panel shows before anyone opens anything.
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
 * 🚨 Go through `filterEntitySchema`, never `subform.schema`. View scoping is applied
 * there, one layer below the declaration, so a test reading the declared schema is
 * measuring something no user sees — and will happily fail on a duplicate call that
 * changes nothing, which is a green light dressed as a guard.
 *
 * `NO_FILTER` is the resting state: `filterEntitySchema` withholds before it consults the
 * criteria, so this is the schema shown to somebody who has typed nothing.
 *
 * @param subform - Sub-form as declared by its panel
 * @param ctx - Schema context, whose workspace decides the scoping
 * @returns The nodes the element hands to `ha-form`
 */
function renderedSubform(
  subform: { schema: ReadonlyArray<HaFormSchema>; path: ReadonlyArray<string> },
  ctx: SchemaCtx,
): HaFormSchema[] {
  return Filter.filterEntitySchema(subform.schema, { entity: 'calendar.anna' }, subform.path, {
    ...ctx,
    criteria: Filter.NO_FILTER,
  });
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
  // this file exists to make loud: the whole restructure below landed with the suite
  // green, because nothing pinned the shape it replaced.
  it('opens the grid workspace on the axis, not on two card-box options', () => {
    expect(layoutOutline('grid')).toEqual([
      '— Time Axis —',
      'First Hour',
      'Last Hour',
      'Grid Lines Every',
      'Height Per Hour',
      '— Hour Labels —',
      'Hour Label Width',
      'Show Hour Labels',
      'Axis Labels Every',
      '— On the Grid —',
      'Weekend Shading',
      'Now Line',
      'Now Line Color',
      'Most All-Day Rows',
      'Most Events Side By Side',
      '— Card Size & Spacing —',
      'Additional Card Spacing',
      'Card Height',
      '[Grid Density]',
    ]);
  });

  // The reused key is the reason this assertion is separate. `time_grid.axis` was the
  // collapsible's title and carries nine translations; the heading resolves it only
  // because `blockScope` stamps `titleKey`. Drop the stamp and the label humanizes to
  // "Axis" with every translation stranded, which no other gate would report.
  it('resolves the axis heading through the block-qualified key', () => {
    expect(layoutOutline('grid')).toContain('— Time Axis —');
    expect(EditorLocalize.lookup('de', 'time_grid.axis')).toBe('Zeitachse');
  });

  it('leaves list and column on the order they always had', () => {
    const expected = ['Day Spacing', 'Event Spacing', 'Additional Card Spacing', 'Card Height'];
    expect(layoutOutline('list')).toEqual(expected);
    // "Column Density", not "Grid Density" — the per-view panel-title mechanism resolving
    // the same group under the workspace being configured.
    expect(layoutOutline('column')).toEqual([...expected, '[Column Density]']);
  });

  // Headings earn their place only where there is enough to caption. Asserting the
  // absence is what stops a later sweep "tidying" list and column into the grid's shape.
  it('captions grid and only grid', () => {
    for (const view of ['list', 'column'] as const) {
      expect(layoutOutline(view).filter((entry) => entry.startsWith('—'))).toEqual([]);
    }
  });
});

describe('Collapsibles come last in every panel', () => {
  // Alex's complaint, generalized. A "Gap & Rule" run was appended *below* Day Header's
  // four collapsibles, so the panel opened on a disclosure and then produced two more
  // fields underneath it — a reader who has stopped scanning at the first collapsed row
  // never sees them. That is a convention rather than a mechanism, which is why it broke
  // silently and why it is asserted here across every panel and every view rather than
  // for the one panel that happened to be reported.
  //
  // Stated as a property, not as a list: nothing after the first collapsible may be
  // anything other than a collapsible. That covers panels nobody has written yet, which a
  // per-panel expectation would not.
  for (const workspace of WORKSPACES) {
    for (const panel of PANELS) {
      it(`${panel.id} in ${workspace}`, () => {
        const entries = outline(renderedPanel(panel, ctxFor(workspace)));
        const first = entries.findIndex((entry) => entry.startsWith('['));
        if (first === -1) {
          return;
        }
        expect(entries.slice(first).filter((entry) => !entry.startsWith('['))).toEqual([]);
      });
    }
  }
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

describe('The card and the per-calendar subform caption the same switches alike', () => {
  // `heading_details` is deliberately shared. The subform has captioned `show_time` /
  // `show_location` / `show_description` with it for as long as it has had headings, and
  // the card-level run that replaced four collapsed groups asks the same question one
  // level up — so it reuses the key rather than introducing an English-only one beside a
  // translated one. That reuse is only defensible while both surfaces really do put the
  // same switches under it in the same order, which is what this asserts.
  //
  // The card run carries two the subform does not; the claim is that the shared three
  // agree on order and caption, not that the two lists are equal.
  function underDetails(schema: ReadonlyArray<HaFormSchema>): string[] {
    const flat: string[] = [];
    const walk = (nodes: ReadonlyArray<HaFormSchema>): void => {
      for (const node of nodes) {
        if ('type' in node && node.type === 'expandable') continue;
        if ('schema' in node) {
          walk(node.schema);
          continue;
        }
        flat.push(node.name);
      }
    };
    walk(schema);

    const start = flat.indexOf('heading_details');
    if (start === -1) return [];

    const rest = flat.slice(start + 1);
    const end = rest.findIndex((name) => name.startsWith('heading_'));

    return (end === -1 ? rest : rest.slice(0, end)).filter((name) =>
      ['show_time', 'show_location', 'show_description'].includes(name),
    );
  }

  const config = buildConfig({ view: 'list', entities: [{ entity: 'calendar.anna' }] });
  const ctx: SchemaCtx = { config, view: 'list', language: 'en' };

  it('puts the three shared switches under it in the same order on both', () => {
    const events = PANELS.find((panel) => panel.id === 'events');
    const calendars = PANELS.find((panel) => panel.id === 'calendars');
    if (events === undefined || calendars === undefined) {
      throw new Error('a panel was renamed, and this test now proves nothing');
    }

    const card = underDetails(events.build(ctx));
    const subform = (calendars.subforms?.(ctx) ?? []).flatMap((sub) => underDetails(sub.schema));

    // Both halves pinned by value: an empty pair would agree with itself.
    expect(card).toEqual(['show_time', 'show_location', 'show_description']);
    expect(subform).toEqual(['show_time', 'show_location', 'show_description']);
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

  // The accent mode and the colour it governs are both `Accent Color`, on the card and
  // again on the per-calendar subform, in English and in all ten translations — which is
  // why no English-only rename fixes it. Reusing the already-translated
  // `accent_color_mode.option.custom.label` looks free and is not: the dropdown's own
  // *value* is that string, so the swatch below would read `Custom color / Custom color`.
  // A real fix needs a new string translated nine times. Alex's call.
  const KNOWN = [
    'calendars/subform: "Accent Color" = accent_color_mode + accent_color',
    'events: "Accent Color" = accent_color_mode + accent_color',
  ];

  for (const workspace of WORKSPACES) {
    it(`has only the known pair in the ${workspace} workspace`, () => {
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
  // `filterEntitySchema`, one layer below the declaration — so a test reading
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

describe('No sub-form heading is left captioning nothing', () => {
  // 🚨 Withholding a key can empty the heading above it, and a stranded heading is worse
  // than no heading: it makes a claim about whatever follows it, so it silently relabels
  // the next section. `## Multi-Day Events` held exactly one control, `split_multiday_events`,
  // which grid withholds — so scoping the sub-form is the first change able to strand one.
  //
  // The live probe that verified the scoping could not have seen this. It counted
  // `ha-selector-*` elements, and a heading is an `ha-form-constant`; the editor would have
  // rendered a bare bold label over the wrong fields while every measured count was right.
  function flat(nodes: ReadonlyArray<HaFormSchema>): Array<'heading' | 'field'> {
    return nodes.flatMap((node): Array<'heading' | 'field'> => {
      if ('schema' in node) return flat(node.schema);

      return ['selector' in node ? 'field' : 'heading'];
    });
  }

  for (const workspace of WORKSPACES) {
    it(`captions at least one field per heading in ${workspace}`, () => {
      const ctx = ctxFor(workspace);
      let headings = 0;

      for (const panel of PANELS) {
        for (const subform of panel.subforms?.(ctx) ?? []) {
          const seq = flat(renderedSubform(subform, ctx));
          const empty: number[] = [];

          seq.forEach((kind, i) => {
            if (kind !== 'heading') return;
            headings += 1;
            if (seq[i + 1] === undefined || seq[i + 1] === 'heading') empty.push(i);
          });

          expect({ where: `${panel.id}/${subform.path.join('.')}`, empty }).toEqual({
            where: `${panel.id}/${subform.path.join('.')}`,
            empty: [],
          });
        }
      }

      // Without this the test passes when the sub-form has no headings at all, which is
      // the state a bad refactor would produce.
      expect(headings).toBeGreaterThan(2);
    });
  }
});
