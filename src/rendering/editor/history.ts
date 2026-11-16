/**
 * Undo and Redo: exact snapshots of what the editor holds about the configuration, a step per
 * change (backlog item 307).
 *
 * A snapshot is everything a write reads or leaves behind besides the YAML itself, so restoring
 * one puts back a pruned deprecated option, an authored default, a Grid reset or a pending
 * migration byte for byte. Free of Lit and of the DOM, like every module beside the schemas.
 */

import type { Route } from './navigation';
import { equalConfigs } from './value';
import type { EditorWorkspace } from './workspace';

/** Whether and how the editor may write a card authored before the layout blocks. */
export type MigrationState =
  | { readonly kind: 'current' }
  | { readonly kind: 'automatic' }
  | { readonly kind: 'choice'; readonly keys: ReadonlyArray<string> }
  | { readonly kind: 'future'; readonly version: number }
  | { readonly kind: 'invalid'; readonly value: unknown };

/** What the editor holds about the configuration at one moment. */
export interface Snapshot {
  /** The stored configuration as last emitted or received. */
  readonly raw: Readonly<Record<string, unknown>>;
  readonly authoredRootKeys: ReadonlyArray<string>;
  readonly gridResetKeys: ReadonlyArray<string>;
  readonly gridReconciliation: ReadonlyArray<string>;
  /** Text a field holds that does not parse yet, by pending key. */
  readonly pending: Readonly<Record<string, string>>;
  readonly migration: MigrationState;
  readonly entryKeys: ReadonlyArray<number>;
  readonly buttonKeys: ReadonlyArray<number>;
}

/** Where a change was made, which Undo and Redo return to. */
export interface Where {
  readonly route: Route;
  /** The scope the edit was made in; undefined while it follows what the card displays. */
  readonly workspace: EditorWorkspace | undefined;
  /** What to focus once it is back: `field:<id>`, `entry:<key>` or `button:<key>`. */
  readonly focusKey?: string;
}

/** One step. */
export interface HistoryEntry {
  /** Already localized: "Change Event Font Size". */
  readonly label: string;
  readonly before: Snapshot;
  readonly after: Snapshot;
  readonly where: Where;
}

/**
 * The steps of one editing session: Undo walks back through them, Redo forward again, and a new
 * change drops whatever Redo could still reach.
 */
export class History {
  /** The most steps kept; the oldest goes first. */
  static readonly LIMIT = 75;

  /** How soon after the last one a change to the same text or number field joins its step. */
  static readonly COALESCE_MS = 800;

  private _done: HistoryEntry[] = [];

  private _undone: HistoryEntry[] = [];

  /** What the last recorded step may be joined by, and when it was recorded. */
  private _open?: { readonly key: string; readonly at: number };

  /**
   * Records a change. Typing in one field joins the step before it when that step was the last
   * thing recorded, for the same field and scope, less than `COALESCE_MS` ago: the joined step
   * keeps the earlier `before`, so one Undo takes back the whole run of keystrokes. A run that
   * ends where it began leaves no step at all.
   *
   * @param entry - The change
   * @param coalesceKey - The field and scope typed in; undefined for anything that never joins
   * @param now - The time, in ms
   */
  record(entry: HistoryEntry, coalesceKey: string | undefined, now: number): void {
    this._undone = [];
    const open = this._open;
    const last = this._done[this._done.length - 1];
    if (
      coalesceKey !== undefined &&
      open !== undefined &&
      last !== undefined &&
      open.key === coalesceKey &&
      now - open.at < History.COALESCE_MS
    ) {
      this._done.pop();
      entry = { ...entry, before: last.before };
      if (equalConfigs(entry.before.raw, entry.after.raw)) {
        this._open = undefined;
        return;
      }
    }
    this._done.push(entry);
    if (this._done.length > History.LIMIT) this._done.shift();
    this._open = coalesceKey === undefined ? undefined : { key: coalesceKey, at: now };
  }

  /**
   * Steps back.
   *
   * @returns The step taken back, whose `before` is to be restored; undefined when none is left
   */
  undo(): HistoryEntry | undefined {
    const entry = this._done.pop();
    this._open = undefined;
    if (entry !== undefined) this._undone.push(entry);
    return entry;
  }

  /**
   * Steps forward again.
   *
   * @returns The step done again, whose `after` is to be restored; undefined when none is left
   */
  redo(): HistoryEntry | undefined {
    const entry = this._undone.pop();
    this._open = undefined;
    if (entry !== undefined) this._done.push(entry);
    return entry;
  }

  /** Forgets every step, as a configuration the editor did not send does. */
  clear(): void {
    this._done = [];
    this._undone = [];
    this._open = undefined;
  }

  get canUndo(): boolean {
    return this._done.length > 0;
  }

  get canRedo(): boolean {
    return this._undone.length > 0;
  }

  /** The step Undo would take back, which names the Undo button: "Undo: Remove Ben". */
  peekUndo(): HistoryEntry | undefined {
    return this._done[this._done.length - 1];
  }

  /** The step Redo would do again. */
  peekRedo(): HistoryEntry | undefined {
    return this._undone[this._undone.length - 1];
  }
}
