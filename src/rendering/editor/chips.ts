/**
 * Toggle chips (D08 A, D09 A): the eight parts each event shows, at the top of Events, and the
 * toolbar's six built-in controls, on Card & Header. What each chip is, whether it can be pressed
 * and what it says, with no DOM; the element draws them and writes a press through
 * `_writeFieldValue`, as the field's own form would.
 *
 * Which fields are chips is the page registry's (`{ chips: 'parts' | 'toolbar' }`); this module
 * only names each one's short label (`chip-labels.ts`), a table `tests/editor-chips.test.ts` pins
 * by value and reconciles against the registry in both directions.
 */

import { CHIP_LABELS } from './chip-labels';
import { type FieldId, parseFieldId } from './field-index';
import { GATES, type GateData, firstUnmet, needsText } from './gates';
import { PAGES } from './pages';
import { configKeysForField } from './synthetic';
import { type EditorWorkspace, viewForWorkspace } from './workspace';
import { appliesToView } from '../../config/view';

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
