/**
 * What Undo restores, reconciled against the editor's own fields (backlog item 307, R29).
 *
 * The fields are enumerated at runtime, so one added later cannot hide: `Object.keys` on a mounted
 * editor for plain fields, and Lit's `elementProperties` for reactive state, which lives behind
 * prototype accessors that `Object.keys` cannot see. Every field must be classified; a snapshotted
 * one must be one `history.ts` › `Snapshot` holds and `_restore` puts back.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { changeField, mountEditor } from './helpers/editor-host';
import * as Config from '../src/config/config';
import type { Snapshot } from '../src/rendering/editor/history';

afterEach(() => document.body.replaceChildren());

/** Snapshotted: each `Snapshot` member, and the field it is taken from and restored to. */
const SNAPSHOT_FIELDS: Readonly<Record<keyof Snapshot, string>> = {
  raw: '_rawConfig',
  authoredRootKeys: '_authoredRootKeys',
  gridResetKeys: '_gridResetKeys',
  gridReconciliation: '_gridReconciliation',
  pending: '_pending',
  migration: '_migration',
  entryKeys: '_entryKeys',
  buttonKeys: '_buttonKeys',
};

/** Every other field, by why Undo leaves it. */
const POLICY: Readonly<Record<string, ReadonlyArray<string>>> = {
  // Restored through the step's `Where`.
  where: ['_selectedWorkspace', '_nav'],
  // Session UI state, outside Undo.
  session: [
    '_addedButtons',
    '_quickSetup',
    '_filter',
    '_banner',
    '_scopeChanged',
    '_scopeOpen',
    '_status',
    '_entryNotice',
    '_openStrip',
    '_adding',
    '_calendarQuery',
    '_announcer',
    '_spoken',
    // A color draft is never written, and Undo leaves it as it does the text in any field.
    '_colorDrafts',
    '_openColor',
    '_registryHeld',
    // The field a search result showed, and the results it left.
    '_jump',
    '_resultsLeft',
    // What a page shows besides what is stored (section 5.1): the settings added this session,
    // the Add row open, and the two preferences, which this browser remembers instead.
    '_added',
    '_addOpen',
    '_prefs',
    // The line What This Card Changes is editing in place.
    '_auditEdit',
  ],
  // Keys never go back, so a restored entry's key is never handed to another.
  counters: ['_nextEntryKey', '_nextButtonKey'],
  // Caches, compared by value or rebuilt as they are read.
  caches: [
    '_emittedConditions',
    '_intlLanguage',
    '_kept',
    '_drawn',
    '_drawnConditions',
    '_warmKey',
    '_warmData',
    '_warmRun',
    '_warmed',
    // Each field's Reset or Remove, recomputed once the configuration moves.
    '_actions',
    // What This Card Changes' groups, made again once what they read moves.
    '_audit',
  ],
  // Derived from what is snapshotted, or from the render in progress.
  derived: [
    '_config',
    '_lastDispatched',
    '_drawing',
    '_bareUpdatePending',
    '_registryWanted',
    '_resultStatus',
  ],
  // The history itself, and whether a change is being recorded.
  history: ['_history', '_committing'],
  // Bound handlers and memoized builders: no state Undo could miss.
  handlers: [
    '_undo',
    '_redo',
    '_ctxFor',
    '_formDataFor',
    '_mintEntryKey',
    '_localizeValue',
    '_back',
    '_onKeydown',
    '_openScope',
    '_pickScope',
    '_describe',
    '_addButton',
    '_panelWillChange',
    '_openQuickSetup',
    '_quickSetupFormChanged',
    '_cancelQuickSetup',
    '_applyQuickSetup',
    '_filterChanged',
    '_cardColors',
    '_entryColors',
    '_defaultData',
    '_haColorName',
    '_registryChanged',
    '_cancelAdd',
    '_addCalendarChosen',
  ],
};

interface Internals {
  _snapshot(): Snapshot;
  _restore(snapshot: Snapshot): void;
}

/** A field as a snapshot holds it: a set as its members, in order. */
const asHeld = (value: unknown): unknown => (value instanceof Set ? [...value] : value);

describe('the undo state policy', () => {
  it('classifies every field of the editor', async () => {
    const editor = await mountEditor({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
      toolbar: { show: true, buttons: [{ icon: 'mdi:home', tap_action: { action: 'none' } }] },
    });
    const own = Object.keys(editor).filter((key) => /^_[a-zA-Z]/.test(key));
    const reactive = [
      ...(
        editor.constructor as unknown as { elementProperties: Map<PropertyKey, unknown> }
      ).elementProperties.keys(),
    ].filter((key): key is string => typeof key === 'string' && key.startsWith('_'));
    const fields = new Set([...own, ...reactive]);
    const classified = [...Object.values(SNAPSHOT_FIELDS), ...Object.values(POLICY).flat()];
    console.info(
      `undo state policy: ${fields.size} fields (${own.length} own, ${reactive.length} reactive); ` +
        `${classified.length} classified`,
    );
    expect(fields.size).toBeGreaterThan(40);
    expect(
      [...fields].filter((field) => !classified.includes(field)),
      'unclassified',
    ).toEqual([]);
    expect(
      classified.filter((field) => !fields.has(field)),
      'classified but gone',
    ).toEqual([]);
    expect(new Set(classified).size, 'classified twice').toBe(classified.length);
  });

  it('snapshots and restores exactly the snapshotted fields', async () => {
    const editor = await mountEditor({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
      view: 'grid',
      event_font_size: '14px',
      toolbar: { show: true, buttons: [{ icon: 'mdi:home', tap_action: { action: 'none' } }] },
    });
    const state = editor as unknown as Internals & Record<string, unknown>;
    const snapshot = state._snapshot();
    expect(Object.keys(snapshot).sort()).toEqual(Object.keys(SNAPSHOT_FIELDS).sort());
    for (const [member, field] of Object.entries(SNAPSHOT_FIELDS)) {
      expect(asHeld(state[field]), member).toEqual(snapshot[member as keyof Snapshot]);
    }

    // Move every snapshotted field, then restore: each must come back.
    await changeField(editor, 'card:title', 'Moved');
    state._rawConfig = { moved: true };
    state._authoredRootKeys = new Set(['moved']);
    state._gridResetKeys = new Set(['moved']);
    state._gridReconciliation = ['moved'];
    state._pending = { moved: 'moved' };
    state._migration = { kind: 'automatic' };
    state._entryKeys = [99];
    state._buttonKeys = [98];
    state._restore(snapshot);
    for (const [member, field] of Object.entries(SNAPSHOT_FIELDS)) {
      expect(asHeld(state[field]), member).toEqual(snapshot[member as keyof Snapshot]);
    }
  });
});
