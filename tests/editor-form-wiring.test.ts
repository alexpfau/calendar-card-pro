/**
 * Rendered-editor coverage for the five form handlers that are not the
 * copy/paste buttons.
 *
 * `tests/editor-copy-paste-wiring.test.ts` renders the editor and clicks its
 * two action buttons. Every other interactive surface in the editor is a
 * `value-changed` listener on an `ha-form`, and none of them had a test that
 * dispatched one: the filter bar, the panel option forms, the per-calendar
 * forms, and the two exception forms could each be unwired without any gate
 * noticing. These tests dispatch the same bubbling, composed `value-changed`
 * event Home Assistant's own forms emit, and assert what the editor does with
 * it -- the reported config, the re-rendered panel list, and the fact that the
 * event is stopped rather than allowed to escape into the dashboard.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import {
  CARD,
  type FormElement,
  type MountedEditor,
  changeField,
  changeFields,
  emitChange,
  entry,
  formOf,
  formsOf,
  mountEditor,
  openPageOf,
  openPanels,
  resetButton,
  resultRows,
  valueOf,
} from './helpers/editor-host';
import * as Config from '../src/config/config';
import * as Entities from '../src/rendering/editor/entities';
import { walkSchema } from '../src/rendering/editor/panels';

type EditorHost = MountedEditor;

/** Mounts a configured editor and waits for its first render. */
async function mount(config: Record<string, unknown>): Promise<EditorHost> {
  const editor = await mountEditor({ config_version: Config.CURRENT_CONFIG_VERSION, ...config });
  // A closed panel mounts no form: open every panel, as these tests read forms across the editor.
  await openPanels(editor);
  return editor;
}

/** Collects every config the editor reports while `run` executes. */
function reported(element: EditorHost): Array<Record<string, unknown>> {
  const seen: Array<Record<string, unknown>> = [];
  element.addEventListener('config-changed', (event) => {
    const config = {
      ...((event as CustomEvent).detail.config as Record<string, unknown>),
    };
    delete config.config_version;
    seen.push(config);
  });
  return seen;
}

/** The field names in an `ha-form`'s schema. */
function schemaNames(form: FormElement): string[] {
  return [...walkSchema(form.schema ?? [])].map(({ node }) => node.name);
}

/** The panel form that owns a given field. */
function panelOwning(element: EditorHost, id: string): FormElement {
  const owner = formOf(element, id);
  if (!owner) throw new Error(`no panel form owns ${id}`);
  return owner;
}

beforeEach(() => {
  document.body.innerHTML = '';
  Entities.clearCopiedSettings();
});

describe('editor filter bar', () => {
  it('lists what the search finds in place of the overview’s forms', async () => {
    const element = await mount({ entities: ['calendar.a'] });
    const before = formsOf(element, CARD).length;
    expect(before).toBeGreaterThan(1);

    await changeFields(element, { 'filter:search': 'weather', 'filter:customized_only': false });

    // What the search finds, as rows, which mount no form.
    expect(formsOf(element, CARD)).toHaveLength(0);
    expect(resultRows(element).some((row) => row.id === 'weather:weather.entity')).toBe(true);
  });

  it('restores every form when the search is cleared', async () => {
    const element = await mount({ entities: ['calendar.a'] });
    const before = formsOf(element, CARD).length;

    await changeFields(element, { 'filter:search': 'weather', 'filter:customized_only': false });
    expect(formsOf(element, CARD).length).toBeLessThan(before);

    await changeFields(element, { 'filter:search': '', 'filter:customized_only': false });
    expect(formsOf(element, CARD)).toHaveLength(before);
  });

  it('keeps the filter event inside the editor', async () => {
    const element = await mount({ entities: ['calendar.a'] });
    let escaped = 0;
    document.addEventListener('value-changed', () => (escaped += 1));

    await changeFields(element, { 'filter:search': 'weather', 'filter:customized_only': false });

    expect(escaped).toBe(0);
  });

  it('does not report a config change for a filter-only interaction', async () => {
    const element = await mount({ entities: ['calendar.a'] });
    const seen = reported(element);

    await changeFields(element, { 'filter:search': 'weather', 'filter:customized_only': false });

    expect(seen).toHaveLength(0);
  });
});

describe('editor panel option forms', () => {
  const workspaces = ['shared', 'list', 'column', 'grid'] as const;

  it.each(
    workspaces.flatMap((from) =>
      workspaces.filter((to) => to !== from).map((to) => ({ from, to })),
    ),
  )('keeps a delayed $from form event in $from after selecting $to', async ({ from, to }) => {
    const config = {
      entities: ['calendar.anna'],
      view: 'grid',
      event_font_size: '17px',
      list: { event_font_size: '19px' },
      column: { event_font_size: '21px' },
      time_grid: { event_font_size: '23px' },
    };
    const element = await mount(config);
    const seen = reported(element);
    await changeField(element, 'workspace:editing_workspace', from);
    const origin = panelOwning(element, 'events:event_font_size');

    await changeField(element, 'workspace:editing_workspace', to);
    expect(seen).toHaveLength(0);

    emitChange(origin, { 'events:event_font_size': '31px' });
    await element.updateComplete;

    const block = from === 'grid' ? 'time_grid' : from;
    const expected =
      from === 'shared'
        ? { ...config, event_font_size: '31px' }
        : { ...config, [block]: { event_font_size: '31px' } };
    expect(seen).toEqual([expected]);
    expect(panelOwning(element, 'events:event_font_size')).not.toBe(origin);
  });

  it('keeps the same panel form across ordinary edits within one workspace', async () => {
    const element = await mount({ entities: ['calendar.anna'], view: 'grid' });
    await openPageOf(element, 'events:event_font_size');
    const form = panelOwning(element, 'events:event_font_size');
    await changeField(element, 'events:event_font_size', '18px');

    expect(panelOwning(element, 'events:event_font_size')).toBe(form);
  });

  it('reports the changed option and preserves the configured calendars', async () => {
    const element = await mount({
      entities: [{ entity: 'calendar.a', label: 'A' }, 'calendar.b'],
    });
    const seen = reported(element);

    await changeField(element, 'content:days_to_show', 7);

    // A list card opens in the List workspace, so the count lands in `list:` since v5.
    expect(seen).toHaveLength(1);
    expect(seen[0].list).toMatchObject({ days_to_show: 7 });
    expect(seen[0].days_to_show).toBeUndefined();
    expect(seen[0].entities).toEqual([{ entity: 'calendar.a', label: 'A' }, 'calendar.b']);
  });

  it('keeps a separate diff baseline per panel so edits accumulate', async () => {
    const element = await mount({ entities: ['calendar.a'] });
    const seen = reported(element);

    await changeField(element, 'content:first_day_of_week', 'sunday');

    await changeField(element, 'events:title_max_lines', 3);

    // Located by name rather than by position: `first_day_of_week` is fetch-time and stays
    // at the top level, `title_max_lines` is a list override and lands in `list:` in v5. The
    // subject is that both survive one report, not where either sits.
    expect(seen).toHaveLength(2);
    expect(seen[1].first_day_of_week).toBe('sunday');
    expect(seen[1].list).toHaveProperty('title_max_lines', 3);
  });

  it('keeps the panel event inside the editor', async () => {
    const element = await mount({ entities: ['calendar.a'] });
    let escaped = 0;
    document.addEventListener('value-changed', () => (escaped += 1));

    await changeField(element, 'content:days_to_show', 7);

    expect(escaped).toBe(0);
  });

  it('keeps both edits when two changes arrive before the next render', async () => {
    const element = await mount({ entities: ['calendar.a'] });
    const seen = reported(element);

    // Each field in a form of its own: one on the overview, one on Day Header.
    const days = panelOwning(element, 'content:days_to_show');
    const week = panelOwning(element, 'content:first_day_of_week');
    emitChange(days, { 'content:days_to_show': 7 });
    emitChange(week, { 'content:first_day_of_week': 'monday' });
    await element.updateComplete;

    const last = seen[seen.length - 1];
    expect(last).toBeDefined();
    // Two destinations from one form: the count into `list:`, the week start at root.
    expect(last.list).toMatchObject({ days_to_show: 7 });
    expect(last.first_day_of_week).toBe('monday');
  });

  it('does not report again when the same value is re-submitted', async () => {
    const element = await mount({ entities: ['calendar.a'] });
    const seen = reported(element);

    await changeField(element, 'content:days_to_show', 7);
    expect(seen).toHaveLength(1);

    await changeField(element, 'content:days_to_show', 7);

    expect(seen).toHaveLength(1);
  });
});

describe('editor per-calendar forms', () => {
  it('writes the change to the calendar whose form emitted it', async () => {
    const element = await mount({
      entities: [
        { entity: 'calendar.a', label: 'A' },
        { entity: 'calendar.b', label: 'B' },
      ],
    });
    const seen = reported(element);

    // Each calendar draws its own forms on its entry page, one per field, and no other entry's.
    expect([0, 1].map((index) => formsOf(element, entry(index)).length > 0)).toEqual([true, true]);
    expect(formsOf(element, entry())).toEqual([
      ...formsOf(element, entry(0)),
      ...formsOf(element, entry(1)),
    ]);

    await changeField(element, 'calendar:label', 'CHANGED', entry(1));

    expect(seen).toHaveLength(1);
    expect(seen[0].entities).toEqual([
      { entity: 'calendar.a', label: 'A' },
      { entity: 'calendar.b', label: 'CHANGED' },
    ]);
  });

  it('keeps the calendar event inside the editor', async () => {
    const element = await mount({ entities: [{ entity: 'calendar.a', label: 'A' }] });
    let escaped = 0;
    document.addEventListener('value-changed', () => (escaped += 1));

    await changeField(element, 'calendar:label', 'CHANGED', entry(0));

    expect(escaped).toBe(0);
  });
});

describe('direct view forms and resets', () => {
  it('offers the view value without a picker or a duplicate form', async () => {
    const element = await mount({ entities: ['calendar.a'], view: 'column' });
    expect(element.shadowRoot!.querySelectorAll('ha-form.exception-form')).toHaveLength(0);

    expect(element.shadowRoot!.querySelector('.exception-picker')).toBeNull();
    expect(schemaNames(panelOwning(element, 'layout:day_spacing'))).toContain('day_spacing');
  });

  it('resets an override without removing the input', async () => {
    const element = await mount({
      entities: ['calendar.a'],
      view: 'column',
      column: { day_spacing: '20px' },
    });
    const reset = await resetButton(element, 'day_spacing');
    expect(reset).not.toBeNull();
    reset!.click();
    await element.updateComplete;
    await openPageOf(element, 'layout:day_spacing');
    expect(valueOf(element, 'layout:day_spacing')).toBe('10px');
    expect(await resetButton(element, 'day_spacing')).toBeNull();
  });

  it('writes an override value into the view block', async () => {
    const element = await mount({ entities: ['calendar.a'], view: 'column' });
    const seen = reported(element);

    const key = 'day_spacing';
    await changeField(element, `layout:${key}`, '20px');

    const last = seen[seen.length - 1];
    expect(last).toBeDefined();
    expect(last.column).toEqual({ [key]: '20px' });
  });

  it('keeps routed view events inside the editor', async () => {
    const element = await mount({ entities: ['calendar.a'], view: 'column' });
    let escaped = 0;
    document.addEventListener('value-changed', () => (escaped += 1));

    await changeField(element, 'layout:day_spacing', '20px');

    expect(escaped).toBe(0);
  });
});
