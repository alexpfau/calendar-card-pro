import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import * as View from '../src/config/view';
import { CalendarCardProEditor } from '../src/rendering/editor/element';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import * as Routing from '../src/rendering/editor/routing';
import * as Synthetic from '../src/rendering/editor/synthetic';
import * as Value from '../src/rendering/editor/value';

function frame(
  config: Types.Config,
  workspace: Types.EffectiveView,
  ...keys: string[]
): Routing.FormFrame {
  return {
    workspace,
    schema: keys.map((name) => ({ name, selector: { text: {} } })),
    data: Routing.workspaceFormData(config, workspace),
  };
}

function apply(
  config: Types.Config,
  workspace: Types.EffectiveView,
  values: Record<string, unknown>,
) {
  const current = frame(config, workspace, ...Object.keys(values));
  return Routing.applyWorkspaceChange(config, current, { ...current.data, ...values }, {});
}

const defaults = Config.DEFAULT_CONFIG as unknown as Record<string, unknown>;
const lengthKeys = View.COLUMN_OVERRIDE_KEYS.filter(
  (key) =>
    (typeof defaults[key] === 'string' && /^-?[\d.]+px$/.test(defaults[key])) ||
    Config.LENGTH_OPTIONS_WITHOUT_PIXEL_DEFAULT.has(key),
);

describe('workspace routing uses the actual destination', () => {
  it.each(['column', 'grid'] as const)(
    'writes %s presentation options only into its block',
    (workspace) => {
      const config = buildConfig({
        view: 'list',
        event_font_size: '17px',
        column: { event_spacing: '3em' },
        time_grid: { day_spacing: '2px' },
      });
      const past = !Routing.workspaceFormData(config, workspace).show_past_events;
      const result = apply(config, workspace, { event_font_size: '23px', show_past_events: past });
      const key = View.OVERRIDE_BLOCK_BY_VIEW[workspace]!;
      expect(result.config[key]).toMatchObject({ event_font_size: '23px', show_past_events: past });
      expect(result.config.event_font_size).toBe('17px');
      expect(result.config.view).toBe('list');
      expect(result.config[workspace === 'grid' ? 'column' : 'time_grid']).toEqual(
        config[workspace === 'grid' ? 'column' : 'time_grid'],
      );
    },
  );

  it('keeps List and card-wide edits at root while preserving explicit view values', () => {
    const config = buildConfig({
      view: 'grid',
      day_spacing: '10px',
      column: { day_spacing: '4px' },
      time_grid: { day_spacing: '2px' },
    });
    const list = apply(config, 'list', { day_spacing: '3em' }).config;
    expect(list.day_spacing).toBe('3em');
    expect(list.column).toEqual(config.column);
    expect(list.time_grid).toEqual(config.time_grid);
    const global = apply(list, 'grid', { title: 'Example', days_to_show: 9 }).config;
    expect(global.title).toBe('Example');
    expect(global.days_to_show).toBe(9);
    expect(global.time_grid).not.toHaveProperty('title');
    expect(global.time_grid).not.toHaveProperty('days_to_show');
  });

  it('projects each view rather than the card’s displayed view', () => {
    const config = buildConfig({
      view: 'list',
      event_font_size: '17px',
      column: { event_font_size: '19px' },
      time_grid: { event_font_size: '23px' },
    });
    expect(Routing.workspaceFormData(config, 'list').event_font_size).toBe('17px');
    expect(Routing.workspaceFormData(config, 'column').event_font_size).toBe('19px');
    expect(Routing.workspaceFormData(config, 'grid').event_font_size).toBe('23px');
    expect(config.view).toBe('list');
  });

  it('does not modify fields absent from the emitting schema', () => {
    const config = buildConfig({ empty_day_color: '#123456', column: { event_font_size: '19px' } });
    const current = frame(config, 'grid', 'event_font_size');
    const incoming: Record<string, unknown> = {
      ...current.data,
      view: 'column',
      event_font_size: '23px',
    };
    delete incoming.empty_day_color;
    const result = Routing.applyWorkspaceChange(config, current, incoming, {}).config;
    expect(result.view).toBe('list');
    expect(result.empty_day_color).toBe('#123456');
    expect(result.column).toEqual(config.column);
    expect(result.time_grid).toEqual({ event_font_size: '23px' });
  });

  it('merges a nested edit without losing other view-only or unknown block entries', () => {
    const config = buildConfig({
      time_grid: { hour_height: '48px', show_axis_labels: false, axis_width: '5em' },
    });
    const current: Routing.FormFrame = {
      workspace: 'grid',
      schema: [
        {
          type: 'grid',
          name: 'time_grid',
          schema: [{ name: 'hour_height', selector: { text: {} } }],
        },
      ],
      data: Routing.workspaceFormData(config, 'grid'),
    };
    const next = { ...current.data, time_grid: { hour_height: 60 } };
    const result = Routing.applyWorkspaceChange(config, current, next, {}).config;
    expect(result.time_grid).toEqual({
      hour_height: '60px',
      show_axis_labels: false,
      axis_width: '5em',
    });
    expect(config.time_grid?.hour_height).toBe('48px');
  });
});

describe('coerced-against-coerced comparisons', () => {
  it('derives a nonempty length corpus from defaults independently of the coercer', () => {
    expect(lengthKeys.length).toBeGreaterThan(20);
    expect(lengthKeys).toContain('height');
    expect(lengthKeys).toContain('progress_bar_width');
  });

  it.each(lengthKeys)(
    '%s does not create an override when a pixel string returns as a number',
    (key) => {
      for (const workspace of ['column', 'grid'] as const) {
        const config = buildConfig({ [key]: '4px' });
        const current = frame(config, workspace, key);
        const value = current.data[key];
        if (typeof value !== 'string' || !/^-?[\d.]+px$/.test(value)) {
          // View defaults such as progress_bar_width: 100% are not numeric pixel echoes.
          const block = View.OVERRIDE_BLOCK_BY_VIEW[workspace]!;
          const explicit = buildConfig({ [key]: '4px', [block]: { [key]: '4px' } });
          const rendered = frame(explicit, workspace, key);
          expect(
            Routing.applyWorkspaceChange(explicit, rendered, { ...rendered.data, [key]: 4 }, {})
              .config,
          ).toEqual(explicit);
        } else {
          const incoming = Number(value.slice(0, -2));
          expect(
            Routing.applyWorkspaceChange(config, current, { ...current.data, [key]: incoming }, {})
              .config,
          ).toEqual(config);
        }
      }
    },
  );

  it.each(lengthKeys)('%s retains non-pixel units on a real edit', (key) => {
    for (const workspace of ['column', 'grid'] as const) {
      const config = buildConfig({ [key]: '4px' });
      const result = apply(config, workspace, { [key]: '2rem' }).config;
      const block = View.OVERRIDE_BLOCK_BY_VIEW[workspace]!;
      expect(result[block]).toMatchObject({ [key]: '2rem' });
      expect(result[key]).toBe('4px');
    }
  });

  it('strips equivalent inherited lengths but keeps explicit divergent values', () => {
    const config = buildConfig({
      event_spacing: 4,
      column: { event_spacing: '4px' },
      time_grid: { event_spacing: '4px', event_font_size: '12px' },
    } as unknown as Partial<Types.Config>);
    expect(Value.toStoredConfig(config).column).toBeUndefined();
    expect(Value.toStoredConfig(config).time_grid).toEqual({ event_font_size: '12px' });
  });

  it('coerces the last emitted baseline as well as the next payload', () => {
    const config = buildConfig({ view: 'list' });
    const current = frame(config, 'grid', 'event_font_size', 'event_background_opacity');
    expect(current.data.event_font_size).toBe('12px');
    current.data = { ...current.data, event_font_size: 12 };
    const result = Routing.applyWorkspaceChange(
      config,
      current,
      {
        ...current.data,
        event_background_opacity: 37,
      },
      {},
    ).config;
    expect(result.time_grid).toEqual({ event_background_opacity: 37 });
    expect(result.event_font_size).toBe(Config.DEFAULT_CONFIG.event_font_size);
  });
});

describe('synthetic edits are routed as real options', () => {
  it.each(['column', 'grid'] as const)(
    'uses %s values for a mode change without touching other views',
    (workspace) => {
      const config = buildConfig({
        height: '500px',
        max_height: '700px',
        show_week_numbers: 'iso',
        today_indicator: 'mdi:star',
        remove_location_country: true,
      });
      const result = apply(config, workspace, {
        height_mode: 'auto',
        week_number_mode: 'none',
        today_indicator_style: 'none',
        location_country_mode: 'keep',
      }).config;
      const block = View.OVERRIDE_BLOCK_BY_VIEW[workspace]!;
      expect(result[block]).toMatchObject({
        height: 'auto',
        max_height: 'none',
        show_week_numbers: null,
        today_indicator: false,
        remove_location_country: false,
      });
      expect(result.height).toBe('500px');
      expect(result.today_indicator).toBe('mdi:star');
      expect(result[block]).not.toHaveProperty('height_mode');
    },
  );

  it('routes all governed text colors together without mirroring them at root', () => {
    const config = buildConfig({ view: 'list', event_color: '#123456' });
    const result = apply(config, 'grid', { accent_event_text: false }).config;
    expect(result.event_color).toBe('#123456');
    for (const key of Synthetic.configKeysForField('accent_event_text')) {
      expect(result.time_grid).toHaveProperty(key, defaults[key]);
    }
    expect(Routing.workspaceFormData(result, 'grid').accent_event_text).toBe(false);
  });

  it('keeps pending values local to their storage scope', () => {
    const config = buildConfig({
      height: '300px',
      column: { height: '400px' },
      time_grid: { height: '500px' },
    });
    const current = frame(config, 'grid', 'card_height');
    const result = Routing.applyWorkspaceChange(
      config,
      current,
      { ...current.data, card_height: '' },
      {},
    );
    expect(result.config).toEqual(config);
    expect(result.pending).toEqual({ 'time_grid.card_height': '' });
    expect(Routing.workspaceFormData(config, 'grid', result.pending).card_height).toBe('');
    expect(Routing.workspaceFormData(config, 'column', result.pending).card_height).toBe('400px');
    expect(Routing.workspaceFormData(config, 'list', result.pending).card_height).toBe('300px');
  });

  it('reconciles every synthetic target against Config and actual writes', () => {
    const source = readFileSync('src/config/types.ts', 'utf8');
    const declaration = source.match(/export interface Config\s*\{([\s\S]*?)\n\}/);
    expect(declaration).not.toBeNull();
    const known = new Set(
      [...declaration![1].matchAll(/^ {2}([a-z0-9_]+)\??:/gm)].map((match) => match[1]),
    );
    expect(known.size).toBeGreaterThan(90);
    const values: unknown[] = [
      undefined,
      '',
      true,
      false,
      'fixed',
      'maximum',
      'auto',
      'offset',
      'default',
      'custom',
      'system',
      '24',
      '12',
      'iso',
      'simple',
      'none',
      'off',
      'time',
      'title',
      'builtin',
      'keep',
      'home_assistant',
      'accent',
      'text',
      'icon',
      'dot',
      'pulse',
      'glow',
      'mdi:star',
      '⭐',
      'today+7',
      '2rem',
      ['calendar.anna'],
    ];
    for (const [name, field] of Object.entries(Synthetic.SYNTHETIC_FIELDS)) {
      expect(field.configKeys.length, name).toBeGreaterThan(0);
      expect(new Set(field.configKeys).size, name).toBe(field.configKeys.length);
      for (const key of field.configKeys) expect(known.has(key), `${name}: ${key}`).toBe(true);
      const written = new Set(
        values.flatMap((value) =>
          Object.keys(Synthetic.applySyntheticChange(name, value, buildConfig()).changes),
        ),
      );
      expect([...written].sort(), name).toEqual([...field.configKeys].sort());
    }
    expect(Synthetic.isSyntheticKey('toString')).toBe(false);
  });
});

customElements.define('editor-routing-test', CalendarCardProEditor);
interface Form extends HTMLElement {
  data: Record<string, unknown>;
  schema: ReadonlyArray<HaFormSchema>;
}
function owner(editor: CalendarCardProEditor, key: string): Form {
  const form = [...editor.shadowRoot!.querySelectorAll<Form>('ha-form.panel-form')].find(
    (candidate) =>
      [...Routing.workspaceFields(candidate.schema)].some(({ node }) => node.name === key),
  );
  if (!form) throw new Error(`No form for ${key}`);
  return form;
}
function emit(form: Form, data: Record<string, unknown>): void {
  form.dispatchEvent(
    new CustomEvent('value-changed', { detail: { value: data }, bubbles: true, composed: true }),
  );
}
async function mount() {
  const editor = new CalendarCardProEditor();
  editor.hass = {
    states: {},
    locale: { language: 'en' },
    callApi: async () => [],
    callService: () => {},
  };
  editor.setConfig(
    buildConfig({
      view: 'grid',
      event_font_size: '17px',
      column: { event_font_size: '19px' },
      time_grid: { event_font_size: '23px' },
    }),
  );
  document.body.appendChild(editor);
  await editor.updateComplete;
  const seen: Record<string, unknown>[] = [];
  editor.addEventListener('config-changed', (event) =>
    seen.push(structuredClone((event as CustomEvent).detail.config)),
  );
  return { editor, seen };
}
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('rendered form frames preserve edit intent', () => {
  it('routes a delayed edit to the workspace that rendered its form', async () => {
    const { editor, seen } = await mount();
    const old = owner(editor, 'event_font_size');
    const workspace = editor.shadowRoot!.querySelector<Form>('ha-form.workspace-form')!;
    emit(workspace, { editing_workspace: 'column' });
    emit(old, { ...old.data, event_font_size: '24px' });
    await editor.updateComplete;
    expect(seen).toHaveLength(1);
    expect(seen[0].time_grid).toMatchObject({ event_font_size: '24px' });
    expect(seen[0].column).toMatchObject({ event_font_size: '19px' });
    expect(owner(editor, 'event_font_size').data.event_font_size).toBe('19px');
  });

  it('does not treat re-derived synthetic values as a second user edit', async () => {
    const { editor, seen } = await mount();
    const form = owner(editor, 'event_color');
    const data = { ...form.data };
    expect(data.accent_event_text).toBe(true);
    emit(form, { ...data, event_color: '#112233' });
    // A second color edit masks the stale checkbox by writing the color again.
    // Changing another field leaves the checkbox's accidental reset exposed.
    emit(form, { ...data, event_color: '#112233', event_font_size: '24px' });
    await editor.updateComplete;
    expect(seen.at(-1)?.time_grid).toMatchObject({
      event_color: '#112233',
      event_font_size: '24px',
    });
    expect(seen.at(-1)?.time_grid).not.toHaveProperty('time_color');
  });

  it('recognizes a second edit returning to the originally rendered value', async () => {
    const { editor, seen } = await mount();
    const form = owner(editor, 'event_font_size');
    const data = { ...form.data };
    emit(form, { ...data, event_font_size: '24px' });
    emit(form, { ...data, event_font_size: '23px' });
    await editor.updateComplete;
    expect(seen.at(-1)?.time_grid).toMatchObject({ event_font_size: '23px' });
  });

  it('replaces the picker with a targeted reset that preserves unrelated values', async () => {
    const { editor, seen } = await mount();
    expect(editor.shadowRoot!.querySelector('.exception-picker')).toBeNull();
    const reset = editor.shadowRoot!.querySelector<HTMLButtonElement>(
      '[data-reset-keys="event_font_size"]',
    );
    expect(reset).not.toBeNull();
    reset!.click();
    await editor.updateComplete;
    expect(seen).toHaveLength(1);
    expect(seen[0].time_grid).toBeUndefined();
    expect(seen[0].column).toEqual({ event_font_size: '19px' });
    expect(seen[0].event_font_size).toBe('17px');
    expect(owner(editor, 'event_font_size').data.event_font_size).toBe('12px');
  });
});
