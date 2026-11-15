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

import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import { CalendarCardProEditor } from '../src/rendering/editor/element';
import {
  type FieldId,
  type IndexedField,
  buildFieldIndex,
  buttonFieldIndex,
  entityFieldIndex,
  entrySchema,
  fieldHelper,
  fieldId,
  fieldLabel,
  liftField,
  parseFieldId,
  schemaCtx,
  universeIndex,
} from '../src/rendering/editor/field-index';
import * as Filter from '../src/rendering/editor/filter';
import { corpus, freshConfig } from '../src/rendering/editor/gates';
import type { HaFormSchema, SelectorSchema } from '../src/rendering/editor/ha-form';
import { computeLabel, lookup } from '../src/rendering/editor/localize';
import { PANELS, walkSchema } from '../src/rendering/editor/panels';
import * as Routing from '../src/rendering/editor/routing';
import { buildToolbarButtonSchema } from '../src/rendering/editor/schemas/card';
import { deepEqual, toStoredConfig } from '../src/rendering/editor/value';
import {
  type EditorWorkspace,
  WORKSPACES,
  WORKSPACE_FIELD,
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
    expect(EVERY_FIELD.size).toBe(223);
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
    expect(label('weather:weather.date.show_conditions')).toBe('Show Conditions');
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
    expect(keys('layout:height_mode')).toEqual(['height', 'max_height']);
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
    let storedWrites = 0;
    let heldEdits = 0;
    let controlCompared = 0;
    let controlDiffer = 0;
    let unwritten = 0;
    let turn = 0;
    const differ: string[] = [];
    /** Edits that changed the stored configuration, by workspace and field. */
    const stored = new Map<string, number>();
    /** Edits held as pending text and stored nowhere; every field with a rule of its own holds. */
    const held = new Map<string, number>();
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
      const before = toStoredConfig(config, new Set(), authored);
      for (const panel of PANELS) {
        const built = Filter.withholdInertFields(panel.build(ctx), workspace);
        for (const { node, dataPath } of walkSchema(built)) {
          if (!('selector' in node)) continue;
          const id = fieldId(panel.id, dataPath, node.name);
          const key = `${workspace} ${id}`;
          const ruled = 'text' in node.selector && node.name in RULED_TEXT;
          stored.set(key, stored.get(key) ?? 0);
          if (ruled) held.set(key, held.get(key) ?? 0);
          let current: unknown = data;
          for (const part of [...dataPath, node.name]) {
            current = (current as Record<string, unknown> | undefined)?.[part];
          }

          // An edit normalized back to the value it replaced writes nothing from either form, so
          // two no-ops would compare equal however the lift had gone, and text held while it is
          // typed writes nothing either. Each state starts one candidate further on; the first
          // edit that changes the stored configuration is compared, and for a field with a rule
          // of its own the first that is only held as well, each counted apart.
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
            const outcome = !deepEqual(toStoredConfig(wide.config, new Set(), authored), before)
              ? 'stored'
              : deepEqual(wide.pending, {})
                ? 'nothing'
                : 'held';
            if (outcome === 'nothing' || (outcome === 'stored' ? wrote : kept)) continue;
            if (outcome === 'stored') {
              wrote = true;
              storedWrites += 1;
              stored.set(key, stored.get(key)! + 1);
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

            // The control: the node alone, without the grids that carry its data path.
            if (dataPath.length > 0) {
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
    );
    const never = (counts: ReadonlyMap<string, number>): string[] =>
      [...counts].filter(([, count]) => count === 0).map(([key]) => key);
    console.info(
      `Lift: ${storedWrites} stored writes and ${heldEdits} held edits compared over ` +
        `${DISTINCT.length} distinct states; ${stored.size} fields across the workspaces, ` +
        `${never(stored).length} never stored; ${held.size} that hold text, ` +
        `${never(held).length} never held; ${unwritten} field and state pairs with no stored ` +
        `write; ${differ.length} differ. Control without the data-path wrapper: ` +
        `${controlDiffer} of ${controlCompared} differ.`,
    );
    expect([...stored.keys()].sort()).toEqual(universe.sort());
    expect(never(stored)).toEqual([]);
    expect(never(held)).toEqual([]);
    expect(differ).toEqual([]);
    expect(storedWrites).toBeGreaterThan(1000);
    expect(controlDiffer).toBeGreaterThan(0);
    // Tens of thousands of routed writes, about 4 s alone and past Vitest's 5 s default in a full
    // parallel run; the limit is set for a loaded machine rather than for a hang.
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
  host.hass = { states: {}, locale: { language: 'en' } };

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

    const scope = host.shadowRoot!.querySelector<Form>('ha-form.workspace-form')!;
    if (scope.data[WORKSPACE_FIELD] !== workspace) {
      scope.dispatchEvent(
        new CustomEvent('value-changed', {
          detail: { value: { ...scope.data, [WORKSPACE_FIELD]: workspace } },
          bubbles: true,
          composed: true,
        }),
      );
      await host.updateComplete;
    }
    expect(
      host.shadowRoot!.querySelector<Form>('ha-form.workspace-form')!.data[WORKSPACE_FIELD],
    ).toBe(workspace);
  };

  /**
   * The rendered forms matching a selector.
   *
   * @param selector - Form class
   * @returns The forms
   */
  const forms = (selector: string): Form[] => [
    ...host.shadowRoot!.querySelectorAll<Form>(selector),
  ];

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

  it('for the card and every calendar entry, in every workspace', async () => {
    let compared = 0;
    for (const state of DRAWN_STATES) {
      const { workspace } = state;
      await draw(state.config, workspace);

      const at = `${workspace} ${state.gate ?? 'fresh'}`;
      const ctx = schemaCtx(state.config, workspace, 'en');
      const strip = (id: FieldId): string => id.slice(id.indexOf(':') + 1);
      expect(drawn(forms('ha-form.panel-form')), at).toEqual(
        [...buildFieldIndex(ctx).fields.keys()].map(strip).sort(),
      );
      expect(drawn(forms('ha-form.entity-form')), at).toEqual(
        (state.config.entities ?? [])
          .flatMap((entry) => [...entityFieldIndex(entrySchema(entry, ctx)).fields.keys()])
          .map(strip)
          .sort(),
      );
      compared += 1;
    }
    console.info(`Index against the editor: ${compared} states drawn and compared.`);
    expect(compared).toBeGreaterThan(WORKSPACES.length * 10);
    // Draws the editor once per corpus state, about half a second alone; the limit is set for a
    // loaded machine rather than for a hang.
  }, 30_000);

  it('labels and explains every field as the form drawing it does today', async () => {
    /**
     * A form's selector nodes, each with the path `ha-form` hands its label and helper callbacks:
     * an expandable appends its name and a grid passes its own on unchanged. The data path
     * names the field.
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

    // The corpus writes no toolbar buttons, so each workspace draws one more card that has one.
    const withButton = (workspace: EditorWorkspace): Types.Config => {
      const config = freshConfig(baseViewForWorkspace(workspace));
      return {
        ...config,
        toolbar: { ...config.toolbar, show: true, buttons: [{ name: 'Lights' }] },
      };
    };
    const runs = [
      ...DRAWN_STATES.map((state) => ({ workspace: state.workspace, config: state.config })),
      ...WORKSPACES.map((workspace) => ({ workspace, config: withButton(workspace) })),
    ];

    const differ: string[] = [];
    const reached = new Set<string>();
    let pairs = 0;
    let nested = 0;
    let nestedDiffer = 0;
    for (const { workspace, config } of runs) {
      await draw(config, workspace);
      const ctx = schemaCtx(config, workspace, 'en');
      const byKey = (fields: Iterable<IndexedField>) =>
        new Map([...fields].map((field) => [field.id.slice(field.id.indexOf(':') + 1), field]));
      const indexes: ReadonlyArray<readonly [string, ReadonlyMap<string, IndexedField>]> = [
        ['ha-form.panel-form', byKey(buildFieldIndex(ctx).fields.values())],
        [
          'ha-form.entity-form',
          byKey(
            (config.entities ?? []).flatMap((entry) => [
              ...entityFieldIndex(entrySchema(entry, ctx)).fields.values(),
            ]),
          ),
        ],
        [
          'ha-form.button-form',
          byKey(buttonFieldIndex(buildToolbarButtonSchema()).fields.values()),
        ],
      ];

      for (const [selector, index] of indexes) {
        for (const form of forms(selector)) {
          for (const { node, path, key } of asDrawn(form.schema)) {
            const field = index.get(key);
            if (field === undefined) {
              differ.push(`${workspace} ${selector} ${key}: drawn, not indexed`);
              continue;
            }
            reached.add(`${workspace} ${field.id}`);
            pairs += 1;
            const today = {
              label: form.computeLabel(node, form.data, { path }),
              helper: form.computeHelper(node, { path }),
            };
            const indexed = {
              label: fieldLabel(field, ctx.language),
              helper: fieldHelper(field, ctx),
            };
            if (!deepEqual(indexed, today)) {
              differ.push(
                `${workspace} ${field.id}: index ${JSON.stringify(indexed)}, form ${JSON.stringify(today)}`,
              );
            }

            // The control: the same callbacks without the path `ha-form` hands them.
            if (path.length > 0) {
              nested += 1;
              const pathless = {
                label: form.computeLabel(node, form.data, { path: [] }),
                helper: form.computeHelper(node, { path: [] }),
              };
              if (!deepEqual(pathless, today)) nestedDiffer += 1;
            }
          }
        }
      }
    }

    // Every field of every workspace's universe, and each toolbar button field, was reached.
    const expected = WORKSPACES.flatMap((workspace) =>
      [
        ...universeIndex('en', workspace).fields.keys(),
        ...buttonFieldIndex(buildToolbarButtonSchema()).fields.keys(),
      ].map((id) => `${workspace} ${id}`),
    );
    console.info(
      `Labels and helpers against the editor: ${pairs} drawn fields over ${runs.length} ` +
        `configurations, ${reached.size} fields across the workspaces; ${differ.length} differ. ` +
        `Control without the path: ${nestedDiffer} of ${nested} fields under an expandable differ.`,
    );
    expect(differ).toEqual([]);
    expect([...reached].sort()).toEqual(expected.sort());
    expect(nestedDiffer).toBeGreaterThan(0);
    // Draws the editor once per corpus state and calls every form's own callbacks; the limit is
    // set for a loaded machine rather than for a hang.
  }, 30_000);
});
