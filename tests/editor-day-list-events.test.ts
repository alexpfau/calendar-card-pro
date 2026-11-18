/**
 * Events in Day List: the room a compact month's day list keeps (`month → day_list_events`), a
 * setting of its own on Size & Spacing › Card Size, right after Height Per Week, under Settings
 * For Month alone. Both decide how tall a month is: Height Per Week the wide form's weeks, this
 * the compact form's list, and a fixed card Height above them scrolls either.
 *
 * Read off the mounted editor, as a user meets it: folded at its default to its number, its
 * helper behind ⓘ saying what 0 does, a write stored in `month:`, and its Reset taking the key
 * away again.
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  changeField,
  goPage,
  lastConfig,
  lineOf,
  mountEditor,
  stateWordOf,
  valueOf,
} from './helpers/editor-host';
import * as Config from '../src/config/config';

type Editor = Awaited<ReturnType<typeof mountEditor>>;

const ID = 'layout:month.day_list_events';

afterEach(() => document.body.replaceChildren());

/**
 * Mounts the editor over a month card with one calendar, on Size & Spacing.
 *
 * @param extra - Further options
 * @returns The editor
 */
async function mount(extra: Record<string, unknown> = {}): Promise<Editor> {
  const editor = await mountEditor({
    config_version: Config.CURRENT_CONFIG_VERSION,
    entities: ['calendar.anna'],
    view: 'month',
    ...extra,
  });
  await goPage(editor, 'size_spacing');
  return editor;
}

/** The settings the open page draws, in order. */
function settings(editor: Editor): string[] {
  return [...editor.shadowRoot!.querySelectorAll<HTMLElement>('[data-setting]')].map(
    (setting) => setting.dataset.setting!,
  );
}

/** The setting's block on the open page. */
function setting(editor: Editor): HTMLElement | null {
  return editor.shadowRoot!.querySelector<HTMLElement>(`[data-setting="${ID}"]`);
}

describe('Events in Day List', () => {
  it('follows Height Per Week under Card Size & Spacing, only while Settings For is Month', async () => {
    const editor = await mount();
    const order = settings(editor);
    expect(order.indexOf(ID)).toBe(order.indexOf('layout:month.row_height') + 1);
    expect(setting(editor)!.closest<HTMLElement>('[data-heading]')?.dataset.heading).toBe(
      'heading_card_size',
    );

    await changeField(editor, 'workspace:editing_workspace', 'list');
    await goPage(editor, 'size_spacing');
    expect(setting(editor)).toBeNull();
  });

  it('folds at its default to its number, and says what 0 does behind ⓘ', async () => {
    const editor = await mount();
    const toggle = setting(editor)!.querySelector<HTMLButtonElement>('.setting-toggle')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-label')).toBe('Events in Day List, 4');
    expect(stateWordOf(editor, ID)).toBe('Default');
    expect(setting(editor)!.querySelector('.setting-help')?.textContent?.trim()).toBe(
      '0 lists every event, and the card then grows and shrinks with the day.',
    );
  });

  it('stores a count in month:, and its Reset takes it away', async () => {
    const editor = await mount();
    await changeField(editor, ID, 6);
    expect(lastConfig(editor)?.month).toEqual({ day_list_events: 6 });
    expect(valueOf(editor, ID)).toBe(6);

    await changeField(editor, ID, 0);
    expect(lastConfig(editor)?.month).toEqual({ day_list_events: 0 });

    // A stored value never folds; its Reset follows Set.
    const reset = lineOf(editor, ID)!.querySelector<HTMLButtonElement>('button[data-reset-keys]')!;
    expect(reset.dataset.resetKeys).toBe('day_list_events');
    reset.click();
    await editor.updateComplete;
    expect(lastConfig(editor)?.month).toBeUndefined();
    expect(valueOf(editor, ID)).toBe(4);
  });
});
