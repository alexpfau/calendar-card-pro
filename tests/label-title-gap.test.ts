import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as Column from '../src/rendering/column';
import { renderGridGroupedEvents } from '../src/rendering/grid';
import * as Render from '../src/rendering/render';
import { cardStyles } from '../src/rendering/styles';
import { groupEventsByDay } from '../src/utils/events';

/**
 * The gap between a calendar label and its title is the label's own 4px margin, and nothing
 * else, in every view.
 *
 * It used to be 4px plus a word space. The title template carried whitespace between the
 * labels and the title and again inside the title before its text, and Lit keeps both as
 * text nodes, which inline layout collapses into one visible space: 7.48px from a picture to
 * the title at 14px, against 4px from the clock to the time in the row below. The list and
 * column hanging indent budgets the label plus exactly 4px, so the same space also left every
 * wrapped line about 3.5px short of the first title glyph.
 *
 * happy-dom cannot lay text out, so the gap itself is measured in a browser; what this pins
 * is its cause, which is markup: no text node may sit between the last label and the title,
 * and the title may not open with whitespace.
 *
 * Taking that whitespace out also took out the only place a line could break between a text
 * label and the title. "Anna" and "Birthday" became one word to the line breaker, and
 * `overflow-wrap: break-word` split the title instead: a list row 190px wide read
 * "Anna Birthda / y party for / the / grandparents". Pictures and icons are boxes a line
 * breaks around anyway; text and emoji labels get a zero-width space after them from the
 * stylesheet, which draws nothing and adds no node.
 */

type View = 'list' | 'column' | 'grid';

/**
 * What the stylesheet draws after a text label, as characters, from the one rule allowed to.
 * A second rule could take it away again without a trace in the markup, so it is pinned too.
 */
function generatedAfterTextLabel(): string {
  const css = cardStyles.cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, selectors]) =>
    /calendar-label[^,{]*::after/.test(selectors),
  );
  if (rules.length !== 1 || rules[0][1].trim() !== '.calendar-label::after') return '';
  const content = rules[0][2].match(/content:\s*'([^']*)'/)?.[1] ?? '';
  return content.replace(/\\([0-9a-f]{1,6})\s?/giu, (_match, hex: string) =>
    String.fromCodePoint(Number.parseInt(hex, 16)),
  );
}

const LABELS: Array<[string, string]> = [
  ['a picture', '/local/anna.png'],
  ['an icon', 'mdi:calendar'],
  ['an emoji', '🎉'],
  ['a prose label', 'Anna'],
];

function event(entity: string): Types.CalendarEventData {
  return {
    _entityId: entity,
    summary: 'Team lunch',
    start: { dateTime: '2026-06-17T11:00:00.000Z' },
    end: { dateTime: '2026-06-17T13:00:00.000Z' },
  };
}

function render(view: View, entities: Types.EntityConfig[]): HTMLElement {
  const config = buildConfig({ view, days_to_show: 1, entities, filter_duplicates: true });
  const events = entities.map(({ entity }) => event(entity));
  const days = groupEventsByDay(events, config, false, 'en', view);
  const host = document.createElement('div');
  litRender(
    view === 'grid'
      ? renderGridGroupedEvents(
          days,
          ViewConfig.resolveEffectiveConfig(config, 'grid'),
          'en',
          undefined,
          null,
          FROZEN_NOW,
        )
      : view === 'column'
        ? Column.renderColumnGroupedEvents(days, config, 'en', undefined, null)
        : Render.renderGroupedEvents(days, config, 'en', undefined, null),
    host,
  );
  return host;
}

/** Lit's comment markers are not content; skip them to reach what the browser lays out. */
function previousContent(node: Node): Node | null {
  let previous = node.previousSibling;
  while (previous?.nodeType === Node.COMMENT_NODE) previous = previous.previousSibling;
  return previous;
}

function firstContent(node: Node): Node | null {
  let first = node.firstChild;
  while (first?.nodeType === Node.COMMENT_NODE) first = first.nextSibling;
  return first;
}

function summaryOf(host: HTMLElement): HTMLElement {
  const summary = host.querySelector<HTMLElement>('.summary');
  expect(summary, 'a rendered title row').not.toBeNull();
  return summary!;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe.each<View>(['list', 'column', 'grid'])('label to title spacing in %s view', (view) => {
  it.each(LABELS)('puts the title directly after %s', (_name, label) => {
    const summary = summaryOf(render(view, [{ entity: 'calendar.anna', label }]));
    const title = summary.querySelector<HTMLElement>(':scope > .event-title')!;

    const before = previousContent(title);
    expect(before?.nodeType, 'the label, not a text node, sits right before the title').toBe(
      Node.ELEMENT_NODE,
    );
    expect((before as Element).matches('.calendar-label, .label-icon, .label-image')).toBe(true);
    const opening = firstContent(title);
    expect(opening?.nodeType === Node.TEXT_NODE && /^\s/u.test(opening.textContent ?? '')).toBe(
      false,
    );
    expect(title.textContent).toBe('Team lunch');
  });

  it('runs merged labels and the title together with nothing between them', () => {
    const summary = summaryOf(
      render(view, [
        { entity: 'calendar.anna', label: '/local/anna.png' },
        { entity: 'calendar.ben', label: 'mdi:calendar' },
        { entity: 'calendar.family', label: 'Family' },
      ]),
    );
    const text = Array.from(summary.childNodes).filter(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent !== '',
    );
    // Whitespace may open the row, where it starts a line and collapses to nothing. It may
    // not come between labels, or between the last label and the title.
    const labels = Array.from(summary.children).filter((child) => !child.matches('.event-title'));
    expect(labels).toHaveLength(3);
    const firstLabel = labels[0];
    expect(
      text.filter(
        (node) =>
          firstLabel.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING &&
          node.compareDocumentPosition(summary.querySelector('.event-title')!) &
            Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toEqual([]);
  });

  it.each<[string, Types.EntityConfig[]]>([
    ['a prose label', [{ entity: 'calendar.anna', label: 'Anna' }]],
    ['an emoji', [{ entity: 'calendar.anna', label: '🎉' }]],
    [
      'a merged run of prose labels',
      [
        { entity: 'calendar.anna', label: 'Anna' },
        { entity: 'calendar.ben', label: 'Ben' },
      ],
    ],
  ])('leaves a place to break after every text label in %s', (_name, entities) => {
    const summary = summaryOf(render(view, entities));
    const labels = Array.from(summary.querySelectorAll(':scope > .calendar-label'));
    expect(labels).toHaveLength(entities.length);
    for (const label of labels) {
      let next = label.nextSibling;
      while (next?.nodeType === Node.COMMENT_NODE) next = next.nextSibling;
      const whitespace = next?.nodeType === Node.TEXT_NODE && /\s/u.test(next.textContent ?? '');
      expect(
        whitespace || /[\s\u200B]$/u.test(generatedAfterTextLabel()),
        `a line can break after "${label.textContent}"`,
      ).toBe(true);
    }
  });

  it('leaves the markup of an unlabeled title as it always was', () => {
    // Nothing sits before an unlabeled title, so its leading space starts a line and
    // collapses to nothing on screen; the list and column snapshots pin this whitespace as
    // text, which is why only a labeled title takes the tight markup.
    const title = summaryOf(render(view, [{ entity: 'calendar.anna' }])).querySelector(
      ':scope > .event-title',
    )!;
    const opening = firstContent(title);
    expect(opening?.nodeType).toBe(Node.TEXT_NODE);
    expect(opening?.textContent).toMatch(/^\n\s+$/u);
  });
});
