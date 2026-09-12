/**
 * The v5 editor migration distinguishes legacy List authorship from intentional shared
 * values, then records the answer so no later save has to guess again.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import '../src/calendar-card-pro';
import { FROZEN_NOW } from './fixtures';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import * as View from '../src/config/view';
import { CalendarCardProEditor } from '../src/rendering/editor/element';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import { workspaceFields } from '../src/rendering/editor/routing';
import { EDITOR_STRINGS } from '../src/rendering/editor/strings';
import { EDITOR_LANGUAGE_STRINGS } from '../src/rendering/editor/translations/index';
import { listRelocationKeys } from '../src/rendering/editor/value';
import { groupEventsByDay } from '../src/utils/events';

const TAG = 'editor-config-migration-test';
customElements.define(TAG, CalendarCardProEditor);

interface EditorHost extends HTMLElement {
  hass: unknown;
  setConfig(config: Record<string, unknown>): void;
  readonly updateComplete: Promise<unknown>;
}

interface Form extends HTMLElement {
  schema: ReadonlyArray<HaFormSchema>;
  data: Record<string, unknown>;
}

interface ExpandableCard extends HTMLElement {
  config: Types.Config;
  isExpanded: boolean;
  setConfig(config: Record<string, unknown>): void;
  handleAction(action: Types.ActionConfig): void;
}

async function mount(config: Record<string, unknown>) {
  const editor = document.createElement(TAG) as EditorHost;
  editor.hass = { states: {}, locale: { language: 'en' } };
  editor.setConfig({ entities: ['calendar.anna'], ...config });
  document.body.appendChild(editor);
  await editor.updateComplete;
  const reports: Record<string, unknown>[] = [];
  editor.addEventListener('config-changed', (event) => {
    reports.push(
      structuredClone((event as CustomEvent<{ config: Record<string, unknown> }>).detail.config),
    );
  });
  return { editor, reports };
}

function blocker(editor: EditorHost): HTMLElement | null {
  return editor.shadowRoot!.querySelector('[data-config-migration]');
}

function forms(editor: EditorHost): Form[] {
  return [...editor.shadowRoot!.querySelectorAll<Form>('ha-form')];
}

function formFor(editor: EditorHost, key: string): Form {
  const matches = forms(editor).filter(
    (form) =>
      !form.classList.contains('entity-form') &&
      [...workspaceFields(form.schema)].some(({ node }) => node.name === key),
  );
  expect(matches, `form for ${key}`).toHaveLength(1);
  return matches[0];
}

async function change(editor: EditorHost, key: string, value: unknown): Promise<void> {
  const form = formFor(editor, key);
  form.dispatchEvent(
    new CustomEvent('value-changed', {
      detail: { value: { ...form.data, [key]: value } },
      bubbles: true,
      composed: true,
    }),
  );
  await editor.updateComplete;
}

async function choose(editor: EditorHost, choice: 'keep-list' | 'shared-root'): Promise<void> {
  const buttons = [...blocker(editor)!.querySelectorAll<HTMLButtonElement>('button')];
  expect(buttons).toHaveLength(2);
  buttons[choice === 'keep-list' ? 0 : 1].click();
  await editor.updateComplete;
}

function merged(config: Record<string, unknown>): Types.Config {
  return { ...Config.DEFAULT_CONFIG, ...config } as Types.Config;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('ambiguous legacy configurations', () => {
  it('blocks List edits only when authored divergent root keys exist', async () => {
    const { editor, reports } = await mount({
      view: 'list',
      event_font_size: '18px',
      show_past_events: false,
    });

    expect(blocker(editor)).not.toBeNull();
    expect(forms(editor)).toHaveLength(0);
    expect(blocker(editor)!.textContent).toContain('Event Font Size');
    expect(blocker(editor)!.textContent).toContain('Show Past Events');
    expect(blocker(editor)!.textContent).toContain('Keep my existing List appearance');
    expect(blocker(editor)!.textContent).toContain('Use these settings for all layouts');
    expect(reports).toEqual([]);
  });

  it('keeps default-valued and nondefault authored roots with List', async () => {
    const { editor, reports } = await mount({
      view: 'list',
      show_past_events: Config.DEFAULT_CONFIG.show_past_events,
      event_font_size: '18px',
      day_spacing: Config.DEFAULT_CONFIG.day_spacing,
      compact_events_complete_days: Config.DEFAULT_CONFIG.compact_events_complete_days,
    });

    await choose(editor, 'keep-list');

    expect(reports).toEqual([
      {
        config_version: Config.CURRENT_CONFIG_VERSION,
        entities: ['calendar.anna'],
        list: {
          show_past_events: false,
          event_font_size: '18px',
          day_spacing: '10px',
          compact_events_complete_days: false,
        },
      },
    ]);
    expect(blocker(editor)).toBeNull();
    expect(formFor(editor, 'event_font_size').data.event_font_size).toBe('18px');
  });

  it('updates local state before an immediate form edit and before any echo', async () => {
    const { editor, reports } = await mount({
      event_font_size: '18px',
      today_indicator_position: 'left',
    });

    await choose(editor, 'keep-list');
    await change(editor, 'title', 'Migrated');

    expect(reports).toHaveLength(2);
    expect(reports[1]).toEqual({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
      title: 'Migrated',
      list: {
        event_font_size: '18px',
        today_indicator_position: 'left',
      },
    });
  });

  it('keeps intentionally shared roots through later List saves', async () => {
    const { editor, reports } = await mount({ event_font_size: '18px' });

    await choose(editor, 'shared-root');
    await change(editor, 'title', 'Shared');

    expect(reports.at(-1)).toEqual({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
      title: 'Shared',
      event_font_size: '18px',
    });
    expect(reports.at(-1)).not.toHaveProperty('list.event_font_size');
  });

  it('does not reconcile moved List values into Grid later in the same editor', async () => {
    const { editor, reports } = await mount({
      event_font_size: '18px',
      show_past_events: false,
      day_spacing: '17px',
    });

    await choose(editor, 'keep-list');
    await change(editor, 'view', 'grid');

    expect(reports.at(-1)).not.toHaveProperty('time_grid');
    expect(editor.shadowRoot!.querySelector('[data-grid-reconciliation]')).toBeNull();
    expect(View.resolveEffectiveConfig(merged(reports.at(-1)!), 'grid')).toMatchObject({
      event_font_size: '12px',
      show_past_events: true,
      day_spacing: '1px',
    });
  });

  it('keeps Shared roots eligible for Grid reconciliation', async () => {
    const { editor, reports } = await mount({ event_font_size: '18px' });

    await choose(editor, 'shared-root');
    await change(editor, 'view', 'grid');

    expect(reports.at(-1)).toHaveProperty('event_font_size', '18px');
    expect(reports.at(-1)).toHaveProperty('time_grid.event_font_size', '18px');
    expect(editor.shadowRoot!.querySelector('[data-grid-reconciliation]')).not.toBeNull();
  });

  it('prompts Grid without changing its current appearance for either choice', async () => {
    for (const choice of ['keep-list', 'shared-root'] as const) {
      const { editor, reports } = await mount({
        view: 'grid',
        event_font_size: '18px',
        show_past_events: false,
      });
      const before = View.resolveEffectiveConfig(
        merged({ view: 'grid', event_font_size: '18px', show_past_events: false }),
        'grid',
      );

      expect(blocker(editor)!.textContent).toContain('Either choice keeps Grid looking the same');
      await choose(editor, choice);
      const after = View.resolveEffectiveConfig(merged(reports.at(-1)!), 'grid');

      expect(after.event_font_size).toBe(before.event_font_size);
      expect(after.show_past_events).toBe(before.show_past_events);
      editor.remove();
    }
  });
});

describe('automatic adoption paths', () => {
  it.each(['list', 'grid'] as const)(
    'does not prompt a versionless %s card with no divergent root key',
    async (view) => {
      const { editor, reports } = await mount({
        view,
        today_indicator_position: 'left',
      });

      expect(blocker(editor)).toBeNull();
      expect(forms(editor).length).toBeGreaterThan(0);
      expect(reports).toEqual([]);
      await change(editor, 'title', 'Adopted');

      expect(reports).toEqual([
        {
          config_version: Config.CURRENT_CONFIG_VERSION,
          entities: ['calendar.anna'],
          ...(view === 'grid' ? { view } : {}),
          title: 'Adopted',
          list: { today_indicator_position: 'left' },
        },
      ]);
    },
  );

  it('lets the first edit clear a legacy list-only root instead of restoring it', async () => {
    const { editor, reports } = await mount({
      date_vertical_alignment: 'top',
    });

    await change(editor, 'date_vertical_alignment', undefined);

    expect(reports).toEqual([
      {
        config_version: Config.CURRENT_CONFIG_VERSION,
        entities: ['calendar.anna'],
      },
    ]);
  });

  it('does not prompt Column or move roots Column currently inherits', async () => {
    const { editor, reports } = await mount({
      view: 'column',
      event_font_size: '18px',
      today_indicator_position: 'left',
    });

    expect(blocker(editor)).toBeNull();
    await change(editor, 'title', 'Column');

    expect(reports.at(-1)).toEqual({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
      view: 'column',
      title: 'Column',
      event_font_size: '18px',
      list: { today_indicator_position: 'left' },
    });
    expect(View.resolveEffectiveConfig(merged(reports.at(-1)!), 'column').event_font_size).toBe(
      '18px',
    );
  });

  it.each([{ list: { event_font_size: '20px' } }, { time_grid: { event_font_size: '12px' } }])(
    'adopts an already-layered unversioned config without reinterpreting roots',
    async (block) => {
      const { editor, reports } = await mount({ event_font_size: '18px', ...block });

      expect(blocker(editor)).toBeNull();
      await change(editor, 'title', 'Layered');

      expect(reports.at(-1)).toMatchObject({
        config_version: Config.CURRENT_CONFIG_VERSION,
        event_font_size: '18px',
        ...block,
      });
    },
  );
});

describe('configuration version states', () => {
  it.each(['en', ...Object.keys(EDITOR_LANGUAGE_STRINGS)])(
    'renders the migration choices and version warnings in %s',
    async (language) => {
      const expected = (key: string) =>
        EDITOR_LANGUAGE_STRINGS[language]?.[key] ?? EDITOR_STRINGS[key];
      const { editor, reports } = await mount({
        language,
        event_font_size: '18px',
      });
      const panel = blocker(editor)!;
      expect(panel.textContent).toContain(expected('config_migration.title'));
      expect(
        [...panel.querySelectorAll('button')].map((button) => button.textContent?.trim()),
      ).toEqual([expected('config_migration.keep_list'), expected('config_migration.use_shared')]);
      await choose(editor, 'keep-list');
      expect(reports[0]).toMatchObject({
        language,
        list: { event_font_size: '18px' },
        config_version: Config.CURRENT_CONFIG_VERSION,
      });

      editor.setConfig({ language, config_version: 6 });
      await editor.updateComplete;
      expect(blocker(editor)!.textContent).toContain(expected('config_migration.future_title'));
      expect(forms(editor)).toHaveLength(0);

      editor.setConfig({ language, config_version: '5' });
      await editor.updateComplete;
      expect(blocker(editor)!.textContent).toContain(expected('config_migration.invalid_title'));
      expect(forms(editor)).toHaveLength(0);
      expect(reports).toHaveLength(1);
    },
  );

  it.each([
    { event_font_size: '18px' },
    { config_version: 6, list: { event_font_size: '18px' } },
    { config_version: '5', list: { event_font_size: '18px' } },
  ])('rejects stale form events and reset clicks while blocked by %j', async (blockedConfig) => {
    const { editor, reports } = await mount({
      config_version: Config.CURRENT_CONFIG_VERSION,
      list: { event_font_size: '18px' },
    });
    const titleForm = formFor(editor, 'title');
    const entityForm = editor.shadowRoot!.querySelector<Form>('ha-form.entity-form')!;
    const reset = editor.shadowRoot!.querySelector<HTMLButtonElement>(
      '[data-reset-keys="event_font_size"]',
    )!;
    expect(entityForm).not.toBeNull();
    expect(reset).not.toBeNull();

    editor.setConfig({ entities: ['calendar.anna'], ...blockedConfig });
    await editor.updateComplete;
    expect(blocker(editor)).not.toBeNull();

    titleForm.dispatchEvent(
      new CustomEvent('value-changed', {
        detail: { value: { ...titleForm.data, title: 'Delayed edit' } },
      }),
    );
    entityForm.dispatchEvent(
      new CustomEvent('value-changed', {
        detail: { value: { ...entityForm.data, name: 'Delayed calendar edit' } },
      }),
    );
    reset.click();
    await editor.updateComplete;

    expect(reports).toEqual([]);
    expect(blocker(editor)).not.toBeNull();
  });

  it('accepts the current marker and the stamped card-picker stub', async () => {
    const stub = Config.getStubConfig({ 'calendar.anna': { state: 'off' } });
    expect(stub.config_version).toBe(Config.CURRENT_CONFIG_VERSION);

    const { editor } = await mount({ config_version: Config.CURRENT_CONFIG_VERSION });
    expect(blocker(editor)).toBeNull();
    expect(forms(editor).length).toBeGreaterThan(0);
  });

  it('sends an older integer marker through the legacy ambiguity path', async () => {
    const { editor } = await mount({ config_version: 4, event_font_size: '18px' });
    expect(blocker(editor)).not.toBeNull();
    expect(blocker(editor)!.textContent).toContain('Choose How to Upgrade This Card');
  });

  it('blocks a newer integer marker without rewriting it', async () => {
    const { editor, reports } = await mount({ config_version: 6 });
    expect(blocker(editor)!.textContent).toContain('Newer Configuration');
    expect(forms(editor)).toHaveLength(0);
    expect(reports).toEqual([]);
  });

  it.each(['5', 5.5, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'blocks the invalid marker %s without coercion',
    async (value) => {
      const { editor, reports } = await mount({ config_version: value });
      expect(blocker(editor)!.textContent).toContain('invalid configuration version');
      expect(forms(editor)).toHaveLength(0);
      expect(reports).toEqual([]);
      editor.remove();
    },
  );

  it('does not rerun migration after the choice is echoed', async () => {
    const { editor, reports } = await mount({ event_font_size: '18px' });
    await choose(editor, 'keep-list');
    const migrated = reports[0];

    editor.setConfig(migrated);
    await editor.updateComplete;

    expect(blocker(editor)).toBeNull();
    await change(editor, 'title', 'Echoed');
    expect(reports.at(-1)).toMatchObject({
      config_version: Config.CURRENT_CONFIG_VERSION,
      title: 'Echoed',
      list: { event_font_size: '18px' },
    });
  });
});

describe('adoption waits for a real edit', () => {
  it('does not save on unchanged panel or calendar form emissions', async () => {
    const { editor, reports } = await mount({
      view: 'column',
      event_font_size: '18px',
      today_indicator_position: 'left',
    });
    const titleForm = formFor(editor, 'title');
    const entityForm = editor.shadowRoot!.querySelector<Form>('ha-form.entity-form')!;
    expect(entityForm).not.toBeNull();

    for (const form of [titleForm, entityForm]) {
      form.dispatchEvent(new CustomEvent('value-changed', { detail: { value: form.data } }));
      await editor.updateComplete;
    }
    expect(reports).toEqual([]);

    await change(editor, 'title', 'First real edit');
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      config_version: Config.CURRENT_CONFIG_VERSION,
      event_font_size: '18px',
      list: { today_indicator_position: 'left' },
    });
  });
});

describe('All Layouts follows shared values rather than List', () => {
  it.each([true, false])('gates dependent controls on root switches set to %s', async (enabled) => {
    const switches = (on: boolean) => ({
      show_time: on,
      show_location: on,
      show_description: on,
      show_countdown: on,
      show_progress_bar: on,
      show_empty_days: on,
      filter_duplicates: on,
      allday_badge: on ? 'title' : false,
    });
    const children = [
      'time_font_size',
      'location_font_size',
      'description_font_size',
      'show_countdown_allday',
      'progress_bar_height',
      'empty_day_text',
      'duplicate_accent_color',
      'allday_badge_style',
    ];
    const { editor, reports } = await mount({
      config_version: Config.CURRENT_CONFIG_VERSION,
      ...switches(enabled),
      list: switches(!enabled),
    });

    const visible = () =>
      new Set(
        forms(editor)
          .filter((form) => !form.classList.contains('entity-form'))
          .flatMap((form) => [...workspaceFields(form.schema)].map(({ node }) => node.name)),
      );
    await change(editor, 'editing_workspace', 'shared');
    expect(formFor(editor, 'show_location').data.show_location).toBe(enabled);
    for (const key of children) expect(visible().has(key), `Shared ${key}`).toBe(enabled);

    await change(editor, 'editing_workspace', 'list');
    for (const key of children) expect(visible().has(key), `List ${key}`).toBe(!enabled);
    expect(reports).toEqual([]);
  });

  it('preserves default-valued Shared intent after closing and reopening', async () => {
    const { editor, reports } = await mount({ config_version: Config.CURRENT_CONFIG_VERSION });
    await change(editor, 'editing_workspace', 'shared');
    const values = {
      event_font_size: ['18px', '14px'],
      day_spacing: ['18px', '10px'],
      event_background_opacity: [5, 0],
      show_past_events: [true, false],
    };
    for (const [key, [other, chosen]] of Object.entries(values)) {
      await change(editor, key, other);
      await change(editor, key, chosen);
    }
    const saved = reports.at(-1)!;
    const chosen = Object.fromEntries(
      Object.entries(values).map(([key, [, value]]) => [key, value]),
    );
    expect(saved).toMatchObject(chosen);

    const reopened = await mount(saved);
    await change(reopened.editor, 'view', 'grid');
    await change(editor, 'view', 'grid');
    expect(reopened.reports.at(-1)?.time_grid).toMatchObject(chosen);
    expect(reopened.reports.at(-1)?.time_grid).toEqual(reports.at(-1)?.time_grid);
  });

  it('keeps default-valued roots when migration explicitly chooses shared storage', async () => {
    const chosen = {
      event_font_size: '14px',
      day_spacing: '10px',
      event_background_opacity: 0,
      show_past_events: false,
    };
    const { editor, reports } = await mount(chosen);
    await choose(editor, 'shared-root');
    expect(reports.at(-1)).toMatchObject({
      ...chosen,
      config_version: Config.CURRENT_CONFIG_VERSION,
    });

    const reopened = await mount(reports.at(-1)!);
    await change(reopened.editor, 'view', 'grid');
    expect(reopened.reports.at(-1)?.time_grid).toMatchObject(chosen);
  });

  it('retains every authored divergent root default without materializing unrelated defaults', async () => {
    const keys = listRelocationKeys().divergent;
    const authored = Object.fromEntries(
      keys.map((key) => [key, Config.DEFAULT_CONFIG[key as keyof Types.Config]]),
    );
    const { editor, reports } = await mount({
      config_version: Config.CURRENT_CONFIG_VERSION,
      ...authored,
    });
    await change(editor, 'title', 'Shared choices');
    expect(reports.at(-1)).toEqual({
      entities: ['calendar.anna'],
      config_version: Config.CURRENT_CONFIG_VERSION,
      title: 'Shared choices',
      ...authored,
    });
  });
});

describe('compact expansion after editor migration', () => {
  it.each([
    { key: 'compact_events_to_show', limit: 2 },
    { key: 'compact_days_to_show', limit: 1 },
  ])('keeps the real expand action working after migrating $key', async ({ key, limit }) => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
    const raw = {
      entities: ['calendar.anna'],
      days_to_show: 3,
      [key]: limit,
      tap_action: { action: 'expand' },
    };
    const { editor, reports } = await mount(raw);
    await change(editor, 'title', 'Compact calendar');
    const migrated = reports.at(-1)!;
    expect(migrated).toHaveProperty(`list.${key}`, limit);
    expect(migrated).not.toHaveProperty(key);

    const events: Types.CalendarEventData[] = [
      ['2026-06-17', '2026-06-18'],
      ['2026-06-18', '2026-06-19'],
      ['2026-06-19', '2026-06-20'],
    ].map(([start, end], index) => ({
      summary: `Appointment ${index + 1}`,
      start: { date: start },
      end: { date: end },
      _entityId: 'calendar.anna',
    }));
    for (const config of [raw, migrated]) {
      const card = document.createElement('calendar-card-pro-dev') as ExpandableCard;
      card.setConfig(config);
      document.body.appendChild(card);
      const eventCount = () =>
        groupEventsByDay(events, card.config, card.isExpanded, 'en', 'list').flatMap(
          (day) => day.events,
        ).length;
      expect(eventCount()).toBe(limit);
      card.handleAction(card.config.tap_action!);
      expect(card.isExpanded).toBe(true);
      expect(eventCount()).toBe(3);
      card.handleAction(card.config.tap_action!);
      expect(eventCount()).toBe(limit);
    }
  });
});
