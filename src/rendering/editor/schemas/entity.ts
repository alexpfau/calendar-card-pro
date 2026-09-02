/**
 * Per-calendar entity schema rows.
 */

import { isEntityColorSentinel } from '../../../utils/entity-colors';
import { isEntityIconSentinel } from '../../../utils/entity-icons';
import { isPersonEntityId } from '../../../utils/person-pictures';
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
  replace_field: ['title', 'location', 'description'],
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
  // Its own entry rather than a share of `filter_field`'s, per the note above, even though
  // the two are identical today. They answer different questions about the same three
  // fields, and a shared table would make the next divergence a silent one.
  replace_field: { title: undefined, location: 'location', description: 'description' },
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
  replace_field: 'title',
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

export const LABEL_ICON_SOURCE = 'label_icon_source';

export const LABEL_IMAGE_SOURCE = 'label_image_source';

/**
 * Where an icon label's value comes from.
 *
 * Two rather than the accent color's three: there is no card-wide label to inherit, so
 * "follow the card" would name nothing. Same vocabulary as the accent control for the mode
 * the two share, because they mean the same thing one option apart.
 */
const LABEL_ICON_SOURCES: ReadonlyArray<string> = ['home_assistant', 'custom'];

/**
 * Where one calendar's icon label comes from, read off the value's shape.
 *
 * @param label - The calendar's stored `label`
 * @returns Which icon-source control that calendar renders
 */
export function labelIconSourceOf(label: unknown): string {
  return isEntityIconSentinel(label) ? 'home_assistant' : 'custom';
}

/**
 * Where an image label's value comes from.
 *
 * Two, like the icon source and unlike the accent color's three, for the same reason: there
 * is no card-wide label to inherit.
 *
 * 🚨 `custom` leads here where `home_assistant` leads there, and the order is the vocabulary
 * rather than a slip. The icon source's first entry is its *default* — an icon label with no
 * further instruction follows Home Assistant — while an image label with no further
 * instruction is an address the user typed. Listing the derived-by-default mode first in each
 * keeps the dropdown's first row and the calendar's actual state in agreement.
 */
const LABEL_IMAGE_SOURCES: ReadonlyArray<string> = ['custom', 'person'];

/**
 * Where one calendar's image label comes from, read off the value's shape.
 *
 * The same never-stored contract as {@link labelIconSourceOf}: a person's picture is asked
 * for by storing the person's entity id under `label`, so the mode is derived from that value
 * and writing it would put a key in the user's YAML the card never reads.
 *
 * @param label - The calendar's stored `label`
 * @returns Which image-source control that calendar renders
 */
export function labelImageSourceOf(label: unknown): string {
  return isPersonEntityId(label) ? 'person' : 'custom';
}

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
 * 🚨 **Every control that stores nothing of its own needs an entry here**, and the two that
 * do are the two halves of one feature — following Home Assistant for an icon, and for a
 * colour. `isEntityFieldCustomized` asks this which keys a field answers for and then looks
 * them up in the stored calendar; a derived control left to answer for itself names a key
 * no configuration ever carries, so it reads as untouched forever and *Customized Only*
 * hides it.
 *
 * That is not a cosmetic loss, because `entitySchemaFor` drops the value field in exactly
 * the modes where the derived control is the only thing left. A calendar following Home
 * Assistant for its accent colour kept **nothing** — `hasFields` then returned false and
 * `element.ts` dropped the whole panel, so a calendar the user had configured vanished from
 * a filter whose entire promise is to show what they configured, along with the only
 * control that could stop it following.
 *
 * `tests/editor-derived-field-mapping.test.ts` reconciles this function against
 * `EntityConfig`, so the next derived control fails a test rather than shipping. The
 * comment below was written for `label_icon_source` and was correct; `accent_color_mode`
 * arrived weeks later in its own pull request and was never added to it, which is why the
 * reconciliation exists and this note does not simply say "remember".
 *
 * @param name - Per-calendar field name
 * @returns The config keys it configures
 */
export function entityConfigKeys(name: string): ReadonlyArray<string> {
  // `label_icon_source` joins the pair rather than standing alone: it has no config key of
  // its own, and the value it decides is `label`. Left out, a calendar following Home
  // Assistant would never be marked as having configured its label — the sentinel is stored
  // under `label`, which only this mapping reaches from this field.
  if (name === LABEL_TYPE || name === 'label' || name === LABEL_ICON_SOURCE) {
    return [LABEL_TYPE, 'label'];
  }

  // The third member of that family, and the reason the note above stops saying "remember".
  // `label_image_source` decides `label` exactly as the icon source does — a person's picture
  // is stored as the person's entity id under `label` — so it answers for the same two keys.
  if (name === LABEL_IMAGE_SOURCE) {
    return [LABEL_TYPE, 'label'];
  }

  // The same contract one field over: the mode is read off `accent_color`'s shape and never
  // written, so `accent_color` is the only key that can answer for it.
  if (name === ACCENT_COLOR_MODE) return ['accent_color'];

  return [name];
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
 * @param iconSourceField - The icon-source dropdown, taken from the declared schema
 * @param iconSource - Where an icon label's value comes from
 * @param imageSourceField - The image-source dropdown, taken from the declared schema
 * @param imageSource - Where an image label's value comes from
 * @returns The fields to render under the type dropdown
 */
function labelFields(
  type: string,
  iconSourceField: HaFormSchema | undefined,
  iconSource: string,
  imageSourceField: HaFormSchema | undefined,
  imageSource: string,
): HaFormSchema[] {
  if (type === 'icon') {
    return [
      // The source qualifies the picker below it, so it precedes it — the same reason
      // `filter_field` precedes `blocklist` and `allowlist`. A reader who meets the picker
      // first has already assumed the icon is theirs to choose.
      ...(iconSourceField ? [iconSourceField] : []),
      // Following Home Assistant, there is no icon to pick: the picker would show an empty
      // box beside a rendered icon it did not choose, which is the control contradicting the
      // card. `accent_color` is dropped the same way when its own mode is not `custom`.
      ...(iconSource === 'home_assistant'
        ? []
        : [{ name: 'label', selector: { icon: {} } } as SelectorSchema]),
      // Kept in both modes on purpose: tinting an inherited icon is still the card's choice,
      // and the color is stored under a key of its own that the source never touches.
      text('label_icon_color'),
    ];
  }

  if (type === 'image') {
    return [
      // Precedes its control for the icon source's reason, one shape up: it says what the
      // control below is *for*, and a reader who meets a path field first has already assumed
      // the address is theirs to type.
      ...(imageSourceField ? [imageSourceField] : []),
      // 🚨 Both modes keep a control, where the icon source drops its picker in the mode that
      // follows Home Assistant. The asymmetry is real rather than an oversight: an icon label
      // following Home Assistant has nothing left to choose — the *calendar* decides it — but
      // a person's picture still needs somebody named, and the person is what the picker
      // picks. Dropping it would leave the mode unable to say who.
      imageSource === 'person'
        ? ({
            name: 'label',
            selector: { entity: { filter: { domain: 'person' } } },
          } as SelectorSchema)
        : text('label'),
    ];
  }

  return type === 'none' ? [] : [text('label')];
}

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
 * `Text Replacement` is likewise outside it, and is the one category this panel carries
 * that the card-level one does not. It rewrites what a row says rather than deciding which
 * rows there are, so it belongs to no stage of that pipeline — it sits beside the filters
 * because the two share a grammar, not because the spine puts it there. The spine is
 * intact either way: filtering still precedes multi-day handling in both panels.
 *
 * @param ctx - Schema context
 * @returns The per-calendar schema, with the label fields of every shape
 */
export function buildEntitySchema(ctx: SchemaCtx): HaFormSchema[] {
  return [
    heading('heading_appearance'),
    labelType(ctx.language),
    labelIconSource(ctx.language),
    labelImageSource(ctx.language),
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

    // Adjacent to the filters on purpose, and this is the one place the per-calendar order
    // departs from the card-level panel's — which the shared spine permits, because that
    // comment objects to the two panels being read in *different orders*, not to a
    // per-calendar-only section sitting between two shared ones. Filtering still precedes
    // multi-day handling in both; only what falls between them differs.
    //
    // These three and the three above it are near-identical in shape — a field selector,
    // then user-supplied regular expressions compiled against that field's text. Someone
    // who has just learned the pattern grammar in one finds the other immediately, which is
    // worth more than keeping the structural section where it was.
    //
    // `replace_field` leads for `filter_field`'s reason one section up: it qualifies the two
    // below it rather than doing anything itself, and a reader who meets `Find` first has
    // already assumed it searches the title.
    heading('heading_replace'),
    choice(ctx.language, 'replace_field'),
    text('replace_pattern'),
    text('replace_with'),

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
 * The dropdown naming where a calendar's image label comes from.
 *
 * @param language - Effective language code
 * @returns The field
 */
function labelImageSource(language: string): SelectorSchema {
  return {
    name: LABEL_IMAGE_SOURCE,
    selector: {
      select: {
        mode: 'dropdown',
        options: LABEL_IMAGE_SOURCES.map((value) => ({
          value,
          label:
            lookup(language, `entity.${LABEL_IMAGE_SOURCE}.option.${value}.label`) ??
            humanize(value),
        })),
      },
    },
  };
}

/**
 * The dropdown naming where a calendar's icon label comes from.
 *
 * @param language - Effective language code
 * @returns The field
 */
function labelIconSource(language: string): SelectorSchema {
  return {
    name: LABEL_ICON_SOURCE,
    selector: {
      select: {
        mode: 'dropdown',
        options: LABEL_ICON_SOURCES.map((value) => ({
          value,
          label:
            lookup(language, `entity.${LABEL_ICON_SOURCE}.option.${value}.label`) ??
            humanize(value),
        })),
      },
    },
  };
}

/**
 * Narrows the declared schema to the fields one calendar's choices call for.
 *
 * 🚨 `imageSource` is appended rather than filed beside `iconSource`, where it belongs by
 * topic. Every parameter after the second has a default and is passed positionally by both
 * `element.ts` and the schema tests, so inserting one in the middle would silently re-read
 * an existing `showsLocation` argument as an image source — a change no signature check can
 * see, because both are strings-or-booleans arriving at a parameter that has a default.
 *
 * @param schema - The per-calendar schema, as declared
 * @param type - Shape this calendar's label holds
 * @param accentMode - Where this calendar's accent color comes from
 * @param iconSource - Where this calendar's icon label comes from
 * @param showsLocation - Whether this calendar's events draw a location row at all
 * @param imageSource - Where this calendar's image label comes from
 * @returns The schema this calendar renders
 */
export function entitySchemaFor(
  schema: ReadonlyArray<HaFormSchema>,
  type: string,
  accentMode: string = 'custom',
  iconSource: string = 'custom',
  showsLocation: boolean = true,
  imageSource: string = 'custom',
): HaFormSchema[] {
  const replaced = new Set([LABEL_ICON_SOURCE, LABEL_IMAGE_SOURCE, 'label', 'label_icon_color']);

  // Taken from the declared schema rather than rebuilt, because this function is handed no
  // language and rebuilding one here would render the only unlocalized control on the panel.
  const iconSourceField = schema.find((node) => node.name === LABEL_ICON_SOURCE);
  const imageSourceField = schema.find((node) => node.name === LABEL_IMAGE_SOURCE);

  let inserted = false;

  return schema.flatMap((node) => {
    // The colour field only means anything when this calendar names its own colour.
    if (node.name === 'accent_color') return accentMode === 'custom' ? [node] : [];

    // Nor does the location icon, when this calendar draws no location row. It replaces the
    // marker on that row, so with the row gone it decorates nothing — the same reason the
    // card-level panel drops its location styling behind `show_location`, and what the
    // chassis promises in `filter.gated_note`. `showsLocation` resolves the tri-state
    // against the card *for the view being edited*, so a calendar left on "Follow the card"
    // hides it exactly when the card would draw no location either.
    if (node.name === 'location_icon') return showsLocation ? [node] : [];

    if (!replaced.has(node.name)) return [node];
    if (inserted) return [];

    inserted = true;
    return labelFields(type, iconSourceField, iconSource, imageSourceField, imageSource);
  });
}
