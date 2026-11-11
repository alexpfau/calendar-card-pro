import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as Grid from '../src/rendering/grid';
import * as Render from '../src/rendering/render';
import * as EventUtils from '../src/utils/events';
import * as FormatUtils from '../src/utils/format';
import * as GridTimeFit from '../src/utils/grid-time-fit';

/**
 * The grid time row's horizontal fit.
 *
 * Grid is the only view whose time row can be too narrow for its own text, because a
 * block's width is the day width divided by its concurrent column count and has nothing to
 * do with the height that reveals the row. This used to be gated by `min-width: 60px` on
 * the container rung, which was right about its own arithmetic and wrong about the
 * question: it charged every row 18px for a clock icon before charging it anything for a
 * time, and it was calibrated around an ellipsis that makes a false statement inside a
 * clock reading.
 *
 * Two surfaces are pinned here. The ladder itself is a pure function and is pinned by
 * value, at the widths measured on the deployed card, so a rung cannot be reordered or a
 * threshold nudged without a named failure. The markup split it depends on is pinned
 * separately, because CSS cannot hide half of a text node and the whole ladder is inert
 * without it.
 */

const at = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2026, 5, 17, h, m).toISOString();
};

function timed(from: string, to: string, summary: string): Types.CalendarEventData {
  return {
    start: { dateTime: at(from) },
    end: { dateTime: at(to) },
    summary,
    _entityId: 'calendar.personal',
  };
}

/** The grid's own 24-hour clock, so a pinned width means the string it was measured on. */
function gridConfig(overrides: Partial<Types.Config> = {}): Types.Config {
  return buildConfig({ view: 'grid', days_to_show: 1, time_24h: true, ...overrides });
}

function renderGrid(events: Types.CalendarEventData[], config: Types.Config): HTMLElement {
  const effective = ViewConfig.resolveEffectiveConfig(config, 'grid');
  const days = EventUtils.groupEventsByDay(events, config, false, 'en', 'grid');
  const container = document.createElement('div');
  litRender(
    Grid.renderGridGroupedEvents(days, effective, 'en', undefined, null, FROZEN_NOW),
    container,
  );
  return container;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Widths measured on the deployed card in Chromium, at the shipped 12px type.
 *
 * The clock icon is 14px of box and 4px of margin. `10:00` is 29.86 and ` - 12:00` adds
 * 39.12, so a full row needs 86.98. These are the numbers the deleted constant was
 * calibrated from, kept here so the ladder is pinned against reality rather than against
 * itself.
 */
const ICON = 18;
const START = 29.86;
const END = 39.12;
const FULL = ICON + START + END;
/**
 * What the same row needs with its end time on a second line.
 *
 * Not derived from the three above: blockifying the end element strips the separator's
 * leading space, so the second line is `- 12:00` at 36.14 rather than ` - 12:00` at 39.12.
 * That 3.0px is a font metric, and the card measures it rather than computing it. Read off
 * the browser's own line boxes on 55 live rows, in both clock modes.
 */
const WRAPPED = 36.14;

describe('grid time row fit', () => {
  describe('the ladder', () => {
    /**
     * Every rung, pinned by value at a width taken from a real screenshot.
     *
     * Reconciled against the whole table rather than walked, so dropping a rung fails here
     * instead of quietly running one fewer case.
     */
    it('gives up the icon before the end time, and the end time before the row', () => {
      const rung = (available: number) =>
        GridTimeFit.gridTimeFit({ available, full: FULL, icon: ICON, end: END, wrapped: WRAPPED });

      expect([124.6, 79, 45.9, 32, 29.2].map(rung)).toEqual([
        { time: true, icon: true, end: true, wrap: false },
        { time: true, icon: false, end: true, wrap: false },
        { time: true, icon: false, end: true, wrap: true },
        { time: true, icon: false, end: false, wrap: false },
        { time: false, icon: false, end: false, wrap: false },
      ]);
    });

    /**
     * The defect that retired the fifth rung, pinned as a property rather than a case.
     *
     * A `full - end` test is strictly looser than `full - icon`, because an end time is
     * always wider than the icon. A ladder holding both therefore drops the icon, restores
     * it one rung later and drops it again, so the icon blinks as a lane narrows — measured
     * on every one of the 55 published blocks that draw an end time, and on none of the 55
     * that do not. Sweeping one row's own width is what makes this visible: comparing
     * different blocks conflates their content with their lane and answers a different
     * question.
     *
     * Asserted over the sweep rather than at the one width that used to fail, so any future
     * rung that reintroduces the flicker fails here without anyone adding a case for it.
     */
    it('never brings the icon back once a narrower lane has taken it away', () => {
      let seenWithoutIcon = false;
      const restored: number[] = [];

      for (let available = Math.ceil(FULL) + 8; available >= 0; available -= 0.25) {
        const fit = GridTimeFit.gridTimeFit({
          available,
          full: FULL,
          icon: ICON,
          end: END,
          wrapped: WRAPPED,
        });
        if (!fit.time) continue;
        if (!fit.icon) seenWithoutIcon = true;
        else if (seenWithoutIcon) restored.push(available);
      }

      expect(seenWithoutIcon).toBe(true);
      expect(restored).toEqual([]);
    });

    /**
     * The icon is spent first, and it is now spent for something the icon cannot buy back.
     *
     * At `icon + start` the row used to be able to draw only one of the icon and the end
     * time, and chose the end time. It can now draw the end time *and* still have width to
     * spare, because a wrapped range needs less than a bare one on a single line. So this
     * width no longer marks a boundary at all, and the real one sits lower: only between a
     * bare start and a wrapped range does the end time genuinely have to go.
     */
    it('spends the icon before the end time, and keeps the end time by wrapping it', () => {
      const costs = { full: FULL, icon: ICON, end: END, wrapped: WRAPPED };

      expect(GridTimeFit.gridTimeFit({ available: START + ICON, ...costs })).toEqual({
        time: true,
        icon: false,
        end: true,
        wrap: true,
      });
      expect(GridTimeFit.gridTimeFit({ available: WRAPPED - 0.66, ...costs })).toEqual({
        time: true,
        icon: false,
        end: false,
        wrap: false,
      });
    });

    /**
     * The wrapped rung, pinned at the boundary it was measured at.
     *
     * 36.14 is what `🧪 QA Window` needs on the deployed card, in a 46px lane. Pinned from
     * both sides, because a rung that is only checked from above cannot fail when it is
     * widened and a rung only checked from below cannot fail when it is narrowed.
     */
    it('wraps the end time at exactly the width it needs, and not below', () => {
      const costs = { full: FULL, icon: ICON, end: END, wrapped: WRAPPED };

      expect(GridTimeFit.gridTimeFit({ available: WRAPPED, ...costs }).wrap).toBe(true);
      expect(GridTimeFit.gridTimeFit({ available: WRAPPED - 0.66, ...costs }).wrap).toBe(false);
      expect(GridTimeFit.gridTimeFit({ available: 46, ...costs })).toEqual({
        time: true,
        icon: false,
        end: true,
        wrap: true,
      });
    });

    /**
     * The invariant the wrapped rung's ordering exists to protect, stated directly.
     *
     * A width-sorted ladder would seat `icon + wrapped range` — about 57px — between the
     * bare one-line rung at 68.98 and the wrapped one at 36.14, and the icon would go off
     * at 87, come back at 69 and go off again at 57. Rather than sweeping for the symptom a
     * second time, pin the cause: the icon is a function of lane width against `full` and
     * of nothing else, so it cannot flip-flop along either axis whatever rungs are added
     * beneath it.
     */
    it('draws the icon if and only if the lane is at least a full row wide', () => {
      const disagreements: number[] = [];

      for (let available = Math.ceil(FULL) + 8; available >= 0; available -= 0.25) {
        const fit = GridTimeFit.gridTimeFit({
          available,
          full: FULL,
          icon: ICON,
          end: END,
          wrapped: WRAPPED,
        });
        if (fit.icon !== available + 1 / 64 >= FULL) disagreements.push(available);
      }

      expect(disagreements).toEqual([]);
    });

    /**
     * `start <= wrapped < bare < full` holds by construction, because the wrapped width is
     * a maximum taken over the start. Asserted anyway, at the measured widths, so a future
     * change that computes it some other way fails here rather than inverting the ladder
     * silently at some locale nobody tested.
     */
    it('never seats the wrapped rung outside the two it sits between', () => {
      expect(START).toBeLessThanOrEqual(WRAPPED);
      expect(WRAPPED).toBeLessThan(FULL - ICON);
      expect(FULL - ICON).toBeLessThan(FULL);
    });

    /**
     * A wrapped rung with nothing to wrap would spend a line of height and draw nothing
     * with it. `show_end_time: false` is a real published setting, so this is a live path
     * rather than a defensive one.
     *
     * Three shapes, because the rung has two guards and no browser-reachable fixture can
     * separate them. A mutation sweep found this: dropping `end > 0` alone changed nothing,
     * which reads as a dead condition and is not. With no end time `full - icon` equals
     * `wrapped` exactly -- the row's max-content width is its start time either way -- so
     * rung 2 answers before rung 3 is ever consulted, and it is rung 2 doing the masking
     * rather than the sibling guard beside it. The third case is the only one that reaches
     * the rung, and it has to be an out-of-model input to get there.
     */
    it('never wraps a row that draws no end time', () => {
      const rung = (available: number, costs: { end: number; wrapped: number }) =>
        GridTimeFit.gridTimeFit({
          available,
          full: ICON + START,
          icon: ICON,
          ...costs,
        });

      const lanes = [124.6, 45.9, 32, 29.2];
      const never = [false, false, false, false];

      // No end element: nothing measured, nothing to move.
      expect(lanes.map((lane) => rung(lane, { end: 0, wrapped: 0 }).wrap)).toEqual(never);

      // An end element that measures nothing. The row is still as wide as its start time,
      // so a rung testing only the wrapped width would grant a blank second line.
      expect(lanes.map((lane) => rung(lane, { end: 0, wrapped: START }).wrap)).toEqual(never);

      // Neither of those two reaches the wrapped rung at all, which is the point. With no
      // end time `full - icon` and `wrapped` are the same number, so rung 2 always answers
      // first and the guard below it is never consulted. The guard is not therefore idle:
      // this function is exported, pure and total, and a caller that hands it a wrapped
      // width narrower than the start time it contains -- which no measurement can produce
      // -- would otherwise be granted a second line with nothing on it.
      expect(rung(20, { end: 0, wrapped: 10 }).wrap).toBe(false);
    });

    /**
     * `show_end_time: false` is the reported card's own setting and defaults to true, so a
     * suite built from default config never renders this string at all. With nothing to
     * drop the ladder must collapse to two rungs by itself.
     */
    it('collapses to two rungs when no end time is drawn', () => {
      const rung = (available: number) =>
        GridTimeFit.gridTimeFit({ available, full: ICON + START, icon: ICON, end: 0, wrapped: 0 });

      expect([124.6, 45.9, 29.2].map(rung)).toEqual([
        { time: true, icon: true, end: true, wrap: false },
        { time: true, icon: false, end: true, wrap: false },
        { time: false, icon: false, end: false, wrap: false },
      ]);
    });

    /**
     * The 0.66px between the narrowest measured lane and a bare start time. A measured
     * predicate has no calibration to be wrong, so this is a boundary rather than a knife
     * edge — but it is the boundary the maintainer's report turns on, so it is pinned.
     */
    it('reveals a bare start time at exactly the width it needs, and not below', () => {
      const bare = { full: ICON + START, icon: ICON, end: 0, wrapped: 0 };

      expect(GridTimeFit.gridTimeFit({ available: START, ...bare }).time).toBe(true);
      expect(GridTimeFit.gridTimeFit({ available: START - 0.66, ...bare }).time).toBe(false);
    });

    it('hides the row rather than guessing when a block has not been laid out', () => {
      const hidden = { time: false, icon: false, end: false, wrap: false };

      expect(
        GridTimeFit.gridTimeFit({
          available: 0,
          full: FULL,
          icon: ICON,
          end: END,
          wrapped: WRAPPED,
        }),
      ).toEqual(hidden);
      expect(
        GridTimeFit.gridTimeFit({
          available: Number.NaN,
          full: FULL,
          icon: ICON,
          end: END,
          wrapped: WRAPPED,
        }),
      ).toEqual(hidden);
      expect(
        GridTimeFit.gridTimeFit({ available: 400, full: 0, icon: 0, end: 0, wrapped: 0 }),
      ).toEqual(hidden);
    });

    /**
     * A countdown folded into the time: "9:00 - 13:00 · in 4 days". Its words flow after the
     * time and break where the line runs out, as the weather row's chips do, so they cost the
     * time row nothing below the first rung. Its separator is glued to the time before it and
     * stays in every width: `DOT` is the separator with its margin, `WORDS` the words.
     *
     * Measured with the words in, the 102px block this was reported on wrapped a range that
     * fitted it, "9:00 AM / - 1:00 PM / · in 4 days", the dot leading a third line.
     */
    describe('with a countdown folded into the time', () => {
      const DOT = 11.34;
      const WORDS = 52.02;
      const COUNTDOWN = {
        full: FULL + DOT + WORDS,
        icon: ICON,
        end: END,
        words: WORDS,
        separator: DOT,
      };

      it('keeps the range on one line where only the countdown words would not fit', () => {
        expect(
          GridTimeFit.gridTimeFit({
            ...COUNTDOWN,
            available: START + END + DOT,
            wrapped: WRAPPED + DOT,
          }),
        ).toEqual({ time: true, icon: false, end: true, wrap: false });
      });

      it('draws the clock wherever it fits beside the time, the words flowing after it', () => {
        // The clock needs room beside the range and its separator, not beside the words,
        // which take the next line. Measured with the words in, rows with room for the clock
        // dropped it.
        const bare = START + END + DOT;
        for (const available of [bare + ICON, FULL + DOT + WORDS]) {
          expect(
            GridTimeFit.gridTimeFit({ ...COUNTDOWN, available, wrapped: WRAPPED + DOT }),
            String(available),
          ).toEqual({ time: true, icon: true, end: true, wrap: false });
        }
        expect(
          GridTimeFit.gridTimeFit({
            ...COUNTDOWN,
            available: bare + ICON - 0.1,
            wrapped: WRAPPED + DOT,
          }),
        ).toEqual({ time: true, icon: false, end: true, wrap: false });
      });

      it('gives up the clock once as the lane narrows, and never draws it again', () => {
        let drawn = false;
        let seen = false;
        for (let available = FULL + DOT + WORDS + 10; available > 0; available -= 0.25) {
          const { icon } = GridTimeFit.gridTimeFit({
            ...COUNTDOWN,
            available,
            wrapped: WRAPPED + DOT,
          });
          if (seen) expect(icon, String(available)).toBe(false);
          if (icon) drawn = true;
          else seen = true;
        }
        expect([drawn, seen]).toEqual([true, true]);
      });

      it('wraps only where the start time and its separator fit too', () => {
        // A wrap the block cannot afford falls back to the start time alone, which then
        // carries the separator. Here that is wider than either wrapped line. The words are
        // short enough to fit the lane, so the countdown stays.
        const start = START + DOT;
        const wrapped = start - 4;
        const short = { ...COUNTDOWN, full: FULL + DOT + 30, words: 30 };
        expect(GridTimeFit.gridTimeFit({ ...short, available: start - 0.5, wrapped })).toEqual({
          time: true,
          icon: false,
          end: true,
          wrap: true,
          countdown: false,
        });
        expect(GridTimeFit.gridTimeFit({ ...short, available: start, wrapped })).toEqual({
          time: true,
          icon: false,
          end: true,
          wrap: true,
        });
      });

      /**
       * Where the countdown's separator cannot follow even the start time, keeping the
       * countdown would cost the whole row, and v5.0.0 drew a three-line wrap with the dot
       * leading a line, or the dot past the block's edge. The time is drawn as it is without a
       * countdown: wrapped where the lane holds its wider line, else the start time alone.
       */
      it('leaves the countdown out rather than the time where its separator cannot follow it', () => {
        // Words short enough for the lane, so only the separator decides.
        const costs = { ...COUNTDOWN, full: FULL + DOT + 30, words: 30, wrapped: WRAPPED + DOT };
        const fit = (available: number) => GridTimeFit.gridTimeFit({ ...costs, available });
        expect(fit(START + DOT)).toEqual({ time: true, icon: false, end: false, wrap: false });
        expect(fit(START + DOT - 0.5)).toEqual({
          time: true,
          icon: false,
          end: true,
          wrap: true,
          countdown: false,
        });
        expect(fit(WRAPPED - 0.5)).toEqual({
          time: true,
          icon: false,
          end: false,
          wrap: false,
          countdown: false,
        });
        expect(fit(START - 0.5)).toEqual({ time: false, icon: false, end: false, wrap: false });
      });

      it('leaves the countdown out where its words are wider than the lane', () => {
        // No line holds them, so they would break across lines a block this narrow rarely has.
        const costs = { ...COUNTDOWN, wrapped: WRAPPED + DOT };
        expect(GridTimeFit.gridTimeFit({ ...costs, available: WORDS })).toEqual({
          time: true,
          icon: false,
          end: true,
          wrap: true,
        });
        expect(GridTimeFit.gridTimeFit({ ...costs, available: WORDS - 0.5 })).toEqual({
          time: true,
          icon: false,
          end: true,
          wrap: true,
          countdown: false,
        });
      });

      it('never brings the clock back by leaving the countdown out', () => {
        // Words just wider than a range with its clock: below them the separator is no longer
        // paid for, and the clock would fit beside the range again.
        const LONG = ICON + START + END + 5;
        const long = { ...COUNTDOWN, full: FULL + DOT + LONG, words: LONG, wrapped: WRAPPED + DOT };
        let seen = false;
        for (let available = FULL + DOT + LONG + 10; available > 0; available -= 0.25) {
          const fit = GridTimeFit.gridTimeFit({ ...long, available });
          if (seen) expect(fit.icon, String(available)).toBe(false);
          if (!fit.icon) seen = true;
        }
        expect(seen).toBe(true);
      });

      it('takes the words and the separator off what it measured, to leave the countdown out', () => {
        const rest = GridTimeFit.withoutCountdown({
          ...COUNTDOWN,
          available: 40,
          wrapped: WRAPPED + DOT,
        });
        expect(rest.full).toBeCloseTo(FULL, 6);
        expect(rest.wrapped).toBeCloseTo(WRAPPED, 6);
        expect([rest.words, rest.separator]).toEqual([0, 0]);
        // Where the start time is the wider wrapped line, it stays the wrapped width.
        const wide = GridTimeFit.withoutCountdown({ ...COUNTDOWN, available: 40, wrapped: START });
        expect(wide.wrapped).toBeCloseTo(START, 6);
        // No end time, nothing to wrap.
        expect(
          GridTimeFit.withoutCountdown({ ...COUNTDOWN, available: 40, wrapped: 0 }).wrapped,
        ).toBe(0);
      });

      it('takes the words off the full row only, never more than it measured', () => {
        expect(GridTimeFit.withoutCountdownWords(160, 52)).toBe(108);
        expect(GridTimeFit.withoutCountdownWords(80, 52, 45)).toBe(45);
        expect(GridTimeFit.withoutCountdownWords(110, 52, 45)).toBe(58);
      });
    });

    /**
     * What a block that cannot afford a spent line falls back to: rung 4, wherever that saves
     * the line. Reported on a one-hour block whose "6:30 PM · in 2 days" became "6:30 PM -
     * 7:30 PM ·" with its words on a second line the block had no room for, so the height pass
     * withdrew the whole row. Where no rung keeps the words on the time's line, the countdown
     * is left out instead, so its words never cost another row a line: reported in review on
     * narrow lanes where they took lines from the description.
     */
    describe('the fallback for a block that cannot afford the line', () => {
      const DOT = 11.34;
      const WORDS = 52.02;
      const COUNTDOWN = {
        full: FULL + DOT + WORDS,
        icon: ICON,
        end: END,
        words: WORDS,
        separator: DOT,
      };
      const START_ONLY = { time: true, icon: false, end: false, wrap: false };
      const fallback = (costs: Parameters<typeof GridTimeFit.gridTimeFit>[0]) =>
        GridTimeFit.gridTimeFallback(costs, GridTimeFit.gridTimeFit(costs));

      it('is the start time keeping its words, where they share its line', () => {
        const costs = { ...COUNTDOWN, available: START + DOT + WORDS, wrapped: WRAPPED + DOT };
        expect(GridTimeFit.gridTimeFit(costs)).toEqual({
          time: true,
          icon: false,
          end: true,
          wrap: false,
        });
        expect(fallback(costs)).toEqual(START_ONLY);
      });

      it("leaves the countdown out where no rung keeps its words on the time's line", () => {
        // The start time would need the same second line for its words, so dropping the end
        // time buys nothing; the countdown goes, and the range keeps its one line.
        const costs = { ...COUNTDOWN, available: START + END + DOT + 4, wrapped: WRAPPED + DOT };
        expect(GridTimeFit.gridTimeFit(costs)).toEqual({
          time: true,
          icon: false,
          end: true,
          wrap: false,
        });
        expect(fallback(costs)).toEqual({
          time: true,
          icon: false,
          end: true,
          wrap: false,
          countdown: false,
        });
      });

      it('withdraws a wrap onto the start time, which the wrap was granted only beside', () => {
        // With words that share the start time's line, the countdown stays.
        const brief = { ...COUNTDOWN, full: FULL + DOT + 10, words: 10 };
        const lane = START + DOT + 12;
        expect(
          GridTimeFit.gridTimeFit({ ...brief, available: lane, wrapped: WRAPPED + DOT }).wrap,
        ).toBe(true);
        expect(fallback({ ...brief, available: lane, wrapped: WRAPPED + DOT })).toEqual(START_ONLY);
        // With words that do not, it is left out.
        const short = { ...COUNTDOWN, full: FULL + DOT + 30, words: 30 };
        const wrapped = START + DOT - 4;
        expect(fallback({ ...short, available: START + DOT, wrapped })).toEqual({
          ...START_ONLY,
          countdown: false,
        });
      });

      it('withdraws a wrap without a countdown onto the start time alone, as rung 4 draws it', () => {
        expect(
          fallback({ available: WRAPPED, full: FULL, icon: ICON, end: END, wrapped: WRAPPED }),
        ).toEqual(START_ONLY);
        // Also where the countdown was left out to draw it.
        const costs = { ...COUNTDOWN, available: WORDS - 1, wrapped: WRAPPED + DOT };
        expect(GridTimeFit.gridTimeFit(costs).countdown).toBe(false);
        expect(fallback(costs)).toEqual({ ...START_ONLY, countdown: false });
      });

      it('gives up the clock before the words line, where the range keeps its words', () => {
        // The clock pushed the words down; without it they share the range's line.
        const costs = {
          ...COUNTDOWN,
          available: START + END + DOT + WORDS,
          wrapped: WRAPPED + DOT,
        };
        expect(GridTimeFit.gridTimeFit(costs).icon).toBe(true);
        expect(fallback(costs)).toEqual({ time: true, icon: false, end: true, wrap: false });
      });

      it('leaves the countdown out and keeps the clock, where no rung keeps the words beside it', () => {
        const long = { ...COUNTDOWN, full: FULL + DOT + 80, words: 80 };
        const costs = { ...long, available: ICON + START + END + DOT + 2, wrapped: WRAPPED + DOT };
        expect(GridTimeFit.gridTimeFit(costs).icon).toBe(true);
        expect(fallback(costs)).toEqual({
          time: true,
          icon: true,
          end: true,
          wrap: false,
          countdown: false,
        });
      });

      it('never draws a clock the row it falls back from did not', () => {
        // Without the separator a range needs less room beside the clock.
        const LONG = ICON + START + END + 5;
        const long = { ...COUNTDOWN, full: FULL + DOT + LONG, words: LONG, wrapped: WRAPPED + DOT };
        let checked = 0;
        for (let available = FULL + DOT + LONG + 10; available > 0; available -= 0.25) {
          const fit = GridTimeFit.gridTimeFit({ ...long, available });
          const back = GridTimeFit.gridTimeFallback({ ...long, available }, fit);
          if (back && !fit.icon) {
            expect(back.icon, String(available)).toBe(false);
            checked += 1;
          }
        }
        expect(checked).toBeGreaterThan(0);
      });

      it('is absent wherever no narrower rung would save a line', () => {
        const kept = [
          { ...COUNTDOWN, available: FULL + DOT + WORDS, wrapped: WRAPPED + DOT },
          {
            full: ICON + START + DOT + WORDS,
            icon: ICON,
            end: 0,
            words: WORDS,
            separator: DOT,
            available: ICON + START + DOT + WORDS,
            wrapped: 0,
          },
          { ...COUNTDOWN, available: 10, wrapped: WRAPPED + DOT },
          { ...COUNTDOWN, available: WRAPPED - 1, wrapped: WRAPPED + DOT },
          { available: FULL, full: FULL, icon: ICON, end: END, wrapped: WRAPPED },
          { available: START, full: FULL, icon: ICON, end: END, wrapped: WRAPPED },
        ];
        for (const costs of kept) expect(fallback(costs), JSON.stringify(costs)).toBeNull();
      });
    });
  });

  describe('the markup it acts on', () => {
    it('draws the end time as its own element in grid', () => {
      const container = renderGrid([timed('10:00', '12:00', 'QA Window')], gridConfig());
      const row = container.querySelector('.grid-event-disclosure .time-actual');

      expect(row?.textContent?.trim()).toBe('10:00 - 12:00');
      expect(row?.querySelector('.time-end')?.textContent).toBe(' - 12:00');
    });

    it('draws no end element when no end time is shown', () => {
      const container = renderGrid(
        [timed('10:00', '12:00', 'QA Window')],
        gridConfig({ show_end_time: false }),
      );
      const row = container.querySelector('.grid-event-disclosure .time-actual');

      expect(row?.textContent?.trim()).toBe('10:00');
      expect(row?.querySelector('.time-end')).toBeNull();
    });

    /**
     * The split is grid-only on the merits, not for a quiet snapshot. A list row has no
     * bottom edge standing in for the end time, so there the end is not droppable and the
     * element would be dead weight.
     */
    it('leaves the other views with one text node', () => {
      // The fake clock stands inside this event, so the "Now" label would join the row's
      // text; it is a sibling of the time, not part of it, and this test is about the time.
      const config = buildConfig({
        view: 'list',
        days_to_show: 1,
        time_24h: true,
        show_now_indicator: false,
      });
      const event = timed('10:00', '12:00', 'QA Window');
      const parts = FormatUtils.formatEventTimeParts(event, config, 'en');
      const container = document.createElement('div');
      litRender(
        Render.renderGroupedEvents(
          EventUtils.groupEventsByDay([event], config, false, 'en', 'list'),
          ViewConfig.resolveEffectiveConfig(config, 'list'),
          'en',
        ),
        container,
      );

      expect(parts.end).toBe(' - 12:00');
      expect(parts.text).toBe(`10:00${parts.end}`);
      expect(container.querySelector('.time-actual')?.textContent?.trim()).toBe('10:00 - 12:00');
      expect(container.querySelector('.time-end')).toBeNull();
    });
  });

  describe('what the formatter calls droppable', () => {
    it('offers the end time of a single-day timed event', () => {
      const parts = FormatUtils.formatEventTimeParts(
        timed('10:00', '12:00', 'Standup'),
        gridConfig(),
        'en',
      );

      expect(parts.end).toBe(' - 12:00');
    });

    it('offers nothing when the end time is already not drawn', () => {
      const parts = FormatUtils.formatEventTimeParts(
        timed('10:00', '12:00', 'Standup'),
        gridConfig({ show_end_time: false }),
        'en',
      );

      expect(parts).toEqual({ text: '10:00' });
    });

    /**
     * A multi-day phrase looks equally droppable and is not: it is a sentence about days
     * this block does not cover, so no edge of the block redraws what cutting it would
     * remove. `formatMultiDayTime` writes the whole thing as one phrase for that reason.
     */
    it('offers nothing on a multi-day phrase', () => {
      const parts = FormatUtils.formatEventTimeParts(
        {
          start: { dateTime: new Date(2026, 5, 17, 10).toISOString() },
          end: { dateTime: new Date(2026, 5, 19, 14).toISOString() },
          summary: 'Conference',
          _entityId: 'calendar.personal',
        },
        gridConfig(),
        'en',
      );

      expect(parts.end).toBeUndefined();
      expect(parts.text).toContain('Jun 19');
    });

    it('offers nothing on an all-day event', () => {
      const parts = FormatUtils.formatEventTimeParts(
        {
          start: { date: '2026-06-17' },
          end: { date: '2026-06-18' },
          summary: 'Public Holiday',
          _entityId: 'calendar.personal',
        },
        gridConfig(),
        'en',
      );

      expect(parts.end).toBeUndefined();
    });
  });

  describe('the DOM it drives', () => {
    /**
     * A block whose geometry is stubbed, because happy-dom lays nothing out.
     *
     * The stubs are the measured widths of the reported card: a 45.9px lane holding a row
     * that needs 86.98px. Only the four numbers the adapter reads are faked, so everything
     * between the read and the class — the selectors, the reveal, the restore — is the real
     * code path.
     */
    function block(available: number, { withEnd = true, withIcon = true } = {}): HTMLElement {
      const el = document.createElement('div');
      el.className = 'grid-event';
      el.innerHTML = `
        <div class="grid-event-disclosure">
          <div class="time"><div class="time-actual">
            ${withIcon ? '<ha-icon icon="mdi:clock-outline"></ha-icon>' : ''}
            <span>10:00${withEnd ? '<span class="time-end"> - 12:00</span>' : ''}</span>
          </div></div>
        </div>`;

      const time = el.querySelector<HTMLElement>('.time')!;
      Object.defineProperty(time, 'clientWidth', { get: () => available });
      time.getBoundingClientRect = () => ({ width: ICON + START + (withEnd ? END : 0) }) as DOMRect;

      const icon = el.querySelector<HTMLElement>('ha-icon');
      // The whole 18px in the box, because happy-dom has no stylesheet and so reports no
      // margin. The adapter adds the margin in a browser; here there is none to add.
      if (icon) icon.getBoundingClientRect = () => ({ width: ICON }) as DOMRect;
      const end = el.querySelector<HTMLElement>('.time-end');
      if (end) end.getBoundingClientRect = () => ({ width: END }) as DOMRect;

      return el;
    }

    /** The three phased passes the host runs, in the order it runs them. */
    function fit(el: HTMLElement): string[] {
      const target = GridTimeFit.gridTimeTarget(el)!;
      GridTimeFit.prepareGridTimeMeasurement(target);
      const available = GridTimeFit.measureGridTimeAvailable(target);
      GridTimeFit.releaseGridTimeWidth(target);
      const costs = GridTimeFit.measureGridTimeCosts(target, available);
      GridTimeFit.applyGridTimeFit(target, GridTimeFit.gridTimeFit(costs));
      return [...el.querySelector('.grid-event-disclosure')!.classList];
    }

    it('reveals a full row where the block is wide enough for one', () => {
      expect(fit(block(124.6))).toEqual(['grid-event-disclosure', 'grid-time-fits']);
    });

    it('drops the icon first', () => {
      expect(fit(block(72.9))).toEqual([
        'grid-event-disclosure',
        'grid-time-fits',
        'grid-time-no-icon',
      ]);
    });

    it('drops the end time next, and keeps the start', () => {
      expect(fit(block(45.9))).toEqual([
        'grid-event-disclosure',
        'grid-time-fits',
        'grid-time-no-icon',
        'grid-time-no-end',
      ]);
    });

    it('sets nothing at all where not even a start time fits', () => {
      expect(fit(block(29.2))).toEqual(['grid-event-disclosure']);
    });

    /**
     * The reason the gate is positive. The compact clamp rides the same rung as the reveal,
     * so a negative gate would have to restore the medium clamp to undo itself; a positive
     * one leaves a row that fits nothing exactly where the stylesheet left it.
     */
    it('leaves no inline style behind either way', () => {
      for (const available of [124.6, 29.2]) {
        const el = block(available);
        fit(el);

        expect(el.querySelector<HTMLElement>('.time')!.getAttribute('style') ?? '').toBe('');
      }
    });

    it('clears a previous decision before measuring again', () => {
      const el = block(124.6);
      const disclosure = el.querySelector('.grid-event-disclosure')!;
      disclosure.classList.add('grid-time-no-icon', 'grid-time-no-end', 'grid-time-fits');

      expect(fit(el)).toEqual(['grid-event-disclosure', 'grid-time-fits']);
    });

    /**
     * With nothing to drop, the ladder skips the rung that would drop it. No `no-end` class
     * is set, because there is no end element for it to hide and setting it anyway would
     * make the classes claim a degradation that never happened.
     */
    it('reads no end element where none is drawn', () => {
      const el = block(45.9, { withEnd: false });

      expect(GridTimeFit.gridTimeTarget(el)?.end).toBeNull();
      expect(fit(el)).toEqual(['grid-event-disclosure', 'grid-time-fits', 'grid-time-no-icon']);
    });

    /**
     * 🚨 The reconciliation that a live probe had to find, because no unit test could.
     *
     * Every other test here hands `wrapped` to `gridTimeFit` as a number, so the shape that
     * number is read from is never built and its correctness is never asserted. It was
     * wrong: the open added only `grid-time-wrap`, leaving the icon in the flex row, so the
     * measurement priced `icon + wrapped range` — the one shape the ladder deliberately has
     * no rung for. On the reported block that reads 54.14 against a 46px lane and the rung
     * silently never fires, while all 25 unit tests stay green.
     *
     * Derived from the decision rather than listed, so it fails if either side moves: the
     * measurement shape must be exactly the painted shape less `grid-time-fits`, which is a
     * reveal rather than a shape. A second assertion pins the settle, because a class left
     * behind by the measurement is a measurement shape that paints.
     */
    it('measures the wrapped row in the shape it will paint it in', () => {
      const el = block(45.9);
      const target = GridTimeFit.gridTimeTarget(el)!;
      const disclosure = el.querySelector('.grid-event-disclosure')!;

      GridTimeFit.prepareGridTimeMeasurement(target);
      GridTimeFit.openGridTimeWrapMeasurement(target);
      const measured = [...disclosure.classList].filter((name) => name.startsWith('grid-time-'));
      GridTimeFit.settleGridTimeWrapMeasurement(target);
      const settled = [...disclosure.classList].filter((name) => name.startsWith('grid-time-'));

      GridTimeFit.applyGridTimeFit(
        target,
        GridTimeFit.gridTimeFit({
          available: 45.9,
          full: ICON + START + END,
          icon: ICON,
          end: END,
          wrapped: WRAPPED,
        }),
      );
      const painted = [...disclosure.classList].filter(
        (name) => name.startsWith('grid-time-') && name !== 'grid-time-fits',
      );

      expect(painted).toContain('grid-time-wrap');
      expect([...measured].sort()).toEqual([...painted].sort());
      expect(settled).toEqual([]);
    });

    /**
     * The words come off what the ladder reads, the separator does not. happy-dom lays nothing
     * out, so ranges are stubbed to measure their own text at 6px a character, and the row at
     * a fixed width: what is real is which text each range covers.
     */
    it('leaves a folded countdown words out of the widths it reads', () => {
      const el = document.createElement('div');
      el.className = 'grid-event';
      el.innerHTML = `
        <div class="grid-event-disclosure">
          <div class="time"><div class="time-actual">
            <span class="time-text"><span>9:00<span class="time-end"> - 13:00</span></span><span class="time-countdown">in 4 days</span></span>
          </div></div>
        </div>`;
      const time = el.querySelector<HTMLElement>('.time')!;
      Object.defineProperty(time, 'clientWidth', { get: () => 100 });
      const ROW = 160;
      time.getBoundingClientRect = () => ({ left: 0, right: ROW, width: ROW }) as DOMRect;
      const end = el.querySelector<HTMLElement>('.time-end')!;
      end.getBoundingClientRect = () => ({ width: 48 }) as DOMRect;
      const rangeRect = vi
        .spyOn(Range.prototype, 'getBoundingClientRect')
        .mockImplementation(function (this: Range) {
          const width = this.toString().length * 6;
          return { left: 0, right: width, width } as DOMRect;
        });

      const target = GridTimeFit.gridTimeTarget(el)!;
      expect(target.countdown?.textContent).toBe('in 4 days');
      const costs = GridTimeFit.measureGridTimeCosts(target, 100);
      expect(costs.full).toBe(ROW);
      expect(costs.words).toBe('in 4 days'.length * 6);
      // In the wrapped shape the countdown ends the second line, where the row ends.
      target.countdown!.getClientRects = () =>
        [{ left: ROW - 64, right: ROW, width: 64 }] as unknown as DOMRectList;
      // The wrapped row is the wider of "9:00" and the second line less the words.
      expect(GridTimeFit.measureGridTimeWrapped(target)).toBe(ROW - 'in 4 days'.length * 6);
      rangeRect.mockRestore();
    });

    /**
     * The row keeps room at its inline edges, padding given back by a negative margin ("Marks
     * above and below the line" in styles.ts), so its border box and clientWidth are wider than
     * the space its text has. Every width and edge is read off its content box, so the same row
     * with and without that room measures the same.
     */
    it.each([
      ['with a folded countdown', '<span class="time-countdown">in 4 days</span>', 160],
      [
        'whose countdown line is shorter than its first',
        '<span class="time-countdown">in 4 days</span>',
        60,
      ],
      ['without a countdown', '', 160],
    ])(
      'reads the row by its content box, not the room at its inline edges, %s',
      (_, countdown, end) => {
        const measure = (room: number) => {
          const el = document.createElement('div');
          el.className = 'grid-event';
          el.innerHTML = `
        <div class="grid-event-disclosure">
          <div class="time"><div class="time-actual">
            <span class="time-text"><span>9:00<span class="time-end"> - 13:00</span></span>${countdown}</span>
          </div></div>
        </div>`;
          const time = el.querySelector<HTMLElement>('.time')!;
          time.style.paddingLeft = `${room}px`;
          time.style.paddingRight = `${room}px`;
          Object.defineProperty(time, 'clientWidth', { get: () => 100 + 2 * room });
          const ROW = 160;
          time.getBoundingClientRect = () =>
            ({ left: -room, right: ROW + room, width: ROW + 2 * room }) as DOMRect;
          const line = el.querySelector<HTMLElement>('.time-countdown');
          if (line) {
            line.getClientRects = () =>
              [{ left: end - 64, right: end, width: 64 }] as unknown as DOMRectList;
          }
          const rangeRect = vi
            .spyOn(Range.prototype, 'getBoundingClientRect')
            .mockImplementation(function (this: Range) {
              const width = this.toString().length * 6;
              return { left: 0, right: width, width } as DOMRect;
            });
          // Attached, so its padding is read from a computed style.
          document.body.append(el);
          try {
            const target = GridTimeFit.gridTimeTarget(el)!;
            return {
              available: GridTimeFit.measureGridTimeAvailable(target),
              full: GridTimeFit.measureGridTimeCosts(target, 100).full,
              wrapped: GridTimeFit.measureGridTimeWrapped(target),
            };
          } finally {
            rangeRect.mockRestore();
            el.remove();
          }
        };

        expect(measure(1.5)).toEqual(measure(0));
        expect(measure(0).available).toBe(100);
        expect(measure(0).full).toBe(160);
      },
    );

    /**
     * Firefox sizes a row whose end time follows a generated line break one space wider than any
     * line it draws: the space the end time leads with, which the line itself drops (2.98px in
     * Roboto at 12px). Read off the row, that space priced the wrapped rung out of lanes it fits.
     * The second line is read off the countdown's own box instead, in either direction.
     */
    it.each(['ltr', 'rtl'])(
      "reads the countdown's line off its box, not the row's width (%s)",
      (dir) => {
        const el = document.createElement('div');
        el.className = 'grid-event';
        el.innerHTML = `
        <div class="grid-event-disclosure">
          <div class="time"><div class="time-actual">
            <span class="time-text"><span>9:00<span class="time-end"> - 13:00</span></span><span class="time-countdown">in 4 days</span></span>
          </div></div>
        </div>`;
        const time = el.querySelector<HTMLElement>('.time')!;
        const realStyle = window.getComputedStyle.bind(window);
        const direction = vi
          .spyOn(window, 'getComputedStyle')
          .mockImplementation((element, pseudo) => {
            const style = realStyle(element, pseudo);
            return element === time ? ({ ...style, direction: dir } as CSSStyleDeclaration) : style;
          });
        const LINE = 160;
        const PHANTOM = 3;
        // The row, as Firefox sizes it at max-content: one space wider than its second line.
        time.getBoundingClientRect = () =>
          ({ left: 100, right: 100 + LINE + PHANTOM, width: LINE + PHANTOM }) as DOMRect;
        const countdown = el.querySelector<HTMLElement>('.time-countdown')!;
        countdown.getClientRects = () =>
          (dir === 'rtl'
            ? [{ left: 100 + PHANTOM, right: 100 + PHANTOM + 64, width: 64 }]
            : [{ left: 100 + LINE - 64, right: 100 + LINE, width: 64 }]) as unknown as DOMRectList;
        const rangeRect = vi
          .spyOn(Range.prototype, 'getBoundingClientRect')
          .mockImplementation(function (this: Range) {
            const width = this.toString().length * 6;
            return dir === 'rtl'
              ? ({
                  left: 100 + LINE + PHANTOM - width,
                  right: 100 + LINE + PHANTOM,
                  width,
                } as DOMRect)
              : ({ left: 100, right: 100 + width, width } as DOMRect);
          });

        try {
          const target = GridTimeFit.gridTimeTarget(el)!;
          expect(GridTimeFit.measureGridTimeWrapped(target)).toBe(LINE - 'in 4 days'.length * 6);
        } finally {
          rangeRect.mockRestore();
          direction.mockRestore();
        }
      },
    );

    /**
     * The separator is the countdown's box less its words, read while the row is one unbroken
     * line; leaving the countdown out takes both off. The class that hides it is one the next
     * measurement clears, so the countdown is measured again on every pass.
     */
    it('reads the separator, and leaves out a countdown whose separator cannot follow the time', () => {
      const el = document.createElement('div');
      el.className = 'grid-event';
      el.innerHTML = `
        <div class="grid-event-disclosure">
          <div class="time"><div class="time-actual">
            <span class="time-text"><span>9:00<span class="time-end"> - 13:00</span></span><span class="time-countdown">in 4 days</span></span>
          </div></div>
        </div>`;
      const time = el.querySelector<HTMLElement>('.time')!;
      Object.defineProperty(time, 'clientWidth', { get: () => 50 });
      time.getBoundingClientRect = () => ({ left: 0, right: 160, width: 160 }) as DOMRect;
      el.querySelector<HTMLElement>('.time-end')!.getBoundingClientRect = () =>
        ({ width: 48 }) as DOMRect;
      el.querySelector<HTMLElement>('.time-countdown')!.getBoundingClientRect = () =>
        ({ width: 11 + 'in 4 days'.length * 6 }) as DOMRect;
      const rangeRect = vi
        .spyOn(Range.prototype, 'getBoundingClientRect')
        .mockImplementation(function (this: Range) {
          const width = this.toString().length * 6;
          return { left: 0, right: width, width } as DOMRect;
        });

      const target = GridTimeFit.gridTimeTarget(el)!;
      const disclosure = el.querySelector('.grid-event-disclosure')!;
      const costs = GridTimeFit.measureGridTimeCosts(target, 50);
      expect(costs.separator).toBe(11);
      // "9:00 ·" needs 58, "9:00" alone 47: the countdown goes and the start time stays.
      GridTimeFit.applyGridTimeFit(target, GridTimeFit.gridTimeFit(costs));
      expect([...disclosure.classList]).toEqual([
        'grid-event-disclosure',
        'grid-time-fits',
        'grid-time-no-icon',
        'grid-time-no-end',
        'grid-time-no-countdown',
      ]);
      GridTimeFit.prepareGridTimeMeasurement(target);
      expect([...disclosure.classList]).toEqual(['grid-event-disclosure']);
      rangeRect.mockRestore();
    });

    it('reads no countdown where none is folded into the time', () => {
      const el = document.createElement('div');
      el.innerHTML = `
        <div class="grid-event-disclosure">
          <div class="time"><div class="time-actual"><span>9:00</span></div>
          <div class="time-countdown">in 4 days</div></div>
        </div>`;

      expect(GridTimeFit.gridTimeTarget(el)?.countdown).toBeNull();
    });

    it('ignores a block with no time row rather than throwing', () => {
      const el = document.createElement('div');
      el.innerHTML = '<div class="grid-event-disclosure"></div>';

      expect(GridTimeFit.gridTimeTarget(el)).toBeNull();
    });
  });
});
