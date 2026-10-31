import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as Column from '../src/rendering/column';
import * as Grid from '../src/rendering/grid';
import * as Render from '../src/rendering/render';
import { cardStyles } from '../src/rendering/styles';
import * as EventUtils from '../src/utils/events';
import type { LabelType } from '../src/utils/helpers';

/**
 * A scrolling `.summary` is a flex row, so `align-items: center` centers each item's
 * border box. The title carries 2px of bottom padding, which put its glyphs one CSS
 * pixel above a prose or emoji label's — measured at exactly -1px in Chromium 153,
 * Firefox 155 and WebKit 26.6, in all three views. Icons and pictures were already
 * exempted; prose, emoji and merged runs carrying neither were not.
 *
 * Happy DOM computes no line geometry, so the pixel agreement is a browser measurement.
 * What belongs here is the reach of the rule: which rows the reset actually selects.
 */
const CSS = cardStyles.cssText.replace(/\/\*[\s\S]*?\*\//g, '');
const RESET = '.summary-scroll:has(> :not(.event-title)) > .event-title';

const LABELS = {
  prose: 'Garden',
  emoji: '🪴',
  icon: 'mdi:leaf',
  image: '/local/anna.png',
} as const;

function labelType(kind: keyof typeof LABELS): LabelType {
  return kind === 'icon' ? 'icon' : kind === 'image' ? 'image' : 'text';
}

function event(entity: string): Types.CalendarEventData {
  return {
    _entityId: entity,
    summary: 'Review the garden planting plan with Anna before the weekend',
    start: { dateTime: '2026-06-17T11:00:00.000Z' },
    end: { dateTime: '2026-06-17T13:00:00.000Z' },
  };
}

function render(
  view: Types.EffectiveView,
  entities: Types.EntityConfig[],
  overrides: Partial<Types.Config> = {},
): HTMLElement {
  const config = buildConfig({
    view,
    days_to_show: 1,
    entities,
    scroll_long_titles: true,
    filter_duplicates: entities.length > 1,
    ...overrides,
  });
  const days = EventUtils.groupEventsByDay(
    entities.map(({ entity }) => event(entity)),
    config,
    false,
    'en',
    view,
  );
  const effective = ViewConfig.resolveEffectiveConfig(config, view);
  const host = document.createElement('div');
  litRender(
    view === 'grid'
      ? Grid.renderGridGroupedEvents(days, effective, 'en', undefined, null, FROZEN_NOW)
      : view === 'column'
        ? Column.renderColumnGroupedEvents(days, effective, 'en', undefined, null)
        : Render.renderGroupedEvents(days, effective, 'en', undefined, null),
    host,
  );
  return host;
}

function titles(host: HTMLElement): HTMLElement[] {
  return [...host.querySelectorAll<HTMLElement>('.summary .event-title')];
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('scrolling labels and titles share one vertical center', () => {
  it('resets the padding once, and resets nothing else', () => {
    const rules = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, body]) => ({
      selectors: selectors.trim(),
      body: body.trim(),
    }));

    const reset = rules.filter((rule) => rule.selectors === RESET);
    expect(reset).toHaveLength(1);
    expect(reset[0].body).toMatch(/^padding-bottom:\s*0;$/);

    // One reset, not two competing ones: no other scrolling rule touches this padding.
    const padding = rules.filter(
      (rule) => rule.selectors.includes('.summary-scroll') && /padding-bottom/.test(rule.body),
    );
    expect(padding.map((rule) => rule.selectors)).toEqual([RESET]);

    // The correction is the existing reset widened, not a second mechanism.
    const nudges = rules.filter(
      (rule) =>
        rule.selectors.includes('.summary-scroll') &&
        /(transform|line-height|margin-top|margin-block-start|position:\s*relative)/.test(
          rule.body,
        ),
    );
    expect(nudges).toEqual([]);

    // And the base padding survives for every row the reset does not reach.
    expect(CSS).toMatch(/\.event-title\s*\{[^}]*padding-bottom:\s*2px/);
  });

  it.each(['list', 'column', 'grid'] as const)(
    'reaches every label kind a %s row can carry',
    (view) => {
      for (const kind of ['prose', 'emoji', 'icon', 'image'] as const) {
        const host = render(view, [
          { entity: 'calendar.anna', label: LABELS[kind], label_type: labelType(kind) },
        ]);
        const [title] = titles(host);
        expect(title, `${view}/${kind}`).toBeDefined();
        expect(title.parentElement!.classList, `${view}/${kind}`).toContain('summary-scroll');
        expect(title.matches(RESET), `${view}/${kind}`).toBe(true);
      }
    },
  );

  it.each([
    ['text only, which the shipped icon/picture reset could not reach', ['prose', 'emoji']],
    ['every kind at once', ['prose', 'emoji', 'icon', 'image']],
  ] as const)('reaches a merged run of %s', (_name, kinds) => {
    const host = render(
      'list',
      kinds.map((kind, index) => ({
        entity: `calendar.${['anna', 'ben', 'clara', 'david'][index]}`,
        label: LABELS[kind],
        label_type: labelType(kind),
      })),
    );
    const [title] = titles(host);
    const labels = [...title.parentElement!.children].filter((node) => node !== title);
    expect(labels).toHaveLength(kinds.length);
    expect(title.matches(RESET)).toBe(true);
  });

  it('leaves an unlabeled scrolling title on its original padding', () => {
    // Nothing sits beside it to align to, so its row height must not move.
    const host = render('list', [{ entity: 'calendar.anna' }]);
    const [title] = titles(host);
    expect(title.parentElement!.children).toHaveLength(1);
    expect(title.matches(RESET)).toBe(false);
  });

  it.each(['list', 'column', 'grid'] as const)(
    'never reaches an ordinary wrapping %s row',
    (view) => {
      for (const kind of ['prose', 'emoji', 'icon', 'image'] as const) {
        const host = render(
          view,
          [{ entity: 'calendar.anna', label: LABELS[kind], label_type: labelType(kind) }],
          { scroll_long_titles: false, time_grid: { scroll_long_titles: false } },
        );
        const [title] = titles(host);
        expect(title.parentElement!.classList, `${view}/${kind}`).not.toContain('summary-scroll');
        expect(title.matches(RESET), `${view}/${kind}`).toBe(false);
      }
    },
  );

  it('keeps the wrapping row’s own middle alignment and hanging indent', () => {
    // Both belong to the non-scrolling path and are untouched by this correction.
    expect(CSS).toMatch(
      /\.summary:has\(> \.label-icon\) > \.event-title,[\s\S]*?vertical-align:\s*middle/,
    );
    expect(CSS).toMatch(/\.summary:has\(> \.label-icon\),[\s\S]*?text-indent:\s*calc\(-1 \*/);
  });
});
