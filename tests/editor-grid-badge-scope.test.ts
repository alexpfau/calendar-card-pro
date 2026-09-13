import { afterEach, describe, expect, it } from 'vitest';

import * as Config from '../src/config/config';
import { CalendarCardProEditor } from '../src/rendering/editor/element';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import { walkSchema } from '../src/rendering/editor/panels';
import { workspaceFields } from '../src/rendering/editor/routing';
import type { EditorWorkspace } from '../src/rendering/editor/workspace';

customElements.define('editor-grid-badge-scope-test', CalendarCardProEditor);

interface Editor extends HTMLElement {
  hass: unknown;
  setConfig(config: Record<string, unknown>): void;
  readonly updateComplete: Promise<boolean>;
}

interface Form extends HTMLElement {
  schema: ReadonlyArray<HaFormSchema>;
  data: Record<string, unknown>;
}

function fields(editor: Editor): string[] {
  return [...editor.shadowRoot!.querySelectorAll<Form>('ha-form.panel-form')].flatMap((form) =>
    [...workspaceFields(form.schema)].map(({ node }) => node.name),
  );
}

async function change(editor: Editor, key: string, value: unknown): Promise<void> {
  const forms = [...editor.shadowRoot!.querySelectorAll<Form>('ha-form:not(.entity-form)')].filter(
    (form) => [...workspaceFields(form.schema)].some(({ node }) => node.name === key),
  );
  expect(forms).toHaveLength(1);
  const form = forms[0];
  form.dispatchEvent(
    new CustomEvent('value-changed', {
      detail: { value: { ...form.data, [key]: value } },
      bubbles: true,
      composed: true,
    }),
  );
  await editor.updateComplete;
}

async function mount() {
  const editor = document.createElement('editor-grid-badge-scope-test') as Editor;
  editor.hass = { states: {}, locale: { language: 'en' } };
  editor.setConfig({
    config_version: Config.CURRENT_CONFIG_VERSION,
    entities: ['calendar.anna'],
    view: 'grid',
    allday_badge: 'title',
    allday_badge_color: '#123456',
    time_grid: { allday_badge: 'time', allday_badge_color: '#abcdef' },
  });
  document.body.appendChild(editor);
  await editor.updateComplete;
  const reports: Record<string, unknown>[] = [];
  editor.addEventListener('config-changed', (event) => {
    reports.push(structuredClone((event as CustomEvent).detail.config));
  });
  return { editor, reports };
}

afterEach(() => document.body.replaceChildren());

const BADGE_FIELDS = [
  'allday_badge_position',
  'allday_badge_style',
  'allday_badge_color_mode',
  'allday_badge_color',
];

describe('all-day badge controls follow the layouts that render badges', () => {
  it.each<EditorWorkspace>(['shared', 'list', 'column', 'grid'])(
    'offers only effective controls in %s',
    async (workspace) => {
      const { editor } = await mount();
      await change(editor, 'editing_workspace', workspace);
      const names = fields(editor);
      expect(names).toContain('event_icon_vertical_alignment');
      for (const key of BADGE_FIELDS) {
        expect(names.includes(key), key).toBe(workspace !== 'grid');
      }
      const headings = [...editor.shadowRoot!.querySelectorAll<Form>('ha-form.panel-form')]
        .flatMap((form) => [...walkSchema(form.schema)])
        .filter(({ node }) => 'type' in node && node.type === 'constant')
        .map(({ node }) => node.name);
      expect(headings).toContain(workspace === 'grid' ? 'heading_icons' : 'heading_icon_and_badge');
      expect(headings).not.toContain(
        workspace === 'grid' ? 'heading_icon_and_badge' : 'heading_icons',
      );
    },
  );

  it.each(['badge', 'allday_badge'])(
    'search for %s cannot restore inert controls or resets',
    async (query) => {
      const { editor } = await mount();
      await change(editor, 'search', query);
      expect(fields(editor).some((key) => BADGE_FIELDS.includes(key))).toBe(false);
      expect(editor.shadowRoot!.querySelector('[data-reset-keys^="allday_badge"]')).toBeNull();
    },
  );

  it('does not drop inactive YAML when an unrelated Grid value changes', async () => {
    const { editor, reports } = await mount();
    await change(editor, 'show_description', true);
    expect(reports.at(-1)).toHaveProperty('allday_badge', 'title');
    expect(reports.at(-1)).toHaveProperty('allday_badge_color', '#123456');
    expect(reports.at(-1)).toHaveProperty('time_grid.allday_badge', 'time');
    expect(reports.at(-1)).toHaveProperty('time_grid.allday_badge_color', '#abcdef');
    expect(reports.at(-1)).toHaveProperty('time_grid.show_description', true);
  });
});
