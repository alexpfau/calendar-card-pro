/**
 * `findMisplacedOptions`: the one rule behind the card's development warnings and the editor's
 * notice about options written where the card ignores them (backlog item 192).
 *
 * Findings are pinned whole, by value, so a kind, a key or a destination that changes or goes
 * missing fails here rather than reading as a quieter notice.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/logger', () => ({
  warn: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

import { DEFAULT_CONFIG } from '../src/config/config';
import * as Types from '../src/config/types';
import { findMisplacedOptions, validateColumnOverrides } from '../src/config/view';
import * as Logger from '../src/utils/logger';

const warnMock = vi.mocked(Logger.warn);

describe('findMisplacedOptions', () => {
  it('finds nothing in a configuration that puts every option where it works', () => {
    expect(
      findMisplacedOptions({
        type: 'custom:calendar-card-pro',
        entities: ['calendar.anna'],
        toolbar: { show: true },
        list: { compact_events_to_show: 3 },
        column: { min_day_width: '120px', show_location: false },
        time_grid: { start_time: '07:00', event_font_size: '12px' },
      }),
    ).toEqual([]);
  });

  it('classifies each kind of misplaced option and says where it works', () => {
    expect(
      findMisplacedOptions({
        min_day_width: '120px',
        hour_height: '40px',
        list: { toolbar: { show: true }, start_time: '07:00', shwo_location: true },
        column: { weather: { entity: 'weather.home' }, min_day_width: '100px' },
        time_grid: { event_tap_action: { action: 'details' }, compact_events_to_show: 2 },
      }),
    ).toEqual([
      { kind: 'view-only', key: 'min_day_width', from: null, to: ['column', 'time_grid'] },
      { kind: 'view-only', key: 'hour_height', from: null, to: ['time_grid'] },
      { kind: 'card-wide', key: 'toolbar', from: 'list', to: [null] },
      { kind: 'wrong-view', key: 'start_time', from: 'list', to: ['time_grid'] },
      { kind: 'unknown', key: 'shwo_location', from: 'list', to: [] },
      { kind: 'fetch-time', key: 'weather', from: 'column', to: [null] },
      { kind: 'card-wide', key: 'event_tap_action', from: 'time_grid', to: [null] },
      { kind: 'wrong-view', key: 'compact_events_to_show', from: 'time_grid', to: ['list'] },
    ]);
  });

  it('names both blocks for a key two views own when it is in a third', () => {
    expect(findMisplacedOptions({ list: { day_header_gap: '8px' } })).toEqual([
      { kind: 'wrong-view', key: 'day_header_gap', from: 'list', to: ['column', 'time_grid'] },
    ]);
  });

  it('reads a merged configuration the same as the raw one', () => {
    const raw = { column: { title: 'Family' }, start_time: '07:00' };
    expect(findMisplacedOptions({ ...DEFAULT_CONFIG, ...raw })).toEqual(findMisplacedOptions(raw));
  });

  it.each([null, undefined, 'list', 3])('tolerates a %s block', (block) => {
    expect(findMisplacedOptions({ column: block, list: block, time_grid: block })).toEqual([]);
  });
});

describe('the card warns from the same findings', () => {
  beforeEach(() => warnMock.mockClear());

  it('says where a key from another view belongs instead of calling it unknown', () => {
    validateColumnOverrides({
      ...DEFAULT_CONFIG,
      column: { start_time: '07:00' },
    } as unknown as Types.Config);

    expect(warnMock).toHaveBeenCalledTimes(1);
    expect(warnMock.mock.calls[0][0]).toContain('"column.start_time"');
    expect(warnMock.mock.calls[0][0]).toContain('belongs in "time_grid:"');
  });

  it('warns once per finding across every block', () => {
    const config = {
      ...DEFAULT_CONFIG,
      list: { toolbar: { show: true } },
      column: { shwo_location: true },
      time_grid: { weather: {} },
    } as unknown as Types.Config;

    validateColumnOverrides(config);

    expect(warnMock.mock.calls.map((call) => call[0])).toEqual([
      expect.stringContaining('"list.toolbar"'),
      expect.stringContaining('"column.shwo_location": not a recognized option'),
      expect.stringContaining('"time_grid.weather"'),
    ]);
  });
});
