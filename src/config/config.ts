/* eslint-disable import/order */
/**
 * Configuration module for Calendar Card Pro
 */

import * as Constants from './constants';
import * as Types from './types';
import * as Logger from '../utils/logger';

//-----------------------------------------------------------------------------
// CORE CONFIGURATION
//-----------------------------------------------------------------------------

/**
 * Default configuration for Calendar Card Pro
 */
export const DEFAULT_CONFIG: Types.Config = {
  // Core settings
  entities: [],
  days_to_show: 3,
  max_events_to_show: undefined,
  language: '',

  // Header
  title: '',
  title_font_size: '',
  title_color: '',

  // Layout and spacing
  background_color: 'var(--ha-card-background)',
  row_spacing: '5px',
  additional_card_spacing: '0px',
  vertical_line_width: '2px',
  vertical_line_color: '#03a9f4',
  horizontal_line_width: '0px',
  horizontal_line_color: 'var(--secondary-text-color)',
  show_event_highlight: false,

  // Date column
  date_vertical_alignment: 'middle',
  weekday_font_size: '14px',
  weekday_color: 'var(--primary-text-color)',
  day_font_size: '26px',
  day_color: 'var(--primary-text-color)',
  show_month: true,
  month_font_size: '12px',
  month_color: 'var(--primary-text-color)',

  // Event column
  show_past_events: false,
  event_font_size: '14px',
  event_color: 'var(--primary-text-color)',
  time_24h: true,
  show_end_time: true,
  time_font_size: '12px',
  time_color: 'var(--secondary-text-color)',
  time_icon_size: '14px',
  show_location: true,
  remove_location_country: true,
  location_font_size: '12px',
  location_color: 'var(--secondary-text-color)',
  location_icon_size: '14px',

  // Actions
  tap_action: { action: 'none' },
  hold_action: { action: 'none' },

  // Cache and refresh settings
  refresh_interval: Constants.CACHE.DEFAULT_DATA_REFRESH_MINUTES,
};

//-----------------------------------------------------------------------------
// CONFIGURATION UTILITIES
//-----------------------------------------------------------------------------

/**
 * Normalizes entity configuration to ensure consistent format
 */
export function normalizeEntities(
  entities: Array<
    string | { entity: string; label?: string; color?: string; accent_color?: string; show_location?: boolean }
  >,
): Array<Types.EntityConfig> {
  if (!Array.isArray(entities)) {
    return [];
  }

  return entities
    .map((item) => {
      if (typeof item === 'string') {
        return {
          entity: item,
          color: 'var(--primary-text-color)',
          accent_color: 'var(--calendar-card-line-color-vertical)',
          show_location: true,
        };
      }
      if (typeof item === 'object' && item.entity) {
        return {
          entity: item.entity,
          label: item.label,
          color: item.color || 'var(--primary-text-color)',
          accent_color: item.accent_color || 'var(--calendar-card-line-color-vertical)',
          show_location: item.show_location !== null && item.show_location !== undefined ? item.show_location : true,
        };
      }
      return null;
    })
    .filter(Boolean) as Array<Types.EntityConfig>;
}

/**
 * Determine if configuration changes affect data retrieval
 */
export function hasConfigChanged(
  previous: Partial<Types.Config> | undefined,
  current: Types.Config,
): boolean {
  // Handle empty/undefined config
  if (!previous || Object.keys(previous).length === 0) {
    return true;
  }

  // Extract entity IDs without colors for comparison - entity colors are styling only
  // and don't require API data refresh
  const previousEntityIds = (previous.entities || [])
    .map((e) => (typeof e === 'string' ? e : e.entity))
    .sort()
    .join(',');

  const currentEntityIds = (current.entities || [])
    .map((e) => (typeof e === 'string' ? e : e.entity))
    .sort()
    .join(',');

  // Check refresh interval separately (it affects both timers and cache now)
  const refreshIntervalChanged = previous?.refresh_interval !== current?.refresh_interval;

  // Check if core data-affecting properties changed
  const dataChanged =
    previousEntityIds !== currentEntityIds ||
    previous.days_to_show !== current.days_to_show ||
    previous.show_past_events !== current.show_past_events;

  if (dataChanged || refreshIntervalChanged) {
    Logger.debug('Configuration change requires data refresh');
  }

  return dataChanged || refreshIntervalChanged;
}

/**
 * Check if entity colors have changed in the configuration
 * This is used to determine if a re-render (but not data refresh) is needed
 *
 * @param previous - Previous configuration
 * @param current - New configuration
 * @returns True if entity colors have changed
 */
export function haveEntityColorsChanged(
  previous: Partial<Types.Config> | undefined,
  current: Types.Config,
): boolean {
  if (!previous || !previous.entities) return false;

  const prevEntities = previous.entities;
  const currEntities = current.entities;

  // If entity count changed, let other functions handle it
  if (prevEntities.length !== currEntities.length) return false;

  // Create a map of entity IDs to colors for previous config
  const prevColorMap = new Map<string, string>();
  prevEntities.forEach((entity) => {
    if (typeof entity === 'string') {
      prevColorMap.set(entity, 'var(--primary-text-color)');
    } else {
      prevColorMap.set(entity.entity, entity.color || 'var(--primary-text-color)');
    }
  });

  // Check if any entity colors changed in current config
  for (const entity of currEntities) {
    const entityId = typeof entity === 'string' ? entity : entity.entity;
    const color =
      typeof entity === 'string'
        ? 'var(--primary-text-color)'
        : entity.color || 'var(--primary-text-color)';

    if (!prevColorMap.has(entityId)) {
      // New entity, let other functions handle it
      continue;
    }

    // If color changed for an existing entity, return true
    if (prevColorMap.get(entityId) !== color) {
      Logger.debug(`Entity color changed for ${entityId}, will re-render`);
      return true;
    }
  }

  return false;
}

//-----------------------------------------------------------------------------
// INITIALIZATION HELPERS
//-----------------------------------------------------------------------------

/**
 * Find a calendar entity in Home Assistant states
 */
export function findCalendarEntity(hass: Record<string, { state: string }>): string | null {
  return Object.keys(hass).find((entityId) => entityId.startsWith('calendar.')) || null;
}

/**
 * Generate a stub configuration for the card editor
 */
export function getStubConfig(hass: Record<string, { state: string }>): Record<string, unknown> {
  const calendarEntity = findCalendarEntity(hass);
  return {
    type: 'custom:calendar-card-pro-dev',
    entities: calendarEntity ? [calendarEntity] : [],
    days_to_show: 3,
    show_location: true,
    _description: !calendarEntity
      ? 'A calendar card that displays events from multiple calendars with individual styling. Add a calendar integration to Home Assistant to use this card.'
      : undefined,
  };
}
