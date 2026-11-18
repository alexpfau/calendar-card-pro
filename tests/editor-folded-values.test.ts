/**
 * Every folded setting row names the value that applies (backlog item 307). A setting folds only
 * at its default, and a default left unset, because the setting follows another one or because
 * nothing is the answer, drew an empty value column: "Today's Weekday Color" said nothing where
 * "Weekday Color" beside it said "Primary Text". `unset.ts` holds the one rule.
 *
 * Walks every page in every scope and every calendar entry's page, on a card that stores nothing
 * but its calendars, so every row is at its default and folded.
 */
import { describe, expect, it } from 'vitest';

import {
  changeField,
  fakeHass,
  goEntry,
  goOverview,
  goPage,
  keysOf,
  mountEditor,
} from './helpers/editor-host';
import { FOLLOWS, unsetWord } from '../src/rendering/editor/unset';
import { WORKSPACES } from '../src/rendering/editor/workspace';

/** A Home Assistant that names its own actions, as the real one does: "Nothing" for `none`. */
const HASS = fakeHass({
  localize: (key: string) =>
    key.startsWith('ui.panel.lovelace.editor.action-editor.actions.')
      ? key.slice(key.lastIndexOf('.') + 1)
      : key,
});

/**
 * The folded rows on the open page whose value column is empty.
 *
 * @param root - The editor's shadow root
 * @param where - The page and scope, for the report
 * @returns The rows, as "where id"
 */
function emptyRows(root: ShadowRoot, where: string): string[] {
  return [...root.querySelectorAll('.setting-head.folds')]
    .filter((head) => !head.querySelector('.setting-value')?.textContent?.trim())
    .map((head) => `${where} ${head.parentElement?.getAttribute('data-setting')}`);
}

describe('folded rows', () => {
  it('name the value that applies on every page, in every scope, and on every entry', async () => {
    const editor = await mountEditor(
      {
        type: 'custom:calendar-card-pro',
        config_version: 5,
        entities: ['calendar.anna', 'calendar.ben', 'calendar.anna'],
      },
      { hass: HASS },
    );
    const root = editor.shadowRoot!;
    const empty: string[] = [];
    let folded = 0;
    for (const scope of WORKSPACES) {
      await changeField(editor, 'workspace:editing_workspace', scope);
      await goOverview(editor);
      const pages = [...root.querySelectorAll('[data-focus^="nav:"]')].map((row) =>
        row.getAttribute('data-focus')!.slice('nav:'.length),
      );
      for (const page of pages) {
        await goPage(editor, page);
        folded += root.querySelectorAll('.setting-head.folds').length;
        empty.push(...emptyRows(root, `${scope}/${page}`));
      }
    }
    for (const key of keysOf(editor, 'entry')) {
      await goEntry(editor, key);
      folded += root.querySelectorAll('.setting-head.folds').length;
      empty.push(...emptyRows(root, `entry ${key}`));
    }
    // The walk saw rows to judge: an empty list from no rows proves nothing.
    expect(folded).toBeGreaterThan(200);
    expect(empty).toEqual([]);
  });

  it('say which setting one follows, and what today’s digits take on the tile', () => {
    const t = (key: string, values?: Readonly<Record<string, string>>): string =>
      `${key}${values ? JSON.stringify(values) : ''}`;
    const label = (name: string): string => `<${name}>`;
    expect(unsetWord('day_header:today_weekday_color', t, label)).toBe(
      'value.same_as{"label":"<weekday_color>"}',
    );
    expect(unsetWord('day_header:today_day_color', t, label, true)).toBe('value.tile_ink');
    expect(unsetWord('day_header:today_day_color', t, label, false)).toBe(
      'value.same_as{"label":"<day_color>"}',
    );
    // A calendar with no Location Icon of its own draws the map marker, as its helper says. The
    // walk above reaches it once the card's last scope shows locations, which Month does and
    // Grid did not.
    expect(unsetWord('calendar:location_icon', t, label)).toBe('value.map_marker');
    expect(Object.keys(FOLLOWS).sort()).toEqual([
      'today_day_color',
      'today_month_color',
      'today_weekday_color',
      'weekend_day_color',
      'weekend_month_color',
      'weekend_weekday_color',
    ]);
  });
});
