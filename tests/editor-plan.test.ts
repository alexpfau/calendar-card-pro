/**
 * The shown set (backlog item 307): which fields a page draws live, which wait in an Add row,
 * which a gate line names, and what each says about where its value comes from.
 *
 * Built from configurations as the editor holds them, through the same present index and universe
 * the pages read, so every state is the builders' own answer rather than a restatement of it.
 * Each state a field can be in, and the words and Reset outcome of each, is a case here.
 */
import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from '../src/config/config';
import type * as Types from '../src/config/types';
import {
  type FieldId,
  type IndexedField,
  buildFieldIndex,
  entityFieldIndex,
  entrySchemaAcross,
  schemaCtx,
  universeIndex,
} from '../src/rendering/editor/field-index';
import { GATES } from '../src/rendering/editor/gates';
import { type Appearance, ENTRY_GROUPS, PAGES } from '../src/rendering/editor/pages';
import {
  type FieldState,
  type PlanCtx,
  fieldState,
  needsTag,
  planEntry,
  planPage,
  resetAction,
  resetOutcome,
  stateOf,
  storedAt,
} from '../src/rendering/editor/plan';
import { reset } from '../src/rendering/editor/reset';
import { workspaceFormData } from '../src/rendering/editor/routing';
import type { EditorWorkspace } from '../src/rendering/editor/workspace';
import type { WriteState } from '../src/rendering/editor/write-frames';

const APPEARANCE = new Map<FieldId, Appearance>(
  [
    ...PAGES.flatMap((page) => page.headings.flatMap((heading) => heading.fields)),
    ...ENTRY_GROUPS.flatMap((heading) => heading.fields),
  ].reverse(),
);

interface Options {
  readonly added?: ReadonlyArray<string>;
  readonly every?: boolean;
  readonly pending?: Record<string, string>;
}

/**
 * A plan context for a stored configuration, as the editor would hold it.
 *
 * @param raw - The configuration as stored
 * @param workspace - Workspace
 * @param options - Added set, Show Every Setting, held text
 * @returns The context for the card's pages
 */
function cardCtx(
  raw: Record<string, unknown>,
  workspace: EditorWorkspace,
  options: Options = {},
): PlanCtx {
  const config = { ...structuredClone(DEFAULT_CONFIG), ...structuredClone(raw) } as Types.Config;
  if (!Array.isArray(config.entities)) config.entities = [];
  return {
    workspace,
    config,
    raw,
    present: buildFieldIndex(schemaCtx(config, workspace, 'en')),
    universe: universeIndex('en', workspace),
    added: new Set(options.added ?? []),
    showEverySetting: options.every ?? false,
    ...(options.pending ? { pending: options.pending } : {}),
    entryKeys: config.entities.map((_, at) => at + 10),
  };
}

/**
 * The same, for the first entry's page: its own present index, and its key.
 *
 * @param raw - The configuration as stored, with at least one entry
 * @param workspace - Workspace
 * @param options - Added set, Show Every Setting
 * @param at - Which entry
 * @returns The context for that entry's page
 */
function entryCtx(
  raw: Record<string, unknown>,
  workspace: EditorWorkspace,
  options: Options = {},
  at = 0,
): PlanCtx {
  const ctx = cardCtx(raw, workspace, options);
  const entry = ctx.config.entities![at];
  return {
    ...ctx,
    // As the calendar's page builds it: across the card's layouts and the one being edited.
    present: entityFieldIndex(
      entrySchemaAcross(entry, schemaCtx(ctx.config as Types.Config, workspace, 'en')).schema,
    ),
    entry: ctx.entryKeys![at],
  };
}

const stateIn = (ctx: PlanCtx, id: FieldId): FieldState => fieldState(id, APPEARANCE.get(id)!, ctx);

/**
 * A field as the context's indexes hold it.
 *
 * @param ctx - Plan context
 * @param id - Field id
 * @returns The field
 */
function fieldIn(ctx: PlanCtx, id: FieldId): IndexedField {
  const field = ctx.present.fields.get(id) ?? ctx.universe.fields.get(id);
  expect(field, id).toBeDefined();
  return field!;
}

/**
 * The editor's write state for a context, as `element.ts` › `_writeState` builds it.
 *
 * @param ctx - Plan context
 * @returns The state
 */
function writeState(ctx: PlanCtx): WriteState {
  return {
    config: ctx.config as Types.Config,
    pending: ctx.pending ?? {},
    authoredRootKeys: new Set(Object.keys(ctx.raw)),
    gridResetKeys: new Set(),
    entryKeys: ctx.entryKeys!,
    buttonKeys: [],
  };
}

const ANNA = 'calendar.anna';

describe('the shown set: each state', () => {
  it('makes a field live for each reason, essential first', () => {
    expect(stateIn(cardCtx({}, 'shared'), 'events:show_time')).toEqual({
      kind: 'live',
      why: 'essential',
    });
    expect(stateIn(cardCtx({ time_font_size: '20px' }, 'shared'), 'events:time_font_size')).toEqual(
      { kind: 'live', why: 'stored' },
    );
    expect(
      stateIn(cardCtx({}, 'shared', { added: ['events:time_font_size'] }), 'events:time_font_size'),
    ).toEqual({ kind: 'live', why: 'added' });
    expect(stateIn(cardCtx({}, 'shared', { every: true }), 'events:time_font_size')).toEqual({
      kind: 'live',
      why: 'every',
    });
    // Text being typed is stored as far as the page is concerned: the field must not vanish.
    expect(
      stateIn(cardCtx({}, 'shared', { pending: { time_font_size: '2' } }), 'events:time_font_size'),
    ).toEqual({ kind: 'live', why: 'stored' });
  });

  it('leaves a field that applies, and is none of those, to its Add row', () => {
    expect(stateIn(cardCtx({}, 'shared'), 'events:time_font_size')).toEqual({ kind: 'add' });
    // Stored as blank or null is not stored (#834's rule).
    expect(stateIn(cardCtx({ time_font_size: '' }, 'shared'), 'events:time_font_size')).toEqual({
      kind: 'add',
    });
    expect(stateIn(cardCtx({ time_font_size: null }, 'shared'), 'events:time_font_size')).toEqual({
      kind: 'add',
    });
  });

  it('names a field a closed gate withholds by the condition it waits on', () => {
    const state = stateIn(cardCtx({ show_time: false }, 'shared'), 'events:time_font_size');
    expect(state).toEqual({ kind: 'gated', gate: GATES.time, unmet: GATES.time.requires[0] });
  });

  it('lists a value stored behind a closed gate as not in use, never opening the gate', () => {
    const here = stateIn(
      cardCtx({ show_time: false, time_font_size: '20px' }, 'shared'),
      'events:time_font_size',
    );
    expect(here).toEqual({
      kind: 'inactive',
      gate: GATES.time,
      unmet: GATES.time.requires[0],
      source: 'here',
    });

    // In a layout's scope, a top-level value it would inherit is not in use either, and says
    // where it lives, because a Reset here could not reach it.
    const top = stateIn(
      cardCtx({ show_time: false, time_font_size: '20px' }, 'list'),
      'events:time_font_size',
    );
    expect(top).toMatchObject({ kind: 'inactive', source: 'all-layouts' });

    // A top-level value Grid ignores because it defaults differently does not apply there.
    const ignored = stateIn(
      cardCtx({ view: 'grid', show_description: false, description_color: 'red' }, 'grid'),
      'events:description_color',
    );
    expect(ignored.kind).toBe('gated');
  });

  it('names a field only other layouts offer, by those layouts', () => {
    expect(stateIn(cardCtx({}, 'grid'), 'content:event_order')).toEqual({
      kind: 'other-layout',
      views: ['list'],
    });
    // Month's day list puts every time beside its title, so only List and Columns place it.
    expect(stateIn(cardCtx({}, 'grid'), 'events:time_position')).toEqual({
      kind: 'other-layout',
      views: ['list', 'column'],
    });
  });

  it('never calls an option another layout adds when this workspace offers it under another id', () => {
    // Day Spacing is two ids: `layout:day_spacing` outside Grid, `separators:day_spacing` in it.
    const grid = cardCtx({}, 'grid');
    expect(grid.present.fields.has('separators:day_spacing')).toBe(true);
    expect(stateIn(grid, 'layout:day_spacing')).toEqual({ kind: 'none' });
    const list = cardCtx({}, 'list');
    expect(list.present.fields.has('layout:day_spacing')).toBe(true);
    expect(stateIn(list, 'separators:day_spacing')).toEqual({ kind: 'none' });
  });

  it('keeps a mode value live with its mode, and nowhere without it', () => {
    expect(stateIn(cardCtx({ height: '300px' }, 'shared'), 'layout:card_height')).toEqual({
      kind: 'live',
      why: 'stored',
    });
    // Match Against serves two lists and is live with either.
    const listed = entryCtx({ entities: [{ entity: ANNA, blocklist: 'Birthday' }] }, 'shared');
    expect(stateIn(listed, 'calendar:filter_field')).toEqual({ kind: 'live', why: 'stored' });
    const bare = entryCtx({ entities: [ANNA] }, 'shared');
    expect(stateIn(bare, 'calendar:filter_field')).toEqual({ kind: 'none' });
  });

  it('shows a family together, by any one member, and offers it as one Add item', () => {
    const page = PAGES.find((each) => each.id === 'which_events')!;
    const compact = page.headings.find((heading) => heading.key === 'compact_mode')!;
    const fresh = planPage(page, cardCtx({}, 'list')).headings[page.headings.indexOf(compact)];
    expect(fresh.live).toEqual([]);
    expect(fresh.add).toEqual([
      {
        kind: 'family',
        family: 'compact_mode',
        // Complete Days waits on an Events limit, so it is not offered yet.
        ids: ['content:compact_days_to_show', 'content:compact_events_to_show'],
      },
    ]);
    expect(fresh.gated.map(({ id }) => id)).toEqual(['content:compact_events_complete_days']);

    const stored = planPage(page, cardCtx({ list: { compact_events_to_show: 4 } }, 'list'))
      .headings[page.headings.indexOf(compact)];
    expect(stored.live.map(({ id, why }) => [id, why])).toEqual([
      ['content:compact_days_to_show', 'stored'],
      ['content:compact_events_to_show', 'stored'],
      ['content:compact_events_complete_days', 'stored'],
    ]);
    expect(stored.add).toEqual([]);

    // A member added alone, as search adds one, brings its family with it.
    const one = planPage(page, cardCtx({}, 'list', { added: ['content:compact_events_to_show'] }))
      .headings[page.headings.indexOf(compact)];
    expect(one.live.map(({ id, why }) => [id, why])).toEqual([
      ['content:compact_days_to_show', 'added'],
      ['content:compact_events_to_show', 'added'],
    ]);

    const added = planPage(page, cardCtx({}, 'list', { added: ['family:compact_mode'] })).headings[
      page.headings.indexOf(compact)
    ];
    expect(added.live.map(({ why }) => why)).toEqual(['added', 'added']);
  });

  it('plans a closed configuration: gate lines name what waits, and mode values never get one', () => {
    const page = PAGES.find((each) => each.id === 'events')!;
    const plan = planPage(page, cardCtx({ show_time: false }, 'shared'));
    const gated = plan.headings.flatMap((heading) => heading.gated);
    expect(gated.map(({ id }) => id)).toEqual(expect.arrayContaining([...GATES.time.fields]));
    expect(gated.every(({ gate }) => gate.kind === 'gate')).toBe(true);
    expect(plan.headings.flatMap((heading) => heading.live).map(({ id }) => id)).not.toContain(
      'events:time_font_size',
    );
  });

  it('adds nothing and hides nothing with Show Every Setting on', () => {
    const page = PAGES.find((each) => each.id === 'events')!;
    const plan = planPage(page, cardCtx({}, 'shared', { every: true }));
    expect(plan.headings.flatMap((heading) => heading.add)).toEqual([]);
    expect(plan.headings.flatMap((heading) => heading.live).length).toBeGreaterThan(20);
  });
});

describe('inherited and different', () => {
  it('makes a field live in a layout scope when the top level stores a different value', () => {
    expect(stateIn(cardCtx({ time_font_size: '20px' }, 'list'), 'events:time_font_size')).toEqual({
      kind: 'live',
      why: 'inherited',
    });
    // The same value as the card's default makes nothing live there: nothing differs.
    const atDefault = DEFAULT_CONFIG.time_font_size;
    expect(
      stateIn(cardCtx({ time_font_size: atDefault }, 'list'), 'events:time_font_size'),
    ).toEqual({ kind: 'add' });
    // A value Grid ignores, because Grid defaults differently, does not apply there.
    expect(stateIn(cardCtx({ event_font_size: '20px' }, 'grid'), 'events:event_font_size')).toEqual(
      { kind: 'add' },
    );
  });

  // All eight calendar options that override a card setting, `show_weather` included. Seven
  // have a card setting that can differ; `days_of_week` has none, so it never inherits a value.
  const CASES: ReadonlyArray<readonly [string, Record<string, unknown> | undefined]> = [
    ['show_time', { show_time: false }],
    ['show_location', { show_location: false }],
    ['show_description', { show_description: true }],
    ['split_multiday_events', { split_multiday_events: true }],
    ['multiday_banners', { view: 'grid', multiday_banners: false }],
    ['event_type', { event_type: 'timed' }],
    ['show_weather', { weather_entity: 'weather.home', list: { weather: { position: 'event' } } }],
    ['days_of_week', undefined],
  ];

  it('makes each of the eight entry tri-states live while it follows a card that differs', () => {
    expect(CASES.map(([option]) => option).sort()).toEqual(
      [
        'days_of_week',
        'event_type',
        'multiday_banners',
        'show_description',
        'show_location',
        'show_time',
        'show_weather',
        'split_multiday_events',
      ].sort(),
    );
    for (const [option, card] of CASES) {
      const id = `calendar:${option}`;
      // A calendar's weather follows the forecast of the layout its page is open in.
      const workspace =
        card?.view === 'grid' ? 'grid' : option === 'show_weather' ? 'list' : 'shared';
      const follows = entryCtx({ ...card, entities: [ANNA] }, workspace);
      if (card === undefined) {
        expect(stateIn(follows, id), option).toEqual({ kind: 'add' });
        continue;
      }
      expect(stateIn(follows, id), option).toEqual({ kind: 'live', why: 'inherited' });

      // The card at what it is with nothing stored: nothing to follow that differs.
      const plain = entryCtx(
        { entities: [ANNA], ...(option === 'show_weather' ? card : {}), view: card.view },
        workspace,
      );
      if (option !== 'show_weather') {
        expect(stateIn(plain, id), option).toEqual({ kind: 'add' });
      }
    }
  });

  it('counts show_weather against the forecast beside events, not against the day header', () => {
    const at = (position: string) => ({
      weather_entity: 'weather.home',
      list: { weather: { position } },
      entities: [ANNA],
    });
    const byDay = entryCtx(at('date'), 'list');
    expect(byDay.present.fields.has('calendar:show_weather')).toBe(false);
    const both = entryCtx(at('both'), 'list');
    expect(stateIn(both, 'calendar:show_weather')).toEqual({ kind: 'live', why: 'inherited' });
    // Read across the card's layouts, whichever is being edited: List draws the forecast beside
    // events here, Grid draws none, so with Grid edited too the option says it is only List's.
    for (const workspace of ['grid', 'shared'] as const) {
      const ctx = entryCtx(at('both'), workspace);
      expect(ctx.present.fields.has('calendar:show_weather'), workspace).toBe(true);
      expect(stateOf(fieldIn(ctx, 'calendar:show_weather'), ctx)?.onlyIn, workspace).toEqual(
        workspace === 'grid' ? ['list'] : undefined,
      );
    }
    // A card whose only layout draws no forecast beside events offers no calendar weather.
    const gridAlone = {
      ...at('both'),
      view: 'grid',
      time_grid: { min_days_fallback: 'cramp', weather: { position: 'date' } },
    };
    expect(entryCtx(gridAlone, 'grid').present.fields.has('calendar:show_weather')).toBe(false);
  });
});

describe('state words: every row of the stateOf table', () => {
  const words = (raw: Record<string, unknown>, workspace: EditorWorkspace, id: FieldId) => {
    const ctx = cardCtx(raw, workspace);
    return stateOf(fieldIn(ctx, id), ctx);
  };

  it('a field with no per-layout copy', () => {
    // On a Whole Card page: "Set" when stored, nothing when not, in any scope.
    expect(words({ title: 'Family' }, 'grid', 'card:title')).toEqual({ words: { kind: 'set' } });
    expect(words({}, 'grid', 'card:title')).toBeUndefined();
    expect(words({ refresh_interval: 15 }, 'grid', 'actions:refresh_interval')).toEqual({
      words: { kind: 'set' },
    });
    // On a layout's topic: "Whole Card", or "Whole Card · Set", in every scope: never "Set for
    // Layout Defaults".
    for (const workspace of ['shared', 'grid'] as const) {
      expect(words({}, workspace, 'day_header:weekday_color'), workspace).toEqual({
        words: { kind: 'whole-card', stored: false },
      });
      expect(words({ weekday_color: 'red' }, workspace, 'day_header:weekday_color')).toEqual({
        words: { kind: 'whole-card', stored: true },
      });
    }
    // At home on a Whole Card page, a setting says "Set"; its copy on a topic, drawn there, says
    // "Whole Card", as Start Date's beside Days To Show does.
    const start = { start_date: 'start_of_week' };
    const startCtx = cardCtx(start, 'grid');
    const startField = fieldIn(startCtx, 'content:start_date_mode');
    expect(stateOf(startField, startCtx)).toEqual({ words: { kind: 'set' } });
    expect(stateOf(startField, { ...startCtx, page: 'which_events' })).toEqual({
      words: { kind: 'whole-card', stored: true },
    });
    // A whole-card setting some layout draws nothing for says where it does not apply.
    expect(words({}, 'shared', 'actions:open_links')).toEqual({ notIn: ['grid'] });
  });

  it('a per-layout field in All Layouts', () => {
    expect(words({ time_font_size: '20px' }, 'shared', 'events:time_font_size')).toEqual({
      words: { kind: 'set-all-layouts' },
    });
    expect(
      words({ time_grid: { time_font_size: '20px' } }, 'shared', 'events:time_font_size'),
    ).toEqual({ layoutsOwn: [{ view: 'grid', value: '20px', stored: true }] });
    // A layout that defaults the field otherwise has its own too, until the values agree.
    expect(words({}, 'shared', 'events:event_font_size')).toEqual({
      layoutsOwn: [{ view: 'grid', value: '12px', stored: false }],
    });
    expect(words({ event_font_size: '12px' }, 'shared', 'events:event_font_size')).toEqual({
      words: { kind: 'set-all-layouts' },
    });
    expect(
      words(
        {
          time_font_size: '18px',
          list: { time_font_size: '16px' },
          time_grid: { time_font_size: '20px' },
        },
        'shared',
        'events:time_font_size',
      ),
    ).toEqual({
      words: { kind: 'set-all-layouts' },
      layoutsOwn: [
        { view: 'list', value: '16px', stored: true },
        { view: 'grid', value: '20px', stored: true },
      ],
    });
  });

  it('a per-layout field stored in its layout’s block', () => {
    expect(
      words({ time_grid: { time_font_size: '20px' } }, 'grid', 'events:time_font_size'),
    ).toEqual({ words: { kind: 'set-layout', view: 'grid', sameAsDefault: false } });
    // Equal to the card's default, for a key Grid does not default differently.
    expect(
      words(
        { time_grid: { time_font_size: DEFAULT_CONFIG.time_font_size } },
        'grid',
        'events:time_font_size',
      ),
    ).toEqual({ words: { kind: 'set-layout', view: 'grid', sameAsDefault: true } });
    // Equal to Grid's own default, unitless as #834 found it written.
    expect(words({ time_grid: { event_font_size: 12 } }, 'grid', 'events:event_font_size')).toEqual(
      { words: { kind: 'set-layout', view: 'grid', sameAsDefault: true } },
    );
  });

  it('“Same as the Default” against the default that applies here, worked out from the card', () => {
    // Columns' floor defaults to the card's own day count, so the default is the card's, not a
    // blank card's.
    const raw = { view: 'column', days_to_show: 5 };
    const ctx = cardCtx({ ...raw, column: { min_days_to_show: 3 } }, 'column');
    const field = fieldIn(ctx, 'layout:column.min_days_to_show');
    const restored = resetOutcome(field, ctx)!.value;
    expect(restored).not.toEqual(3);
    expect(stateOf(field, ctx)).toEqual({
      words: { kind: 'set-layout', view: 'column', sameAsDefault: false },
    });
    const same = cardCtx({ ...raw, column: { min_days_to_show: restored } }, 'column');
    expect(stateOf(fieldIn(same, 'layout:column.min_days_to_show'), same)).toEqual({
      words: { kind: 'set-layout', view: 'column', sameAsDefault: true },
    });
  });

  it('“Grid’s Default”, with nothing stored anywhere, and its note when the top level differs', () => {
    expect(words({}, 'grid', 'events:event_font_size')).toEqual({
      words: { kind: 'layout-default', view: 'grid' },
    });
    expect(words({ event_font_size: '16px' }, 'grid', 'events:event_font_size')).toEqual({
      words: { kind: 'layout-default', view: 'grid', ignored: '16px' },
    });
    // A top level equal to Grid's own default leaves nothing to note.
    expect(words({ event_font_size: '12px' }, 'grid', 'events:event_font_size')).toEqual({
      words: { kind: 'layout-default', view: 'grid' },
    });
  });

  it('“From All Layouts” for a value inherited from the top level', () => {
    expect(words({ time_font_size: '20px' }, 'grid', 'events:time_font_size')).toEqual({
      words: { kind: 'from-all-layouts' },
    });
  });

  it('an entry option, set on the calendar or following the card', () => {
    const own = entryCtx({ entities: [{ entity: ANNA, color: '#ff6c92' }] }, 'shared');
    expect(stateOf(fieldIn(own, 'calendar:color'), own)).toEqual({
      words: { kind: 'set-entry', shared: false },
    });

    // A calendar option is the calendar's, and says so where the calendar has siblings.
    const twice = entryCtx(
      {
        entities: [
          { entity: ANNA, name: 'Anna' },
          { entity: ANNA, event_type: 'timed' },
        ],
      },
      'shared',
      {},
      1,
    );
    expect(stateOf(fieldIn(twice, 'calendar:name'), twice)).toEqual({
      words: { kind: 'set-entry', shared: true },
    });

    const follows = entryCtx({ show_time: false, entities: [ANNA] }, 'shared');
    expect(stateOf(fieldIn(follows, 'calendar:show_time'), follows)).toEqual({
      words: { kind: 'follows-card', value: false },
    });
    const plain = entryCtx({ entities: [ANNA] }, 'shared');
    expect(stateOf(fieldIn(plain, 'calendar:show_time'), plain)).toBeUndefined();
  });

  it('reads the card’s value for a calendar in each of the card’s layouts, whatever the preview', () => {
    // The card hides times in List alone. A Grid card falls back to List on a narrow screen, so
    // both are its layouts, and a calendar following the card follows each one's value: the page
    // says so, and Reset goes back to following rather than to one layout's value.
    const raw = {
      view: 'grid',
      list: { show_time: false },
      entities: [ANNA, { entity: 'calendar.ben', show_time: true }],
    };
    for (const previewed of ['grid', 'list'] as const) {
      const anna = { ...entryCtx(raw, 'grid'), previewed };
      const ben = { ...entryCtx(raw, 'grid', {}, 1), previewed };
      expect(stateOf(fieldIn(anna, 'calendar:show_time'), anna), previewed).toEqual({
        words: { kind: 'follows-card', value: false },
      });
      expect(resetOutcome(fieldIn(ben, 'calendar:show_time'), ben), previewed).toEqual({
        kind: 'card',
        value: false,
        differs: true,
      });
    }
    // The control: Grid alone, with no fallback to List, gives one value, which Reset names.
    const alone = { ...raw, time_grid: { min_days_fallback: 'cramp' } };
    const anna = entryCtx(alone, 'grid');
    const ben = entryCtx(alone, 'grid', {}, 1);
    expect(stateOf(fieldIn(anna, 'calendar:show_time'), anna)).toBeUndefined();
    expect(resetOutcome(fieldIn(ben, 'calendar:show_time'), ben)).toEqual({
      kind: 'card',
      value: true,
    });
  });

  it('a card option calendars override, naming those calendars in any scope', () => {
    const raw = {
      entities: [
        { entity: ANNA, show_time: false },
        'calendar.ben',
        { entity: 'calendar.bin_day', show_time: true },
      ],
    };
    for (const workspace of ['shared', 'grid'] as const) {
      const ctx = cardCtx(raw, workspace);
      expect(stateOf(fieldIn(ctx, 'events:show_time'), ctx), workspace).toMatchObject({
        calendars: [10, 12],
      });
    }
    const weather = cardCtx(
      {
        weather_entity: 'weather.home',
        list: { weather: { position: 'event' } },
        entities: ['calendar.ben', { entity: ANNA, show_weather: false }],
      },
      'list',
    );
    expect(stateOf(fieldIn(weather, 'weather:weather.position'), weather)).toMatchObject({
      calendars: [11],
    });
  });

  it('says nothing for anything else', () => {
    expect(words({}, 'shared', 'events:time_font_size')).toBeUndefined();
    expect(words({}, 'list', 'events:time_font_size')).toBeUndefined();
  });
});

describe('the Reset outcome: every row of its table', () => {
  const outcome = (raw: Record<string, unknown>, workspace: EditorWorkspace, id: FieldId) => {
    const ctx = cardCtx(raw, workspace);
    return resetOutcome(fieldIn(ctx, id), ctx);
  };

  it('gives the layout’s default, naming a different top value it beats', () => {
    expect(
      outcome(
        { event_font_size: '14px', time_grid: { event_font_size: '20px' } },
        'grid',
        'events:event_font_size',
      ),
    ).toEqual({ kind: 'layout-default', view: 'grid', value: '12px', ignored: '14px' });
    expect(
      outcome({ time_grid: { event_font_size: '20px' } }, 'grid', 'events:event_font_size'),
    ).toEqual({ kind: 'layout-default', view: 'grid', value: '12px' });
  });

  it('gives the All Layouts value, else the card’s default', () => {
    expect(
      outcome(
        { time_font_size: '16px', time_grid: { time_font_size: '20px' } },
        'grid',
        'events:time_font_size',
      ),
    ).toEqual({ kind: 'all-layouts', value: '16px' });
    expect(
      outcome({ time_grid: { time_font_size: '20px' } }, 'grid', 'events:time_font_size'),
    ).toEqual({ kind: 'default', value: DEFAULT_CONFIG.time_font_size });
    expect(outcome({ time_font_size: '20px' }, 'shared', 'events:time_font_size')).toEqual({
      kind: 'default',
      value: DEFAULT_CONFIG.time_font_size,
    });
  });

  it('on an entry, follows the card', () => {
    const ctx = entryCtx(
      { show_time: false, entities: [{ entity: ANNA, show_time: true }] },
      'shared',
    );
    expect(resetOutcome(fieldIn(ctx, 'calendar:show_time'), ctx)).toEqual({
      kind: 'card',
      value: false,
    });
  });

  it('has nothing to say where nothing is stored here', () => {
    expect(outcome({ time_font_size: '20px' }, 'grid', 'events:time_font_size')).toBeUndefined();
    expect(outcome({}, 'grid', 'events:event_font_size')).toBeUndefined();
  });
});

describe('Reset or Remove, decided by the state Reset would leave', () => {
  const action = (ctx: PlanCtx, id: FieldId) =>
    resetAction(id, APPEARANCE.get(id)!, ctx, writeState(ctx));

  it('gives an essential field Reset, since it stays', () => {
    expect(action(cardCtx({ show_time: false }, 'shared'), 'events:show_time')).toBe('reset');
    expect(action(cardCtx({}, 'shared'), 'events:show_time')).toBeUndefined();
  });

  it('gives Remove to a field that would leave the page', () => {
    expect(action(cardCtx({ time_font_size: '20px' }, 'shared'), 'events:time_font_size')).toBe(
      'remove',
    );
    expect(
      action(cardCtx({}, 'shared', { added: ['events:time_font_size'] }), 'events:time_font_size'),
    ).toBe('remove');
  });

  it('gives Reset, never Remove, to a field still inheriting a value that differs', () => {
    const ctx = cardCtx({ time_font_size: '20px', list: { time_font_size: '18px' } }, 'list');
    expect(action(ctx, 'events:time_font_size')).toBe('reset');
    // Added and inheriting with nothing stored here: neither, since nothing would change.
    const added = cardCtx({ time_font_size: '20px' }, 'list', { added: ['events:time_font_size'] });
    expect(action(added, 'events:time_font_size')).toBeUndefined();
  });

  it('keeps a family member that a sibling holds open', () => {
    const ctx = cardCtx({ list: { compact_events_to_show: 4, compact_days_to_show: 3 } }, 'list');
    expect(action(ctx, 'content:compact_events_to_show')).toBe('reset');
    const alone = cardCtx({ list: { compact_days_to_show: 3 } }, 'list');
    expect(action(alone, 'content:compact_days_to_show')).toBe('remove');
  });

  it('decides an entry’s field by the entry after the reset', () => {
    const stored = entryCtx({ entities: [{ entity: ANNA, show_time: true }] }, 'shared');
    expect(action(stored, 'calendar:show_time')).toBe('remove');
    const following = entryCtx(
      { show_time: false, entities: [{ entity: ANNA, show_time: true }] },
      'shared',
    );
    expect(action(following, 'calendar:show_time')).toBe('reset');
  });
});

describe('storedAt, against #834’s cases', () => {
  const at = (
    raw: Record<string, unknown>,
    workspace: EditorWorkspace,
    id: FieldId,
    owner = raw,
  ) => {
    const ctx = cardCtx(raw, workspace);
    return storedAt(owner, fieldIn(ctx, id), workspace);
  };

  it('counts a value at the root, at a nested path, and in the selected layout’s block', () => {
    expect(at({ event_font_size: '30px' }, 'shared', 'events:event_font_size')).toBe(true);
    // At the value the card would use anyway: only the YAML says it is set.
    expect(at({ refresh_interval: 30 }, 'shared', 'actions:refresh_interval')).toBe(true);
    expect(at({ toolbar: { show: true, legend: 'chips' } }, 'shared', 'card:toolbar.legend')).toBe(
      true,
    );
    // Unitless at the layout's default, which the re-serialized blocks drop.
    expect(
      at({ view: 'column', column: { event_font_size: 14 } }, 'column', 'events:event_font_size'),
    ).toBe(true);
    expect(
      at({ view: 'grid', time_grid: { time_font_size: 12 } }, 'grid', 'events:time_font_size'),
    ).toBe(true);
  });

  it('reads the destination of the workspace it is asked about, not the other scope', () => {
    expect(at({ event_font_size: '30px' }, 'column', 'events:event_font_size')).toBe(false);
    expect(at({ column: { event_font_size: 14 } }, 'shared', 'events:event_font_size')).toBe(false);
  });

  it('counts a value on a calendar entry and on a toolbar button', () => {
    const entry = { entity: ANNA, blocklist: 'Birthday' };
    const ctx = entryCtx({ entities: [entry] }, 'shared');
    expect(storedAt(entry, fieldIn(ctx, 'calendar:blocklist'), 'shared')).toBe(true);
    expect(storedAt(entry, fieldIn(ctx, 'calendar:allowlist'), 'shared')).toBe(false);
    const button: IndexedField = {
      id: 'button:icon',
      node: { name: 'icon', selector: { icon: {} } },
      dataPath: [],
      labelPath: [],
      lifted: [],
      configKeys: ['icon'],
    };
    expect(storedAt({ icon: 'mdi:lightbulb' }, button, 'grid')).toBe(true);
    expect(storedAt({ name: 'Lamp' }, button, 'grid')).toBe(false);
  });

  it('does not count a blank or null', () => {
    expect(at({ event_font_size: '' }, 'shared', 'events:event_font_size')).toBe(false);
    expect(at({ event_font_size: null }, 'shared', 'events:event_font_size')).toBe(false);
    expect(at({ toolbar: { show: true, legend: null } }, 'shared', 'card:toolbar.legend')).toBe(
      false,
    );
    expect(at({ column: { event_font_size: '' } }, 'column', 'events:event_font_size')).toBe(false);
  });
});

describe('the Needs tag of search', () => {
  it('names a withheld setting by what it waits for', () => {
    const labels: Record<string, string> = { 'events:show_description': 'Show Description' };
    const tag = (raw: Record<string, unknown>, gate: keyof typeof GATES) =>
      needsTag(
        GATES[gate],
        { card: workspaceFormData(cardCtx(raw, 'shared').config, 'shared') },
        'en',
        (id) => labels[id] ?? id,
      );
    expect(tag({}, 'description')).toBe('Needs Show Description');
    expect(tag({ weather: { entity: 'weather.home' } }, 'weather_lines')).toBe(
      'Needs the forecast beside each event',
    );
    expect(tag({ show_description: true }, 'description')).toBeUndefined();
  });
});

describe('a calendar entry’s page', () => {
  it('plans its groups by the entry, and its added keys by the entry’s key', () => {
    const raw = { entities: [ANNA, { entity: 'calendar.ben', blocklist: 'Birthday' }] };
    const ctx = cardCtx(raw, 'shared', { added: ['entry:11:calendar:text_scale'] });
    const groups = (at: number) =>
      planEntry(ctx.config.entities![at], ctx.entryKeys![at], ctx).flatMap((group) =>
        group.live.map(({ id, why }) => `${id} ${why}`),
      );
    expect(groups(0)).not.toContain('calendar:blocklist stored');
    expect(groups(0)).not.toContain('calendar:text_scale added');
    expect(groups(1)).toEqual(
      expect.arrayContaining(['calendar:blocklist stored', 'calendar:text_scale added']),
    );
  });
});

/** Two cases where what counts as "stored" is not the line's mere presence. */
describe('what counts as stored, where a blank or a shared key carries the meaning', () => {
  it('keeps Country Names live once Countries To Remove is emptied, since a blank is Custom', () => {
    // An emptied word list writes an empty pattern: Custom with nothing in it, not Keep.
    const emptied = cardCtx({ show_location: true, remove_location_country: '' }, 'shared');
    expect(stateIn(emptied, 'events:location_country_mode')).toEqual({
      kind: 'live',
      why: 'stored',
    });
    expect(stateIn(emptied, 'events:location_country_pattern').kind).toBe('live');
    // Control: with nothing stored, Country Names waits in its Add row, as before.
    const none = cardCtx({ show_location: true }, 'shared');
    expect(stateIn(none, 'events:location_country_mode').kind).toBe('add');
  });

  it('reads a calendar’s Icon Source as not in use only when its label holds an icon source', () => {
    // A text label is stored under `label`, which Icon Source also answers for; it is not an
    // icon source held back.
    const text = entryCtx({ entities: [{ entity: 'calendar.anna', label: 'Kids' }] }, 'shared');
    expect(stateIn(text, 'calendar:label_icon_source').kind).toBe('gated');
    // Control: Home Assistant's icon, stored as its sentinel under a text label type, is.
    const icon = entryCtx(
      { entities: [{ entity: 'calendar.anna', label_type: 'text', label: 'home-assistant' }] },
      'shared',
    );
    expect(stateIn(icon, 'calendar:label_icon_source').kind).toBe('inactive');
  });

  // `show_countdown: true` is the Countdown chip's line. Leave Out Repeated Countdowns reads it as
  // off, its default, so it holds nothing of its own there in any scope, and was drawn live as
  // "From All Layouts" (or "Set" in All Layouts) with nothing stored for it.
  it('reads Leave Out Repeated Countdowns as stored or inherited only where once_per_day turns it on', () => {
    const ID = 'events:countdown_once_per_day';
    for (const workspace of ['shared', 'list', 'column'] as const) {
      const on = cardCtx({ show_countdown: true }, workspace);
      expect(stateIn(on, ID), workspace).toEqual({ kind: 'add' });
      // Nothing stored or inherited; Layout Defaults says only that Month draws no countdown.
      expect(stateOf(fieldIn(on, ID), on), workspace).toEqual(
        workspace === 'shared' ? { notIn: ['month'] } : undefined,
      );
      expect(storedAt(on.raw, fieldIn(on, ID), workspace), workspace).toBe(false);
    }
    // Control: `once_per_day` turns it on, stored at the top level and inherited by a layout.
    const once = { show_countdown: 'once_per_day' };
    expect(stateIn(cardCtx(once, 'shared'), ID)).toEqual({ kind: 'live', why: 'stored' });
    expect(stateIn(cardCtx(once, 'list'), ID)).toEqual({ kind: 'live', why: 'inherited' });
    const list = cardCtx(once, 'list');
    expect(stateOf(fieldIn(list, ID), list)).toEqual({ words: { kind: 'from-all-layouts' } });
    // The chip it refines still reads the line as its own.
    expect(
      stateOf(
        fieldIn(cardCtx({ show_countdown: true }, 'shared'), 'events:show_countdown'),
        cardCtx({ show_countdown: true }, 'shared'),
      ),
    ).toEqual({ words: { kind: 'set-all-layouts' }, notIn: ['month'] });
  });

  it('resets Leave Out Repeated Countdowns to off without taking the countdowns with it', () => {
    const ID = 'events:countdown_once_per_day';
    const after = (raw: Record<string, unknown>, workspace: EditorWorkspace) => {
      const ctx = cardCtx(raw, workspace);
      const result = reset(writeState(ctx), { kind: 'field', field: fieldIn(ctx, ID), workspace });
      return result.state.config;
    };
    expect(after({ show_countdown: 'once_per_day' }, 'shared').show_countdown).toBe(true);
    const list = after({ list: { show_countdown: 'once_per_day' } }, 'list');
    expect(list.list?.show_countdown).toBe(true);
    // Nothing of its own stored: the chip's line is left alone, never deleted.
    expect(after({ show_countdown: true }, 'shared').show_countdown).toBe(true);
    // Remove, since the switch leaves the page once it is off; the countdowns stay.
    const ctx = cardCtx({ show_countdown: 'once_per_day' }, 'shared');
    expect(resetAction(ID, APPEARANCE.get(ID)!, ctx, writeState(ctx))).toBe('remove');
  });

  // The same shape as the countdown, one key read by a derived control, but there every value
  // the dropdown can show is its own: `true` is Same Title, Times and Location, not Off.
  it('reads Duplicates from the derived value, so a stored filter_duplicates is inherited', () => {
    const ID = 'content:filter_duplicates_mode';
    for (const value of [true, 'ignore_location']) {
      expect(stateIn(cardCtx({ filter_duplicates: value }, 'list'), ID)).toEqual({
        kind: 'live',
        why: 'inherited',
      });
      expect(stateIn(cardCtx({ filter_duplicates: value }, 'shared'), ID)).toEqual({
        kind: 'live',
        why: 'stored',
      });
    }
    // `false` derives Off, the default: nothing differs to inherit.
    expect(stateIn(cardCtx({ filter_duplicates: false }, 'list'), ID)).toEqual({ kind: 'add' });
  });
});
