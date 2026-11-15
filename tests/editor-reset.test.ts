/**
 * One reset path for every destination (backlog item 307).
 *
 * Each case resets through `reset.ts` and then stores the result as the editor does,
 * `value.ts` › `toStoredConfig` with the authored root keys and the YAML as it was, so what is
 * asserted is the line leaving the YAML, not the merged configuration losing a key it would get
 * back. The authored root keys, the Grid reset keys and the held text are asserted beside it,
 * because a reset that moves only one of them is the defect: an authored default the next edit
 * writes back, or a root value copied over Grid's default on the next switch to Grid.
 */
import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from '../src/config/config';
import type * as Types from '../src/config/types';
import {
  type FieldId,
  type IndexedField,
  buildFieldIndex,
  schemaCtx,
} from '../src/rendering/editor/field-index';
import { type ResetTarget, reset } from '../src/rendering/editor/reset';
import { reconcileTimeGridValues, toStoredConfig } from '../src/rendering/editor/value';
import type { EditorWorkspace } from '../src/rendering/editor/workspace';
import type { WriteState } from '../src/rendering/editor/write-frames';

/**
 * The editor's write state for a stored configuration, as `element.ts` builds it on `setConfig`.
 *
 * @param raw - The configuration as stored
 * @param extra - Held text, Grid reset keys
 * @returns The state
 */
function stateFor(
  raw: Record<string, unknown>,
  extra: { pending?: Record<string, string>; gridResetKeys?: ReadonlyArray<string> } = {},
): WriteState {
  const config = { ...structuredClone(DEFAULT_CONFIG), ...structuredClone(raw) } as Types.Config;
  if (!Array.isArray(config.entities)) config.entities = [];
  return {
    config,
    pending: extra.pending ?? {},
    authoredRootKeys: new Set(Object.keys(raw)),
    gridResetKeys: new Set(extra.gridResetKeys ?? []),
    entryKeys: config.entities.map((_, at) => at + 10),
    buttonKeys: [],
  };
}

/**
 * A card field as its workspace builds it.
 *
 * @param state - The state
 * @param workspace - Workspace
 * @param id - Field id
 * @returns The field
 */
function fieldOf(state: WriteState, workspace: EditorWorkspace, id: FieldId): IndexedField {
  const field = buildFieldIndex(schemaCtx(state.config, workspace, 'en')).fields.get(id);
  expect(field, id).toBeDefined();
  return field!;
}

/**
 * Resets, and stores the result as `element.ts` › `_report` does.
 *
 * @param raw - The configuration as stored
 * @param target - What to reset, given the state
 * @param extra - Held text, Grid reset keys
 * @returns The new state, the stored YAML and the added-set keys retired
 */
function run(
  raw: Record<string, unknown>,
  target: (state: WriteState) => ResetTarget,
  extra: Parameters<typeof stateFor>[1] = {},
) {
  const before = stateFor(raw, extra);
  const frozen = structuredClone({ ...before, authoredRootKeys: [...before.authoredRootKeys] });
  const { state, clearAdded } = reset(before, target(before));
  // The state handed in is never changed.
  expect({ ...before, authoredRootKeys: [...before.authoredRootKeys] }).toEqual(frozen);
  const stored = toStoredConfig(state.config, state.authoredRootKeys, raw);
  // The editor holds an empty calendar list for a card without one, as `setConfig` does.
  if (!('entities' in raw)) delete stored.entities;
  return { state, clearAdded, stored };
}

describe('a field', () => {
  it('at the top level: deletes the line and drops it from the authored root keys', () => {
    const { state, stored, clearAdded } = run({ time_font_size: '20px', title: 'Family' }, (s) => ({
      kind: 'field',
      field: fieldOf(s, 'shared', 'events:time_font_size'),
      workspace: 'shared',
    }));
    expect(stored).toEqual({ title: 'Family' });
    expect(state.authoredRootKeys.has('time_font_size')).toBe(false);
    expect(clearAdded).toEqual(['events:time_font_size']);
  });

  it('at the top level, an authored default Grid defaults differently leaves the YAML too', () => {
    // Equal to the card's default and authored, so `retainAuthoredSharedValues` and the
    // authored-line rule would both keep it if either the line or the key were left behind.
    const { stored, state } = run({ event_font_size: DEFAULT_CONFIG.event_font_size }, (s) => ({
      kind: 'field',
      field: fieldOf(s, 'shared', 'events:event_font_size'),
      workspace: 'shared',
    }));
    expect(stored).toEqual({});
    expect(state.authoredRootKeys.has('event_font_size')).toBe(false);
  });

  it('a Shared reset forgets a Grid reset it outlives, as a Shared write does', () => {
    const { state } = run(
      { event_font_size: '16px' },
      (s) => ({
        kind: 'field',
        field: fieldOf(s, 'shared', 'events:event_font_size'),
        workspace: 'shared',
      }),
      { gridResetKeys: ['event_font_size'] },
    );
    expect(state.gridResetKeys.has('event_font_size')).toBe(false);
  });

  it('in a layout’s block: deletes the line there, the block once empty, and remembers Grid’s', () => {
    const raw = {
      view: 'grid',
      event_font_size: '16px',
      time_grid: { event_font_size: '20px' },
    };
    const { state, stored } = run(raw, (s) => ({
      kind: 'field',
      field: fieldOf(s, 'grid', 'events:event_font_size'),
      workspace: 'grid',
    }));
    expect(stored).toEqual({ view: 'grid', event_font_size: '16px' });
    expect(state.gridResetKeys).toEqual(new Set(['event_font_size']));
    // The root line stays authored: the reset was Grid's alone.
    expect(state.authoredRootKeys.has('event_font_size')).toBe(true);

    // Both together are what keep a later switch to Grid from copying the root value over the
    // default Reset gave back.
    const switched = reconcileTimeGridValues(
      { ...state.config, view: 'grid' },
      state.gridResetKeys,
      state.authoredRootKeys,
    );
    expect(switched.time_grid).toBeUndefined();
  });

  it('in Grid’s block, a reset of text still being typed is a Grid reset too', () => {
    // Nothing stored in the block yet, only held text: the switch to Grid must still not copy
    // the root value over the default Reset asked for, as `_resetViewValues` never let it.
    const { state } = run(
      { event_font_size: '16px' },
      (s) => ({
        kind: 'field',
        field: fieldOf(s, 'grid', 'events:event_font_size'),
        workspace: 'grid',
      }),
      { pending: { 'time_grid.event_font_size': '2r' } },
    );
    expect(state.pending).toEqual({});
    expect(state.gridResetKeys).toEqual(new Set(['event_font_size']));
    const switched = reconcileTimeGridValues(
      { ...state.config, view: 'grid' },
      state.gridResetKeys,
      state.authoredRootKeys,
    );
    expect(switched.time_grid).toBeUndefined();
  });

  it('in a layout’s block, a key no layout defaults differently is not a Grid reset', () => {
    const { state, stored } = run(
      { list: { time_font_size: '20px', event_font_size: '16px' } },
      (s) => ({
        kind: 'field',
        field: fieldOf(s, 'list', 'events:time_font_size'),
        workspace: 'list',
      }),
    );
    expect(stored).toEqual({ list: { event_font_size: '16px' } });
    expect(state.gridResetKeys.size).toBe(0);
  });

  it('nested: deletes toolbar.legend and keeps the rest of the toolbar', () => {
    const { stored } = run({ toolbar: { show: true, legend: 'chips', search: true } }, (s) => ({
      kind: 'field',
      field: fieldOf(s, 'shared', 'card:toolbar.legend'),
      workspace: 'shared',
    }));
    expect(stored).toEqual({ toolbar: { show: true, search: true } });
  });

  it('nested two deep: deletes weather.date.color and the group once empty', () => {
    const { stored } = run(
      { weather: { entity: 'weather.home', date: { color: 'red' } } },
      (s) => ({
        kind: 'field',
        field: fieldOf(s, 'shared', 'weather:weather.date.color'),
        workspace: 'shared',
      }),
    );
    expect(stored).toEqual({ weather: { entity: 'weather.home' } });
  });

  it('a synthetic mode resets with its values and their held text, together (R6)', () => {
    const { state, stored } = run(
      { height: '300px', max_height: '500px', title: 'Family' },
      (s) => ({
        kind: 'field',
        field: fieldOf(s, 'shared', 'layout:height_mode'),
        workspace: 'shared',
      }),
      { pending: { card_height: '30', card_max_height: '5', title: 'Fam' } },
    );
    expect(stored).toEqual({ title: 'Family' });
    expect(state.pending).toEqual({ title: 'Fam' });
  });

  it('in a layout scope, clears the text held for that layout and keeps the top level', () => {
    const { stored, state } = run(
      { list: { compact_days_to_show: 3 }, compact_days_to_show: 5 },
      (s) => ({
        kind: 'field',
        field: fieldOf(s, 'list', 'content:compact_days_to_show'),
        workspace: 'list',
      }),
      { pending: { 'list.compact_days_to_show': '3x' } },
    );
    expect(stored).toEqual({ compact_days_to_show: 5 });
    expect(state.pending).toEqual({});
  });
});

describe('a family', () => {
  it('resets every member in one step and retires its added key', () => {
    const { stored, clearAdded } = run(
      {
        title: 'Family',
        list: { compact_days_to_show: 3, compact_events_to_show: 5, event_font_size: '16px' },
      },
      () => ({ kind: 'family', family: 'compact_mode', workspace: 'list' }),
    );
    expect(stored).toEqual({ title: 'Family', list: { event_font_size: '16px' } });
    expect(clearAdded).toEqual([
      'family:compact_mode',
      'content:compact_days_to_show',
      'content:compact_events_to_show',
      'content:compact_events_complete_days',
    ]);
  });

  it('reaches members nested in a layout’s block', () => {
    const { stored } = run(
      { view: 'column', column: { min_day_width: '90px', min_days_to_show: 3, gap: '4px' } },
      () => ({ kind: 'family', family: 'column_density', workspace: 'column' }),
    );
    expect(stored).toEqual({ view: 'column', column: { gap: '4px' } });
  });
});

describe('a calendar entry', () => {
  const ENTITIES = [
    { entity: 'calendar.anna', name: 'Anna', color: '#ff6c92', show_time: false },
    { entity: 'calendar.anna', name: 'Anna', event_type: 'timed' },
    { entity: 'calendar.ben', name: 'Ben' },
  ];

  it('deletes options on the entry its key names, wherever it now stands', () => {
    const { stored, clearAdded } = run({ entities: ENTITIES }, () => ({
      kind: 'entry',
      key: 10,
      keys: ['color', 'show_time'],
    }));
    expect(stored.entities).toEqual([
      { entity: 'calendar.anna', name: 'Anna' },
      ENTITIES[1],
      ENTITIES[2],
    ]);
    expect(clearAdded).toEqual(['entry:10:calendar:color', 'entry:10:calendar:show_time']);
  });

  it('deletes a calendar option from every entry of the calendar, and only that calendar', () => {
    const { stored } = run({ entities: ENTITIES }, () => ({
      kind: 'entry',
      key: 11,
      keys: ['name'],
    }));
    expect(stored.entities).toEqual([
      { entity: 'calendar.anna', color: '#ff6c92', show_time: false },
      { entity: 'calendar.anna', event_type: 'timed' },
      ENTITIES[2],
    ]);
  });

  it('resets an entry’s family in one step and retires its added keys', () => {
    const raw = {
      entities: [
        'calendar.ben',
        {
          entity: 'calendar.anna',
          replace_field: 'location',
          replace_pattern: 'Room ',
          replace_with: '',
          color: 'red',
        },
      ],
    };
    const { stored, clearAdded } = run(raw, () => ({
      kind: 'entry-family',
      key: 11,
      family: 'replace',
    }));
    expect(stored.entities).toEqual(['calendar.ben', { entity: 'calendar.anna', color: 'red' }]);
    expect(clearAdded).toEqual([
      'entry:11:family:replace',
      'entry:11:calendar:replace_field',
      'entry:11:calendar:replace_pattern',
      'entry:11:calendar:replace_with',
    ]);
  });

  it('writes nothing for an entry that has left', () => {
    const { state } = run({ entities: ENTITIES }, () => ({
      kind: 'entry',
      key: 99,
      keys: ['name'],
    }));
    expect(state.config.entities).toEqual(ENTITIES);
  });
});

describe('a path and a whole block', () => {
  it('deletes one line by its path, as the audit names it', () => {
    expect(
      run({ time_grid: { event_font_size: '20px', time_font_size: '9px' } }, () => ({
        kind: 'path',
        path: ['time_grid', 'event_font_size'],
      })).stored,
    ).toEqual({ time_grid: { time_font_size: '9px' } });
    const root = run({ refresh_interval: 30, title: 'Family' }, () => ({
      kind: 'path',
      path: ['refresh_interval'],
    }));
    expect(root.stored).toEqual({ title: 'Family' });
    expect(root.state.authoredRootKeys.has('refresh_interval')).toBe(false);
  });

  it('a path naming a whole block resets it as Reset All does', () => {
    const { state, stored } = run(
      { event_font_size: '16px', time_grid: { event_font_size: '20px' } },
      () => ({ kind: 'path', path: ['time_grid'] }),
      { pending: { 'time_grid.end_time': '2' } },
    );
    expect(stored).toEqual({ event_font_size: '16px' });
    expect(state.gridResetKeys).toEqual(new Set(['event_font_size']));
    expect(state.pending).toEqual({});
  });

  it('a path clears the text a synthetic field holds for the same line', () => {
    // A cleared Card Height is held as text under its synthetic name, not under `height`.
    const { state, stored } = run(
      { height: '400px', list: { height: '300px' } },
      () => ({ kind: 'path', path: ['list', 'height'] }),
      { pending: { 'list.card_height': '', card_height: '4' } },
    );
    expect(stored).toEqual({ height: '400px' });
    expect(state.pending).toEqual({ card_height: '4' });
    const root = run({ height: '400px' }, () => ({ kind: 'path', path: ['height'] }), {
      pending: { card_height: '', 'list.card_height': '3' },
    });
    expect(root.state.pending).toEqual({ 'list.card_height': '3' });
  });

  it('Reset All in Grid: the block, its held text, and every divergent key it held', () => {
    const { stored, state } = run(
      {
        view: 'grid',
        title: 'Family',
        time_grid: { event_font_size: '20px', show_location: true, start_time: '08:00' },
      },
      () => ({ kind: 'block', blockKey: 'time_grid' }),
      // End Time is still being typed: held, never written to the block.
      { pending: { 'time_grid.start_time': '8', 'time_grid.end_time': '2', title: 'Fam' } },
    );
    expect(stored).toEqual({ view: 'grid', title: 'Family' });
    expect(state.gridResetKeys).toEqual(new Set(['event_font_size', 'show_location']));
    expect(state.pending).toEqual({ title: 'Fam' });
    expect(state.authoredRootKeys.has('time_grid')).toBe(false);
  });
});
