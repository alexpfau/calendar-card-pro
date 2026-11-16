/**
 * The words of the shown set (backlog item 307): what a field says about where its value comes
 * from, what Reset gives, and where those words go for each kind of control. `plan.ts` decides in
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
 * What Reset gives, beside it (section 5.3): "Reset gives Grid's Default, 12px, not the All
 * Layouts value, 14px".
 *
 * @param outcome - What `plan.ts` › `resetOutcome` found
 * @param t - The editor's strings
 * @param layout - Names a layout
 * @param word - Words a value
 * @returns The line, or `undefined`
 */
export function outcomeText(
  outcome: ResetOutcome | undefined,
  t: Translate,
  layout: LayoutName,
  word: WordValue,
): string | undefined {
  switch (outcome?.kind) {
    case undefined:
      return undefined;
    case 'layout-default':
      return interpolate(
        outcome.ignored === undefined
          ? t('reset.gives_layout_default')
          : t('reset.gives_layout_default_ignored'),
        {
          layout: layout(outcome.view),
          value: word(outcome.value),
          ignored: word(outcome.ignored),
        },
      );
    case 'all-layouts':
      return interpolate(t('reset.gives_all_layouts'), { value: word(outcome.value) });
    case 'default':
      return interpolate(t('reset.gives_default'), { value: word(outcome.value) });
    case 'card':
      return interpolate(t('reset.gives_card'), { value: word(outcome.value) });
  }
}

/** Names as an Add row draws them: the names, and what follows them where more did not fit. */
export interface NamesParts {
  /** The first names, with whatever the template puts before them. */
  readonly names: string;
  /** What the template puts after them, ", +3"; empty where every name fit. */
  readonly more: string;
}

/**
 * Names joined for an Add row: the first `fit`, then "{names}, +{count}" where more did not fit,
 * split at the end of the names so the row can keep the count visible however the names wrap.
 *
 * @param names - Every name, in order
 * @param t - The editor's strings
 * @param fit - How many fit
 * @returns The names and what follows them
 */
export function namesParts(names: ReadonlyArray<string>, t: Translate, fit = 4): NamesParts {
  const shown = names.slice(0, fit).join(' · ');
  if (names.length <= fit) return { names: shown, more: '' };
  const marker = '\u0000';
  const whole = interpolate(t('add.names_more'), {
    names: marker,
    count: String(names.length - fit),
  });
  const at = whole.indexOf(marker);
  if (at < 0) return { names: whole, more: '' };
  return { names: whole.slice(0, at) + shown, more: whole.slice(at + marker.length) };
}

/**
 * Names joined for the other-layouts line: the first `fit`, then "{names}, +{count}" where more
 * did not fit.
 *
 * @param names - Every name, in order
 * @param t - The editor's strings
 * @param fit - How many fit
 * @returns The names
 */
export function namesText(names: ReadonlyArray<string>, t: Translate, fit = 4): string {
  const parts = namesParts(names, t, fit);
  return parts.names + parts.more;
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
