import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CARD,
  CHASSIS,
  changeField,
  changeFields,
  editLayout,
  entry,
  formsOf,
  goEntry,
  goOverview,
  keysOf,
  layoutOf,
  mountEditor,
  openPanels,
  valueOf,
} from './helpers/editor-host';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import { VIEWS, VIEW_SCOPE, appliesToView } from '../src/config/view';
import { entryViews, parseFieldId } from '../src/rendering/editor/field-index';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import { PAGES, WHOLE_CARD_PAGES } from '../src/rendering/editor/pages';
import { walkSchema } from '../src/rendering/editor/panels';
import { startingView } from '../src/rendering/editor/routing';
import { EDITOR_STRINGS } from '../src/rendering/editor/strings';
import {
  ADD_CALENDAR_PATH,
  ENTRY_CALENDAR_PATH,
  chassisSubforms,
} from '../src/rendering/editor/subforms';
import { configKeysForField } from '../src/rendering/editor/synthetic';
import { type EditorWorkspace, WORKSPACES } from '../src/rendering/editor/workspace';

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

/**
 * The options a schema's fields write: a top-level field's, through its synthetic mapping, and a
 * block field's own name, which may share a synthetic field's (Month's `card_height`).
 */
function optionKeys(schema: ReadonlyArray<HaFormSchema>, workspace: EditorWorkspace): string[] {
  const view = workspace === 'shared' ? undefined : workspace;
  return [...walkSchema(schema)]
    .filter(({ node }) => 'selector' in node)
    .flatMap(({ node, dataPath }) => {
      if (dataPath.length > 0) return [node.name];
      // A field writing several options writes, on a layout's page, those the layout reads:
      // Accent Text on Month's governs no description or progress bar color.
      const keys = configKeysForField(node.name);
      const read = view === undefined ? keys : keys.filter((key) => appliesToView(key, view));
      return read.length === 0 ? keys : read;
    });
}

/** Starting Layout, and the scope block Settings For drew, wherever the open place draws them. */
function viewControls(editor: EditorHost): Element[] {
  return [...editor.shadowRoot!.querySelectorAll('fieldset.displays, .scope-block')];
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
  return layoutOf(editor);
}

async function choose(editor: EditorHost, value: EditorWorkspace): Promise<void> {
  await editLayout(editor, value);
}

/** Starting Layout, read where the overview draws it. */
async function starting(editor: EditorHost): Promise<unknown> {
  await goOverview(editor);
  return valueOf(editor, 'display:view');
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
    // Off everywhere, with Show Today When Empty on: `show_empty_today`, scoped since Month draws
    // every day, is built only while Show Empty Days is off, which Columns and Grid default on,
    // and Show Today When Empty keeps `empty_day_text` and `empty_day_color` built. Left on, it
    // would read absent-because-gated as absent-because-withheld, the trap described below.
    show_empty_days: false,
    show_empty_today: true,
    // Shown for the same reason: `week_number_background_color` is scoped since Month draws its
    // week numbers as plain text, and is built only while week numbers are.
    show_week_numbers: 'iso',
    // The three parents whose children are `VIEW_SCOPE` keys. Without them
    // `show_location_allday`, `show_description_allday` and `show_countdown_allday` are
    // never built at all, so the scope assertion below reads absent-because-gated as
    // absent-because-withheld and passes for the wrong reason in every view.
    show_location: true,
    show_description: true,
    show_countdown: true,
    // And the progress bar's own three, which are built only while it is on.
    show_progress_bar: true,
    allday_badge: 'title',
    allday_badge_color: '#b5651d',
    compact_days_to_show: 2,
    compact_events_to_show: 3,
    compact_events_complete_days: true,
    today_indicator: true,
    // The parents of the month name's three fields: without a month rule none is built, and
    // without the name its color and size are not.
    month_separator_width: '1px',
    month_separator_label: true,
    // And Open Links, `VIEW_SCOPE`d away from Grid, is built only while events open nothing,
    // where by default a tap on one opens it.
    event_tap_action: { action: 'none' },
    column: { event_font_size: '19px', show_location: true, show_empty_days: false },
    time_grid: { event_font_size: '23px', show_empty_days: false, show_location: true },
  };
}

/** The scoped keys Whole Card's pages hold, drawn whatever the workspace: Open Links. */
const WHOLE_CARD_KEYS: ReadonlySet<string> = new Set(
  PAGES.filter((page) => WHOLE_CARD_PAGES.has(page.id)).flatMap((page) =>
    page.headings.flatMap((heading) =>
      heading.fields.flatMap(([id]) => configKeysForField(parseFieldId(id).name)),
    ),
  ),
);

function assertWorkspaceFields(editor: EditorHost, current: EditorWorkspace): void {
  const namesInForms = formsOf(editor, CARD).flatMap((form) => names(form.schema));
  expect(namesInForms.length).toBeGreaterThan(50);
  const main = formsOf(editor, CARD).flatMap((form) => optionKeys(form.schema, current));
  for (const [key, scope] of Object.entries(VIEW_SCOPE)) {
    // Shared offers a key when more than one layout reads it; a view offers it when that
    // view reads it. Asking `scope.has('shared')` would be false for every scoped key. A Whole
    // Card page draws its keys in every workspace, saying where they do not apply instead.
    const expected =
      WHOLE_CARD_KEYS.has(key) || (current === 'shared' ? scope.size > 1 : scope.has(current));
    expect(main.includes(key), `${current}: ${key}`).toBe(expected);
  }
  expect(main.includes('hour_height')).toBe(current === 'grid');
  expect(main.includes('min_day_width')).toBe(
    current === 'grid' || current === 'column' || current === 'month',
  );
  // Each of the calendar's fields is a form of its own on its entry page, so the calendar's
  // options are what all of its forms draw together. Opened from its row, the page is built for
  // the layouts the card can show, whichever layout was edited last; only a search result for an
  // option no such layout applies adds another (`field-index.ts` › `entryViews`).
  const entityForms = formsOf(editor, entry(0));
  expect(entityForms.length).toBeGreaterThan(0);
  const entity = entityForms.flatMap((form) => names(form.schema));
  const config = (editor as unknown as { _config: Types.Config })._config;
  const built = entryViews(config, startingView(config));
  expect(built.length).toBeGreaterThan(0);
  expect(entity.includes('compact_events_to_show'), `${current}: ${built}`).toBe(
    built.includes('list'),
  );
  expect(entity.includes('split_multiday_events'), `${current}: ${built}`).toBe(
    built.includes('list') || built.includes('column'),
  );
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
      // walks them. Above the panels the chassis declares Starting Layout and the search field,
      // and nothing it never draws.
      expect(at([]), view).toHaveLength(2);
      const [display, filter] = at([]);
      const [addCalendar] = at(ADD_CALENDAR_PATH);
      const [entryCalendar] = at(ENTRY_CALENDAR_PATH);
      // The filter bar is a form; Starting Layout is the editor's own radio group, drawn from the
      // options its declared schema holds.
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
      // The layout being edited is the place's own: each layout has a page, Layout Defaults
      // last, and no control chooses one apart from its page.
      expect(
        [...editor.shadowRoot!.querySelectorAll('[data-focus^="layout:"]')].map((row) =>
          row.getAttribute('data-focus')!.slice('layout:'.length),
        ),
        view,
      ).toEqual([...VIEWS, 'shared']);
      expect(editor.shadowRoot!.querySelector('input[name="scope"]'), view).toBeNull();
      editor.remove();
    }
  });
});

describe('displayed view and editing workspace are separate controls', () => {
  it.each(VIEWS)(
    'opens on the displayed %s view without emitting a config change',
    async (view) => {
      const editor = await mount({ view });
      const seen = reports(editor);
      expect(workspace(editor)).toBe(view);
      const other = VIEWS.find((candidate) => candidate !== view)!;
      await choose(editor, other);
      expect(workspace(editor)).toBe(other);
      expect(await starting(editor)).toBe(view);
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
    },
  );

  it.each(EXPECTED_WORKSPACES)(
    'still opens %s as its own when Card Displays changes',
    async (chosen) => {
      const editor = await mount(enabled('list'));
      await choose(editor, 'column');
      await choose(editor, chosen);
      const seen = reports(editor);
      await display(editor, 'column');
      await display(editor, 'grid');
      // The overview follows the layout the card opens in; the layout's row still opens it.
      expect(workspace(editor)).toBe('grid');
      await choose(editor, chosen);
      expect(workspace(editor)).toBe(chosen);
      assertWorkspaceFields(editor, chosen);
      expect(seen).toHaveLength(2);
      expect(seen[1].view).toBe('grid');
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
        expect(await starting(editor)).toBe(view);
        expect(seen).toEqual([]);
        editor.remove();
      }
      // Over a second in a full local run; the limit is set for CI's slower runner under load
      // rather than for a hang.
    },
    30_000,
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
    expect(await starting(editor)).toBe('list');
    expect(escaped).not.toHaveBeenCalled();
    expect(seen).toEqual([]);
  });

  it('draws no Settings For above what search finds, which keeps the scope a page chose', async () => {
    const editor = await mount();
    const seen = reports(editor);
    await choose(editor, 'grid');
    await changeFields(editor, { 'filter:search': 'zzznomatch' });
    expect(formsOf(editor, CARD)).toHaveLength(0);
    // The results are the overview's: no scope control, and the scope as a page left it.
    expect(viewControls(editor)).toHaveLength(0);
    expect(workspace(editor)).toBe('grid');
    expect(seen).toEqual([]);
  });
});

describe('workspace state survives echoes and pending edits', () => {
  it('keeps the page open on a sparse Home Assistant echo, and on an external config', async () => {
    const editor = await mount(enabled('column'));
    const seen = reports(editor);
    await choose(editor, 'grid');
    await changeField(editor, 'events:title_max_lines', 2);
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
    // Grid's page is still open, as the card can still show Grid; the overview follows the
    // layout the card opens in.
    expect(workspace(editor)).toBe('grid');
    await goOverview(editor);
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
    // Over a second in a full local run; the limit is set for CI's slower runner under load
    // rather than for a hang.
  }, 30_000);

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

    await editLayout(editor, 'shared');

    expect(workspace(editor)).toBe('shared');
    expect(seen).toEqual([]);
  });

  // The distinguishing behavior. The same edit made in the List workspace lands in
  // `list:`; made here it lands at the top level, which is the whole point of the layer.
  it('writes an edit to the top level rather than into any block', async () => {
    const editor = await mount({ view: 'list' });
    const seen = reports(editor);

    await editLayout(editor, 'shared');
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
   * A layout's row under Layouts, its page and its Starting Layout option all read the one
   * string, so a view reading "Columns" in one place and "Column" in another cannot come back;
   * this was a reconciliation of two tables while Settings For kept a copy of its own.
   */
  it('names each layout once, by its Starting Layout option, and Layout Defaults apart', () => {
    const names = VIEWS.map((view) => EDITOR_STRINGS[`view.option.${view}.label`]);
    for (const [at, name] of names.entries()) expect(name, VIEWS[at]).toBeTruthy();
    expect(new Set([...names, EDITOR_STRINGS['layouts.defaults']]).size).toBe(VIEWS.length + 1);
  });

  /**
   * Provenance describes a storage *layer*, so it must not name a view. "Uses the List
   * value" was true only because the top level is simultaneously List's own storage and
   * the value every other view falls back to — the ambiguity a `list:` block would remove,
   * at which point the sentence becomes plainly false.
   *
   * Reconciled against `VIEWS` for the same reason as the test above.
   */
  it('describes provenance by layer, never by view name', () => {
    // The state words that name no layout of their own; the rest take it as `{layout}`.
    const states = [
      'value_source.card',
      'state.set',
      'state.default',
      'state.from_all_layouts',
      'state.whole_card',
      'state.layout_default',
      'state.from_card',
    ] as const;
    const names = VIEWS.map((view) => EDITOR_STRINGS[`view.option.${view}.label`]);

    for (const state of states) {
      const text = EDITOR_STRINGS[state];
      expect(text, `${state} is missing`).toBeTypeOf('string');
      for (const name of names) {
        expect(text, `${state} names the ${name} view`).not.toMatch(new RegExp(`\\b${name}\\b`));
      }
    }
  });
});
