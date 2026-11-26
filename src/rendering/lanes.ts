/**
 * What a lane looks like: its name, its label and its color, and the strip of lane headers a
 * layout draws above its lanes.
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
import type * as Lanes from '../utils/lanes';

/** A lane as its header draws it. */
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
 * One lane's header: its label, or its initial where it has none, then its name.
 *
 * @param head - The lane
 * @returns The header
 */
function renderLaneHeader(head: LaneHead): TemplateResult {
  const labels = head.labels.flatMap((label) => {
    const drawn = Leaves.renderLabel(label.value, label.iconColor, label.type, '');
    return drawn === nothing ? [] : [drawn];
  });
  // A text label that already says the lane's name is the name: drawn once.
  const [only] = head.labels;
  const labelIsName =
    head.labels.length === 1 &&
    Helpers.resolveLabelType(only.value, only.type) === 'text' &&
    only.value.trim() === head.name.trim();

  return html`<div
    class="lane-header"
    data-lane=${head.key}
    style=${styleMap({ '--calendar-card-lane-accent': head.accent })}
  >
    <span class="lane-label"
      >${labels.length > 0 ? labels : html`<span class="lane-initial">${initialOf(head.name)}</span>`}</span
    >${labelIsName ? nothing : html`<span class="lane-name">${head.name}</span>`}
  </div>`;
}

/**
 * The strip of lane headers a grid draws under each date, one per lane, in the lanes' order.
 *
 * Hidden from assistive technology: it is the same strip under every date, and each timed block
 * says whose it is in its own name (`gridEventAccessibleName`).
 *
 * @param heads - The lanes drawn
 * @returns The strip, or nothing where the grid draws no lanes
 */
export function renderLaneStrip(heads: ReadonlyArray<LaneHead>): TemplateResult | typeof nothing {
  if (heads.length === 0) return nothing;

  return html`<div
    class="lane-strip"
    aria-hidden="true"
    style=${styleMap({ gridTemplateColumns: `repeat(${heads.length}, minmax(0, 1fr))` })}
  >
    ${heads.map(renderLaneHeader)}
  </div>`;
}
