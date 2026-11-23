/**
 * The overlay's card configuration (`config/overlay.ts`): the card's own, in Grid with the toolbar
 * and a switcher offering Month, and its `overlay:` block on top. Names are invented.
 */
import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import { OVERLAY_DEFAULTS, overlayConfig, overlayView } from '../src/config/overlay';
import type * as Types from '../src/config/types';
import { resolveViewOption } from '../src/config/view';

const BASE = {
  type: 'custom:calendar-card-pro-dev',
  entities: ['calendar.anna', 'calendar.ben'],
  view: 'list',
  title: 'Family',
  days_to_show: 14,
  tap_action: { action: 'overlay' },
};

describe('the overlay card’s configuration', () => {
  it('opens Grid on a week with the date navigation and a switcher offering every layout', () => {
    expect(overlayConfig(BASE)).toEqual({
      entities: ['calendar.anna', 'calendar.ben'],
      view: 'grid',
      title: 'Family',
      days_to_show: 7,
      tap_action: { action: 'none' },
      day_tap_action: { action: 'add-event' },
      toolbar: {
        show: true,
        navigation: true,
        view_switcher: true,
        view_switcher_layouts: ['list', 'column', 'grid', 'month'],
        overlay: false,
      },
    });
    expect(OVERLAY_DEFAULTS.view).toBe('grid');
  });

  it('adds an event from a day where the card sets no day tap, and keeps one it sets', () => {
    expect(overlayConfig(BASE).day_tap_action).toEqual({ action: 'add-event' });
    expect(overlayConfig({ ...BASE, day_tap_action: { action: 'none' } }).day_tap_action).toEqual({
      action: 'none',
    });
    expect(
      overlayConfig({ ...BASE, overlay: { day_tap_action: { action: 'none' } } }).day_tap_action,
    ).toEqual({ action: 'none' });
  });

  it('keeps the rest of the card’s toolbar, its own buttons but the one opening the overlay', () => {
    const config = overlayConfig({
      ...BASE,
      toolbar: {
        show: false,
        navigation: false,
        search: false,
        legend: 'chips',
        buttons: [
          { icon: 'mdi:arrow-expand', tap_action: { action: 'overlay' } },
          { icon: 'mdi:home', tap_action: { action: 'navigate', navigation_path: '/home' } },
        ],
      },
    });
    expect(config.toolbar).toEqual({
      show: true,
      navigation: true,
      view_switcher: true,
      view_switcher_layouts: ['list', 'column', 'grid', 'month'],
      search: false,
      legend: 'chips',
      overlay: false,
      buttons: [{ icon: 'mdi:home', tap_action: { action: 'navigate', navigation_path: '/home' } }],
    });
  });

  it('leaves out Home Assistant’s own keys, the card’s size and its compact limits', () => {
    const config = overlayConfig({
      ...BASE,
      grid_options: { rows: 4 },
      visibility: [{ condition: 'user', users: ['x'] }],
      max_height: '300px',
      card_height: '400px',
      compact_events_to_show: 5,
      list: { max_height: '200px', compact_days_to_show: 2, show_past_events: true },
      month: { narrow_card_height: '500px', weekend_background_color: 'red' },
    });
    expect(config).not.toHaveProperty('type');
    expect(config).not.toHaveProperty('grid_options');
    expect(config).not.toHaveProperty('visibility');
    expect(config).not.toHaveProperty('max_height');
    expect(config).not.toHaveProperty('card_height');
    expect(config).not.toHaveProperty('compact_events_to_show');
    expect(config.list).toEqual({ show_past_events: true });
    expect(config.month).toEqual({ weekend_background_color: 'red' });
  });

  it('takes the overlay block over everything, option by option, its size aside', () => {
    const config = overlayConfig({
      ...BASE,
      hold_action: { action: 'refresh' },
      overlay: {
        view: 'month',
        days_to_show: 14,
        compact_events_to_show: 3,
        card_height: '200px',
        toolbar: { refresh: false, view_switcher_layouts: ['grid', 'month'] },
        time_grid: { start_time: '07:00', max_height: '100px' },
      },
    });
    expect(config).toMatchObject({
      view: 'month',
      days_to_show: 14,
      compact_events_to_show: 3,
      hold_action: { action: 'refresh' },
      toolbar: {
        show: true,
        navigation: true,
        view_switcher: true,
        refresh: false,
        view_switcher_layouts: ['grid', 'month'],
      },
      time_grid: { start_time: '07:00' },
    });
    expect(config).not.toHaveProperty('overlay');
    expect(config).not.toHaveProperty('card_height');
    expect(config.time_grid).not.toHaveProperty('max_height');
  });

  it('never opens another overlay, wherever the action was written', () => {
    const config = overlayConfig({
      ...BASE,
      hold_action: { action: 'overlay' },
      toolbar: { overlay: true },
      overlay: { tap_action: { action: 'overlay' }, toolbar: { overlay: true } },
    });
    expect(config.tap_action).toEqual({ action: 'none' });
    expect(config.hold_action).toEqual({ action: 'none' });
    expect(config.toolbar).toMatchObject({ show: true, overlay: false });
  });

  it('changes nothing it is handed', () => {
    const raw = structuredClone({
      ...BASE,
      list: { max_height: '1px' },
      overlay: { view: 'month' },
    });
    const before = structuredClone(raw);
    overlayConfig(raw);
    expect(raw).toEqual(before);
  });
});

describe('the days the overlay shows', () => {
  /** What List, Columns and Grid each draw in the overlay a configuration opens. */
  const days = (raw: Record<string, unknown>) => {
    const config = buildConfig(overlayConfig(raw) as Partial<Types.Config>);
    return {
      list: resolveViewOption(config, 'days_to_show', 'list'),
      column: resolveViewOption(config, 'days_to_show', 'column'),
      grid: resolveViewOption(config, 'days_to_show', 'grid'),
    };
  };

  it('is a week where the card sets no count', () => {
    const card: Record<string, unknown> = { ...BASE };
    delete card.days_to_show;
    expect(days(card)).toEqual({ list: 7, column: 7, grid: 7 });
  });

  it('is a week whatever the card counts, at the top level or in a layout’s block', () => {
    const card = {
      ...BASE,
      days_to_show: 3,
      list: { days_to_show: 5 },
      column: { days_to_show: 2 },
      time_grid: { days_to_show: 4, start_time: '06:00' },
    };
    expect(days(card)).toEqual({ list: 7, column: 7, grid: 7 });
    expect(overlayConfig(card).time_grid).toEqual({ start_time: '06:00' });
  });

  it('is what the overlay block counts, at the top level or in a layout’s block', () => {
    expect(days({ ...BASE, overlay: { days_to_show: 5 } })).toEqual({
      list: 5,
      column: 5,
      grid: 5,
    });
    expect(days({ ...BASE, overlay: { time_grid: { days_to_show: 3 } } })).toEqual({
      list: 7,
      column: 7,
      grid: 3,
    });
  });
});

describe('the layout the overlay opens in', () => {
  it.each([
    [undefined, 'grid'],
    [{}, 'grid'],
    [{ view: 'month' }, 'month'],
    [{ view: 'list' }, 'list'],
    [{ view: 'agenda' }, 'grid'],
  ])('reads %j as %s', (overlay, view) => {
    expect(overlayView({ overlay } as Parameters<typeof overlayView>[0])).toBe(view);
  });
});
