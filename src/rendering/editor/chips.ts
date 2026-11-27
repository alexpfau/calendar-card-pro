/**
 * Toggle chips (D08 A, D09 A): the eight parts each event shows, at the top of Events, and the
 * toolbar's built-in controls, on Card & Header for the card's own toolbar and on Full-Size
 * Settings for the full-size card's, under `overlay.toolbar`. What each chip is, whether it can be
 * pressed and what it says, with no DOM; the element draws them and writes a press through
 * `_writeFieldValue`, as the field's own form would.
 *
 * Which fields are chips is the page registry's (`{ chips: 'parts' | 'toolbar' }`); this module
 * only names each one's short label (`chip-labels.ts`), a table `tests/editor-chips.test.ts` pins
 * by value and reconciles against the registry in both directions.
 *
 * Calendar Filter is a chip whose value is a form rather than on and off: pressed, it writes the
 * form last named this session, by the YAML or its line, else Menu (`pressValue`), and its form is
 * its qualifier line under the chips. View Switcher's qualifier line is one field's values: Layouts in Switcher's checkboxes
 * (`layoutChips`), where a check writes the whole list, as a change of starting layout does where
 * the list would otherwise leave one layout (`layoutsKeptOnStart`).
 */

import { CHIP_LABELS } from './chip-labels';
import { type FieldId, parseFieldId } from './field-index';
import { GATES, type GateData, firstUnmet, needsText } from './gates';
import { LEGEND_OFF } from './normalize';
import { PAGES } from './pages';
import { configKeysForField } from './synthetic';
import { type EditorWorkspace, viewForWorkspace } from './workspace';
import { resolveToolbar, switcherOffers } from '../../config/config';
import type * as Types from '../../config/types';
import { VIEWS, appliesToView } from '../../config/view';

export { CHIP_LABELS };

export type ChipKind = 'parts' | 'toolbar';

/**
 * The fields the registry draws as chips of one kind, in its order.
 *
 * @param kind - Event parts or toolbar controls
 * @returns The field ids
 */
export function chipFields(kind: ChipKind): FieldId[] {
  return PAGES.flatMap((page) =>
    page.headings.flatMap((heading) =>
      heading.fields.flatMap(([id, appearance]) =>
        typeof appearance === 'object' && 'chips' in appearance && appearance.chips === kind
          ? [id]
          : [],
      ),
    ),
  );
}

/**
 * Whether a chip's field is offered in a scope at all: in the universe for it
 * (`universe.ts` › `universeIndex`), which for a chip comes down to whether every option it
 * writes applies to the scope's layout. Now is not offered in Grid. Derived rather than read
 * off the universe, which replays the whole gate corpus; `tests/editor-chips.test.ts` holds the
 * two to the same answer in every scope.
 *
 * @param id - The chip's field
 * @param workspace - Editing scope
 * @returns `true` where the chip is drawn
 */
export function inScope(id: FieldId, workspace: EditorWorkspace): boolean {
  const view = viewForWorkspace(workspace);
  return (
    view === undefined ||
    configKeysForField(parseFieldId(id).name).every((key) => appliesToView(key, view))
  );
}

/**
 * Whether a value reads as pressed: on, or a word that means on (`show_countdown: once_per_day`,
 * Calendar Filter's `menu` or `chips`). Calendar Filter's form data says `off` for `false`
 * (`normalize.ts` › `LEGEND_OFF`).
 *
 * @param value - The field's effective value
 * @returns `true` for a pressed chip
 */
export function isPressed(value: unknown): boolean {
  return (
    value !== undefined &&
    value !== null &&
    value !== false &&
    value !== 'false' &&
    value !== LEGEND_OFF
  );
}

/** The chip whose form, Menu or Chips, is its own qualifier line: Calendar Filter. */
export const LEGEND_FIELD: FieldId = 'card:toolbar.legend';

/** Calendar Filter of the card opened full size, on Full-Size Settings. */
export const FULL_SIZE_LEGEND_FIELD: FieldId = 'actions:overlay.toolbar.legend';

/**
 * Whether a chip is Calendar Filter, the card's own or the full-size card's.
 *
 * @param id - A field
 * @returns `true` for either Calendar Filter
 */
export function isLegendField(id: FieldId): boolean {
  return id === LEGEND_FIELD || id === FULL_SIZE_LEGEND_FIELD;
}

/** Calendar Filter's two forms, in the order its qualifier line offers them. */
export const LEGEND_FORMS: ReadonlyArray<Types.ToolbarLegendMode> = ['menu', 'chips'];

/**
 * What a press on a chip writes: the other of on and off; for Calendar Filter, off, or on in the
 * form last named this editing session, by the card's YAML or in its qualifier line, else Menu,
 * the default.
 *
 * @param id - The chip's field
 * @param pressed - Whether it is pressed now
 * @param form - Calendar Filter's form last named this session, where one was
 * @returns The value to write
 */
export function pressValue(
  id: FieldId,
  pressed: boolean,
  form?: Types.ToolbarLegendMode,
): boolean | string {
  if (!isLegendField(id)) return !pressed;
  return pressed ? LEGEND_OFF : (form ?? 'menu');
}

/**
 * Why a chip cannot be pressed: the first condition its gate waits on, named by the chip that
 * answers it where one does ("Time"), else as a gate line would name it.
 *
 * @param id - The chip's field, offered in the scope but withheld
 * @param data - The scope's form data
 * @param language - Editor language
 * @param labelOf - A field's label, for a condition no chip answers
 * @param chipLabel - A chip's label
 * @returns The words, or `undefined` where no gate holds it
 */
export function needsPart(
  id: FieldId,
  data: GateData,
  language: string,
  labelOf: (id: FieldId) => string,
  chipLabel: (id: FieldId) => string,
): string | undefined {
  const gate = Object.values(GATES).find((each) => each.fields.includes(id));
  if (gate === undefined) return undefined;
  const unmet = firstUnmet(gate, data);
  if (unmet !== undefined && unmet.field in CHIP_LABELS) return chipLabel(unmet.field);
  return needsText(gate, data, language, labelOf);
}

/** The field drawn as a chip per layout: the layouts the toolbar's View Switcher offers. */
export const SWITCHER_LAYOUTS_FIELD: FieldId = 'card:toolbar.view_switcher_layouts';

/** The layouts the full-size card's View Switcher offers, on Full-Size Settings. */
export const FULL_SIZE_LAYOUTS_FIELD: FieldId = 'actions:overlay.toolbar.view_switcher_layouts';

/**
 * Whether a field is Layouts in Switcher, the card's own or the full-size card's.
 *
 * @param id - A field
 * @returns `true` for either
 */
export function isSwitcherLayoutsField(id: FieldId): boolean {
  return id === SWITCHER_LAYOUTS_FIELD || id === FULL_SIZE_LAYOUTS_FIELD;
}

/**
 * Whether a field belongs to the full-size card's toolbar, under `overlay.toolbar`, whose layout
 * is the full-size card's and whose Calendar Filter form is remembered apart from the card's.
 *
 * @param id - A field
 * @returns `true` for a field of Full-Size Settings' Toolbar
 */
export function isFullSizeToolbarField(id: FieldId): boolean {
  return id.startsWith('actions:overlay.toolbar.');
}

/**
 * Why a layout's chip stays pressed: it is the starting layout, which the switcher always offers,
 * or the one other layout offered, without which the switcher would offer one and not be drawn.
 */
export type LayoutKept = 'starting' | 'second';

/** One layout's chip under Layouts in Switcher. */
export interface LayoutChip {
  readonly view: Types.EffectiveView;
  readonly pressed: boolean;
  /** Why it cannot be pressed off; absent for a chip that can be pressed. */
  readonly kept?: LayoutKept;
}

/**
 * Layouts in Switcher's chips, one per layout in `VIEWS` order: pressed for each layout the
 * switcher offers, the starting layout always among them. The starting layout's chip is kept
 * pressed, and while it has one other layout beside it so is that one's, so no press leaves a
 * switcher of one layout, which the card would not draw. Turning the switcher off is View
 * Switcher's, never this field's.
 *
 * @param offered - The layouts offered, as the field's form holds them
 * @param starting - The layout the card opens in
 * @returns The chips
 */
export function layoutChips(
  offered: ReadonlyArray<unknown>,
  starting: Types.EffectiveView,
): LayoutChip[] {
  const on = (view: Types.EffectiveView): boolean => view === starting || offered.includes(view);
  const others = VIEWS.filter((view) => view !== starting && on(view));
  return VIEWS.map((view) => {
    const kept: LayoutKept | undefined =
      view === starting
        ? 'starting'
        : others.length === 1 && others[0] === view
          ? 'second'
          : undefined;
    return kept === undefined ? { view, pressed: on(view) } : { view, pressed: on(view), kept };
  });
}

/**
 * The list a press on a layout's chip writes: the layouts offered with that one turned on or off,
 * the starting layout among them, in `VIEWS` order, so the stored list says everything the
 * switcher offers and keeps offering it if the starting layout changes.
 *
 * @param offered - The layouts offered, as the field's form holds them
 * @param starting - The layout the card opens in
 * @param view - The layout pressed
 * @returns The list, or `undefined` for a chip that is kept
 */
export function pressLayout(
  offered: ReadonlyArray<unknown>,
  starting: Types.EffectiveView,
  view: Types.EffectiveView,
): Types.EffectiveView[] | undefined {
  const chips = layoutChips(offered, starting);
  const chip = chips.find((each) => each.view === view);
  if (chip === undefined || chip.kept !== undefined) return undefined;
  return chips
    .filter((each) => (each.view === view ? !each.pressed : each.pressed))
    .map((each) => each.view);
}

/**
 * Whether the switcher is on and offers one layout, so the card draws none. Neither the chips nor
 * Starting Layout leave a switcher that is on so (`layoutsKeptOnStart`), but a list written by hand
 * can name the starting layout alone, or nothing, and so can one kept while View Switcher was off.
 *
 * @param config - The configuration
 * @param starting - The layout the card opens in
 * @returns `true` while the toolbar and View Switcher are on and fewer than two layouts are offered
 */
export function switcherAlone(
  config: Readonly<Types.Config>,
  starting: Types.EffectiveView,
): boolean {
  const toolbar = resolveToolbar(config);
  return (
    toolbar.show &&
    toolbar.viewSwitcher &&
    switcherOffers({ ...config, view: starting }).length === 0
  );
}

/**
 * The list Layouts in Switcher writes beside a change of starting layout, where the list stored
 * would otherwise leave the switcher offering one layout, which the card does not draw. A list of
 * one layout other than the starting one offers two; starting in that layout, it offers one. The
 * layout left joins the list, in `VIEWS` order, so the switcher keeps offering what it offered.
 *
 * Nothing is written where the switcher offered nothing before, or still offers two or more. With
 * no list stored, the switcher offers every layout, so the key is never written where it is absent.
 *
 * @param config - The configuration before the change
 * @param from - The layout the card opens in before the change
 * @param to - The layout it opens in after it
 * @returns The list to write, or `undefined` where none is needed
 */
export function layoutsKeptOnStart(
  config: Readonly<Types.Config>,
  from: Types.EffectiveView,
  to: Types.EffectiveView,
): Types.EffectiveView[] | undefined {
  if (switcherOffers({ ...config, view: from }).length === 0) return undefined;
  if (switcherOffers({ ...config, view: to }).length > 0) return undefined;
  const named = resolveToolbar(config).switcherViews;
  return VIEWS.filter((view) => view === from || named.includes(view));
}
