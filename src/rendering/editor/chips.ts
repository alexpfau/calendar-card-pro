/**
 * Toggle chips (D08 A, D09 A): the eight parts each event shows, at the top of Events, and the
 * toolbar's six built-in controls, on Card & Header. What each chip is, whether it can be pressed
 * and what it says, with no DOM; the element draws them and writes a press through
 * `_writeFieldValue`, as the field's own form would.
 *
 * Which fields are chips is the page registry's (`{ chips: 'parts' | 'toolbar' }`); this module
 * only names each one's short label (`chip-labels.ts`), a table `tests/editor-chips.test.ts` pins
 * by value and reconciles against the registry in both directions.
 *
 * A third family is one field's values rather than fields: Layouts in Switcher draws a chip per
 * layout under its own head row (`layoutChips`), and a press writes the whole list, as a change of
 * starting layout does where the list would otherwise leave one layout (`layoutsKeptOnStart`).
 */

import { CHIP_LABELS } from './chip-labels';
import { type FieldId, parseFieldId } from './field-index';
import { GATES, type GateData, firstUnmet, needsText } from './gates';
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
 * (`field-index.ts` › `universeIndex`), which for a chip comes down to whether every option it
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
 * Whether a value reads as pressed: on, or a word that means on (`show_countdown: once_per_day`).
 *
 * @param value - The field's effective value
 * @returns `true` for a pressed chip
 */
export function isPressed(value: unknown): boolean {
  return value !== undefined && value !== null && value !== false && value !== 'false';
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
