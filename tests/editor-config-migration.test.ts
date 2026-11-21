/**
 * The v5 editor migration distinguishes legacy List authorship from intentional shared
 * values, then records the answer so no later save has to guess again.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import '../src/calendar-card-pro';
import { FROZEN_NOW } from './fixtures';
import {
  changeField,
  editLayout,
  emitChange,
  entry,
  formOf,
  formsOf,
  mountEditor,
  openPanels,
  reportsOf,
  resetButton,
  valueOf,
} from './helpers/editor-host';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import * as View from '../src/config/view';
import { parseFieldId } from '../src/rendering/editor/field-index';
import { workspaceFields } from '../src/rendering/editor/routing';
import { EDITOR_STRINGS } from '../src/rendering/editor/strings';
import { EDITOR_LANGUAGE_STRINGS } from '../src/rendering/editor/translations/index';
import { listRelocationKeys } from '../src/rendering/editor/value';
import { groupEventsByDay } from '../src/utils/events';

interface EditorHost extends HTMLElement {
  hass: unknown;
  setConfig(config: Record<string, unknown>): void;
  readonly updateComplete: Promise<unknown>;
}

interface ExpandableCard extends HTMLElement {
  config: Types.Config;
  isExpanded: boolean;
  setConfig(config: Record<string, unknown>): void;
  handleAction(action: Types.ActionConfig): void;
}

async function mount(config: Record<string, unknown>) {
  const editor = await mountEditor({ entities: ['calendar.anna'], ...config });
  // A closed panel mounts no form: open every panel, as these tests read forms across the editor.
  await openPanels(editor);
  // What it reported since it was created: an upgrade on opening is the first.
  return { editor, reports: reportsOf(editor) };
}

/** The message a configuration version the editor cannot edit puts in its place. */
function blocker(editor: EditorHost): HTMLElement | null {
  return editor.shadowRoot!.querySelector('[data-config-migration]');
}

/** The receipt the upgrade on opening leaves. */
function receipt(editor: EditorHost): HTMLElement | null {
  return editor.shadowRoot!.querySelector('[data-upgrade-receipt]');
}

/**
 * The upgrade's answer: List, as the editor writes on opening, or every layout, through the
 * receipt's Use Them for Every Layout.
 *
 * @param editor - Editor
 * @param choice - The answer
 */
async function choose(editor: EditorHost, choice: 'keep-list' | 'shared-root'): Promise<void> {
  if (choice === 'shared-root') {
    receipt(editor)!.querySelector<HTMLButtonElement>('[data-focus="upgrade-share"]')!.click();
    await editor.updateComplete;
  }
  await openPanels(editor);
}

function merged(config: Record<string, unknown>): Types.Config {
  return { ...Config.DEFAULT_CONFIG, ...config } as Types.Config;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('ambiguous legacy configurations', () => {
  it('keeps authored divergent roots for List on opening, and says so', async () => {
    const { editor, reports } = await mount({
      view: 'list',
      event_font_size: '18px',
      show_past_events: false,
    });

    expect(blocker(editor)).toBeNull();
    expect(formsOf(editor).length).toBeGreaterThan(0);
    expect(receipt(editor)!.textContent!.replace(/\s+/g, ' ').trim()).toBe(
      'Upgraded. Event Font Size and Show Past Events now apply to List, as before. The card ' +
        'looks the same. Use Them for Every Layout Undo',
    );
    expect(reports).toEqual([
      {
        config_version: Config.CURRENT_CONFIG_VERSION,
        entities: ['calendar.anna'],
        view: 'list',
        list: { event_font_size: '18px', show_past_events: false },
      },
    ]);
  });

  it.each([
    {
      name: 'List and Columns',
      toolbar: { show: true, view_switcher_layouts: ['list', 'column'] },
    },
    {
      name: 'Grid and Columns',
      view: 'grid',
      toolbar: { show: true, view_switcher_layouts: ['column'] },
    },
  ])(
    'shares the roots on opening where $name are offered, so every layout looks the same',
    async (card) => {
      const authored = {
        entities: ['calendar.anna'],
        event_font_size: '18px',
        show_past_events: false,
        ...(card.view === undefined ? {} : { view: card.view }),
        toolbar: card.toolbar,
      };
      const { editor, reports } = await mount(authored);
      const stored = reports[0]!;

      expect(stored).toMatchObject({ event_font_size: '18px', show_past_events: false });
      expect(stored).not.toHaveProperty('list');
      for (const view of ['list', 'column', 'grid'] as const) {
        const before = View.resolveEffectiveConfig(merged(authored), view);
        const after = View.resolveEffectiveConfig(merged(stored), view);
        expect([view, after.event_font_size, after.show_past_events]).toEqual([
          view,
          before.event_font_size,
          before.show_past_events,
        ]);
      }
      expect(receipt(editor)!.textContent!.replace(/\s+/g, ' ').trim()).toBe(
        'Upgraded. Event Font Size and Show Past Events now apply to every layout, unless a layout ' +
          'has its own. The card looks the same. Undo',
      );
    },
  );

  it('keeps the roots for List on opening where the other offered layout has its own', async () => {
    // Grid starts from a default of its own for both, so it draws neither root either way.
    const { reports } = await mount({
      event_font_size: '18px',
      show_past_events: false,
      toolbar: { show: true, view_switcher_layouts: ['list', 'grid'] },
    });
    expect(reports[0]).toMatchObject({
      list: { event_font_size: '18px', show_past_events: false },
    });
  });

  it('upgrades nothing when the card has no divergent root', async () => {
    const { editor, reports } = await mount({ view: 'list', title: 'Family' });
    expect(receipt(editor)).toBeNull();
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
        view: 'list',
        list: {
          show_past_events: false,
          event_font_size: '18px',
          day_spacing: '10px',
          compact_events_complete_days: false,
        },
      },
    ]);
    expect(blocker(editor)).toBeNull();
    expect(valueOf(editor, 'events:event_font_size')).toBe('18px');
    // Over a second in a full local run; the limit is set for CI's slower runner under load
    // rather than for a hang.
  }, 30_000);

  it('updates local state before an immediate form edit and before any echo', async () => {
    const { editor, reports } = await mount({
      event_font_size: '18px',
      today_indicator_position: 'left',
    });

    await choose(editor, 'keep-list');
    await changeField(editor, 'card:title', 'Migrated');

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
    await changeField(editor, 'card:title', 'Shared');

    expect(reports.slice(-1)[0]).toEqual({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
      title: 'Shared',
      event_font_size: '18px',
    });
    expect(reports.slice(-1)[0]).not.toHaveProperty('list.event_font_size');
  });

  it('does not reconcile moved List values into Grid later in the same editor', async () => {
    const { editor, reports } = await mount({
      event_font_size: '18px',
      show_past_events: false,
      day_spacing: '17px',
    });

    await choose(editor, 'keep-list');
    await changeField(editor, 'display:view', 'grid');

    expect(reports.slice(-1)[0]).not.toHaveProperty('time_grid');
    expect(editor.shadowRoot!.querySelector('[data-grid-reconciliation]')).toBeNull();
    expect(View.resolveEffectiveConfig(merged(reports.slice(-1)[0]!), 'grid')).toMatchObject({
      event_font_size: '12px',
      show_past_events: true,
      day_spacing: '1px',
    });
  });

  it('keeps Shared roots eligible for Grid reconciliation', async () => {
    const { editor, reports } = await mount({ event_font_size: '18px' });

    await choose(editor, 'shared-root');
    await changeField(editor, 'display:view', 'grid');

    expect(reports.slice(-1)[0]).toHaveProperty('event_font_size', '18px');
    expect(reports.slice(-1)[0]).toHaveProperty('time_grid.event_font_size', '18px');
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

      expect(receipt(editor)!.textContent).toContain('The card looks the same.');
      await choose(editor, choice);
      const after = View.resolveEffectiveConfig(merged(reports.slice(-1)[0]!), 'grid');

      expect(after.event_font_size).toBe(before.event_font_size);
      expect(after.show_past_events).toBe(before.show_past_events);
      editor.remove();
    }
  });
});

describe('automatic adoption paths', () => {
  it.each(['list', 'grid'] as const)(
    'keeps on a versionless %s card the root values only Month starts from a default of its own',
    async (view) => {
      // Month postdates the format a versionless card was written in, so these stay shared, and
      // every layout that reads them keeps the card's own values.
      const roots = {
        day_font_size: '20px',
        weekday_font_size: '18px',
        week_number_font_size: '15px',
        vertical_line_width: '4px',
        event_gap: '2px',
      };
      const { editor, reports } = await mount({ view, ...roots });

      expect(blocker(editor)).toBeNull();
      expect(receipt(editor)).toBeNull();
      expect(reports).toEqual([]);
      await changeField(editor, 'card:title', 'Adopted');
      const stored = reports.slice(-1)[0]!;

      expect(stored).toMatchObject(roots);
      expect(stored).not.toHaveProperty('list');
      for (const shown of ['list', 'column', 'grid'] as const) {
        const resolved = View.resolveEffectiveConfig(merged(stored), shown);
        expect(
          Object.fromEntries(
            Object.keys(roots).map((key) => [key, resolved[key as keyof Types.Config]]),
          ),
        ).toEqual(shown === 'grid' ? { ...roots, event_gap: resolved.event_gap } : roots);
      }
      editor.remove();
    },
  );

  it.each(['list', 'grid'] as const)(
    'does not prompt a versionless %s card with no divergent root key',
    async (view) => {
      const { editor, reports } = await mount({
        view,
        today_indicator_position: 'left',
      });

      expect(blocker(editor)).toBeNull();
      expect(formsOf(editor).length).toBeGreaterThan(0);
      expect(reports).toEqual([]);
      await changeField(editor, 'card:title', 'Adopted');

      expect(reports).toEqual([
        {
          config_version: Config.CURRENT_CONFIG_VERSION,
          entities: ['calendar.anna'],
          view,
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

    await changeField(editor, 'day_header:date_vertical_alignment', undefined);

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
    await changeField(editor, 'card:title', 'Column');

    expect(reports.slice(-1)[0]).toEqual({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
      view: 'column',
      title: 'Column',
      event_font_size: '18px',
      list: { today_indicator_position: 'left' },
    });
    expect(
      View.resolveEffectiveConfig(merged(reports.slice(-1)[0]!), 'column').event_font_size,
    ).toBe('18px');
  });

  it.each([
    { list: { event_font_size: '20px' } },
    { time_grid: { event_font_size: '12px' } },
    { month: { event_font_size: '12px' } },
  ])('adopts an already-layered unversioned config without reinterpreting roots', async (block) => {
    const { editor, reports } = await mount({ event_font_size: '18px', ...block });

    expect(blocker(editor)).toBeNull();
    await changeField(editor, 'card:title', 'Layered');

    expect(reports.slice(-1)[0]).toMatchObject({
      config_version: Config.CURRENT_CONFIG_VERSION,
      event_font_size: '18px',
      ...block,
    });
  });
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
      const panel = receipt(editor)!;
      expect(panel.textContent).toContain(expected('upgrade.title'));
      expect(panel.querySelector('[data-focus="upgrade-share"]')!.textContent!.trim()).toBe(
        expected('upgrade.share_one'),
      );
      expect(reports[0]).toMatchObject({
        language,
        list: { event_font_size: '18px' },
        config_version: Config.CURRENT_CONFIG_VERSION,
      });

      editor.setConfig({ language, config_version: 6 });
      await editor.updateComplete;
      expect(blocker(editor)!.textContent).toContain(expected('config_migration.future_title'));
      expect(formsOf(editor)).toHaveLength(0);

      editor.setConfig({ language, config_version: '5' });
      await editor.updateComplete;
      expect(blocker(editor)!.textContent).toContain(expected('config_migration.invalid_title'));
      expect(formsOf(editor)).toHaveLength(0);
      expect(reports).toHaveLength(1);
    },
  );

  it.each([
    { config_version: 6, list: { event_font_size: '18px' } },
    { config_version: '5', list: { event_font_size: '18px' } },
  ])('rejects stale form events and reset clicks while blocked by %j', async (blockedConfig) => {
    const { editor, reports } = await mount({
      config_version: Config.CURRENT_CONFIG_VERSION,
      list: { event_font_size: '18px' },
    });
    const titleForm = formOf(editor, 'card:title')!;
    const entityForm = formOf(editor, 'calendar:name', entry(0));
    const reset = (await resetButton(editor, 'event_font_size'))!;
    expect(entityForm).toBeDefined();
    expect(reset).not.toBeNull();

    editor.setConfig({ entities: ['calendar.anna'], ...blockedConfig });
    await editor.updateComplete;
    expect(blocker(editor)).not.toBeNull();

    emitChange(titleForm, { 'card:title': 'Delayed edit' });
    emitChange(entityForm!, { 'calendar:name': 'Delayed calendar edit' });
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
    expect(formsOf(editor).length).toBeGreaterThan(0);
  });

  it('sends an older integer marker through the legacy ambiguity path', async () => {
    const { editor, reports } = await mount({ config_version: 4, event_font_size: '18px' });
    expect(blocker(editor)).toBeNull();
    expect(receipt(editor)).not.toBeNull();
    expect(reports).toEqual([
      {
        config_version: Config.CURRENT_CONFIG_VERSION,
        entities: ['calendar.anna'],
        list: { event_font_size: '18px' },
      },
    ]);
  });

  it('blocks a newer integer marker without rewriting it', async () => {
    const { editor, reports } = await mount({ config_version: 6 });
    expect(blocker(editor)!.textContent).toContain('Newer Configuration');
    expect(formsOf(editor)).toHaveLength(0);
    expect(reports).toEqual([]);
  });

  it.each(['5', 5.5, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'blocks the invalid marker %s without coercion',
    async (value) => {
      const { editor, reports } = await mount({ config_version: value });
      expect(blocker(editor)!.textContent).toContain('invalid configuration version');
      expect(formsOf(editor)).toHaveLength(0);
      expect(reports).toEqual([]);
      editor.remove();
    },
  );

  it('does not rerun migration after the upgrade is echoed', async () => {
    const { editor, reports } = await mount({ event_font_size: '18px' });
    await choose(editor, 'keep-list');
    const migrated = reports[0];

    editor.setConfig(migrated);
    await editor.updateComplete;

    expect(blocker(editor)).toBeNull();
    expect(reports).toHaveLength(1);
    await changeField(editor, 'card:title', 'Echoed');
    expect(reports.slice(-1)[0]).toMatchObject({
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
    const titleForm = formOf(editor, 'card:title')!;
    const entityForm = formOf(editor, 'calendar:name', entry(0));
    expect(entityForm).toBeDefined();

    for (const form of [titleForm, entityForm!]) {
      emitChange(form, {});
      await editor.updateComplete;
    }
    expect(reports).toEqual([]);

    await changeField(editor, 'card:title', 'First real edit');
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      config_version: Config.CURRENT_CONFIG_VERSION,
      event_font_size: '18px',
      list: { today_indicator_position: 'left' },
    });
  });
});

describe('All Layouts follows shared values rather than List', () => {
  it.each([true, false])(
    'gates dependent controls on root switches set to %s',
    async (enabled) => {
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

      const visible = () => {
        const calendars = formsOf(editor, entry());
        return new Set(
          formsOf(editor)
            .filter((form) => !calendars.includes(form))
            .flatMap((form) => [...workspaceFields(form.schema)].map(({ node }) => node.name)),
        );
      };
      await editLayout(editor, 'shared');
      expect(valueOf(editor, 'events:show_location')).toBe(enabled);
      for (const key of children) expect(visible().has(key), `Shared ${key}`).toBe(enabled);

      await editLayout(editor, 'list');
      for (const key of children) expect(visible().has(key), `List ${key}`).toBe(!enabled);
      expect(reports).toEqual([]);
      // Over a second in a full local run; the limit is set for CI's slower runner under load
      // rather than for a hang.
    },
    30_000,
  );

  it('preserves default-valued Shared intent after closing and reopening', async () => {
    const { editor, reports } = await mount({ config_version: Config.CURRENT_CONFIG_VERSION });
    await editLayout(editor, 'shared');
    const values = {
      'events:event_font_size': ['18px', '14px'],
      'layout:day_spacing': ['18px', '10px'],
      'events:event_background_opacity': [5, 0],
      'content:show_past_events': [true, false],
    };
    for (const [id, [other, chosen]] of Object.entries(values)) {
      await changeField(editor, id, other);
      await changeField(editor, id, chosen);
    }
    const saved = reports.slice(-1)[0]!;
    const chosen = Object.fromEntries(
      Object.entries(values).map(([id, [, value]]) => [parseFieldId(id).name, value]),
    );
    expect(saved).toMatchObject(chosen);

    const reopened = await mount(saved);
    await changeField(reopened.editor, 'display:view', 'grid');
    await changeField(editor, 'display:view', 'grid');
    expect(reopened.reports.slice(-1)[0]?.time_grid).toMatchObject(chosen);
    expect(reopened.reports.slice(-1)[0]?.time_grid).toEqual(reports.slice(-1)[0]?.time_grid);
    // Over a second in a full local run; the limit is set for CI's slower runner under load
    // rather than for a hang.
  }, 30_000);

  it('keeps default-valued roots when migration explicitly chooses shared storage', async () => {
    const chosen = {
      event_font_size: '14px',
      day_spacing: '10px',
      event_background_opacity: 0,
      show_past_events: false,
    };
    const { editor, reports } = await mount(chosen);
    await choose(editor, 'shared-root');
    expect(reports.slice(-1)[0]).toMatchObject({
      ...chosen,
      config_version: Config.CURRENT_CONFIG_VERSION,
    });

    const reopened = await mount(reports.slice(-1)[0]!);
    await changeField(reopened.editor, 'display:view', 'grid');
    expect(reopened.reports.slice(-1)[0]?.time_grid).toMatchObject(chosen);
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
    await changeField(editor, 'card:title', 'Shared choices');
    expect(reports.slice(-1)[0]).toEqual({
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
    await changeField(editor, 'card:title', 'Compact calendar');
    const migrated = reports.slice(-1)[0]!;
    expect(migrated).toHaveProperty(`list.${key}`, limit);
    expect(migrated).not.toHaveProperty(key);
    // The edit opened a page, which focuses its heading. happy-dom's `ShadowRoot.activeElement`
    // throws while focus sits in another shadow root, as the card's update asks it, so focus
    // leaves the editor before the cards mount, as it would once a user moved to the dashboard.
    (editor.shadowRoot!.activeElement as HTMLElement | null)?.blur();

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
