/**
 * What a lane is called: its name, which each block drawn in it says to assistive technology.
 *
 * The card's alone. Which lanes there are is `utils/lanes.ts`, which the editor reads too.
 */

import type * as Types from '../config/types';
import { calendarName } from '../utils/calendar-names';
import type * as Lanes from '../utils/lanes';

/** A lane as the grid draws it. */
export interface LaneHead {
  /** The lane's key (`Lanes.laneKey`). */
  readonly key: string;

  /** The calendars in the lane, in order. */
  readonly entityIds: ReadonlyArray<string>;

  /** The lane's `lane` value, else its calendar's name on this card. */
  readonly name: string;
}

/**
 * Resolves the name of each lane.
 *
 * @param lanes - The lanes drawn, in order
 * @param config - Configuration resolved for the layout
 * @param hass - Home Assistant, for calendar names
 * @returns One head per lane
 */
export function laneHeads(
  lanes: ReadonlyArray<Lanes.Lane>,
  config: Types.Config,
  hass?: Types.Hass | null,
): LaneHead[] {
  return lanes.map((lane) => {
    const first = lane.entries[0];
    const named = typeof first.lane === 'string' && first.lane.trim() !== '';

    return {
      key: lane.key,
      entityIds: lane.entityIds,
      name: named ? lane.key : calendarName(first.entity, config, hass),
    };
  });
}
