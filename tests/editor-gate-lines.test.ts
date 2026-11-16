/**
 * Gate lines in the approved wording (backlog item 307): "Appears once {when}: {names}.", where
 * `{when}` is a clause for the first condition a gate waits on. Each condition has a clause of its
 * own, or its gate's, or, for a switch, "{label} is on" (`gates.ts` › `whenText`).
 *
 * The clause table is pinned by value, so a clause that leaves it fails, and every condition of
 * every gate that draws a line is reconciled against the built schema rather than against a list:
 * one that falls to "is on" must be a switch, so a new dropdown condition without a clause fails
 * on its own. The reconciliation is shown to fail on a planted removal before it is trusted.
 */
import { describe, expect, it } from 'vitest';

import {
  type FieldId,
  type IndexedField,
  fieldLabel,
  universeIndex,
} from '../src/rendering/editor/field-index';
import {
  ENTRY_GATES,
  GATES,
  type Gate,
  type GateData,
  whenKeyOf,
  whenText,
} from '../src/rendering/editor/gates';
import { EDITOR_STRINGS } from '../src/rendering/editor/strings';
import { WORKSPACES } from '../src/rendering/editor/workspace';

/** Every field any scope can build, by id: the controls gates read are among them. */
const FIELDS: ReadonlyMap<FieldId, IndexedField> = new Map(
  WORKSPACES.flatMap((workspace) => [...universeIndex('en', workspace).fields]),
);

const ALL: ReadonlyArray<readonly [string, Gate]> = [
  ...Object.entries(GATES),
  ...Object.entries(ENTRY_GATES),
];

/** Each condition of each gate that draws a line, as `<gate> <control>`, with its clause key. */
function clauses(gates: ReadonlyArray<readonly [string, Gate]>): Record<string, string> {
  return Object.fromEntries(
    gates
      .filter(([, gate]) => gate.kind === 'gate')
      .flatMap(([id, gate]) =>
        [...gate.requires, ...(gate.anyOf ?? []).flat()].map(
          (prereq) => [`${id} ${prereq.field}`, whenKeyOf(gate, prereq)] as const,
        ),
      ),
  );
}

/**
 * The conditions that fall to "{label} is on" without being a switch in the built schema.
 *
 * @param gates - The gate tables
 * @returns Each such condition, as `<gate> <control>`
 */
function unclaused(gates: ReadonlyArray<readonly [string, Gate]>): string[] {
  return Object.entries(clauses(gates))
    .filter(([, key]) => key === 'gate.when.on')
    .map(([where]) => where)
    .filter((where) => {
      const field = FIELDS.get(where.slice(where.indexOf(' ') + 1));
      return field === undefined || !('boolean' in field.node.selector);
    });
}

/** Labels as the gate lines name controls. */
const labelOf = (id: FieldId): string => fieldLabel(FIELDS.get(id)!, 'en');

describe('the gate lines’ clauses', () => {
  it('are pinned by value, each condition’s own, its gate’s or a switch’s', () => {
    expect(clauses(ALL)).toEqual({
      'time events:show_time': 'gate.when.on',
      'location events:show_location': 'gate.when.on',
      'description events:show_description': 'gate.when.on',
      'countdown events:show_countdown': 'gate.when.on',
      'progress_bar events:show_progress_bar': 'gate.when.on',
      'month day_header:show_month': 'gate.when.on',
      'week_numbers day_header:week_number_mode': 'gate.when.week_numbers',
      'indicator_color day_header:today_indicator_style': 'gate.when.indicator_shown',
      'indicator_size day_header:today_indicator_style': 'gate.when.indicator_marker',
      'today_when_empty content:show_empty_days': 'gate.when.empty_days_off',
      'duplicates content:filter_duplicates_mode': 'gate.when.duplicates',
      'toolbar card:toolbar.show': 'gate.when.on',
      'forecast weather:weather.entity': 'gate.when.weather_entity',
      'forecast_by_day weather:weather.entity': 'gate.when.weather_entity',
      'forecast_by_day weather:weather.position': 'gate.when.forecast_by_day',
      'forecast_by_event weather:weather.entity': 'gate.when.weather_entity',
      'forecast_by_event weather:weather.position': 'gate.when.forecast_by_event',
      'weather_lines weather:weather.entity': 'gate.when.weather_entity',
      'weather_lines weather:weather.position': 'gate.when.forecast_by_event',
      'weather_lines weather:weather.event.show_conditions': 'gate.when.on',
      'event_details actions:event_tap_action': 'gate.when.event_details',
      'event_details actions:event_hold_action': 'gate.when.event_details',
      'compact_days content:compact_events_to_show': 'gate.when.events_limit',
      'open_links actions:event_tap_action': 'gate.when.no_event_actions',
      'open_links actions:event_hold_action': 'gate.when.no_event_actions',
      'empty_days content:show_empty_days': 'gate.when.empty_or_today',
      'empty_days content:show_empty_today': 'gate.when.empty_or_today',
      'label_icon_color calendar:label_type': 'gate.when.label_icon',
      'location_icon events:show_location': 'gate.when.location_shown',
      'location_icon calendar:show_location': 'gate.when.location_shown',
      'show_in_legend card:toolbar.show': 'gate.when.calendar_filter',
      'show_in_legend card:toolbar.legend': 'gate.when.calendar_filter',
      'show_weather weather:weather.entity': 'gate.when.weather_entity',
      'show_weather weather:weather.position': 'gate.when.forecast_by_event',
    });
  });

  it('read as the approved wording, each written to follow “Appears once”', () => {
    const keys = [...new Set(Object.values(clauses(ALL)))].sort();
    expect(Object.fromEntries(keys.map((key) => [key, EDITOR_STRINGS[key]]))).toEqual({
      'gate.when.calendar_filter': 'the toolbar shows a calendar filter',
      'gate.when.duplicates': 'duplicates are filtered',
      'gate.when.empty_days_off': 'Show Empty Days is off',
      'gate.when.empty_or_today': 'Show Empty Days or Show Today When Empty is on',
      'gate.when.event_details': 'tapping or holding an event shows its details',
      'gate.when.events_limit': 'Compact Mode limits the events',
      'gate.when.forecast_by_day': 'the forecast shows in the day header',
      'gate.when.forecast_by_event': 'the forecast shows beside events',
      'gate.when.indicator_marker': 'the Style is a dot, an icon or an emoji',
      'gate.when.indicator_shown': 'a Style other than None is chosen',
      'gate.when.label_icon': 'the label is an icon',
      'gate.when.location_shown': 'this calendar shows locations',
      'gate.when.no_event_actions': 'both event actions are set to Nothing',
      'gate.when.on': '{label} is on',
      'gate.when.weather_entity': 'a Weather Entity is chosen',
      'gate.when.week_numbers': 'week numbers are shown',
    });
    // The fifteen clauses and the switch's template, and the two whole lines around them.
    expect(keys).toHaveLength(16);
    expect(EDITOR_STRINGS['gate.line']).toBe('Appears once {when}: {names}.');
    expect(EDITOR_STRINGS['gate.line_bare']).toBe('Appears once {when}.');
  });

  it('leave “is on” to switches alone, reconciled against the built schema', () => {
    const conditions = Object.keys(clauses(ALL));
    const switches = conditions.filter((where) => clauses(ALL)[where] === 'gate.when.on');
    // The denominators, so an empty answer below is a check that ran.
    expect(conditions.length).toBeGreaterThan(30);
    expect(switches.length).toBeGreaterThan(5);
    expect(unclaused(ALL)).toEqual([]);
  });

  it('fail on a dropdown condition that loses its clause (a planted removal)', () => {
    const planted = ALL.map(([id, gate]): readonly [string, Gate] =>
      id === 'week_numbers'
        ? [id, { ...gate, requires: gate.requires.map(({ whenKey: _, ...rest }) => rest) }]
        : [id, gate],
    );
    expect(unclaused(planted)).toEqual(['week_numbers day_header:week_number_mode']);
  });
});

describe('a gate explains itself by the condition it waits on', () => {
  /** The card's form data, with the weather options given. */
  const weather = (value: Record<string, unknown>): GateData => ({ card: { weather: value } });

  it('names Weather Lines three ways as different conditions are unmet', () => {
    const gate = GATES.weather_lines;
    expect(whenText(gate, weather({}), 'en', labelOf)).toBe('a Weather Entity is chosen');
    expect(
      whenText(gate, weather({ entity: 'weather.home', position: 'date' }), 'en', labelOf),
    ).toBe('the forecast shows beside events');
    expect(
      whenText(
        gate,
        weather({ entity: 'weather.home', position: 'event', event: { show_conditions: false } }),
        'en',
        labelOf,
      ),
    ).toBe('Show Conditions Beside Events is on');
    // The control: open, it waits on nothing.
    expect(
      whenText(
        gate,
        weather({ entity: 'weather.home', position: 'both', event: { show_conditions: true } }),
        'en',
        labelOf,
      ),
    ).toBeUndefined();
  });

  it('reads Show Countdown as on for once a day too', () => {
    const data = (value: unknown): GateData => ({ card: { show_countdown: value } });
    expect(whenText(GATES.countdown, data(false), 'en', labelOf)).toBe('Show Countdown is on');
    expect(whenText(GATES.countdown, data('once_per_day'), 'en', labelOf)).toBeUndefined();
  });
});
