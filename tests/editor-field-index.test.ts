/**
 * The field index: ids, labels, lifting and routing.
 *
 * Three claims a page relies on before it draws a single field. Every field has one stable id
 * whatever language the editor speaks. A field keeps the label it has today once it leaves its
 * panel, because the index carries the label path the lifted form loses. And a field lifted
 * into a form of its own writes exactly what it wrote from its panel's form, in every
 * workspace and every corpus state: the lift-equivalence probe of the implementation plan,
 * made permanent, with a control that must differ.
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
  fieldId,
  liftField,
  parseFieldId,
  schemaCtx,
  universeIndex,
} from '../src/rendering/editor/field-index';
import * as Filter from '../src/rendering/editor/filter';
import { corpus } from '../src/rendering/editor/gates';
import type { HaFormSchema, SelectorSchema } from '../src/rendering/editor/ha-form';
import { computeLabel, lookup } from '../src/rendering/editor/localize';
import { PANELS, walkSchema } from '../src/rendering/editor/panels';
import * as Routing from '../src/rendering/editor/routing';
import { buildToolbarButtonSchema } from '../src/rendering/editor/schemas/card';
import { deepEqual, toStoredConfig } from '../src/rendering/editor/value';
import {
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
 * A value different from the one a form shows, by selector.
 *
 * @param node - The field
 * @param current - Its form value
 * @returns A new value
 */
function nextValue(node: SelectorSchema, current: unknown): unknown {
  const selector = node.selector;
  if ('boolean' in selector) return !current;
  if ('number' in selector) return (typeof current === 'number' ? current : 0) + 2;
  if ('select' in selector && selector.select) {
    const values = selector.select.options.map((option) =>
      typeof option === 'object' ? option.value : option,
    );
    return values.find((value) => value !== current) ?? values[0];
  }
  if ('text' in selector) {
    const type = selector.text?.type;
    return type === 'time' ? '08:00' : type === 'date' ? '2026-02-03' : '13px';
  }
  if ('ui_action' in selector) {
    const action = (current as { action?: string } | undefined)?.action;
    return action === 'none' ? { action: 'more-info' } : { action: 'none' };
  }
  if ('entity' in selector) {
    if (selector.entity?.multiple) return [...((current as string[]) ?? []), 'calendar.ben'];
    return current ? '' : 'weather.home';
  }
  if ('icon' in selector) return 'mdi:star';
  return undefined;
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
    let compared = 0;
    let controlCompared = 0;
    let controlDiffer = 0;
    const differ: string[] = [];
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
      for (const panel of PANELS) {
        const built = Filter.withholdInertFields(panel.build(ctx), workspace);
        for (const { node, dataPath } of walkSchema(built)) {
          if (!('selector' in node)) continue;
          const id = fieldId(panel.id, dataPath, node.name);
          let current: unknown = data;
          for (const part of [...dataPath, node.name]) {
            current = (current as Record<string, unknown> | undefined)?.[part];
          }
          const value = nextValue(node, current);
          if (value === undefined) continue;

          const incoming = withValue(data, dataPath, node.name, value);
          const wide = Routing.applyWorkspaceChange(
            config,
            { workspace, schema: built, data },
            incoming,
            {},
          );
          const field = index.get(id)!;
          expect(field.dataPath).toEqual(dataPath);
          const one = Routing.applyWorkspaceChange(
            config,
            { workspace, schema: field.lifted, data },
            incoming,
            {},
          );
          compared += 1;
          if (!same(config, wide, one)) differ.push(`${workspace} ${state.gate ?? 'fresh'} ${id}`);

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
      }
    }

    console.info(
      `Lift: ${compared} field, workspace and state combinations over ${DISTINCT.length} ` +
        `distinct states, ${differ.length} differ; control without the data-path wrapper: ` +
        `${controlDiffer} of ${controlCompared} differ.`,
    );
    expect(differ).toEqual([]);
    expect(compared).toBeGreaterThan(1000);
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
}

describe('the index builds what the editor draws today', () => {
  const host = document.createElement('editor-field-index-probe') as Host;
  host.hass = { states: {}, locale: { language: 'en' } };

  afterAll(() => host.remove());

  /**
   * Field names, data path included, in a set of rendered forms.
   *
   * @param forms - Rendered forms
   * @returns Sorted names
   */
  const drawn = (forms: ReadonlyArray<Form>): string[] =>
    forms
      .flatMap((form) =>
        [...walkSchema(form.schema)]
          .filter(({ node }) => 'selector' in node)
          .map(({ node, dataPath }) => [...dataPath, node.name].join('.')),
      )
      .sort();

  it('for the card and every calendar entry, in every workspace', async () => {
    let compared = 0;
    for (const workspace of WORKSPACES) {
      for (const state of STATES.filter(
        (candidate) =>
          candidate.workspace === workspace &&
          candidate.display === baseViewForWorkspace(workspace),
      )) {
        host.setConfig({ ...state.config, config_version: Config.CURRENT_CONFIG_VERSION });
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

        const at = `${workspace} ${state.gate ?? 'fresh'}`;
        const forms = (selector: string): Form[] => [
          ...host.shadowRoot!.querySelectorAll<Form>(selector),
        ];
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
    }
    console.info(`Index against the editor: ${compared} states drawn and compared.`);
    expect(compared).toBeGreaterThan(WORKSPACES.length * 10);
    // Draws the editor once per corpus state, about half a second alone; the limit is set for a
    // loaded machine rather than for a hang.
  }, 30_000);
});
