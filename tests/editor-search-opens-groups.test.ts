/**
 * A search leaves no match behind a closed heading (backlog item 314), now by listing it.
 *
 * The docs promised that a search "expands what survives, so a match is never hidden behind a
 * collapsed heading", and #834 made it true by opening every collapsible group a search kept:
 * "color" had left five of its hits behind closed Weekend Colors, Time and Location headings. The
 * jump list keeps the promise by construction, since each field is a row of its own. So the
 * queries that once opened groups now list every field those groups held for them, and a page
 * opened from a row draws its field under a heading, which never closes.
 *
 * The groups have since become headings on pages (the builders emit no collapsible at all), so a
 * heading's title, or a family's helper line, lists every field under it, as a group's title let
 * all of the group through. The fields a query names are found here independently of the search:
 * every field whose own label or key holds it.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { chooseResult, formOf, mountEditor, resultRows, searchFor } from './helpers/editor-host';
import { hitIds, searchIndex } from './helpers/search-index';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import { fieldId } from '../src/rendering/editor/field-index';
import {
  type FilterCriteria,
  type FilterCtx,
  NO_FILTER,
  filterSchema,
  withholdInertFields,
} from '../src/rendering/editor/filter';
import { type HaFormSchema, isGroupSchema } from '../src/rendering/editor/ha-form';
import { computeLabel } from '../src/rendering/editor/localize';
import { PANELS, type SchemaCtx, walkSchema } from '../src/rendering/editor/panels';
import { type EditorWorkspace, WORKSPACES } from '../src/rendering/editor/workspace';

interface Leaf {
  name: string;
  /** Whether every collapsible around it is open. */
  open: boolean;
  /** How many collapsibles are around it. */
  depth: number;
}

/** Every setting in a schema, with whether a closed collapsible hides it. */
function leaves(schema: ReadonlyArray<HaFormSchema>, open = true, depth = 0): Leaf[] {
  return schema.flatMap((node): Leaf[] => {
    if (isGroupSchema(node)) {
      const expandable = node.type === 'expandable';
      return leaves(
        node.schema,
        open && (!expandable || node.expanded === true),
        depth + (expandable ? 1 : 0),
      );
    }
    return 'selector' in node ? [{ name: node.name, open, depth }] : [];
  });
}

function ctxFor(
  workspace: EditorWorkspace,
  criteria: Partial<FilterCriteria>,
  raw: Partial<Types.Config> = {},
): FilterCtx {
  const config = { ...Config.DEFAULT_CONFIG, entities: ['calendar.anna'], ...raw } as Types.Config;
  const ctx: SchemaCtx = {
    view: workspace === 'shared' ? 'list' : workspace,
    workspace,
    config,
    rawConfig: config,
    language: 'en',
  };
  return { ...ctx, criteria: { ...NO_FILTER, ...criteria } };
}

/** What every card panel shows, filtered as the editor filters it. */
function filtered(ctx: FilterCtx): Leaf[] {
  return PANELS.flatMap((panel) =>
    leaves(filterSchema(withholdInertFields(panel.build(ctx), ctx.workspace!), ctx)),
  );
}

/**
 * The fields a query names by their own words, by id: each whose label or key holds it, read off
 * the built schema rather than through the search.
 *
 * @param workspace - The scope
 * @param query - The query
 * @returns The ids
 */
function namedBy(workspace: EditorWorkspace, query: string): string[] {
  const ctx = ctxFor(workspace, {});
  const wanted = query.toLowerCase();
  return PANELS.flatMap((panel) =>
    [...walkSchema(withholdInertFields(panel.build(ctx), workspace))].flatMap(
      ({ node, path, dataPath }) => {
        if (!('selector' in node)) return [];
        const words = [node.name, computeLabel('en', node, path)].join(' ').toLowerCase();
        return words.includes(wanted) ? [fieldId(panel.id, dataPath, node.name)] : [];
      },
    ),
  );
}

function index(workspace: EditorWorkspace) {
  return searchIndex({ ...Config.DEFAULT_CONFIG, entities: ['calendar.anna'] } as Types.Config, {
    workspace,
  });
}

const WEEKEND = [
  'day_header:weekend_weekday_color',
  'day_header:weekend_day_color',
  'day_header:weekend_month_color',
];

describe.each(WORKSPACES)('a search in the %s workspace', (workspace) => {
  it.each(['color', 'font', 'opacity', 'weekend'])(
    'lists every field "%s" names, none behind a collapsible',
    (query) => {
      const named = namedBy(workspace, query);
      // The denominator: the query names something, so "every one is listed" can fail.
      expect(named.length).toBeGreaterThan(0);
      const listed = hitIds(index(workspace), query);
      expect(named.filter((id) => !listed.includes(id))).toEqual([]);
      // The builders emit no collapsible for a field to hide behind.
      expect(filtered(ctxFor(workspace, {})).filter((leaf) => leaf.depth > 0)).toEqual([]);
    },
  );
});

describe('what a group once opened', () => {
  it('leaves what Customized Only keeps in no collapsible', () => {
    const shown = filtered(
      ctxFor('shared', { customizedOnly: true }, {
        time_color: '#ff0000',
      } as Partial<Types.Config>),
    );

    expect(shown.find((leaf) => leaf.name === 'time_color')).toEqual({
      name: 'time_color',
      open: true,
      depth: 0,
    });
  });

  it('is listed whole for a query naming its heading, and none of its fields', () => {
    expect(namedBy('list', 'weekend colors')).toEqual([]);
    expect(WEEKEND.filter((id) => !hitIds(index('list'), 'weekend colors').includes(id))).toEqual(
      [],
    );
  });

  // The family's helper line, as the collapsible's helper was: words from no field under it.
  it.each([
    ['country set in home assistant', 'list', 'day_header:weekend_day_color'],
    ['compact dashboard slot', 'list', 'content:compact_days_to_show'],
    ['when it runs out', 'grid', 'layout:time_grid.min_day_width'],
  ] as const)('lists the fields a family helper names, for "%s"', (query, scope, id) => {
    expect(hitIds(index(scope), query)).toContain(id);
  });

  it('lists only the headings that hold a match', () => {
    const listed = hitIds(index('list'), 'opacity');
    expect(listed).toContain('day_header:past_date_opacity');
    expect(listed.filter((id) => WEEKEND.includes(id))).toEqual([]);
  });

  it('lists nothing when nothing was typed', () => {
    expect(hitIds(index('list'), '   ')).toEqual([]);
  });
});

async function mount() {
  return mountEditor({
    config_version: Config.CURRENT_CONFIG_VERSION,
    entities: ['calendar.anna'],
  });
}

describe('the mounted editor', () => {
  afterEach(() => document.body.replaceChildren());

  it('lists every setting of a section its own title names', async () => {
    const editor = await mount();
    // "day" names Day Header itself, so its whole section is listed, its two groups (Weekend
    // Colors, Past Days) with it.
    const all = [...index('list')]
      .map(({ target }) => target.id)
      .filter((id) => id.startsWith('day_header:'));
    expect(all).toEqual(
      expect.arrayContaining(['day_header:past_date_opacity', 'day_header:weekend_day_color']),
    );

    await searchFor(editor, 'day');
    const listed = resultRows(editor).map((row) => row.id);
    expect(all.filter((id) => !listed.includes(id))).toEqual([]);
  });

  it('opens a row’s field on its page, behind no closed heading', async () => {
    const editor = await mount();
    await searchFor(editor, 'opacity');
    await chooseResult(editor, 'result:day_header:past_date_opacity');

    const form = formOf(editor, 'day_header:past_date_opacity');
    expect(form?.closest('.page')).not.toBeNull();
    expect(leaves(form!.schema).every((leaf) => leaf.open)).toBe(true);
  });
});
