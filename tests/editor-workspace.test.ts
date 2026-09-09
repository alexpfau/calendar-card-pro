import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import { VIEWS, VIEW_SCOPE } from '../src/config/view';
import { CalendarCardProEditor } from '../src/rendering/editor/element';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import { walkSchema } from '../src/rendering/editor/panels';
import { chassisSubforms } from '../src/rendering/editor/subforms';
import {
  type EditorWorkspace,
  WORKSPACES,
  WORKSPACE_FIELD,
} from '../src/rendering/editor/workspace';
import * as Logger from '../src/utils/logger';

customElements.define('editor-workspace-test', CalendarCardProEditor);

/** Home Assistant passes sparse configs, including unchanged save echoes. */
interface EditorHost extends HTMLElement {
  hass: unknown;
  setConfig(config: unknown): void;
  readonly updateComplete: Promise<unknown>;
}

interface Form extends HTMLElement {
  schema: ReadonlyArray<HaFormSchema>;
  data: Record<string, unknown>;
  computeLabel(node: HaFormSchema): string;
}

const EXPECTED_WORKSPACES: ReadonlyArray<EditorWorkspace> = VIEWS;
const PAIRS = EXPECTED_WORKSPACES.flatMap((from) =>
  EXPECTED_WORKSPACES.filter((to) => to !== from).map((to) => ({ from, to })),
);

function names(schema: ReadonlyArray<HaFormSchema>): string[] {
  return [...walkSchema(schema)]
    .filter(({ node }) => 'selector' in node)
    .map(({ node }) => node.name);
}

function forms(editor: EditorHost, selector: string): Form[] {
  return Array.from(editor.shadowRoot!.querySelectorAll<Form>(selector));
}

function onlyForm(editor: EditorHost, selector: string): Form {
  const matches = forms(editor, selector);
  expect(matches).toHaveLength(1);
  return matches[0];
}

function owner(editor: EditorHost, key: string, selector = 'ha-form.panel-form'): Form {
  const found = forms(editor, selector).filter((form) => names(form.schema).includes(key));
  expect(found, `owner of ${key}`).toHaveLength(1);
  return found[0];
}

async function mount(overrides: Partial<Types.Config> = {}): Promise<EditorHost> {
  const editor = document.createElement('editor-workspace-test') as EditorHost;
  editor.hass = { states: {}, locale: { language: 'en' } };
  editor.setConfig(buildConfig({ entities: ['calendar.anna'], ...overrides }));
  document.body.appendChild(editor);
  await editor.updateComplete;
  return editor;
}

async function change(
  editor: EditorHost,
  form: Form,
  values: Record<string, unknown>,
): Promise<void> {
  form.dispatchEvent(
    new CustomEvent('value-changed', {
      detail: { value: { ...form.data, ...values } },
      bubbles: true,
      composed: true,
    }),
  );
  await editor.updateComplete;
}

function workspace(editor: EditorHost): unknown {
  return onlyForm(editor, 'ha-form.workspace-form').data[WORKSPACE_FIELD];
}

async function choose(editor: EditorHost, value: EditorWorkspace): Promise<void> {
  await change(editor, onlyForm(editor, 'ha-form.workspace-form'), { [WORKSPACE_FIELD]: value });
}

async function display(editor: EditorHost, view: Types.EffectiveView): Promise<void> {
  await change(editor, onlyForm(editor, 'ha-form.display-view-form'), { view });
}

function reports(editor: EditorHost): Array<Record<string, unknown>> {
  const seen: Array<Record<string, unknown>> = [];
  editor.addEventListener('config-changed', (event) => {
    seen.push(
      structuredClone((event as CustomEvent<{ config: Record<string, unknown> }>).detail.config),
    );
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
    compact_days_to_show: 2,
    compact_events_to_show: 3,
    compact_events_complete_days: true,
    today_indicator: true,
    column: { event_font_size: '19px', show_location: true },
    time_grid: { event_font_size: '23px', show_empty_days: true },
  };
}

function assertWorkspaceFields(editor: EditorHost, current: EditorWorkspace): void {
  const main = forms(editor, 'ha-form.panel-form').flatMap((form) => names(form.schema));
  expect(main.length).toBeGreaterThan(50);
  for (const [key, scope] of Object.entries(VIEW_SCOPE)) {
    expect(main.includes(key), `${current}: ${key}`).toBe(scope.has(current));
  }
  expect(main.includes('hour_height')).toBe(current === 'grid');
  expect(main.includes('min_day_width')).toBe(current === 'grid' || current === 'column');
  const entity = names(onlyForm(editor, 'ha-form.entity-form').schema);
  expect(entity.includes('compact_events_to_show')).toBe(current === 'list');
  expect(entity.includes('split_multiday_events')).toBe(current !== 'grid');
  expect(forms(editor, 'ha-form.exception-picker')).toHaveLength(0);
  if (current === 'list') {
    expect(editor.shadowRoot!.querySelectorAll('.width-table')).toHaveLength(0);
  }
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('displayed view and editing workspace are separate controls', () => {
  it('renders both controls above search and declares both to the translation checker', async () => {
    const editor = await mount({ view: 'grid' });
    const controls = forms(editor, '.view-controls > ha-form');
    expect(controls.map((form) => form.className)).toEqual(['display-view-form', 'workspace-form']);
    expect(controls[0].computeLabel(controls[0].schema[0])).toBe('Card Displays');
    expect(controls[1].computeLabel(controls[1].schema[0])).toBe('Editing Settings For');
    expect(
      [...editor.shadowRoot!.querySelector('.card-config')!.children]
        .slice(0, 2)
        .map((el) => el.className),
    ).toEqual(['view-controls', 'filter-bar']);
    expect(chassisSubforms().flatMap((subform) => names(subform.schema))).toEqual([
      'view',
      WORKSPACE_FIELD,
      'search',
      'customized_only',
    ]);
    expect(forms(editor, 'ha-form.panel-form').flatMap((form) => names(form.schema))).not.toContain(
      'view',
    );

    const node = controls[1].schema[0];
    expect(node).toHaveProperty('required', true);
    if (!('selector' in node) || !('select' in node.selector))
      throw new Error('Workspace is not a select');
    expect(
      node.selector.select?.options.map((option) =>
        typeof option === 'string' ? option : option.value,
      ),
    ).toEqual(EXPECTED_WORKSPACES);
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
      expect(onlyForm(editor, 'ha-form.display-view-form').data.view).toBe(view);
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
        expect(onlyForm(editor, 'ha-form.display-view-form').data.view).toBe(view);
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
    await change(editor, owner(editor, 'title'), { title: 'Example' });
    expect(seen).toEqual([{ entities: [{ entity: 'calendar.anna' }], title: 'Example' }]);
  });

  it('writes presentation values into the editing workspace without changing List', async () => {
    const editor = await mount();
    const seen = reports(editor);
    await choose(editor, 'grid');
    await change(editor, owner(editor, 'event_font_size'), { event_font_size: '27px' });
    expect(seen).toEqual([
      { entities: [{ entity: 'calendar.anna' }], time_grid: { event_font_size: '27px' } },
    ]);
    expect(workspace(editor)).toBe('grid');
  });

  it('keeps the workspace event inside the editor and ignores unrelated payload keys', async () => {
    const editor = await mount();
    const seen = reports(editor);
    const escaped = vi.fn();
    editor.addEventListener('value-changed', escaped);
    await change(editor, onlyForm(editor, 'ha-form.workspace-form'), {
      [WORKSPACE_FIELD]: 'grid',
      view: 'column',
      title: 'Not a config edit',
    });
    expect(workspace(editor)).toBe('grid');
    expect(onlyForm(editor, 'ha-form.display-view-form').data.view).toBe('list');
    expect(escaped).not.toHaveBeenCalled();
    expect(seen).toEqual([]);
  });

  it('reports an invalid workspace without changing either dimension', async () => {
    const editor = await mount();
    const warning = vi.spyOn(Logger, 'warn').mockImplementation(() => {});
    const seen = reports(editor);
    await change(editor, onlyForm(editor, 'ha-form.workspace-form'), {
      [WORKSPACE_FIELD]: 'not-a-workspace',
    });
    expect(workspace(editor)).toBe('list');
    expect(warning).toHaveBeenCalledOnce();
    expect(seen).toEqual([]);
  });

  it('leaves the controls available when search empties the editor', async () => {
    const editor = await mount();
    const seen = reports(editor);
    await change(editor, onlyForm(editor, 'ha-form.filter-form'), {
      search: 'zzznomatch',
      customized_only: false,
    });
    expect(forms(editor, 'ha-form.panel-form')).toHaveLength(0);
    expect(forms(editor, '.view-controls > ha-form')).toHaveLength(2);
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
    await change(editor, owner(editor, 'title'), { title: 'Example' });
    expect(seen).toHaveLength(1);
    editor.setConfig(seen[0]);
    await editor.updateComplete;
    expect(workspace(editor)).toBe('grid');

    editor.setConfig({ entities: ['calendar.ben'], view: 'list' });
    await editor.updateComplete;
    expect(workspace(editor)).toBe('list');
    await display(editor, 'column');
    expect(workspace(editor)).toBe('column');
  });

  it('retains invalid-in-progress text while its workspace is away', async () => {
    const editor = await mount({ start_date: 'today+2' });
    const seen = reports(editor);
    await change(editor, owner(editor, 'start_date_offset'), { start_date_offset: '-' });
    await choose(editor, 'grid');
    await choose(editor, 'list');
    expect(owner(editor, 'start_date_offset').data.start_date_offset).toBe('-');
    expect(seen).toEqual([]);
  });

  it('keeps view values separate across workspace switches and external configurations', async () => {
    const editor = await mount(enabled('list'));
    const seen = reports(editor);
    await choose(editor, 'grid');
    await change(editor, owner(editor, 'title_max_lines'), { title_max_lines: 3 });
    expect(owner(editor, 'title_max_lines').data.title_max_lines).toBe(3);
    await choose(editor, 'column');
    expect(owner(editor, 'title_max_lines').data.title_max_lines).toBe(0);
    await choose(editor, 'grid');
    expect(owner(editor, 'title_max_lines').data.title_max_lines).toBe(3);
    editor.setConfig({ entities: ['calendar.ben'], view: 'grid' });
    await editor.updateComplete;
    expect(owner(editor, 'title_max_lines').data.title_max_lines).toBe(0);
    expect(seen).toHaveLength(1);
  });

  it('diffs a view edit against its projection, not the different displayed view', async () => {
    const editor = await mount({ view: 'list', time_grid: { event_font_size: '23px' } });
    const seen = reports(editor);
    await choose(editor, 'grid');
    expect(seen).toEqual([]);
    await change(editor, owner(editor, 'event_font_size'), {
      event_font_size: '24px',
    });
    expect(seen).toEqual([
      {
        entities: [{ entity: 'calendar.anna' }],
        time_grid: { event_font_size: '24px' },
      },
    ]);
  });
});

it('rejects the removed duplicate Shared workspace without changing configuration', async () => {
  const editor = await mount();
  const seen = reports(editor);
  vi.spyOn(Logger, 'warn').mockImplementation(() => {});
  await change(editor, onlyForm(editor, 'ha-form.workspace-form'), { [WORKSPACE_FIELD]: 'shared' });
  expect(workspace(editor)).toBe('list');
  expect(WORKSPACES).toEqual(VIEWS);
  expect(seen).toEqual([]);
});
