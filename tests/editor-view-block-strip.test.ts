/**
 * One rule for what a save writes into a layout's own block, `column:` and `time_grid:` alike.
 *
 * The two strip functions grew apart. Column wrote a non-default value as it was spelled; grid
 * wrote what it resolves to, a change made so a legacy `slot_minutes: "60"` would be stored as
 * the number the card declares. Both are reasonable for a value being written, and neither view
 * said why it differed. Grid's version also reached lines the save had not touched, so editing
 * the title rewrote a held `slot_minutes: '30'` to `30`, though the editor keeps every line the
 * YAML holds unless the save changed it.
 *
 * Now both views store a line the YAML holds, and the card reads as written, as written; store
 * anything else that is not the default resolved; and drop a value the card rejects for its
 * default. The one deliberate difference stays a parameter: grid keeps a value it holds for an
 * option whose grid default differs from the card's, column strips one equal to what it would
 * inherit (see `TIME_GRID_DEFAULT_OVERRIDES` in `view.ts`).
 *
 * Falsifiers: write `value` instead of the resolved value for a key that is not held, and the
 * "fresh" rows fail in both views; write the resolved value for a held one, and the "held" rows
 * fail in both views.
 */
import { describe, expect, it } from 'vitest';

import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import {
  stripColumnDefaults,
  stripTimeGridDefaults,
  toStoredConfig,
} from '../src/rendering/editor/value';

function merged(config: Record<string, unknown>): Types.Config {
  return { ...Config.DEFAULT_CONFIG, ...config } as Types.Config;
}

type Strip = (config: Types.Config, authored?: unknown) => Record<string, unknown> | undefined;

const VIEWS: ReadonlyArray<{ block: 'column' | 'time_grid'; strip: Strip }> = [
  { block: 'column', strip: stripColumnDefaults },
  { block: 'time_grid', strip: stripTimeGridDefaults },
];

/** Values both blocks accept, spelled as YAML or an older editor may have spelled them. */
const SPELLED: ReadonlyArray<{ key: string; written: unknown; resolved: unknown }> = [
  { key: 'min_day_width', written: '120', resolved: 120 },
  { key: 'day_header_gap', written: 12, resolved: '12px' },
];

describe.each(VIEWS)('$block', ({ block, strip }) => {
  it.each(SPELLED)('stores a fresh $key as the card resolves it', ({ key, written, resolved }) => {
    const config = merged({ [block]: { [key]: written } });

    expect(strip(config)).toEqual({ [key]: resolved });
  });

  it('keeps a held value the card reads as written, as written', () => {
    const config = merged({ [block]: { min_day_width: '120' } });

    expect(strip(config, { min_day_width: '120' })).toEqual({ min_day_width: '120' });
  });

  it('drops a value the card rejects for its default, held or not', () => {
    const config = merged({ [block]: { min_day_width: 0 } });

    expect({ fresh: strip(config), held: strip(config, { min_day_width: 0 }) }).toEqual({
      fresh: undefined,
      held: undefined,
    });
  });

  it('repairs a held value the card does not read as written', () => {
    // A unitless length is drawn as pixels; storing it repaired changes nothing on screen.
    const config = merged({ [block]: { day_header_gap: 12 } });

    expect(strip(config, { day_header_gap: 12 })).toEqual({ day_header_gap: '12px' });
  });
});

describe('a save that touched nothing in the block', () => {
  it('leaves a held grid line as the YAML spells it', () => {
    const authored = {
      type: 'custom:calendar-card-pro',
      entities: ['calendar.anna'],
      view: 'grid',
      title: 'Before',
      time_grid: { slot_minutes: '30', min_day_width: '120' },
    };
    const config = merged({ ...authored, title: 'After' });

    expect(toStoredConfig(config, new Set(Object.keys(authored)), authored).time_grid).toEqual({
      slot_minutes: '30',
      min_day_width: '120',
    });
  });
});

describe('where the two blocks deliberately differ', () => {
  it('keeps a grid value equal to its divergent default, and strips the column one', () => {
    expect({
      grid: stripTimeGridDefaults(merged({ time_grid: { show_empty_days: true } })),
      column: stripColumnDefaults(merged({ column: { show_empty_days: true } })),
    }).toEqual({ grid: { show_empty_days: true }, column: undefined });
  });
});

// Backlog item 192: a line the card ignores is still a line the user wrote. A save keeps it in
// every block, so the editor's misplaced-option notice can report it and offer to move it.
// Falsifiers: restore the `LIST_OVERRIDE_KEYS` filter in `stripListDefaults` and the list rows
// fail; drop a held synthetic name again in either stripper and its "synthetic" rows fail.
describe.each(['list', 'column', 'time_grid'] as const)(
  'a misplaced line in %s survives an unrelated save',
  (block) => {
    function save(lines: Record<string, unknown>): unknown {
      const authored = {
        type: 'custom:calendar-card-pro',
        entities: ['calendar.anna'],
        title: 'Before',
        [block]: lines,
      };
      const config = merged({ ...authored, title: 'After' });
      return toStoredConfig(config, new Set(Object.keys(authored)), authored)[block];
    }

    it('keeps a card-wide option and an unknown key', () => {
      expect(save({ toolbar: { show: true }, shwo_location: true })).toEqual({
        toolbar: { show: true },
        shwo_location: true,
      });
    });

    it('keeps a synthetic field name the YAML holds', () => {
      expect(save({ time_format: '24h', start_date_mode: 'offset' })).toEqual({
        time_format: '24h',
        start_date_mode: 'offset',
      });
    });

    it('still drops a synthetic value a form generated', () => {
      const authored = { type: 'custom:calendar-card-pro', entities: ['calendar.anna'] };
      const config = merged({ ...authored, [block]: { time_format: '24h' } });
      expect(toStoredConfig(config, new Set(Object.keys(authored)), authored)[block]).toBe(
        undefined,
      );
    });
  },
);
