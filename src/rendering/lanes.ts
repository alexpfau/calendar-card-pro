/**
 * What a lane looks like: its name, its label and its color, the header a list or column view
 * draws for it, and which of a day's events go into it.
 *
 * The card's alone. Which lanes there are is `utils/lanes.ts`, which the editor reads too; this
 * resolves labels and colors as an event row does, which reaches the card's formatting, so it
 * must never be imported from the editor (`check:bundle` refuses Day.js in `editor.js`).
 */

import { TemplateResult, html, nothing } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';

import * as Leaves from './leaves';
import type * as Types from '../config/types';
import { calendarName } from '../utils/calendar-names';
import * as EntityColors from '../utils/entity-colors';
import * as EventUtils from '../utils/events';
import * as Helpers from '../utils/helpers';
import * as Lanes from '../utils/lanes';

/** A lane as a layout draws it. */
export interface LaneHead {
  /** The lane's key (`Lanes.laneKey`). */
  readonly key: string;

  /** The calendars in the lane, in order. */
  readonly entityIds: ReadonlyArray<string>;

  /** The lane's `lane` value, else its calendar's name on this card. */
  readonly name: string;

  /** Each part of the label of the lane's first entry that has one, as an event row draws it. */
  readonly labels: ReadonlyArray<Types.ResolvedLabel>;

  /** The accent color of the lane's first entry, which rings its label. */
  readonly accent: string;
}

/**
 * An entry, dressed as the event it would admit, so the card's own resolvers read that entry's
 * options rather than its calendar's first entry's.
 *
 * @param entry - An entry under `entities`
 * @returns The stand-in
 */
function admittedBy(entry: Types.EntityConfig): Types.CalendarEventData {
  return { _entityId: entry.entity, _matchedConfig: entry } as Types.CalendarEventData;
}

/**
 * Resolves the name, label and color of each lane.
 *
 * @param lanes - The lanes drawn, in order
 * @param config - Configuration resolved for the layout
 * @param hass - Home Assistant, for calendar names, person pictures and entity icons
 * @returns One head per lane
 */
export function laneHeads(
  lanes: ReadonlyArray<Lanes.Lane>,
  config: Types.Config,
  hass?: Types.Hass | null,
): LaneHead[] {
  if (lanes.length === 0) return [];
  const registryColors = EntityColors.entityColors();

  return lanes.map((lane) => {
    const first = lane.entries[0];
    const labeled =
      lane.entries.find((entry) => Helpers.labelParts(entry.label).length > 0) ?? first;
    const named = typeof first.lane === 'string' && first.lane.trim() !== '';

    return {
      key: lane.key,
      entityIds: lane.entityIds,
      name: named ? lane.key : calendarName(first.entity, config, hass),
      labels: EventUtils.resolveLabelParts(labeled.entity, config, admittedBy(labeled), hass),
      accent: EventUtils.getEntityAccentColorWithOpacity(
        first.entity,
        config,
        undefined,
        admittedBy(first),
        registryColors,
      ),
    };
  });
}

/**
 * The id a lane's header carries, by which each event in the lane names its lane to assistive
 * technology. One per place, the same on every day, so a header drawn once serves them all.
 *
 * @param index - The lane's place among the lanes drawn, from 0
 * @returns The id
 */
export function laneHeaderId(index: number): string {
  return `calendar-card-lane-${index}`;
}

/** What an event drawn in a lane needs of it: the header naming it, and the label it shows. */
export interface LaneOfEvent {
  /** The id of the lane's name in its header ({@link laneHeaderId}), which describes the event. */
  readonly id: string;

  /**
   * The label the header shows where it shows one alone, which an event in the lane then leaves
   * out rather than draw again under it. An event whose calendar has a label of its own, such as
   * a work calendar's icon in a person's lane, keeps it.
   */
  readonly label?: string;
}

/**
 * What an event drawn in a lane needs of it ({@link LaneOfEvent}).
 *
 * @param head - The lane
 * @param index - Its place among the lanes drawn, from 0
 * @returns The lane, as its events read it
 */
export function laneOfEvent(head: LaneHead, index: number): LaneOfEvent {
  return {
    id: laneHeaderId(index),
    label: head.labels.length === 1 ? head.labels[0].value : undefined,
  };
}

/**
 * The first character of a name, for a lane with no label to draw: a circle in the lane's color
 * with it inside still tells the lanes apart where there is no room for the name.
 *
 * @param name - The lane's name
 * @returns Its first character, upper-cased where the script has case
 */
function initialOf(name: string): string {
  const [first = ''] = Array.from(name.trim());
  return first.toLocaleUpperCase();
}

/**
 * One lane's header: its label, or its initial in a circle of its color where it has none, then
 * its name. The label is for the eye; the name is what assistive technology reads, and each event
 * in the lane is described by it.
 *
 * @param head - The lane
 * @param index - Its place among the lanes drawn, from 0
 * @param gridRow - The row it heads, where it stands at the start of a column view's lane row
 * @returns The header
 */
export function renderLaneHeader(head: LaneHead, index: number, gridRow?: number): TemplateResult {
  const labels = head.labels.flatMap((label) => {
    const drawn = Leaves.renderLabel(label.value, label.iconColor, label.type, '');
    return drawn === nothing ? [] : [drawn];
  });

  return html`<div
    class="lane-header"
    data-lane=${head.key}
    style=${styleMap({
      '--calendar-card-lane-accent': head.accent,
      gridRow: gridRow === undefined ? undefined : String(gridRow),
    })}
  >
    <span class="lane-label" aria-hidden="true"
      >${
        labels.length > 0 ? labels : html`<span class="lane-initial">${initialOf(head.name)}</span>`
      }</span
    ><span class="lane-name" id=${laneHeaderId(index)}>${head.name}</span>
  </div>`;
}

/** One day's events, divided among the lanes drawn. */
export interface LaneEvents {
  /** Each lane's events, in the order the day lists them, one list per lane drawn. */
  readonly lanes: ReadonlyArray<ReadonlyArray<Types.CalendarEventData>>;

  /**
   * What belongs to no lane drawn: a day's "No events" notice, drawn across the lanes. An event
   * whose lane is not drawn, which the filters that hide a lane never leave behind, is drawn
   * there too rather than lost.
   */
  readonly rest: ReadonlyArray<Types.CalendarEventData>;
}

/**
 * Divides a day's events among the lanes drawn, each event into the lane of the entry that
 * admitted it, keeping the day's order within each lane.
 *
 * @param events - The day's events, as grouping ordered them
 * @param heads - The lanes drawn, in order
 * @returns The events of each lane, and what belongs to none
 */
export function eventsByLane(
  events: ReadonlyArray<Types.CalendarEventData>,
  heads: ReadonlyArray<Pick<LaneHead, 'key'>>,
): LaneEvents {
  const place = new Map(heads.map((head, index) => [head.key, index]));
  const lanes: Types.CalendarEventData[][] = heads.map(() => []);
  const rest: Types.CalendarEventData[] = [];

  for (const event of events) {
    const index = event._isEmptyDay ? undefined : place.get(Lanes.eventLaneKey(event));
    if (index === undefined) rest.push(event);
    else lanes[index].push(event);
  }

  return { lanes, rest };
}
