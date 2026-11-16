/**
 * One option, one control: no configuration option has two writers among the forms one build
 * draws.
 *
 * Two fields that write one option are two controls for it, and changing one leaves the other
 * showing a value the card no longer holds. The editor tests' lookup helpers used to catch that
 * by accident: each found a form by an option's name and asserted that exactly one form drew
 * it. Fields are looked up by id now (`tests/helpers/editor-host.ts`), which needs no such
 * guard, so this file states the property once, for every option and every form that writes
 * the card's configuration, in the builds the editor draws them in together:
 *
 * - The panels, the display control above them and every calendar block's form, built in
 *   every workspace from every configuration of the gate corpus (`gates.ts` › `corpus`). A
 *   panel field writes its `configKeys` (`field-index.ts` › `buildFieldIndex`) where
 *   `routing.ts` stores them: at its data path when it is nested, and otherwise under the view
 *   block `destination` names for the workspace, or at the root. Two fields share an option
 *   only where their writes are stored at the same path. The display control's fields are
 *   routed as a panel's are, and a block's fields write under the block's place in `entities`
 *   (`entityFieldIndex`).
 * - A toolbar button's form, which writes under the button's place in `toolbar.buttons`. Every
 *   button draws the same form and the corpus opens none, so it is swept on its own.
 * - Each step of Quick Setup, which takes the place of everything else while it is open. What
 *   an answer writes is decided inside the editor, so the editor is asked: each field is
 *   changed alone, from the step's first answers and again from every answer changed, and the
 *   options its preview changes are the options it writes.
 *
 * Two forms write no configuration and are left out: the workspace control, which chooses the
 * layout whose settings the panels show, and the filter bar, whose search and Customized Only
 * decide what the editor shows and whose Essentials Only is a preference this browser keeps.
 *
 * Some settings are drawn as two controls on purpose: a mode and the value it calls for, a
 * switch that refines the setting beside it, a switch that writes several text colors beside
 * each of them, and a calendar's label and accent, each drawn as a type and its value.
 * `SHARED` pins every combination of writers a build draws, by value, so a new combination
 * fails until someone decides it belongs, and so does one no build draws any more. Two plain
 * fields never belong, pinned or not.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CHASSIS,
  changeField,
  changeFields,
  fakeHass,
  formsOf,
  lastConfig,
  mountEditor,
  valueOf,
} from './helpers/editor-host';
import * as Config from '../src/config/config';
import * as ViewConfig from '../src/config/view';
import {
  type FieldId,
  type IndexedField,
  buildFieldIndex,
  buttonFieldIndex,
  entityFieldIndex,
  entrySchema,
  fieldId,
  parseFieldId,
  schemaCtx,
} from '../src/rendering/editor/field-index';
import { corpus } from '../src/rendering/editor/gates';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import { walkSchema } from '../src/rendering/editor/panels';
import { destination } from '../src/rendering/editor/routing';
import { buildToolbarButtonSchema } from '../src/rendering/editor/schemas/card';
import { chassisSchemas } from '../src/rendering/editor/subforms';
import { configKeysForField } from '../src/rendering/editor/synthetic';
import { deepEqual } from '../src/rendering/editor/value';
import { type EditorWorkspace, WORKSPACES } from '../src/rendering/editor/workspace';
import * as Helpers from '../src/utils/helpers';

/** Every combination of writers one build draws for an option that has more than one. */
const SHARED: Readonly<Record<string, ReadonlyArray<ReadonlyArray<FieldId>>>> = {
  // A mode and the value it calls for.
  accent_color: [['events:accent_color', 'events:accent_color_mode']],
  allday_badge_color: [['events:allday_badge_color', 'events:allday_badge_color_mode']],
  height: [['layout:card_height', 'layout:height_mode']],
  max_height: [['layout:card_max_height', 'layout:height_mode']],
  remove_location_country: [['events:location_country_mode', 'events:location_country_pattern']],
  start_date: [
    ['content:start_date_fixed', 'content:start_date_mode'],
    ['content:start_date_mode', 'content:start_date_offset'],
  ],
  today_indicator: [
    ['day_header:today_indicator_custom', 'day_header:today_indicator_style'],
    ['day_header:today_indicator_icon', 'day_header:today_indicator_style'],
  ],
  // The overview's shortcut over the event's tap: on, it stores the details action.
  event_tap_action: [['actions:event_opens_details', 'actions:event_tap_action']],
  // A switch that refines the setting beside it: on, it stores `once_per_day`.
  show_countdown: [['events:countdown_once_per_day', 'events:show_countdown']],
  // A switch that writes several text colors at once, beside each of them.
  description_color: [['events:accent_event_text', 'events:description_color']],
  event_color: [['events:accent_event_text', 'events:event_color']],
  location_color: [['events:accent_event_text', 'events:location_color']],
  progress_bar_color: [['events:accent_event_text', 'events:progress_bar_color']],
  time_color: [['events:accent_event_text', 'events:time_color']],
  // A calendar's accent and its label, each drawn as a type and its value; the label's icon or
  // picture source decides the label too.
  'entities[].accent_color': [['calendar:accent_color', 'calendar:accent_color_mode']],
  'entities[].label': [
    ['calendar:label', 'calendar:label_icon_source', 'calendar:label_type'],
    ['calendar:label', 'calendar:label_image_source', 'calendar:label_type'],
    ['calendar:label', 'calendar:label_type'],
  ],
  'entities[].label_type': [
    ['calendar:label', 'calendar:label_icon_source', 'calendar:label_type'],
    ['calendar:label', 'calendar:label_image_source', 'calendar:label_type'],
    ['calendar:label', 'calendar:label_type'],
  ],
};

/** A field one build draws, with the options it writes. */
interface Writer {
  readonly id: FieldId;
  /**
   * Where its writes are stored: a view block's key or a list item's place first where the
   * write lands there (`time_grid.event_font_size`, `entities[0].label`).
   */
  readonly options: ReadonlyArray<string>;
  /** It writes the option of its own name and nothing else, wherever that is stored. */
  readonly plain: boolean;
}

/**
 * Joins an option's path: a block's or a list item's place, then the key.
 *
 * @param parts - The path's parts; empty ones are dropped
 * @returns The path
 */
function path(...parts: ReadonlyArray<string>): string {
  return parts.filter((part) => part !== '').join('.');
}

/**
 * Whether a field writes the option of its own name and nothing else.
 *
 * @param field - The field
 * @returns Whether it is plain
 */
function plain(field: Pick<IndexedField, 'node' | 'configKeys'>): boolean {
  return field.configKeys.length === 1 && field.configKeys[0] === field.node.name;
}

/**
 * Where a card form's field stores what it writes, as `routing.ts` › `applyWorkspaceChange`
 * places it: a nested field at its data path; a top-level field under the view block
 * `destination` names for the form's workspace, or at the root.
 *
 * @param dataPath - The field's data path
 * @param key - A configuration key it writes
 * @param workspace - The workspace the form was drawn for
 * @returns The stored path
 */
function routed(dataPath: ReadonlyArray<string>, key: string, workspace: EditorWorkspace): string {
  return dataPath.length > 0
    ? path(...dataPath, key)
    : path(destination(key, workspace) ?? '', key);
}

/**
 * The writers a card form's index holds, its fields routed for the form's workspace.
 *
 * @param fields - Indexed fields
 * @param workspace - The workspace the form was drawn for
 * @returns The writers
 */
function cardWriters(fields: Iterable<IndexedField>, workspace: EditorWorkspace): Writer[] {
  return [...fields].map((field) => ({
    id: field.id,
    options: field.configKeys.map((key) => routed(field.dataPath, key, workspace)),
    plain: plain(field),
  }));
}

/**
 * The writers a list item's form holds, each writing under the item's place.
 *
 * @param fields - Indexed fields
 * @param place - The item's place (`entities[0]`)
 * @returns The writers
 */
function itemWriters(fields: Iterable<IndexedField>, place: string): Writer[] {
  return [...fields].map((field) => ({
    id: field.id,
    options: field.configKeys.map((key) => path(place, ...field.dataPath, key)),
    plain: plain(field),
  }));
}

/**
 * The display control's fields. It routes a change as a panel does (`element.ts` ›
 * `_renderViewControls` hands its frame to `_valueChanged`), so a top-level field writes the
 * options `synthetic.ts` declares for it, as a panel's would (`field-index.ts` ›
 * `cardConfigKeys`), and a nested one its own. Its frame names a workspace of its own, so each
 * top-level option must land in the same place whichever workspace that is.
 *
 * @returns The writers
 */
function displayWriters(): Writer[] {
  return [...walkSchema(chassisSchemas('en').displayView)].flatMap(({ node, dataPath }) => {
    if (!('selector' in node)) return [];
    const keys = dataPath.length === 0 ? configKeysForField(node.name) : [node.name];
    const options = keys.map((key) => {
      const places = new Set(WORKSPACES.map((workspace) => routed(dataPath, key, workspace)));
      if (places.size > 1) {
        throw new Error(
          `The display control's ${key} lands in ${[...places].join(' or ')} by workspace: ` +
            "read the workspace its form's frame names (element.ts › _renderViewControls).",
        );
      }
      return [...places][0];
    });
    return [
      {
        id: fieldId('display', dataPath, node.name),
        options,
        plain: plain({ node, configKeys: keys }),
      },
    ];
  });
}

/** Every distinct configuration of the gate corpus. */
const CONFIGS = [
  ...new Map(corpus().map((state) => [JSON.stringify(state.config), state.config])).values(),
];

/** The panels, the display control and each calendar block, per corpus configuration and workspace. */
const EDITOR_BUILDS: ReadonlyArray<ReadonlyArray<Writer>> = WORKSPACES.flatMap((workspace) =>
  CONFIGS.map((config) => {
    const ctx = schemaCtx(config, workspace, 'en');
    return [
      ...cardWriters(buildFieldIndex(ctx).fields.values(), workspace),
      ...displayWriters(),
      ...(config.entities ?? []).flatMap((item, at) =>
        itemWriters(entityFieldIndex(entrySchema(item, ctx)).fields.values(), `entities[${at}]`),
      ),
    ];
  }),
);

/** A toolbar button's form, the same for every button. */
const BUTTON_BUILD: ReadonlyArray<Writer> = itemWriters(
  buttonFieldIndex(buildToolbarButtonSchema()).fields.values(),
  'toolbar.buttons[0]',
);

/** The calendars and the weather Quick Setup is offered, all invented. */
const STATES = { 'calendar.anna': {}, 'calendar.ben': {}, 'weather.home': {} };

/**
 * A value a Quick Setup field does not hold, by its selector.
 *
 * @param node - The field
 * @param current - What it holds
 * @returns Another value it accepts
 */
function another(node: HaFormSchema, current: unknown): unknown {
  const selector = ('selector' in node ? node.selector : {}) as Record<string, unknown>;
  if ('boolean' in selector) return current !== true;
  if ('text' in selector) return `${typeof current === 'string' ? current : ''} again`;
  if ('entity' in selector) {
    if ((selector.entity as { multiple?: boolean } | null)?.multiple !== true) {
      return current === 'weather.home' ? '' : 'weather.home';
    }
    const held = Array.isArray(current) ? current : [];
    const unheld = Object.keys(STATES).find(
      (id) => id.startsWith('calendar.') && !held.includes(id),
    );
    return held.length > 1 || unheld === undefined ? held.slice(0, 1) : [...held, unheld];
  }
  throw new Error(`No other value for the Quick Setup field ${node.name}: teach this test.`);
}

/**
 * The options that differ between two configurations, as paths: a block is followed into its
 * keys, a list or a value is one option.
 *
 * @param before - One configuration, or a value inside it
 * @param after - The other
 * @param at - The path to here
 * @returns The paths that differ
 */
function changedOptions(before: unknown, after: unknown, at: ReadonlyArray<string> = []): string[] {
  const block = (value: unknown, other: unknown) =>
    Helpers.isConfigBlock(value)
      ? value
      : value === undefined && Helpers.isConfigBlock(other)
        ? {}
        : undefined;
  const one = block(before, after);
  const two = block(after, before);
  if (one !== undefined && two !== undefined) {
    return [...new Set([...Object.keys(one), ...Object.keys(two)])].flatMap((key) =>
      changedOptions(one[key], two[key], [...at, key]),
    );
  }
  return deepEqual(before, after) ? [] : [path(...at)];
}

/** Each Quick Setup step's fields, with what each writes, filled in before the tests run. */
const WIZARD_BUILDS: Writer[][] = [];

beforeAll(async () => {
  const editor = await mountEditor(
    {
      config_version: Config.CURRENT_CONFIG_VERSION,
      title: 'Our Week',
      entities: ['calendar.anna', 'calendar.ben'],
    },
    { hass: fakeHass({ states: STATES }) },
  );
  // Home Assistant answers each write with the editor's own value.
  editor.addEventListener('config-changed', (event) =>
    editor.setConfig(structuredClone((event as CustomEvent).detail.config)),
  );
  const root = editor.shadowRoot!;
  const press = async (selector: string) => {
    const target = root.querySelector<HTMLButtonElement>(selector);
    if (target === null || target.disabled) throw new Error(`Quick Setup offers no ${selector}.`);
    target.click();
    await editor.updateComplete;
  };
  const step = () => root.querySelector<HTMLElement>('[data-quick-setup]')?.dataset.quickSetup;

  await press('[data-quick-setup-open]');
  await press('[data-story]');
  while (root.querySelector('[data-quick-setup-next]') !== null) {
    const leaving = step();
    await press('[data-quick-setup-next]');
    if (step() === leaving) throw new Error(`Quick Setup stayed on ${leaving}.`);

    const forms = formsOf(editor, CHASSIS);
    if (forms.length === 0) continue;
    if (forms.length > 1) {
      throw new Error(`Quick Setup's ${step()} step draws ${forms.length} forms.`);
    }
    const fields = [...walkSchema(forms[0].schema)].flatMap(({ node, dataPath }) =>
      'selector' in node ? [{ node, id: fieldId('quick_setup', dataPath, node.name) }] : [],
    );
    // Each field is changed alone from two starting points: the step's first answers, and every
    // answer changed. One answer can hide what another writes, as a switch that is already on
    // hides the one beside it that would turn the same thing on.
    const first = Object.fromEntries(fields.map(({ id }) => [id, valueOf(editor, id)]));
    const changed = Object.fromEntries(
      fields.map(({ id, node }) => [id, another(node, first[id])]),
    );
    const writes = new Map(fields.map(({ id }) => [id, new Set<string>()]));
    for (const start of [first, changed]) {
      for (const { node, id } of fields) {
        await changeFields(editor, start);
        const before = lastConfig(editor);
        await changeField(editor, id, another(node, start[id]));
        for (const option of changedOptions(before, lastConfig(editor))) {
          writes.get(id)!.add(option);
        }
      }
    }
    await changeFields(editor, first);
    WIZARD_BUILDS.push(
      [...writes].map(([id, written]) => {
        const { dataPath, name } = parseFieldId(id);
        const options = [...written].sort();
        return {
          id,
          options,
          plain: options.length === 1 && options[0] === path(...dataPath, name),
        };
      }),
    );
  }
});

afterAll(() => document.body.replaceChildren());

/** The view blocks' keys, from the registry rather than named here. */
const VIEW_BLOCK_KEYS: ReadonlyArray<string> = Object.values(ViewConfig.VIEW_BLOCKS).map(
  (block) => block.blockKey as string,
);

/**
 * Each option some build writes more than once, with every combination of writers that does.
 * Writers share an option where their writes are stored at the same path in one build; the
 * option is then named without a list item's place or the view block it was stored in, as the
 * same pair shares it in every block its workspace routes it to.
 *
 * @param builds - Builds, each the writers drawn together
 * @returns Combinations of writer ids by option
 */
function sharedOptions(builds: ReadonlyArray<ReadonlyArray<Writer>>): Map<string, Set<string>> {
  const shared = new Map<string, Set<string>>();
  for (const build of builds) {
    const writers = new Map<string, FieldId[]>();
    for (const writer of build) {
      for (const option of writer.options) {
        writers.set(option, [...(writers.get(option) ?? []), writer.id]);
      }
    }
    for (const [option, ids] of writers) {
      if (ids.length < 2) continue;
      const [head, ...rest] = option.replace(/\[\d+\]/g, '[]').split('.');
      const key =
        rest.length > 0 && VIEW_BLOCK_KEYS.includes(head)
          ? rest.join('.')
          : [head, ...rest].join('.');
      const combinations = shared.get(key) ?? new Set<string>();
      combinations.add([...ids].sort().join(' + '));
      shared.set(key, combinations);
    }
  }
  return shared;
}

/**
 * Whether a writer is a plain field: it writes the option of its own name and nothing else.
 *
 * @param writer - The writer
 * @returns Whether it is plain
 */
function isPlain(writer: Writer): boolean {
  return writer.plain;
}

/**
 * Every build swept.
 *
 * @returns The builds
 */
function allBuilds(): ReadonlyArray<ReadonlyArray<Writer>> {
  return [...EDITOR_BUILDS, BUTTON_BUILD, ...WIZARD_BUILDS];
}

describe('every option the card’s forms write', () => {
  it('has one writer per build, but for a setting drawn as two controls', () => {
    console.info(
      `Option writers: ${EDITOR_BUILDS.length} editor builds (${CONFIGS.length} corpus ` +
        `configurations in ${WORKSPACES.length} workspaces), a toolbar button's form and ` +
        `${WIZARD_BUILDS.length} Quick Setup steps; ` +
        `${allBuilds().reduce((sum, build) => sum + build.length, 0)} fields drawn.`,
    );
    expect(EDITOR_BUILDS).toHaveLength(CONFIGS.length * WORKSPACES.length);
    expect(
      Object.fromEntries([...sharedOptions(allBuilds())].map(([o, c]) => [o, [...c].sort()])),
    ).toEqual(
      Object.fromEntries(
        Object.entries(SHARED).map(([option, combinations]) => [
          option,
          combinations.map((ids) => [...ids].sort().join(' + ')).sort(),
        ]),
      ),
    );
  });

  it('is shared by one plain field at most', () => {
    const byId = new Map(allBuilds().flatMap((build) => build.map((w) => [w.id, w] as const)));
    let checked = 0;
    for (const [option, combinations] of sharedOptions(allBuilds())) {
      for (const combination of combinations) {
        const ids = combination.split(' + ');
        const plain = ids.filter((id) => isPlain(byId.get(id)!));
        expect(plain.length, `${option}: ${combination}`).toBeLessThanOrEqual(1);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('is what each Quick Setup answer changes in the configuration it previews', () => {
    const answers = WIZARD_BUILDS.flat();
    console.info(
      `Quick Setup writes: ${answers.map((w) => `${w.id} → ${w.options.join(', ')}`).join('; ')}.`,
    );
    expect(WIZARD_BUILDS.length).toBeGreaterThan(0);
    for (const answer of answers) expect(answer.options, answer.id).not.toHaveLength(0);
  });
});
