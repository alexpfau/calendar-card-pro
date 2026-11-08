/**
 * Searching the editor for a calendar by the name Home Assistant gives it.
 *
 * A calendar's panel is headed with Home Assistant's name for it, and the calendar picker
 * above the panels lists that name too. The search matched a calendar by its entity id, its
 * label and its configured `name`, never that one, so typing the name on screen hid the very
 * panel headed with it. The picker matched only its own label, so no calendar search kept it
 * at all, though it is where the calendars are listed.
 *
 * Falsifiers: drop Home Assistant's name from `matchesEntity` and the panel cases fail; drop
 * `namesACalendar` from `filterSchema` and the picker cases fail; drop `hass` from the editor's
 * `_filterCtx` and the rendered editor loses the panel.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import { CalendarCardProEditor } from '../src/rendering/editor/element';
import {
  type FilterCtx,
  NO_FILTER,
  filterEntitySchema,
  filterSchema,
  hasFields,
} from '../src/rendering/editor/filter';
import { buildCalendarsSchema } from '../src/rendering/editor/schemas/calendars';
import { buildEntitySchema } from '../src/rendering/editor/schemas/entity';

customElements.define('editor-search-ha-name-probe', CalendarCardProEditor);

const FAMILY = 'calendar.f123';
const SCHOOL = 'calendar.s456';

const STATES = {
  [FAMILY]: { entity_id: FAMILY, state: 'off', attributes: { friendly_name: 'Family Events' } },
  [SCHOOL]: { entity_id: SCHOOL, state: 'off', attributes: { friendly_name: 'School Run' } },
};

const HASS = { states: STATES, locale: { language: 'en' } } as unknown as Types.Hass;

const ENTITIES = [FAMILY, { entity: SCHOOL, name: 'Ben at school' }];

function ctxFor(query: string, hass: Types.Hass | undefined = HASS): FilterCtx {
  const config = buildConfig({ entities: ENTITIES });
  return { language: 'en', view: 'list', config, hass, criteria: { ...NO_FILTER, query } };
}

/** Whether a calendar's panel survives a search, with all of its fields. */
function panelKept(entry: string | Types.EntityConfig, ctx: FilterCtx): boolean {
  const schema = buildEntitySchema(ctx);
  return filterEntitySchema(schema, entry, ['entity'], ctx).length > 0;
}

/** Whether the calendar picker survives a search. */
function pickerKept(ctx: FilterCtx): boolean {
  return hasFields(filterSchema(buildCalendarsSchema(ctx), ctx));
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('a calendar panel', () => {
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

describe('the calendar picker', () => {
  it('stays for a search naming one of the calendars it lists', () => {
    expect({
      haName: pickerKept(ctxFor('family events')),
      configured: pickerKept(ctxFor('ben at school')),
      id: pickerKept(ctxFor('s456')),
    }).toEqual({ haName: true, configured: true, id: true });
  });

  it('goes for a search naming no calendar and not the picker', () => {
    // The denominator: without it the cases above could pass on a picker that never goes.
    expect(pickerKept(ctxFor('blocklist'))).toBe(false);
  });

  it('stays for its own label, as before', () => {
    expect(pickerKept(ctxFor('calendars'))).toBe(true);
  });
});

describe('the editor as rendered', () => {
  it("keeps a calendar's panel and the picker when searching Home Assistant's name", async () => {
    const editor = document.createElement('editor-search-ha-name-probe') as HTMLElement & {
      hass: unknown;
      setConfig(config: Record<string, unknown>): void;
      readonly updateComplete: Promise<unknown>;
    };
    editor.hass = HASS;
    document.body.appendChild(editor);
    editor.setConfig({ config_version: Config.CURRENT_CONFIG_VERSION, entities: ENTITIES });
    await editor.updateComplete;

    (editor as unknown as { _filter: unknown })._filter = { ...NO_FILTER, query: 'family' };
    await editor.updateComplete;

    const root = editor.shadowRoot!;
    const headers = [
      ...root.querySelectorAll<HTMLElement & { header: string }>('ha-expansion-panel.entity-panel'),
    ].map((panel) => panel.header);
    const picker = [
      ...root.querySelectorAll<HTMLElement & { schema: { name: string }[] }>('ha-form'),
    ]
      .flatMap((form) => form.schema ?? [])
      .some((node) => node.name === 'calendars');

    expect({ headers, picker }).toEqual({ headers: ['Family Events'], picker: true });
  });
});
