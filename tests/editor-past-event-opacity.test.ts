import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import * as View from '../src/config/view';
import { CalendarCardProEditor } from '../src/rendering/editor/element';
import { removeException } from '../src/rendering/editor/exceptions';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import { normalizeFieldValue, normalizeRootValue } from '../src/rendering/editor/normalize';
import { walkSchema } from '../src/rendering/editor/panels';
import * as Routing from '../src/rendering/editor/routing';
import { buildEventsSchema } from '../src/rendering/editor/schemas/events';
import { EDITOR_STRINGS } from '../src/rendering/editor/strings';
import { EDITOR_LANGUAGE_STRINGS } from '../src/rendering/editor/translations';
import * as Value from '../src/rendering/editor/value';
import { WORKSPACES, baseViewForWorkspace } from '../src/rendering/editor/workspace';
import * as Logger from '../src/utils/logger';

customElements.define('editor-opacity-probe', CalendarCardProEditor);

interface Form extends HTMLElement {
  data: Record<string, unknown>;
  schema: HaFormSchema[];
}

function change(form: Form, value: Record<string, unknown>): void {
  form.dispatchEvent(
    new CustomEvent('value-changed', { bubbles: true, composed: true, detail: { value } }),
  );
}

function opacityForm(editor: CalendarCardProEditor): Form {
  const form = [...editor.shadowRoot!.querySelectorAll<Form>('ha-form.panel-form')].find(
    (candidate) =>
      [...walkSchema(candidate.schema)].some(({ node }) => node.name === 'past_event_opacity'),
  );
  if (!form) throw new Error('Past Event Opacity is missing from the rendered editor');
  return form;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('past-event opacity editor contract', () => {
  it.each(WORKSPACES)('places the fractional selector under Event State in %s', (workspace) => {
    const config = buildConfig({ show_past_events: false });
    const schema = buildEventsSchema({
      config,
      workspace,
      view: baseViewForWorkspace(workspace),
      language: 'en',
    });
    const names = schema.map((node) => node.name);
    const start = names.indexOf('show_progress_bar');
    expect(start).toBeGreaterThan(0);
    expect(names.slice(start, start + 4)).toEqual([
      'show_progress_bar',
      'heading_event_state',
      'past_event_opacity',
      'heading_accent',
    ]);
    expect(schema.find((node) => node.name === 'past_event_opacity')).toEqual({
      name: 'past_event_opacity',
      selector: {
        number: { min: 0, max: 100, step: 'any', mode: 'box', unit_of_measurement: '%' },
      },
    });
  });

  it('translates every new string in every hand-maintained editor language', () => {
    const languages = Object.entries(EDITOR_LANGUAGE_STRINGS).filter(([lang]) => lang !== 'en-gb');
    expect(languages.length).toBeGreaterThan(0);
    for (const key of ['heading_event_state', 'past_event_opacity', 'past_event_opacity.helper']) {
      expect(EDITOR_STRINGS[key]).toBeTruthy();
      for (const [language, strings] of languages) {
        expect(strings[key], `${language}: ${key}`).toBeTruthy();
        expect(strings[key], `${language}: ${key}`).not.toBe(EDITOR_STRINGS[key]);
      }
    }
  });

  it.each([undefined, null, '', '   ', false, true, NaN, Infinity, -1, 101, 'invalid'])(
    'normalizes %s to a removed key without changing other null semantics',
    (value) => {
      expect(normalizeRootValue('past_event_opacity', value)).toBeUndefined();
      expect(normalizeRootValue('show_week_numbers', null)).toBeNull();
      for (const view of View.VIEWS) {
        const block = View.OVERRIDE_BLOCK_BY_VIEW[view]!;
        expect(
          normalizeFieldValue(buildConfig(), [block], 'past_event_opacity', value),
        ).toBeUndefined();
        const config: Types.Config = {
          ...buildConfig(),
          ...{ past_event_opacity: value, [block]: { past_event_opacity: value } },
        } as Types.Config;
        const stored = Value.toStoredConfig(config);
        expect(stored).not.toHaveProperty('past_event_opacity');
        expect(stored).not.toHaveProperty(block);
      }
    },
  );

  it('retains raw authored values through an unrelated edit and existing sparse policies', () => {
    const config = {
      ...buildConfig(),
      past_event_opacity: '75.25',
      list: { past_event_opacity: '75.25' },
      column: { past_event_opacity: '75.25' },
      time_grid: { past_event_opacity: '0' },
    } as unknown as Types.Config;
    const stored = Value.toStoredConfig(config);
    expect(stored.past_event_opacity).toBe('75.25');
    expect(stored.list).toEqual({ past_event_opacity: '75.25' });
    expect(stored.column).toBeUndefined();
    expect(stored.time_grid).toEqual({ past_event_opacity: '0' });
    expect(Value.toStoredConfig({ ...config, title: 'Example agenda' })).toEqual({
      ...stored,
      title: 'Example agenda',
    });
  });

  it.each(View.VIEWS)(
    'resets %s opacity to inheritance without touching adjacent options',
    (view) => {
      const block = View.OVERRIDE_BLOCK_BY_VIEW[view]!;
      const config = buildConfig({
        past_event_opacity: 75.25,
        [block]: { past_event_opacity: 0, day_spacing: '2em' },
      });
      const reset = removeException(config, block, 'past_event_opacity');
      expect(reset[block]).toEqual({ day_spacing: '2em' });
      expect(View.resolveEffectiveConfig(reset, view).past_event_opacity).toBe(75.25);
      expect(config[block]).toHaveProperty('past_event_opacity', 0);
    },
  );

  it.each(WORKSPACES)(
    'saves, clears, reopens and routes delayed %s number edits',
    async (workspace) => {
      const editor = document.createElement('editor-opacity-probe') as CalendarCardProEditor;
      editor.hass = { states: {}, locale: { language: 'en' } } as Types.Hass;
      const reports: Record<string, unknown>[] = [];
      editor.addEventListener('config-changed', (event) =>
        reports.push((event as CustomEvent).detail.config),
      );
      editor.setConfig({
        config_version: Config.CURRENT_CONFIG_VERSION,
        entities: ['calendar.anna'],
        view: 'grid',
        past_event_opacity: 75.25,
      } as Types.Config);
      document.body.appendChild(editor);
      await editor.updateComplete;
      expect(reports).toHaveLength(0);
      change(editor.shadowRoot!.querySelector<Form>('.workspace-form')!, {
        editing_workspace: workspace,
      });
      await editor.updateComplete;
      expect(reports).toHaveLength(0);

      const origin = opacityForm(editor);
      expect(origin.data.past_event_opacity).toBe(75.25);
      const other = workspace === 'grid' ? 'list' : 'grid';
      change(editor.shadowRoot!.querySelector<Form>('.workspace-form')!, {
        editing_workspace: other,
      });
      await editor.updateComplete;
      change(origin, { ...origin.data, past_event_opacity: '0' });
      await editor.updateComplete;
      const block = Routing.destination('past_event_opacity', workspace);
      const saved = reports.at(-1)!;
      expect(saved.view).toBe('grid');
      if (block) {
        expect(saved[block]).toEqual({ past_event_opacity: 0 });
        expect(saved.past_event_opacity).toBe(75.25);
      } else {
        expect(saved.past_event_opacity).toBe(0);
      }

      editor.setConfig(saved as unknown as Types.Config);
      await editor.updateComplete;
      change(editor.shadowRoot!.querySelector<Form>('.workspace-form')!, {
        editing_workspace: workspace,
      });
      await editor.updateComplete;
      expect(opacityForm(editor).data.past_event_opacity).toBe(0);
      for (const input of ['1', '12', '12.5', 100]) {
        const form = opacityForm(editor);
        change(form, { ...form.data, past_event_opacity: input });
        await editor.updateComplete;
        expect(opacityForm(editor).data.past_event_opacity).toBe(Number(input));
      }
      const form = opacityForm(editor);
      change(form, { ...form.data, past_event_opacity: null });
      await editor.updateComplete;
      const cleared = reports.at(-1)!;
      if (block) expect(cleared).not.toHaveProperty(block);
      else expect(cleared).not.toHaveProperty('past_event_opacity');
      expect(opacityForm(editor).data.past_event_opacity).toBe(block ? 75.25 : 60);
      const before = reports.length;
      editor.setConfig(cleared as unknown as Types.Config);
      await editor.updateComplete;
      expect(reports).toHaveLength(before);
    },
  );

  it('reports an invalid form value rather than turning false into zero', () => {
    const warning = vi.spyOn(Logger, 'warn').mockImplementation(() => {});
    const config = buildConfig({ past_event_opacity: 75, list: { past_event_opacity: 20 } });
    const frame: Routing.FormFrame = {
      workspace: 'list',
      schema: [{ name: 'past_event_opacity', selector: { number: { min: 0, max: 100 } } }],
      data: Routing.workspaceFormData(config, 'list'),
    };
    const result = Routing.applyWorkspaceChange(
      config,
      frame,
      { ...frame.data, past_event_opacity: false },
      {},
    );
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('list.past_event_opacity'));
    expect(Value.toStoredConfig(result.config).list).toBeUndefined();
    expect(View.resolveEffectiveConfig(result.config, 'list').past_event_opacity).toBe(75);
  });
});
