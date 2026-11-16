/**
 * Searching the editor for a calendar by the name Home Assistant gives it.
 *
 * A calendar's panel is headed with Home Assistant's name for it, and the calendar picker lists
 * that name too. The search matched a calendar by its entity id, its label and its configured
 * `name`, never that one, so typing the name on screen hid the very panel headed with it; and the
 * picker matched only its own label. Now each of a calendar's fields is a row of the jump list,
 * found by the calendar's names, and the picker's row is found by the name of any calendar it
 * lists.
 *
 * Falsifiers: drop Home Assistant's name from `search.ts` › `calendarTexts` and the calendar cases
 * fail; drop the calendars' names from the picker's row (`cardRows`) and the picker cases fail;
 * drop `hass` from the index the element builds and the rendered editor loses the calendar.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import { fakeHass, mountEditor, resultRows, searchFor } from './helpers/editor-host';
import { hitIds, searchIndex } from './helpers/search-index';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';

const FAMILY = 'calendar.f123';
const SCHOOL = 'calendar.s456';

const STATES = {
  [FAMILY]: { entity_id: FAMILY, state: 'off', attributes: { friendly_name: 'Family Events' } },
  [SCHOOL]: { entity_id: SCHOOL, state: 'off', attributes: { friendly_name: 'School Run' } },
};

const HASS = fakeHass({ states: STATES });

const ENTITIES = [FAMILY, { entity: SCHOOL, name: 'Ben at school' }];

function hits(query: string, hass: Types.Hass | undefined = HASS): string[] {
  return hitIds(searchIndex(buildConfig({ entities: ENTITIES }), { hass }), query);
}

/** Whether a calendar's fields are all found, by its place in the list. */
function calendarKept(at: number, query: string, hass?: Types.Hass): boolean {
  const config = buildConfig({ entities: ENTITIES });
  const all = searchIndex(config, { hass: HASS }).filter(
    ({ target }) => target.kind === 'entry-field' && target.key === at,
  );
  const found = hits(query, hass);
  return all.length > 0 && all.every(({ target }) => found.includes(`${target.id}@${at}`));
}

/** Whether the calendar picker's row is found. */
function pickerKept(query: string): boolean {
  return hits(query).includes('calendars:calendars');
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('a calendar', () => {
  it("is found by Home Assistant's name for it, as its heading shows", () => {
    expect({ family: calendarKept(0, 'family'), school: calendarKept(1, 'family') }).toEqual({
      family: true,
      school: false,
    });
  });

  it("is found by Home Assistant's name though the card names it otherwise", () => {
    expect({
      family: calendarKept(0, 'school run'),
      school: calendarKept(1, 'school run'),
    }).toEqual({ family: false, school: true });
  });

  it('is still found by its entity id and its configured name without Home Assistant', () => {
    expect({
      id: calendarKept(0, 'f123', undefined),
      name: calendarKept(1, 'ben at', undefined),
    }).toEqual({ id: true, name: true });
  });
});

describe('the calendar picker', () => {
  it('is found by a search naming one of the calendars it lists', () => {
    expect({
      haName: pickerKept('family events'),
      configured: pickerKept('ben at school'),
      id: pickerKept('s456'),
    }).toEqual({ haName: true, configured: true, id: true });
  });

  it('is not found by a search naming no calendar and not the picker', () => {
    // The denominator: without it the cases above could pass on a picker that is always found.
    expect(pickerKept('blocklist')).toBe(false);
  });

  it('is found by its own label, as before', () => {
    expect(pickerKept('calendars')).toBe(true);
  });
});

describe('the editor as rendered', () => {
  it("lists a calendar's fields and the picker when searching Home Assistant's name", async () => {
    const editor = await mountEditor(
      { config_version: Config.CURRENT_CONFIG_VERSION, entities: ENTITIES },
      { hass: HASS },
    );

    await searchFor(editor, 'family');
    const rows = resultRows(editor);
    const calendars = new Set(
      rows.flatMap(({ crumbs, ownerKey }) =>
        ownerKey === undefined ? [] : [crumbs.split(' › ')[0]],
      ),
    );

    expect({
      calendars: [...calendars],
      picker: rows.some((row) => row.id === 'calendars:calendars'),
    }).toEqual({
      calendars: ['Family Events'],
      picker: true,
    });
  });
});
