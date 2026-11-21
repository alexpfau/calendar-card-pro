/**
 * Since v6 an event's details show its location and description whatever a calendar's
 * `show_location: false` or `show_description: false` says; only `private: true` keeps them out.
 * The upgrade on opening names each calendar that hides either, and offers to make it private.
 *
 * A card the v5 editor saved (`config_version: 5`) is told too: version 6 exists for that, and its
 * upgrade stamps 6 and moves nothing else, so the notice comes once.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { changeField, lastConfig, mountEditor, reportsOf } from './helpers/editor-host';
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
  it('names each on a card without config_version, without writing for it alone', async () => {
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

  it('says nothing on a card the v6 editor stamped, which was told once', async () => {
    const editor = await mountEditor({ config_version: 6, entities: HIDING });
    expect(receipt(editor)).toBeNull();
    expect(reportsOf(editor)).toEqual([]);
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

describe('a card the v5 editor saved', () => {
  // Root options a v5 card means for every layout: the list migration would move them into `list:`.
  const V5 = {
    config_version: 5,
    entities: HIDING,
    event_font_size: '18px',
    compact_events_to_show: 4,
  };

  it('is named and stamped 6 as it opens, with nothing else moved', async () => {
    const editor = await mountEditor(V5);

    expect(Config.CURRENT_CONFIG_VERSION).toBe(6);
    expect(reportsOf(editor)).toEqual([{ ...V5, config_version: 6 }]);
    expect(text(receipt(editor)!.querySelector('.status-text'))).toBe('Event details changed.');
    expect(lines(editor)).toHaveLength(2);
    // The stamp alone is no change of the user's to undo.
    expect(receipt(editor)!.querySelector('[data-focus="status-undo"]')).toBeNull();
  });

  it('makes a calendar private on the stamped card, and Undo keeps the stamp', async () => {
    const editor = await mountEditor(V5);
    receipt(editor)!.querySelector<HTMLButtonElement>('[data-upgrade-private] button')!.click();
    await editor.updateComplete;
    expect(lastConfig(editor)).toMatchObject({ config_version: 6, event_font_size: '18px' });
    expect((lastConfig(editor)!.entities as Record<string, unknown>[])[0].private).toBe(true);

    receipt(editor)!.querySelector<HTMLButtonElement>('[data-focus="status-undo"]')!.click();
    await editor.updateComplete;
    expect(lastConfig(editor)).toEqual({ ...V5, config_version: 6 });
  });

  it('opens quietly where no calendar hides a field, and the first change stamps it', async () => {
    const quiet = { ...V5, entities: ['calendar.anna'] };
    const editor = await mountEditor(quiet);
    expect(receipt(editor)).toBeNull();
    expect(reportsOf(editor)).toEqual([]);

    await changeField(editor, 'card:title', 'Family');
    expect(lastConfig(editor)).toEqual({ ...quiet, config_version: 6, title: 'Family' });
  });
});
