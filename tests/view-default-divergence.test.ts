import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import { DEFAULT_CONFIG } from '../src/config/config';
import type * as Types from '../src/config/types';
import {
  DEFAULT_OVERRIDES_BY_VIEW,
  appliesToView,
  resolveEffectiveConfig,
} from '../src/config/view';

/**
 * Cross-view reconciliation over the divergent-default tables.
 *
 * `tests/view-config.test.ts` already pins each table whole, in both directions, so a row
 * cannot leave `TIME_GRID_DEFAULT_OVERRIDES` or arrive in it unnoticed. What no test asked
 * until now is the question *between* the tables: grid diverges on `day_spacing`, so what
 * does column do with `day_spacing`, and was that a decision or an accident?
 *
 * It was an accident of sequence, and an instructive one. A user writing `day_spacing: 18px`
 * gets 18px in column — inherited, documented as a feature of the `day_gap` merge — and 1px
 * in grid, which ignores them, chosen deliberately to match macOS Calendar's gutter. Both
 * cells are individually correct and individually pinned. Neither table's docblock mentions
 * the other, because when the second was written nothing put the first in front of its
 * author. That is the shape of this whole family: not a bug anyone introduced, but a
 * consequence the architecture makes invisible at the moment it is created.
 *
 * 🚨 This is a **reconciliation, not a table walk**. `AGENTS.md` records
 * `COLUMN_OVERRIDE_KEYS`, `VIEW_SCOPE` and `DEPRECATED_CONFIG_MAP` each losing entries with
 * the whole suite green, because `for (const k of Object.keys(TABLE))` runs one fewer time
 * and says nothing. Here the union of every divergent key is crossed with every view that
 * has a block, and each resulting cell must be either owned by that view's table or
 * explicitly acknowledged below. Both directions fail: a missing acknowledgement and a stale
 * one that no longer describes a real cell.
 *
 * The acknowledgements live here rather than in `src/config/view.ts` on purpose. They are
 * documentation of a decision, they would be dead weight in the eager bundle, and
 * `scripts/editor-glossary.mjs` is the standing precedent for reconciliation data kept
 * outside `src/`.
 */

/** What a view does with a key that some *other* view diverges on. */
interface Acknowledgement {
  /**
   * `inherits` — the top-level value reaches this view unchanged.
   * `ignores` — `VIEW_SCOPE` excludes the view, so the option is inert there.
   */
  readonly verdict: 'inherits' | 'ignores';

  /** Why that is the intended answer and not an oversight. */
  readonly why: string;
}

/**
 * Every cell where a view does **not** diverge on a key some other view diverges on.
 *
 * Keyed view first, then option. A cell the view's own table owns must be absent here —
 * an entry for one is stale by construction and fails.
 */
const CROSS_VIEW_ACKNOWLEDGEMENTS: Readonly<
  Record<string, Readonly<Record<string, Acknowledgement>>>
> = {
  column: {
    day_separator_color: {
      verdict: 'inherits',
      why: 'Column keeps horizontal rules between days, the same thing the option has always named, so the card-wide color still describes them. Grid diverges because its rules turned vertical and needed a rule gray rather than a text hue.',
    },
    day_separator_width: {
      verdict: 'inherits',
      why: 'Same rule, same axis, same meaning as list. Grid diverges because a shared time axis needs the day boundary drawn to read as separate columns at all.',
    },
    day_spacing: {
      verdict: 'inherits',
      why: 'The load-bearing pair. Column deliberately inherits this through the day_gap merge, so a user who sets 18px gets 18px. Grid reads the same option as a column gutter rather than vertical space and ignores it. Both are deliberate; neither was written knowing about the other.',
    },
    description_color: {
      verdict: 'inherits',
      why: 'A column row is a list row in a narrower track and paints on the card background, so card-wide ink stays legible. Grid blocks are tinted, which is why grid substitutes the accent sentinel.',
    },
    event_background_opacity: {
      verdict: 'inherits',
      why: 'Column rows carry meaning through an accent line, as list rows do, so the shipped 0 is right. Grid tints the block because a block area is what carries meaning there.',
    },
    event_color: {
      verdict: 'inherits',
      why: 'See description_color — untinted background, so card-wide ink is legible.',
    },
    event_font_size: {
      verdict: 'inherits',
      why: 'A column track is narrower than a card but still a full row height, so the card-wide 14px reads normally. Grid drops to 12px because a block is one seventh of the card with a lane split still possible inside it.',
    },
    location_color: {
      verdict: 'inherits',
      why: 'Location text sits on the card background in column, so the card-wide secondary hue keeps its intended contrast. Grid paints it on a tinted block and needs the accent sentinel to stay legible.',
    },
    progress_bar_color: {
      verdict: 'inherits',
      why: 'The bar is drawn against the card background in column, where the card-wide secondary hue reads correctly. Grid draws it inside a tinted block and takes the accent ink with the rest of that system.',
    },
    time_color: {
      verdict: 'inherits',
      why: 'See description_color — a column row paints on the card background, so card-wide ink stays legible without substitution.',
    },
    progress_bar_width: {
      verdict: 'inherits',
      why: 'Inherits the unset sentinel, which the stylesheet resolves per placement — 80% in column, where a row has no boundary of its own and a full width would read as an underline. Grid needs a concrete 100% because a block is a box with an edge.',
    },
    show_past_events: {
      verdict: 'inherits',
      why: 'A suppression the user asked for, and column has no reason to refuse it. Grid diverges to keep the morning from emptying as the day passes, which is a property of a fixed time axis that column does not have.',
    },
  },
  grid: {
    split_multiday_events: {
      verdict: 'ignores',
      why: 'Deliberately absent from TIME_GRID_DEFAULT_OVERRIDES rather than defaulted off: a default in that table is overridable from the view block, so time_grid: { split_multiday_events: true } would imply the upstream list splitter could be switched back on. Grid answers never via multidaySplitPolicy and segments timed events in its own renderer.',
    },
  },
};

/**
 * Keys two or more views diverge on with **different** substituted values.
 *
 * Empty today, and that is the correct resting state rather than a gap — the pattern is
 * judged against what the runtime can produce, not against the current tree. `show_empty_days`
 * is the only key both tables own and they agree on `true`. A future disagreement is a real
 * design statement and must be written here to pass.
 */
const ACKNOWLEDGED_DISAGREEMENTS: Readonly<Record<string, string>> = {};

/** A value guaranteed different from `from`, so no assertion can pass by coincidence. */
function distinctFrom(from: unknown, key: string): unknown {
  if (typeof from === 'boolean') return !from;
  if (typeof from === 'number') return from === 43 ? 44 : 43;
  if (typeof from === 'string' && /^-?[\d.]+(px|em|rem|%)?$/.test(from)) {
    return from === '37px' ? '38px' : '37px';
  }
  if (typeof from === 'string') {
    return from === 'rgb(1, 2, 3)' ? 'rgb(4, 5, 6)' : 'rgb(1, 2, 3)';
  }
  return `probe-${key}`;
}

const VIEWS_WITH_TABLES = Object.keys(DEFAULT_OVERRIDES_BY_VIEW) as Types.EffectiveView[];

const DIVERGENT_UNION = [
  ...new Set(
    VIEWS_WITH_TABLES.flatMap((view) => Object.keys(DEFAULT_OVERRIDES_BY_VIEW[view] ?? {})),
  ),
].sort();

/** Every (key, view) pair where that view does not own the key. */
const UNOWNED_CELLS = DIVERGENT_UNION.flatMap((key) =>
  VIEWS_WITH_TABLES.filter(
    (view) => !Object.prototype.hasOwnProperty.call(DEFAULT_OVERRIDES_BY_VIEW[view] ?? {}, key),
  ).map((view) => ({ key, view })),
);

function owns(view: Types.EffectiveView, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(DEFAULT_OVERRIDES_BY_VIEW[view] ?? {}, key);
}

describe('cross-view divergent defaults', () => {
  it('has a non-empty union and more than one view to reconcile', () => {
    // The denominator, printed beside the verdicts it bounds. Without it a suite that
    // silently stopped finding views or keys would report every reconciliation below as
    // passing over zero cells.
    expect(VIEWS_WITH_TABLES.length).toBeGreaterThan(1);
    expect(DIVERGENT_UNION.length).toBeGreaterThan(5);
    expect(UNOWNED_CELLS.length).toBeGreaterThan(5);
  });

  it('acknowledges every key a view does not diverge on that another view does', () => {
    const missing = UNOWNED_CELLS.filter(
      ({ key, view }) => CROSS_VIEW_ACKNOWLEDGEMENTS[view]?.[key] === undefined,
    ).map(({ view, key }) => `${view}.${key}`);

    expect(missing).toEqual([]);
  });

  it('carries no acknowledgement for a cell that no longer needs one', () => {
    const stale: string[] = [];
    for (const [view, entries] of Object.entries(CROSS_VIEW_ACKNOWLEDGEMENTS)) {
      for (const key of Object.keys(entries)) {
        if (!VIEWS_WITH_TABLES.includes(view as Types.EffectiveView)) {
          stale.push(`${view}.${key} (view has no block)`);
          continue;
        }
        if (!DIVERGENT_UNION.includes(key)) {
          stale.push(`${view}.${key} (no view diverges on this key)`);
          continue;
        }
        if (owns(view as Types.EffectiveView, key)) {
          stale.push(`${view}.${key} (this view owns it)`);
        }
      }
    }

    expect(stale).toEqual([]);
  });

  it('gives every acknowledgement a reason of substance', () => {
    const thin: string[] = [];
    for (const [view, entries] of Object.entries(CROSS_VIEW_ACKNOWLEDGEMENTS)) {
      for (const [key, ack] of Object.entries(entries)) {
        if (ack.why.trim().length < 40) thin.push(`${view}.${key}`);
      }
    }

    expect(thin).toEqual([]);
  });

  describe('each acknowledgement is true of the running code', () => {
    for (const { key, view } of UNOWNED_CELLS) {
      const ack = CROSS_VIEW_ACKNOWLEDGEMENTS[view]?.[key];

      it(`${view} ${ack?.verdict ?? 'UNACKNOWLEDGED'} ${key}`, () => {
        expect(ack).toBeDefined();

        if (ack?.verdict === 'ignores') {
          expect(appliesToView(key, view)).toBe(false);
          return;
        }

        // Claimed inherited: prove a top-level value distinct from the shipped default
        // reaches this view unchanged. A probe equal to the default would pass against a
        // view that ignored the key entirely.
        expect(appliesToView(key, view)).toBe(true);
        const top = distinctFrom((DEFAULT_CONFIG as unknown as Record<string, unknown>)[key], key);
        const config = buildConfig({ [key]: top } as Partial<Types.Config>);
        const effective = resolveEffectiveConfig(config, view) as unknown as Record<
          string,
          unknown
        >;

        expect(effective[key]).toEqual(top);
      });
    }
  });

  describe('each divergence beats the top level rather than agreeing with it', () => {
    for (const view of VIEWS_WITH_TABLES) {
      for (const [key, owned] of Object.entries(DEFAULT_OVERRIDES_BY_VIEW[view] ?? {})) {
        it(`${view} substitutes its own ${key}`, () => {
          // 🚨 The top level is set to something the owned value is NOT. An earlier probe
          // set it to the owned value on every boolean, so "the table won" and "the top
          // level came through" were the same observation and neither was tested.
          const top = distinctFrom(owned, key);
          const config = buildConfig({ [key]: top } as Partial<Types.Config>);
          const effective = resolveEffectiveConfig(config, view) as unknown as Record<
            string,
            unknown
          >;

          expect(effective[key]).toEqual(owned);
          expect(effective[key]).not.toEqual(top);
        });
      }
    }
  });

  it('reconciles keys more than one view diverges on', () => {
    const disagreeing: string[] = [];
    for (const key of DIVERGENT_UNION) {
      const owners = VIEWS_WITH_TABLES.filter((view) => owns(view, key));
      if (owners.length < 2) continue;

      const values = owners.map((view) =>
        JSON.stringify((DEFAULT_OVERRIDES_BY_VIEW[view] as Record<string, unknown>)[key]),
      );
      if (new Set(values).size > 1 && ACKNOWLEDGED_DISAGREEMENTS[key] === undefined) {
        disagreeing.push(`${key}: ${owners.map((v, i) => `${v}=${values[i]}`).join(' ')}`);
      }
    }

    expect(disagreeing).toEqual([]);
  });

  it('carries no acknowledged disagreement that has since been resolved', () => {
    const resolved = Object.keys(ACKNOWLEDGED_DISAGREEMENTS).filter((key) => {
      const owners = VIEWS_WITH_TABLES.filter((view) => owns(view, key));
      const values = new Set(
        owners.map((view) =>
          JSON.stringify((DEFAULT_OVERRIDES_BY_VIEW[view] as Record<string, unknown>)[key]),
        ),
      );
      return owners.length < 2 || values.size === 1;
    });

    expect(resolved).toEqual([]);
  });
});
