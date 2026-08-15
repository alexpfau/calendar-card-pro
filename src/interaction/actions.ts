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

/**
 * Handle an action by delegating to HA's native action handler.
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

  if (actionConfig.action === 'expand') {
    if (expandCallback) expandCallback();
    Logger.debug('Executed expand action');
    return;
  }

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
