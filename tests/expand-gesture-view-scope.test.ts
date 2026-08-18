/**
 * The expand gesture is inert in column view (spec A3-D).
 *
 * A3-D rules the whole compact family inert in column view — `compact_events_to_show`,
 * the per-entity form, `compact_days_to_show`, `compact_events_complete_days`, and the
 * `action: 'expand'` gesture that drives them. Column density is `min_days_to_show` /
 * `min_days_fallback` instead.
 *
 * The gesture was not inert. `hasCompactModeLimits()` read top-level config with no view
 * test, so a column card with a compact limit set still flipped `isExpanded` on tap.
 *
 * That was not a harmless flag. The same flag gates the empty-day range branch, so with
 * `column.show_empty_days: false` and an empty range a collapsed card rendered one column
 * and an expanded one rendered seven — a visible, spec-violating layout change from a
 * gesture the spec says does nothing.
 *
 * It required a deliberate `tap_action: expand` to reach (the default is `none`), which is
 * why this shipped as a correctness fix rather than a release blocker.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import '../src/calendar-card-pro';
import type * as Types from '../src/config/types';

interface CardUnderTest extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  toggleExpanded(): void;
  isExpanded: boolean;
  readonly effectiveView: Types.EffectiveView;
}

/** A config carrying a compact limit, so the gesture has something to drive. */
function config(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    entities: ['calendar.test'],
    days_to_show: 7,
    compact_events_to_show: 2,
    tap_action: { action: 'expand' },
    ...extra,
  };
}

function mount(cfg: Record<string, unknown>): CardUnderTest {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig(cfg);
  document.body.appendChild(card);
  return card;
}

describe('A3-D: the expand gesture in column view', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('still expands in LIST view (the control)', () => {
    // Without this, a bug that disabled expansion everywhere would pass the column
    // assertion below and look like a fix. The gesture must keep working where it is
    // supposed to work.
    const card = mount(config());
    expect(card.effectiveView).toBe('list');
    expect(card.isExpanded).toBe(false);

    card.toggleExpanded();
    expect(card.isExpanded).toBe(true);

    card.toggleExpanded();
    expect(card.isExpanded).toBe(false);
  });

  it('does NOT expand in COLUMN view, even with a compact limit set', () => {
    const card = mount(config({ view: 'column' }));
    expect(card.effectiveView).toBe('column');

    card.toggleExpanded();
    expect(card.isExpanded).toBe(false);
  });

  it('does not expand in column view with a PER-ENTITY compact limit either', () => {
    // The per-entity limit is a separate branch of the same predicate and was equally
    // ungated, so it needs its own case rather than being assumed to follow.
    const card = mount(
      config({
        view: 'column',
        compact_events_to_show: undefined,
        entities: [{ entity: 'calendar.test', compact_events_to_show: 2 }],
      }),
    );
    expect(card.effectiveView).toBe('column');

    card.toggleExpanded();
    expect(card.isExpanded).toBe(false);
  });

  it('does not expand in column view with compact_days_to_show either', () => {
    const card = mount(
      config({ view: 'column', compact_events_to_show: undefined, compact_days_to_show: 2 }),
    );
    expect(card.effectiveView).toBe('column');

    card.toggleExpanded();
    expect(card.isExpanded).toBe(false);
  });

  it('list view with no compact limit at all does not expand', () => {
    // Pre-existing behaviour, pinned here because the view gate sits directly in front
    // of it: a change that made the gate return true unconditionally would otherwise
    // only be caught by the column cases, and this states the original contract.
    const card = mount(config({ compact_events_to_show: undefined, tap_action: undefined }));
    card.toggleExpanded();
    expect(card.isExpanded).toBe(false);
  });
});
