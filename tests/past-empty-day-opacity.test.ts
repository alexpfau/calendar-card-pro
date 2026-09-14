import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as View from '../src/config/view';
import * as Column from '../src/rendering/column';
import * as Grid from '../src/rendering/grid';
import * as Presentation from '../src/rendering/presentation';
import * as Render from '../src/rendering/render';
import * as Localize from '../src/translations/localize';
import * as Events from '../src/utils/events';

/**
 * Past empty-day notices dim like finished events.
 *
 * A List/Column empty-day notice is a placeholder the card invents for a day with
 * nothing on it. Until this was added, every placeholder was classified non-past
 * however old its date was, so a finished Monday's "No events" stayed at full
 * strength beside a finished meeting dimmed to 37.5%. The observation was made
 * against a real Home Assistant card; the mechanism is that `buildEventPresentation`
 * ran all past classification inside `if (!isEmptyDay)`.
 *
 * ## Why this is not simply the guard deleted
 *
 * The obvious fix — drop `!isEmptyDay` and let a placeholder fall through the
 * existing all-day branch — is wrong, and wrong in the direction that shows. That
 * branch subtracts a day from the all-day end date because a real all-day event's
 * `end.date` is *exclusive*: an event on the 17th ends `2026-06-18`, and only
 * `end - 1 day` names the last day it occupies.
 *
 * A placeholder has no interval. `groupEventsByDay` builds it with
 * `start.date === end.date ===` its own displayed date, so the subtraction names the
 * day *before* the one on screen, and `today > that` is true for today's own notice.
 * The naive fix therefore dims today all day long — the single most visible thing
 * this change could get wrong.
 *
 * `dims neither today's nor a future notice` below is the counterexample, and it is
 * load-bearing in both directions: it passed before this feature existed (everything
 * was non-past) and it passes after the fix, but it fails the moment anyone
 * "simplifies" the empty-date branch into the real-event one. Reverting
 * `presentation.ts` to a bare guard deletion turns it red while the
 * past-notice assertions stay green, which is exactly the pair that localizes the
 * mistake.
 */

/**
 * The notice an empty day draws with no `empty_day_text` set: the localized default with
 * the renderer's own checkmark in front of it.
 *
 * Resolved through `getTranslations` rather than written out, because the literal belongs
 * to `tests/empty-day-translations.test.ts`, which pins all 35 languages by value. Pinning
 * it here as well would duplicate that gate into a file whose subject is the past class,
 * and would make an intentional wording change fail in two places for one reason.
 */
const DEFAULT_NOTICE = `\u2713 ${Localize.getTranslations('en').noEvents}`;

/** Local midnight `2026-06-17` under the suite's UTC pin — the day `FROZEN_NOW` falls in. */
const TODAY = '2026-06-17';

/**
 * A fixed seven-day window, three days behind today and three ahead.
 *
 * Written as an explicit date rather than a relative `-3`, because the displayed date
 * is independent of `start_date` syntax and a literal window makes each assertion name
 * the day it is about.
 */
const WINDOW_START = '2026-06-14';

/**
 * Real events, so this is never an empty-only corpus.
 *
 * A probe that renders nothing but placeholders cannot tell "past classification
 * works" from "nothing is classified at all", so both controls are required and both
 * are asserted on every case below:
 *
 * | Fixture              | Control it supplies                                  |
 * | -------------------- | ---------------------------------------------------- |
 * | `Finished exhibition`| a real all-day event that HAS ended — must stay past  |
 * | `Delivery window`    | a real timed event that has NOT — must stay non-past  |
 *
 * They sit on the window's first and last day, leaving 06-15 through 06-19 free for
 * placeholders, which is what puts a past, a today and a future notice on screen at once.
 */
const REAL_EVENTS: Types.CalendarEventData[] = [
  {
    summary: 'Finished exhibition',
    start: { date: '2026-06-14' },
    end: { date: '2026-06-15' },
    _entityId: 'calendar.anna',
  },
  {
    summary: 'Delivery window',
    start: { dateTime: '2026-06-20T10:00:00.000Z' },
    end: { dateTime: '2026-06-20T10:30:00.000Z' },
    _entityId: 'calendar.anna',
  },
];

function baseConfig(overrides: Partial<Types.Config> = {}): Types.Config {
  return buildConfig({
    entities: ['calendar.anna'],
    start_date: WINDOW_START,
    days_to_show: 7,
    show_empty_days: true,
    show_past_events: true,
    ...overrides,
  } as Partial<Types.Config>);
}

type ListOrColumn = Extract<Types.EffectiveView, 'list' | 'column'>;

/** The two views that draw an empty-day notice at all. Grid deliberately draws none. */
const NOTICE_VIEWS: ListOrColumn[] = ['list', 'column'];

function group(config: Types.Config, view: Types.EffectiveView, events = REAL_EVENTS) {
  return Events.groupEventsByDay(events, config, false, 'en', view);
}

function renderView(
  config: Types.Config,
  view: Types.EffectiveView,
  events = REAL_EVENTS,
): HTMLElement {
  const days = group(config, view, events);
  const effective = View.resolveEffectiveConfig(config, view);
  const container = document.createElement('div');
  litRender(
    view === 'grid'
      ? Grid.renderGridGroupedEvents(days, effective, 'en', undefined, null, FROZEN_NOW)
      : view === 'column'
        ? Column.renderColumnGroupedEvents(days, effective, 'en', undefined, null)
        : Render.renderGroupedEvents(days, effective, 'en', undefined, null),
    container,
  );
  return container;
}

/**
 * Every rendered empty-day notice, in document order, as its text paired with whether
 * its own event box carries `.past-event`.
 *
 * Deliberately a list rather than a map keyed by text: the default message is identical
 * on every empty day, so keying by text collapses five notices into one and a window
 * that silently stopped emitting four of them would still read as correct.
 */
function notices(container: HTMLElement): Array<{ text: string; past: boolean }> {
  return [...container.querySelectorAll('.empty-day-title')].map((title) => {
    const box = title.closest('.event');
    return {
      text: title.textContent?.trim() ?? '',
      past: box?.classList.contains('past-event') ?? false,
    };
  });
}

/** The distinct messages drawn across every empty-day notice. */
function noticeTexts(container: HTMLElement): string[] {
  return [...new Set(notices(container).map((notice) => notice.text))];
}

/** The notice drawn for one date, identified by that day's rendered date number. */
function noticeForDay(container: HTMLElement, dayNumber: number): Element | null {
  for (const title of container.querySelectorAll('.empty-day-title')) {
    const scope = title.closest('tr') ?? title.closest('.day-column');
    if (scope?.querySelector('.day')?.textContent?.trim() === String(dayNumber)) {
      return title.closest('.event');
    }
  }
  return null;
}

/** Whether a real event's box, found by its summary text, is classified past. */
function realEventIsPast(container: HTMLElement, summary: string): boolean {
  for (const box of container.querySelectorAll('.event, .grid-event, .grid-banner')) {
    if (box.textContent?.includes(summary)) return box.classList.contains('past-event');
  }
  throw new Error(`no rendered box contains "${summary}"`);
}

describe('past empty-day notices', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  describe.each(NOTICE_VIEWS)('%s view', (view) => {
    it('emits a past, a today and a future notice, so the corpus is not degenerate', () => {
      const container = renderView(baseConfig(), view);

      // 06-15 and 06-16 are behind today, 06-17 is today, 06-18 and 06-19 ahead.
      for (const day of [15, 16, 17, 18, 19]) {
        expect(noticeForDay(container, day), `no notice drawn for June ${day}`).not.toBeNull();
      }
      expect(notices(container)).toHaveLength(5);
    });

    it('dims a notice whose local date has already ended', () => {
      const container = renderView(baseConfig(), view);

      expect(noticeForDay(container, 15)!.classList.contains('past-event')).toBe(true);
      expect(noticeForDay(container, 16)!.classList.contains('past-event')).toBe(true);
    });

    /**
     * The counterexample. See this file's header: a bare `!isEmptyDay` deletion makes
     * both of these true, because a placeholder's equal start/end run through the real
     * all-day exclusive-end subtraction.
     */
    it("dims neither today's nor a future notice", () => {
      const container = renderView(baseConfig(), view);

      expect(noticeForDay(container, 17)!.classList.contains('past-event')).toBe(false);
      expect(noticeForDay(container, 18)!.classList.contains('past-event')).toBe(false);
      expect(noticeForDay(container, 19)!.classList.contains('past-event')).toBe(false);
    });

    it('leaves real-event classification exactly as it was', () => {
      const container = renderView(baseConfig(), view);

      expect(realEventIsPast(container, 'Finished exhibition')).toBe(true);
      expect(realEventIsPast(container, 'Delivery window')).toBe(false);
    });
  });

  /**
   * Today stays bright for the whole of today, and becomes eligible only once the local
   * date has actually ended. No midnight timer is added, so this asserts the classification
   * a repaint would reach, not that a repaint is scheduled.
   */
  describe('the boundary is local midnight, not a rolling 24 hours', () => {
    const placeholder: Types.CalendarEventData = {
      summary: 'No events',
      start: { date: TODAY },
      end: { date: TODAY },
      _entityId: '_empty_day_',
      _isEmptyDay: true,
      location: '',
    };

    function classifyAt(instant: Date): boolean {
      vi.setSystemTime(instant);
      return Presentation.buildEventPresentation(placeholder, baseConfig(), 'en').isPastEvent;
    }

    it.each([
      ['its first millisecond', '2026-06-17T00:00:00.000Z'],
      ['noon', '2026-06-17T12:00:00.000Z'],
      ['its last millisecond', '2026-06-17T23:59:59.999Z'],
    ])('stays bright at %s', (_label, instant) => {
      expect(classifyAt(new Date(instant))).toBe(false);
    });

    it.each([
      ['the next local midnight', '2026-06-18T00:00:00.000Z'],
      ['a millisecond later', '2026-06-18T00:00:00.001Z'],
      ['a week later', '2026-06-24T09:00:00.000Z'],
    ])('dims from %s', (_label, instant) => {
      expect(classifyAt(new Date(instant))).toBe(true);
    });

    it('never dims a future date', () => {
      const future = { ...placeholder, start: { date: '2026-06-18' }, end: { date: '2026-06-18' } };
      vi.setSystemTime(FROZEN_NOW);
      expect(Presentation.buildEventPresentation(future, baseConfig(), 'en').isPastEvent).toBe(
        false,
      );
    });
  });

  /**
   * Presentation is not visibility. `show_past_events: false` governs which *real*
   * events are eligible; the empty-day pass then runs afterwards and can legitimately
   * synthesize a notice on a date that has already ended. Every displayed past-date
   * notice follows the same rule, so there is no second dimming gate to disagree with
   * the first.
   */
  describe.each(NOTICE_VIEWS)('%s with show_past_events off', (view) => {
    it('still dims a past notice synthesized after the real events were filtered out', () => {
      const container = renderView(baseConfig({ show_past_events: false }), view);

      const past = noticeForDay(container, 15);
      expect(past, 'no notice synthesized for the filtered past day').not.toBeNull();
      expect(past!.classList.contains('past-event')).toBe(true);
      expect(noticeForDay(container, 17)!.classList.contains('past-event')).toBe(false);
    });

    it('drops the real past event while keeping the real future one', () => {
      const container = renderView(baseConfig({ show_past_events: false }), view);

      expect(container.textContent).not.toContain('Finished exhibition');
      expect(container.textContent).toContain('Delivery window');
    });
  });

  /**
   * `allday_expires_at` moves the instant a real all-day event becomes past *within* its
   * final day. A placeholder is not an all-day event and has no such instant, so an early
   * expiry must not reach back and dim today's notice.
   */
  describe.each(NOTICE_VIEWS)('%s with an early all-day expiry', (view) => {
    it("does not dim today's notice", () => {
      const config = baseConfig({
        entities: [{ entity: 'calendar.anna', allday_expires_at: '00:01' }],
      } as Partial<Types.Config>);
      const container = renderView(config, view);

      expect(noticeForDay(container, 17)!.classList.contains('past-event')).toBe(false);
      expect(noticeForDay(container, 15)!.classList.contains('past-event')).toBe(true);
    });
  });

  /**
   * The class is the whole change. Which *alpha* that class resolves to is the existing
   * `--calendar-card-past-event-opacity` layer, already covered by
   * `past-event-opacity.test.ts` — so what matters here is that classification does not
   * quietly depend on the configured value. At 100 the notice is still classified past
   * and simply renders at full strength, exactly as a finished event does.
   */
  describe.each(NOTICE_VIEWS)('%s classification is independent of the value', (view) => {
    it.each([0, 1, 37.5, 60, 75.5, 100])('classifies identically at %s', (opacity) => {
      const container = renderView(baseConfig({ past_event_opacity: opacity }), view);

      expect(noticeForDay(container, 15)!.classList.contains('past-event')).toBe(true);
      expect(noticeForDay(container, 17)!.classList.contains('past-event')).toBe(false);
    });

    it('is byte-identical across every value once text is held constant', () => {
      const baseline = renderView(baseConfig({ past_event_opacity: 60 }), view).innerHTML;
      for (const opacity of [0, 1, 37.5, 75.5, 100]) {
        expect(renderView(baseConfig({ past_event_opacity: opacity }), view).innerHTML).toBe(
          baseline,
        );
      }
    });
  });

  /**
   * Root, per-view and the List fallback each resolve their own effective opacity, and a
   * notice must be classified the same way under all of them — the class does not depend
   * on which scope supplied the number.
   */
  describe('opacity scope does not change classification', () => {
    it.each(NOTICE_VIEWS)('classifies the same at root and in the %s block', (view) => {
      const block = View.OVERRIDE_BLOCK_BY_VIEW[view]!;
      const scoped = baseConfig({
        past_event_opacity: 100,
        [block]: { past_event_opacity: 0 },
      } as Partial<Types.Config>);

      expect(View.resolveEffectiveConfig(scoped, view).past_event_opacity).toBe(0);

      const container = renderView(scoped, view);
      expect(noticeForDay(container, 15)!.classList.contains('past-event')).toBe(true);
      expect(noticeForDay(container, 17)!.classList.contains('past-event')).toBe(false);
    });

    /**
     * A narrow Column or Grid card falls back to List, and the fallback uses *List's*
     * effective options. The positive control is the second assertion: if the helper
     * silently rendered List in both arms the two would agree trivially, so the
     * requested view's own block is given a different value and shown to win when that
     * view is actually drawn.
     */
    it('uses List options when a width-starved view falls back to List', () => {
      const config = baseConfig({
        view: 'column',
        list: { past_event_opacity: 37.5 },
        column: { past_event_opacity: 0 },
      } as Partial<Types.Config>);

      expect(View.resolveEffectiveConfig(config, 'list').past_event_opacity).toBe(37.5);
      expect(View.resolveEffectiveConfig(config, 'column').past_event_opacity).toBe(0);

      const fellBack = renderView(config, 'list');
      expect(noticeForDay(fellBack, 15)!.classList.contains('past-event')).toBe(true);
      expect(noticeForDay(fellBack, 17)!.classList.contains('past-event')).toBe(false);
    });
  });

  /**
   * Custom text changes what the notice says, never whether it dims. The decision is
   * truthiness, not trimming: a whitespace-only message is an authored message that
   * happens to look blank, and it must dim on a past date like any other.
   */
  describe.each(NOTICE_VIEWS)('%s custom empty-day text', (view) => {
    it.each([
      ['an ordinary custom message', 'Leftovers'],
      ['a message equal to the former default', 'No upcoming events'],
      ['a whitespace-only message', '   '],
      ['punctuation only', '—'],
      ['an emoji', '🌤'],
      ['escaped HTML-like text', '<b>nothing</b>'],
      ['a message with its own checkmark', '✓ all clear'],
    ])('dims a past date and not today with %s', (_label, text) => {
      const container = renderView(baseConfig({ empty_day_text: text }), view);

      expect(noticeForDay(container, 15)!.classList.contains('past-event')).toBe(true);
      expect(noticeForDay(container, 17)!.classList.contains('past-event')).toBe(false);
    });

    it('never prepends the renderer checkmark to an authored message', () => {
      const drawn = noticeTexts(renderView(baseConfig({ empty_day_text: 'Leftovers' }), view));

      expect(drawn).toEqual(['Leftovers']);
      expect(drawn.some((text) => text.startsWith('✓'))).toBe(false);
    });

    it('keeps the renderer checkmark on the localized default, dimmed included', () => {
      const container = renderView(baseConfig(), view);

      expect(noticeTexts(container)).toEqual([DEFAULT_NOTICE]);
      // The mark belongs to the renderer, not the translation, and the whole notice —
      // mark included — sits inside the one `.event-content` the opacity rule selects.
      expect(noticeForDay(container, 15)!.querySelector('.event-content')).not.toBeNull();
    });

    it.each([
      ['undefined', undefined],
      ['an empty string', ''],
    ])('falls back to the localized default for %s', (_label, text) => {
      const container = renderView(
        baseConfig({ empty_day_text: text } as Partial<Types.Config>),
        view,
      );
      expect(noticeTexts(container)).toEqual([DEFAULT_NOTICE]);
    });
  });

  /**
   * Changing opacity classification must not move anything else. Each assertion below
   * pairs the dimmed notice with the same notice when it is *not* dimmed, so a probe
   * that simply found nothing cannot pass.
   */
  describe.each(NOTICE_VIEWS)('%s leaves everything but the class alone', (view) => {
    it('keeps the notice in the DOM, visible and readable', () => {
      const container = renderView(baseConfig({ past_event_opacity: 0 }), view);
      const past = noticeForDay(container, 15)!;

      expect(past.isConnected || container.contains(past)).toBe(true);
      expect(past.getAttribute('aria-hidden')).toBeNull();
      expect(past.closest('[aria-hidden="true"]')).toBeNull();
      expect(past.getAttribute('style') ?? '').not.toContain('display:none');
      expect(past.getAttribute('style') ?? '').not.toContain('display: none');
      expect(past.textContent?.trim()).toBe(DEFAULT_NOTICE);
    });

    it('keeps the configured empty-day color on a dimmed notice', () => {
      const container = renderView(baseConfig(), view);
      const pastTitle = noticeForDay(container, 15)!.querySelector('.empty-day-title')!;
      const todayTitle = noticeForDay(container, 17)!.querySelector('.empty-day-title')!;

      expect(pastTitle.getAttribute('style')).toBe(todayTitle.getAttribute('style'));
      expect(pastTitle.getAttribute('style')).toContain('--calendar-card-empty-day-color');
    });

    it('changes nothing but the class list, box for box', () => {
      // Same window, same text, same everything — read once as it renders and once with
      // the past class stripped back out. Any difference beyond `past-event` would show
      // up here as a mismatch, and the control asserts the diff is not empty.
      const container = renderView(baseConfig(), view);
      const boxes = [...container.querySelectorAll('.event')];
      const stripped = boxes.map((box) => {
        const clone = box.cloneNode(true) as HTMLElement;
        clone.classList.remove('past-event');
        return clone.outerHTML;
      });

      const plain = renderView(baseConfig(), view);
      const plainBoxes = [...plain.querySelectorAll('.event')].map((box) => {
        const clone = box.cloneNode(true) as HTMLElement;
        clone.classList.remove('past-event');
        return clone.outerHTML;
      });

      expect(stripped).toEqual(plainBoxes);
      expect(boxes.some((box) => box.classList.contains('past-event'))).toBe(true);
    });

    it('preserves the real-event count and the day headers', () => {
      const container = renderView(baseConfig(), view);

      // Placeholders are not events and must not be counted as any.
      const realBoxes = [...container.querySelectorAll('.event')].filter(
        (box) => box.querySelector('.empty-day-title') === null,
      );
      expect(realBoxes).toHaveLength(2);
      expect(container.querySelectorAll('.day').length).toBeGreaterThanOrEqual(7);
    });
  });

  /**
   * Grid represents an empty day with an empty column. `sortDayEvents` drops
   * `_isEmptyDay` records outright, so there is no placeholder to dim there and none
   * may appear. The real banner and the real timed event are the controls: they prove
   * the Grid render ran and classified something, so "no placeholder" is a finding
   * rather than an empty probe.
   */
  describe('grid draws no empty-day notice to dim', () => {
    it.each([0, 100])('emits no placeholder title or banner at opacity %s', (opacity) => {
      const container = renderView(baseConfig({ past_event_opacity: opacity }), 'grid');

      expect(container.querySelectorAll('.empty-day-title')).toHaveLength(0);
      expect(container.textContent).not.toContain(Localize.getTranslations('en').noEvents);
      expect(realEventIsPast(container, 'Finished exhibition')).toBe(true);
      expect(realEventIsPast(container, 'Delivery window')).toBe(false);
    });
  });

  /**
   * With `show_empty_days: false` and nothing in the window, the card still draws one
   * fallback row — and that row sits on the configured reference date, which is not
   * necessarily today. A past window therefore produces a dimmed single row.
   *
   * Column carries a **divergent default** for `show_empty_days` (it is `true` there,
   * so a column keeps its shape rather than collapsing), and a divergent default beats
   * an inherited root value. Clearing it at the root alone leaves Column padding the
   * whole window, which is three rows rather than one — so the view's own block has to
   * be set as well. That is existing view-scope behavior, not anything this change
   * introduces; it is spelled out because a test that only set the root would silently
   * assert the wrong shape.
   */
  describe.each(NOTICE_VIEWS)('%s single fallback row', (view) => {
    function emptyWindow(startDate: string): Types.Config {
      const block = View.OVERRIDE_BLOCK_BY_VIEW[view]!;
      return baseConfig({
        show_empty_days: false,
        start_date: startDate,
        days_to_show: 3,
        [block]: { show_empty_days: false },
      } as Partial<Types.Config>);
    }

    it('collapses to exactly one row on the reference date', () => {
      const config = emptyWindow('2026-06-10');
      expect(View.resolveEffectiveConfig(config, view).show_empty_days).toBe(false);
      expect(group(config, view, []).length).toBe(1);
    });

    it('dims the row when the configured reference date is behind today', () => {
      const container = renderView(emptyWindow('2026-06-10'), view, []);

      const drawn = [...container.querySelectorAll('.empty-day-title')];
      expect(drawn).toHaveLength(1);
      expect(drawn[0].closest('.event')!.classList.contains('past-event')).toBe(true);
    });

    it('leaves the row bright when the reference date is today', () => {
      const container = renderView(emptyWindow(TODAY), view, []);

      const drawn = [...container.querySelectorAll('.empty-day-title')];
      expect(drawn).toHaveLength(1);
      expect(drawn[0].closest('.event')!.classList.contains('past-event')).toBe(false);
    });
  });

  /**
   * A dimmed placeholder is still a placeholder: `empty-day-title` is what both motion
   * guards test, and neither reads the past class, so adding one cannot make a notice
   * animate. Asserted on the rendered markup rather than by re-reading the guards, so
   * this fails if the class ever stops being emitted.
   */
  describe.each(NOTICE_VIEWS)('%s dimmed notices stay static', (view) => {
    it('keeps empty-day-title on a dimmed notice and adds no scroll marker', () => {
      const container = renderView(
        baseConfig({ empty_day_text: 'A deliberately long authored empty-day message' }),
        view,
      );
      const past = noticeForDay(container, 15)!;
      const title = past.querySelector('.empty-day-title')!;

      expect(past.classList.contains('past-event')).toBe(true);
      expect(title.classList.contains('empty-day-title')).toBe(true);
      expect(title.classList.contains('title-overflowing')).toBe(false);
      expect(title.getAttribute('style') ?? '').not.toContain('--calendar-card-title-scroll');
    });
  });
});
