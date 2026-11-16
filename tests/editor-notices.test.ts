/**
 * The notices page (backlog item 307, the editor redesign's PR 16): one overview row names the
 * options the card ignores and the options v3.0.0 removed, and the page it opens moves each to
 * where it works, as one undo step. A removed option goes to its replacement while that is free;
 * the next change would otherwise remove it (`value.ts` › `pruneDeprecatedKeys`).
 */
import { afterEach, describe, expect, it } from 'vitest';

import { lastConfig, mountEditor } from './helpers/editor-host';
import * as Config from '../src/config/config';
import * as Deprecated from '../src/rendering/editor/deprecated';

type Editor = Awaited<ReturnType<typeof mountEditor>>;

const VERSION = Config.CURRENT_CONFIG_VERSION;

afterEach(() => document.body.replaceChildren());

const $ = (editor: Editor, selector: string): HTMLElement | null =>
  editor.shadowRoot!.querySelector<HTMLElement>(selector);

const text = (element: Element | null | undefined): string =>
  (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

async function click(editor: Editor, target: HTMLElement | null): Promise<void> {
  expect(target).not.toBeNull();
  target!.click();
  await editor.updateComplete;
  await editor.updateComplete;
}

/** Each old option's line on the notices page, by path. */
function oldLines(editor: Editor): Record<string, string> {
  return Object.fromEntries(
    [...editor.shadowRoot!.querySelectorAll<HTMLElement>('[data-old]')].map((line) => [
      line.dataset.old!,
      text(line),
    ]),
  );
}

function button(editor: Editor, path: string): HTMLElement | null {
  return $(editor, `[data-old="${path}"] button`);
}

describe('the notices page', () => {
  it('is one overview row naming both kinds, with their counts', async () => {
    const editor = await mountEditor({
      config_version: VERSION,
      entities: [{ entity: 'calendar.anna', max_events_to_show: 3 }],
      row_spacing: '5px',
      list: { toolbar: { show: true } },
    });

    expect(text($(editor, '[data-focus="notices"] .nav-title'))).toBe(
      'Options the Card Ignores: 1 · Old Options: 2',
    );
    await click(editor, $(editor, '[data-focus="notices"]'));
    expect($(editor, '.page')!.dataset.page).toBe('notices');
    expect(text($(editor, '.page-title'))).toBe('Options the Card Ignores');
    expect($(editor, '[data-misplaced="list.toolbar"]')).not.toBeNull();
    expect(text($(editor, '[data-heading="old"] .hint'))).toBe('The next change removes these.');
    expect(oldLines(editor)).toEqual({
      row_spacing: 'row_spacing Replaced by Day Spacing. Move to Day Spacing',
      'entities[0].max_events_to_show':
        'entities[0].max_events_to_show Replaced by Compact Events to Show. Move to Compact Events to Show',
    });
  });

  it('moves an old option to its replacement, as one undo step', async () => {
    const card = {
      config_version: VERSION,
      entities: ['calendar.anna'],
      title: 'Family',
      row_spacing: '5px',
      show_location: true,
    };
    const editor = await mountEditor(card);
    await click(editor, $(editor, '[data-focus="notices"]'));
    await click(editor, button(editor, 'row_spacing'));

    expect(lastConfig(editor)).toEqual({
      config_version: VERSION,
      entities: ['calendar.anna'],
      title: 'Family',
      day_spacing: '5px',
      show_location: true,
    });
    expect(oldLines(editor)).toEqual({});
    await click(editor, $(editor, '[data-focus="undo"]'));
    expect(lastConfig(editor)).toEqual(card);
  });

  it('moves a calendar’s old option onto that calendar', async () => {
    const editor = await mountEditor({
      config_version: VERSION,
      entities: ['calendar.anna', { entity: 'calendar.ben', max_events_to_show: 3 }],
    });
    await click(editor, $(editor, '[data-focus="notices"]'));
    await click(editor, button(editor, 'entities[1].max_events_to_show'));

    expect(lastConfig(editor)!.entities).toEqual([
      'calendar.anna',
      { entity: 'calendar.ben', compact_events_to_show: 3 },
    ]);
  });

  it('offers no move where the replacement is already set', async () => {
    const editor = await mountEditor({
      config_version: VERSION,
      entities: ['calendar.anna'],
      row_spacing: '5px',
      day_spacing: '8px',
    });
    await click(editor, $(editor, '[data-focus="notices"]'));

    expect(button(editor, 'row_spacing')).toBeNull();
    expect(oldLines(editor).row_spacing).toBe(
      'row_spacing Replaced by Day Spacing. Day Spacing already sets it.',
    );
  });

  it('moves an option the card ignores as one undo step', async () => {
    const card = { config_version: VERSION, entities: ['calendar.anna'], hour_height: '40px' };
    const editor = await mountEditor(card);
    await click(editor, $(editor, '[data-focus="notices"]'));
    await click(editor, $(editor, '[data-misplaced="hour_height"] button'));

    expect(lastConfig(editor)).toEqual({
      config_version: VERSION,
      entities: ['calendar.anna'],
      time_grid: { hour_height: '40px' },
    });
    await click(editor, $(editor, '[data-focus="undo"]'));
    expect(lastConfig(editor)).toEqual(card);
  });

  it('keeps an old option where it stands among its neighbors', () => {
    const raw = { a: 1, row_spacing: '5px', b: 2 };
    const [old] = Deprecated.oldOptions(raw);

    expect(Object.keys(Deprecated.moveOld(raw, old)!)).toEqual(['a', 'day_spacing', 'b']);
    expect(raw).toEqual({ a: 1, row_spacing: '5px', b: 2 });
    expect(Deprecated.moveOld({ ...raw, day_spacing: '8px' }, old)).toBeUndefined();
  });
});
