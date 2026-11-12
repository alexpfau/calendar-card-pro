/**
 * The editor's notice about options written where the card ignores them (backlog item 192).
 *
 * The card reports these only through development-build warnings, so a YAML author never
 * learned that `time_grid: { toolbar: … }` did nothing. The editor now lists every such option
 * from the same rule (`findMisplacedOptions`) and moves one to where it works when that place is
 * free. A move must survive the next unrelated edit even when the moved value equals a default,
 * which is why it edits the YAML's own configuration rather than going through `_report`.
 */
import { afterEach, describe, expect, it } from 'vitest';

import * as Config from '../src/config/config';
import { CalendarCardProEditor } from '../src/rendering/editor/element';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import { workspaceFields } from '../src/rendering/editor/routing';

customElements.define('editor-misplaced-notice-test', CalendarCardProEditor);

interface EditorHost extends HTMLElement {
  hass: unknown;
  setConfig(config: Record<string, unknown>): void;
  readonly updateComplete: Promise<unknown>;
}

interface Form extends HTMLElement {
  schema: ReadonlyArray<HaFormSchema>;
  data: Record<string, unknown>;
}

async function mount(config: Record<string, unknown>, language = 'en') {
  const editor = document.createElement('editor-misplaced-notice-test') as EditorHost;
  editor.hass = { states: {}, locale: { language } };
  editor.setConfig({
    config_version: Config.CURRENT_CONFIG_VERSION,
    entities: ['calendar.anna'],
    ...config,
  });
  document.body.appendChild(editor);
  await editor.updateComplete;
  const reports: Record<string, unknown>[] = [];
  editor.addEventListener('config-changed', (event) => {
    const reported = (event as CustomEvent<{ config: Record<string, unknown> }>).detail.config;
    reports.push(structuredClone(reported));
    // Home Assistant echoes every write back.
    editor.setConfig(reported);
  });
  return { editor, reports };
}

function notice(editor: EditorHost): HTMLElement | null {
  return editor.shadowRoot!.querySelector<HTMLElement>('[data-misplaced-options]');
}

function rows(editor: EditorHost): Record<string, { text: string; buttons: string[] }> {
  return Object.fromEntries(
    [...(notice(editor)?.querySelectorAll<HTMLElement>('li') ?? [])].map((li) => [
      li.dataset.misplaced!,
      {
        text: li.textContent!.replace(/\s+/g, ' ').trim(),
        buttons: [...li.querySelectorAll('button')].map((b) => b.textContent!.trim()),
      },
    ]),
  );
}

async function press(editor: EditorHost, path: string, label: string): Promise<void> {
  const button = [
    ...notice(editor)!.querySelectorAll<HTMLButtonElement>(`li[data-misplaced="${path}"] button`),
  ].find((candidate) => candidate.textContent!.trim() === label);
  expect(button, `${label} for ${path}`).toBeDefined();
  button!.click();
  await editor.updateComplete;
}

async function change(editor: EditorHost, key: string, value: unknown): Promise<void> {
  const form = [...editor.shadowRoot!.querySelectorAll<Form>('ha-form')].find((candidate) =>
    [...workspaceFields(candidate.schema)].some(({ node }) => node.name === key),
  )!;
  form.dispatchEvent(
    new CustomEvent('value-changed', {
      detail: { value: { ...form.data, [key]: value } },
      bubbles: true,
      composed: true,
    }),
  );
  await editor.updateComplete;
}

afterEach(() => document.body.replaceChildren());

describe('the misplaced-option notice', () => {
  it('is absent while every option is where it works', async () => {
    const { editor } = await mount({
      toolbar: { show: true },
      column: { min_day_width: '120px' },
      time_grid: { start_time: '07:00' },
    });

    expect(notice(editor)).toBeNull();
  });

  it('lists each misplaced option with where it works and a button per free place', async () => {
    const { editor } = await mount({
      min_day_width: '100px',
      column: { min_day_width: '120px' },
      list: { toolbar: { show: true }, shwo_location: true },
      time_grid: { weather: { entity: 'weather.home' } },
      weather: { entity: 'weather.home' },
    });

    expect(rows(editor)).toEqual({
      min_day_width: {
        text:
          'min_day_width Works only in a layout’s own settings: Columns or Grid. ' +
          'Columns already sets it. Move to Grid',
        buttons: ['Move to Grid'],
      },
      'list.toolbar': {
        text: 'list.toolbar Works only for the whole card, at the top level. Move to Top Level',
        buttons: ['Move to Top Level'],
      },
      'list.shwo_location': {
        text: 'list.shwo_location Not an option of this card. Check its spelling and where it is.',
        buttons: [],
      },
      'time_grid.weather': {
        text:
          'time_grid.weather Decides which events are loaded, so it works only for the whole ' +
          'card, at the top level. Top Level already sets it.',
        buttons: [],
      },
    });
  });

  it('names the layout a key from another layout belongs to', async () => {
    const { editor } = await mount({ column: { start_time: '07:00' } });

    expect(rows(editor)['column.start_time']).toEqual({
      text: 'column.start_time Belongs to another layout: Grid. Move to Grid',
      buttons: ['Move to Grid'],
    });
  });

  it('moves a card-wide option to the top level and drops the emptied block', async () => {
    const { editor, reports } = await mount({ time_grid: { toolbar: { show: true } } });

    await press(editor, 'time_grid.toolbar', 'Move to Top Level');

    expect(reports).toHaveLength(1);
    expect(reports[0].toolbar).toEqual({ show: true });
    expect(reports[0]).not.toHaveProperty('time_grid');
    expect(notice(editor)).toBeNull();
  });

  it('moves a view-only option into its block', async () => {
    const { editor, reports } = await mount({
      hour_height: '40px',
      time_grid: { slot_minutes: 30 },
    });

    await press(editor, 'hour_height', 'Move to Grid');

    expect(reports[0]).not.toHaveProperty('hour_height');
    expect(reports[0].time_grid).toEqual({ slot_minutes: 30, hour_height: '40px' });
  });

  it('keeps a moved value equal to the default through the next unrelated edit', async () => {
    const { editor, reports } = await mount({
      title: 'Before',
      list: { allow_event_edit: true, hide_when_empty: false },
    });

    await press(editor, 'list.allow_event_edit', 'Move to Top Level');
    await press(editor, 'list.hide_when_empty', 'Move to Top Level');
    await change(editor, 'title', 'After');

    const last = reports[reports.length - 1];
    expect(last.title).toBe('After');
    expect(last.allow_event_edit).toBe(true);
    expect(last.hide_when_empty).toBe(false);
    expect(last).not.toHaveProperty('list');
  });

  it('keeps a misplaced list line, and the notice, through an unrelated edit', async () => {
    const { editor, reports } = await mount({ title: 'Before', list: { start_date: 'today' } });

    await change(editor, 'title', 'After');

    expect(reports[reports.length - 1].list).toEqual({ start_date: 'today' });
    expect(Object.keys(rows(editor))).toEqual(['list.start_date']);
  });

  it('stays in view while search hides every panel', async () => {
    const { editor } = await mount({ list: { toolbar: { show: true } } });
    const filter = editor.shadowRoot!.querySelector<Form>('.filter-form')!;

    filter.dispatchEvent(
      new CustomEvent('value-changed', {
        detail: { value: { ...filter.data, search: 'zzzz-no-such-option', customized_only: true } },
        bubbles: true,
        composed: true,
      }),
    );
    await editor.updateComplete;

    expect(Object.keys(rows(editor))).toEqual(['list.toolbar']);
  });

  it('speaks the editor language, joining places the way it writes a list', async () => {
    const { editor } = await mount({ day_header_gap: '8px' }, 'de');

    expect(notice(editor)!.querySelector('strong')!.textContent).not.toBe(
      'Options the Card Ignores',
    );
    expect(rows(editor).day_header_gap.text).toContain('Spalten oder Zeitraster');
  });
});
