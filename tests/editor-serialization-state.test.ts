import { afterEach, describe, expect, it } from 'vitest';

import { changeField, editLayout, mountEditor, openPanels, valueOf } from './helpers/editor-host';
import * as Config from '../src/config/config';

async function mount(config: Record<string, unknown>) {
  const editor = await mountEditor({
    config_version: Config.CURRENT_CONFIG_VERSION,
    entities: ['calendar.anna'],
    ...config,
  });
  // A closed panel mounts no form: open every panel, as these tests read forms across the editor.
  await openPanels(editor);
  const reports: Record<string, unknown>[] = [];
  editor.addEventListener('config-changed', (event) => {
    reports.push(structuredClone((event as CustomEvent).detail.config));
  });
  return { editor, reports };
}

afterEach(() => document.body.replaceChildren());

describe.each(['list', 'column', 'grid', 'month'] as const)(
  '%s serialized editor state',
  (view) => {
    it.each([false, true])(
      'follows the saved override ownership before another edit (echo=%s)',
      async (echo) => {
        const block = view === 'grid' ? 'time_grid' : view;
        // Month draws no description (`MONTH_PINNED`), so its turn is the duration's, another
        // shared switch that starts off and that Month reads.
        const option = view === 'month' ? 'show_duration' : 'show_description';
        const id = `events:${option}` as const;
        const { editor, reports } = await mount({
          view,
          [block]: { [option]: true },
        });
        await changeField(editor, id, false);
        const saved = reports.slice(-1)[0]!;
        if (view === 'list') expect(saved).toHaveProperty(`list.${option}`, false);
        else expect(saved).not.toHaveProperty(block);

        if (echo) {
          editor.setConfig(saved);
          await editor.updateComplete;
        }
        await editLayout(editor, 'shared');
        await changeField(editor, id, true);
        await editLayout(editor, view);

        const stored = reports.slice(-1)[0]!;
        expect(stored).toHaveProperty(option, true);
        if (view === 'list') expect(stored).toHaveProperty(`list.${option}`, false);
        else expect(stored).not.toHaveProperty(block);
        expect(valueOf(editor, id)).toBe(view !== 'list');

        const reopened = await mount(stored);
        expect(valueOf(reopened.editor, id)).toBe(valueOf(editor, id));
        // Over a second in a full local run; the limit is set for CI's slower runner under load
        // rather than for a hang.
      },
      30_000,
    );
  },
);

it.each([false, true])(
  'retains an explicit divergent Grid default (echo=%s)',
  async (echo) => {
    const { editor, reports } = await mount({
      view: 'grid',
      time_grid: { event_font_size: '18px' },
    });
    await changeField(editor, 'events:event_font_size', '12px');
    expect(reports.slice(-1)[0]).toHaveProperty('time_grid.event_font_size', '12px');
    if (echo) {
      editor.setConfig(reports.slice(-1)[0]!);
      await editor.updateComplete;
    }
    await editLayout(editor, 'shared');
    await changeField(editor, 'events:event_font_size', '20px');
    await editLayout(editor, 'grid');
    expect(reports.slice(-1)[0]).toHaveProperty('event_font_size', '20px');
    expect(reports.slice(-1)[0]).toHaveProperty('time_grid.event_font_size', '12px');
    expect(valueOf(editor, 'events:event_font_size')).toBe('12px');
    // Over a second in a full local run; the limit is set for CI's slower runner under load
    // rather than for a hang.
  },
  30_000,
);

it('keeps incomplete scoped text through a save and an echo', async () => {
  const { editor, reports } = await mount({
    view: 'grid',
    time_grid: { height: '400px' },
  });
  await changeField(editor, 'layout:card_height', '');
  expect(reports).toHaveLength(0);
  await changeField(editor, 'events:show_description', true);
  expect(reports.slice(-1)[0]).toHaveProperty('time_grid.height', '400px');
  expect(valueOf(editor, 'layout:card_height')).toBe('');
  editor.setConfig(reports.slice(-1)[0]!);
  await editor.updateComplete;
  expect(valueOf(editor, 'layout:card_height')).toBe('');
  // Over a second in a full local run; the limit is set for CI's slower runner under load
  // rather than for a hang.
}, 30_000);
