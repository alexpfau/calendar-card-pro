import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EVENTS, FROZEN_NOW, buildConfig } from './fixtures';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import * as View from '../src/config/view';
import * as Column from '../src/rendering/column';
import * as Grid from '../src/rendering/grid';
import * as Render from '../src/rendering/render';
import * as Events from '../src/utils/events';
import * as Logger from '../src/utils/logger';
import '../src/calendar-card-pro';

const CLEAR = [undefined, null, '', '   '];
const INVALID = [false, true, NaN, Infinity, -Infinity, -1, 101, '101', 'word', {}, []];
const VALID = [
  [0, 0],
  [1, 1],
  [60, 60],
  [100, 100],
  [75.125, 75.125],
  ['0', 0],
  [' 12.5 ', 12.5],
] as const;

function raw(overrides: Record<string, unknown>): Types.Config {
  return buildConfig(overrides);
}

describe('past-event opacity normalization and view inheritance', () => {
  afterEach(() => vi.restoreAllMocks());

  it('defaults to 60 in every view without a divergent default', () => {
    const config = buildConfig();
    expect(Config.DEFAULT_CONFIG.past_event_opacity).toBe(60);
    for (const view of View.VIEWS) {
      expect(View.hasDivergentDefault('past_event_opacity', view)).toBe(false);
      expect(View.resolveViewOption(config, 'past_event_opacity', view)).toBe(60);
      expect(View.resolveEffectiveConfig(config, view).past_event_opacity).toBe(60);
    }
  });

  it.each(VALID)('normalizes %s to %s, including zero and fractions', (input, expected) => {
    const config = raw({ past_event_opacity: input });
    expect(config.past_event_opacity).toBe(expected);
    for (const view of View.VIEWS) {
      const block = View.OVERRIDE_BLOCK_BY_VIEW[view]!;
      const overridden = raw({ past_event_opacity: 83, [block]: { past_event_opacity: input } });
      expect(View.resolveViewOption(overridden, 'past_event_opacity', view)).toBe(expected);
      expect(View.resolveEffectiveConfig(overridden, view).past_event_opacity).toBe(expected);
    }
  });

  it.each(CLEAR)('treats %s as absence, not zero or an override of inheritance', (input) => {
    const warning = vi.spyOn(Logger, 'warn').mockImplementation(() => {});
    expect(raw({ past_event_opacity: input }).past_event_opacity).toBe(60);
    for (const view of View.VIEWS) {
      const block = View.OVERRIDE_BLOCK_BY_VIEW[view]!;
      const config = raw({ past_event_opacity: 37.5, [block]: { past_event_opacity: input } });
      View.validateColumnOverrides(config);
      expect(View.resolveViewOption(config, 'past_event_opacity', view)).toBe(37.5);
      expect(View.resolveEffectiveConfig(config, view).past_event_opacity).toBe(37.5);
    }
    expect(warning).not.toHaveBeenCalled();
  });

  it.each(INVALID)('rejects %s and reports the actual scope', (input) => {
    const warning = vi.spyOn(Logger, 'warn').mockImplementation(() => {});
    expect(raw({ past_event_opacity: input }).past_event_opacity).toBe(60);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('"past_event_opacity"'));
    for (const view of View.VIEWS) {
      warning.mockClear();
      const block = View.OVERRIDE_BLOCK_BY_VIEW[view]!;
      const config = raw({ past_event_opacity: 37.5, [block]: { past_event_opacity: input } });
      View.validateColumnOverrides(config);
      expect(warning).toHaveBeenCalledWith(
        expect.stringContaining(`"${block}.past_event_opacity"`),
      );
      expect(View.resolveViewOption(config, 'past_event_opacity', view)).toBe(37.5);
      expect(View.resolveEffectiveConfig(config, view).past_event_opacity).toBe(37.5);
    }
  });

  it('does not change null semantics for another option', () => {
    const config = buildConfig({ show_week_numbers: 'iso', column: { show_week_numbers: null } });
    expect(View.resolveViewOption(config, 'show_week_numbers', 'column')).toBeNull();
    expect(View.resolveEffectiveConfig(config, 'column').show_week_numbers).toBeNull();
  });

  it('keeps List fallback and now-line choices independent', () => {
    const config = buildConfig({
      view: 'grid',
      past_event_opacity: 100,
      list: { past_event_opacity: 1 },
      time_grid: { past_event_opacity: 60, show_now_line: false },
    });
    expect(View.resolveEffectiveConfig(config, 'list').past_event_opacity).toBe(1);
    expect(View.resolveEffectiveConfig(config, 'column').past_event_opacity).toBe(100);
    expect(View.resolveEffectiveConfig(config, 'grid').past_event_opacity).toBe(60);
    config.time_grid!.show_now_line = true;
    expect(View.resolveEffectiveConfig(config, 'grid').past_event_opacity).toBe(60);
  });
});

interface CardProbe extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  updateEvents(force?: boolean): Promise<void>;
}

describe('opacity is render-time state, not event eligibility', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it.each(['root', ...View.VIEWS])(
    'does not fetch or reprocess when %s opacity changes',
    (scope) => {
      const card = document.createElement('calendar-card-pro-dev') as CardProbe;
      const base = { entities: ['calendar.anna'], days_to_show: 3 };
      card.setConfig(base);
      const update = vi.spyOn(card, 'updateEvents').mockResolvedValue();
      const block =
        scope === 'root' ? undefined : View.OVERRIDE_BLOCK_BY_VIEW[scope as Types.EffectiveView]!;
      for (const value of [0, 1, 60, 75.5, 100]) {
        card.setConfig({
          ...base,
          ...(block ? { [block]: { past_event_opacity: value } } : { past_event_opacity: value }),
        });
      }
      expect(update).not.toHaveBeenCalled();
      card.setConfig({ ...base, days_to_show: 7 });
      expect(update).toHaveBeenCalledExactlyOnceWith(true);
      update.mockClear();
      card.setConfig({ ...base, days_to_show: 7, show_location: false });
      expect(update).not.toHaveBeenCalled();
      card.remove();
    },
  );

  const fixtures: Types.CalendarEventData[] = [
    ...EVENTS,
    {
      summary: 'Yesterday festival',
      start: { date: '2026-06-16' },
      end: { date: '2026-06-17' },
      _entityId: 'calendar.personal',
    },
    {
      summary: 'Workshop ending now',
      start: { dateTime: '2026-06-17T09:00:00Z' },
      end: { dateTime: FROZEN_NOW.toISOString() },
      _entityId: 'calendar.personal',
    },
  ];

  function render(view: Types.EffectiveView, opacity: number): HTMLElement {
    const config = buildConfig({
      view,
      start_date: '-1',
      days_to_show: 5,
      show_past_events: true,
      past_event_opacity: opacity,
      show_countdown: true,
      show_progress_bar: true,
      event_color: '#123456',
      column: { split_multiday_events: false },
    });
    const days = Events.groupEventsByDay(fixtures, config, false, 'en', view);
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

  it.each(View.VIEWS)('preserves the entire %s event DOM at 0, 1, 60, 75.5 and 100', (view) => {
    const baseline = render(view, 60);
    expect(baseline.querySelectorAll('.past-event').length).toBeGreaterThan(0);
    expect(baseline.querySelectorAll('.event:not(.past-event)').length).toBeGreaterThan(0);
    if (view === 'grid') {
      expect(baseline.querySelectorAll('.grid-banner.past-event')).toHaveLength(1);
      expect(baseline.querySelectorAll('.grid-event.past-event')).toHaveLength(1);
      expect(baseline.querySelectorAll('.grid-event [role="group"]').length).toBeGreaterThan(0);
    }
    for (const value of [0, 1, 75.5, 100]) {
      expect(render(view, value).innerHTML).toBe(baseline.innerHTML);
    }
    expect(
      Array.from(baseline.querySelectorAll('.past-event')).some((event) =>
        event.textContent?.includes('Workshop ending now'),
      ),
    ).toBe(false);
  });
});
