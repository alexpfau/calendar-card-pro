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
 * The words a field carries in its label or helper, one vocabulary on every page: "Set", "Default"
 * (a layout's own), "From All Layouts", "Whole Card", and on a calendar's page "From the Card".
 * Which layout is Settings For's to say, and the value is the control's, never the words'.
 *
 * @param state - What `plan.ts` › `stateOf` found
 * @param t - The editor's strings
 * @returns The words, or `undefined` where the field says nothing
 */
export function stateText(state: StateWords | undefined, t: Translate): string | undefined {
  const words = state?.words;
  switch (words?.kind) {
    case undefined:
      return undefined;
    case 'set':
    case 'set-all-layouts':
    case 'set-layout':
      return t('state.set');
    case 'whole-card':
      return words.stored ? t('state.whole_card_set') : t('state.whole_card');
    case 'layout-default':
      return t('state.default');
    case 'from-all-layouts':
      return t('state.from_all_layouts');
    case 'set-entry':
      return words.shared ? t('state.set_shared') : t('state.set');
    case 'follows-card':
      return t('state.from_card');
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
 * The words of the button under a field (section 5.3): Reset keeps the control and names the value
 * it goes back to, "Reset (In the Day Header)", or "Reset (Empty)" where nothing comes back;
 * Remove takes the control back to its heading's Add row, "Remove Setting". Its accessible name
 * also names the setting: "Reset Show The Forecast to In the Day Header".
 *
 * @param action - Reset keeps the control; Remove takes it away
 * @param outcome - What `plan.ts` › `resetOutcome` found
 * @param label - The setting's label
 * @param t - The editor's strings
 * @param word - Words a value
 * @returns The button's label and its accessible name
 */
export function resetText(
  action: 'reset' | 'remove',
  outcome: ResetOutcome | undefined,
  label: string,
  t: Translate,
  word: WordValue,
): { readonly label: string; readonly name: string } {
  const value = outcome?.value;
  const empty =
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0);
  const worded = outcome === undefined || empty ? '' : word(value).trim();
  if (action === 'remove') {
    return {
      label: t('reset.remove_setting'),
      name:
        worded === ''
          ? interpolate(t('reset.remove_named'), { label })
          : interpolate(t('reset.remove_named_to'), { label, value: worded }),
    };
  }
  if (outcome === undefined) {
    return { label: t('reset.reset'), name: interpolate(t('reset.named'), { label }) };
  }
  return worded === ''
    ? { label: t('reset.empty'), name: interpolate(t('reset.named_empty'), { label }) }
    : {
        label: interpolate(t('reset.to'), { value: worded }),
        name: interpolate(t('reset.named_to'), { label, value: worded }),
      };
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
