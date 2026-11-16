/**
 * Searching the editor for a calendar by the name Home Assistant gives it.
 *
 * Home Assistant's name is how a calendar is known everywhere outside this card: its own
 * calendar pickers list it, including the Calendar picker on each entry's page, and it heads
 * the calendar's row and page wherever the card gives it no name of its own. The search
 * matched a calendar by its entity id, its label and its configured `name`, never that one,
 * so typing the name on screen hid the very calendar headed with it.
 *
 * While the editor searches, the overview's calendar list shows only the rows whose entry
 * page keeps a field, so a calendar named by the query has to keep both: its row in the list
 * and its fields on its page.
 *
 * Falsifiers: drop Home Assistant's name from `matchesEntity` and the page cases fail, and
 * the rendered editor loses Family's row; drop `hass` from the editor's `_filterCtx` and the
 * rendered editor loses it too.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import { entry, fakeHass, formsOf, keysOf, mountEditor, openPanels } from './helpers/editor-host';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import { type FilterCtx, NO_FILTER, filterEntitySchema } from '../src/rendering/editor/filter';
import { buildEntitySchema } from '../src/rendering/editor/schemas/entity';

const FAMILY = 'calendar.f123';
const SCHOOL = 'calendar.s456';

const STATES = {
  [FAMILY]: { entity_id: FAMILY, state: 'off', attributes: { friendly_name: 'Family Events' } },
  [SCHOOL]: { entity_id: SCHOOL, state: 'off', attributes: { friendly_name: 'School Run' } },
};

const HASS = fakeHass({ states: STATES });

const ENTITIES = [FAMILY, { entity: SCHOOL, name: 'Ben at school' }];

function ctxFor(query: string, hass: Types.Hass | undefined = HASS): FilterCtx {
  const config = buildConfig({ entities: ENTITIES });
  return { language: 'en', view: 'list', config, hass, criteria: { ...NO_FILTER, query } };
}

/** Whether a calendar entry's page survives a search, with all of its fields. */
function panelKept(entry: string | Types.EntityConfig, ctx: FilterCtx): boolean {
  const schema = buildEntitySchema(ctx);
  return filterEntitySchema(schema, entry, ['entity'], ctx).length > 0;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("a calendar entry's page", () => {
  it("is found by Home Assistant's name for it, as its heading shows", () => {
    const ctx = ctxFor('family');

    expect({ family: panelKept(ENTITIES[0], ctx), school: panelKept(ENTITIES[1], ctx) }).toEqual({
      family: true,
      school: false,
    });
  });

  it("is found by Home Assistant's name though the card names it otherwise", () => {
    const ctx = ctxFor('school run');

    expect({ family: panelKept(ENTITIES[0], ctx), school: panelKept(ENTITIES[1], ctx) }).toEqual({
      family: false,
      school: true,
    });
  });

  it('is still found by its entity id and its configured name without Home Assistant', () => {
    expect({
      id: panelKept(ENTITIES[0], ctxFor('f123', undefined)),
      name: panelKept(ENTITIES[1], ctxFor('ben at', undefined)),
    }).toEqual({ id: true, name: true });
  });
});

describe('the editor as rendered', () => {
  /**
   * Searches the rendered editor, as the toolbar's search bar does.
   *
   * @param query - The search text
   * @returns The titles of the rows the calendar list keeps, and per entry whether its page
   *   draws any field
   */
  async function search(query: string) {
    const editor = await mountEditor(
      { config_version: Config.CURRENT_CONFIG_VERSION, entities: ENTITIES },
      { hass: HASS },
    );

    (editor as unknown as { _filter: unknown })._filter = { ...NO_FILTER, query };
    await editor.updateComplete;

    const rows = [...editor.shadowRoot!.querySelectorAll('.cal-row .cal-title')].map((title) =>
      title.textContent?.trim(),
    );
    // Visit every entry page the list still offers a row for, keeping the forms each draws.
    await openPanels(editor);
    const pages = keysOf(editor, 'entry').map(
      (_, index) => formsOf(editor, entry(index)).length > 0,
    );
    editor.remove();
    return { rows, pages };
  }

  it("keeps a calendar's row and its page's fields when searching Home Assistant's name", async () => {
    expect(await search('family')).toEqual({ rows: ['Family Events'], pages: [true, false] });
  });

  it("keeps them for Home Assistant's name though the card names the calendar otherwise", async () => {
    expect(await search('school run')).toEqual({ rows: ['Ben at school'], pages: [false, true] });
  });

  it('keeps them for the configured name and the entity id, as before', async () => {
    expect({
      configured: await search('ben at school'),
      id: await search('s456'),
    }).toEqual({
      configured: { rows: ['Ben at school'], pages: [false, true] },
      id: { rows: ['Ben at school'], pages: [false, true] },
    });
  });
});
