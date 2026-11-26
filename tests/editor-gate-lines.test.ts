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

import { chipFields } from '../src/rendering/editor/chips';
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
      // The event parts are drawn as chips: "Time is pressed".
      'time events:show_time': 'gate.when.pressed',
      'location events:show_location': 'gate.when.pressed',
      'description events:show_description': 'gate.when.pressed',
      'countdown events:show_countdown': 'gate.when.pressed',
      'progress_bar events:show_progress_bar': 'gate.when.pressed',
      'month day_header:show_month': 'gate.when.on',
      'month_label separators:month_separator_width': 'gate.when.month_rule',
      'month_label_style separators:month_separator_width': 'gate.when.month_rule',
      'month_label_style separators:month_separator_label': 'gate.when.on',
      'week_numbers day_header:week_number_mode': 'gate.when.week_numbers',
      'indicator_color day_header:today_indicator_style': 'gate.when.indicator_shown',
      'indicator_size day_header:today_indicator_style': 'gate.when.indicator_marker',
      'today_when_empty content:show_empty_days': 'gate.when.empty_days_off',
      'duplicates content:filter_duplicates_mode': 'gate.when.duplicates',
      'toolbar card:toolbar.show': 'gate.when.on',
      // Layouts in Switcher waits on the bar, then on its View Switcher chip.
      'switcher_layouts card:toolbar.show': 'gate.when.on',
      'switcher_layouts card:toolbar.view_switcher': 'gate.when.pressed',
      // The full-size card's toolbar on Full-Size Settings, as the card's own.
      'full_size_toolbar actions:overlay.toolbar.show': 'gate.when.on',
      'full_size_switcher_layouts actions:overlay.toolbar.show': 'gate.when.on',
      'full_size_switcher_layouts actions:overlay.toolbar.view_switcher': 'gate.when.pressed',
      'forecast weather:weather_entity': 'gate.when.weather_entity',
      'forecast_by_day weather:weather_entity': 'gate.when.weather_entity',
      'forecast_by_day weather:weather.position': 'gate.when.forecast_by_day',
      'forecast_by_event weather:weather_entity': 'gate.when.weather_entity',
      'forecast_by_event weather:weather.position': 'gate.when.forecast_by_event',
      'weather_lines weather:weather_entity': 'gate.when.weather_entity',
      'weather_lines weather:weather.position': 'gate.when.forecast_by_event',
      'weather_lines weather:weather.event.show_conditions': 'gate.when.on',
      'event_details actions:event_tap_action': 'gate.when.event_details',
      'event_details actions:event_hold_action': 'gate.when.event_details',
      'compact_days content:compact_events_to_show': 'gate.when.events_limit',
      'open_links actions:event_tap_action': 'gate.when.no_event_actions',
      'open_links actions:event_hold_action': 'gate.when.no_event_actions',
      'empty_days content:show_empty_days': 'gate.when.empty_or_today',
      'empty_days content:show_empty_today': 'gate.when.empty_or_today',
      // A lane's width and a calendar's Lane wait on Calendar Lanes.
      'min_lane_width layout:lanes': 'gate.when.on',
      'label_icon_color calendar:label_type': 'gate.when.label_icon',
      'label_image_size calendar:label_type': 'gate.when.label_image',
      'location_icon events:show_location': 'gate.when.location_shown',
      'location_icon calendar:show_location': 'gate.when.location_shown',
      'show_in_legend card:toolbar.show': 'gate.when.calendar_filter',
      'show_in_legend card:toolbar.legend': 'gate.when.calendar_filter',
      'hidden_by_default card:toolbar.show': 'gate.when.calendar_filter',
      'hidden_by_default card:toolbar.legend': 'gate.when.calendar_filter',
      'hidden_by_default calendar:show_in_legend': 'gate.when.on',
      'lane layout:lanes': 'gate.when.on',
      'show_weather weather:weather_entity': 'gate.when.weather_entity',
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
      'gate.when.label_icon': 'the label is an icon or has several parts',
      'gate.when.label_image': 'the label is an image or has several parts',
      'gate.when.location_shown': 'this calendar shows locations',
      'gate.when.month_rule': 'a month rule is drawn',
      'gate.when.no_event_actions': 'both event actions are set to Nothing',
      'gate.when.on': '{label} is on',
      'gate.when.pressed': '{part} is pressed',
      'gate.when.weather_entity': 'a Weather Entity is chosen',
      'gate.when.week_numbers': 'week numbers are shown',
    });
    // The seventeen clauses, the switch's template and the chip's, and the two whole lines around
    // them.
    expect(keys).toHaveLength(19);
    expect(EDITOR_STRINGS['gate.line']).toBe('Appears once {when}: {names}.');
    expect(EDITOR_STRINGS['gate.line_bare']).toBe('Appears once {when}.');
  });

  it('leave “is on” to switches alone, reconciled against the built schema', () => {
    const conditions = Object.keys(clauses(ALL));
    const switches = conditions.filter((where) => clauses(ALL)[where] === 'gate.when.on');
    // The denominators, so an empty answer below is a check that ran.
    expect(conditions.length).toBeGreaterThan(30);
    // Seven: three since the event parts became chips, Show Month, Show Toolbar and Show
    // Conditions Beside Events, then Show Toolbar again for Layouts in Switcher, and Month Name on
    // Rule for the name's color and size on List's month separator, then the full-size card's
    // Show Toolbar for its controls and for its Layouts in Switcher. Then Calendar Lanes, for its
    // Minimum Lane Width and a calendar's Lane. Then Show in Calendar Filter, for Hidden by Default.
    expect(switches.length).toBe(10);
    expect(unclaused(ALL)).toEqual([]);
  });

  it('give “is pressed” to the chips alone, reconciled against the page registry', () => {
    const pressed = Object.keys(clauses(ALL))
      .filter((where) => clauses(ALL)[where] === 'gate.when.pressed')
      .map((where) => where.slice(where.indexOf(' ') + 1));
    const chips = new Set([...chipFields('parts'), ...chipFields('toolbar')]);
    expect(pressed.length).toBeGreaterThan(3);
    expect(pressed.filter((id) => !chips.has(id))).toEqual([]);
    // Every condition on a chip that falls to a switch's template says pressed instead.
    const onChips = Object.keys(clauses(ALL)).filter(
      (where) =>
        chips.has(where.slice(where.indexOf(' ') + 1)) && clauses(ALL)[where] === 'gate.when.on',
    );
    expect(onChips).toEqual([]);
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
  /** The card's form data: the entity every layout draws from, and the layout's weather. */
  const weather = ({ entity, ...value }: Record<string, unknown>): GateData => ({
    card: { weather_entity: entity, weather: value },
  });

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

  it('reads Countdown as pressed for once a day too, by its chip’s label', () => {
    const data = (value: unknown): GateData => ({ card: { show_countdown: value } });
    expect(whenText(GATES.countdown, data(false), 'en', labelOf)).toBe('Countdown is pressed');
    expect(whenText(GATES.countdown, data('once_per_day'), 'en', labelOf)).toBeUndefined();
  });
});
