/**
 * The Full Size page's model (`pages.ts` › `full_size`): where each value the card opens full size
 * with comes from, the layouts whose own count the `overlay:` block holds, and what the overview's
 * row says. DOM-free, so the tests call it directly.
 *
 * Every answer is read through `config/overlay.ts` › `overlayConfig`, which builds the configuration
 * the full-size card is given, so nothing here restates a default: Grid, seven days and the toolbar
 * are whatever `OVERLAY_DEFAULTS` says. The lines the block holds beyond this page's own settings
 * are `audit.ts` › `fullSizeLines`, since Stored Settings already walks a card-shaped block.
 */

import { DEFAULT_CONFIG, toValidNumber } from '../../config/config';
import { overlayConfig, overlayView } from '../../config/overlay';
import type * as Types from '../../config/types';
import { routeForKey, viewBlockFor } from '../../config/view';
import { VIEWS } from '../../config/views';
import { isConfigBlock } from '../../utils/helpers';

/** The card option holding the full-size card's own options. */
export const FULL_SIZE_KEY = 'overlay';

/**
 * Where a value the full-size card uses comes from: set in `overlay:`; the full-size card's own
 * (`OVERLAY_DEFAULTS`, what it assumes, or the built-in default of an option it leaves out of the
 * card's); or the card's, which reaches it unchanged.
 */
export type FullSizeSource = 'set' | 'default' | 'card';

/** The page's own settings, by their path inside `overlay:`. */
export const FULL_SIZE_PATHS: ReadonlyArray<ReadonlyArray<string>> = [
  ['view'],
  ['days_to_show'],
  ['toolbar', 'show'],
];

/** A string no configuration holds, so a value that reaches the full-size card is told apart. */
const PROBE = '\u0000full-size-probe';

/**
 * A value at a path, through nested blocks.
 *
 * @param value - Where to start
 * @param path - Keys, outermost first
 * @returns The value, or `undefined` where a step is missing or no block
 */
function atPath(value: unknown, path: ReadonlyArray<string>): unknown {
  let at = value;
  for (const key of path) {
    if (!isConfigBlock(at)) return undefined;
    at = at[key];
  }
  return at;
}

/**
 * A copy with one value set at a path, the blocks on the way copied rather than changed.
 *
 * @param value - The configuration
 * @param path - Keys, outermost first
 * @param set - The value
 * @returns The copy
 */
function withPath(
  value: Readonly<Record<string, unknown>>,
  path: ReadonlyArray<string>,
  set: unknown,
): Record<string, unknown> {
  const [key, ...rest] = path;
  const inner = value[key];
  return {
    ...value,
    [key]: rest.length === 0 ? set : withPath(isConfigBlock(inner) ? inner : {}, rest, set),
  };
}

/**
 * The path inside `overlay:` a field writes, or `undefined` for a field outside it.
 *
 * @param field - A field: its enclosing data keys and its name
 * @param field.dataPath - Its enclosing data keys
 * @param field.node - Its schema node
 * @param field.node.name - Its name
 * @returns The path, outermost first
 */
export function fullSizePath(field: {
  readonly dataPath: ReadonlyArray<string>;
  readonly node: { readonly name: string };
}): ReadonlyArray<string> | undefined {
  return field.dataPath[0] === FULL_SIZE_KEY
    ? [...field.dataPath.slice(1), field.node.name]
    : undefined;
}

/**
 * Where the value the full-size card uses at a path comes from. Set where `overlay:` holds one.
 * Otherwise the full-size card's own where the card holds none and the full-size card has one
 * anyway, or where the card's own would not reach it, which a probe value set in the card's place
 * tells; else the card's.
 *
 * @param raw - The configuration as stored
 * @param path - The path inside `overlay:`
 * @returns The source
 */
export function fullSizeSource(
  raw: Readonly<Record<string, unknown>>,
  path: ReadonlyArray<string>,
): FullSizeSource {
  const own = atPath(raw[FULL_SIZE_KEY], path);
  if (own !== undefined && own !== null && own !== '') return 'set';
  const card: Record<string, unknown> = { ...raw };
  delete card[FULL_SIZE_KEY];
  if (atPath(card, path) === undefined) {
    return atPath(overlayConfig(card), path) === undefined ? 'card' : 'default';
  }
  return atPath(overlayConfig(withPath(card, path, PROBE)), path) === PROBE ? 'card' : 'default';
}

/**
 * The layouts whose own value for an option `overlay:` holds in their block, and the value: Grid's
 * three days under `overlay.time_grid`. Only a layout that keeps its own copy of the option.
 *
 * @param raw - The configuration as stored
 * @param path - The option's path inside `overlay:`, a top-level option
 * @returns The layouts in the card's order, each with its value
 */
export function fullSizeLayoutsOwn(
  raw: Readonly<Record<string, unknown>>,
  path: ReadonlyArray<string>,
): ReadonlyArray<{ readonly view: Types.EffectiveView; readonly value: unknown }> {
  if (path.length !== 1) return [];
  const block = raw[FULL_SIZE_KEY];
  return VIEWS.flatMap((view) => {
    const blockKey = viewBlockFor(view)?.blockKey;
    if (blockKey === undefined || routeForKey(path[0], view) !== 'block') return [];
    const value = atPath(block, [blockKey as string, path[0]]);
    return value === undefined ? [] : [{ view, value }];
  });
}

/** What the full-size card opens with, as the overview's row names it. */
export interface FullSizeSummary {
  readonly view: Types.EffectiveView;
  readonly days: number;
  readonly toolbar: boolean;
}

/**
 * What the full-size card opens with: its layout, the days its List, Columns and Grid show, and
 * whether it draws its toolbar.
 *
 * @param raw - The configuration as stored
 * @returns The summary
 */
export function fullSizeSummary(raw: Readonly<Record<string, unknown>>): FullSizeSummary {
  const config = overlayConfig(raw);
  // Read as the card reads it: a count below one, or none, is the card's default.
  const days = toValidNumber(config.days_to_show, 1) ?? DEFAULT_CONFIG.days_to_show;
  const toolbar = config.toolbar;
  return {
    view: overlayView(raw as Pick<Types.Config, 'overlay'>),
    days: Math.floor(days),
    toolbar: !isConfigBlock(toolbar) || toolbar.show !== false,
  };
}
