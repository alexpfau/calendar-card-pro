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
