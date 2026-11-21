/**
 * Since v6 an event's details show its location and description whatever a calendar's
 * `show_location: false` or `show_description: false` says; only `private: true` keeps them out.
 * The upgrade on opening names each calendar that hides either, and offers to make it private.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { lastConfig, mountEditor, reportsOf } from './helpers/editor-host';
import * as Config from '../src/config/config';
import { EDITOR_STRINGS } from '../src/rendering/editor/strings';
import { EDITOR_LANGUAGE_STRINGS } from '../src/rendering/editor/translations/index';

type Editor = Awaited<ReturnType<typeof mountEditor>>;

afterEach(() => document.body.replaceChildren());

const text = (element: Element | null | undefined): string =>
  (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

const receipt = (editor: Editor): HTMLElement | null =>
  editor.shadowRoot!.querySelector<HTMLElement>('[data-upgrade-receipt]');

const lines = (editor: Editor): string[] =>
  [...receipt(editor)!.querySelectorAll('[data-upgrade-private]')].map((line) => text(line));

const HIDING = [
  { entity: 'calendar.anna', name: 'Anna', show_location: false },
  { entity: 'calendar.ben', name: 'Ben', show_location: false, show_description: false },
  { entity: 'calendar.cleo', show_description: false, private: true },
  { entity: 'calendar.dana', show_location: true },
];

describe('the upgrade names calendars whose details now show a hidden field', () => {
  it('names each on a v5 card, without writing for it alone', async () => {
    const editor = await mountEditor({ entities: HIDING });

    expect(reportsOf(editor)).toEqual([]);
    expect(text(receipt(editor)!.querySelector('.status-text'))).toBe('Event details changed.');
    expect(lines(editor)).toEqual([
      'Anna hides event locations, but an event’s details now show them. Make It Private',
      'Ben hides event locations and descriptions, but an event’s details now show them. Make It Private',
    ]);
    // Nothing was written, so there is nothing to undo.
    expect(receipt(editor)!.querySelector('[data-focus="status-undo"]')).toBeNull();
  });

  it('makes one private as one undo step, and keeps the others', async () => {
    const editor = await mountEditor({ entities: HIDING });
    receipt(editor)!.querySelector<HTMLButtonElement>('[data-upgrade-private] button')!.click();
    await editor.updateComplete;

    expect((lastConfig(editor)!.entities as unknown[])[0]).toEqual({
      entity: 'calendar.anna',
      name: 'Anna',
      show_location: false,
      private: true,
    });
    expect(lines(editor)).toHaveLength(1);
    expect(lines(editor)[0]).toMatch(/^Ben /);
    receipt(editor)!.querySelector<HTMLButtonElement>('[data-focus="status-undo"]')!.click();
    await editor.updateComplete;
    expect((lastConfig(editor)!.entities as unknown[])[0]).toEqual(HIDING[0]);
  });

  it('joins the receipt of an upgrade that writes', async () => {
    const editor = await mountEditor({ entities: HIDING.slice(0, 1), event_font_size: '18px' });

    expect(text(receipt(editor)!.querySelector('.status-text'))).toMatch(/^Upgraded\. /);
    expect(lines(editor)).toHaveLength(1);
  });

  it('says nothing on a card already in the current format', async () => {
    const editor = await mountEditor({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: HIDING,
    });
    expect(receipt(editor)).toBeNull();
  });

  it.each(Object.keys(EDITOR_LANGUAGE_STRINGS).filter((language) => language !== 'en-gb'))(
    'is written in %s',
    async (language) => {
      const editor = await mountEditor({ language, entities: HIDING.slice(0, 2) });
      const strings = EDITOR_LANGUAGE_STRINGS[language]!;
      for (const key of [
        'upgrade.details_title',
        'upgrade.details_location',
        'upgrade.details_both',
        'upgrade.make_private',
      ]) {
        expect(strings[key], key).toBeDefined();
        expect(strings[key], key).not.toBe(EDITOR_STRINGS[key]);
      }
      expect(text(receipt(editor))).toContain(strings['upgrade.make_private']);
    },
  );
});
