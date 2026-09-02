/**
 * The card-level Events panel must offer the styling controls that apply in the view the
 * card renders, not the ones that would apply in list view.
 *
 * 🚨 Every `show_*` flag gating a styling group is a `COLUMN_OVERRIDE_KEYS` member, so a
 * card carrying a `column:` block renders one thing and configures another. Reading
 * `ctx.config` directly answered for the card; `resolveViewOption` answers for the view.
 *
 * The harmful direction is the narrative case at the foot of this file: locations render in
 * column view and every control for styling them is absent from the editor, so the user can
 * see the thing on screen and has no way to configure it without hand-editing YAML.
 *
 * 🚨 The first version of this file asserted per gate by hand and left `show_countdown`
 * entirely unconstrained — reverting that one argument to a raw read passed all four cases,
 * as did hardcoding four of the five to `false`. Only `show_location` was pinned in both
 * directions, while the file's own comment claimed it asserted the whole set. The hole was
 * not a missing assertion but a misaimed one: the case meant to cover the group checked
 * `progress_bar_height`, which belongs to `show_progress_bar`, so `show_countdown` was
 * never named by anything. That mattered rather than merely reading badly, because
 * `show_countdown_allday` is itself a `COLUMN_OVERRIDE_KEYS` member.
 *
 * So the shape is fixed rather than the count. Each gate is pinned through a field **only
 * that gate controls**, and `isolates its own field` proves the 1:1 rather than asserting
 * it in a comment — a field shared with a second gate would make its row pass for the
 * wrong reason. The table is then reconciled against the source, so a sixth gate cannot be
 * added, nor an existing one dropped, without a row here.
 *
 * The denominator is hand-declared on purpose. Deriving it from the schema's own response
 * to a toggle reads like a reconciliation and is not: a mutation that stops a key gating
 * anything also drops it from a derived denominator, so the test would agree with the bug.
 * There is no runtime enumeration of "gates in this panel", which is the case AGENTS.md
 * answers with an explicit list plus a source check.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import { walkSchema } from '../src/rendering/editor/panels';
import { buildEventsSchema } from '../src/rendering/editor/schemas/events';

/**
 * Every gate the panel resolves per view, and one field each proves reachable.
 *
 * The field must belong to that gate's group and to no other, which `isolates its own
 * field` checks rather than trusting.
 */
/**
 * Each gate carries the values that mean on and off for it, rather than the suite assuming
 * `true` and `false`.
 *
 * Five of the six are booleans and read exactly as they did. `allday_badge` is a string
 * enum whose off value is the word `off`, so a boolean sweep sets it to `true`, the resolver
 * refuses it as outside the closed set, and every arm of this file measures the same
 * switched-off panel while reporting a pass on the two arms that expect one.
 */
const GATES = [
  { gate: 'show_time', field: 'time_font_size', on: true, off: false },
  { gate: 'show_location', field: 'location_font_size', on: true, off: false },
  { gate: 'show_description', field: 'description_font_size', on: true, off: false },
  { gate: 'show_countdown', field: 'show_countdown_allday', on: true, off: false },
  { gate: 'show_progress_bar', field: 'progress_bar_height', on: true, off: false },
  { gate: 'allday_badge', field: 'allday_badge_style', on: 'time', off: 'off' },
] as const;

/**
 * The keys `buildEventsSchema` actually resolves per view, read from the source.
 *
 * Read as text because the call site leaves no runtime trace: the resolved values reach
 * `eventsSchema` as bare booleans, so nothing importable says which keys produced them.
 *
 * @returns Every key passed to `resolveViewOption` inside the builder
 */
function resolvedGateKeys(): string[] {
  const source = readFileSync(
    join(process.cwd(), 'src/rendering/editor/schemas/events.ts'),
    'utf-8',
  );
  const block = source.match(/export function buildEventsSchema\([\s\S]*?\n\}/);

  if (!block) throw new Error('buildEventsSchema not found in events.ts — fix this scan');

  const keys = [...block[0].matchAll(/resolveViewOption\(\s*ctx\.config,\s*'([a-z0-9_]+)'/g)].map(
    (match) => match[1],
  );

  if (keys.length === 0) {
    throw new Error('no resolveViewOption calls found in buildEventsSchema — fix this scan');
  }

  return keys;
}

function fieldNames(schema: ReadonlyArray<HaFormSchema>): string[] {
  return [...walkSchema(schema)]
    .filter(({ node }) => !('schema' in node))
    .map(({ node }) => node.name);
}

function eventsFields(config: Types.Config, view: Types.EffectiveView): string[] {
  return fieldNames(buildEventsSchema({ view, config, language: 'en' }));
}

/** Every gate at `card`, except `gate`, which the `column:` block sets to `column`. */
function split(gate: string, card: boolean, column: boolean): Types.Config {
  const top = Object.fromEntries(GATES.map((g) => [g.gate, card ? g.on : g.off]));
  const row = GATES.find((g) => g.gate === gate);

  if (!row) throw new Error(`unknown gate ${gate} — fix this helper`);

  return buildConfig({
    ...top,
    column: { [gate]: column ? row.on : row.off },
  } as unknown as Partial<Types.Config>);
}

describe('card-level Events panel resolves its gates per view', () => {
  it('resolves exactly the gates this file drives', () => {
    // Both directions. A sixth `resolveViewOption` with no row here is an untested gate; a
    // row whose key stopped being resolved is a test asserting nothing.
    expect([...resolvedGateKeys()].sort()).toEqual([...GATES.map((g) => g.gate)].sort());
  });

  it.each(GATES)('$gate isolates its own field, $field', ({ gate, field }) => {
    // The property every row below depends on: this field answers for this gate and for
    // nothing else. Without it a row can pass because some *other* gate happened to open
    // the same field, which is exactly how `show_countdown` went unpinned.
    const fields = eventsFields(split(gate, true, false), 'column');

    expect(fields).not.toContain(field);
    for (const other of GATES) {
      if (other.gate !== gate) expect(fields).toContain(other.field);
    }
  });

  it.each(GATES)('offers $field in column view when column: { $gate: true }', ({ gate, field }) => {
    expect(eventsFields(split(gate, false, true), 'column')).toContain(field);
  });

  it.each(GATES)('keeps $field in list view when the card sets $gate on', ({ gate, field }) => {
    // A column override must not reach list view in either direction.
    expect(eventsFields(split(gate, true, false), 'list')).toContain(field);
  });

  it.each(GATES)(
    'withholds $field in list view when the card sets $gate off',
    ({ gate, field }) => {
      expect(eventsFields(split(gate, false, true), 'list')).not.toContain(field);
    },
  );

  it('offers location styling in column view when the column override turns locations on', () => {
    // The case a user reported (#557), kept whole: the parameterized rows above read as a
    // matrix, and this is the story they came from.
    const fields = eventsFields(
      buildConfig({
        show_location: false,
        column: { show_location: true },
      } as Partial<Types.Config>),
      'column',
    );

    // The controls the user needed and could not reach.
    expect(fields).toContain('location_font_size');
    expect(fields).toContain('location_color');
  });

  it('empties every gated group at once without emptying the panel', () => {
    const top = Object.fromEntries(GATES.map((g) => [g.gate, true]));
    const off = Object.fromEntries(GATES.map((g) => [g.gate, false]));
    const allOff = buildConfig({ ...top, column: off } as unknown as Partial<Types.Config>);

    const fields = eventsFields(allOff, 'column');

    for (const { field } of GATES) expect(fields).not.toContain(field);

    // Control: the panel is not simply empty — ungated fields survive, so the assertions
    // above are about the gates rather than about the builder having returned nothing.
    expect(fields).toContain('event_font_size');
    expect(fields.length).toBeGreaterThan(GATES.length);
  });
});
