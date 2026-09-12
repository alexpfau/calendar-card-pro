/**
 * Reconciliation preserves continuity across an editor view transition. An already-Grid
 * YAML card deliberately keeps Grid's style defaults: opening its editor is read-only,
 * not a transition. These fixtures must stay sparse; merging defaults before setConfig
 * would erase the distinction between an authored default and an absent option.
 */

import { afterEach, describe, expect, it } from 'vitest';

import * as Config from '../src/config/config';
import * as View from '../src/config/view';
import { CalendarCardProEditor } from '../src/rendering/editor/element';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import { lookup } from '../src/rendering/editor/localize';
import { workspaceFields } from '../src/rendering/editor/routing';

customElements.define('editor-grid-reconciliation-test', CalendarCardProEditor);

interface EditorHost extends HTMLElement {
  hass: unknown;
  setConfig(config: Record<string, unknown>): void;
  readonly updateComplete: Promise<unknown>;
}

interface Form extends HTMLElement {
  schema: ReadonlyArray<HaFormSchema>;
  data: Record<string, unknown>;
}

async function mount(config: Record<string, unknown> = {}) {
  const editor = document.createElement('editor-grid-reconciliation-test') as EditorHost;
  editor.hass = { states: {}, locale: { language: 'en' } };
  editor.setConfig({
    config_version: Config.CURRENT_CONFIG_VERSION,
    entities: ['calendar.anna'],
    ...config,
  });
  document.body.appendChild(editor);
  await editor.updateComplete;
  const reports: Record<string, unknown>[] = [];
  editor.addEventListener('config-changed', (event) => {
    const config = structuredClone(
      (event as CustomEvent<{ config: Record<string, unknown> }>).detail.config,
    );
    delete config.config_version;
    reports.push(config);
  });
  return { editor, reports };
}

function formFor(editor: EditorHost, key: string): Form {
  const forms = [...editor.shadowRoot!.querySelectorAll<Form>('ha-form')].filter((form) =>
    [...workspaceFields(form.schema)].some(({ node }) => node.name === key),
  );
  expect(forms, `form for ${key}`).toHaveLength(1);
  return forms[0];
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

/**
 * Authors a value at the top level, then returns to the workspace the test was in.
 *
 * 🚨 The venue moved in v5 and the tests below would otherwise have gone on passing while
 * testing nothing. Reconciliation copies a *root* value into a view's block on the first
 * switch, so it only has a subject when root is where the value was authored. Root used to
 * be list's storage, so an ordinary edit reached it; with `list:` registered an edit made
 * in the List workspace is a list override, and grid inheriting it would be the leak this
 * arrangement exists to close. Shared is where the shared base is authored now.
 *
 * @param editor - Mounted editor
 * @param key - Option to author
 * @param value - Value to author
 */
async function authorAtRoot(editor: EditorHost, key: string, value: unknown): Promise<void> {
  const previous = formFor(editor, 'editing_workspace').data.editing_workspace;
  await change(editor, 'editing_workspace', 'shared');
  await change(editor, key, value);
  await change(editor, 'editing_workspace', previous);
}

function notice(editor: EditorHost): HTMLElement | null {
  return editor.shadowRoot!.querySelector('[data-grid-reconciliation]');
}

function authoredValue(key: string, gridDefault: unknown): string | number | boolean {
  if (typeof gridDefault === 'boolean') return !gridDefault;
  if (typeof gridDefault === 'number') return gridDefault + 7;
  if (typeof gridDefault === 'string') {
    if (key.endsWith('_color')) return '#123456';
    if (/(px|%)$/.test(gridDefault)) return '4em';
  }
  throw new Error(`Add a valid authored-value fixture for the divergent option ${key}`);
}

const CASES = Object.entries(View.TIME_GRID_DEFAULT_OVERRIDES).map(([key, gridDefault]) => ({
  key,
  gridDefault,
  authored: authoredValue(key, gridDefault),
}));

afterEach(() => {
  document.body.replaceChildren();
});

describe('first-switch reconciliation regressions', () => {
  it.each(CASES)('keeps authored $key instead of silently seeding $gridDefault', async (entry) => {
    const { editor, reports } = await mount({ [entry.key]: entry.authored });
    await change(editor, 'view', 'grid');
    expect(reports).toHaveLength(1);
    expect(reports[0]).toHaveProperty('time_grid', { [entry.key]: entry.authored });
    expect(notice(editor)).not.toBeNull();
    expect(notice(editor)!.textContent).toContain(lookup('en', entry.key));
  });

  it('keeps explicitly authored root defaults in storage and across the HA echo', async () => {
    const { editor, reports } = await mount({
      show_past_events: Config.DEFAULT_CONFIG.show_past_events,
      event_font_size: Config.DEFAULT_CONFIG.event_font_size,
    });
    await change(editor, 'title', 'Example');
    expect(reports.at(-1)).toHaveProperty('show_past_events', false);
    expect(reports.at(-1)).toHaveProperty('event_font_size', '14px');
    editor.setConfig({ config_version: Config.CURRENT_CONFIG_VERSION, ...reports.at(-1)! });
    await editor.updateComplete;
    await change(editor, 'view', 'grid');
    expect(reports.at(-1)).toHaveProperty('time_grid.show_past_events', false);
    expect(reports.at(-1)).toHaveProperty('time_grid.event_font_size', '14px');
  });

  it('tracks an authored root value introduced after the editor opened', async () => {
    const { editor, reports } = await mount();
    await authorAtRoot(editor, 'event_font_size', '18px');
    editor.setConfig({ config_version: Config.CURRENT_CONFIG_VERSION, ...reports.at(-1)! });
    await editor.updateComplete;
    await change(editor, 'view', 'grid');
    expect(reports.at(-1)).toHaveProperty('time_grid.event_font_size', '18px');
  });

  it('keeps an authored zero opacity rather than treating it as unset', async () => {
    const { editor, reports } = await mount({ event_background_opacity: 0 });
    await change(editor, 'view', 'grid');
    expect(reports.at(-1)).toHaveProperty('time_grid.event_background_opacity', 0);
    expect(notice(editor)!.textContent).toContain(lookup('en', 'event_background_opacity'));
  });

  it('tracks a newly authored suppression returned to its root default', async () => {
    const { editor, reports } = await mount();
    await authorAtRoot(editor, 'show_past_events', true);
    await authorAtRoot(editor, 'show_past_events', false);
    expect(reports.at(-1)).toHaveProperty('show_past_events', false);
    editor.setConfig({ config_version: Config.CURRENT_CONFIG_VERSION, ...reports.at(-1)! });
    await editor.updateComplete;
    await change(editor, 'view', 'grid');
    expect(reports.at(-1)).toHaveProperty('time_grid.show_past_events', false);
  });

  it('replaces the authored key set on an external configuration', async () => {
    const { editor, reports } = await mount({ show_past_events: false });
    await change(editor, 'view', 'grid');
    expect(reports.at(-1)).toHaveProperty('time_grid.show_past_events', false);
    editor.setConfig({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: ['calendar.ben'],
      event_background_opacity: 5,
    });
    await editor.updateComplete;
    await change(editor, 'view', 'grid');
    expect(reports.at(-1)).toHaveProperty('time_grid.event_background_opacity', 5);
    expect(reports.at(-1)).not.toHaveProperty('time_grid.show_past_events');
    expect(formFor(editor, 'show_past_events').data.show_past_events).toBe(true);
    expect(notice(editor)!.textContent).not.toContain(lookup('en', 'show_past_events'));
  });

  it('preserves explicit view values and does not mutate the raw input', async () => {
    const block = Object.freeze({ event_font_size: '2rem', future_option: 'preserve' });
    const raw = Object.freeze({
      event_font_size: '18px',
      event_background_opacity: 5,
      time_grid: block,
    });
    const { editor, reports } = await mount(raw);
    await change(editor, 'view', 'grid');
    expect(reports.at(-1)).toHaveProperty('time_grid.event_font_size', '2rem');
    expect(reports.at(-1)).toHaveProperty('time_grid.event_background_opacity', 5);
    expect(reports.at(-1)).toHaveProperty('time_grid.future_option', 'preserve');
    expect(raw.time_grid).toBe(block);
    expect(raw.time_grid).toEqual({ event_font_size: '2rem', future_option: 'preserve' });
    expect(notice(editor)!.textContent).not.toContain(lookup('en', 'event_font_size'));
  });

  it('shows one dismissible notice for all conflicts and keeps it through save echoes', async () => {
    const { editor, reports } = await mount({
      event_font_size: '18px',
      event_background_opacity: 5,
      show_past_events: false,
    });
    await change(editor, 'view', 'grid');
    const notices = editor.shadowRoot!.querySelectorAll('[data-grid-reconciliation]');
    expect(notices).toHaveLength(1);
    expect(notices[0].getAttribute('role')).toBe('status');
    for (const key of ['event_font_size', 'event_background_opacity', 'show_past_events']) {
      expect(notices[0].textContent).toContain(lookup('en', key));
    }
    expect(notices[0].textContent).not.toContain(lookup('en', 'day_spacing'));
    editor.setConfig({ config_version: Config.CURRENT_CONFIG_VERSION, ...reports.at(-1)! });
    await editor.updateComplete;
    expect(notice(editor)).not.toBeNull();
    notice(editor)!.querySelector<HTMLButtonElement>('button')!.click();
    await editor.updateComplete;
    expect(notice(editor)).toBeNull();
    expect(reports).toHaveLength(1);
    await change(editor, 'title', 'Example');
    expect(notice(editor)).toBeNull();
  });

  it('does not re-seed or redisplay a dismissed reconciliation on re-entering Grid', async () => {
    const { editor, reports } = await mount({ event_background_opacity: 5 });
    await change(editor, 'view', 'grid');
    expect(reports[0]).toHaveProperty('time_grid.event_background_opacity', 5);
    const reconciled = reports[0].time_grid;
    expect(notice(editor)).not.toBeNull();
    notice(editor)!.querySelector<HTMLButtonElement>('button')!.click();
    await editor.updateComplete;
    expect(reports).toHaveLength(1);
    await change(editor, 'view', 'list');
    await change(editor, 'view', 'grid');
    expect(reports).toHaveLength(3);
    expect(reports.at(-1)?.time_grid).toEqual(reconciled);
    expect(notice(editor)).toBeNull();
  });

  it('leaves a pinned workspace unchanged while Card Displays switches to Grid', async () => {
    const { editor, reports } = await mount({ event_background_opacity: 5 });
    await change(editor, 'editing_workspace', 'column');
    await change(editor, 'view', 'grid');
    expect(formFor(editor, 'editing_workspace').data.editing_workspace).toBe('column');
    expect(reports.at(-1)).toHaveProperty('time_grid.event_background_opacity', 5);
    expect(notice(editor)).not.toBeNull();
  });

  it('does not recopy a changed root value over the reconciled view value', async () => {
    const { editor, reports } = await mount({ event_background_opacity: 5 });
    await change(editor, 'view', 'grid');
    expect(reports.at(-1)).toHaveProperty('time_grid.event_background_opacity', 5);
    await change(editor, 'view', 'list');
    await authorAtRoot(editor, 'event_background_opacity', 65);
    await change(editor, 'view', 'grid');
    expect(reports.at(-1)).toHaveProperty('event_background_opacity', 65);
    expect(reports.at(-1)).toHaveProperty('time_grid.event_background_opacity', 5);
    expect(notice(editor)).toBeNull();
  });

  it('does not recreate a reconciled value after the user resets it', async () => {
    const { editor, reports } = await mount({ event_background_opacity: 5 });
    await change(editor, 'view', 'grid');
    expect(reports.at(-1)).toHaveProperty('time_grid.event_background_opacity', 5);
    editor
      .shadowRoot!.querySelector<HTMLButtonElement>('[data-reset-keys="event_background_opacity"]')!
      .click();
    await editor.updateComplete;
    await change(editor, 'view', 'list');
    await change(editor, 'view', 'grid');
    expect(reports.at(-1)).not.toHaveProperty('time_grid.event_background_opacity');
    expect(formFor(editor, 'event_background_opacity').data.event_background_opacity).toBe(20);
    expect(notice(editor)).toBeNull();
  });

  it('coerces authored lengths without changing unrelated stored values', async () => {
    const { editor, reports } = await mount({ day_spacing: 4, event_background_opacity: 5 });
    await change(editor, 'view', 'grid');
    expect(reports.at(-1)).toEqual({
      entities: ['calendar.anna'],
      view: 'grid',
      day_spacing: 4,
      event_background_opacity: 5,
      time_grid: {
        day_spacing: '4px',
        event_background_opacity: 5,
      },
    });
  });

  it('forgets root authorship when an option is cleared and echoed without it', async () => {
    const { editor, reports } = await mount({ event_font_size: '18px' });
    // Cleared from Shared, because a view workspace cannot clear the shared base. Left on
    // List this passed for the wrong reason: the clear was a no-op against an absent
    // `list:` override, and the migration then moved root's value into `list:` — so the
    // key had indeed left root, and the assertion below could not tell that apart from the
    // clear it was written to check.
    await authorAtRoot(editor, 'event_font_size', undefined);
    // Feeding a missing report back as setConfig(undefined) made the old control pass
    // without deleting anything. The emitted change is a necessary positive control.
    expect(reports).toHaveLength(1);
    expect(reports[0]).not.toHaveProperty('event_font_size');
    editor.setConfig({ config_version: Config.CURRENT_CONFIG_VERSION, ...reports[0] });
    await editor.updateComplete;
    await change(editor, 'view', 'grid');
    expect(reports.at(-1)).not.toHaveProperty('time_grid');

    // Asked of Grid explicitly. Choosing a workspace pins it, and `authorAtRoot` chooses
    // one — so the workspace no longer follows Card Displays here, and reading the control
    // without saying which workspace would report List's value and look like a regression.
    await change(editor, 'editing_workspace', 'grid');
    expect(formFor(editor, 'event_font_size').data.event_font_size).toBe('12px');
    expect(notice(editor)).toBeNull();
  });
});

describe('implicit defaults and first-switch boundaries', () => {
  it('shows every divergent default without storing any on a fresh Grid transition', async () => {
    console.info(`Grid first-switch corpus: ${CASES.length} divergent options`);
    expect(CASES.length).toBeGreaterThan(0);
    const { editor, reports } = await mount();
    await change(editor, 'view', 'grid');
    expect(reports).toEqual([{ entities: ['calendar.anna'], view: 'grid' }]);
    const data = formFor(editor, 'event_background_opacity').data;
    for (const { key, gridDefault } of CASES) expect(data[key], key).toEqual(gridDefault);
    expect(notice(editor)).toBeNull();
  });

  it('does not turn merged defaults into authored values after an unrelated root edit', async () => {
    const { editor, reports } = await mount();
    await change(editor, 'title', 'Example');
    editor.setConfig({ config_version: Config.CURRENT_CONFIG_VERSION, ...reports.at(-1)! });
    await editor.updateComplete;
    await change(editor, 'view', 'grid');
    expect(reports.at(-1)).not.toHaveProperty('time_grid');
    expect(notice(editor)).toBeNull();
  });

  it('does not mark a preconfigured Grid value as an authored root value', async () => {
    const { editor, reports } = await mount();
    await change(editor, 'editing_workspace', 'grid');
    await change(editor, 'event_font_size', '18px');
    await change(editor, 'view', 'grid');
    expect(reports.at(-1)).toHaveProperty('time_grid', {
      event_font_size: '18px',
    });
    expect(notice(editor)).toBeNull();
  });

  it('does not reconcile when only the editing workspace changes', async () => {
    const { editor, reports } = await mount({ event_background_opacity: 5 });
    await change(editor, 'editing_workspace', 'grid');
    expect(reports).toHaveLength(0);
    expect(formFor(editor, 'event_background_opacity').data.event_background_opacity).toBe(20);
    expect(notice(editor)).toBeNull();
  });

  it('keeps an already-Grid YAML load and unrelated edits free of implicit writes', async () => {
    const { editor, reports } = await mount({ view: 'grid', event_background_opacity: 5 });
    expect(formFor(editor, 'event_background_opacity').data.event_background_opacity).toBe(20);
    await change(editor, 'view', 'grid');
    expect(reports).toHaveLength(0);
    await change(editor, 'title', 'Example');
    expect(reports.at(-1)).not.toHaveProperty('time_grid');
    expect(notice(editor)).toBeNull();
  });

  it('treats null or missing root values as unset', async () => {
    const { editor, reports } = await mount({
      event_font_size: null,
      show_past_events: undefined,
    });
    await change(editor, 'view', 'grid');
    expect(reports.at(-1)).not.toHaveProperty('time_grid');
    expect(notice(editor)).toBeNull();
  });

  it('does not report a conflict for equivalent coerced values', async () => {
    const { editor, reports } = await mount({ day_spacing: 1 });
    await change(editor, 'view', 'grid');
    expect(reports.at(-1)).toHaveProperty('time_grid.day_spacing', '1px');
    expect(notice(editor)).toBeNull();
  });

  it('pins an authored value that already matches the Grid default', async () => {
    const { editor, reports } = await mount({ event_font_size: '12px' });
    await change(editor, 'view', 'grid');
    expect(reports.at(-1)).toHaveProperty('time_grid', { event_font_size: '12px' });
    expect(notice(editor)).toBeNull();
  });

  it('keeps a fresh card block-free across later view switches and unrelated edits', async () => {
    const { editor, reports } = await mount();
    await change(editor, 'view', 'grid');
    expect(reports[0]).not.toHaveProperty('time_grid');
    await change(editor, 'view', 'list');
    await change(editor, 'view', 'grid');
    await change(editor, 'title', 'Example');
    expect(reports).toHaveLength(4);
    for (const config of reports) expect(config).not.toHaveProperty('time_grid');
    expect(formFor(editor, 'event_background_opacity').data.event_background_opacity).toBe(20);
  });

  it('does not present implicit Grid defaults as customized values', async () => {
    const { editor, reports } = await mount();
    await change(editor, 'view', 'grid');
    expect(formFor(editor, 'event_background_opacity').data.event_background_opacity).toBe(20);
    await change(editor, 'customized_only', true);
    expect(reports).toHaveLength(1);
    expect(formFor(editor, 'calendars')).toBeDefined();
    const fields = [...editor.shadowRoot!.querySelectorAll<Form>('ha-form.panel-form')].flatMap(
      (form) => [...workspaceFields(form.schema)].map(({ node }) => node.name),
    );
    expect(fields).not.toContain('event_background_opacity');
    expect(fields).not.toContain('event_font_size');
  });

  it('does not remove existing explicit defaults from an older Grid configuration', async () => {
    const { editor, reports } = await mount({
      view: 'grid',
      time_grid: { ...View.TIME_GRID_DEFAULT_OVERRIDES, min_day_width: 90 },
    });
    await change(editor, 'title', 'Example');
    expect(reports).toHaveLength(1);
    expect(reports[0]).toHaveProperty('time_grid', {
      ...View.TIME_GRID_DEFAULT_OVERRIDES,
      min_day_width: 90,
    });
    await change(editor, 'view', 'list');
    await change(editor, 'view', 'grid');
    expect(reports.at(-1)?.time_grid).toEqual(reports[0].time_grid);
  });
});
