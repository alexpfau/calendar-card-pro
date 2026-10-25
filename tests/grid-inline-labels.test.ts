import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import { renderGridGroupedEvents } from '../src/rendering/grid';
import { cardStyles } from '../src/rendering/styles';
import { groupEventsByDay } from '../src/utils/events';

const LABEL_FLOW =
  '.grid-event-disclosure .summary:not(.summary-scroll):has(> .event-title:not(:only-child))';
const CSS = cardStyles.cssText.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');

function declarations(selector: string): string {
  const rules = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const rule = rules.find(([, selectors]) => selectors.trim() === selector);
  expect(rule, `CSS rule for ${selector}`).toBeDefined();
  return rule![2];
}

function event(entity: string, summary = 'Team lunch'): Types.CalendarEventData {
  return {
    _entityId: entity,
    summary,
    start: { dateTime: '2026-06-17T11:00:00.000Z' },
    end: { dateTime: '2026-06-17T13:00:00.000Z' },
  };
}

function render(
  entities: Types.EntityConfig[],
  options: Partial<Types.Config> = {},
  summary?: string,
): HTMLElement {
  const config = buildConfig({
    view: 'grid',
    days_to_show: 1,
    entities,
    filter_duplicates: true,
    ...options,
  });
  const host = document.createElement('div');
  litRender(
    renderGridGroupedEvents(
      groupEventsByDay(
        entities.map(({ entity: id }) => event(id, summary)),
        config,
        false,
        'en',
        'grid',
      ),
      ViewConfig.resolveEffectiveConfig(config, 'grid'),
      'en',
      undefined,
      null,
      FROZEN_NOW,
    ),
    host,
  );
  return host;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('timed Grid labels share the title line', () => {
  it.each([
    { label: 'Anna', selector: '.calendar-label' },
    { label: 'Family calendar:', selector: '.calendar-label' },
    { label: '🎉', selector: '.label-emoji' },
    { label: 'mdi:calendar', selector: '.label-icon' },
    { label: '/local/anna.png', selector: '.label-image' },
  ])('retains the shared label-before-title markup for $label', ({ label, selector }) => {
    const host = render([{ entity: 'calendar.anna', label }]);
    const summary = host.querySelector('.grid-event .summary')!;
    expect(summary.matches(LABEL_FLOW)).toBe(true);
    expect(summary.children).toHaveLength(2);
    expect(summary.children[0].matches(selector)).toBe(true);
    expect(summary.children[1].matches('.event-title')).toBe(true);
    expect(summary.children[1].textContent?.trim()).toBe('Team lunch');
  });

  it('keeps all merged labels in source order before one title', () => {
    const host = render([
      { entity: 'calendar.anna', label: 'Anna' },
      { entity: 'calendar.ben', label: 'mdi:calendar' },
      { entity: 'calendar.family', label: '/local/family.png' },
    ]);
    expect(host.querySelectorAll('.grid-event')).toHaveLength(1);
    const children = [...host.querySelector('.grid-event .summary')!.children];
    expect(children.map((node) => node.tagName.toLowerCase())).toEqual([
      'span',
      'ha-icon',
      'img',
      'span',
    ]);
    expect(children[0].textContent).toBe('Anna');
    expect(children[1].getAttribute('icon')).toBe('mdi:calendar');
    expect(children[2].getAttribute('src')).toBe('/local/family.png');
    expect(children[3].classList).toContain('event-title');
  });

  it('clamps the labeled flow without blockifying the title after its labels', () => {
    // Happy DOM has no line geometry; the browser matrix measures actual first-line placement.
    expect(declarations(LABEL_FLOW)).toMatch(/display:\s*-webkit-box/);
    expect(declarations(LABEL_FLOW)).toMatch(/-webkit-box-orient:\s*vertical/);
    expect(declarations(`${LABEL_FLOW} > .event-title`)).toMatch(/display:\s*inline/);
    expect(declarations('.grid-event-disclosure .event-title')).toMatch(/display:\s*-webkit-box/);
  });

  it('applies every disclosure clamp rung to the shared flow as well as unlabeled titles', () => {
    // Both halves of the pair, every time. `.summary` is the flow a labeled title shares
    // with its labels and `.event-title` is the unlabeled one; a rung that clamps only one
    // of them makes a labeled title wrap where an identical unlabeled title does not.
    //
    // The qualifier is captured rather than normalized away, because one rung is gated on
    // a class now. The title yields its second line to the time row only where that row
    // can appear -- so the clamp is gated on the class that reveals it, which means the
    // pair carries `:where(.grid-time-fits)` there and nowhere else. Pinning it as part of the value keeps that asymmetry deliberate: a
    // qualifier appearing on another rung, or disappearing from this one, fails here.
    const pair = (qualifier = '') =>
      `.grid-event-disclosure${qualifier} .summary, .grid-event-disclosure${qualifier} .event-title`;
    const PAIR =
      /^\.grid-event-disclosure(\S*) \.summary, \.grid-event-disclosure(\S*) \.event-title$/;
    const rungs = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .map(([, selectors, body]): [string, string | undefined] => [
        selectors.replace(/\s+/g, ' ').trim(),
        body.match(/-webkit-line-clamp:\s*([^;]+);/)?.[1],
      ])
      .filter(([selectors, clamp]) => clamp !== undefined && PAIR.test(selectors));

    expect(rungs).toEqual([
      [pair(), 'var(--calendar-card-grid-title-lines-compact)'],
      [pair(), 'var(--calendar-card-grid-title-lines-medium)'],
      [pair(':where(.grid-time-fits)'), 'var(--calendar-card-grid-title-lines-compact)'],
      [pair(), 'var(--calendar-card-grid-title-lines-medium)'],
      [pair(), 'var(--calendar-card-grid-title-lines-expanded)'],
    ]);
  });

  it('uses the same four-pixel label gap in either text direction', () => {
    const body = declarations(
      '.grid-event-disclosure .calendar-label, .grid-event-disclosure .label-icon, .grid-event-disclosure .label-image',
    );
    expect(body).toMatch(/margin-right:\s*0;/);
    expect(body).toMatch(/margin-inline-end:\s*4px;/);
    expect(body).toMatch(/unicode-bidi:\s*isolate;/);

    // The margin is the whole gap only if nothing else is laid out after the label. A text
    // node between the last label and the title, or whitespace opening the title, collapses
    // into one more word space. Every view; see label-title-gap.test.ts.
    const content = (node: Node | null, step: 'previousSibling' | 'nextSibling'): Node | null => {
      while (node?.nodeType === Node.COMMENT_NODE) node = node[step];
      return node;
    };
    for (const entities of [
      ...['/local/anna.png', 'mdi:calendar', '🎉', 'Anna'].map((label) => [
        { entity: 'calendar.anna', label },
      ]),
      [
        { entity: 'calendar.anna', label: 'Anna' },
        { entity: 'calendar.ben', label: '/local/ben.png' },
      ],
    ]) {
      const title = render(entities).querySelector('.grid-event .summary > .event-title')!;
      expect(content(title.previousSibling, 'previousSibling')?.nodeType).toBe(Node.ELEMENT_NODE);
      const opening = content(title.firstChild, 'nextSibling');
      expect(opening?.nodeType === Node.TEXT_NODE && /^\s/u.test(opening.textContent ?? '')).toBe(
        false,
      );
    }
  });

  it('leaves scrolling titles in their separate flex-row mode', () => {
    const host = render([{ entity: 'calendar.anna', label: 'Anna' }], {
      time_grid: { scroll_long_titles: true, title_max_lines: 2 },
    });
    const summary = host.querySelector('.grid-event .summary')!;
    expect(summary.classList).toContain('summary-scroll');
    expect(summary.matches(LABEL_FLOW)).toBe(false);
    expect(summary.querySelector('.event-title-scroll')?.textContent?.trim()).toBe('Team lunch');
    expect(declarations('.summary-scroll')).toMatch(/display:\s*flex/);
  });

  it('does not change the flow of a title without a label', () => {
    const host = render([{ entity: 'calendar.anna' }]);
    const summary = host.querySelector('.grid-event .summary')!;
    expect(summary.children).toHaveLength(1);
    expect(summary.matches(LABEL_FLOW)).toBe(false);
    expect(summary.children[0].classList).toContain('event-title');
  });

  it('gives each run in a script without spaces an element the title cut can hide', () => {
    // The cut hides everything after the word it ends on through a sibling selector, which
    // reaches elements and not bare text. A run left as text kept the line going after the
    // ellipsis, so the cut fell back to a line clamp, and that hid the word instead.
    const title = 'Zoom 打ち合わせ Room';
    const host = render([{ entity: 'calendar.anna', label: '/local/anna.png' }], {}, title);
    const words = host.querySelector('.grid-event .title-words')!;
    expect(Array.from(words.children).map((child) => [child.className, child.textContent])).toEqual(
      [
        ['title-word', 'Zoom'],
        ['title-run', '打ち合わせ'],
        ['title-word', 'Room'],
      ],
    );
    expect(words.textContent).toBe(title);
  });
});
