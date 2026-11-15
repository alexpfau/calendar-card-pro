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

import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import { CalendarCardProEditor } from '../src/rendering/editor/element';
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

customElements.define('editor-search-opens-groups-test', CalendarCardProEditor);

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

interface Form extends HTMLElement {
  schema: ReadonlyArray<HaFormSchema>;
  data: Record<string, unknown>;
}

async function mount() {
  const editor = document.createElement('editor-search-opens-groups-test') as CalendarCardProEditor;
  editor.hass = { states: {}, locale: { language: 'en' } } as unknown as Types.Hass;
  editor.setConfig({
    config_version: Config.CURRENT_CONFIG_VERSION,
    entities: ['calendar.anna'],
  } as Types.Config);
  document.body.appendChild(editor);
  await editor.updateComplete;
  return editor;
}

async function search(editor: CalendarCardProEditor, query: string) {
  const form = editor.shadowRoot!.querySelector<Form>('.filter-form')!;
  form.dispatchEvent(
    new CustomEvent('value-changed', {
      detail: { value: { ...form.data, search: query } },
      bubbles: true,
      composed: true,
    }),
  );
  await editor.updateComplete;
}

function dayHeaderForm(editor: CalendarCardProEditor): Form | undefined {
  return [...editor.shadowRoot!.querySelectorAll<Form>('ha-form.panel-form')].find((form) =>
    leaves(form.schema).some((leaf) => leaf.name === 'past_date_opacity'),
  );
}

describe('the mounted editor', () => {
  afterEach(() => document.body.replaceChildren());

  it('opens the groups holding a match in a panel its own title let through', async () => {
    const editor = await mount();
    expect(groups(dayHeaderForm(editor)!.schema)).toEqual({
      weekend_colors: false,
      past_days: false,
    });

    // "day" names the Day Header panel itself, so the whole panel comes through.
    await search(editor, 'day');
    expect(groups(dayHeaderForm(editor)!.schema)).toEqual({
      weekend_colors: true,
      past_days: true,
    });
  });

  it('closes them again when the search is cleared', async () => {
    const editor = await mount();
    await search(editor, 'opacity');
    expect(groups(dayHeaderForm(editor)!.schema)).toEqual({ past_days: true });

    await search(editor, '');
    expect(groups(dayHeaderForm(editor)!.schema)).toEqual({
      weekend_colors: false,
      past_days: false,
    });
  });
});
