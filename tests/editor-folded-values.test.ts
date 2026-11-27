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
  editLayout,
  fakeHass,
  goEntry,
  goOverview,
  goPage,
  keysOf,
  mountEditor,
} from './helpers/editor-host';
import { topicsFor } from '../src/rendering/editor/pages';
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

describe('a folded value', () => {
  /**
   * The value column of a folded row on the open page.
   *
   * @param root - The editor's shadow root
   * @param id - Field id
   * @returns The words, or undefined where the row draws none
   */
  const folded = (root: ShadowRoot, id: string): string | undefined =>
    root
      .querySelector(`[data-setting="${id}"] > .setting-head.folds .setting-value`)
      ?.textContent?.trim();

  it('carries the unit its control shows, and names a transparent color as none', async () => {
    const editor = await mountEditor(
      { type: 'custom:calendar-card-pro', config_version: 5, entities: ['calendar.anna'] },
      { hass: HASS },
    );
    const root = editor.shadowRoot!;
    await goPage(editor, 'taps_refresh');
    expect(folded(root, 'actions:refresh_interval')).toBe('30 min');
    await goPage(editor, 'which_events');
    expect(folded(root, 'events:past_event_opacity')).toBe('60%');
    await editLayout(editor, 'grid');
    await goPage(editor, 'size_spacing');
    expect(folded(root, 'layout:time_grid.min_day_width')).toBe('100px');
    await editLayout(editor, 'month');
    await goPage(editor, 'day_header');
    expect(folded(root, 'layout:month.today_background_color')).toBe('None');
  });
});

describe('folded rows', () => {
  it('name the value that applies on every page, in every scope, and on every entry', async () => {
    const editor = await mountEditor(
      {
        type: 'custom:calendar-card-pro',
        config_version: 5,
        entities: ['calendar.anna', 'calendar.ben', 'calendar.anna'],
        // On, so what a countdown does is drawn, on the card's pages and each calendar's.
        show_countdown: true,
      },
      { hass: HASS },
    );
    const root = editor.shadowRoot!;
    const empty: string[] = [];
    let folded = 0;
    for (const scope of WORKSPACES) {
      await editLayout(editor, scope);
      await goOverview(editor);
      // Whole Card's pages, and the topics the scope has (Layout Defaults has no Weather).
      const pages = [
        ...[...root.querySelectorAll('[data-focus^="nav:"]')].map((row) =>
          row.getAttribute('data-focus')!.slice('nav:'.length),
        ),
        ...topicsFor(scope).map((page) => page.id),
      ];
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
    expect(unsetWord('separators:month_separator_label_color', t, label)).toBe(
      'value.same_as{"label":"<month_separator_color>"}',
    );
    // The week-number pill is today's tile until it has colors of its own, and the week
    // separator is the pill's background (backlog item 325).
    expect(unsetWord('day_header:week_number_background_color', t, label, true)).toBe(
      'value.tile_ink',
    );
    expect(unsetWord('day_header:week_number_background_color', t, label, false)).toBe(
      'value.depends_on{"label":"<today_indicator_color>"}',
    );
    for (const tile of [true, false]) {
      expect(unsetWord('day_header:week_number_color', t, label, tile)).toBe(
        'value.depends_on{"label":"<week_number_background_color>"}',
      );
    }
    expect(unsetWord('separators:week_separator_color', t, label)).toBe(
      'value.same_as{"label":"<week_number_background_color>"}',
    );
    // By value, so a setting that comes to follow the wrong one fails as surely as a lost one.
    expect(FOLLOWS).toEqual({
      weekend_weekday_color: 'weekday_color',
      weekend_day_color: 'day_color',
      weekend_month_color: 'month_color',
      today_weekday_color: 'weekday_color',
      today_day_color: 'day_color',
      today_month_color: 'month_color',
      month_separator_label_color: 'month_separator_color',
      week_separator_color: 'week_number_background_color',
    });
  });
});
