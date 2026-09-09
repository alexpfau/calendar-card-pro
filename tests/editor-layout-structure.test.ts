import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import * as EditorLocalize from '../src/rendering/editor/localize';
import { PANELS, type SchemaCtx } from '../src/rendering/editor/panels';

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
  const views = ['list', 'column', 'grid'] as const;

  for (const view of views) {
    for (const panel of PANELS) {
      it(`${panel.id} in ${view}`, () => {
        const config = buildConfig({ view, entities: [{ entity: 'calendar.anna' }] });
        const entries = outline(panel.build({ config, view, language: 'en' }));
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
  const views = ['list', 'column', 'grid'] as const;

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

  for (const view of views) {
    it(`${view} has no one-control disclosure`, () => {
      const config = buildConfig({ view, entities: [{ entity: 'calendar.anna' }] });
      const ctx: SchemaCtx = { config, view, language: 'en' };
      const found: string[] = [];
      let seen = 0;

      for (const panel of PANELS) {
        const schema = panel.build(ctx);
        seen += controls(schema);
        thin(schema, `${view}/${panel.id}`, found);

        // The per-calendar subform is reached through `subforms`, not through `build`, so
        // a walk of the panels alone never sees its thirty-odd fields. It is flat today;
        // this is what notices if it stops being.
        for (const sub of panel.subforms?.(ctx) ?? []) {
          seen += controls(sub.schema);
          thin(sub.schema, `${view}/${panel.id}:subform`, found);
        }
      }

      // The denominator, beside the verdict rather than in a step of its own: an empty
      // `found` proves nothing if the walk reached nothing, and a walk that silently
      // stopped covering the editor is exactly the failure this file already had once.
      expect(seen, 'the walk found no controls at all').toBeGreaterThan(100);
      expect(found).toEqual([]);
    });
  }
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
