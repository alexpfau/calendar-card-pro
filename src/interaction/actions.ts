/**
 * Action handling for Calendar Card Pro
 *
 * Delegates standard actions to HA's built-in handler via `hass-action` event,
 * matching the approach used by Mushroom and other well-known custom cards.
 * Only card-specific actions (expand) are handled locally.
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
export function getPrimaryEntityId(
  entities: Array<string | Types.EntityConfig>,
): string | undefined {
  if (!entities || !entities.length) return undefined;

  const firstEntity = entities[0];
  return typeof firstEntity === 'string' ? firstEntity : firstEntity.entity;
}

/**
 * Handle an action by delegating to HA's native action handler.
 *
 * Card-specific actions like `expand` are handled locally.
 * All standard HA actions (more-info, navigate, url, call-service,
 * fire-dom-event, toggle, etc.) are forwarded via the `hass-action` event
 * so HA handles them natively — including browser_mod compatibility.
 *
 * @param node - Element that triggered the action
 * @param config - Card config containing tap_action, hold_action, and entity
 * @param action - Action type: "tap" or "hold"
 * @param expandCallback - Optional callback for the card-specific expand action
 */
export function handleAction(
  node: HTMLElement,
  config: Types.Config,
  action: 'tap' | 'hold',
  expandCallback?: () => void,
): void {
  const actionConfig = action === 'hold' ? config.hold_action : config.tap_action;
  if (!actionConfig) return;

  // Handle card-specific actions locally
  if (actionConfig.action === 'expand') {
    if (expandCallback) expandCallback();
    Logger.debug('Executed expand action');
    return;
  }

  // Delegate all standard actions to HA's built-in handler
  const entityId = getPrimaryEntityId(config.entities);
  const hassActionConfig = {
    entity: entityId,
    tap_action: config.tap_action,
    hold_action: config.hold_action,
  };

  const event = new Event('hass-action', {
    bubbles: true,
    composed: true,
  });
  (event as unknown as Record<string, unknown>).detail = {
    config: hassActionConfig,
    action,
  };

  node.dispatchEvent(event);
  Logger.debug(`Delegated ${action} action (${actionConfig.action}) to HA native handler`);
}
