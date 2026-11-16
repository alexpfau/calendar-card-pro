/**
 * The words of the shown set (backlog item 307): what a field says about where its value comes
 * from, what Reset leaves, and where those words go for each kind of control. `plan.ts` decides in
 * data; this words it, with the templates in `strings.ts`.
 *
 * No DOM and no Lit here, so the tests can call it directly.
 */

import type { HaFormSchema } from './ha-form';
import type { ResetOutcome, StateWords } from './plan';
import { interpolate } from './strings';
import type * as Types from '../../config/types';

/** Resolves one of the editor's own strings by its literal key. */
export type Translate = (key: string) => string;

/** Names a layout: "Grid". */
export type LayoutName = (view: Types.EffectiveView | 'shared') => string;

/** Words a value as the field's control shows it. */
export type WordValue = (value: unknown) => string;

/**
 * Where a control's state words go, by its selector, as Home Assistant exposes them
 * (`spike/ha-probe.md` §3): a text field's, and a number field's drawn as a box, helper is its
 * accessible description and renders under it, so the words lead the helper; every other
 * control is named by its label, so they follow the label.
 *
 * @param node - The control
 * @returns `helper` or `label`
 */
export function wordsPlace(node: HaFormSchema): 'helper' | 'label' {
  if (!('selector' in node)) return 'label';
  const selector = node.selector;
  if ('text' in selector) return 'helper';
  if ('number' in selector) {
    // Home Assistant draws a box where asked to, or where the range is open at either end.
    const number = selector.number ?? {};
    return number.mode === 'box' || number.min === undefined || number.max === undefined
      ? 'helper'
      : 'label';
  }
  return 'label';
}

/**
 * Whether a control's label names nothing a screen reader reaches: Home Assistant draws a number
 * slider's label as plain text beside an unnamed slider and box, so the words that follow the label
 * go in the name of the field's group as well.
 *
 * @param node - The control
 * @returns Whether the group carries the words
 */
export function wordsInGroup(node: HaFormSchema): boolean {
  return 'selector' in node && 'number' in node.selector && wordsPlace(node) === 'label';
}

/**
 * The words a field carries in its label or helper (section 5.3): "Set for Grid", "Grid's
 * Default", "Follows the Card: Hide".
 *
 * @param state - What `plan.ts` › `stateOf` found
 * @param t - The editor's strings
 * @param layout - Names a layout
 * @param word - Words a value
 * @returns The words, or `undefined` where the field says nothing
 */
export function stateText(
  state: StateWords | undefined,
  t: Translate,
  layout: LayoutName,
  word: WordValue,
): string | undefined {
  const words = state?.words;
  switch (words?.kind) {
    case undefined:
      return undefined;
    case 'set':
      return t('state.set');
    case 'set-all-layouts':
      return t('state.set_all_layouts');
    case 'whole-card':
      return words.stored ? t('state.whole_card_set') : t('state.whole_card');
    case 'set-layout':
      return interpolate(words.sameAsDefault ? t('state.set_layout_same') : t('state.set_layout'), {
        layout: layout(words.view),
      });
    case 'layout-default':
      return interpolate(t('state.layout_default'), { layout: layout(words.view) });
    case 'from-all-layouts':
      return t('state.from_all_layouts');
    case 'set-entry':
      return words.shared ? t('state.set_entry_shared') : t('state.set_entry');
    case 'follows-card':
      return interpolate(t('state.follows_card'), { value: word(words.value) });
  }
}

/**
 * The note under a field whose layout ignores the All Layouts value: "The All Layouts value, 5,
 * does not apply in Grid."
 *
 * @param state - What `plan.ts` › `stateOf` found
 * @param t - The editor's strings
 * @param layout - Names a layout
 * @param word - Words a value
 * @returns The note, or `undefined`
 */
export function ignoredText(
  state: StateWords | undefined,
  t: Translate,
  layout: LayoutName,
  word: WordValue,
): string | undefined {
  const words = state?.words;
  if (words?.kind !== 'layout-default' || words.ignored === undefined) return undefined;
  return interpolate(t('state.ignored'), {
    value: word(words.ignored),
    layout: layout(words.view),
  });
}

/**
 * The Reset button under a field, named for what it leaves (section 5.3): "Reset to Off" where
 * a value comes back, "Clear" where nothing does, and "Remove" where the control goes with it.
 * Which default or layout gives the value is the field's state words' to say, not the button's.
 *
 * @param action - Reset keeps the control; Remove takes it away
 * @param outcome - What `plan.ts` › `resetOutcome` found
 * @param t - The editor's strings
 * @param word - Words a value
 * @returns The button's label
 */
export function resetLabel(
  action: 'reset' | 'remove',
  outcome: ResetOutcome | undefined,
  t: Translate,
  word: WordValue,
): string {
  if (action === 'remove') return t('reset.remove');
  if (outcome === undefined) return t('reset.reset');
  const value = outcome.value;
  const empty =
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0);
  const worded = empty ? '' : word(value).trim();
  return worded === '' ? t('reset.clear') : interpolate(t('reset.to'), { value: worded });
}

/**
 * Names joined for an Add row or the other-layouts line: the first `fit`, then "{names}, +{count}"
 * where more did not fit.
 *
 * @param names - Every name, in order
 * @param t - The editor's strings
 * @param fit - How many fit
 * @returns The names
 */
export function namesText(names: ReadonlyArray<string>, t: Translate, fit = 4): string {
  const shown = names.slice(0, fit).join(' · ');
  return names.length <= fit
    ? shown
    : interpolate(t('add.names_more'), { names: shown, count: String(names.length - fit) });
}

/**
 * A helper's first sentence, which an Add row's item shows under its label.
 *
 * @param helper - The helper
 * @returns Its first sentence
 */
export function firstSentence(helper: string | undefined): string | undefined {
  if (helper === undefined) return undefined;
  const end = helper.search(/[.!?](\s|$)/);
  return end < 0 ? helper : helper.slice(0, end + 1);
}
