/**
 * Reference implementations of the width fallback, for tests only.
 *
 * The card resolves view and column count together through `resolveColumnFit` and
 * `resolveColumnFitOnMeasurement`. These three model only the view half, as a wholesale
 * fallback: below the threshold they answer list view, never column view with fewer
 * columns. That is a property of this model, not of the card, which reduces the column
 * count first and falls back to a list only when even `min_days_to_show` does not fit.
 *
 * They live here, not in `src/`, because nothing in either bundle calls them. They
 * survive as the oracle `tests/view-config.test.ts` pins `resolveColumnFit` against at
 * defaults, where the column staircase has one step and must be indistinguishable from
 * this boundary. Do not delete them without replacing that equivalence check.
 */

import type * as Types from '../../src/config/types';
import {
  VIEWS_WITH_WIDTH_FALLBACK,
  VIEW_SWITCH_HYSTERESIS_PX,
  computeColumnThresholdPxFor,
  resolveViewOption,
} from '../../src/config/view';

/**
 * Computes the card width, in pixels, at or above which a view's configured
 * `days_to_show` columns render.
 *
 * @param config - Merged configuration, defaults already applied
 * @param view - View whose `days_to_show` and width options apply
 * @returns Minimum card width in pixels for the configured number of columns
 */
export function computeColumnThresholdPx(
  config: Types.Config,
  view: Types.EffectiveView = 'column',
): number {
  return computeColumnThresholdPxFor(config, resolveViewOption(config, 'days_to_show', view), view);
}

/**
 * Resolves the view for a width, without resolving a column count.
 *
 * Hysteresis is a Schmitt trigger centered on the threshold: entering costs half a band
 * above it, leaving is granted half a band below it.
 *
 * @param requestedView - The configured view
 * @param measuredWidthPx - Measured card width, or `null` before first measurement
 * @param thresholdPx - Result of `computeColumnThresholdPx`
 * @param previousEffectiveView - Last resolved view, for hysteresis; `null` initially
 * @returns The view to render
 */
export function resolveEffectiveView(
  requestedView: Types.EffectiveView,
  measuredWidthPx: number | null,
  thresholdPx: number,
  previousEffectiveView: Types.EffectiveView | null = null,
): Types.EffectiveView {
  // List view has no width requirement, so there is nothing to fall back to.
  if (!VIEWS_WITH_WIDTH_FALLBACK.has(requestedView)) {
    return requestedView;
  }

  // Before the first measurement, honor the request to avoid flashing the fallback.
  if (measuredWidthPx === null || measuredWidthPx <= 0) {
    return requestedView;
  }

  const halfBand = VIEW_SWITCH_HYSTERESIS_PX / 2;
  const effectiveThreshold =
    previousEffectiveView === requestedView ? thresholdPx - halfBand : thresholdPx + halfBand;

  return measuredWidthPx >= effectiveThreshold ? requestedView : 'list';
}

/**
 * Resolves the view for a freshly measured width, given the previous measurement.
 *
 * `resolveEffectiveView` renders the requested view before any measurement exists, so
 * that optimistic answer must not seed hysteresis. A `null` `previousMeasuredWidthPx`
 * means no measurement has confirmed the current view yet.
 *
 * @param requestedView - The configured view
 * @param previousMeasuredWidthPx - Width at the previous measurement, `null` if none
 * @param measuredWidthPx - The width just measured
 * @param thresholdPx - Result of `computeColumnThresholdPx`
 * @param previousEffectiveView - The view currently rendered
 * @returns The view to render
 */
export function resolveViewOnMeasurement(
  requestedView: Types.EffectiveView,
  previousMeasuredWidthPx: number | null,
  measuredWidthPx: number,
  thresholdPx: number,
  previousEffectiveView: Types.EffectiveView,
): Types.EffectiveView {
  return resolveEffectiveView(
    requestedView,
    measuredWidthPx,
    thresholdPx,
    previousMeasuredWidthPx === null ? null : previousEffectiveView,
  );
}
