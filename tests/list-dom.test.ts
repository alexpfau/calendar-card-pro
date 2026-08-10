import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EVENTS, FROZEN_NOW, SINGLE_EVENT, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as Render from '../src/rendering/render';
import * as EventUtils from '../src/utils/events';

/**
 * Phase 0 Stage 2 — the list-view DOM equality gate.
 *
 * Phase 1 extracts the list's leaf renderers into shared functions so the column view
 * can reuse them. The list's own DOM is supposed to come out **byte-identical**; that
 * is the entire safety argument for calling Phase 1 low-risk. This file is what makes
 * that claim checkable instead of asserted.
 *
 * ## What is rendered, and into what
 *
 * The pipeline under test is `groupEventsByDay` → `renderGroupedEvents` → Lit, which is
 * exactly what `calendar-card-pro.ts` `render()` does for the populated case. The card
 * element itself is deliberately **not** constructed. Doing so would require a fake
 * `hass`, a mocked `callApi` (`events.ts:1167`), and awaiting an async fetch — none of
 * which this gate is about, and all of which could fail for reasons unrelated to the
 * DOM. Rendering the pure functions directly isolates the surface Phase 1 changes.
 *
 * The two functions kept together on purpose: grouping decides day boundaries,
 * ordering and which events survive, and rendering turns that into the table. A change
 * to either shows up here, which is what "the list DOM must not change" means.
 *
 * ## Clock
 *
 * `render.ts` reads the current date to decide today, weekend and past-event state
 * (`events.ts` calls `new Date()` in eight places), so the same fixture serialized on
 * two different days produces two different DOMs. Fake timers freeze `Date.now()` and
 * the `new Date()` constructor globally, which covers dayjs too since dayjs has no
 * independent clock. This needs **zero production changes** — no `now` parameter
 * threaded through the very functions Phase 1 is extracting.
 *
 * ## Baselines and the update path
 *
 * Snapshots are committed under `tests/__snapshots__/`. A change to list DOM therefore
 * appears in the PR diff as a snapshot change a reviewer has to look at, which is the
 * point — an intended change is approved by reviewing that diff and re-running with
 * `npx vitest run -u`. A gate with no sanctioned update path gets deleted the first
 * time the DOM legitimately changes; this one has one, and it is loud.
 */

/**
 * Lit leaves three kinds of comment marker in the DOM. Verified by inspecting real
 * output rather than assumed, because stripping a marker that never appears is dead
 * code that reads like a guarantee:
 *
 * - `<!--?lit$095926250$-->` — carries a **per-render random id**. Left in, every
 *   snapshot would differ from every other run. This strip is what makes the gate
 *   possible at all.
 * - `<!---->` — an empty marker; no information, removed for readability.
 * - `<!--?-->` — deterministic, and marks where a conditional branch sits.
 *   Deliberately **kept**: it is stable across runs, and its presence or absence is
 *   real signal about which branch rendered.
 *
 * Whitespace between tags is collapsed onto separate lines so a diff points at the
 * element that changed rather than at one enormous line.
 */
function serialize(container: HTMLElement): string {
  return container.innerHTML
    .replace(/<!--\?lit\$[0-9]+\$-->/g, '')
    .replace(/<!---->/g, '')
    .replace(/>\s+</g, '>\n<')
    .trim();
}

/** Runs the real pipeline and returns normalized markup. */
function renderList(
  events: Types.CalendarEventData[],
  config: Types.Config,
  { isExpanded = false, language = 'en' } = {},
): string {
  const days = EventUtils.groupEventsByDay(events, config, isExpanded, language);
  const container = document.createElement('div');
  litRender(Render.renderGroupedEvents(days, config, language), container);
  return serialize(container);
}

describe('list view DOM', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('freezes the clock, so these snapshots are reproducible on any day', () => {
    // Guards the mechanism the rest of the file depends on. Without this, a broken
    // freeze surfaces as every snapshot failing at once with no stated cause.
    expect(new Date().toISOString()).toBe('2026-06-17T10:00:00.000Z');
  });

  it('renders the default configuration', () => {
    expect(renderList(EVENTS, buildConfig())).toMatchSnapshot();
  });

  it('renders a single event', () => {
    expect(renderList(SINGLE_EVENT, buildConfig())).toMatchSnapshot();
  });

  it('renders an empty calendar', () => {
    expect(renderList([], buildConfig())).toMatchSnapshot();
  });

  it('renders empty days when show_empty_days is on', () => {
    // A distinct render branch: placeholder events carry `_isEmptyDay` and are
    // rendered differently from real ones.
    expect(renderList(SINGLE_EVENT, buildConfig({ show_empty_days: true }))).toMatchSnapshot();
  });

  it('renders past events when show_past_events is on', () => {
    // Off by default, so without this the past-event branch is never serialized and
    // the `Past standup` fixture would be silently filtered before reaching the DOM.
    expect(renderList(EVENTS, buildConfig({ show_past_events: true }))).toMatchSnapshot();
  });

  it('renders week numbers and separators when enabled', () => {
    expect(
      renderList(
        EVENTS,
        buildConfig({
          days_to_show: 10,
          show_week_numbers: 'iso',
          week_separator_width: '1px',
          day_separator_width: '1px',
        }),
      ),
    ).toMatchSnapshot();
  });

  it('renders split multi-day events', () => {
    // `split_multiday_events` changes how the Conference fixture is decomposed across
    // days, which is one of the paths Phase 1's shared renderers must preserve.
    expect(renderList(EVENTS, buildConfig({ split_multiday_events: true }))).toMatchSnapshot();
  });

  it('renders compact mode', () => {
    expect(
      renderList(EVENTS, buildConfig({ compact_days_to_show: 2, compact_events_to_show: 3 })),
    ).toMatchSnapshot();
  });

  it('renders location and end time when enabled', () => {
    expect(
      renderList(EVENTS, buildConfig({ show_location: true, show_end_time: true })),
    ).toMatchSnapshot();
  });

  it('renders in a non-English language', () => {
    // Weekday and month names come from the translation layer, so this pins the join
    // between rendering and i18n that `check-i18n.mjs` cannot see.
    expect(
      renderList(EVENTS, buildConfig({ language: 'de' }), { language: 'de' }),
    ).toMatchSnapshot();
  });
});
