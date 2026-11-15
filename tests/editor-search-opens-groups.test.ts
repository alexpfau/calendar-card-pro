/**
 * A search opens what it finds (backlog item 314).
 *
 * The docs promise that a search "expands what survives, so a match is never hidden behind a
 * collapsed heading". The panels always opened; the collapsible groups inside them did not,
 * because nothing set the `expanded` flag Home Assistant's expandable reads, so "color" left
 * five of its hits behind closed Weekend Colors, Time and Location headings.
 *
 * Read from the schema the forms are handed rather than from rendered panels: happy-dom does
 * not render Home Assistant's `ha-form-expandable`, and the flag on the schema is exactly what
 * that element binds (`.expanded=${Boolean(this.schema.expanded)}`).
 */
import { afterEach, describe, expect, it } from 'vitest';

import { changeField, formOf, mountEditor, openPageOf, valueOf } from './helpers/editor-host';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import type { CalendarCardProEditor } from '../src/rendering/editor/element';
import {
  type FilterCriteria,
  type FilterCtx,
  NO_FILTER,
  filterSchema,
  openMatches,
  withholdInertFields,
} from '../src/rendering/editor/filter';
import { type HaFormSchema, isGroupSchema } from '../src/rendering/editor/ha-form';
import { PANELS, type SchemaCtx } from '../src/rendering/editor/panels';
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

/** The collapsible groups of a schema, by name, with whether each is open. */
function groups(schema: ReadonlyArray<HaFormSchema>): Record<string, boolean> {
  const found: Record<string, boolean> = {};
  for (const node of schema) {
    if (!isGroupSchema(node)) continue;
    if (node.type === 'expandable') found[node.name] = node.expanded === true;
    Object.assign(found, groups(node.schema));
  }
  return found;
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

function dayHeader(ctx: FilterCtx): ReadonlyArray<HaFormSchema> {
  const panel = PANELS.find((candidate) => candidate.id === 'day_header')!;
  return withholdInertFields(panel.build(ctx), ctx.workspace!);
}

describe.each(WORKSPACES)('a search in the %s workspace', (workspace) => {
  it.each(['color', 'font', 'opacity', 'weekend'])('leaves no hit for "%s" closed', (query) => {
    const shown = filtered(ctxFor(workspace, { query }));

    // The denominator: hits inside collapsibles exist, so "none is closed" can fail.
    expect(shown.filter((leaf) => leaf.depth > 0).length).toBeGreaterThan(0);
    expect(shown.filter((leaf) => !leaf.open).map((leaf) => leaf.name)).toEqual([]);
  });
});

describe('opening what a search finds', () => {
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

  it('opens a group let through whole by its own heading', () => {
    const ctx = ctxFor('list', { query: 'weekend colors' });
    const schema = filterSchema(dayHeader(ctx), ctx);

    expect(groups(schema)).toEqual({ weekend_colors: true });
    expect(leaves(schema).every((leaf) => leaf.open)).toBe(true);
  });

  it('opens only the groups of a whole panel that hold a match', () => {
    const ctx = ctxFor('list', { query: 'opacity' });
    const before = groups(dayHeader(ctx));
    expect(Object.values(before)).not.toContain(true);

    const opened = groups(openMatches(dayHeader(ctx), ctx));
    expect(opened.past_days).toBe(true);
    expect(opened.weekend_colors).toBe(false);
  });

  it('leaves a whole panel as declared when nothing was typed', () => {
    const ctx = ctxFor('list', {});
    expect(openMatches(dayHeader(ctx), ctx)).toEqual(dayHeader(ctx));
  });
});

async function mount() {
  return mountEditor({
    config_version: Config.CURRENT_CONFIG_VERSION,
    entities: ['calendar.anna'],
  });
}

async function search(editor: CalendarCardProEditor, query: string) {
  await changeField(editor, 'filter:search', query);
}

/**
 * The Day Header settings a query keeps, as the editor's own filter keeps them in the scope the
 * editor shows: the fields the query must find drawn.
 */
function dayHeaderHits(editor: CalendarCardProEditor, query: string): string[] {
  const workspace = valueOf(editor, 'workspace:editing_workspace') as EditorWorkspace;
  const ctx = ctxFor(workspace, { query });
  return leaves(filterSchema(dayHeader(ctx), ctx)).map((leaf) => `day_header:${leaf.name}`);
}

/**
 * Each field drawn, where it is drawn, and whether a closed collapsible hides any of it.
 *
 * Pages draw their headings as headings, which never close, and each field in a form of its own;
 * a field still behind a closed expandable would show up here as not open.
 */
function drawn(editor: CalendarCardProEditor, ids: ReadonlyArray<string>) {
  return Object.fromEntries(
    ids.map((id) => {
      const form = formOf(editor, id);
      return [
        id,
        form === undefined
          ? 'not drawn'
          : {
              results: form.closest('.overview') !== null,
              open: leaves(form.schema).every((leaf) => leaf.open),
            },
      ];
    }),
  );
}

describe('the mounted editor', () => {
  afterEach(() => document.body.replaceChildren());

  it('draws every setting of a section its own title let through, none closed', async () => {
    const editor = await mount();
    // "day" names Day Header itself, so the whole section comes through, its two groups
    // (Weekend Colors, Past Days) with it.
    const hits = dayHeaderHits(editor, 'day');
    expect(hits).toEqual(
      expect.arrayContaining(['day_header:past_date_opacity', 'day_header:weekend_day_color']),
    );

    await search(editor, 'day');
    expect(drawn(editor, hits)).toEqual(
      Object.fromEntries(hits.map((id) => [id, { results: true, open: true }])),
    );
  });

  it('draws them on their page, none closed, once the search is cleared', async () => {
    const editor = await mount();
    await search(editor, 'opacity');
    expect(drawn(editor, ['day_header:past_date_opacity'])).toEqual({
      'day_header:past_date_opacity': { results: true, open: true },
    });

    await search(editor, '');
    // Cleared, the results go; the page draws every setting under its headings.
    expect(drawn(editor, ['day_header:past_date_opacity'])).toEqual({
      'day_header:past_date_opacity': 'not drawn',
    });
    await openPageOf(editor, 'day_header:past_date_opacity');
    const all = dayHeaderHits(editor, '');
    expect(drawn(editor, all)).toEqual(
      Object.fromEntries(all.map((id) => [id, { results: false, open: true }])),
    );
  });
});
