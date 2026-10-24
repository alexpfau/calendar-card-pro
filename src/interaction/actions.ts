/**
 * Action handling for Calendar Card Pro.
 *
 * Standard actions are delegated to Home Assistant via `hass-action`; only
 * card-specific actions are handled locally.
 */

import * as Types from '../config/types';
import * as Logger from '../utils/logger';

//-----------------------------------------------------------------------------
// PUBLIC API
//-----------------------------------------------------------------------------

/**
 * Extract primary entity ID from configured entities
 *
 * @param entities - Entity configuration array
 * @returns The primary entity ID or undefined if not available
 */
function getPrimaryEntityId(entities: Array<string | Types.EntityConfig>): string | undefined {
  if (!entities || !entities.length) return undefined;

  const firstEntity = entities[0];
  return typeof firstEntity === 'string' ? firstEntity : firstEntity.entity;
}

/** A tap on one event, which runs `event_tap_action` instead of the card's `tap_action`. */
export interface EventTap {
  /** The calendar the tapped event came from: for a merged row, the one whose copy was kept. */
  entity: string | undefined;
  /** What the card-specific `details` action does: open the event's details. */
  details: () => void;
}

/**
 * Handle an action by delegating to HA's native action handler.
 *
 * A tap on an event runs `event_tap_action` through the same path, with one difference that
 * is the point of having it: Home Assistant is told the event's own calendar as the entity,
 * so `more-info` opens the calendar the event came from rather than the card's first one.
 * That calendar is only the default. An `entity` named on `event_tap_action` replaces it
 * here, so it wins for every action: Home Assistant's `more-info` prefers the action's own
 * entity anyway, but its `toggle` reads only this one. `expand` stays the card's own,
 * wherever it was configured. `details` needs an event, so as a card action it does nothing.
 *
 * @param node - Element that triggered the action
 * @param config - Card config containing tap_action, hold_action, and entity
 * @param action - Action type: "tap" or "hold"; ignored for an event tap, which is a tap
 * @param expandCallback - Optional callback for the card-specific expand action
 * @param eventTap - The tapped event, to run `event_tap_action` for it
 */
export function handleAction(
  node: HTMLElement,
  config: Types.Config,
  action: 'tap' | 'hold',
  expandCallback?: () => void,
  eventTap?: EventTap,
): void {
  const actionConfig = eventTap
    ? config.event_tap_action
    : action === 'hold'
      ? config.hold_action
      : config.tap_action;
  // Defaults and the documented disable form are both `{ action: 'none' }`. Without this
  // guard every default-config tap still dispatched `hass-action` to Home Assistant.
  if (!actionConfig || actionConfig.action === 'none') return;

  if (actionConfig.action === 'expand') {
    if (expandCallback) expandCallback();
    Logger.debug('Executed expand action');
    return;
  }

  if (actionConfig.action === 'details') {
    if (eventTap) eventTap.details();
    Logger.debug(eventTap ? 'Executed details action' : 'Ignored details action: no event');
    return;
  }

  const namedEntity =
    typeof actionConfig.entity === 'string' && actionConfig.entity !== ''
      ? actionConfig.entity
      : undefined;
  const entityId = eventTap
    ? (namedEntity ?? eventTap.entity ?? getPrimaryEntityId(config.entities))
    : getPrimaryEntityId(config.entities);
  const hassActionConfig = eventTap
    ? { entity: entityId, tap_action: actionConfig }
    : {
        entity: entityId,
        tap_action: config.tap_action,
        hold_action: config.hold_action,
      };

  const event = new Event('hass-action', {
    bubbles: true,
    composed: true,
  });
  // Home Assistant reads the action config named by `action`, and an event tap's is held
  // under `tap_action`, so it is a tap whatever the caller said.
  const haAction = eventTap ? 'tap' : action;
  (event as unknown as Record<string, unknown>).detail = {
    config: hassActionConfig,
    action: haAction,
  };

  node.dispatchEvent(event);
  Logger.debug(`Delegated ${haAction} action (${actionConfig.action}) to HA native handler`);
}
