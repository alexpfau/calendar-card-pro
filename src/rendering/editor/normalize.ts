/**
 * Editor comparisons use the same units and numeric values as view resolution.
 */

import * as Config from '../../config/config';
import type * as Types from '../../config/types';
import * as ViewConfig from '../../config/view';
import * as Helpers from '../../utils/helpers';

/**
 * Normalizes one root option without turning an explicit clear into a default.
 *
 * @param key - Real configuration key
 * @param value - Form or authored value
 * @returns A comparable value, preserving missing values
 */
export function normalizeRootValue(key: string, value: unknown): unknown {
  if (key === 'past_event_opacity') return Config.toValidPercentage(value);
  if (value === undefined || value === null) return value;
  const defaults = Config.DEFAULT_CONFIG as unknown as Record<string, unknown>;
  return typeof defaults[key] === 'number'
    ? (Config.toValidNumber(value) ?? value)
    : Config.coercePixelLength(key, value);
}

/**
 * Normalizes a field at its real data path, not its translated group path.
 *
 * @param config - Raw configuration, for dynamic view-only defaults
 * @param path - Enclosing data keys
 * @param key - Field's real key
 * @param value - Form or authored value
 * @returns The comparable value at that scope
 */
export function normalizeFieldValue(
  config: Readonly<Types.Config>,
  path: ReadonlyArray<string>,
  key: string,
  value: unknown,
): unknown {
  if (key === 'past_event_opacity') return normalizeRootValue(key, value);
  if (value === undefined || value === null) return value;
  if (path.length === 0) return normalizeRootValue(key, value);

  const view = viewForBlockPath(path);
  const block = view === undefined ? undefined : ViewConfig.viewBlockFor(view);
  if (view !== undefined && block !== undefined) {
    if (key === 'min_days_to_show') {
      const current = config[block.blockKey];
      return ViewConfig.resolveMinDaysToShow(
        {
          ...config,
          [block.blockKey]: { ...(Helpers.isConfigBlock(current) ? current : {}), [key]: value },
        },
        view,
      );
    }
    if (Object.prototype.hasOwnProperty.call(block.onlyDefaults, key)) {
      return view === 'grid'
        ? ViewConfig.normalizeTimeGridValue(
            key as keyof typeof ViewConfig.TIME_GRID_DEFAULTS,
            value,
          )
        : ViewConfig.normalizeColumnValue(key as keyof typeof ViewConfig.COLUMN_DEFAULTS, value);
    }
    return normalizeRootValue(key, value);
  }

  let reference: unknown = Config.DEFAULT_CONFIG;
  for (const part of path) {
    reference = Helpers.isConfigBlock(reference) ? reference[part] : undefined;
  }
  const fallback = Helpers.isConfigBlock(reference) ? reference[key] : undefined;
  return typeof fallback === 'number'
    ? (Config.toValidNumber(value) ?? value)
    : Config.coercePixelLengthAgainst(fallback, value, optionPath(path, key));
}

/**
 * Names the option a field edits the way the configuration's own tables name it.
 *
 * A field stored in a view block overrides the top-level option of the same name, so it is
 * named by its key alone. A field in a nested group is named by its whole dotted path,
 * because `icon_size` on its own names an option in both `weather.date` and
 * `weather.event` — and only the path lets {@link Config.foldsToDefault} tell them from
 * each other, or from anything else.
 *
 * @param path - Enclosing data keys
 * @param key - Field's real key
 * @returns The option path, such as `time_icon_size` or `weather.date.icon_size`
 */
export function optionPath(path: ReadonlyArray<string>, key: string): string {
  return path.length === 0 || viewForBlockPath(path) !== undefined ? key : [...path, key].join('.');
}

/**
 * The view whose override block a data path is, if it is one.
 *
 * @param path - Enclosing data keys
 * @returns The view, or `undefined` for the root or a nested group
 */
function viewForBlockPath(path: ReadonlyArray<string>): Types.EffectiveView | undefined {
  return path.length === 1
    ? ViewConfig.VIEWS.find((candidate) => ViewConfig.viewBlockFor(candidate)?.blockKey === path[0])
    : undefined;
}
