/**
 * Action handling for Calendar Card Pro.
 *
 * Standard actions are delegated to Home Assistant via `hass-action`; only
 * card-specific actions (`expand`, `refresh`) are handled locally.
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

/**
 * Hand an action to Home Assistant, which runs it as it runs one of its own cards' actions.
 *
 * @param node - Element to dispatch from; must be inside Home Assistant's DOM
 * @param config - What Home Assistant reads: the actions by kind (`tap_action` and so on)
 *   and the `entity` they apply to
 * @param action - Which of those actions to run
 */
export function fireHassAction(
  node: HTMLElement,
  config: Record<string, unknown>,
  action: 'tap' | 'hold',
): void {
  const event = new Event('hass-action', {
    bubbles: true,
    composed: true,
  });
  (event as unknown as Record<string, unknown>).detail = { config, action };
  node.dispatchEvent(event);
}

/** How the card runs the actions only it knows; each is optional. */
export interface CardActionCallbacks {
  /** `expand`: toggle compact and expanded. */
  expand?: () => void;
  /** `refresh`: load the events again now. */
  refresh?: () => void;
}

/**
 * Handle an action: the card's own (`expand`, `refresh`) here, every other one by delegating
 * to HA's native action handler.
 *
 * @param node - Element that triggered the action
 * @param config - Card config containing tap_action, hold_action, and entity
 * @param action - Action type: "tap" or "hold"
 * @param callbacks - How the card runs its own actions
 */
export function handleAction(
  node: HTMLElement,
  config: Types.Config,
  action: 'tap' | 'hold',
  callbacks: CardActionCallbacks = {},
): void {
  const actionConfig = action === 'hold' ? config.hold_action : config.tap_action;
  // Defaults and the documented disable form are both `{ action: 'none' }`. Without this
  // guard every default-config tap still dispatched `hass-action` to Home Assistant.
  if (!actionConfig || actionConfig.action === 'none') return;

  if (actionConfig.action === 'expand') {
    callbacks.expand?.();
    Logger.debug('Executed expand action');
    return;
  }

  if (actionConfig.action === 'refresh') {
    callbacks.refresh?.();
    Logger.debug('Executed refresh action');
    return;
  }

  const entityId = getPrimaryEntityId(config.entities);
  const hassActionConfig = {
    entity: entityId,
    tap_action: config.tap_action,
    hold_action: config.hold_action,
  };

  fireHassAction(node, hassActionConfig, action);
  Logger.debug(`Delegated ${action} action (${actionConfig.action}) to HA native handler`);
}
