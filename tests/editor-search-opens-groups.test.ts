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
 * The fields a group held are found here independently of the search: every field inside a
 * collapsible whose own label or key holds the query. Customized Only still opens what it keeps,
 * until the switches retire.
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
 * The fields a collapsible group holds for a query, by id: each inside one whose own label or key
 * holds the query, read off the built schema rather than through the search.
 *
 * @param workspace - The scope
 * @param query - The query
 * @param panels - The panels to read, every one when omitted
 * @returns The ids
 */
function heldByGroups(
  workspace: EditorWorkspace,
  query: string,
  panels: ReadonlyArray<string> = PANELS.map((panel) => panel.id),
): string[] {
  const ctx = ctxFor(workspace, {});
  const wanted = query.toLowerCase();
  return PANELS.filter((panel) => panels.includes(panel.id)).flatMap((panel) =>
    [...walkSchema(withholdInertFields(panel.build(ctx), workspace))].flatMap(
      ({ node, path, dataPath }) => {
        if (!('selector' in node) || path.length === 0) return [];
        const words = [node.name, computeLabel('en', node, path)].join(' ').toLowerCase();
        return words.includes(wanted) ? [fieldId(panel.id, dataPath, node.name)] : [];
      },
    ),
  );
}

/** Every field a collapsible group of Day Header holds, by group name. */
function dayHeaderGroup(name: string): string[] {
  const ctx = ctxFor('list', {});
  const panel = PANELS.find((candidate) => candidate.id === 'day_header')!;
  const group = [...walkSchema(withholdInertFields(panel.build(ctx), 'list'))].find(
    ({ node }) => isGroupSchema(node) && node.name === name,
  )!;
  return [...walkSchema([group.node], group.path, group.dataPath)].flatMap(({ node, dataPath }) =>
    'selector' in node ? [fieldId('day_header', dataPath, node.name)] : [],
  );
}

function index(workspace: EditorWorkspace) {
  return searchIndex({ ...Config.DEFAULT_CONFIG, entities: ['calendar.anna'] } as Types.Config, {
    workspace,
  });
}

describe.each(WORKSPACES)('a search in the %s workspace', (workspace) => {
  it.each(['color', 'font', 'opacity', 'weekend'])(
    'lists every field a group once opened for "%s"',
    (query) => {
      const held = heldByGroups(workspace, query);
      // The denominator: hits inside collapsibles exist, so "every one is listed" can fail.
      expect(held.length).toBeGreaterThan(0);
      const listed = hitIds(index(workspace), query);
      expect(held.filter((id) => !listed.includes(id))).toEqual([]);
    },
  );
});

describe('what a group once opened', () => {
  it('opens the groups Customized Only keeps, as it opens their panels', () => {
    const shown = filtered(
      ctxFor('shared', { customizedOnly: true }, {
        time_color: '#ff0000',
      } as Partial<Types.Config>),
    );

    expect(shown.find((leaf) => leaf.name === 'time_color')).toEqual({
      name: 'time_color',
      open: true,
      depth: 1,
    });
  });

  it('is listed whole for a query naming the group itself', () => {
    const group = dayHeaderGroup('weekend_colors');
    expect(group.length).toBeGreaterThan(1);
    expect(group.filter((id) => !hitIds(index('list'), 'weekend colors').includes(id))).toEqual([]);
  });

  it('lists only the groups that hold a match', () => {
    const listed = hitIds(index('list'), 'opacity');
    expect(listed).toContain('day_header:past_date_opacity');
    expect(listed.filter((id) => dayHeaderGroup('weekend_colors').includes(id))).toEqual([]);
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
