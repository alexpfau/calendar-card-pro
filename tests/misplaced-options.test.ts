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

import { DEFAULT_CONFIG, normalizeEntities } from '../src/config/config';
import { HA_CARD_KEYS } from '../src/config/constants';
import * as Types from '../src/config/types';
import { findMisplacedOptions, validateColumnOverrides } from '../src/config/view';
import * as Logger from '../src/utils/logger';

const warnMock = vi.mocked(Logger.warn);

/**
 * Every key Home Assistant's `LovelaceCardConfig` declares for any card, written out rather than
 * read from `HA_CARD_KEYS`, so a key dropped from that set fails here.
 */
const HA_CARD_CONFIG = {
  type: 'custom:calendar-card-pro',
  index: 0,
  view_index: 0,
  view_layout: { position: 'main' },
  layout_options: { grid_columns: 4 },
  grid_options: { columns: 'full' },
  visibility: [{ condition: 'screen', media_query: '(max-width: 1023px)' }],
  disabled: false,
};

/** The calendar-only options, read the way the existing projection test reads them. */
function calendarOnlyKeys(): string[] {
  return Object.keys(normalizeEntities([{ entity: 'calendar.anna' }])[0]).filter(
    (key) => key !== 'entity' && !Object.prototype.hasOwnProperty.call(DEFAULT_CONFIG, key),
  );
}

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
        // Weather as written before v6, which decides every layout's, so a layout's is ignored.
        weather: { entity: 'weather.home' },
        list: { toolbar: { show: true }, start_time: '07:00', shwo_location: true },
        column: { weather: { position: 'event' }, min_day_width: '100px' },
        time_grid: { event_tap_action: { action: 'details' }, compact_events_to_show: 2 },
      }),
    ).toEqual([
      // Month has a `min_day_width` of its own, the width its compact form starts below.
      { kind: 'view-only', key: 'min_day_width', from: null, to: ['column', 'time_grid', 'month'] },
      { kind: 'view-only', key: 'hour_height', from: null, to: ['time_grid'] },
      { kind: 'card-wide', key: 'toolbar', from: 'list', to: [null] },
      { kind: 'wrong-view', key: 'start_time', from: 'list', to: ['time_grid'] },
      { kind: 'unknown', key: 'shwo_location', from: 'list', to: [] },
      { kind: 'fetch-time', key: 'weather', from: 'column', to: [null] },
      { kind: 'card-wide', key: 'event_tap_action', from: 'time_grid', to: [null] },
      { kind: 'wrong-view', key: 'compact_events_to_show', from: 'time_grid', to: ['list'] },
    ]);
  });

  it('leaves a layout’s weather alone where the card sets weather per layout', () => {
    expect(
      findMisplacedOptions({
        weather_entity: 'weather.home',
        column: { weather: { position: 'event' } },
        month: { weather: { position: 'event' } },
      }),
    ).toEqual([]);
    // A top-level block without an entity drew nothing before v6, so it decides nothing.
    expect(findMisplacedOptions({ weather: { position: 'both' }, list: { weather: {} } })).toEqual(
      [],
    );
    // `weather_entity` is the card's, like the block written before v6.
    expect(findMisplacedOptions({ list: { weather_entity: 'weather.home' } })).toEqual([
      { kind: 'fetch-time', key: 'weather_entity', from: 'list', to: [null] },
    ]);
  });

  it('names both blocks for a key two views own when it is in a third', () => {
    expect(findMisplacedOptions({ list: { day_header_gap: '8px' } })).toEqual([
      { kind: 'wrong-view', key: 'day_header_gap', from: 'list', to: ['column', 'time_grid'] },
    ]);
  });

  it('knows a calendar’s own options, in a block and at the top level', () => {
    expect(
      findMisplacedOptions({
        show_in_legend: false,
        allowlist: 'Trash',
        show_location: false,
        column: { name: 'Anna', show_in_legend: false, label: '🎂' },
      }),
    ).toEqual([
      { kind: 'calendar', key: 'show_in_legend', from: null, to: [] },
      { kind: 'calendar', key: 'allowlist', from: null, to: [] },
      { kind: 'calendar', key: 'name', from: 'column', to: [] },
      { kind: 'calendar', key: 'show_in_legend', from: 'column', to: [] },
      { kind: 'calendar', key: 'label', from: 'column', to: [] },
    ]);
  });

  it('takes the calendar’s options from normalizeEntities, so a new one is known at once', () => {
    // Every option normalizeEntities projects, less the ones the card also takes at the top
    // level, is a calendar's own; none of them may read as unknown in a block.
    const projected = Object.keys(normalizeEntities([{ entity: 'calendar.anna' }])[0]).filter(
      (key) => key !== 'entity' && !Object.prototype.hasOwnProperty.call(DEFAULT_CONFIG, key),
    );
    expect(projected).toContain('show_in_legend');
    const kinds = findMisplacedOptions({
      list: Object.fromEntries(projected.map((key) => [key, 1])),
    }).map((finding) => finding.kind);
    expect(new Set(kinds)).toEqual(new Set(['calendar']));
    expect(kinds).toHaveLength(projected.length);
  });

  it('reads a merged configuration the same as the raw one', () => {
    const raw = { column: { title: 'Family' }, start_time: '07:00' };
    expect(findMisplacedOptions({ ...DEFAULT_CONFIG, ...raw })).toEqual(findMisplacedOptions(raw));
  });

  it.each([null, undefined, 'list', 3])('tolerates a %s block', (block) => {
    expect(findMisplacedOptions({ column: block, list: block, time_grid: block })).toEqual([]);
  });
});

describe('Home Assistant’s own card keys', () => {
  it('names every key Home Assistant takes on any card', () => {
    expect([...HA_CARD_KEYS].sort()).toEqual(Object.keys(HA_CARD_CONFIG).sort());
  });

  it('reports none of them at the top level, where Home Assistant applies them to the card', () => {
    expect(findMisplacedOptions(HA_CARD_CONFIG)).toEqual([]);
  });

  it('covers a calendar option that shares a name with one of them', () => {
    // Without a collision the test above would pass with no exclusion at all. A calendar option
    // added later under another of these names is covered by it the same way.
    expect(calendarOnlyKeys().filter((key) => HA_CARD_KEYS.has(key))).toContain('visibility');
  });

  it('still reports a calendar option written beside them', () => {
    expect(findMisplacedOptions({ ...HA_CARD_CONFIG, show_in_legend: false })).toEqual([
      { kind: 'calendar', key: 'show_in_legend', from: null, to: [] },
    ]);
  });

  it('still reports visibility written in a layout’s block, where neither reads it', () => {
    expect(findMisplacedOptions({ list: { visibility: HA_CARD_CONFIG.visibility } })).toEqual([
      { kind: 'calendar', key: 'visibility', from: 'list', to: [] },
    ]);
  });

  it('keeps a calendar’s own visibility under entities', () => {
    const entities = [{ entity: 'calendar.anna', visibility: HA_CARD_CONFIG.visibility }];

    expect(findMisplacedOptions({ ...HA_CARD_CONFIG, entities })).toEqual([]);
    expect(normalizeEntities(entities)[0].visibility).toEqual(HA_CARD_CONFIG.visibility);
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
      weather: { entity: 'weather.home' },
      time_grid: { weather: {} },
    } as unknown as Types.Config;

    validateColumnOverrides(config);

    expect(warnMock.mock.calls.map((call) => call[0])).toEqual([
      expect.stringContaining('"list.toolbar"'),
      expect.stringContaining('"column.shwo_location": not a recognized option'),
      expect.stringContaining('"time_grid.weather"'),
    ]);
  });

  it('warns about a calendar’s option written for the whole card', () => {
    validateColumnOverrides({
      ...DEFAULT_CONFIG,
      show_in_legend: false,
    } as unknown as Types.Config);

    expect(warnMock.mock.calls.map((call) => call[0])).toEqual([
      expect.stringContaining('"show_in_legend": it is an option of one calendar'),
    ]);
  });

  it('says nothing about Home Assistant’s own card keys', () => {
    validateColumnOverrides({ ...DEFAULT_CONFIG, ...HA_CARD_CONFIG } as unknown as Types.Config);

    expect(warnMock).not.toHaveBeenCalled();
  });
});
