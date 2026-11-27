/**
 * The field index: ids, labels and helpers, lifting and routing.
 *
 * Three claims a page relies on before it draws a single field. Every field has one stable id
 * whatever language the editor speaks. A field keeps the label and helper it has today once it
 * leaves its panel, because the index carries the label path the lifted form loses; every one
 * is held to what the forms the editor draws today say. And a field lifted into a form of its
 * own writes exactly what it wrote from its panel's form, in every workspace and every corpus
 * state, for an edit that changes something, with a control that must differ.
 */

import { afterAll, describe, expect, it } from 'vitest';

import {
  CARD,
  type Owner,
  button,
  editLayout,
  entry,
  fakeHass,
  formsOf,
  layoutOf,
  openPanels,
} from './helpers/editor-host';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import { CalendarCardProEditor } from '../src/rendering/editor/element';
import { showsHelper, toEntityFormData } from '../src/rendering/editor/entities';
import {
  type FieldId,
  type IndexedField,
  buildFieldIndex,
  buttonFieldIndex,
  entityFieldIndex,
  entrySchema,
  entrySchemaAcross,
  fieldHelper,
  fieldId,
  fieldLabel,
  liftField,
  parseFieldId,
  schemaCtx,
} from '../src/rendering/editor/field-index';
import * as Filter from '../src/rendering/editor/filter';
import { corpus, freshConfig } from '../src/rendering/editor/gates';
import type { HaFormSchema, SelectorSchema } from '../src/rendering/editor/ha-form';
import { computeLabel, lookup } from '../src/rendering/editor/localize';
import { WHOLE_CARD_PAGES, placementOf } from '../src/rendering/editor/pages';
import { PANELS, walkSchema } from '../src/rendering/editor/panels';
import { appearanceOf, leavesKeptOut } from '../src/rendering/editor/plan';
import * as Routing from '../src/rendering/editor/routing';
import { buildToolbarButtonSchema } from '../src/rendering/editor/schemas/card';
import { universeIndex } from '../src/rendering/editor/universe';
import { deepEqual, toStoredConfig } from '../src/rendering/editor/value';
import {
  type EditorWorkspace,
  WORKSPACES,
  baseViewForWorkspace,
} from '../src/rendering/editor/workspace';

const STATES = corpus();

/** One configuration of each workspace's corpus, identical ones once. */
const DISTINCT = WORKSPACES.flatMap((workspace) => {
  const seen = new Set<string>();
  return STATES.filter((state) => {
    if (state.workspace !== workspace) return false;
    const key = JSON.stringify(state.config);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
});

/** Every field of every universe, with the toolbar button's fields. */
const EVERY_FIELD = (() => {
  const fields = new Map<FieldId, IndexedField>();
  for (const workspace of WORKSPACES) {
    for (const [id, field] of universeIndex('en', workspace).fields) {
      if (!fields.has(id)) fields.set(id, field);
    }
  }
  for (const [id, field] of buttonFieldIndex(buildToolbarButtonSchema()).fields) {
    fields.set(id, field);
  }
  return fields;
})();

/**
 * A copy of form data with one value replaced at a data path.
 *
 * @param data - Form data
 * @param path - Enclosing data keys
 * @param name - Field name
 * @param value - New value
 * @returns The new data
 */
function withValue(
  data: Readonly<Record<string, unknown>>,
  path: ReadonlyArray<string>,
  name: string,
  value: unknown,
): Record<string, unknown> {
  if (path.length === 0) return { ...data, [name]: value };
  const [head, ...rest] = path;
  const inner = (data[head] ?? {}) as Record<string, unknown>;
  return { ...data, [head]: withValue(inner, rest, name, value) };
}

/**
 * Text fields that write only what a rule of their own accepts and hold the rest as pending
 * text, with values from both sides of that rule. An offset is written once
 * `synthetic.ts` › `isCommittableOffset` resolves it, as `-3` and `+2` are, and a sign typed on
 * its own is held. A custom today indicator is written when it reads as its own characters or as
 * an image address, and an icon, which belongs to another style, is held. Every other text field
 * writes whatever is typed, `13px` included. A field that never writes in some workspace fails
 * the lift test, so a rule added later cannot pass on held text alone.
 */
const RULED_TEXT: Readonly<Record<string, ReadonlyArray<string>>> = {
  start_date_offset: ['-3', '+2', '-'],
  today_indicator_custom: ['🎂', '/local/today.png', 'mdi:star'],
};

/**
 * The fields that hold text, by workspace, pinned by value: the offset and the custom today
 * indicator, in every workspace. Written out rather than read from `RULED_TEXT`, so a field
 * dropped from that table, or one that stops holding, fails the lift test instead of shrinking
 * what it checks.
 */
const HOLDS: ReadonlyArray<string> = [
  'shared content:start_date_offset',
  'shared day_header:today_indicator_custom',
  'list content:start_date_offset',
  'list day_header:today_indicator_custom',
  'column content:start_date_offset',
  'column day_header:today_indicator_custom',
  'grid content:start_date_offset',
  'grid day_header:today_indicator_custom',
  'month content:start_date_offset',
  // Month draws today on the tile or not at all, so it offers no image for it.
];

/**
 * The values a control can be set to besides the one it shows, read from its own bounds and
 * options: both answers of a switch, every option of a select, every action its dropdown
 * offers, for a number one step either side, its bounds and their midpoint, kept within the
 * bounds, and for text a field's own rule where it has one (`RULED_TEXT`). Normalization can
 * still carry a value back to the current one, which is why a trial counts only once it changes
 * something.
 *
 * @param node - The field
 * @param current - Its form value
 * @returns Distinct values, the current one excluded; none for a selector this does not know
 */
function candidateValues(node: SelectorSchema, current: unknown): unknown[] {
  const selector = node.selector;
  let values: ReadonlyArray<unknown> = [];
  if ('boolean' in selector) {
    values = [true, false];
  } else if ('number' in selector) {
    const { min, max, step } = selector.number ?? {};
    const unit = typeof step === 'number' ? step : 1;
    const at = typeof current === 'number' ? current : (min ?? 0);
    const low = min ?? at - 4 * unit;
    const high = max ?? at + 4 * unit;
    const middle = low + Math.round((high - low) / 2 / unit) * unit;
    values = [at + unit, at - unit, low, high, middle].filter(
      (value) => value >= low && value <= high,
    );
  } else if ('select' in selector && selector.select) {
    values = selector.select.options.map((option) =>
      typeof option === 'object' ? option.value : option,
    );
  } else if ('text' in selector) {
    const type = selector.text?.type;
    values =
      type === 'date'
        ? ['2026-02-03', '2026-03-04']
        : type === 'time'
          ? ['08:00', '09:30']
          : (RULED_TEXT[node.name] ?? ['13px', '14px']);
  } else if ('ui_action' in selector) {
    values = (selector.ui_action?.actions ?? ['none', 'more-info']).map((action) => ({ action }));
  } else if ('entity' in selector) {
    const ids = Array.isArray(current) ? (current as string[]) : [];
    values = selector.entity?.multiple
      ? [[...ids, 'calendar.ben'], ids.slice(1)]
      : ['weather.home', ''];
  } else if ('icon' in selector) {
    values = ['mdi:star', 'mdi:heart'];
  }
  return values.filter(
    (value, index) =>
      !deepEqual(value, current) && values.findIndex((other) => deepEqual(other, value)) === index,
  );
}

/**
 * A workspace's card fields as the editor draws them: a layout's topics in the workspace, Whole
 * Card's pages in the shared scope, whichever workspace the editor reads the overview in.
 *
 * @param own - The workspace's fields
 * @param shared - The shared scope's
 * @returns The fields drawn
 */
function inScope<T>(
  own: ReadonlyMap<FieldId, T>,
  shared: ReadonlyMap<FieldId, T>,
): Map<FieldId, T> {
  return new Map([
    ...[...own].filter(([id]) => !onWholeCardPage(id)),
    ...[...shared].filter(([id]) => onWholeCardPage(id)),
  ]);
}

/**
 * Whether a field sits on one of Whole Card's pages, drawn in the shared scope.
 *
 * @param id - Field id
 * @returns `true` there
 */
function onWholeCardPage(id: FieldId): boolean {
  const page = placementOf(id)?.page;
  return page !== undefined && WHOLE_CARD_PAGES.has(page as never);
}

describe('field ids', () => {
  it('follow the scope, the data path and the name', () => {
    expect(fieldId('events', [], 'show_time')).toBe('events:show_time');
    expect(fieldId('layout', ['time_grid'], 'start_time')).toBe('layout:time_grid.start_time');
    expect(fieldId('weather', ['weather', 'date'], 'color')).toBe('weather:weather.date.color');
    expect(fieldId('calendar', [], 'blocklist')).toBe('calendar:blocklist');
    expect(fieldId('button', [], 'icon')).toBe('button:icon');
    expect(parseFieldId('weather:weather.date.color')).toEqual({
      scope: 'weather',
      dataPath: ['weather', 'date'],
      name: 'color',
    });
    for (const id of EVERY_FIELD.keys()) {
      const { scope, dataPath, name } = parseFieldId(id);
      expect(fieldId(scope, dataPath, name)).toBe(id);
    }
  });

  it('are unique within every build', () => {
    let leaves = 0;
    for (const state of DISTINCT) {
      const ctx = schemaCtx(state.config, state.workspace, 'en');
      const walked: FieldId[] = [];
      for (const panel of PANELS) {
        for (const { node, dataPath } of walkSchema(
          Filter.withholdInertFields(panel.build(ctx), state.workspace),
        )) {
          if ('selector' in node) walked.push(fieldId(panel.id, dataPath, node.name));
        }
      }
      for (const entry of state.config.entities ?? []) {
        for (const { node, dataPath } of walkSchema(entrySchema(entry, ctx))) {
          if ('selector' in node) walked.push(fieldId('calendar', dataPath, node.name));
        }
      }
      leaves += walked.length;
      expect(new Set(walked).size, `${state.workspace} ${state.gate ?? 'fresh'}`).toBe(
        walked.length,
      );
      // The index holds exactly what the panels build: no leaf lost to a colliding id.
      const indexed = [
        ...buildFieldIndex(ctx).fields.keys(),
        ...(state.config.entities ?? []).flatMap((entry) => [
          ...entityFieldIndex(entrySchema(entry, ctx)).fields.keys(),
        ]),
      ];
      expect(indexed.sort()).toEqual([...walked].sort());
    }
    console.info(
      `Field ids: ${leaves} leaves over ${DISTINCT.length} distinct corpus states, ` +
        `${EVERY_FIELD.size} ids in all.`,
    );
    // 223 without Month or the name on List's month separator, Arrow & Chip Size and a calendar's
    // Private among them.
    // Month adds its own eight: its two narrow card heights, Minimum Day Width, its two shadings,
    // the two font sizes of its days, and Layouts in Switcher. List's month separator adds three:
    // Month Name on Rule, its color and its size. A calendar's start hours add two: Starts At or
    // After and Starts Before. Then the events area's own height pair and When Too Narrow,
    // Full-Size Overlay's Layout, and the toolbar's Open Full Size. Then Month's First Week and
    // Weeks Shown. Then List's On a Line of Its Own, and its Compact Height and Compact Maximum
    // Height. Then Full-Size Settings' Days To Show and Show Toolbar. Then a calendar's Image Size.
    // Then the full-size card's toolbar: its seven controls, its Layouts in Switcher and its Arrow &
    // Chip Size. Then Grid's Calendar Lanes and Minimum Lane Width, and a calendar's Lane. Then
    // List's When Lanes Don't Fit. Then a calendar's Hidden by Default. Then Show Time Left, and a
    // calendar's five countdown settings: Countdowns, what they do, and Time Left.
    expect(EVERY_FIELD.size).toBe(269);
  });

  it('do not depend on the editor language', () => {
    let relabeled = 0;
    for (const state of DISTINCT) {
      const english = buildFieldIndex(schemaCtx(state.config, state.workspace, 'en')).fields;
      const german = buildFieldIndex(schemaCtx(state.config, state.workspace, 'de')).fields;
      expect([...german.keys()]).toEqual([...english.keys()]);
      for (const [id, field] of german) {
        if (!deepEqual(field.node, english.get(id)!.node)) relabeled += 1;
      }
    }
    // The control: the German build is a German one, with option labels of its own.
    console.info(`Field ids: ${relabeled} German nodes differ from their English twins.`);
    expect(relabeled).toBeGreaterThan(0);
  });
});

describe('labels', () => {
  /**
   * The string key a label resolves through, as `localize.ts` › `computeLabel` tries it.
   *
   * @param node - The field
   * @param path - Label path
   * @returns Whether either candidate has a string
   */
  const hasString = (node: SelectorSchema, path: ReadonlyArray<string>): boolean =>
    lookup('en', node.titleKey ?? [...path, node.name].join('.')) !== undefined ||
    lookup('en', node.name) !== undefined;

  it('resolve for every field through its own label path', () => {
    const humanized = [...EVERY_FIELD.values()]
      .filter((field) => !hasString(field.node, field.labelPath))
      .map((field) => field.id);
    expect(humanized).toEqual([]);
  });

  it('read as they do today', () => {
    const label = (id: FieldId): string => {
      const field = EVERY_FIELD.get(id)!;
      return computeLabel('en', field.node, field.labelPath);
    };
    expect(label('events:show_time')).toBe('Show Time');
    expect(label('layout:time_grid.start_time')).toBe('First Hour');
    expect(label('day_header:column.day_header_gap')).toBe('Day Header Gap');
    expect(label('weather:weather.date.show_conditions')).toBe('Show Conditions Beside Days');
    expect(label('content:compact_events_to_show')).toBe('Events');
    expect(label('calendar:show_time')).toBe('Event Times');
    expect(label('calendar:split_multiday_events')).toBe('Split Across Days');
    expect(label('button:icon')).toBe('Icon');
  });

  it('need the bound path: labeled as its lifted form alone, a field can read differently', () => {
    // Home Assistant grows a label path only under an expandable, and a lifted field sits under
    // named grids, so its form hands `computeLabel` no path at all.
    const differ = [...EVERY_FIELD.values()].filter(
      (field) =>
        computeLabel('en', field.node, []) !== computeLabel('en', field.node, field.labelPath),
    );
    console.info(`Labels: ${differ.length} fields read differently without their label path.`);
    expect(differ.length).toBeGreaterThan(0);
  });
});

describe('indexed fields', () => {
  it('know the keys they write', () => {
    const keys = (id: FieldId) => EVERY_FIELD.get(id)!.configKeys;
    expect(keys('content:start_date_mode')).toEqual(['start_date']);
    expect(keys('layout:height_mode')).toEqual(['card_height', 'card_max_height']);
    expect(keys('events:countdown_once_per_day')).toEqual(['show_countdown']);
    expect(keys('layout:time_grid.start_time')).toEqual(['start_time']);
    expect(keys('card:toolbar.show')).toEqual(['show']);
    expect(keys('calendar:label_type')).toEqual(['label_type', 'label']);
    expect(keys('calendar:accent_color_mode')).toEqual(['accent_color']);
    expect(keys('button:icon')).toEqual(['icon']);
  });

  it('lift into named grids for their data path', () => {
    const nested = EVERY_FIELD.get('weather:weather.date.color')!;
    expect(nested.lifted).toEqual([
      {
        type: 'grid',
        name: 'weather',
        column_min_width: '100%',
        schema: [{ type: 'grid', name: 'date', column_min_width: '100%', schema: [nested.node] }],
      },
    ]);
    const top = EVERY_FIELD.get('events:show_time')!;
    expect(top.lifted).toEqual([top.node]);
  });

  it('keep one lifted schema while the node stays the same shape', () => {
    const field = EVERY_FIELD.get('layout:time_grid.start_time')!;
    const lifted = liftField(field.id, structuredClone(field.node), [...field.dataPath]);
    expect(lifted).toBe(liftField(field.id, field.node, field.dataPath));
    expect(liftField(field.id, { ...field.node, required: true }, field.dataPath)).not.toBe(lifted);

    // Card & Header builds fresh leaves on every call, so two genuine builds hand over two
    // different nodes for the title, and one lifted schema.
    const config = STATES[0].config;
    const first = buildFieldIndex(schemaCtx(config, 'shared', 'en')).fields.get('card:title')!;
    const second = buildFieldIndex(schemaCtx({ ...config }, 'shared', 'en')).fields.get(
      'card:title',
    )!;
    expect(second.node).not.toBe(first.node);
    expect(second.lifted).toBe(first.lifted);
  });

  it('come from one build per set of builder inputs', () => {
    const ctx = schemaCtx(STATES[0].config, 'list', 'en');
    expect(buildFieldIndex({ ...ctx })).toBe(buildFieldIndex(ctx));
    expect(buildFieldIndex({ ...ctx, language: 'de' })).not.toBe(buildFieldIndex(ctx));
  });
});

describe('a lifted field routes as it does from its panel', () => {
  it('writes the same from its one-field form in every workspace and corpus state', () => {
    let writes = 0;
    let heldEdits = 0;
    let controlCompared = 0;
    let controlDiffer = 0;
    let unwritten = 0;
    let serialized = 0;
    let turn = 0;
    const differ: string[] = [];
    /** Edits that changed the configuration, by workspace and field. */
    const written = new Map<string, number>();
    /** Fields shown to change what is stored, by workspace. */
    const stores = new Set<string>();
    /** Edits held as pending text and written nowhere, by workspace and field. */
    const held = new Map<string, number>();
    /** Nested fields whose control has run, by workspace. */
    const controlled = new Set<string>();
    const same = (
      config: Types.Config,
      a: ReturnType<typeof Routing.applyWorkspaceChange>,
      b: ReturnType<typeof Routing.applyWorkspaceChange>,
    ): boolean => {
      const authored = config as unknown as Record<string, unknown>;
      return (
        deepEqual(a.pending, b.pending) &&
        (deepEqual(a.config, b.config) ||
          deepEqual(
            toStoredConfig(a.config, new Set(), authored),
            toStoredConfig(b.config, new Set(), authored),
          ))
      );
    };

    for (const state of DISTINCT) {
      const { config, workspace } = state;
      const ctx = schemaCtx(config, workspace, 'en');
      const index = buildFieldIndex(ctx).fields;
      const data = Routing.workspaceFormData(config, workspace, {});
      const authored = config as unknown as Record<string, unknown>;
      let before: Record<string, unknown> | undefined;
      for (const panel of PANELS) {
        const built = Filter.withholdInertFields(panel.build(ctx), workspace);
        for (const { node, dataPath } of walkSchema(built)) {
          if (!('selector' in node)) continue;
          const id = fieldId(panel.id, dataPath, node.name);
          const key = `${workspace} ${id}`;
          const ruled = 'text' in node.selector && node.name in RULED_TEXT;
          written.set(key, written.get(key) ?? 0);
          if (ruled) held.set(key, held.get(key) ?? 0);
          let current: unknown = data;
          for (const part of [...dataPath, node.name]) {
            current = (current as Record<string, unknown> | undefined)?.[part];
          }

          // An edit normalized back to the value it replaced writes nothing from either form, so
          // two no-ops would compare equal however the lift had gone, and text held while it is
          // typed writes nothing either. Each state starts one candidate further on; the first
          // edit that changes the configuration is compared, and for a field with a rule of its
          // own the first that is only held as well, each counted apart. Both results start from
          // the same configuration and share every part an edit did not reach, so comparing
          // them stops at each shared part.
          const candidates = candidateValues(node, current);
          const start = candidates.length > 0 ? turn++ % candidates.length : 0;
          let wrote = false;
          let kept = false;
          for (let step = 0; step < candidates.length && !(wrote && (kept || !ruled)); step += 1) {
            const value = candidates[(start + step) % candidates.length];
            const incoming = withValue(data, dataPath, node.name, value);
            const wide = Routing.applyWorkspaceChange(
              config,
              { workspace, schema: built, data },
              incoming,
              {},
            );
            const outcome = !deepEqual(wide.config, config)
              ? 'written'
              : deepEqual(wide.pending, {})
                ? 'nothing'
                : 'held';
            if (outcome === 'nothing' || (outcome === 'written' ? wrote : kept)) continue;
            if (outcome === 'written') {
              wrote = true;
              writes += 1;
              written.set(key, written.get(key)! + 1);
              // That some write of the field changes what is stored, as YAML would hold it, is
              // checked exactly, by serializing both, until one does in this workspace.
              if (!stores.has(key)) {
                before ??= toStoredConfig(config, new Set(), authored);
                serialized += 1;
                const after = toStoredConfig(wide.config, new Set(), authored);
                if (!deepEqual(after, before)) stores.add(key);
              }
            } else {
              kept = true;
              heldEdits += 1;
              held.set(key, (held.get(key) ?? 0) + 1);
            }

            const field = index.get(id)!;
            expect(field.dataPath).toEqual(dataPath);
            const one = Routing.applyWorkspaceChange(
              config,
              { workspace, schema: field.lifted, data },
              incoming,
              {},
            );
            if (!same(config, wide, one)) {
              differ.push(`${workspace} ${state.gate ?? 'fresh'} ${id} = ${JSON.stringify(value)}`);
            }

            // The control, once per nested field and workspace: the node alone, without the grids
            // that carry its data path, which must write somewhere else.
            if (dataPath.length > 0 && !controlled.has(key)) {
              controlled.add(key);
              const bare = Routing.applyWorkspaceChange(
                config,
                { workspace, schema: [node], data },
                incoming,
                {},
              );
              controlCompared += 1;
              if (!same(config, wide, bare)) controlDiffer += 1;
            }
          }
          if (!wrote) unwritten += 1;
        }
      }
    }

    // Every card field of every workspace's universe, and nothing else, was tried there.
    const universe = WORKSPACES.flatMap((workspace) =>
      [...universeIndex('en', workspace).fields.keys()]
        .filter((id) => parseFieldId(id).scope !== 'calendar')
        .map((id) => `${workspace} ${id}`),
    ).sort();
    const never = (counts: ReadonlyMap<string, number>): string[] =>
      [...counts].filter(([, count]) => count === 0).map(([key]) => key);
    console.info(
      `Lift: ${writes} writes and ${heldEdits} held edits compared over ${DISTINCT.length} ` +
        `distinct states; ${written.size} fields across the workspaces, each tried in every ` +
        `state that builds it, ${never(written).length} never written, ` +
        `${universe.length - universe.filter((key) => stores.has(key)).length} never stored ` +
        `(${serialized} serialized); ${held.size} that hold text, ${never(held).length} never ` +
        `held; ${unwritten} field and state pairs with no write; ${differ.length} differ. ` +
        `Control without the data-path wrapper: ${controlDiffer} of ${controlCompared} differ.`,
    );
    expect([...written.keys()].sort()).toEqual(universe);
    expect(universe.filter((key) => !stores.has(key))).toEqual([]);
    expect([...held.keys()].sort()).toEqual([...HOLDS].sort());
    expect(never(held)).toEqual([]);
    expect(differ).toEqual([]);
    expect(writes).toBeGreaterThan(1000);
    expect(controlDiffer).toBeGreaterThan(0);
    // Tens of thousands of routed writes, a few seconds alone; the limit is set for a loaded
    // machine rather than for a hang.
  }, 60_000);
});

customElements.define('editor-field-index-probe', CalendarCardProEditor);

interface Host extends HTMLElement {
  hass: unknown;
  setConfig(config: unknown): void;
  readonly updateComplete: Promise<unknown>;
}

interface Form extends HTMLElement {
  schema: ReadonlyArray<HaFormSchema>;
  data: Record<string, unknown>;
  computeLabel: (schema: HaFormSchema, data?: unknown, options?: { path?: string[] }) => string;
  computeHelper: (schema: HaFormSchema, options?: { path?: string[] }) => string | undefined;
}

describe('the index builds what the editor draws today', () => {
  const host = document.createElement('editor-field-index-probe') as Host;
  host.hass = fakeHass();

  afterAll(() => host.remove());

  /** Each workspace's corpus states that display the layout it is built as. */
  const DRAWN_STATES = WORKSPACES.flatMap((workspace) =>
    STATES.filter(
      (state) => state.workspace === workspace && state.display === baseViewForWorkspace(workspace),
    ),
  );

  /**
   * Draws a configuration and chooses the workspace as a user would.
   *
   * @param config - Configuration
   * @param workspace - Workspace to edit it in
   */
  const draw = async (config: Types.Config, workspace: EditorWorkspace): Promise<void> => {
    host.setConfig({ ...config, config_version: Config.CURRENT_CONFIG_VERSION });
    if (!host.isConnected) document.body.appendChild(host);
    await host.updateComplete;

    await editLayout(host, workspace);
    expect(layoutOf(host)).toBe(workspace);
    // A closed panel mounts no form, so every panel is opened before the forms are read.
    await openPanels(host);
  };

  /**
   * The rendered forms an owner draws.
   *
   * @param owner - Whose forms
   * @returns The forms
   */
  const forms = (owner: Owner): Form[] => formsOf(host, owner) as Form[];

  /**
   * Field names, data path included, in a set of rendered forms.
   *
   * @param drawnForms - Rendered forms
   * @returns Sorted names
   */
  const drawn = (drawnForms: ReadonlyArray<Form>): string[] =>
    drawnForms
      .flatMap((form) =>
        [...walkSchema(form.schema)]
          .filter(({ node }) => 'selector' in node)
          .map(({ node, dataPath }) => [...dataPath, node.name].join('.')),
      )
      .sort();

  /**
   * A form's selector nodes, each with the path `ha-form` hands its label and helper callbacks:
   * an expandable appends its name and a grid passes its own on unchanged. The data path names
   * the field.
   *
   * @param schema - The form's schema
   * @param path - Label path so far
   * @param dataPath - Data path so far
   * @yields Each node with its two paths
   */
  function* asDrawn(
    schema: ReadonlyArray<HaFormSchema>,
    path: ReadonlyArray<string> = [],
    dataPath: ReadonlyArray<string> = [],
  ): Generator<{ node: SelectorSchema; path: string[]; key: string }> {
    for (const node of schema) {
      if ('selector' in node) {
        yield { node, path: [...path], key: [...dataPath, node.name].join('.') };
      }
      if ('schema' in node) {
        yield* asDrawn(
          node.schema,
          node.type === 'expandable' ? [...path, node.name] : path,
          node.name !== '' && node.flatten !== true ? [...dataPath, node.name] : dataPath,
        );
      }
    }
  }

  /**
   * A field's id without its scope, as a rendered form's data path and name spell it.
   *
   * @param id - Field id
   * @returns The id after its colon
   */
  const strip = (id: FieldId): string => id.slice(id.indexOf(':') + 1);

  // The corpus writes no toolbar buttons, so each workspace draws one more card that has one.
  const withButton = (workspace: EditorWorkspace): Types.Config => {
    const config = freshConfig(baseViewForWorkspace(workspace));
    return {
      ...config,
      toolbar: { ...config.toolbar, show: true, buttons: [{ name: 'Lights' }] },
    };
  };
  const RUNS = [
    ...DRAWN_STATES.map((state) => ({ workspace: state.workspace, config: state.config, state })),
    ...WORKSPACES.map((workspace) => ({
      workspace,
      config: withButton(workspace),
      state: undefined,
    })),
  ];

  /** What the drawn editor showed, against the index: names per state, labels per field. */
  interface Observed {
    readonly names: ReadonlyArray<{
      at: string;
      drawn: { panel: string[]; entity: string[] };
      indexed: { panel: string[]; entity: string[] };
    }>;
    readonly labels: {
      differ: string[];
      reached: Set<string>;
      drawnFields: number;
      compared: number;
      nested: number;
      nestedDiffer: number;
    };
  }

  /**
   * Draws every configuration once, for both checks below, and compares what it draws with the
   * index: the field names in each corpus state, and each field's label and helper as the form
   * drawing it resolves them, through that form's own `computeLabel` and `computeHelper`.
   *
   * A label and a helper depend on the node, the path `ha-form` hands over, the editor's language
   * and the workspace's layout, and a panel form's helper on where the value comes from as well.
   * A combination already compared would compare the same again, so it is compared once. The
   * form's callbacks and the index's resolvers are each called in one batch per drawing, because
   * the two read different copies of the configuration and a cache of one entry sits under both.
   *
   * @returns The observations
   */
  async function observe(): Promise<Observed> {
    const names: Array<Observed['names'][number]> = [];
    const labels: Observed['labels'] = {
      differ: [],
      reached: new Set(),
      drawnFields: 0,
      compared: 0,
      nested: 0,
      nestedDiffer: 0,
    };
    /** What the forms' own callbacks gave, by everything they read. */
    const resolved = new Map<string, { label: string; helper: string | undefined }>();
    /** Comparisons made, by everything either side reads. */
    const compared = new Set<string>();

    for (const { workspace, config, state } of RUNS) {
      await draw(config, workspace);
      const ctx = schemaCtx(config, workspace, 'en');
      const sharedCtx = schemaCtx(config, 'shared', 'en');
      // All the builders build, but a kept setting the card does not hold (`leavesKeptOut`).
      const card = new Map(
        [...inScope(buildFieldIndex(ctx).fields, buildFieldIndex(sharedCtx).fields)].filter(
          ([id]) => !leavesKeptOut(id, config as unknown as Record<string, unknown>, workspace),
        ),
      );
      // A calendar's page is built for the card's layouts and the one being edited.
      const entries = new Map(
        (config.entities ?? []).flatMap((entry) => [
          ...entityFieldIndex(entrySchemaAcross(entry, ctx).schema).fields,
        ]),
      );
      if (state) {
        names.push({
          at: `${workspace} ${state.gate ?? 'fresh'}`,
          drawn: {
            panel: drawn(forms(CARD)),
            entity: drawn(forms(entry())),
          },
          indexed: {
            panel: [...card.keys()].map(strip).sort(),
            entity: [...entries.keys()].map(strip).sort(),
          },
        });
      }

      const fresh: Array<{
        form: Form;
        node: SelectorSchema;
        path: string[];
        field: IndexedField;
        reads: string;
      }> = [];
      const indexes: ReadonlyArray<readonly [string, Owner, Iterable<IndexedField>]> = [
        ['ha-form.field-form', CARD, card.values()],
        ['ha-form.entity-form', entry(), entries.values()],
        [
          'ha-form.button-form',
          button(),
          buttonFieldIndex(buildToolbarButtonSchema()).fields.values(),
        ],
      ];
      for (const [selector, owner, fields] of indexes) {
        const byKey = new Map([...fields].map((field) => [strip(field.id), field]));
        for (const form of forms(owner)) {
          for (const { node, path, key } of asDrawn(form.schema)) {
            labels.drawnFields += 1;
            const field = byKey.get(key);
            if (field === undefined) {
              labels.differ.push(`${workspace} ${selector} ${key}: drawn, not indexed`);
              continue;
            }
            labels.reached.add(`${workspace} ${field.id}`);
            const source =
              selector === 'ha-form.field-form'
                ? Routing.valueSource(config, workspace, node.name)
                : undefined;
            // What the form's callbacks read: the node drawn, the path `ha-form` hands over, the
            // language and the workspace's layout, and for a card field's helper where the value
            // comes from. A card field's form is its own, its callbacks bound to the label path
            // the field had in its panel, so two fields of one name read apart by where they sit.
            // What the index reads besides: its own node and label path for the field.
            const reads = [workspace, selector, ctx.language, path.join('.'), source, key].join(
              ' ',
            );
            const both = [
              reads,
              JSON.stringify(node),
              field.id,
              field.labelPath.join('.'),
              JSON.stringify(field.node),
            ].join(' ');
            if (compared.has(both)) continue;
            compared.add(both);
            fresh.push({ form, node, path, field, reads: `${reads} ${JSON.stringify(node)}` });
          }
        }
      }

      // The forms' callbacks are the expensive half, so each combination they read is resolved
      // once; the index's resolvers run for every combination either side reads.
      for (const { form, node, path, field, reads } of fresh) {
        if (resolved.has(reads)) continue;
        const answer = {
          label: form.computeLabel(node, form.data, { path }),
          // A setting under a head row keeps its helper behind ⓘ, its form drawing none.
          helper:
            form.computeHelper(node, { path }) ??
            ((form as unknown as Element).closest?.('.setting') ?? null)
              ?.querySelector(':scope > .setting-help')
              ?.textContent?.trim(),
        };
        resolved.set(reads, answer);
        // The control: a field's form binds the label path it had in its panel, which `ha-form`
        // no longer hands over; without it, a nested field's label reads otherwise.
        if (field.labelPath.length > 0) {
          labels.nested += 1;
          if (computeLabel(ctx.language, node, []) !== answer.label) labels.nestedDiffer += 1;
        }
      }
      // A calendar's field whose helper speaks of one value shows it only while the setting it
      // speaks of holds it, read from the calendar's whole form data: the corpus has one.
      const calendarData = toEntityFormData(config.entities?.[0] ?? '', config.entities ?? []);
      const indexed = fresh.map(({ field }) => ({
        label: fieldLabel(field, ctx.language),
        helper:
          !field.id.startsWith('calendar:') || showsHelper(field.node.name, calendarData)
            ? fieldHelper(field, onWholeCardPage(field.id) ? sharedCtx : ctx)
            : undefined,
      }));
      fresh.forEach(({ field, reads }, at) => {
        const today = resolved.get(reads)!;
        labels.compared += 1;
        if (!sameButWords(indexed[at], today)) {
          labels.differ.push(
            `${workspace} ${field.id}: index ${JSON.stringify(indexed[at])}, form ` +
              JSON.stringify(today),
          );
        }
      });
    }
    return { names, labels };
  }

  /**
   * Whether a form words a field as the index does, but for the state words a page adds where
   * the field's value comes from (`shown.ts` › `wordsPlace`): after the label as " · Set for
   * Grid", or before the helper as "Set for Grid.".
   *
   * @param index - The index's label and helper
   * @param form - The form's
   * @returns `true` when they agree
   */
  function sameButWords(
    index: { label: string; helper: string | undefined },
    form: { label: string; helper: string | undefined },
  ): boolean {
    const label =
      form.label === index.label ||
      (form.label.startsWith(`${index.label} · `) && form.helper === index.helper);
    const helper =
      form.helper === index.helper ||
      (form.label === index.label &&
        form.helper !== undefined &&
        (index.helper === undefined
          ? /^[^.]+\.$/.test(form.helper)
          : form.helper.endsWith(`. ${index.helper}`)));
    return label && helper;
  }

  let observation: Promise<Observed> | undefined;
  /**
   * The observations, made on first use and shared by both checks.
   *
   * @returns The observations
   */
  const observed = (): Promise<Observed> => (observation ??= observe());

  it('for the card and every calendar entry, in every workspace', async () => {
    const { names } = await observed();
    for (const { at, drawn: shown, indexed } of names) {
      expect(shown.panel, at).toEqual(indexed.panel);
      expect(shown.entity, at).toEqual(indexed.entity);
    }
    console.info(`Index against the editor: ${names.length} states drawn and compared.`);
    expect(names.length).toBeGreaterThan(WORKSPACES.length * 10);
    // Draws the editor once per corpus state for this check and the next, working out each live
    // field's Reset outcome and its Reset or Remove, over five workspaces since Month. The limit is
    // set for CI's slower runner under load rather than for a hang: the walk measured 64 s on CI
    // with four workspaces, and with five ran past 90 s on a slower run (90 s timed out here, and
    // the check below, awaiting the same walk, finished 20 s later).
  }, 180_000);

  it('labels and explains every field as the form drawing it does today', async () => {
    const { labels } = await observed();

    // Every field of every workspace's universe, and each toolbar button field, was reached:
    // Whole Card's pages draw theirs in the shared scope whatever the workspace.
    // A kept setting is drawn only where a run holds it, so it is not expected everywhere.
    const expected = WORKSPACES.flatMap((workspace) =>
      [
        ...[
          ...inScope(
            universeIndex('en', workspace).fields,
            universeIndex('en', 'shared').fields,
          ).keys(),
        ].filter((id) => appearanceOf(id) !== 'kept'),
        ...buttonFieldIndex(buildToolbarButtonSchema()).fields.keys(),
      ].map((id) => `${workspace} ${id}`),
    );
    console.info(
      `Labels and helpers against the editor: ${labels.drawnFields} drawn fields over ` +
        `${RUNS.length} configurations, ${labels.compared} distinct ones compared, ` +
        `${labels.reached.size} fields across the workspaces; ${labels.differ.length} differ. ` +
        `Control without the path: ${labels.nestedDiffer} of ${labels.nested} fields under an ` +
        `expandable differ.`,
    );
    expect(labels.differ).toEqual([]);
    expect(expected.filter((each) => !labels.reached.has(each)).sort()).toEqual([]);
    // Beyond them only calendar fields another layout builds: a calendar's page is built for the
    // card's layouts, whichever is being edited (`field-index.ts` › `entryViews`).
    const beyond = [...labels.reached].filter((each) => !expected.includes(each));
    expect(
      beyond.filter((each) => {
        const id = each.slice(each.indexOf(' ') + 1) as FieldId;
        // A kept setting is drawn where a run holds it, and is reached there.
        if (appearanceOf(id) === 'kept') return false;
        return (
          !id.startsWith('calendar:') ||
          !WORKSPACES.some((workspace) => universeIndex('en', workspace).fields.has(id))
        );
      }),
    ).toEqual([]);
    expect(beyond.length).toBeGreaterThan(0);
    expect(labels.nestedDiffer).toBeGreaterThan(0);
    // Reads what the check above drew, or draws it where run alone; the limit is the check
    // above's.
  }, 180_000);
});
