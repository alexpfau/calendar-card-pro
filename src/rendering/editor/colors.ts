/**
 * The composed color control's data (backlog item 307, D13).
 *
 * Every color field is drawn as one control: the rows a field's own values offer (Default, Follow
 * Home Assistant, Calendar Color…), Home Assistant's named swatches, and Custom with a text field
 * that writes only what the card can draw. Which fields get it is never listed:
 * `schemas/common.ts` › `color` marks the nodes it builds, and a spec is made here for each marked
 * field, absorbing the mode field that chooses its source where there is one (`accent_color_mode`,
 * `allday_badge_color_mode`).
 *
 * No DOM and no Lit here, so the tests can call it directly; `CSS.supports` is the one browser
 * call, behind a default a caller can replace.
 */

import {
  type FieldId,
  type FieldIndex,
  type IndexedField,
  buildFieldIndex,
  entityFieldIndex,
  fieldId,
  parseFieldId,
} from './field-index';
import { lookup } from './localize';
import type { SchemaCtx } from './panels';
import { isColorNode } from './schemas/common';
import { buildEntitySchema } from './schemas/entity';
import { interpolate } from './strings';
import * as Synthetic from './synthetic';
import type { WriteOwner } from './write-frames';
import * as Config from '../../config/config';
import type * as Types from '../../config/types';
import {
  ACCENT_TEXT_SENTINEL,
  ENTITY_COLOR_SENTINEL,
  THEME_COLOR_TOKENS,
} from '../../utils/entity-colors';
import { resolveAlldayBadgeColor } from '../../utils/helpers';
import { ACCENT_TEXT_KEYS } from '../accent-text';

export { isColorNode };

/** Where a color comes from, when it is not one the user picked. */
export type ColorSource = 'default' | 'follow-card' | 'follow-ha' | 'calendar-accent' | 'row-text';

/** One color field's control: what it stores, what it absorbs and which rows it offers. */
export interface ColorSpec {
  /** The text field that stores the color. */
  readonly value: FieldId;
  /** A mode field the control absorbs, which the builders still declare. */
  readonly mode?: FieldId;
  /** The rows above the swatches, in order, with what each writes; one undo step either way. */
  readonly sources: ReadonlyArray<{
    readonly source: ColorSource;
    readonly write: Readonly<Record<FieldId, unknown>> | 'reset';
  }>;
  /** What a swatch or Custom writes besides the value: the absorbed mode's own custom value. */
  readonly custom: Readonly<Record<FieldId, unknown>>;
  /** The card's own values valid in this field, which `CSS.supports` does not know. */
  readonly sentinels: ReadonlyArray<string>;
}

/**
 * The 19 hues of Home Assistant's color picker the control offers as swatches (D13), in its order:
 * every token of `entity-colors.ts` › `THEME_COLOR_TOKENS` that is a hue, without `light-grey` and
 * `dark-grey`. A swatch writes `var(--<token>-color)`, which follows the theme.
 */
export const SWATCH_TOKENS: ReadonlyArray<string> = [
  'red',
  'pink',
  'purple',
  'deep-purple',
  'indigo',
  'blue',
  'light-blue',
  'cyan',
  'teal',
  'green',
  'light-green',
  'lime',
  'yellow',
  'amber',
  'orange',
  'deep-orange',
  'brown',
  'grey',
  'blue-grey',
];

/** Home Assistant's own string for a theme color's name, its color picker's. */
export const HA_COLOR_NAME_PREFIX = 'ui.components.color-picker.colors.';

/**
 * What a swatch writes.
 *
 * @param token - One of `SWATCH_TOKENS`
 * @returns The CSS value
 */
export function swatchValue(token: string): string {
  return `var(--${token}-color)`;
}

/**
 * The English fallback key for a swatch's name, read when Home Assistant has none.
 *
 * @param token - One of `SWATCH_TOKENS`
 * @returns The key, `color.name.deep_purple`
 */
export function swatchNameKey(token: string): string {
  return `color.name.${token.replace(/-/g, '_')}`;
}

/**
 * Every color field's spec, from the nodes `color()` marked: keyed by the value field, and by the
 * mode field it absorbs, so either id finds it.
 *
 * @param index - Every field an owner can draw: a workspace's universe, or an entry's declared
 * fields, so a spec exists while its value field is gated off
 * @returns Specs by field id
 */
export function colorSpecs(index: FieldIndex): ReadonlyMap<FieldId, ColorSpec> {
  const specs = new Map<FieldId, ColorSpec>();
  for (const field of index.fields.values()) {
    if (!isColorNode(field.node)) continue;
    const { scope } = parseFieldId(field.id);
    const name = field.node.name;
    const modeId = fieldId(scope, field.dataPath, `${name}_mode`);
    const mode = index.fields.has(modeId) ? modeId : undefined;
    const spec = specFor(field.id, name, scope, mode);
    specs.set(field.id, spec);
    if (mode !== undefined) specs.set(mode, spec);
  }
  return specs;
}

/**
 * One field's spec, by its name and where it is drawn.
 *
 * @param value - The value field
 * @param name - Its name, the configuration key
 * @param scope - Its id's scope
 * @param mode - The mode field it absorbs, if any
 * @returns The spec
 */
function specFor(
  value: FieldId,
  name: string,
  scope: string,
  mode: FieldId | undefined,
): ColorSpec {
  if (mode !== undefined && name === 'accent_color') {
    const entry = scope === 'calendar';
    return {
      value,
      mode,
      sources: entry
        ? [
            { source: 'follow-card', write: { [mode]: 'inherit' } },
            { source: 'follow-ha', write: { [mode]: 'home_assistant' } },
          ]
        : [
            { source: 'default', write: 'reset' },
            { source: 'follow-ha', write: { [mode]: 'home_assistant' } },
          ],
      custom: { [mode]: 'custom' },
      sentinels: [ENTITY_COLOR_SENTINEL],
    };
  }
  if (mode !== undefined) {
    // The all-day badge: its two keywords are its rows, and the card honors both as typed.
    return {
      value,
      mode,
      sources: [
        { source: 'calendar-accent', write: { [mode]: 'accent' } },
        { source: 'row-text', write: { [mode]: 'text' } },
      ],
      custom: { [mode]: 'custom' },
      sentinels: ['accent', 'text'],
    };
  }
  const accentText =
    (scope === 'events' && ACCENT_TEXT_KEYS.includes(name)) ||
    value === 'weather:weather.event.color';
  if (accentText) {
    return {
      value,
      sources: [
        { source: 'default', write: 'reset' },
        { source: 'calendar-accent', write: { [value]: ACCENT_TEXT_SENTINEL } },
      ],
      custom: {},
      sentinels: [ACCENT_TEXT_SENTINEL],
    };
  }
  return { value, sources: [{ source: 'default', write: 'reset' }], custom: {}, sentinels: [] };
}

/** An owner's color specs, with the fields they name, the gated-off value fields included. */
export interface ColorFields {
  readonly specs: ReadonlyMap<FieldId, ColorSpec>;
  readonly fields: ReadonlyMap<FieldId, IndexedField>;
}

/**
 * The value fields a mode gates off, by what decides them: which modes are drawn, in which
 * language and workspace. A spec reads only ids, names and nodes, never a value, so a render that
 * moves a value builds nothing again.
 */
const opened = new Map<string, ReadonlyMap<FieldId, IndexedField>>();

/**
 * The card's color specs for a context: from the fields built for it, and from the fields built
 * again with every mode that offers a custom value set to it, which draws the value field a mode
 * gates off (`events:accent_color` while Follow Home Assistant is chosen), so the mode's control
 * knows what it stores. The gate corpus would give the same, at the cost of building it.
 *
 * @param ctx - Schema context
 * @returns The specs and fields
 */
export function cardColorFields(ctx: SchemaCtx): ColorFields {
  const present = buildFieldIndex(ctx);
  const modes = [...present.fields.values()].filter((field) => {
    if (field.dataPath.length > 0 || !Synthetic.isSyntheticKey(field.node.name)) return false;
    const select = 'select' in field.node.selector ? field.node.selector.select : undefined;
    return select?.options?.some(
      (option) => (typeof option === 'string' ? option : option.value) === 'custom',
    );
  });
  const key = [ctx.language, ctx.workspace ?? ctx.view, ...modes.map((field) => field.id)].join(
    '|',
  );
  let more = opened.get(key);
  if (more === undefined) {
    let config = ctx.config;
    for (const field of modes) {
      const changes = Synthetic.applySyntheticChange(field.node.name, 'custom', config).changes;
      config = { ...config, ...changes };
    }
    more = modes.length === 0 ? new Map() : buildFieldIndex({ ...ctx, config }).fields;
    opened.set(key, more);
  }
  const fields = new Map([...more, ...present.fields]);
  return { specs: colorSpecs({ fields }), fields };
}

/**
 * A calendar entry's color specs: every entry declares every field.
 *
 * @param ctx - Schema context
 * @returns The specs and fields
 */
export function entryColorFields(ctx: SchemaCtx): ColorFields {
  const { fields } = entityFieldIndex(buildEntitySchema(ctx));
  return { specs: colorSpecs({ fields }), fields };
}

/** A choice the control shows as chosen. */
export type ColorChoice =
  | { readonly kind: 'source'; readonly source: ColorSource }
  | { readonly kind: 'swatch'; readonly token: string }
  | { readonly kind: 'custom' };

/**
 * Whether a value is unset.
 *
 * @param value - A stored or projected value
 * @returns True for nothing, or blank text
 */
function unset(value: unknown): boolean {
  return (
    value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
  );
}

/**
 * Whether a value is one source's.
 *
 * @param source - The source
 * @param value - The value
 * @param spec - The field's spec
 * @param fallback - What the field shows with nothing stored, if anything
 * @returns True where the source's row is the one chosen
 */
function isSource(
  source: ColorSource,
  value: unknown,
  spec: ColorSpec,
  fallback: unknown,
): boolean {
  const text = typeof value === 'string' ? value.trim() : value;
  switch (source) {
    case 'default':
      return unset(text) || (fallback !== undefined && text === fallback);
    case 'follow-card':
      return unset(text);
    case 'follow-ha':
      return text === ENTITY_COLOR_SENTINEL;
    case 'calendar-accent':
      return spec.mode !== undefined
        ? resolveAlldayBadgeColor(value).source === 'accent'
        : text === ACCENT_TEXT_SENTINEL;
    case 'row-text':
      return resolveAlldayBadgeColor(value).source === 'text';
  }
}

/**
 * Which row or swatch a value is: a source's, a swatch's (`var(--pink-color)`), else Custom.
 *
 * @param value - The value the field holds, stored or projected
 * @param spec - The field's spec
 * @param fallback - What the field shows with nothing stored, so that value reads as Default
 * @returns The choice
 */
export function choiceOf(value: unknown, spec: ColorSpec, fallback?: unknown): ColorChoice {
  for (const { source } of spec.sources) {
    if (isSource(source, value, spec, fallback)) return { kind: 'source', source };
  }
  const text = typeof value === 'string' ? value.trim() : '';
  const token = SWATCH_TOKENS.find((each) => swatchValue(each) === text);
  return token === undefined ? { kind: 'custom' } : { kind: 'swatch', token };
}

/**
 * Whether the browser can draw a color, where it can say; everywhere else, yes, so typing is
 * never blocked.
 *
 * @param text - The text
 * @returns Whether it is a CSS color
 */
export function cssSupportsColor(text: string): boolean {
  const css = (globalThis as { CSS?: { supports?: (property: string, value: string) => boolean } })
    .CSS;
  return typeof css?.supports === 'function' ? css.supports('color', text) : true;
}

/**
 * Whether text is a color the card can draw in this field: a CSS color (a `var(--…)` reference
 * included), or one of the card's own values where the card honors it.
 *
 * @param text - What was typed
 * @param spec - The field's spec
 * @param supports - The CSS check, `CSS.supports('color', …)` unless given
 * @returns True to write it
 */
export function validColor(
  text: string,
  spec: ColorSpec,
  supports: (text: string) => boolean = cssSupportsColor,
): boolean {
  const trimmed = text.trim();
  if (trimmed === '') return false;
  if (spec.sentinels.includes(trimmed)) return true;
  // The card's own words are colors only where it honors them; CSS reads no meaning into them.
  if (trimmed === ACCENT_TEXT_SENTINEL || trimmed === ENTITY_COLOR_SENTINEL) return false;
  return supports(trimmed);
}

/** Theme variables the card's defaults use, by the key of the name they read as. */
export const COLOR_THEME_NAMES: Readonly<Record<string, string>> = {
  'primary-color': 'color.theme.primary',
  'primary-text-color': 'color.theme.primary_text',
  'secondary-text-color': 'color.theme.secondary_text',
  'divider-color': 'color.theme.divider',
  'ha-card-background': 'color.theme.card_background',
  'card-background-color': 'color.theme.card_background',
};

/** How a described value reads a theme color's name: Home Assistant's own, else none. */
export type ColorNamer = (token: string) => string | undefined;

/**
 * A swatch's name: Home Assistant's own where it has one, else the card's English one.
 *
 * @param token - One of `SWATCH_TOKENS`
 * @param language - The editor's language
 * @param haName - Home Assistant's names
 * @returns The name
 */
export function swatchName(token: string, language: string, haName?: ColorNamer): string {
  return haName?.(token) ?? lookup(language, swatchNameKey(token)) ?? token;
}

/**
 * The label of a source's row.
 *
 * @param source - The source
 * @param spec - The field's spec
 * @param language - The editor's language
 * @returns The label
 */
export function sourceLabel(source: ColorSource, spec: ColorSpec, language: string): string {
  const entry = parseFieldId(spec.value).scope === 'calendar';
  const label =
    source === 'default'
      ? lookup(language, 'color.default')
      : source === 'follow-card'
        ? lookup(language, 'entity.accent_color_mode.option.inherit.label')
        : source === 'follow-ha'
          ? entry
            ? lookup(language, 'entity.accent_color_mode.option.home_assistant.label')
            : lookup(language, 'accent_color_mode.option.home_assistant.label')
          : source === 'row-text'
            ? lookup(language, 'allday_badge_color_mode.option.text.label')
            : spec.mode !== undefined
              ? lookup(language, 'allday_badge_color_mode.option.accent.label')
              : lookup(language, 'color.calendar_color');
  return label ?? source;
}

/** `color-mix(in srgb, <color> <n>%, transparent)`, the card's own way of writing a softer color. */
const MIX = /^color-mix\(\s*in\s+srgb\s*,\s*(.+?)\s+(\d+(?:\.\d+)?)%\s*,\s*transparent\s*\)$/i;

/** `var(--<name>)` or `var(--<name>, <fallback>)`. */
const VARIABLE = /^var\(\s*--([a-z0-9-]+)\s*(?:,[^)]*)?\)$/i;

/**
 * Names a value for the closed control, a section row's summary, search results and the audit: a
 * swatch by its color name, a source's value by its row ("Calendar Color"), a theme variable by
 * name ("Primary Text"), `color-mix(…, var(--divider-color) 50%, transparent)` as "Divider, 50%",
 * anything else as written. An unset field reads as what it falls back to, or "Not Set".
 *
 * @param value - The value
 * @param spec - The field's spec
 * @param language - The editor's language
 * @param options - What the field shows with nothing stored, and Home Assistant's color names
 * @returns The words
 */
export function describeColor(
  value: unknown,
  spec: ColorSpec,
  language: string,
  options: { readonly fallback?: unknown; readonly haName?: ColorNamer } = {},
): string {
  const choice = choiceOf(value, spec);
  if (choice.kind === 'source') {
    if (choice.source !== 'default') return sourceLabel(choice.source, spec, language);
    if (!unset(options.fallback)) return describeText(String(options.fallback), language, options);
    return lookup(language, 'color.not_set') ?? 'Not Set';
  }
  return describeText(String(value).trim(), language, options);
}

/**
 * Names a CSS color as written.
 *
 * @param text - The color
 * @param language - The editor's language
 * @param options - Home Assistant's color names
 * @returns The words
 */
function describeText(
  text: string,
  language: string,
  options: { readonly haName?: ColorNamer },
): string {
  const mix = MIX.exec(text);
  if (mix) {
    return interpolate(lookup(language, 'color.mix') ?? '{value}, {percent}%', {
      value: describeText(mix[1], language, options),
      percent: mix[2],
    });
  }
  const variable = VARIABLE.exec(text);
  if (variable) {
    const name = variable[1].toLowerCase();
    const token = name.endsWith('-color') ? name.slice(0, -'-color'.length) : name;
    if (SWATCH_TOKENS.includes(token)) return swatchName(token, language, options.haName);
    const key = COLOR_THEME_NAMES[name];
    if (key !== undefined) return lookup(language, key) ?? text;
    if (THEME_COLOR_TOKENS.has(token)) return options.haName?.(token) ?? text;
  }
  // The one default written as a hex code, the Now line's, read by its name rather than spelled.
  if (text.toLowerCase() === Config.DEFAULT_CONFIG.now_color) {
    return lookup(language, 'color.emerald') ?? text;
  }
  // A shading that paints nothing, as Month's Today Shading does by default.
  if (text.toLowerCase() === 'transparent') return lookup(language, 'value.none') ?? text;
  return text;
}

/**
 * The first swatch no calendar on the card and not the card itself uses, for a new entry's color.
 *
 * @param entries - The card's calendar entries
 * @param card - The card's configuration
 * @returns A swatch's value
 */
export function freeSwatch(
  entries: ReadonlyArray<string | Types.EntityConfig>,
  card: Readonly<Types.Config>,
): string {
  const used = new Set<unknown>([card.accent_color]);
  for (const entry of entries) {
    if (typeof entry === 'object' && entry !== null) used.add(entry.accent_color);
  }
  const token = SWATCH_TOKENS.find((each) => !used.has(swatchValue(each))) ?? SWATCH_TOKENS[0];
  return swatchValue(token);
}

/**
 * The key a draft is kept under: by owner, field and the place the value would be stored, so a
 * draft typed for one layout neither shows nor commits in another although both edit one field.
 *
 * @param owner - Whose field
 * @param field - The field
 * @param destination - Where its value would be stored: the view block, `''` for the top level,
 * the entry's or the button's key
 * @returns The key, `card|events:event_color|time_grid`
 */
export function draftKey(owner: WriteOwner, field: FieldId, destination: string): string {
  const who = owner.kind === 'card' ? 'card' : `${owner.kind}:${owner.key}`;
  return `${who}|${field}|${destination}`;
}
