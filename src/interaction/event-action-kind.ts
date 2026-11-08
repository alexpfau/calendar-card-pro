/**
 * What `event_tap_action` and `event_hold_action` amount to.
 *
 * A module of its own, apart from `event-actions.ts`, because the editor asks the same
 * question: it shows `allow_event_*` and `open_links` by it. `event-actions.ts` reads an
 * event's text and pulls the card's formatting and its translations in with it, which the
 * editor's own file would otherwise have to carry for this one function.
 */

import { CARD_ACTION_VALUES, EVENT_DETAILS_ACTION } from '../config/constants';
import * as Types from '../config/types';

/**
 * What an event action amounts to: open the event's dialog, hand an action to Home Assistant,
 * or nothing, which leaves the press to the card's own action.
 */
export type EventActionKind = 'details' | 'forward' | 'none';

/**
 * What an event action amounts to.
 *
 * `details` opens the dialog. `none`, a missing or bare action, and the card's own actions
 * (`expand`, `refresh`, `add-event`, `reset`, `back`) are nothing on an event: none of them is
 * about the event, and a press on an event reaches the card's own anyway when the event has no
 * action of its own. Every other action is Home Assistant's, including ones it adds after this
 * was written.
 *
 * @param action - `event_tap_action` or `event_hold_action`, as configured
 * @returns What the action amounts to
 */
export function eventActionKind(action: Types.ActionConfig | null | undefined): EventActionKind {
  const name = action?.action;
  if (typeof name !== 'string' || name === '' || name === 'none') return 'none';
  if (name === EVENT_DETAILS_ACTION) return 'details';
  if ((CARD_ACTION_VALUES as ReadonlyArray<string>).includes(name)) return 'none';
  return 'forward';
}
