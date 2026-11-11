/**
 * A title cut by `title_max_lines` lays its line out in its own direction, in list and column
 * view.
 *
 * The clamp puts its "…" at the end of the line in the direction of the box it clamps. A title
 * running against the dashboard, English on a Hebrew one or Hebrew on an English one, therefore
 * ended in "…" at its own start and lost its first letters, in Chromium, WebKit and Firefox, at
 * one line and at three, labeled or not. The title's own `dir="auto"` was not enough once a
 * label shared its line, so the summary carries the title's direction and the label leads the
 * title in the title's reading order. The layout half can only be seen in a browser; this file
 * pins the markup and the stylesheet that the browser check was run against.
 *
 * `title_max_lines` defaults to `0`, which draws no `dir` at all, so the default-config DOM
 * gates cannot see any of this: every case here sets it.
 *
 * A title kept to one line, scrolling or beside the time, is cut the same way along the line,
 * and takes its own direction on `.event-title` instead (backlog item 259).
 */

import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import { renderColumnGroupedEvents } from '../src/rendering/column';
import * as Render from '../src/rendering/render';
import { cardStyles } from '../src/rendering/styles';
import * as EventUtils from '../src/utils/events';
import { titleDirection } from '../src/utils/title-words';

const LATIN = 'Quarterly planning review';
const HEBREW = 'פגישת תכנון רבעונית';

function event(summary: string, hour: number): Types.CalendarEventData {
  return {
    summary,
    start: { dateTime: `2026-06-17T${hour}:00:00Z` },
    end: { dateTime: `2026-06-17T${hour}:30:00Z` },
    _entityId: 'calendar.anna',
  };
}

/** Each title's summary `dir`, keyed by the title, in the view asked for. */
function summaryDirs(view: 'list' | 'column', config: Partial<Types.Config>, label?: string) {
  const cfg = buildConfig({
    entities: [label ? { entity: 'calendar.anna', label } : 'calendar.anna'],
    days_to_show: 1,
    ...config,
  });
  const events = [event(LATIN, 10), event(HEBREW, 12)].map((e) => ({
    ...e,
    _matchedConfig: cfg.entities[0] as Types.EntityConfig,
  }));
  const days = EventUtils.groupEventsByDay(events, cfg, false, 'en', view);
  const container = document.createElement('div');
  litRender(
    view === 'list'
      ? Render.renderGroupedEvents(days, cfg, 'en')
      : renderColumnGroupedEvents(days, cfg, 'en'),
    container,
  );
  return Object.fromEntries(
    Array.from(container.querySelectorAll('.summary')).map((summary) => [
      summary.querySelector('.event-title')!.textContent!.trim(),
      summary.getAttribute('dir'),
    ]),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('titleDirection', () => {
  it('reads the direction of the first letter, as dir="auto" does', () => {
    expect(titleDirection(LATIN)).toBe('ltr');
    expect(titleDirection(HEBREW)).toBe('rtl');
    expect(titleDirection('اجتماع الفريق')).toBe('rtl');
    expect(titleDirection('10:00 פגישה')).toBe('rtl');
    expect(titleDirection('– Team sync')).toBe('ltr');
    expect(titleDirection('Zoom עם דנה')).toBe('ltr');
    expect(titleDirection('会議')).toBe('ltr');
    // A direction mark is as strong as a letter.
    expect(titleDirection('\u200FQuarterly planning')).toBe('rtl');
    expect(titleDirection('\u200Eפגישה')).toBe('ltr');
    expect(titleDirection('\u061CMeeting')).toBe('rtl');
    expect(titleDirection('12:30')).toBeUndefined();
    expect(titleDirection('')).toBeUndefined();
  });
});

describe('a clamped list or column title', () => {
  for (const view of ['list', 'column'] as const) {
    it(`carries its own direction on its line in ${view} view, labeled or not`, () => {
      for (const label of [undefined, 'Anna:']) {
        for (const lines of [1, 3]) {
          expect(summaryDirs(view, { title_max_lines: lines }, label)).toEqual({
            [LATIN]: 'ltr',
            [HEBREW]: 'rtl',
          });
        }
      }
    });

    it(`carries none in ${view} view while titles are not clamped`, () => {
      expect(summaryDirs(view, { title_max_lines: 0 }, 'Anna:')).toEqual({
        [LATIN]: null,
        [HEBREW]: null,
      });
    });

    it(`carries none in ${view} view while titles scroll, which replaces the clamp`, () => {
      expect(summaryDirs(view, { title_max_lines: 1, scroll_long_titles: true })).toEqual({
        [LATIN]: null,
        [HEBREW]: null,
      });
    });
  }

  it('leaves the line for a day with no events as it was', () => {
    const cfg = buildConfig({ title_max_lines: 1, days_to_show: 1, show_empty_days: true });
    const days = EventUtils.groupEventsByDay([], cfg, false, 'en', 'column');
    const container = document.createElement('div');
    litRender(renderColumnGroupedEvents(days, cfg, 'en'), container);
    const summaries = Array.from(container.querySelectorAll('.summary'));
    expect(summaries.length).toBeGreaterThan(0);
    for (const summary of summaries) expect(summary.hasAttribute('dir')).toBe(false);
  });
});

/** Each title's own `dir`, keyed by the title, in the view asked for. */
function titleDirs(view: 'list' | 'column', config: Partial<Types.Config>, titles: string[]) {
  const cfg = buildConfig({ entities: ['calendar.anna'], days_to_show: 1, ...config });
  const events = titles.map((summary, index) => ({
    ...event(summary, 10 + index),
    _matchedConfig: cfg.entities[0] as Types.EntityConfig,
  }));
  const days = EventUtils.groupEventsByDay(events, cfg, false, 'en', view);
  const container = document.createElement('div');
  litRender(
    view === 'list'
      ? Render.renderGroupedEvents(days, cfg, 'en')
      : renderColumnGroupedEvents(days, cfg, 'en'),
    container,
  );
  return Object.fromEntries(
    Array.from(container.querySelectorAll('.event-title')).map((title) => [
      title.textContent!.trim(),
      title.getAttribute('dir'),
    ]),
  );
}

describe('a title kept to one line', () => {
  // The crop, the ellipsis and the scroll all start from the box's start, so a one-line title
  // running against the dashboard showed its end: on a right-to-left dashboard an English title
  // read "…le team before the match", and a Hebrew title on an English one its last words. It now
  // carries its own direction, as a clamped title's line does; measured in Chromium and WebKit
  // with scroll_long_titles under reduced motion and with the time beside a one-line title.
  const cases: Array<[string, Partial<Types.Config>]> = [
    ['scrolling', { scroll_long_titles: true }],
    ['beside the time', { time_position: 'title', title_max_lines: 1 }],
  ];
  for (const view of ['list', 'column'] as const) {
    for (const [name, config] of cases) {
      it(`carries its own direction in ${view} view, ${name}`, () => {
        expect(titleDirs(view, config, [LATIN, HEBREW])).toEqual({
          [LATIN]: 'ltr',
          [HEBREW]: 'rtl',
        });
      });
    }
  }

  it('leaves a title with no letter in it the dashboard direction', () => {
    expect(titleDirs('list', { scroll_long_titles: true }, ['12:30', '🎉'])).toEqual({
      '12:30': null,
      '🎉': null,
    });
  });

  it('carries no direction of its own while titles wrap', () => {
    expect(titleDirs('list', { title_max_lines: 2 }, [LATIN, HEBREW])).toEqual({
      [LATIN]: null,
      [HEBREW]: null,
    });
  });

  it('leaves the line for a day with no events as it was', () => {
    const cfg = buildConfig({ scroll_long_titles: true, days_to_show: 1, show_empty_days: true });
    const days = EventUtils.groupEventsByDay([], cfg, false, 'en', 'column');
    const container = document.createElement('div');
    litRender(renderColumnGroupedEvents(days, cfg, 'en'), container);
    const titles = Array.from(container.querySelectorAll('.event-title'));
    expect(titles.length).toBeGreaterThan(0);
    for (const title of titles) expect(title.hasAttribute('dir')).toBe(false);
  });
});

/** The stylesheet with comments removed, its rules as selector and body. */
const CSS = cardStyles.cssText.replace(/\/\*[\s\S]*?\*\//g, '');

function bodyOf(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
  const match = CSS.match(new RegExp(`(?:^|[}\\s,])${escaped}\\s*(?:,[^{]*)?\\{([^}]*)\\}`));
  return match?.[1] ?? '';
}

describe('the stylesheet for a line running against the dashboard', () => {
  it('keeps the line on the dashboard side, as wide as its text', () => {
    for (const selector of [
      ".summary-row:dir(rtl) > .summary[dir='ltr']",
      ".summary-row:dir(ltr) > .summary[dir='rtl']",
      ".summary-scroll:dir(rtl) > .event-title.title-scrollable[dir='ltr']",
      ".summary-scroll:dir(ltr) > .event-title.title-scrollable[dir='rtl']",
    ]) {
      expect(bodyOf(selector), selector).toMatch(/flex:\s*0 1 auto/);
    }
  });

  it('keeps the dashboard direction for a one-line title where :dir() is unknown', () => {
    // Chromium before 120 and Safari before 16.4 lack :dir(), so the rule keeping a short title on
    // the dashboard side never applies there; without this the title sat at the far end of its
    // row. With it the title draws there as it did before it carried a direction.
    const fallback = /@supports not selector\(:dir\(ltr\)\)\s*\{([^{}]*)\{([^{}]*)\}/.exec(CSS);
    expect(fallback?.[1].trim()).toBe('.summary-scroll > .event-title.title-scrollable[dir]');
    expect(fallback?.[2]).toMatch(/direction:\s*inherit/);
  });

  it("puts the gap to the weather badge on the badge's side", () => {
    // 12px from the text, less the room the box keeps inside it at each inline edge, which its
    // margin gives back everywhere (marks-beyond-line.test.ts).
    const body = bodyOf(".summary-row:dir(rtl) > .summary[dir='ltr']:not(:only-child)");
    expect(body).toMatch(/margin-inline-end:\s*-0\.125em;/);
    expect(body).toMatch(/margin-inline-start:\s*calc\(12px - 0\.125em\);/);
  });
});

describe('weather chips in a right-to-left card', () => {
  // Adjacent left-to-right chips joined one run, which a right-to-left line drew as one
  // piece: 12° · Partly cloudy · UV3, and a wrapped row stranded a dot between the wrong two.
  it('are each isolated, so the line orders the chips', () => {
    expect(bodyOf('.event-weather:dir(rtl) .event-weather-text > span')).toMatch(
      /unicode-bidi:\s*isolate/,
    );
  });

  it('are left alone in a left-to-right card', () => {
    expect(CSS).not.toMatch(/\.event-weather:dir\(ltr\)[^{]*\.event-weather-text > span\s*\{/);
    expect(CSS).not.toMatch(/(?<!:dir\(rtl\) )\.event-weather-text > span\s*\{[^}]*unicode-bidi/);
  });
});
