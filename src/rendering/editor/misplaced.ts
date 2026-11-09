/**
 * Moving an option the card ignores to where it works (backlog item 192).
 *
 * The findings themselves come from `findMisplacedOptions` in `config/view.ts`, the rule the
 * card's own warnings are built from, so the editor and the card cannot disagree about what is
 * misplaced. This module only answers what a move would do to the YAML.
 *
 * 🚨 A move edits the configuration as the YAML holds it, never the merged one, and the editor
 * adopts the result as its new authored baseline before dispatching it. Routed through the
 * ordinary minimizing write instead, a moved value equal to a default would be dropped rather
 * than moved: `list.show_empty_days: false` lifted to the top level equals `DEFAULT_CONFIG`, and
 * nothing in the old baseline says the user wrote it there.
 *
 * Free of Lit and the DOM, like every editor module but the element and its styles.
 */

import * as Types from '../../config/types';
import type { MisplacedOption } from '../../config/view';
import * as ViewConfig from '../../config/view';
import * as Helpers from '../../utils/helpers';

/** A view-block key (`list`, `column`, `time_grid`), or `null` for the top level. */
export type Place = string | null;

/**
 * Whether a place can take an option without replacing a value already written there.
 *
 * A block that exists but is not an object cannot take anything: writing into it would mean
 * replacing what the user wrote with an object.
 *
 * @param raw - Configuration as the YAML holds it
 * @param key - Option to move
 * @param place - Where it would go
 * @returns `true` when the move would overwrite nothing
 */
export function isFree(raw: Readonly<Record<string, unknown>>, key: string, place: Place): boolean {
  if (place === null) return !Object.prototype.hasOwnProperty.call(raw, key);

  const block = raw[place];
  if (block === undefined || block === null) return true;
  return Helpers.isConfigBlock(block) && !Object.prototype.hasOwnProperty.call(block, key);
}

/**
 * The configuration with one misplaced option moved.
 *
 * The source block goes once the move empties it. Nothing is written when the destination is
 * not free or the finding no longer matches the configuration, so a stale button cannot
 * overwrite anything.
 *
 * @param raw - Configuration as the YAML holds it
 * @param finding - The option and where it is
 * @param to - One of the finding's destinations
 * @returns A new configuration, or `undefined` when the move cannot be made
 */
export function moveOption(
  raw: Readonly<Record<string, unknown>>,
  finding: MisplacedOption,
  to: Place,
): Record<string, unknown> | undefined {
  if (!finding.to.includes(to) || !isFree(raw, finding.key, to)) return undefined;

  const next = structuredClone(raw) as Record<string, unknown>;
  const source = finding.from === null ? next : next[finding.from];
  if (!Helpers.isConfigBlock(source) || !Object.prototype.hasOwnProperty.call(source, finding.key))
    return undefined;

  const value = source[finding.key];
  delete source[finding.key];
  if (finding.from !== null && Object.keys(source).length === 0) delete next[finding.from];

  if (to === null) {
    next[finding.key] = value;
  } else {
    const target = Helpers.isConfigBlock(next[to]) ? next[to] : {};
    target[finding.key] = value;
    next[to] = target;
  }

  return next;
}

/**
 * The view whose block a key names, for labeling a place by the layout it belongs to.
 *
 * @param blockKey - A view-block key
 * @returns The view, or `undefined` for a key no view owns
 */
export function viewForBlock(blockKey: string): Types.EffectiveView | undefined {
  return ViewConfig.VIEWS.find((view) => ViewConfig.viewBlockFor(view)?.blockKey === blockKey);
}

/**
 * How the YAML spells an option's place: `time_grid.toolbar`, or `toolbar` at the top level.
 *
 * @param finding - The misplaced option
 * @returns Its path
 */
export function pathOf(finding: MisplacedOption): string {
  return finding.from === null ? finding.key : `${finding.from}.${finding.key}`;
}
