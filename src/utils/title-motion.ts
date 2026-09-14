/**
 * DOM-free title timing and boundary-admission state.
 */

import { TITLE_SCROLL } from '../config/constants';

export interface TitleMotionInput {
  readonly distance: number;
  readonly direction: -1 | 1;
  readonly signature: string;
}

export interface TitleMotionTiming {
  readonly start: number;
  readonly forward: number;
  readonly end: number;
  readonly back: number;
  readonly total: number;
}

/**
 * Times one readable forward pass and its bounded, individual return.
 *
 * @param distance - Nonnegative overflow in local CSS pixels
 * @returns Phase durations in seconds, before the cohort's extra beginning wait
 */
export function titleMotionTiming(distance: number): TitleMotionTiming {
  if (!Number.isFinite(distance) || distance < 0) {
    throw new RangeError('Title overflow must be a finite, nonnegative distance.');
  }
  const start = TITLE_SCROLL.START_PAUSE_S;
  const forward = Math.max(TITLE_SCROLL.MIN_FORWARD_S, distance / TITLE_SCROLL.SPEED_PX_PER_S);
  const end = TITLE_SCROLL.END_PAUSE_S;
  const back = Math.min(
    TITLE_SCROLL.MAX_RETURN_S,
    Math.max(TITLE_SCROLL.MIN_RETURN_S, distance / TITLE_SCROLL.RETURN_SPEED_PX_PER_S),
  );
  return { start, forward, end, back, total: start + forward + end + back };
}

/**
 * Encodes all five phases into one native from/to interpolation.
 *
 * @param distance - Overflow in local CSS pixels
 * @param period - Common cohort period in seconds, at least this title's own total
 * @returns CSS linear() easing with both travel legs linear and the surplus wait at zero
 */
export function titleMotionCurve(distance: number, period: number): string {
  const { start, forward, end, total } = titleMotionTiming(distance);
  if (!Number.isFinite(period) || period < total) {
    throw new RangeError('The title cohort period must contain every complete title trip.');
  }
  const at = (seconds: number) => `${((seconds / period) * 100).toFixed(10)}%`;
  return `linear(0 0%, 0 ${at(start)}, 1 ${at(start + forward)}, 1 ${at(start + forward + end)}, 0 ${at(total)}, 0 100%)`;
}

function sameInput(a: TitleMotionInput, b: TitleMotionInput): boolean {
  return a.distance === b.distance && a.direction === b.direction && a.signature === b.signature;
}

function periodFor(inputs: ReadonlyMap<unknown, TitleMotionInput>): number {
  let period = 0;
  for (const input of inputs.values()) {
    period = Math.max(period, titleMotionTiming(input.distance).total);
  }
  return period;
}

/**
 * Keeps surviving readers on their committed period until the next safe boundary.
 *
 * Keys are moving-content identities; callers supply the full visible membership after
 * merging any partial measurements. Native clocks and visibility belong to the DOM adapter.
 */
export class TitleMotionCohort<Key> {
  private _members = new Map<Key, TitleMotionInput>();
  private _desired = new Map<Key, TitleMotionInput>();
  private _period = 0;
  private _pending = false;

  get members(): ReadonlyMap<Key, TitleMotionInput> {
    return this._members;
  }

  get period(): number {
    return this._period;
  }

  get pending(): boolean {
    return this._pending;
  }

  get empty(): boolean {
    return this._desired.size === 0;
  }

  /**
   * Withdraws changed/departed titles now, without changing surviving readers' clocks.
   *
   * @param desired - Complete current visible membership
   * @returns Members whose old trajectories must stop
   */
  update(desired: ReadonlyMap<Key, TitleMotionInput>): Key[] {
    this._desired = new Map(desired);
    const withdrawn: Key[] = [];
    for (const [key, input] of this._members) {
      const next = desired.get(key);
      if (!next || !sameInput(input, next)) {
        this._members.delete(key);
        withdrawn.push(key);
      }
    }
    this._pending = this._members.size !== desired.size || periodFor(desired) !== this._period;
    return withdrawn;
  }

  /** Retires a canceled native effect even when its node and measured text stayed the same. */
  retire(key: Key): void {
    this._members.delete(key);
  }

  /** Commits the latest desired membership at an initial or natural cycle boundary. */
  commit(): void {
    this._members = new Map(this._desired);
    this._period = periodFor(this._members);
    this._pending = false;
  }

  /** Discards a scene whose effects can no longer resume. */
  clear(): void {
    this._members.clear();
    this._desired.clear();
    this._period = 0;
    this._pending = false;
  }
}
