import { afterEach, describe, expect, it } from 'vitest';

import { CARD, type EditorElement, changeField, formsOf, mountEditor } from './helpers/editor-host';
import * as Config from '../src/config/config';
import { walkSchema } from '../src/rendering/editor/panels';
import { workspaceFields } from '../src/rendering/editor/routing';
import type { EditorWorkspace } from '../src/rendering/editor/workspace';

function fields(editor: EditorElement): string[] {
  return formsOf(editor, CARD).flatMap((form) =>
    [...workspaceFields(form.schema)].map(({ node }) => node.name),
  );
}

async function mount() {
  const editor = await mountEditor({
    config_version: Config.CURRENT_CONFIG_VERSION,
    entities: ['calendar.anna'],
    view: 'grid',
    allday_badge: 'title',
    allday_badge_color: '#123456',
    time_grid: { allday_badge: 'time', allday_badge_color: '#abcdef' },
  });
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
      await changeField(editor, 'workspace:editing_workspace', workspace);
      const names = fields(editor);
      expect(names).toContain('event_icon_vertical_alignment');
      for (const key of BADGE_FIELDS) {
        expect(names.includes(key), key).toBe(workspace !== 'grid');
      }
      const headings = formsOf(editor, CARD)
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
      await changeField(editor, 'filter:search', query);
      expect(fields(editor).some((key) => BADGE_FIELDS.includes(key))).toBe(false);
      expect(editor.shadowRoot!.querySelector('[data-reset-keys^="allday_badge"]')).toBeNull();
    },
  );

  it('does not drop inactive YAML when an unrelated Grid value changes', async () => {
    const { editor, reports } = await mount();
    await changeField(editor, 'events:show_description', true);
    expect(reports.slice(-1)[0]).toHaveProperty('allday_badge', 'title');
    expect(reports.slice(-1)[0]).toHaveProperty('allday_badge_color', '#123456');
    expect(reports.slice(-1)[0]).toHaveProperty('time_grid.allday_badge', 'time');
    expect(reports.slice(-1)[0]).toHaveProperty('time_grid.allday_badge_color', '#abcdef');
    expect(reports.slice(-1)[0]).toHaveProperty('time_grid.show_description', true);
  });
});
