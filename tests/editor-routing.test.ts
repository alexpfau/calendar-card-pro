import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import {
  type FormElement,
  changeField,
  editLayout,
  emitChange,
  fakeHass,
  formOf,
  formsOf,
  mountEditor,
  openPageOf,
  openPanels,
  pressReset,
  resetButton,
  resetButtons,
  valueOf,
} from './helpers/editor-host';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import * as View from '../src/config/view';
import type { CalendarCardProEditor } from '../src/rendering/editor/element';
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
  // Driven off `VIEWS` rather than the `['column', 'grid']` pair this replaced. That pair
  // was written when list had no block and root was list's storage, so it stated the
  // asymmetry as a fact; with `list:` registered it would have gone on passing while
  // saying nothing about the view most cards use.
  it.each(View.VIEWS)('writes %s presentation options only into its block', (workspace) => {
    const config = buildConfig({
      view: 'list',
      event_font_size: '17px',
      list: { day_spacing: '7px' },
      column: { event_spacing: '3em' },
      time_grid: { day_spacing: '2px' },
    });
    const past = !Routing.workspaceFormData(config, workspace).show_past_events;
    const result = apply(config, workspace, { event_font_size: '23px', show_past_events: past });
    const key = View.OVERRIDE_BLOCK_BY_VIEW[workspace]!;

    expect(result.config[key]).toMatchObject({ event_font_size: '23px', show_past_events: past });
    expect(result.config.event_font_size).toBe('17px');
    expect(result.config.view).toBe('list');

    // Every other registered block, found rather than named — the `grid ? column :
    // time_grid` conditional this replaces could only ever check one of two.
    for (const other of View.VIEWS) {
      const otherKey = View.OVERRIDE_BLOCK_BY_VIEW[other]!;
      if (otherKey === key) continue;
      expect(result.config[otherKey], otherKey).toEqual(config[otherKey]);
    }
  });

  it('keeps a card-wide edit at root from every workspace', () => {
    // The layered arrangement's other half. Presentation options route into the
    // workspace's block; a card-wide option has no per-view meaning and must stay at root
    // wherever it was edited, or a title set in Grid would vanish on switching to List.
    for (const workspace of View.VIEWS) {
      const config = buildConfig({ view: 'grid', column: { day_spacing: '4px' } });
      const result = apply(config, workspace, {
        title: 'Example',
        first_day_of_week: 'sunday',
      }).config;
      const key = View.OVERRIDE_BLOCK_BY_VIEW[workspace]!;

      expect(result.title, workspace).toBe('Example');
      expect(result.first_day_of_week, workspace).toBe('sunday');
      expect(result[key] ?? {}, workspace).not.toHaveProperty('title');
      expect(result[key] ?? {}, workspace).not.toHaveProperty('first_day_of_week');
    }
  });

  // Every layout with a day count: Month has none, always drawing six weeks, and its workspace
  // offers no Days To Show to edit (`VIEW_SCOPE`).
  it.each(View.VIEWS.filter((view) => View.appliesToView('days_to_show', view)))(
    'stores a day count edited in %s in that view’s block',
    (workspace) => {
      const config = buildConfig({ view: 'grid', days_to_show: 5 });
      const result = apply(config, workspace, { days_to_show: 9 }).config;
      const key = View.OVERRIDE_BLOCK_BY_VIEW[workspace]!;

      expect(result[key], workspace).toMatchObject({ days_to_show: 9 });
      expect(result.days_to_show, workspace).toBe(5);
    },
  );

  it('stores a day count edited in Shared at root, for every view without its own', () => {
    const config = buildConfig({ view: 'grid', days_to_show: 5, time_grid: { days_to_show: 2 } });
    const current: Routing.FormFrame = {
      workspace: 'shared',
      schema: [{ name: 'days_to_show', selector: { text: {} } }],
      data: Routing.workspaceFormData(config, 'shared'),
    };
    const result = Routing.applyWorkspaceChange(
      config,
      current,
      { ...current.data, days_to_show: 9 },
      {},
    ).config;

    expect(result.days_to_show).toBe(9);
    expect(result.time_grid).toEqual({ days_to_show: 2 });
    expect(result.list).toBeUndefined();
    expect(result.column).toBeUndefined();
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

describe('typed lengths keep their raw text in the form', () => {
  it.each(lengthKeys)('%s can be typed without inserting pixels mid-word', (key) => {
    // A folded length or font size is not written mid-word: `2r` is neither a size an icon
    // can be drawn at nor a font size, so it is held like any value invalid only while being
    // typed, and the stored size stays the last one that parsed (#620). The form still shows
    // what was typed, which is the behavior this test is about.
    const folded = Config.FOLDED_OPTIONS.includes(key);
    for (const workspace of ['column', 'grid'] as const) {
      let config = buildConfig({ [key]: '4px' });
      let pending: Record<string, string> = {};
      const block = View.OVERRIDE_BLOCK_BY_VIEW[workspace]!;
      for (const text of ['2', '2r', '2re', '2rem']) {
        const current = frame(config, workspace, key);
        current.data = Routing.workspaceFormData(config, workspace, pending);
        const result = Routing.applyWorkspaceChange(
          config,
          current,
          { ...current.data, [key]: text },
          pending,
        );
        config = result.config;
        pending = result.pending;
        const unfinished = text === '2r' || text === '2re';
        const stored = text === '2' || (folded && unfinished) ? '2px' : text;
        expect(Routing.workspaceFormData(config, workspace, pending)[key]).toBe(text);
        expect(config[block]).toHaveProperty(key, stored);
      }
    }
  });

  it('does not leak List text into a view with an equal explicit value', () => {
    const config = buildConfig({
      event_font_size: '2px',
      column: { event_font_size: '2px' },
      time_grid: { event_font_size: '2px' },
    });
    const current = frame(config, 'list', 'event_font_size');
    const result = Routing.applyWorkspaceChange(
      config,
      current,
      { ...current.data, event_font_size: '2' },
      {},
    );
    expect(Routing.workspaceFormData(config, 'list', result.pending).event_font_size).toBe('2');
    for (const view of ['column', 'grid'] as const) {
      expect(Routing.workspaceFormData(config, view, result.pending).event_font_size).toBe('2px');
    }
  });

  it('does not let held text mask a changed effective value', () => {
    const config = buildConfig({ time_grid: { event_font_size: '2px' } });
    const current = frame(config, 'grid', 'event_font_size');
    const result = Routing.applyWorkspaceChange(
      config,
      current,
      { ...current.data, event_font_size: '2' },
      {},
    );
    expect(Routing.workspaceFormData(config, 'grid', result.pending).event_font_size).toBe('2');
    expect(
      Routing.workspaceFormData(
        { ...config, time_grid: { event_font_size: '5px' } },
        'grid',
        result.pending,
      ).event_font_size,
    ).toBe('5px');
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

async function mount(extra: Record<string, unknown> = {}) {
  const editor = await mountEditor(
    buildConfig({
      config_version: Config.CURRENT_CONFIG_VERSION,
      view: 'grid',
      event_font_size: '17px',
      column: { event_font_size: '19px' },
      time_grid: { event_font_size: '23px' },
      ...extra,
    }),
    // Every setting a page can draw: these read forms the shown set would leave in Add rows.
    { hass: fakeHass(), every: true },
  );
  // A closed panel mounts no form: open every panel, as these tests read forms across the editor.
  await openPanels(editor);
  const seen: Record<string, unknown>[] = [];
  editor.addEventListener('config-changed', (event) =>
    seen.push(
      (() => {
        const config = structuredClone((event as CustomEvent).detail.config);
        delete config.config_version;
        return config;
      })(),
    ),
  );
  return { editor, seen };
}
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('rendered form frames preserve edit intent', () => {
  /**
   * 🚨 Shared, not List, and the move is the whole point of the layered arrangement.
   * Root used to be list's storage, so clearing a value from the List workspace cleared
   * root. With `list:` registered, List writes into its own block and root is the shared
   * base — so this case had to follow root to the workspace that now owns it. Left on
   * List it would have gone on passing the moment anything put a `list:` value in the
   * fixture, while testing something else entirely.
   */
  it('clears a root option without restoring it from the previous object', async () => {
    const { editor, seen } = await mount();
    await editLayout(editor, 'shared');
    await changeField(editor, 'events:event_font_size', undefined);
    expect(seen).toHaveLength(1);
    expect(seen[0]).not.toHaveProperty('event_font_size');
    expect(seen[0].column).toEqual({ event_font_size: '19px' });
    expect(seen[0].time_grid).toEqual({ event_font_size: '23px' });
    expect(valueOf(editor, 'events:event_font_size')).toBe('14px');
    // Over a second in a full local run; the limit is set for CI's slower runner under load
    // rather than for a hang.
  }, 30_000);

  /**
   * The other half, and the one that is new. Clearing from List drops the *list* override
   * and leaves the shared base standing — so the control falls back to root rather than to
   * the shipped default, which is what distinguishes layered from three parallel views.
   */
  it('clears a list override back to the shared base rather than to the default', async () => {
    const { editor, seen } = await mount({ list: { event_font_size: '21px' } });
    await editLayout(editor, 'list');

    expect(valueOf(editor, 'events:event_font_size')).toBe('21px');

    await changeField(editor, 'events:event_font_size', undefined);

    expect(seen).toHaveLength(1);
    expect(seen[0]).not.toHaveProperty('list');
    expect(seen[0].event_font_size).toBe('17px');
    expect(valueOf(editor, 'events:event_font_size')).toBe('17px');
    // Over a second in a full local run; the limit is set for CI's slower runner under load
    // rather than for a hang.
  }, 30_000);

  it('clears root values written by a synthetic mode control', async () => {
    const { editor, seen } = await mount();
    editor.setConfig(
      buildConfig({
        config_version: Config.CURRENT_CONFIG_VERSION,
        start_date: 'today+7',
      }),
    );
    await editor.updateComplete;
    await changeField(editor, 'content:start_date_mode', 'default');
    expect(seen).toHaveLength(1);
    expect(seen[0]).not.toHaveProperty('start_date');
    expect(valueOf(editor, 'content:start_date_mode')).toBe('default');
  });

  it.each(['column', 'grid'] as const)(
    'still clears a %s value through the nested write path',
    async (view) => {
      const { editor, seen } = await mount();
      await editLayout(editor, view);
      await changeField(editor, 'events:event_font_size', undefined);
      expect(seen).toHaveLength(1);
      expect(seen[0]).not.toHaveProperty(`${View.OVERRIDE_BLOCK_BY_VIEW[view]}.event_font_size`);
      expect(seen[0].event_font_size).toBe('17px');
      expect(valueOf(editor, 'events:event_font_size')).toBe(view === 'grid' ? '12px' : '17px');
      // Over a second in a full local run; the limit is set for CI's slower runner under load
      // rather than for a hang.
    },
    30_000,
  );

  it.each(View.VIEWS)(
    'keeps %s font input intact through renders and save echoes',
    async (view) => {
      const { editor, seen } = await mount();
      await editLayout(editor, view);
      editor.addEventListener('config-changed', (event) =>
        editor.setConfig((event as CustomEvent<{ config: Types.Config }>).detail.config),
      );
      for (const text of ['2', '24', '24p', '24px']) {
        await changeField(editor, 'events:event_font_size', text);
        expect(valueOf(editor, 'events:event_font_size')).toBe(text);
      }
      const block = View.OVERRIDE_BLOCK_BY_VIEW[view];
      expect(block ? seen.slice(-1)[0]?.[block] : seen.slice(-1)[0]).toMatchObject({
        event_font_size: '24px',
      });
      // Over a second in a full local run; the limit is set for CI's slower runner under load
      // rather than for a hang.
    },
    30_000,
  );

  it('preserves nested Grid length input, not only top-level overrides', async () => {
    const { editor, seen } = await mount();
    for (const text of ['6', '60', '60p', '60px']) {
      await changeField(editor, 'layout:time_grid.hour_height', text);
      expect(valueOf(editor, 'layout:time_grid')).toHaveProperty('hour_height', text);
    }
    expect(seen.slice(-1)[0]?.time_grid).toHaveProperty('hour_height', '60px');
    // Over a second in a full local run; the limit is set for CI's slower runner under load
    // rather than for a hang.
  }, 30_000);

  it('preserves synthetic height input using the same scoped pending text', async () => {
    const { editor, seen } = await mount();
    await changeField(editor, 'layout:height_mode', 'fixed');
    for (const text of ['2', '24', '24e', '24em']) {
      await changeField(editor, 'layout:card_height', text);
      expect(valueOf(editor, 'layout:card_height')).toBe(text);
    }
    expect(seen.slice(-1)[0]?.time_grid).toHaveProperty('height', '24em');
    // Over a second in a full local run; the limit is set for CI's slower runner under load
    // rather than for a hang.
  }, 30_000);

  it('keeps format-only edits without writing an equivalent override again', async () => {
    const { editor, seen } = await mount();
    await changeField(editor, 'events:event_font_size', '2');
    expect(valueOf(editor, 'events:event_font_size')).toBe('2');
    seen.length = 0;
    await changeField(editor, 'events:event_font_size', '2px');
    expect(valueOf(editor, 'events:event_font_size')).toBe('2px');
    expect(seen).toHaveLength(0);
    // Over a second in a full local run; the limit is set for CI's slower runner under load
    // rather than for a hang.
  }, 30_000);

  it('clears raw length text on reset even when it equals the view default', async () => {
    const { editor } = await mount();
    await changeField(editor, 'events:event_font_size', '12');
    expect(valueOf(editor, 'events:event_font_size')).toBe('12');
    (await resetButton(editor, 'event_font_size'))!.click();
    await editor.updateComplete;
    expect(valueOf(editor, 'events:event_font_size')).toBe('12px');
    // Over a second in a full local run; the limit is set for CI's slower runner under load
    // rather than for a hang.
  }, 30_000);

  it('keeps raw text in its storage scope and clears it on external config', async () => {
    const { editor } = await mount();
    await changeField(editor, 'events:event_font_size', '2');
    expect(valueOf(editor, 'events:event_font_size')).toBe('2');
    await editLayout(editor, 'column');
    expect(valueOf(editor, 'events:event_font_size')).toBe('19px');
    await editLayout(editor, 'grid');
    expect(valueOf(editor, 'events:event_font_size')).toBe('2');
    editor.setConfig(
      buildConfig({
        config_version: Config.CURRENT_CONFIG_VERSION,
        view: 'grid',
        time_grid: { event_font_size: '2px' },
      }),
    );
    await editor.updateComplete;
    expect(valueOf(editor, 'events:event_font_size')).toBe('2px');
    // Over a second in a full local run; the limit is set for CI's slower runner under load
    // rather than for a hang.
  }, 30_000);

  it('routes a delayed edit to the workspace that rendered its form', async () => {
    const { editor, seen } = await mount();
    await openPageOf(editor, 'events:event_font_size');
    const root = editor.shadowRoot!;
    const old = formOf(editor, 'events:event_font_size')!;
    // The page moves to the same topic in Columns, and the form drawn for Grid reports its edit
    // before the page redraws.
    root.querySelector<HTMLButtonElement>('[data-focus="also:column"]')!.click();
    emitChange(old, { 'events:event_font_size': '24px' });
    await editor.updateComplete;
    expect(seen).toHaveLength(1);
    expect(seen[0].time_grid).toMatchObject({ event_font_size: '24px' });
    expect(seen[0].column).toMatchObject({ event_font_size: '19px' });
    expect(valueOf(editor, 'events:event_font_size')).toBe('19px');
  });

  it('keeps a delayed edit with its own field when a gate moves the fields around it', async () => {
    const { editor, seen } = await mount({ view: 'list', list: { event_gap: '7px' } });
    await changeField(editor, 'layout:height_mode', 'fixed');
    // The form the open page draws for it, not one the harness keeps from an earlier visit.
    const spacing = editor.shadowRoot!.querySelector<FormElement>(
      '[data-field="layout:additional_card_spacing"] ha-form',
    )!;
    expect(spacing.isConnected).toBe(true);
    const drawnWith = spacing.data as Record<string, unknown>;
    // Fit Content takes Card Height away, so every field below it moves up one place: changed
    // on the open page, as a user changes it, with nothing reopened around it.
    const mode = editor.shadowRoot!.querySelector<FormElement>(
      '[data-field="layout:height_mode"] ha-form',
    )!;
    emitChange(mode, { 'layout:height_mode': 'auto' });
    await editor.updateComplete;
    // The edit arrives late, as `ha-form` sends it: the data the field was drawn with, changed.
    spacing.dispatchEvent(
      new CustomEvent('value-changed', {
        detail: { value: { ...drawnWith, additional_card_spacing: '12px' } },
      }),
    );
    await editor.updateComplete;
    const last = seen.slice(-1)[0]!;
    const written = { ...last, ...(last.list as object) } as Record<string, unknown>;
    expect(written.additional_card_spacing).toBe('12px');
    expect(written.event_gap).toBe('7px');
  });

  it('does not treat re-derived synthetic values as a second user edit', async () => {
    const { editor, seen } = await mount();
    await openPageOf(editor, 'events:event_color');
    const form = formOf(editor, 'events:event_color')!;
    const size = formOf(editor, 'events:event_font_size')!;
    expect(valueOf(editor, 'events:accent_event_text')).toBe(true);
    emitChange(form, { 'events:event_color': '#112233' });
    // A second color edit masks the stale checkbox by writing the color again.
    // Changing another field, from a form drawn before the first edit, leaves the
    // checkbox's accidental reset exposed.
    emitChange(form, { 'events:event_color': '#112233' });
    emitChange(size, { 'events:event_font_size': '24px' });
    await editor.updateComplete;
    expect(seen.slice(-1)[0]?.time_grid).toMatchObject({
      event_color: '#112233',
      event_font_size: '24px',
    });
    expect(seen.slice(-1)[0]?.time_grid).not.toHaveProperty('time_color');
  });

  it('recognizes a second edit returning to the originally rendered value', async () => {
    const { editor, seen } = await mount();
    const form = formOf(editor, 'events:event_font_size')!;
    emitChange(form, { 'events:event_font_size': '24px' });
    emitChange(form, { 'events:event_font_size': '23px' });
    await editor.updateComplete;
    expect(seen.slice(-1)[0]?.time_grid).toMatchObject({ event_font_size: '23px' });
  });

  it('replaces the picker with a targeted reset that preserves unrelated values', async () => {
    const { editor, seen } = await mount();
    expect(editor.shadowRoot!.querySelector('.exception-picker')).toBeNull();
    const reset = await resetButton(editor, 'event_font_size');
    expect(reset).not.toBeNull();
    reset!.click();
    await editor.updateComplete;
    expect(seen).toHaveLength(1);
    expect(seen[0].time_grid).toBeUndefined();
    expect(seen[0].column).toEqual({ event_font_size: '19px' });
    expect(seen[0].event_font_size).toBe('17px');
    expect(valueOf(editor, 'events:event_font_size')).toBe('12px');
  });
});

/**
 * 🚨 The reset controls are the one place a workspace's *destination* is asked for, and
 * `ctx.view` stopped being able to answer it when `list:` gained a block. The shared
 * workspace builds its panels as list, so `ctx.view` reads `'list'` there — a guard on it
 * offered Shared the reset buttons belonging to `list:`, and clicking one deleted a List
 * override from a workspace that cannot write to `list:` at all.
 *
 * Both directions are pinned. Dropping the shared case lets the regression back in
 * silently; dropping the list case lets a guard that returns nothing everywhere pass.
 */
describe('reset controls follow the workspace destination, not the built view', () => {
  const resetKeys = async (editor: CalendarCardProEditor) =>
    (await resetButtons(editor)).map((node) => node.getAttribute('data-reset-keys'));

  const mountListCard = async () =>
    mount({
      view: 'list',
      event_font_size: '17px',
      list: { event_font_size: '18px' },
      column: {},
      time_grid: {},
    });

  const select = async (editor: CalendarCardProEditor, workspace: string) => {
    await editLayout(editor, workspace);
  };

  it('offers a list override its reset in the List workspace', async () => {
    const { editor } = await mountListCard();
    await select(editor, 'list');
    expect(await resetKeys(editor)).toContain('event_font_size');
  });

  it('resets the top-level line in the shared workspace, and leaves the list override', async () => {
    const { editor, seen } = await mountListCard();
    await select(editor, 'shared');
    await pressReset(editor, 'events:event_font_size');
    expect(seen).toHaveLength(1);
    expect(seen[0]).not.toHaveProperty('event_font_size');
    expect(seen[0].list).toEqual({ event_font_size: '18px' });
    // Over a second in a full local run; the limit is set for CI's slower runner under load
    // rather than for a hang.
  }, 30_000);
});

/**
 * 🚨 The companion to the reset guard: `showsLocation` reaches a block by view name, so
 * naming a view for the shared workspace consults a block that workspace cannot write to.
 * Once `list:` existed, a card that turned locations off in list alone hid `location_icon`
 * in Shared, while column and grid still drew locations.
 *
 * The List arm is the control. Without it a gate that hides the field everywhere passes.
 */
describe('entity subforms resolve show_location against the layer being edited', () => {
  const hasLocationIcon = (editor: CalendarCardProEditor) =>
    formsOf(editor).some((form) => JSON.stringify(form.schema ?? []).includes('location_icon'));

  const openWorkspace = async (editor: CalendarCardProEditor, workspace: string) => {
    await editLayout(editor, workspace);
  };

  const mountLocationCard = async () =>
    mount({
      view: 'list',
      show_location: true,
      list: { show_location: false },
      column: {},
      time_grid: {},
    });

  it('hides the location icon in the workspace whose block turned locations off', async () => {
    const { editor } = await mountLocationCard();
    await openWorkspace(editor, 'list');
    expect(hasLocationIcon(editor)).toBe(false);
  });

  it('keeps the location icon in the shared workspace, which no block covers', async () => {
    const { editor } = await mountLocationCard();
    await openWorkspace(editor, 'shared');
    expect(hasLocationIcon(editor)).toBe(true);
  });

  it('keeps the location icon in workspaces that still draw locations', async () => {
    const { editor } = await mountLocationCard();
    await openWorkspace(editor, 'column');
    expect(hasLocationIcon(editor)).toBe(true);
  });

  it('hides the location icon in grid, whose own default draws no locations, until its block draws them', async () => {
    const { editor } = await mountLocationCard();
    await openWorkspace(editor, 'grid');
    expect(hasLocationIcon(editor)).toBe(false);

    const { editor: shown } = await mount({
      view: 'list',
      show_location: true,
      time_grid: { show_location: true },
    });
    await openWorkspace(shown, 'grid');
    expect(hasLocationIcon(shown)).toBe(true);
    // Over a second in a full local run; the limit is set for CI's slower runner under load
    // rather than for a hang.
  }, 30_000);
});
