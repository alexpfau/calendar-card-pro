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

function event(entity: string): Types.CalendarEventData {
  return {
    _entityId: entity,
    summary: 'Team lunch',
    start: { dateTime: '2026-06-17T11:00:00.000Z' },
    end: { dateTime: '2026-06-17T13:00:00.000Z' },
  };
}

function render(entities: Types.EntityConfig[], options: Partial<Types.Config> = {}): HTMLElement {
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
        entities.map(({ entity: id }) => event(id)),
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
    const selector = '.grid-event-disclosure .summary, .grid-event-disclosure .event-title';
    const rungs = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, selectors]) => selectors.trim() === selector)
      .map(([, , body]) => body.match(/-webkit-line-clamp:\s*([^;]+);/)?.[1]);
    expect(rungs).toEqual([
      'var(--calendar-card-grid-title-lines-compact)',
      'var(--calendar-card-grid-title-lines-medium)',
      'var(--calendar-card-grid-title-lines-compact)',
      'var(--calendar-card-grid-title-lines-medium)',
      'var(--calendar-card-grid-title-lines-expanded)',
    ]);
  });

  it('uses the same four-pixel label gap in either text direction', () => {
    const body = declarations(
      '.grid-event-disclosure .calendar-label, .grid-event-disclosure .label-icon, .grid-event-disclosure .label-image',
    );
    expect(body).toMatch(/margin-right:\s*0;/);
    expect(body).toMatch(/margin-inline-end:\s*4px;/);
    expect(body).toMatch(/unicode-bidi:\s*isolate;/);
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
});
