import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CARD,
  CHASSIS,
  changeField,
  changeFields,
  entry,
  formsOf,
  goEntry,
  goOverview,
  keysOf,
  mountEditor,
  openPanels,
  valueOf,
} from './helpers/editor-host';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import { VIEWS, VIEW_SCOPE } from '../src/config/view';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import { walkSchema } from '../src/rendering/editor/panels';
import { EDITOR_STRINGS } from '../src/rendering/editor/strings';
import {
  ADD_CALENDAR_PATH,
  ENTRY_CALENDAR_PATH,
  chassisSubforms,
} from '../src/rendering/editor/subforms';
import { configKeysForField } from '../src/rendering/editor/synthetic';
import {
  type EditorWorkspace,
  WORKSPACES,
  WORKSPACE_FIELD,
} from '../src/rendering/editor/workspace';

// Complete shipped translations must not remove the partial-language fallback fixture.
vi.mock('../src/rendering/editor/translations/index', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../src/rendering/editor/translations/index')>();
  return {
    ...original,
    EDITOR_LANGUAGE_STRINGS: {
      ...original.EDITOR_LANGUAGE_STRINGS,
      'test-partial': { 'panel.separators': 'Translated separator title' },
    },
  };
});

/** Home Assistant passes sparse configs, including unchanged save echoes. */
interface EditorHost extends HTMLElement {
  hass: unknown;
  setConfig(config: unknown): void;
  readonly updateComplete: Promise<unknown>;
}

// Written out rather than aliased to `WORKSPACES`, so the picker and the constant are two
// surfaces that must agree instead of one restated twice. Shared leads because it is the
// base the other three override.
const EXPECTED_WORKSPACES: ReadonlyArray<EditorWorkspace> = ['shared', ...VIEWS];
const PAIRS = EXPECTED_WORKSPACES.flatMap((from) =>
  EXPECTED_WORKSPACES.filter((to) => to !== from).map((to) => ({ from, to })),
);

function names(schema: ReadonlyArray<HaFormSchema>): string[] {
  return [...walkSchema(schema)]
    .filter(({ node }) => 'selector' in node)
    .map(({ node }) => node.name);
}

/** The forms directly inside the view controls, in order. */
/** Card Displays and Settings For, the overview's own radio groups. */
function viewControls(editor: EditorHost): Element[] {
  return [...editor.shadowRoot!.querySelectorAll('.overview fieldset.displays, .overview .scope')];
}

/**
 * The values a radio group of the editor's own offers.
 *
 * @param editor - Editor
 * @param name - The inputs' name
 * @returns The values, in order
 */
function offered(editor: EditorHost, name: string): string[] {
  return [...editor.shadowRoot!.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)].map(
    (input) => input.value,
  );
}

/**
 * Opens Settings For as a user does, with Change, where it is its compact line.
 *
 * @param editor - Editor
 */
async function openScope(editor: EditorHost): Promise<void> {
  const change = editor.shadowRoot!.querySelector<HTMLElement>('[data-focus="scope-change"]');
  change?.click();
  await editor.updateComplete;
}

async function mount(overrides: Partial<Types.Config> = {}): Promise<EditorHost> {
  const editor = await mountEditor({
    config_version: Config.CURRENT_CONFIG_VERSION,
    entities: [{ entity: 'calendar.anna' }],
    ...overrides,
  });
  // A closed panel mounts no form: open every panel, as these tests read forms across the editor.
  await openPanels(editor);
  return editor;
}

function workspace(editor: EditorHost): unknown {
  return valueOf(editor, `workspace:${WORKSPACE_FIELD}`);
}

async function choose(editor: EditorHost, value: EditorWorkspace): Promise<void> {
  await changeField(editor, `workspace:${WORKSPACE_FIELD}`, value);
}

async function display(editor: EditorHost, view: Types.EffectiveView): Promise<void> {
  await changeField(editor, 'display:view', view);
}

function reports(editor: EditorHost): Array<Record<string, unknown>> {
  const seen: Array<Record<string, unknown>> = [];
  editor.addEventListener('config-changed', (event) => {
    const config = structuredClone(
      (event as CustomEvent<{ config: Record<string, unknown> }>).detail.config,
    );
    delete config.config_version;
    seen.push(config);
  });
  return seen;
}

function enabled(view: Types.EffectiveView): Partial<Types.Config> {
  return {
    view,
    entities: [
      {
        entity: 'calendar.anna',
        label: 'Anna',
        compact_events_to_show: 2,
        split_multiday_events: false,
      },
    ],
    show_empty_days: true,
    // The three parents whose children are `VIEW_SCOPE` keys. Without them
    // `show_location_allday`, `show_description_allday` and `show_countdown_allday` are
    // never built at all, so the scope assertion below reads absent-because-gated as
    // absent-because-withheld and passes for the wrong reason in every view.
    show_location: true,
    show_description: true,
    show_countdown: true,
    allday_badge: 'title',
    allday_badge_color: '#b5651d',
    compact_days_to_show: 2,
    compact_events_to_show: 3,
    compact_events_complete_days: true,
    today_indicator: true,
    column: { event_font_size: '19px', show_location: true },
    time_grid: { event_font_size: '23px', show_empty_days: true },
  };
}

function assertWorkspaceFields(editor: EditorHost, current: EditorWorkspace): void {
  const namesInForms = formsOf(editor, CARD).flatMap((form) => names(form.schema));
  expect(namesInForms.length).toBeGreaterThan(50);
  const main = namesInForms.flatMap((name) => configKeysForField(name));
  for (const [key, scope] of Object.entries(VIEW_SCOPE)) {
    // Shared offers a key when more than one layout reads it; a view offers it when that
    // view reads it. Asking `scope.has('shared')` would be false for every scoped key.
    const expected = current === 'shared' ? scope.size > 1 : scope.has(current);
    expect(main.includes(key), `${current}: ${key}`).toBe(expected);
  }
  expect(main.includes('hour_height')).toBe(current === 'grid');
  expect(main.includes('min_day_width')).toBe(current === 'grid' || current === 'column');
  // Each of the calendar's fields is a form of its own on its entry page, so the calendar's
  // options are what all of its forms draw together.
  const entityForms = formsOf(editor, entry(0));
  expect(entityForms.length).toBeGreaterThan(0);
  const entity = entityForms.flatMap((form) => names(form.schema));
  expect(entity.includes('compact_events_to_show')).toBe(current === 'list');
  expect(entity.includes('split_multiday_events')).toBe(current !== 'grid');
  expect(editor.shadowRoot!.querySelectorAll('ha-form.exception-picker')).toHaveLength(0);
  if (current === 'list') {
    expect(editor.shadowRoot!.querySelectorAll('.width-table')).toHaveLength(0);
  }
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

/**
 * The i18n gate and the schema tests read the chassis through `chassisSubforms`, so a form the
 * editor drew outside the panels without declaring it there would escape both.
 */
describe('the chassis draws exactly the forms subforms.ts declares', () => {
  it('draws every chassis control from what chassisSubforms declares, in order', async () => {
    const at = (path: ReadonlyArray<string>): Array<ReadonlyArray<HaFormSchema>> =>
      chassisSubforms()
        .filter((subform) => subform.path.join('.') === path.join('.'))
        .map((subform) => subform.schema);
    // Add Calendar's picker leaves out the calendars already on the card as it draws, so what it
    // draws is the declared schema with that list added.
    const withoutExcluded = (schema: ReadonlyArray<HaFormSchema>): unknown =>
      schema.map((node) => {
        if (!('selector' in node) || !('entity' in node.selector)) return node;
        const { exclude_entities: excluded, ...picker } = node.selector.entity as Record<
          string,
          unknown
        >;
        expect(excluded).toEqual(['calendar.anna']);
        return { ...node, selector: { ...node.selector, entity: picker } };
      });
    for (const view of VIEWS) {
      // Mounted without `openPanels`, so the chassis forms read are only the ones drawn where the
      // editor is.
      const editor = (await mountEditor({
        config_version: Config.CURRENT_CONFIG_VERSION,
        entities: [{ entity: 'calendar.anna' }],
        view,
      })) as unknown as EditorHost;
      // Quick Setup's forms are drawn only while it is open, one step at a time; the test below
      // walks them.
      const [display, scope, filter] = at([]);
      const [addCalendar] = at(ADD_CALENDAR_PATH);
      const [entryCalendar] = at(ENTRY_CALENDAR_PATH);
      // The filter bar is a form; Card Displays and Settings For are the editor's own radio
      // groups, drawn from the options their declared schemas hold.
      expect(
        formsOf(editor, CHASSIS).map((form) => form.schema),
        view,
      ).toEqual([filter]);
      // Add Calendar's picker is drawn only while Add Calendar is open, below the filter bar.
      editor.shadowRoot!.querySelector<HTMLElement>('[data-focus="add-calendar"]')!.click();
      await editor.updateComplete;
      const adding = formsOf(editor, CHASSIS).map((form) => form.schema);
      expect(adding, view).toHaveLength(2);
      expect(adding[0], view).toBe(filter);
      expect(withoutExcluded(adding[1]), view).toEqual(addCalendar);
      editor.shadowRoot!.querySelector<HTMLElement>('[data-focus="add-cancel"]')!.click();
      await editor.updateComplete;
      expect(formsOf(editor, CHASSIS), view).toHaveLength(1);
      // An entry page draws its Calendar, and no filter bar.
      await goEntry(editor, keysOf(editor, 'entry')[0]);
      expect(
        formsOf(editor, CHASSIS).map((form) => form.schema),
        view,
      ).toEqual([entryCalendar]);
      await goOverview(editor);
      const values = (schema: ReadonlyArray<HaFormSchema>): string[] => {
        const node = schema[0] as unknown as { selector: { select: { options: unknown[] } } };
        return node.selector.select.options.map((option) =>
          typeof option === 'string' ? option : String((option as { value: unknown }).value),
        );
      };
      expect(offered(editor, 'view'), view).toEqual(values(display));
      await openScope(editor);
      expect(offered(editor, 'scope'), view).toEqual(values(scope));
      editor.remove();
    }
  });
});

describe('displayed view and editing workspace are separate controls', () => {
  it('draws both as the overview’s own radio groups and declares both to the translation checker', async () => {
    const editor = await mount({ view: 'grid' });
    expect(viewControls(editor)).toHaveLength(2);
    expect(editor.shadowRoot!.querySelector('fieldset.displays legend')!.textContent!.trim()).toBe(
      'Card Displays',
    );
    await openScope(editor);
    expect(editor.shadowRoot!.querySelector('.scope legend')!.textContent!.trim()).toBe(
      'Settings For',
    );
    // The overview, top to bottom: the filter bar, Settings For, Calendars, Card Displays.
    const order = [
      ...editor.shadowRoot!.querySelectorAll(
        '.overview > .filter-bar, .overview > .scope, .overview > [data-heading="calendars"], .overview > .displays',
      ),
    ].map((element) => element.className.split(' ')[0] || element.getAttribute('data-heading'));
    expect(order).toEqual(['filter-bar', 'scope', 'page-group', 'displays']);
    expect(chassisSubforms().flatMap((subform) => names(subform.schema))).toEqual([
      'view',
      WORKSPACE_FIELD,
      'search',
      'customized_only',
      'essentials_only',
      'pick',
      'calendar',
      'card_title',
      'card_calendars',
      'weather_entity',
      'show_toolbar',
      'event_details',
      'day_adds',
    ]);
    expect(formsOf(editor, CARD).flatMap((form) => names(form.schema))).not.toContain('view');
    expect(offered(editor, 'scope')).toEqual(EXPECTED_WORKSPACES);
    expect(WORKSPACES).toEqual(EXPECTED_WORKSPACES);
  });

  it.each(VIEWS)(
    'opens on the displayed %s view without emitting a config change',
    async (view) => {
      const editor = await mount({ view });
      const seen = reports(editor);
      expect(workspace(editor)).toBe(view);
      const other = VIEWS.find((candidate) => candidate !== view)!;
      await choose(editor, other);
      expect(workspace(editor)).toBe(other);
      expect(valueOf(editor, 'display:view')).toBe(view);
      expect(seen).toEqual([]);
    },
  );

  it.each(VIEWS.flatMap((from) => VIEWS.filter((to) => to !== from).map((to) => ({ from, to }))))(
    'follows an explicit Card Displays change from $from to $to before a workspace is chosen',
    async ({ from, to }) => {
      const editor = await mount({ view: from });
      const seen = reports(editor);
      // A same-value initialization event from ha-form is not a user changing workspaces.
      await choose(editor, from);
      await display(editor, to);
      expect(workspace(editor)).toBe(to);
      expect(seen).toHaveLength(1);
      expect(seen[0].view ?? 'list').toBe(to);
      expect(seen[0]).not.toHaveProperty(WORKSPACE_FIELD);
    },
  );

  it.each(EXPECTED_WORKSPACES)(
    'keeps the chosen %s workspace when Card Displays changes',
    async (chosen) => {
      const editor = await mount(enabled('list'));
      await choose(editor, 'column');
      await choose(editor, chosen);
      const seen = reports(editor);
      await display(editor, 'column');
      await display(editor, 'grid');
      expect(workspace(editor)).toBe(chosen);
      assertWorkspaceFields(editor, chosen);
      expect(seen).toHaveLength(2);
      expect(seen[1].view).toBe('grid');
      expect(seen[1]).not.toHaveProperty(WORKSPACE_FIELD);
    },
  );
});

describe('workspace transitions do not configure the card', () => {
  it.each(PAIRS)(
    'handles $from -> $to for every displayed view without writing anything',
    async ({ from, to }) => {
      expect(PAIRS).toHaveLength(EXPECTED_WORKSPACES.length * (EXPECTED_WORKSPACES.length - 1));
      for (const view of VIEWS) {
        const editor = await mount(enabled(view));
        const seen = reports(editor);
        await choose(editor, from);
        assertWorkspaceFields(editor, from);
        await choose(editor, to);
        assertWorkspaceFields(editor, to);
        expect(workspace(editor)).toBe(to);
        expect(valueOf(editor, 'display:view')).toBe(view);
        expect(seen).toEqual([]);
        editor.remove();
      }
    },
  );

  it('does not seed a grid block or persist its cursor when visiting another workspace', async () => {
    const editor = await mount();
    const seen = reports(editor);
    await choose(editor, 'grid');
    await choose(editor, 'list');
    expect(seen).toEqual([]);
    await changeField(editor, 'card:title', 'Example');
    expect(seen).toEqual([{ entities: [{ entity: 'calendar.anna' }], title: 'Example' }]);
  });

  it('writes presentation values into the editing workspace without changing List', async () => {
    const editor = await mount();
    const seen = reports(editor);
    await choose(editor, 'grid');
    await changeField(editor, 'events:event_font_size', '27px');
    expect(seen).toEqual([
      { entities: [{ entity: 'calendar.anna' }], time_grid: { event_font_size: '27px' } },
    ]);
    expect(workspace(editor)).toBe('grid');
  });

  it('keeps a scope change inside the editor', async () => {
    const editor = await mount();
    const seen = reports(editor);
    const escaped = vi.fn();
    editor.addEventListener('value-changed', escaped);
    editor.addEventListener('change', escaped);
    await choose(editor, 'grid');
    expect(workspace(editor)).toBe('grid');
    expect(valueOf(editor, 'display:view')).toBe('list');
    expect(escaped).not.toHaveBeenCalled();
    expect(seen).toEqual([]);
  });

  it('offers only the four scopes, so no other can be chosen', async () => {
    const editor = await mount();
    await openScope(editor);
    expect(offered(editor, 'scope')).toEqual(EXPECTED_WORKSPACES);
    expect(workspace(editor)).toBe('list');
  });

  it('leaves the controls available when search empties the editor', async () => {
    const editor = await mount();
    const seen = reports(editor);
    await changeFields(editor, { 'filter:search': 'zzznomatch', 'filter:customized_only': false });
    expect(formsOf(editor, CARD)).toHaveLength(0);
    // Settings For stays above what the search finds: the results write where it says.
    expect(viewControls(editor)).toHaveLength(1);
    await choose(editor, 'grid');
    expect(workspace(editor)).toBe('grid');
    expect(seen).toEqual([]);
  });
});

describe('workspace state survives echoes and pending edits', () => {
  it('keeps the chosen workspace on a sparse Home Assistant echo, but resets for an external config', async () => {
    const editor = await mount(enabled('column'));
    const seen = reports(editor);
    await choose(editor, 'grid');
    await changeField(editor, 'card:title', 'Example');
    expect(seen).toHaveLength(1);
    editor.setConfig({ config_version: Config.CURRENT_CONFIG_VERSION, ...seen[0] });
    await editor.updateComplete;
    expect(workspace(editor)).toBe('grid');

    editor.setConfig({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: ['calendar.ben'],
      view: 'list',
    });
    await editor.updateComplete;
    expect(workspace(editor)).toBe('list');
    await display(editor, 'column');
    expect(workspace(editor)).toBe('column');
  });

  it('retains invalid-in-progress text while its workspace is away', async () => {
    const editor = await mount({ start_date: 'today+2' });
    const seen = reports(editor);
    await changeField(editor, 'content:start_date_offset', '-');
    await choose(editor, 'grid');
    await choose(editor, 'list');
    expect(valueOf(editor, 'content:start_date_offset')).toBe('-');
    expect(seen).toEqual([]);
  });

  it('keeps view values separate across workspace switches and external configurations', async () => {
    const editor = await mount(enabled('list'));
    const seen = reports(editor);
    await choose(editor, 'grid');
    await changeField(editor, 'events:title_max_lines', 3);
    expect(valueOf(editor, 'events:title_max_lines')).toBe(3);
    await choose(editor, 'column');
    expect(valueOf(editor, 'events:title_max_lines')).toBe(0);
    await choose(editor, 'grid');
    expect(valueOf(editor, 'events:title_max_lines')).toBe(3);
    editor.setConfig({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: ['calendar.ben'],
      view: 'grid',
    });
    await editor.updateComplete;
    expect(valueOf(editor, 'events:title_max_lines')).toBe(0);
    expect(seen).toHaveLength(1);
  });

  it('diffs a view edit against its projection, not the different displayed view', async () => {
    const editor = await mount({ view: 'list', time_grid: { event_font_size: '23px' } });
    const seen = reports(editor);
    await choose(editor, 'grid');
    expect(seen).toEqual([]);
    await changeField(editor, 'events:event_font_size', '24px');
    expect(seen).toEqual([
      {
        entities: [{ entity: 'calendar.anna' }],
        view: 'list',
        time_grid: { event_font_size: '24px' },
      },
    ]);
  });
});

/**
 * Shared is a workspace with no view behind it.
 *
 * It was deleted in the editor rework's Stage 5 on the correct measurement that it was
 * byte-identical to List across 63 configurations — true only because list's keys lived at
 * the top level. `list:` gives it a job, so these assert the two halves that make it more
 * than a fourth name for List: switching to it writes nothing, and an edit made in it
 * lands at the top level where every view can read it.
 */
describe('the shared workspace', () => {
  it('offers one workspace per view plus the shared base', () => {
    expect(WORKSPACES).toEqual(['shared', ...VIEWS]);
  });

  it('is selectable and changes no configuration by being selected', async () => {
    const editor = await mount();
    const seen = reports(editor);

    await changeField(editor, `workspace:${WORKSPACE_FIELD}`, 'shared');

    expect(workspace(editor)).toBe('shared');
    expect(seen).toEqual([]);
  });

  // The distinguishing behavior. The same edit made in the List workspace lands in
  // `list:`; made here it lands at the top level, which is the whole point of the layer.
  it('writes an edit to the top level rather than into any block', async () => {
    const editor = await mount({ view: 'list' });
    const seen = reports(editor);

    await changeField(editor, `workspace:${WORKSPACE_FIELD}`, 'shared');
    await changeField(editor, 'events:event_font_size', '24px');

    expect(seen).toEqual([
      { entities: [{ entity: 'calendar.anna' }], view: 'list', event_font_size: '24px' },
    ]);
  });

  it('writes the same edit into the list block from the List workspace', async () => {
    const editor = await mount({ view: 'list' });
    const seen = reports(editor);

    await changeField(editor, 'events:event_font_size', '24px');

    expect(seen).toEqual([
      { entities: [{ entity: 'calendar.anna' }], view: 'list', list: { event_font_size: '24px' } },
    ]);
  });
});

describe('the editor names each view once', () => {
  /**
   * A reconciliation rather than a list of three, because the bug is forgetting: a new
   * view added to `VIEWS` is covered here the day it lands, and neither table can lose an
   * entry without failing. `AGENTS.md` records this project losing rows from
   * hand-maintained tables while the suite stayed green.
   *
   * The two selectors stack in the same editor — the illustrated tiles pick what the card
   * displays, the workspace picker below them picks what you are configuring — so a view
   * reading "Columns" in one and "Column" in the other is two names on one screen. That is
   * what this caught.
   */
  it('gives the workspace picker and the display tiles the same labels', () => {
    for (const view of VIEWS) {
      expect(EDITOR_STRINGS[`editing_workspace.option.${view}.label`]).toBe(
        EDITOR_STRINGS[`view.option.${view}.label`],
      );
    }
  });

  /**
   * Provenance describes a storage *layer*, so it must not name a view. "Uses the List
   * value" was true only because the top level is simultaneously List's own storage and
   * the value every other view falls back to — the ambiguity a `list:` block would remove,
   * at which point the sentence becomes plainly false.
   *
   * Reconciled against `VIEWS` for the same reason as the test above. `editing_workspace`
   * strings are deliberately out of scope: the note under the picker names Column and Grid
   * on purpose, because it is telling a List editor who else reads these values.
   */
  it('describes provenance by layer, never by view name', () => {
    const states = ['card', 'inherited', 'default', 'own'] as const;
    const names = VIEWS.map((view) => EDITOR_STRINGS[`view.option.${view}.label`]);

    for (const state of states) {
      const text = EDITOR_STRINGS[`value_source.${state}`];
      expect(text, `value_source.${state} is missing`).toBeTypeOf('string');
      for (const name of names) {
        expect(text, `value_source.${state} names the ${name} view`).not.toMatch(
          new RegExp(`\\b${name}\\b`),
        );
      }
    }
  });
});
