import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EVENTS, FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as Column from '../src/rendering/column';
import * as Render from '../src/rendering/render';
import * as EventUtils from '../src/utils/events';

/**
 * The day container's state classes are public API.
 *
 * `today`, `tomorrow`, `future-day` and `weekend` are what every card-mod recipe in
 * `docs/features/theming.md` selects on, so they are a contract with users rather than
 * an implementation detail — renaming one or dropping it from a view breaks styling in
 * a way that produces no error, no warning and no failing render.
 *
 * Nothing covered this before. The shared fixture spans 2026-06-17..19, which is
 * Wednesday to Friday, so `weekend` was never true in any existing test: the list
 * snapshot pinned `day-table today`, `day-table tomorrow future-day` and
 * `day-table future-day`, and a change to the weekend branch would have left all 36
 * assertions passing. That is the specific hole this file closes — it deliberately
 * renders across a Fri/Sat/Sun/Mon run so both states of the predicate are exercised
 * in both views.
 *
 * ## Why both views, in one file
 *
 * The two renderers build their day container independently — `render.ts` for the
 * table row group, `column.ts` for the grid cell — so "column view emits the same
 * state classes as list view" is an invariant with two separate implementations and no
 * shared code path to enforce it. Asserting them side by side is what makes a
 * divergence fail here rather than surface later as a card-mod rule that silently
 * stops matching when a user switches view.
 *
 * Until this file, `weekend` was in fact asymmetric: column view carried it on
 * `.day-column`, list view only on the inner `.date-column` date cell. A single
 * weekend rule could therefore not be written for both views.
 */

/** Friday through Monday — the shortest span containing both weekend and weekday days. */
const WEEKEND_SPAN: Types.CalendarEventData[] = [
  {
    start: { dateTime: '2026-06-19T10:00:00.000Z' },
    end: { dateTime: '2026-06-19T11:00:00.000Z' },
    summary: 'Friday',
    _entityId: 'calendar.personal',
  },
  {
    start: { dateTime: '2026-06-20T10:00:00.000Z' },
    end: { dateTime: '2026-06-20T11:00:00.000Z' },
    summary: 'Saturday',
    _entityId: 'calendar.personal',
  },
  {
    start: { dateTime: '2026-06-21T10:00:00.000Z' },
    end: { dateTime: '2026-06-21T11:00:00.000Z' },
    summary: 'Sunday',
    _entityId: 'calendar.personal',
  },
  {
    start: { dateTime: '2026-06-22T10:00:00.000Z' },
    end: { dateTime: '2026-06-22T11:00:00.000Z' },
    summary: 'Monday',
    _entityId: 'calendar.personal',
  },
];

/** `days_to_show` must reach Monday the 22nd, six days past the frozen Wednesday. */
const SPAN_CONFIG = { days_to_show: 10 };

/**
 * Column view ships `show_empty_days: true` (`view.ts:317`) because a grid has to fill
 * every column, so it renders 10 day containers where list view renders the 4 that hold
 * events. Turning it off is what makes the two day *sets* comparable; without it a
 * cross-view assertion compares Friday against Wednesday and fails for a reason that has
 * nothing to do with the classes under test.
 */
const COLUMN_SPAN_CONFIG = {
  ...SPAN_CONFIG,
  view: 'column' as const,
  column: { show_empty_days: false },
};

function classesOf(container: ParentNode, selector: string): string[][] {
  return Array.from(container.querySelectorAll(selector)).map((element) =>
    Array.from(element.classList).sort(),
  );
}

function renderList(config: Types.Config): HTMLElement {
  const days = EventUtils.groupEventsByDay(WEEKEND_SPAN, config, false, 'en', 'list');
  const container = document.createElement('div');
  litRender(Render.renderGroupedEvents(days, config, 'en', undefined, null), container);
  return container;
}

function renderColumn(config: Types.Config): HTMLElement {
  const days = EventUtils.groupEventsByDay(WEEKEND_SPAN, config, false, 'en', 'column');
  const container = document.createElement('div');
  litRender(Column.renderColumnGroupedEvents(days, config, 'en', undefined, null), container);
  return container;
}

describe('day container state classes', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders one container per day in both views, so the spans line up', () => {
    expect(classesOf(renderList(buildConfig(SPAN_CONFIG)), '.day-table')).toHaveLength(4);
    expect(classesOf(renderColumn(buildConfig(COLUMN_SPAN_CONFIG)), '.day-column')).toHaveLength(4);
  });

  it('marks Saturday and Sunday as weekend in list view', () => {
    const containers = classesOf(renderList(buildConfig(SPAN_CONFIG)), '.day-table');
    expect(containers.map((c) => c.includes('weekend'))).toEqual([false, true, true, false]);
  });

  it('marks Saturday and Sunday as weekend in column view', () => {
    const containers = classesOf(renderColumn(buildConfig(COLUMN_SPAN_CONFIG)), '.day-column');
    expect(containers.map((c) => c.includes('weekend'))).toEqual([false, true, true, false]);
  });

  it('agrees between the two views on every state class, not just weekend', () => {
    // The point of the contract: a card-mod rule written against one view has to keep
    // matching in the other. Comparing the full class sets — minus each view's own
    // container name — turns that from a convention into a check.
    const list = classesOf(renderList(buildConfig(SPAN_CONFIG)), '.day-table').map((c) =>
      c.filter((name) => name !== 'day-table'),
    );
    const column = classesOf(renderColumn(buildConfig(COLUMN_SPAN_CONFIG)), '.day-column').map(
      (c) => c.filter((name) => name !== 'day-column'),
    );

    expect(column).toEqual(list);
  });

  it('keeps weekend on the list view date cell as well, where it drives date colors', () => {
    // `.date-column.weekend` predates the container class and is what
    // `weekend_weekday_color` / `weekend_day_color` select on. Adding the class to the
    // container must not have moved it off the cell.
    const cells = classesOf(renderList(buildConfig(SPAN_CONFIG)), '.date-column');
    expect(cells.map((c) => c.includes('weekend'))).toEqual([false, true, true, false]);
  });
});

/**
 * Every class named in a `docs/features/theming.md` card-mod recipe has to exist.
 *
 * This is the gate that was missing. All three original recipes selected `.day-table`,
 * which only list view emits, so they silently did nothing in column view — no error, no
 * warning, just a rule that never matched. `check:docs` cannot see this: it validates
 * links, anchors and defaults, not whether a CSS selector corresponds to rendered DOM.
 *
 * While writing the replacement docs this check immediately paid for itself, rejecting
 * `.event-time` and `.event-location` — plausible names that do not exist. The real
 * classes are `.time` and `.location`. Without this test that correction would have
 * shipped as the same defect it was meant to fix.
 */
describe('theming.md card-mod selectors', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Rendered by the card shell rather than by either day renderer, so they cannot appear
   * in the union below. Listed explicitly instead of loosening the check, so a future
   * rename of one still has to be made deliberately here.
   */
  const CARD_CHROME = new Set(['header-container', 'card-header']);

  function documentedClasses(): string[] {
    // `process.cwd()` matches `editor-schema.test.ts`; vitest runs from the repo root.
    const markdown = readFileSync(join(process.cwd(), 'docs/features/theming.md'), 'utf8');
    const found = new Set<string>();
    const collect = (text: string): void => {
      // The leading boundary matters: without it `calendar.family` in an `entities:`
      // list reads as a class named `family`.
      for (const match of text.matchAll(/(?:^|[\s,{}()>+~])\.([a-z][a-z0-9-]*)/gm)) {
        found.add(match[1]);
      }
    };
    for (const block of markdown.matchAll(/```(?:yaml|css)\n([\s\S]*?)```/g)) {
      collect(block[1]);
    }
    // Prose is checked too, and not as an afterthought: the `.event-time` mistake this
    // test caught was written in a prose sentence, not in a recipe. A version of this
    // check that scanned only code blocks passed straight over it. Dotted spans only —
    // an undotted `` `weekend_day_color` `` is an option name, not a class.
    for (const span of markdown.matchAll(/`(\.[A-Za-z0-9_.-]+)`/g)) {
      collect(` ${span[1].replace(/\./g, ' .')}`);
    }
    return [...found].sort();
  }

  function renderedClasses(): Set<string> {
    const union = new Set<string>();
    // Optional branches are turned on deliberately: a class only reachable behind an
    // off-by-default option is absent from a default render, and would be reported as a
    // documentation error rather than as the missing coverage it is.
    const base = {
      days_to_show: 10,
      show_past_events: true,
      show_location: true,
      show_time: true,
    };
    for (const view of ['list', 'column'] as const) {
      // Both event sets: EVENTS covers location, past events and all-day rendering;
      // WEEKEND_SPAN is the only one that reaches a Saturday.
      for (const events of [EVENTS, WEEKEND_SPAN]) {
        const config = buildConfig(view === 'column' ? { ...base, view: 'column' } : base);
        const days = EventUtils.groupEventsByDay(events, config, false, 'en', view);
        const container = document.createElement('div');
        litRender(
          view === 'list'
            ? Render.renderGroupedEvents(days, config, 'en', undefined, null)
            : Column.renderColumnGroupedEvents(days, config, 'en', undefined, null),
          container,
        );
        container
          .querySelectorAll('*')
          .forEach((element) => element.classList.forEach((name) => union.add(name)));
      }
    }
    return union;
  }

  it('names only classes the card actually renders', () => {
    const rendered = renderedClasses();
    const unknown = documentedClasses().filter(
      (name) => !rendered.has(name) && !CARD_CHROME.has(name),
    );
    expect(unknown).toEqual([]);
  });

  it('documents both day containers, so no recipe is silently single-view', () => {
    const documented = documentedClasses();
    expect(documented).toContain('day-table');
    expect(documented).toContain('day-column');
  });
});
