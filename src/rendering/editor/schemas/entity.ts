/**
 * Per-calendar entity schema rows.
 */

import { isEntityColorSentinel } from '../../../utils/entity-colors';
import type { HaFormSchema, SelectorSchema } from '../ha-form';
import { humanize, lookup } from '../localize';
import type { SchemaCtx } from '../panels';
import { heading, row, text } from './common';

export const INHERIT = 'inherit';

export const ENTITY_TRISTATE_VALUES: Readonly<Record<string, ReadonlyArray<string>>> = {
  show_time: [INHERIT, 'show', 'hide'],
  show_location: [INHERIT, 'show', 'hide'],
  show_description: [INHERIT, 'show', 'hide'],
  split_multiday_events: [INHERIT, 'split', 'whole'],
  event_type: [INHERIT, 'all', 'timed', 'all_day'],
  days_of_week: [INHERIT, 'weekdays', 'weekends'],
  filter_field: ['title', 'location', 'description'],
};

/**
 * What each dropdown value stores, per option.
 *
 * 🚨 Keyed by option first, and it has to stay that way. A single flat value→stored table
 * works only while every option stores a boolean; `event_type` stores strings, so a flat
 * table would have to widen to `boolean | string | undefined` — and at that width the
 * dropdown values become a shared namespace across unrelated options.
 *
 * The hazard is not hypothetical. `hide` already means `false` to three options above, and
 * this key was first drafted with the values `all` / `only` / `hide`. Flat, its `hide`
 * would have resolved to `false`, `toEntityFormData` would have found no value whose
 * stored form matched, fallen back to `inherit`, and the next write would have dropped the
 * key — so a configured filter would vanish from the user's YAML the first time they
 * opened the editor. The values changed before shipping; the shape is what keeps the next
 * string-valued option safe.
 */
export const ENTITY_TRISTATE_STORED: Readonly<
  Record<string, Readonly<Record<string, boolean | string | undefined>>>
> = {
  show_time: { [INHERIT]: undefined, show: true, hide: false },
  show_location: { [INHERIT]: undefined, show: true, hide: false },
  show_description: { [INHERIT]: undefined, show: true, hide: false },
  split_multiday_events: { [INHERIT]: undefined, split: true, whole: false },
  event_type: { [INHERIT]: undefined, all: 'all', timed: 'timed', all_day: 'all_day' },
  // Its own mapping rather than a share of `event_type`'s, which is what the note above
  // is for: both store `all`, and a shared table would then have to agree on `weekdays`
  // and `all_day` too. Keyed per option, the two cannot collide however they are spelled.
  days_of_week: { [INHERIT]: undefined, weekdays: 'weekdays', weekends: 'weekends' },
  // The absent state is a *named field* here rather than an unfiltered one, so `title`
  // both stands for it and stores nothing — see `ENTITY_TRISTATE_DEFAULT` below.
  filter_field: { title: undefined, location: 'location', description: 'description' },
};

/**
 * The dropdown value each option shows when the calendar stores nothing.
 *
 * Almost always `inherit`, which is why it was hardcoded until `filter_field` arrived.
 * That option has no card to inherit from and its absent state is not an *unfiltered*
 * state but a real field — the title — that a user may equally well write out. Spelling
 * it `inherit` would put a fourth entry in a three-way choice; giving `title` a stored
 * form of its own would write `filter_field: title` into the YAML of every calendar whose
 * panel is ever opened.
 *
 * Naming the fallback per option resolves both at once, and resolves a third case for
 * free: a calendar that *does* carry an explicit `filter_field: title` matches no stored
 * form, falls back here, and lands on `title` — the value it actually holds. Under the old
 * hardcoded fallback it landed on `inherit`, which no longer appears in that dropdown, and
 * the control would have rendered blank.
 *
 * 🚨 This is what keeps the {@link ENTITY_TRISTATE_STORED} docblock's rule intact rather
 * than bending it: one dropdown entry per behavior, still, in both directions.
 */
export const ENTITY_TRISTATE_DEFAULT: Readonly<Record<string, string>> = {
  filter_field: 'title',
};

/**
 * A dropdown over one option's stored states.
 *
 * Named for what it builds rather than for `inherit`, which most but no longer all of
 * these carry: `filter_field` chooses between three real fields and has no card to defer
 * to. The vocabulary and the stored form both come from the tables above, so a control
 * with an `inherit` entry and one without differ only in their data.
 *
 * @param language - Effective language code
 * @param name - Per-entity config key
 * @returns The field
 */
function choice(language: string, name: string): SelectorSchema {
  return {
    name,
    selector: {
      select: {
        mode: 'dropdown',
        options: ENTITY_TRISTATE_VALUES[name].map((value) => ({
          value,
          label: lookup(language, `entity.${name}.option.${value}.label`) ?? humanize(value),
        })),
      },
    },
  };
}

export const LABEL_TYPE = 'label_type';

export const ACCENT_COLOR_MODE = 'accent_color_mode';

/**
 * Per-calendar accent modes. Three here, unlike the card-wide control: a calendar can defer
 * to the card, which the card itself has nothing to do.
 */
const ACCENT_COLOR_MODES: ReadonlyArray<string> = [INHERIT, 'home_assistant', 'custom'];

/**
 * The mode one calendar's accent color is in, read off the value's shape.
 *
 * @param accentColor - The calendar's stored `accent_color`
 * @returns Which accent control that calendar renders
 */
export function accentColorModeOf(accentColor: unknown): string {
  if (accentColor === undefined || accentColor === null || accentColor === '') return INHERIT;
  return isEntityColorSentinel(accentColor) ? 'home_assistant' : 'custom';
}

const LABEL_TYPES: ReadonlyArray<'none' | 'text' | 'icon' | 'image'> = [
  'none',
  'text',
  'icon',
  'image',
];

/**
 * The config keys a per-calendar form field answers for.
 *
 * @param name - Per-calendar field name
 * @returns The config keys it configures
 */
export function entityConfigKeys(name: string): ReadonlyArray<string> {
  return name === LABEL_TYPE || name === 'label' ? [LABEL_TYPE, 'label'] : [name];
}

/**
 * The dropdown naming the shape of a calendar's label.
 *
 * @param language - Effective language code
 * @returns The field
 */
function labelType(language: string): SelectorSchema {
  return {
    name: LABEL_TYPE,
    selector: {
      select: {
        mode: 'dropdown',
        options: LABEL_TYPES.map((value) => ({
          value,
          label: lookup(language, `entity.${LABEL_TYPE}.option.${value}.label`) ?? humanize(value),
        })),
      },
    },
  };
}

/**
 * The label fields for one shape.
 *
 * @param type - Shape the label currently holds
 * @returns The fields to render under the type dropdown
 */
function labelFields(type: string): SelectorSchema[] {
  if (type === 'icon') {
    return [{ name: 'label', selector: { icon: {} } }, text('label_icon_color')];
  }

  return type === 'none' ? [] : [text('label')];
}

/**
 * Builds the schema rendered for each configured calendar.
 *
 * @param ctx - Schema context
 * @returns The per-calendar schema, with the label fields of every shape
 */
/**
 * Builds the schema rendered for each configured calendar.
 *
 * Ordered on the same spine as the card-level content group, because the two panels
 * configure the same pipeline and reading them differently is what made the editor hard
 * to scan: **which events qualify → how they are arranged across days → what each row
 * carries**. Every category shared with the card-level panel appears in the same relative
 * order there, and the keys inside a shared category start the same way.
 *
 * `Label & Colors` leads, and is deliberately *outside* that spine rather than an
 * exception to it. It selects nothing, arranges nothing and populates nothing — it names
 * which calendar is being edited. Identity precedes configuration, which is also why the
 * card-level panel has no counterpart: a card is not one of several.
 *
 * @param ctx - Schema context
 * @returns The per-calendar schema, with the label fields of every shape
 */
export function buildEntitySchema(ctx: SchemaCtx): HaFormSchema[] {
  return [
    heading('heading_appearance'),
    labelType(ctx.language),
    text('label'),
    text('label_icon_color'),
    row(text('color'), accentColorMode(ctx.language)),
    text('accent_color'),

    // Ordered coarse-to-fine by **scope**, per _Where a new option goes is a decision, not
    // a default_ in `AGENTS.md`: which days qualify at all → which class of event → when
    // those events stop counting → which field the patterns read → which values survive →
    // how many of the survivors fit.
    //
    // 🚨 Not pipeline order, which is what an earlier draft of this list used and which put
    // both new options after the pattern fields. `days_of_week` is resolved *last* of these
    // and belongs *first*, because it is the broadest question a reader asks; which options
    // resolve at fetch time and which at render time is invisible to them and should stay
    // that way. `compact_events_to_show` is last under either reading — it is a budget over
    // the result set rather than a predicate over an event.
    //
    // `filter_field` is the one entry here that is not a predicate at all: it qualifies the
    // two that follow it, and so has to precede them. A reader who meets `blocklist` first
    // has already assumed it matches the title — which is precisely the misreading that
    // gave #205 a title about filtering when its body asked for an icon.
    //
    // The card-level group leads with `event_type` rather than diverging: it has no
    // `days_of_week` or `allday_expires_at` to precede it, so it too opens with the
    // coarsest option it actually carries.
    heading('heading_filters'),
    choice(ctx.language, 'days_of_week'),
    choice(ctx.language, 'event_type'),
    { name: 'allday_expires_at', selector: { text: { type: 'time' } } },
    choice(ctx.language, 'filter_field'),
    text('blocklist'),
    text('allowlist'),
    {
      name: 'compact_events_to_show',
      selector: { number: { min: 0, mode: 'box' } },
    },

    heading('heading_multiday'),
    choice(ctx.language, 'split_multiday_events'),

    // `location_icon` sits under the switch that decides whether there is a location row
    // at all, for the same coarse-to-fine reason: whether the row appears, then what it
    // carries. Appending it after `show_description` would separate it from the only
    // option it means anything alongside.
    heading('heading_details'),
    choice(ctx.language, 'show_time'),
    choice(ctx.language, 'show_location'),
    { name: 'location_icon', selector: { icon: {} } },
    choice(ctx.language, 'show_description'),
  ];
}

/**
 * The dropdown naming where a calendar's accent color comes from.
 *
 * @param language - Effective language code
 * @returns The field
 */
function accentColorMode(language: string): SelectorSchema {
  return {
    name: ACCENT_COLOR_MODE,
    selector: {
      select: {
        mode: 'dropdown',
        options: ACCENT_COLOR_MODES.map((value) => ({
          value,
          label:
            lookup(language, `entity.${ACCENT_COLOR_MODE}.option.${value}.label`) ??
            humanize(value),
        })),
      },
    },
  };
}

/**
 * Narrows the declared schema to the fields one calendar's choices call for.
 *
 * @param schema - The per-calendar schema, as declared
 * @param type - Shape this calendar's label holds
 * @param accentMode - Where this calendar's accent color comes from
 * @returns The schema this calendar renders
 */
export function entitySchemaFor(
  schema: ReadonlyArray<HaFormSchema>,
  type: string,
  accentMode: string = 'custom',
): HaFormSchema[] {
  const replaced = new Set(['label', 'label_icon_color']);
  let inserted = false;

  return schema.flatMap((node) => {
    // The colour field only means anything when this calendar names its own colour.
    if (node.name === 'accent_color') return accentMode === 'custom' ? [node] : [];

    if (!replaced.has(node.name)) return [node];
    if (inserted) return [];

    inserted = true;
    return labelFields(type);
  });
}
