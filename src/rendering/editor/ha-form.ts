/**
 * Home Assistant form schema, as much of it as we write.
 *
 * `<ha-form>` renders a plain array of these objects, so a schema is data rather than
 * markup — which is the whole point of the rebuild. A schema names a **selector**, and
 * Home Assistant decides which element implements it. That is what stops a component
 * rename from breaking the editor: `ha-textfield` became `ha-input` in 2026.5 and cost
 * us a runtime-detection shim, whereas `selector: { text: {} }` would have cost nothing.
 *
 * These declarations are ours, written from the public shape of Home Assistant's
 * `ha-form` types. They are deliberately a **subset**: the members and fields we
 * actually use, so an unused option cannot silently become a dependency. Widen it when
 * a panel needs more, not in advance.
 *
 * The file carries no runtime code beyond one type guard and imports nothing, which is
 * what lets the schema modules stay importable by the test suite.
 */

/** Options offered by a `select` selector. */
export interface SelectOption {
  value: string;
  label: string;
  /** Secondary line, shown by the boxed presentation. */
  description?: string;
  /**
   * Artwork for `mode: 'box'`. A plain string is an image URL; the object form adds a
   * dark-theme variant. We use inline SVG data URIs so the illustrations travel inside
   * the single bundle HACS publishes.
   */
  image?: string | { src: string; src_dark?: string };
  disabled?: boolean;
}

/**
 * The selector types this editor uses. Add members as panels need them.
 *
 * `ui_color` is deliberately absent. It looks like the obvious choice for the card's
 * two dozen colour options, and it is the wrong one: it emits a *theme token* —
 * `primary`, `red`, `deep-purple` — which Home Assistant's own cards pass through
 * `computeCssColor()` before use. This card has no such step, so a token would reach
 * the browser as `color: primary` and be dropped. It also cannot express the card's own
 * defaults: three are `var(--…)` references and `#03a9f450` carries an alpha channel.
 * Colours are `text`, which is what the card has always accepted.
 */
export type Selector =
  | { boolean: Record<string, never> | null }
  | { text: { multiline?: boolean; prefix?: string; suffix?: string; type?: string } | null }
  | {
      number: {
        min?: number;
        max?: number;
        step?: number | 'any';
        mode?: 'box' | 'slider';
        unit_of_measurement?: string;
      } | null;
    }
  | {
      select: {
        options: ReadonlyArray<SelectOption> | ReadonlyArray<string>;
        mode?: 'list' | 'dropdown' | 'box';
        multiple?: boolean;
        custom_value?: boolean;
        box_max_columns?: number;
        sort?: boolean;
      } | null;
    }
  | { ui_action: Record<string, never> | null }
  | { icon: Record<string, never> | null }
  | { entity: { filter?: { domain?: string | ReadonlyArray<string> }; multiple?: boolean } | null };
/** Fields every schema node shares. */
interface BaseSchema {
  /** Key into the form's data object. This is what makes a schema self-binding. */
  name: string;
  required?: boolean;
  disabled?: boolean;
}

/** A single input, bound to `name` and rendered by `selector`. */
export interface SelectorSchema extends BaseSchema {
  selector: Selector;
}

/**
 * Read-only text.
 *
 * Used for statements that belong beside the fields rather than in a helper — the
 * boxed view selector's "both layouts are live" sentence, for instance.
 */
export interface ConstantSchema extends BaseSchema {
  type: 'constant';
  value?: string;
}

/**
 * A responsive row of fields.
 *
 * Home Assistant lays these out with `repeat(auto-fit, minmax(min-width, 1fr))`, so a
 * pair collapses to one column when the editor pane narrows — no breakpoint, no
 * JavaScript, and nothing for us to own.
 */
export interface GridSchema {
  type: 'grid';
  name: string;
  schema: ReadonlyArray<HaFormSchema>;
  column_min_width?: string;
  /** Children bind to the parent's data rather than nesting under `name`. */
  flatten?: boolean;
}

/**
 * A collapsible group.
 *
 * Without `flatten` the group nests: children read and write `data[name]`, which is
 * exactly how the `column:` block is edited without any plumbing of ours.
 */
export interface ExpandableSchema {
  type: 'expandable';
  name: string;
  title?: string;
  /**
   * The string key `title` was resolved from.
   *
   * Ours, not Home Assistant's — it ignores unknown fields, and it never asks for a
   * group's label once `title` is set. It is here because a group's title is resolved
   * by the builder rather than by the label hook, so without it the key is consumed
   * and thrown away, and `check:i18n` could neither require the string nor tell that
   * it was used. A group whose title comes from a different key than its `name` is the
   * normal case: two panels both nest the `column` block, under different headings.
   */
  titleKey?: string;
  icon?: string;
  iconPath?: string;
  expanded?: boolean;
  schema: ReadonlyArray<HaFormSchema>;
  flatten?: boolean;
}

/** Any node an `<ha-form>` schema may contain. */
export type HaFormSchema = SelectorSchema | ConstantSchema | GridSchema | ExpandableSchema;

/**
 * Narrows to a node that groups other nodes.
 *
 * @param node - Schema node to test
 * @returns `true` when the node has children
 */
export function isGroupSchema(node: HaFormSchema): node is GridSchema | ExpandableSchema {
  return 'schema' in node;
}
