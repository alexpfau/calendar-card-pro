/**
 * The Full-Size Settings page's model (`pages.ts` › `full_size`): where each value the card opens
 * full size with comes from, the layouts whose own count the `overlay:` block holds, and what the
 * lines leading to the page say. DOM-free, so the tests call it directly.
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
import { isConfigBlock, memoizeLast } from '../../utils/helpers';

/** The card option holding the full-size card's own options. */
export const FULL_SIZE_KEY = 'overlay';

/**
 * Where a value the full-size card uses comes from: set in `overlay:`; the full-size card's own
 * (`OVERLAY_DEFAULTS`, what it assumes, or the built-in default of an option it leaves out of the
 * card's); or the card's, which reaches it unchanged.
 */
export type FullSizeSource = 'set' | 'default' | 'card';

/**
 * The full-size card's toolbar settings the page edits, by their key inside `overlay.toolbar`:
 * Show Toolbar, and every built-in control the card's own toolbar offers with its qualifiers and
 * its size, but Open Full Size, which the full-size card never draws. Its own buttons stay YAML's.
 */
export const FULL_SIZE_TOOLBAR_KEYS: ReadonlyArray<string> = [
  'show',
  'legend',
  'add_event',
  'view_switcher',
  'view_switcher_layouts',
  'reset',
  'refresh',
  'search',
  'navigation',
  'size',
];

/** The page's own settings, by their path inside `overlay:`. */
export const FULL_SIZE_PATHS: ReadonlyArray<ReadonlyArray<string>> = [
  ['view'],
  ['days_to_show'],
  ...FULL_SIZE_TOOLBAR_KEYS.map((key) => ['toolbar', key]),
];

/**
 * What the full-size card's toolbar is read from: the configuration `overlayConfig` makes of the
 * card's `toolbar:` and its `overlay:` block, in the layout the full-size card opens in, which
 * `overlayView` reads as the card does. Nothing else of the card's reaches the full-size toolbar,
 * so only those two are read, and the answer is kept for the pair last asked about, which every
 * form the editor draws asks for again.
 *
 * @param toolbar - The card's `toolbar:`, as stored or merged with the defaults
 * @param overlay - The card's `overlay:`
 * @returns A configuration holding the full-size card's toolbar and layout
 */
export const fullSizeToolbarConfig = memoizeLast(
  (toolbar: unknown, overlay: unknown): Types.Config =>
    ({
      ...overlayConfig({
        ...(toolbar !== undefined && { toolbar }),
        ...(overlay !== undefined && { overlay }),
      }),
      view: overlayView({ overlay } as Pick<Types.Config, 'overlay'>),
    }) as unknown as Types.Config,
);

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

/** The full-size card's configuration without `overlay:`, by the configuration it is built from. */
const withoutOwn = new WeakMap<object, Record<string, unknown>>();

/**
 * The configuration the full-size card would be given from the card's own options alone, without
 * its `overlay:` block. Kept for each stored configuration, which a page asks about once for every
 * full-size setting it draws.
 *
 * @param raw - The configuration as stored
 * @returns The full-size card's configuration, `overlay:` left out
 */
function cardOnly(raw: Readonly<Record<string, unknown>>): Record<string, unknown> {
  let known = withoutOwn.get(raw);
  if (known === undefined) {
    const card: Record<string, unknown> = { ...raw };
    delete card[FULL_SIZE_KEY];
    withoutOwn.set(raw, (known = overlayConfig(card)));
  }
  return known;
}

/** Whether the card's own value at a path reaches the full-size card, by the path. */
const reaching = new Map<string, boolean>();

/**
 * Whether a value the card holds at a path reaches the full-size card, which a probe value set in
 * its place tells. The path alone decides: the card holds a block at every step of it, and what
 * `overlayConfig` leaves out or puts in its place is named by path (`OVERLAY_DEFAULTS`, the sizes,
 * the compact limits, the day count, the overlay action), so the answer is kept by path.
 *
 * @param path - The path inside the card
 * @returns `true` where the card's value comes through
 */
function reaches(path: ReadonlyArray<string>): boolean {
  const key = path.join('\u0000');
  let known = reaching.get(key);
  if (known === undefined) {
    known = atPath(overlayConfig(withPath({}, path, PROBE)), path) === PROBE;
    reaching.set(key, known);
  }
  return known;
}

/**
 * Where the value the full-size card uses at a path comes from. Set where `overlay:` holds one.
 * Otherwise the full-size card's own where the card holds none and the full-size card has one
 * anyway, or where the card's own would not reach it (`reaches`); else the card's.
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
  const held = atPath(raw, path);
  if (held === undefined || path[0] === FULL_SIZE_KEY) {
    return atPath(cardOnly(raw), path) === undefined ? 'card' : 'default';
  }
  return reaches(path) ? 'card' : 'default';
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

/** What the full-size card opens with, as the lines leading to its page name it. */
export interface FullSizeSummary {
  readonly view: Types.EffectiveView;
  readonly days: number;
}

/**
 * What the full-size card opens with: its layout, and the days its List, Columns and Grid show.
 *
 * @param raw - The configuration as stored
 * @returns The summary
 */
export function fullSizeSummary(raw: Readonly<Record<string, unknown>>): FullSizeSummary {
  const config = overlayConfig(raw);
  // Read as the card reads it: a count below one, or none, is the card's default.
  const days = toValidNumber(config.days_to_show, 1) ?? DEFAULT_CONFIG.days_to_show;
  return {
    view: overlayView(raw as Pick<Types.Config, 'overlay'>),
    days: Math.floor(days),
  };
}
