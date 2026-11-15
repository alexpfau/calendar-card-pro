/**
 * The page registry against the builders, in both directions.
 *
 * `pages.ts` is a list beside the code, which is exactly what drifts (AGENTS.md, _Proximity is
 * not reach_). So nothing here walks the registry to find out what exists: every panel is built
 * under every workspace over the whole gate corpus, every calendar entry state and the toolbar
 * button schema with it, and the leaves walked here are the denominator. Every one of them must
 * be placed exactly once, and every placed id must be built somewhere. A field added to a
 * builder, a registry line deleted, an id placed twice and a gate the corpus no longer opens
 * each fail one of the first three tests.
 */

import { describe, expect, it } from 'vitest';

import { type FieldId, entrySchema, fieldId, schemaCtx } from '../src/rendering/editor/field-index';
import * as Filter from '../src/rendering/editor/filter';
import { ENTRY_GATES, GATES, type Gate, corpus } from '../src/rendering/editor/gates';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import {
  type Appearance,
  ENTRY_GROUPS,
  FAMILIES,
  type FamilyId,
  type HeadingDef,
  OVERVIEW_FIELDS,
  PAGES,
  isWholeCard,
  placementOf,
} from '../src/rendering/editor/pages';
import { PANELS, walkSchema } from '../src/rendering/editor/panels';
import { buildToolbarButtonSchema } from '../src/rendering/editor/schemas/card';
import { EDITOR_STRINGS } from '../src/rendering/editor/strings';
import { type EditorWorkspace, WORKSPACES } from '../src/rendering/editor/workspace';

/** Every leaf the builders build, by id: the workspaces it is built in, and its nodes. */
interface Built {
  workspaces: Set<EditorWorkspace>;
  nodes: HaFormSchema[];
}

/**
 * Walks a built schema's leaves into the map.
 *
 * @param into - Map being filled
 * @param scope - Id scope
 * @param schema - Built schema
 * @param workspace - Workspace it was built for
 */
function walkInto(
  into: Map<FieldId, Built>,
  scope: string,
  schema: ReadonlyArray<HaFormSchema>,
  workspace: EditorWorkspace,
): void {
  for (const { node, dataPath } of walkSchema(schema)) {
    if (!('selector' in node)) continue;
    const id = fieldId(scope, dataPath, node.name);
    const known = into.get(id) ?? { workspaces: new Set(), nodes: [] };
    known.workspaces.add(workspace);
    known.nodes.push(node);
    into.set(id, known);
  }
}

const STATES = corpus();

const BUILT = (() => {
  const built = new Map<FieldId, Built>();
  for (const workspace of WORKSPACES) {
    for (const state of STATES.filter((candidate) => candidate.workspace === workspace)) {
      const ctx = schemaCtx(state.config, workspace, 'en');
      for (const panel of PANELS) {
        walkInto(
          built,
          panel.id,
          Filter.withholdInertFields(panel.build(ctx), workspace),
          workspace,
        );
      }
      for (const entry of state.config.entities ?? []) {
        walkInto(built, 'calendar', entrySchema(entry, ctx), workspace);
      }
    }
    walkInto(built, 'button', buildToolbarButtonSchema(), workspace);
  }
  return built;
})();

/** Every placement in the registry, in order, with where it sits. */
const PLACED: ReadonlyArray<{
  id: FieldId;
  appearance: Appearance;
  page: string;
  heading: HeadingDef | undefined;
}> = [
  ...OVERVIEW_FIELDS.map(([id, appearance]) => ({
    id,
    appearance,
    page: 'overview',
    heading: undefined,
  })),
  ...PAGES.flatMap((page) =>
    page.headings.flatMap((heading) =>
      heading.fields.map(([id, appearance]) => ({ id, appearance, page: page.id, heading })),
    ),
  ),
  ...ENTRY_GROUPS.flatMap((heading) =>
    heading.fields.map(([id, appearance]) => ({ id, appearance, page: 'entry', heading })),
  ),
];

/**
 * The controls a mode value waits on.
 *
 * @param appearance - Appearance
 * @returns The controls, or none for anything but a mode value
 */
function modeControls(appearance: Appearance): ReadonlyArray<FieldId> {
  if (typeof appearance !== 'object' || !('with' in appearance)) return [];
  return typeof appearance.with === 'string' ? [appearance.with] : appearance.with;
}

/**
 * The family a placement belongs to.
 *
 * @param appearance - Appearance
 * @returns The family, or `undefined`
 */
function familyOf(appearance: Appearance): FamilyId | undefined {
  return typeof appearance === 'object' && 'family' in appearance ? appearance.family : undefined;
}

/** Every heading in the registry, entry groups included. */
const HEADINGS: ReadonlyArray<HeadingDef> = [
  ...PAGES.flatMap((page) => page.headings),
  ...ENTRY_GROUPS,
];

describe('the page registry places every built field exactly once', () => {
  it('walks the whole corpus', () => {
    // The denominators, beside the verdicts below. A short walk shows here first: Appendix A
    // places 223 ids, and every one of them is built under some workspace and state.
    console.info(
      `Page registry: ${BUILT.size} ids built over ${STATES.length} corpus states in ` +
        `${WORKSPACES.length} workspaces; ${PLACED.length} placements.`,
    );
    expect(WORKSPACES).toHaveLength(4);
    expect(BUILT.size).toBe(223);
    expect(PLACED).toHaveLength(223);
  });

  it('has no field built but unplaced', () => {
    expect([...BUILT.keys()].filter((id) => placementOf(id) === undefined)).toEqual([]);
  });

  it('places no id twice', () => {
    const counts = new Map<FieldId, number>();
    for (const { id } of PLACED) counts.set(id, (counts.get(id) ?? 0) + 1);
    expect([...counts].filter(([, count]) => count > 1).map(([id]) => id)).toEqual([]);
  });

  it('has no registry id never built', () => {
    expect(PLACED.map(({ id }) => id).filter((id) => !BUILT.has(id))).toEqual([]);
  });

  it('reports each placement where it is', () => {
    for (const { id, page, heading } of PLACED) {
      const at = placementOf(id);
      expect(at?.page, id).toBe(page);
      if (page === 'overview') expect(at?.heading, id).toBe(0);
      else {
        const headings =
          page === 'entry' ? ENTRY_GROUPS : PAGES.find((p) => p.id === page)!.headings;
        expect(headings[at!.heading], id).toBe(heading);
      }
    }
  });

  it('gives each appearance its Appendix A count', () => {
    const kinds = { essential: 0, mode: 0, add: 0, family: 0, buttonRows: 0, chips: 0 };
    for (const { appearance } of PLACED) {
      if (appearance === 'essential') kinds.essential += 1;
      else if (appearance === 'add') kinds.add += 1;
      else if (appearance === 'button-rows') kinds.buttonRows += 1;
      else if ('with' in appearance) kinds.mode += 1;
      else if ('family' in appearance) kinds.family += 1;
      else kinds.chips += 1;
    }
    console.info(`Page registry appearances: ${JSON.stringify(kinds)}`);
    expect(kinds).toEqual({
      essential: 48,
      mode: 19,
      add: 134,
      family: 18,
      buttonRows: 4,
      chips: 0,
    });
  });
});

describe('the page registry is consistent with itself', () => {
  it('orders the pages as D17 A does', () => {
    expect(PAGES.map((page) => page.id)).toEqual([
      'which_events',
      'card_header',
      'day_header',
      'events',
      'size_spacing',
      'grid',
      'weather',
      'taps_refresh',
    ]);
  });

  it('names a mode control on the same page for every mode value', () => {
    const modes = PLACED.filter(({ appearance }) => modeControls(appearance).length > 0);
    expect(modes).toHaveLength(19);
    for (const { id, appearance, page } of modes) {
      for (const control of modeControls(appearance)) {
        expect(PLACED.find((placed) => placed.id === control)?.page, `${id} with ${control}`).toBe(
          page,
        );
      }
    }
  });

  it('keeps a gated mode value waiting on its own mode control', () => {
    const gates: ReadonlyArray<Gate> = [...Object.values(GATES), ...Object.values(ENTRY_GATES)];
    const prerequisites = (gate: Gate): ReadonlyArray<FieldId> =>
      [...gate.requires, ...(gate.anyOf ?? []).flat()].map((prereq) => prereq.field);

    for (const { id, appearance } of PLACED) {
      const gate = gates.find((candidate) => candidate.fields.includes(id));
      const controls = modeControls(appearance);
      if (gate?.kind === 'mode-value') {
        expect(controls.length, `${id} is gated as a mode value`).toBeGreaterThan(0);
      }
      if (gate !== undefined && controls.length > 0) {
        expect(gate.kind, id).toBe('mode-value');
        for (const control of controls) expect(prerequisites(gate), id).toContain(control);
      }
    }
  });

  it('puts every family member under its family heading, and only there', () => {
    const members = new Map<FamilyId, number>();
    for (const { id, appearance, heading } of PLACED) {
      const family = familyOf(appearance);
      if (family === undefined) continue;
      members.set(family, (members.get(family) ?? 0) + 1);
      expect(heading?.key, id).toBe(FAMILIES[family].titleKey);
    }
    // Every family has members, and a family heading holds nothing but them.
    expect([...members.keys()].sort()).toEqual(Object.keys(FAMILIES).sort());
    for (const heading of HEADINGS) {
      const family = (Object.keys(FAMILIES) as FamilyId[]).find(
        (candidate) => FAMILIES[candidate].titleKey === heading.key,
      );
      if (family === undefined) continue;
      expect(heading.fields.map(([, appearance]) => familyOf(appearance))).toEqual(
        heading.fields.map(() => family),
      );
    }
    expect([...members.values()].reduce((sum, count) => sum + count, 0)).toBe(18);
  });

  it('resolves every string it names', () => {
    const keys: string[] = [];
    for (const page of PAGES) {
      keys.push(page.titleKey, ...(page.noteKey ? [page.noteKey] : []));
    }
    for (const heading of HEADINGS) {
      if (heading.key) keys.push(heading.key);
      if (heading.helperKey) keys.push(heading.helperKey);
      keys.push(...Object.values(heading.keyByView ?? {}));
    }
    for (const family of Object.values(FAMILIES)) {
      keys.push(family.titleKey, ...(family.helperKey ? [family.helperKey] : []));
    }
    console.info(`Page registry strings: ${new Set(keys).size} keys.`);
    expect(keys.filter((key) => !(key in EDITOR_STRINGS))).toEqual([]);
  });

  it('cross-links to headings that exist', () => {
    const links = HEADINGS.flatMap((heading) => (heading.crossLink ? [heading.crossLink] : []));
    expect(links).toHaveLength(2);
    for (const link of links) {
      const target = PAGES.find((page) => page.id === link.page);
      expect(
        target?.headings.map((heading) => heading.key),
        link.heading,
      ).toContain(link.heading);
    }
  });

  it('draws each extra once, the own buttons over their own rows', () => {
    const extras = HEADINGS.flatMap((heading) => heading.extras ?? []);
    expect(extras.sort()).toEqual(['own-buttons', 'split', 'weather-calendar-links']);

    const own = HEADINGS.find((heading) => heading.extras?.includes('own-buttons'));
    expect(own?.fields.map(([id]) => id)).toEqual(
      PLACED.filter(({ appearance }) => appearance === 'button-rows').map(({ id }) => id),
    );
  });

  it('shows the Grid page only where its fields are built', () => {
    const grid = PAGES.filter((page) => page.onlyIn !== undefined);
    expect(grid.map((page) => [page.id, page.onlyIn])).toEqual([['grid', 'grid']]);
    for (const [id] of grid[0].headings.flatMap((heading) => heading.fields)) {
      expect([...BUILT.get(id)!.workspaces], id).toEqual(['grid']);
    }
  });

  it('derives which pages apply to the whole card', () => {
    expect(PAGES.filter((page) => isWholeCard(page)).map((page) => page.id)).toEqual([
      'card_header',
      'weather',
    ]);
    expect(isWholeCard({ headings: ENTRY_GROUPS })).toBe(false);
  });
});

describe('no built field is a box-mode select', () => {
  it('leaves Home Assistant a dropdown it names', () => {
    // A box-mode select is the one selector without an accessible name; Card Displays is
    // one today, and it is drawn by the chassis rather than by any of these builders.
    const nodes = [...BUILT.values()].flatMap((built) => built.nodes);
    console.info(`Page registry: ${nodes.length} built nodes checked for box-mode selects.`);
    expect(nodes.length).toBeGreaterThan(BUILT.size);
    expect(
      nodes
        .filter((node) => 'selector' in node && 'select' in node.selector)
        .filter(
          (node) =>
            'selector' in node &&
            (node.selector as { select: { mode?: string } | null }).select?.mode === 'box',
        )
        .map((node) => node.name),
    ).toEqual([]);
  });
});
