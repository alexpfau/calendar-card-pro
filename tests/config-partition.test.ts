/**
 * Every option the card accepts must be classified before the editor can route an edit.
 *
 * The view-first editor decides where a change is written from the view being configured:
 * an option a view overrides goes into that view's block, anything else goes to the card
 * level. That decision is only as good as the classification behind it, and the failure
 * mode is silent in the worst direction — **card level is the fallback**, so an option
 * nobody classified is not rejected, it is quietly written where a grid user's edit has no
 * effect. That is the class of bug this whole rework exists to remove, so it would be a
 * poor showing to reintroduce it in the mechanism.
 *
 * 🚨 The reconciliation is against `Config` itself, not against a second list. `AGENTS.md`
 * records `COLUMN_OVERRIDE_KEYS`, `VIEW_SCOPE` and `DEPRECATED_CONFIG_MAP` each silently
 * losing entries while the suite stayed green, because a test that walks a table's own keys
 * runs one fewer time when an entry goes. Both directions fail here: an option in no bucket
 * fails, and a bucket naming an option that no longer exists fails.
 *
 * The card-level bucket carries a stated reason per option for the same reason. Being the
 * fallback, it is where an unclassified option lands, so "it is card level" has to be a
 * decision somebody took rather than the absence of one.
 *
 * Falsifier: delete any option from `COLUMN_OVERRIDE_KEYS`, or add a member to `Config`
 * without classifying it, and the partition test fails naming the option.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  COLUMN_OVERRIDE_KEYS,
  FETCH_TIME_KEYS,
  VIEWS,
  VIEW_SCOPE,
  routeForKey,
} from '../src/config/view';
import { ATOMIC_KEYS } from '../src/rendering/editor/value';

/**
 * The declared members of `Config`, read from the source.
 *
 * Read as text because an interface leaves nothing behind at runtime, and reading the
 * runtime `DEFAULT_CONFIG` instead would measure the defaults rather than the type —
 * `progress_bar_width` is a declared option with no default and would vanish.
 * `tests/editor-derived-field-mapping.test.ts` backs its own scan the same way.
 *
 * @returns Every top-level config key, in declaration order
 */
function declaredConfigKeys(): string[] {
  const source = readFileSync(join(process.cwd(), 'src/config/types.ts'), 'utf-8');
  const block = source.match(/export interface Config\s*\{([\s\S]*?)\n\}/);

  if (!block) throw new Error('Config not found in types.ts — fix this scan');

  return [...block[1].matchAll(/^ {2}([a-z0-9_]+)\??:/gm)].map((match) => match[1]);
}

/** Options holding a nested block rather than a value of their own. */
const CONTAINER_KEYS = ['weather', 'column', 'time_grid'] as const;

/**
 * Why an option is decided at card level rather than routed into a view's block.
 *
 * Grouped by reason rather than annotated one option at a time: thirty-odd bespoke
 * paragraphs are not reviewable, and the interesting question is never "why this option"
 * but "which of these kinds is it".
 */
const CARD_LEVEL_REASONS = {
  /**
   * The frame around the views, drawn once and identically whichever view is inside it.
   * A per-view title colour would be a different feature, not a routing decision.
   */
  chassis: [
    'title',
    'title_font_size',
    'title_color',
    'background_color',
    'accent_color',
    'hide_when_empty',
  ],

  /**
   * What the card *is* and how it speaks, which no view may disagree with. `view` is the
   * strongest case: it selects the block, so routing it into one would be circular.
   */
  identity: ['view', 'language', 'time_24h'],

  /** Stored whole rather than option by option; reconciled against `ATOMIC_KEYS` below. */
  action: ['tap_action', 'hold_action'],

  /** Declared list-only in `VIEW_SCOPE`; reconciled against it below. */
  'list-only': [
    'compact_days_to_show',
    'compact_events_to_show',
    'compact_events_complete_days',
    'today_indicator_position',
    'date_vertical_alignment',
  ],

  /**
   * The date column's ink. Every view draws a date, and none of them has ever offered to
   * draw it differently, so these are shared by agreement rather than by oversight.
   */
  'date-column': [
    'weekday_color',
    'day_color',
    'month_color',
    'weekend_weekday_color',
    'weekend_day_color',
    'weekend_month_color',
    'today_weekday_color',
    'today_day_color',
    'today_month_color',
  ],

  /** Decides which events exist at all, upstream of any view drawing them. */
  'content-filter': ['event_type'],

  /** Known unreachable options still missing a scope verdict. Must stay empty. */
  'scope-gap': [] as string[],

  /**
   * Must stay empty at commit. A landing spot for an option seen but not yet decided, so
   * that "I have not thought about this one" is a thing the suite can say out loud instead
   * of an option silently inheriting the card-level fallback.
   */
  unreviewed: [] as string[],
} as const;

const CARD_LEVEL_KEYS = Object.values(CARD_LEVEL_REASONS).flat();

describe('config partition', () => {
  const declared = declaredConfigKeys();

  it('reads a plausible number of options from the type', () => {
    expect(declared.length).toBeGreaterThan(90);
    expect(new Set(declared).size).toBe(declared.length);
  });

  it('places every declared option in exactly one bucket', () => {
    const buckets: Record<string, ReadonlyArray<string>> = {
      routable: COLUMN_OVERRIDE_KEYS,
      container: CONTAINER_KEYS,
      fetchTime: [...FETCH_TIME_KEYS].filter(
        (key) => !(CONTAINER_KEYS as ReadonlyArray<string>).includes(key),
      ),
      cardLevel: CARD_LEVEL_KEYS,
    };

    const placements = new Map<string, string[]>();
    for (const [bucket, keys] of Object.entries(buckets)) {
      for (const key of keys) {
        placements.set(key, [...(placements.get(key) ?? []), bucket]);
      }
    }

    const unplaced = declared.filter((key) => !placements.has(key));
    const doublePlaced = [...placements].filter(([, list]) => list.length > 1);

    expect({ unplaced, doublePlaced }).toEqual({ unplaced: [], doublePlaced: [] });
  });

  it('names no option the type does not declare', () => {
    const known = new Set(declared);
    const phantom = [
      ...COLUMN_OVERRIDE_KEYS,
      ...CONTAINER_KEYS,
      ...CARD_LEVEL_KEYS,
      ...[...FETCH_TIME_KEYS].filter(
        (key) => !(CONTAINER_KEYS as ReadonlyArray<string>).includes(key),
      ),
    ].filter((key) => !known.has(key));

    expect(phantom).toEqual([]);
  });

  it('sums to the declared total', () => {
    const fetchTime = [...FETCH_TIME_KEYS].filter(
      (key) => !(CONTAINER_KEYS as ReadonlyArray<string>).includes(key),
    );

    expect(
      COLUMN_OVERRIDE_KEYS.length +
        CONTAINER_KEYS.length +
        fetchTime.length +
        CARD_LEVEL_KEYS.length,
    ).toBe(declared.length);
  });
});

describe('card-level reasons', () => {
  it('lists every card-level option exactly once', () => {
    expect(new Set(CARD_LEVEL_KEYS).size).toBe(CARD_LEVEL_KEYS.length);
  });

  it('leaves nothing unreviewed', () => {
    expect(CARD_LEVEL_REASONS.unreviewed).toEqual([]);
  });

  it('matches ATOMIC_KEYS on the options stored whole', () => {
    expect([...CARD_LEVEL_REASONS.action].sort()).toEqual([...ATOMIC_KEYS].sort());
  });

  it('matches VIEW_SCOPE on the options declared list-only', () => {
    const declaredListOnly = Object.entries(VIEW_SCOPE)
      .filter(([, views]) => views.size === 1 && views.has('list'))
      .map(([key]) => key)
      .filter((key) => CARD_LEVEL_KEYS.includes(key))
      .sort();

    expect([...CARD_LEVEL_REASONS['list-only']].sort()).toEqual(declaredListOnly);
  });

  it('leaves no known scope gap unresolved', () => {
    expect(CARD_LEVEL_REASONS['scope-gap']).toEqual([]);
  });

  it('leaves no list-and-column option stranded at the card level', () => {
    // Nine options are scoped to exactly `{list, column}`. Eight were reachable from the
    // Column workspace and `empty_day_color` was not, although its twin `empty_day_text`
    // — same feature, same scope, written in the same change — was. That was an accident
    // of sequence rather than a decision, and it is fixed in v5.0.0 by adding the key to
    // `COLUMN_OVERRIDE_KEYS`.
    //
    // This reconciliation used to compare the card-level `empty-day` bucket against
    // `VIEW_SCOPE`, which made it a description of the asymmetry rather than a guard
    // against it. Stated as an invariant instead: an option the card honors in column view
    // but which cannot be written into `column:` is unreachable from the workspace that
    // configures that view. If a future option needs to be a genuine exception, this fails
    // and the exception gets argued for rather than inherited.
    const listAndColumn = Object.entries(VIEW_SCOPE)
      .filter(([, views]) => views.size === 2 && views.has('list') && views.has('column'))
      .map(([key]) => key)
      .filter((key) => CARD_LEVEL_KEYS.includes(key))
      .sort();

    expect(listAndColumn).toEqual([]);
  });
});

describe('routeForKey', () => {
  it('sends everything to the top level for a view with no block', () => {
    const routes = new Set(
      [...COLUMN_OVERRIDE_KEYS, ...CARD_LEVEL_KEYS].map((key) => routeForKey(key, 'list')),
    );

    expect(routes).toEqual(new Set(['top-level']));
  });

  it('sends an overridable option into the block of a view that has one', () => {
    const blockViews = VIEWS.filter((view) => view !== 'list');

    expect(blockViews.length).toBeGreaterThan(0);

    for (const view of blockViews) {
      expect({ view, route: routeForKey('event_background_opacity', view) }).toEqual({
        view,
        route: 'block',
      });
    }
  });

  it('keeps card-level options at the card level in every view', () => {
    const routed = VIEWS.flatMap((view) =>
      CARD_LEVEL_KEYS.filter((key) => routeForKey(key, view) !== 'top-level').map(
        (key) => `${view}:${key}`,
      ),
    );

    expect(routed).toEqual([]);
  });

  it('routes a block-only option into the block of the view that owns it', () => {
    expect(routeForKey('hour_line_width', 'grid')).toBe('block');
    expect(routeForKey('hour_line_width', 'list')).toBe('top-level');
  });
});
