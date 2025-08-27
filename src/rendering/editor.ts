/* eslint-disable import/order */
/**
 * Editor module for Calendar Card Pro
 * ------------------------
 * Provides the visual configuration editor for Calendar Card Pro.
 * Handles config validation, upgrade, and dynamic UI rendering using native Home Assistant elements.
 */

//-----------------------------------------------------------------------------
// IMPORTS & CONSTANTS
//-----------------------------------------------------------------------------

import { LitElement, TemplateResult, html } from 'lit';
import { property } from 'lit/decorators.js';
import styles from './editor.styles';
import * as Types from '../config/types';
import * as Config from '../config/config';
import * as Helpers from '../utils/helpers';
import * as Localize from '../translations/localize';

// Import Material Design icons
import {
  mdiCalendar, // For individual calendar entities
  mdiCalendarMonth, // For Core Settings
  mdiCalendarMultiple, // For Calendar Entities main panel
  mdiCalendarToday, // For Date Display
  mdiCardText, // For Event Display
  mdiGestureTapHold, // For Interactions
  mdiPalette, // For Appearance & Layout
  mdiWeatherPartlyCloudy, // For Weather Integration
} from '@mdi/js';

// Deprecated parameter mappings for config upgrade
const DEPRECATED_CONFIG_MAP: Record<string, string> = {
  max_events_to_show: 'compact_events_to_show',
  vertical_line_color: 'accent_color',
  horizontal_line_width: 'day_separator_width',
  horizontal_line_color: 'day_separator_color',
};
const DEPRECATED_ENTITY_CONFIG_MAP: Record<string, string> = {
  max_events_to_show: 'compact_events_to_show',
};

//-----------------------------------------------------------------------------
// COMPONENT DEFINITION & PROPERTIES
//-----------------------------------------------------------------------------

/**
 * Calendar Card Pro Editor component
 *
 * This component handles the visual configuration of the card.
 */
export class CalendarCardProEditor extends LitElement {
  static get styles() {
    return styles;
  }

  @property({ attribute: false }) hass?: Types.Hass;
  @property({ attribute: false }) _config?: Types.Config;

  //-----------------------------------------------------------------------------
  // LIFECYCLE METHODS
  //-----------------------------------------------------------------------------

  /**
   * Called when the editor is attached to the DOM.
   */
  connectedCallback(): void {
    super.connectedCallback();
    this._loadCustomElements();
  }

  /**
   * Loads custom Home Assistant elements required by the editor.
   */
  private async _loadCustomElements(): Promise<void> {
    if (!customElements.get('ha-entity-picker')) {
      try {
        const huiElement = customElements.get('hui-entities-card');
        if (
          huiElement &&
          typeof (huiElement as unknown as { getConfigElement?: () => Promise<unknown> })
            .getConfigElement === 'function'
        ) {
          await (
            huiElement as unknown as { getConfigElement: () => Promise<unknown> }
          ).getConfigElement();
        } else {
          // Fallback if method doesn't exist
          console.warn('Could not load ha-entity-picker: getConfigElement not available');
        }
      } catch (e) {
        console.warn('Could not load ha-entity-picker', e);
      }
    }
  }

  //-----------------------------------------------------------------------------
  // CONFIG MANAGEMENT & UPGRADE HELPERS
  //-----------------------------------------------------------------------------

  /**
   * Sets the configuration for the editor.
   * @param config Partial configuration object
   */
  setConfig(config: Partial<Types.Config>): void {
    this._config = { ...Config.DEFAULT_CONFIG, ...config };
  }

  /**
   * Gets a configuration value using dot notation.
   * @param path Dot notation path
   * @param defaultValue Default value if not found
   * @returns The config value or default
   */
  getConfigValue(path: string, defaultValue?: unknown): unknown {
    if (!this._config) {
      return defaultValue;
    }

    // Handle simple top-level properties
    if (!path.includes('.')) {
      let value = this._config[path] ?? defaultValue;

      // Handle special cases for string/boolean conversions in the UI
      if (path === 'time_24h') {
        // For the dropdown selection in the UI, we need string values
        if (value === true) return 'true';
        if (value === false) return 'false';
        // 'system' stays as a string
      }

      return value;
    }

    // Handle nested properties with dot notation
    const pathParts = path.split('.');
    let current: unknown = this._config;

    for (const part of pathParts) {
      if (current === undefined || current === null) {
        return defaultValue;
      }

      // Handle array indices
      if (/^\d+$/.test(part)) {
        const index = parseInt(part, 10);
        if (Array.isArray(current) && index >= 0 && index < current.length) {
          current = current[index];
          continue;
        }
        return defaultValue;
      }

      // Handle object properties
      if (
        typeof current === 'object' &&
        current !== null &&
        part in (current as Record<string, unknown>)
      ) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return defaultValue;
      }
    }

    return current ?? defaultValue;
  }

  /**
   * Sets a configuration value using dot notation.
   * @param path Dot notation path
   * @param value Value to set
   */
  setConfigValue(path: string, value: unknown): void {
    if (!this._config) {
      return;
    }

    // Handle special cases for string/boolean conversions
    if (path === 'time_24h') {
      if (value === 'true') {
        value = true; // Convert string 'true' to boolean true
      } else if (value === 'false') {
        value = false; // Convert string 'false' to boolean false
      }
      // 'system' remains as string
    }

    // Create a deep copy of the config
    const config = JSON.parse(JSON.stringify(this._config)) as Record<string, unknown>;

    // Handle simple top-level properties
    if (!path.includes('.')) {
      if (value === undefined) {
        // Only delete if undefined, preserve empty strings
        delete config[path];
      } else {
        // Store all other values, including empty strings
        config[path] = value;
      }
      this._fireConfigChanged(config as unknown as Types.Config);
      return;
    }

    // Handle nested properties with dot notation
    const pathParts = path.split('.');
    const lastPart = pathParts.pop()!;
    let current: Record<string, unknown> | unknown[] = config;

    for (const part of pathParts) {
      // Handle array indices
      if (/^\d+$/.test(part)) {
        const index = parseInt(part, 10);
        if (!Array.isArray(current)) {
          current = [] as unknown[];
        }
        while ((current as unknown[]).length <= index) {
          (current as unknown[]).push({});
        }
        if (!(current as unknown[])[index] || typeof (current as unknown[])[index] !== 'object') {
          (current as unknown[])[index] = {};
        }
        current = (current as unknown[])[index] as Record<string, unknown>;
        continue;
      }

      // Handle object properties
      if (
        !Object.prototype.hasOwnProperty.call(current, part) ||
        typeof (current as Record<string, unknown>)[part] !== 'object'
      ) {
        (current as Record<string, unknown>)[part] = {};
      }
      current = (current as Record<string, unknown>)[part] as Record<string, unknown>;
    }

    // Set or delete the final value
    if (value === undefined) {
      // Only delete if undefined, preserve empty strings
      delete (current as Record<string, unknown>)[lastPart];
    } else {
      // Store all other values, including empty strings
      (current as Record<string, unknown>)[lastPart] = value;
    }

    this._fireConfigChanged(config as unknown as Types.Config);
  }

  /**
   * Fires the config-changed event to notify Home Assistant of config updates.
   * @param config The updated config
   */
  private _fireConfigChanged(config: Types.Config): void {
    // Filter out default values to minimize YAML bloat
    const minimalConfig = Helpers.filterDefaultValues(
      config as unknown as Record<string, unknown>,
      Config.DEFAULT_CONFIG as unknown as Record<string, unknown>,
    );

    // Update internal config for UI rendering (keep full config)
    this._config = config;

    // Send only non-default values to Home Assistant
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: minimalConfig } }));
  }

  /**
   * Finds deprecated parameters at the root config level.
   * @param config The config object
   * @returns Array of deprecated parameter keys
   */
  private _findDeprecatedParams(config: Record<string, unknown>): string[] {
    return Object.keys(DEPRECATED_CONFIG_MAP).filter((deprecated) => deprecated in config);
  }

  /**
   * Finds deprecated parameters in entity configs.
   * @param entities The entities array
   * @returns Array of objects with index and param
   */
  private _findDeprecatedEntityParams(entities: unknown[]): { index: number; param: string }[] {
    const found: { index: number; param: string }[] = [];
    entities.forEach((entity, idx) => {
      if (typeof entity === 'object' && entity !== null) {
        Object.keys(DEPRECATED_ENTITY_CONFIG_MAP).forEach((deprecated) => {
          if (deprecated in entity) {
            found.push({ index: idx, param: deprecated });
          }
        });
      }
    });
    return found;
  }

  /**
   * Upgrades the config by replacing deprecated parameters with their replacements.
   */
  private _upgradeConfig(): void {
    const config = { ...this._config } as Record<string, unknown>;
    let changed = false;

    // Root-level deprecated params
    for (const [oldKey, newKey] of Object.entries(DEPRECATED_CONFIG_MAP)) {
      if (oldKey in config) {
        config[newKey] = config[oldKey];
        delete config[oldKey];
        changed = true;
      }
    }

    // Entity-level deprecated params
    if (Array.isArray(config.entities)) {
      config.entities = config.entities.map((entity) => {
        if (typeof entity === 'object' && entity !== null) {
          const newEntity = { ...entity };
          for (const [oldKey, newKey] of Object.entries(DEPRECATED_ENTITY_CONFIG_MAP)) {
            if (oldKey in newEntity) {
              newEntity[newKey] = newEntity[oldKey];
              delete newEntity[oldKey];
              changed = true;
            }
          }
          return newEntity;
        }
        return entity;
      });
    }

    if (changed) {
      this._fireConfigChanged(config as unknown as Types.Config);
    }
  }

  //-----------------------------------------------------------------------------
  // TRANSLATION & LOCALIZATION HELPERS
  //-----------------------------------------------------------------------------

  /**
   * Helper to get a translated string for the editor UI.
   * @param key Translation key
   * @returns Translated string
   */
  private _getTranslation(key: string): string {
    // Get requested language
    const requestedLang = this._config?.language || this.hass?.locale?.language || 'en';

    // Properly prefix editor keys unless they already have the prefix
    const translationKey = key.includes('.') ? key : `editor.${key}`;
    const isEditorTranslation = translationKey.startsWith('editor.');

    // If this is an editor translation, check if translations exist in the requested language
    // If not, fall back to English only for editor translations
    const langToUse =
      isEditorTranslation && !Localize.hasEditorTranslations(requestedLang) ? 'en' : requestedLang;

    // Get translation using appropriate language
    return Localize.translate(langToUse, translationKey as string, key) as string;
  }

  //-----------------------------------------------------------------------------
  // INPUT/EVENT HANDLERS
  //-----------------------------------------------------------------------------

  /**
   * Handles value changes from input elements.
   * @param event Input event
   */
  _valueChanged(event: Event): void {
    if (!event.target) return;

    event.stopPropagation();

    const target = event.target as HTMLInputElement | HTMLSelectElement;
    const name = target.getAttribute('name');

    let value: string | boolean | number | null = target.value;

    if (!name) return;

    // Handle special cases for UI controls that require custom processing
    if (name === 'language_mode') {
      const mode = target.value;

      // UI-only field that controls the real 'language' config parameter
      if (mode === 'system') {
        // Remove language setting when using system default
        this.setConfigValue('language', undefined);
      } else if (mode === 'custom') {
        // Set a default language if none exists
        if (!this.getConfigValue('language')) {
          this.setConfigValue('language', 'en');
        }
      }
      return; // Don't save the UI mode itself to config
    } else if (name === 'height_mode') {
      const mode = target.value;

      // UI-only selector that manages two real config params: height and max_height
      // Save the current height/max_height values before clearing them
      const currentHeight = this.getConfigValue('height');
      const currentMaxHeight = this.getConfigValue('max_height');

      // Clear out both height settings
      this.setConfigValue('height', undefined);
      this.setConfigValue('max_height', undefined);

      if (mode === 'fixed') {
        // Use the current height value if it exists, otherwise set default
        this.setConfigValue(
          'height',
          currentHeight && currentHeight !== 'auto' ? currentHeight : '300px',
        );
      } else if (mode === 'maximum') {
        // Use the current max_height value if it exists and isn't "none", otherwise set default
        this.setConfigValue(
          'max_height',
          currentMaxHeight && currentMaxHeight !== 'none' ? currentMaxHeight : '300px',
        );
      }
      return; // Don't save the UI mode itself to config
    } else if (name === 'start_date_mode') {
      // UI-only field that controls the 'start_date' parameter
      this._handleStartDateModeChange(target.value);
      return; // Don't save the UI mode itself to config
    } else if (name === 'start_date_fixed' || name === 'start_date_offset') {
      // These are UI-only fields that map to the single 'start_date' parameter
      this.setConfigValue('start_date', target.value);
      this.requestUpdate();
      return; // Don't save these UI fields to config
    } else if (name === 'remove_location_country_selector') {
      // UI-only field that controls the 'remove_location_country' parameter
      // The actual value is set by the custom change handler in the select field
      return; // Don't save this UI-only field to config
    } else if (name === 'show_week_numbers' && value === 'null') {
      // Special handling for show_week_numbers to convert 'null' string to actual null
      // This ensures the default option is properly stored as null rather than a string
      value = null;
    }

    // Handle switch/checkbox values
    if (target.tagName === 'HA-SWITCH') {
      value = (target as HTMLInputElement).checked;
    }

    // Handle numeric inputs
    if (target.getAttribute('type') === 'number' && value !== '') {
      value = parseFloat(value as string);
    }

    this.setConfigValue(name, value);
  }

  /**
   * Handles changes to service data fields (JSON inputs).
   * @param event Input event
   */
  _serviceDataChanged(event: Event): void {
    if (!event.target) return;

    const target = event.target as HTMLInputElement;
    const name = target.getAttribute('name');

    if (!name) return;

    let value = target.value;

    try {
      // Parse JSON and store as object
      value = value ? JSON.parse(value) : {};
      this.setConfigValue(name, value);
    } catch {
      // Invalid JSON - don't update
    }
  }

  /**
   * Determines the mode (default/fixed/offset) from a start_date value
   * @returns 'default' | 'fixed' | 'offset'
   */
  private _getStartDateMode(): 'default' | 'fixed' | 'offset' {
    const value = this.getConfigValue('start_date', '');
    // Ensure we're working with a string
    const strValue = value !== undefined && value !== null ? String(value) : '';

    if (!strValue || strValue === '') return 'default';
    if (/^\d{4}-\d{2}-\d{2}$/.test(strValue)) return 'fixed';
    if (/^[+-]?\d+$/.test(strValue)) return 'offset';
    return 'fixed'; // fallback for legacy/unknown
  }

  /**
   * Gets the appropriate value for each start_date input mode
   * @param mode The current input mode ('fixed' or 'offset')
   * @returns The appropriate value for the selected mode
   */
  private _getStartDateValue(mode: 'fixed' | 'offset'): string {
    const value = this.getConfigValue('start_date', '');
    // Ensure we're working with a string
    const strValue = value !== undefined && value !== null ? String(value) : '';

    if (mode === 'fixed' && /^\d{4}-\d{2}-\d{2}$/.test(strValue)) return strValue;
    if (mode === 'offset' && /^[+-]?\d+$/.test(strValue)) return strValue;
    return '';
  }

  /**
   * Handles changes to the start_date mode
   * @param mode The selected mode
   */
  private _handleStartDateModeChange(mode: string): void {
    if (mode === 'default') {
      this.setConfigValue('start_date', undefined);
    } else if (mode === 'fixed') {
      // Set to today as default for fixed date
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      this.setConfigValue('start_date', `${yyyy}-${mm}-${dd}`);
    } else if (mode === 'offset') {
      this.setConfigValue('start_date', '+0');
    }
  }

  //-----------------------------------------------------------------------------
  // MAIN RENDER METHOD
  //-----------------------------------------------------------------------------

  /**
   * Renders the editor UI.
   * @returns Lit template for the editor
   */
  render() {
    if (!this.hass || !this._config) {
      return html``;
    }

    // Config upgrade notice
    const deprecatedParams = this._findDeprecatedParams(
      this._config as unknown as Record<string, unknown>,
    );
    const deprecatedEntityParams = this._findDeprecatedEntityParams(
      (this._config?.entities ?? []) as unknown[],
    );
    const hasDeprecated = deprecatedParams.length > 0 || deprecatedEntityParams.length > 0;
    const upgradeNotice = hasDeprecated
      ? html`
          <div style="border-radius: 8px; overflow: hidden;">
            <ha-alert alert-type="warning">
              <div style="height: 6px"></div>
              <b>${this._getTranslation('editor.deprecated_config_detected')}</b><br />
              ${this._getTranslation('editor.deprecated_config_explanation')}<br />
              <span style="color: var(--warning-color); font-size: 0.95em;">
                ${this._getTranslation('editor.deprecated_config_update_hint')}
              </span>
              <div style="text-align:center;">
                <ha-button @click="${() => this._upgradeConfig()}">
                  <ha-icon icon="mdi:autorenew"></ha-icon>
                  ${this._getTranslation('editor.update_config')}
                </ha-button>
              </div>
            </ha-alert>
          </div>
        `
      : null;

    return html`
      ${upgradeNotice}
      <div class="card-config">
        <!-- CALENDAR ENTITIES -->
        ${this.addExpansionPanel(
          this._getTranslation('calendar_entities'),
          mdiCalendarMultiple,
          html` ${this._renderCalendarEntities()} `,
          true, // expanded by default
        )}

        <!-- CORE SETTINGS -->
        ${this.addExpansionPanel(
          this._getTranslation('core_settings'),
          mdiCalendarMonth,
          html`
            <!-- Display Range -->
            <h3>${this._getTranslation('time_range')}</h3>
            <div class="helper-text">${this._getTranslation('time_range_note')}</div>
            ${this.addTextField('days_to_show', this._getTranslation('days_to_show'), 'number')}
            <div class="helper-text">${this._getTranslation('days_to_show_note')}</div>
            ${this.addSelectField(
              'start_date_mode',
              this._getTranslation('start_date_mode'),
              [
                { value: 'default', label: this._getTranslation('start_date_mode_default') },
                { value: 'fixed', label: this._getTranslation('start_date_mode_fixed') },
                { value: 'offset', label: this._getTranslation('start_date_mode_offset') },
              ],
              false,
              String(this._getStartDateMode()),
              (value) => {
                this._handleStartDateModeChange(value);
                this.requestUpdate();
              },
            )}
            ${(() => {
              const mode = this._getStartDateMode();
              if (mode === 'fixed') {
                return this.addDateField(
                  'start_date_fixed',
                  this._getTranslation('start_date_fixed'),
                  this._getStartDateValue('fixed'),
                );
              } else if (mode === 'offset') {
                return html`
                  ${this.addTextField(
                    'start_date_offset',
                    this._getTranslation('start_date_offset'),
                    'text',
                    this._getStartDateValue('offset'),
                  )}
                  <div class="helper-text">${this._getTranslation('start_date_offset_note')}</div>
                `;
              }
              return html``;
            })()}

            <!-- Compact Mode -->
            <h3>${this._getTranslation('compact_mode')}</h3>
            <div class="helper-text">${this._getTranslation('compact_mode_note')}</div>
            ${this.addTextField(
              'compact_days_to_show',
              this._getTranslation('compact_days_to_show'),
              'number',
            )}
            ${this.addTextField(
              'compact_events_to_show',
              this._getTranslation('compact_events_to_show'),
              'number',
            )}
            ${this.addBooleanField(
              'compact_events_complete_days',
              this._getTranslation('compact_events_complete_days'),
            )}
            <div class="helper-text">
              ${this._getTranslation('compact_events_complete_days_note')}
            </div>

            <!-- Event Visibility -->
            <h3>${this._getTranslation('event_visibility')}</h3>
            ${this.addBooleanField('show_past_events', this._getTranslation('show_past_events'))}
            ${this.addBooleanField('show_empty_days', this._getTranslation('show_empty_days'))}
            ${this.addBooleanField('filter_duplicates', this._getTranslation('filter_duplicates'))}

            <!-- Language & Time Formats -->
            <h3>${this._getTranslation('language_time_formats')}</h3>
            ${this.addSelectField(
              'language_mode',
              this._getTranslation('language_mode'),
              [
                { value: 'system', label: this._getTranslation('system') },
                { value: 'custom', label: this._getTranslation('custom') },
              ],
              false,
              this.getConfigValue('language') !== undefined ? 'custom' : 'system',
            )}
            ${(() => {
              return this.getConfigValue('language') !== undefined
                ? html`
                    ${this.addTextField('language', this._getTranslation('language_code'))}
                    <div class="helper-text">${this._getTranslation('language_code_note')}</div>
                  `
                : html``;
            })()}
            ${this.addSelectField('time_24h', this._getTranslation('time_24h'), [
              { value: 'system', label: this._getTranslation('system') },
              { value: 'true', label: this._getTranslation('24h') },
              { value: 'false', label: this._getTranslation('12h') },
            ])}
          `,
        )}

        <!-- APPEARANCE & LAYOUT -->
        ${this.addExpansionPanel(
          this._getTranslation('appearance_layout'),
          mdiPalette,
          html`
            <!-- Title Styling -->
            <h3>${this._getTranslation('title_styling')}</h3>
            ${this.addTextField('title', this._getTranslation('title'))}
            ${this.addTextField('title_font_size', this._getTranslation('title_font_size'))}
            ${this.addTextField('title_color', this._getTranslation('title_color'))}

            <!-- Card Styling -->
            <h3>${this._getTranslation('card_styling')}</h3>
            ${this.addTextField('background_color', this._getTranslation('background_color'))}
            ${this.addSelectField(
              'height_mode',
              this._getTranslation('height_mode'),
              [
                { value: 'auto', label: this._getTranslation('auto') },
                { value: 'fixed', label: this._getTranslation('fixed') },
                { value: 'maximum', label: this._getTranslation('maximum') },
              ],
              false,
              (() => {
                if (
                  this.getConfigValue('height') !== undefined &&
                  this.getConfigValue('height') !== 'auto'
                ) {
                  return 'fixed';
                } else if (
                  this.getConfigValue('max_height') !== undefined &&
                  this.getConfigValue('max_height') !== 'none'
                ) {
                  return 'maximum';
                }
                return 'auto';
              })(),
            )}
            ${(() => {
              if (
                this.getConfigValue('height') !== undefined &&
                this.getConfigValue('height') !== 'auto'
              ) {
                return html`
                  ${this.addTextField('height', this._getTranslation('height_value'))}
                  <div class="helper-text">${this._getTranslation('fixed_height_note')}</div>
                `;
              } else if (
                this.getConfigValue('max_height') !== undefined &&
                this.getConfigValue('max_height') !== 'none'
              ) {
                return html`
                  ${this.addTextField('max_height', this._getTranslation('height_value'))}
                  <div class="helper-text">${this._getTranslation('max_height_note')}</div>
                `;
              }
              return html``;
            })()}

            <!-- Event Styling -->
            <h3>${this._getTranslation('event_styling')}</h3>
            ${this.addTextField('accent_color', this._getTranslation('accent_color'))}
            ${this.addTextField(
              'event_background_opacity',
              this._getTranslation('event_background_opacity'),
              'number',
            )}
            ${this.addTextField('vertical_line_width', this._getTranslation('vertical_line_width'))}

            <!-- Spacing & Alignment -->
            <h3>${this._getTranslation('spacing_alignment')}</h3>
            ${this.addTextField('day_spacing', this._getTranslation('day_spacing'))}
            ${this.addTextField('event_spacing', this._getTranslation('event_spacing'))}
            ${this.addTextField(
              'additional_card_spacing',
              this._getTranslation('additional_card_spacing'),
            )}
          `,
        )}

        <!-- DATE DISPLAY -->
        ${this.addExpansionPanel(
          this._getTranslation('date_display'),
          mdiCalendarToday,
          html`
            <!-- Date Column Formatting -->
            <h3>${this._getTranslation('vertical_alignment')}</h3>
            ${this.addSelectField(
              'date_vertical_alignment',
              this._getTranslation('date_vertical_alignment'),
              [
                { value: 'top', label: this._getTranslation('top') },
                { value: 'middle', label: this._getTranslation('middle') },
                { value: 'bottom', label: this._getTranslation('bottom') },
              ],
            )}

            <!-- Date Column Formatting -->
            <h3>${this._getTranslation('date_formatting')}</h3>

            <!-- Weekday Formatting -->
            <h5>${this._getTranslation('weekday_font')}</h5>
            ${this.addTextField('weekday_font_size', this._getTranslation('weekday_font_size'))}
            ${this.addTextField('weekday_color', this._getTranslation('weekday_color'))}

            <!-- Day Formatting -->
            <h5>${this._getTranslation('day_font')}</h5>
            ${this.addTextField('day_font_size', this._getTranslation('day_font_size'))}
            ${this.addTextField('day_color', this._getTranslation('day_color'))}

            <!-- Month Formatting -->
            <h5>${this._getTranslation('month_font')}</h5>
            ${this.addBooleanField('show_month', this._getTranslation('show_month'))}
            ${this.addTextField('month_font_size', this._getTranslation('month_font_size'))}
            ${this.addTextField('month_color', this._getTranslation('month_color'))}

            <!-- Weekend Highlighting -->
            <h5>${this._getTranslation('weekend_highlighting')}</h5>
            ${this.addTextField(
              'weekend_weekday_color',
              this._getTranslation('weekend_weekday_color'),
            )}
            ${this.addTextField('weekend_day_color', this._getTranslation('weekend_day_color'))}
            ${this.addTextField('weekend_month_color', this._getTranslation('weekend_month_color'))}

            <!-- Today Highlighting -->
            <h5>${this._getTranslation('today_highlighting')}</h5>
            ${this.addTextField('today_weekday_color', this._getTranslation('today_weekday_color'))}
            ${this.addTextField('today_day_color', this._getTranslation('today_day_color'))}
            ${this.addTextField('today_month_color', this._getTranslation('today_month_color'))}

            <!-- Today Indicator -->
            <h3>${this._getTranslation('today_indicator')}</h3>
            ${this.addTodayIndicatorField(
              'today_indicator',
              this._getTranslation('today_indicator'),
            )}
            ${(() => {
              const indicatorValue = this.getConfigValue('today_indicator');
              // Only show additional fields if indicator is enabled (not false, undefined, or "none")
              if (indicatorValue && indicatorValue !== 'none') {
                return html`
                  ${this.addTextField(
                    'today_indicator_position',
                    this._getTranslation('today_indicator_position'),
                  )}
                  ${this.addTextField(
                    'today_indicator_color',
                    this._getTranslation('today_indicator_color'),
                  )}
                  ${this.addTextField(
                    'today_indicator_size',
                    this._getTranslation('today_indicator_size'),
                  )}
                `;
              }
              return html``;
            })()}

            <!-- Week Numbers & Separators -->
            <h3>${this._getTranslation('week_numbers_separators')}</h3>

            <!-- Week Numbers -->
            <h5>${this._getTranslation('week_numbers')}</h5>
            ${this.addSelectField('first_day_of_week', this._getTranslation('first_day_of_week'), [
              { value: 'system', label: this._getTranslation('system') },
              { value: 'sunday', label: this._getTranslation('sunday') },
              { value: 'monday', label: this._getTranslation('monday') },
            ])}
            ${this.addSelectField('show_week_numbers', this._getTranslation('show_week_numbers'), [
              { value: 'null', label: this._getTranslation('none') },
              { value: 'iso', label: 'ISO' },
              { value: 'simple', label: this._getTranslation('simple') },
            ])}
            ${(() => {
              const weekNumbersValue = this.getConfigValue('show_week_numbers');

              if (weekNumbersValue === 'iso') {
                return html`<div class="helper-text">
                  ${this._getTranslation('week_number_note_iso')}
                </div>`;
              } else if (weekNumbersValue === 'simple') {
                return html`<div class="helper-text">
                  ${this._getTranslation('week_number_note_simple')}
                </div>`;
              }

              return html``;
            })()}
            ${(() => {
              const weekNumbersEnabled = this.getConfigValue('show_week_numbers');
              if (weekNumbersEnabled && weekNumbersEnabled !== 'null') {
                return html`
                  ${this.addBooleanField(
                    'show_current_week_number',
                    this._getTranslation('show_current_week_number'),
                  )}
                  ${this.addTextField(
                    'week_number_font_size',
                    this._getTranslation('week_number_font_size'),
                  )}
                  ${this.addTextField(
                    'week_number_color',
                    this._getTranslation('week_number_color'),
                  )}
                  ${this.addTextField(
                    'week_number_background_color',
                    this._getTranslation('week_number_background_color'),
                  )}
                `;
              }
              return html``;
            })()}

            <!-- Day Separator -->
            <h5>${this._getTranslation('day_separator')}</h5>
            ${this.addBooleanField(
              'day_separator_toggle',
              this._getTranslation('show_day_separator'),
              this.getConfigValue('day_separator_width') !== '0px' &&
                this.getConfigValue('day_separator_width') !== '0',
              (e) => {
                // Get the toggle state from the event
                const checked = (e.target as HTMLInputElement).checked;

                // Set width based on toggle state
                if (checked) {
                  // If toggled ON, set default width
                  this.setConfigValue('day_separator_width', '1px');
                } else {
                  // If toggled OFF, set to 0px to hide
                  this.setConfigValue('day_separator_width', '0px');
                }
              },
              true, // UI-only
            )}
            ${(() => {
              // Only show width and color fields if separator is enabled (width is not 0px)
              const separatorEnabled =
                this.getConfigValue('day_separator_width') !== '0px' &&
                this.getConfigValue('day_separator_width') !== '0';

              if (!separatorEnabled) {
                return html``;
              }

              return html`
                ${this.addTextField(
                  'day_separator_width',
                  this._getTranslation('day_separator_width'),
                )}
                ${this.addTextField(
                  'day_separator_color',
                  this._getTranslation('day_separator_color'),
                )}
              `;
            })()}

            <!-- Week Separator -->
            <h5>${this._getTranslation('week_separator')}</h5>
            ${this.addBooleanField(
              'week_separator_toggle',
              this._getTranslation('show_week_separator'),
              this.getConfigValue('week_separator_width') !== '0px' &&
                this.getConfigValue('week_separator_width') !== '0',
              (e) => {
                // Get the toggle state from the event
                const checked = (e.target as HTMLInputElement).checked;

                // Set width based on toggle state
                if (checked) {
                  // If toggled ON, set default width
                  this.setConfigValue('week_separator_width', '1px');
                } else {
                  // If toggled OFF, set to 0px to hide
                  this.setConfigValue('week_separator_width', '0px');
                }
              },
              true, // UI-only
            )}
            ${(() => {
              // Only show width and color fields if separator is enabled (width is not 0px)
              const separatorEnabled =
                this.getConfigValue('week_separator_width') !== '0px' &&
                this.getConfigValue('week_separator_width') !== '0';

              if (!separatorEnabled) {
                return html``;
              }

              return html`
                ${this.addTextField(
                  'week_separator_width',
                  this._getTranslation('week_separator_width'),
                )}
                ${this.addTextField(
                  'week_separator_color',
                  this._getTranslation('week_separator_color'),
                )}
              `;
            })()}

            <!-- Month Separator -->
            <h5>${this._getTranslation('month_separator')}</h5>
            ${this.addBooleanField(
              'month_separator_toggle',
              this._getTranslation('show_month_separator'),
              this.getConfigValue('month_separator_width') !== '0px' &&
                this.getConfigValue('month_separator_width') !== '0',
              (e) => {
                // Get the toggle state from the event
                const checked = (e.target as HTMLInputElement).checked;

                // Set width based on toggle state
                if (checked) {
                  // If toggled ON, set default width
                  this.setConfigValue('month_separator_width', '1px');
                } else {
                  // If toggled OFF, set to 0px to hide
                  this.setConfigValue('month_separator_width', '0px');
                }
              },
              true, // UI-only
            )}
            ${(() => {
              // Only show width and color fields if separator is enabled (width is not 0px)
              const separatorEnabled =
                this.getConfigValue('month_separator_width') !== '0px' &&
                this.getConfigValue('month_separator_width') !== '0';

              if (!separatorEnabled) {
                return html``;
              }

              return html`
                ${this.addTextField(
                  'month_separator_width',
                  this._getTranslation('month_separator_width'),
                )}
                ${this.addTextField(
                  'month_separator_color',
                  this._getTranslation('month_separator_color'),
                )}
              `;
            })()}
          `,
        )}

        <!-- EVENT DISPLAY -->
        ${this.addExpansionPanel(
          this._getTranslation('event_display'),
          mdiCardText,
          html`
            <!-- Event Content -->
            <h3>${this._getTranslation('event_title')}</h3>
            ${this.addTextField('event_font_size', this._getTranslation('event_font_size'))}
            ${this.addTextField('event_color', this._getTranslation('event_color'))}
            ${this.addTextField('empty_day_color', this._getTranslation('empty_day_color'))}

            <!-- Time Display -->
            <h3>${this._getTranslation('time')}</h3>
            ${this.addBooleanField('show_time', this._getTranslation('show_time'))}
            ${(() => {
              // Only show additional time fields if show_time is true
              if (this.getConfigValue('show_time') !== true) {
                return html``;
              }

              return html`
                ${this.addBooleanField(
                  'show_single_allday_time',
                  this._getTranslation('show_single_allday_time'),
                )}
                ${this.addBooleanField('show_end_time', this._getTranslation('show_end_time'))}
                ${this.addTextField('time_font_size', this._getTranslation('time_font_size'))}
                ${this.addTextField('time_color', this._getTranslation('time_color'))}
                ${this.addTextField('time_icon_size', this._getTranslation('time_icon_size'))}
              `;
            })()}

            <!-- Location Display -->
            <h3>${this._getTranslation('location')}</h3>
            ${this.addBooleanField('show_location', this._getTranslation('show_location'))}
            ${(() => {
              // Only show additional location fields if show_location is true
              if (this.getConfigValue('show_location') !== true) {
                return html``;
              }

              return html`
                ${this.addTextField(
                  'location_font_size',
                  this._getTranslation('location_font_size'),
                )}
                ${this.addTextField('location_color', this._getTranslation('location_color'))}
                ${this.addTextField(
                  'location_icon_size',
                  this._getTranslation('location_icon_size'),
                )}
                ${this.addSelectField(
                  'remove_location_country_selector',
                  this._getTranslation('remove_location_country'),
                  [
                    { value: 'false', label: this._getTranslation('none') },
                    { value: 'true', label: this._getTranslation('simple') },
                    { value: 'custom', label: this._getTranslation('custom') },
                  ],
                  false,
                  (() => {
                    if (!this._config || !this._config.hasOwnProperty('remove_location_country'))
                      return 'false';
                    const value = this._config.remove_location_country;
                    if (value === true || value === 'true') return 'true';
                    if (value === false || value === 'false') return 'false';
                    if (typeof value === 'string') return 'custom';
                    return 'false';
                  })(),
                  (mode) => {
                    // Handle mode selection
                    if (mode === 'true') {
                      this.setConfigValue('remove_location_country', true);
                    } else if (mode === 'false') {
                      this.setConfigValue('remove_location_country', false);
                    } else if (mode === 'custom') {
                      // Only set default if switching from non-custom to custom
                      if (
                        this._config &&
                        this._config.remove_location_country !== 'custom' &&
                        typeof this._config.remove_location_country !== 'string'
                      ) {
                        this.setConfigValue('remove_location_country', 'USA|United States|Canada');
                      }
                    }
                  },
                )}
                ${(() => {
                  // Only show custom pattern field when in custom mode
                  if (
                    !this._config ||
                    !this._config.hasOwnProperty('remove_location_country') ||
                    this._config.remove_location_country === true ||
                    this._config.remove_location_country === false ||
                    this._config.remove_location_country === 'true' ||
                    this._config.remove_location_country === 'false'
                  ) {
                    return html``;
                  }

                  // Show custom pattern field if we have a string value that's not 'true'/'false'
                  const value = this._config.remove_location_country;
                  if (typeof value === 'string' && value !== 'true' && value !== 'false') {
                    return html`
                      <ha-textfield
                        label="${this._getTranslation('custom_country_pattern')}"
                        .value="${value}"
                        @change="${(e) =>
                          this.setConfigValue('remove_location_country', e.target.value)}"
                      ></ha-textfield>
                      <div class="helper-text">
                        ${this._getTranslation('custom_country_pattern_note')}
                      </div>
                    `;
                  }

                  return html``;
                })()}
              `;
            })()}

            <!-- Progress Indicators -->
            <h3>${this._getTranslation('progress_indicators')}</h3>
            ${this.addBooleanField('show_countdown', this._getTranslation('show_countdown'))}
            ${this.addBooleanField('show_progress_bar', this._getTranslation('show_progress_bar'))}
            ${(() => {
              // Only show additional progress bar fields if show_progress_bar is true
              if (this.getConfigValue('show_progress_bar') !== true) {
                return html``;
              }

              return html`
                ${this.addTextField(
                  'progress_bar_color',
                  this._getTranslation('progress_bar_color'),
                )}
                ${this.addTextField(
                  'progress_bar_height',
                  this._getTranslation('progress_bar_height'),
                )}
                ${this.addTextField(
                  'progress_bar_width',
                  this._getTranslation('progress_bar_width'),
                )}
              `;
            })()}

            <!-- Multi-day Event Handling -->
            <h3>${this._getTranslation('multiday_event_handling')}</h3>
            ${this.addBooleanField(
              'split_multiday_events',
              this._getTranslation('split_multiday_events'),
            )}
          `,
        )}

        <!-- WEATHER INTEGRATION -->
        ${this.addExpansionPanel(
          this._getTranslation('weather_integration'),
          mdiWeatherPartlyCloudy,
          html`
            <!-- Weather Entity & Position -->
            <h3>${this._getTranslation('weather_entity_position')}</h3>
            ${this.addEntityPickerField('weather.entity', this._getTranslation('weather_entity'), [
              'weather',
            ])}

            <!-- Only show the rest of the weather config when an entity is selected -->
            ${(() => {
              const weatherEntity = this.getConfigValue('weather.entity');

              // If no weather entity is selected, don't show any other config options
              if (!weatherEntity) return html``;

              return html`
                ${this.addSelectField(
                  'weather.position',
                  this._getTranslation('weather_position'),
                  [
                    { value: 'none', label: this._getTranslation('none') },
                    { value: 'date', label: this._getTranslation('date') },
                    { value: 'event', label: this._getTranslation('event') },
                    { value: 'both', label: this._getTranslation('both') },
                  ],
                )}

                <!-- Conditionally render weather settings based on selected position -->
                ${(() => {
                  const position = this.getConfigValue('weather.position', 'none');
                  return html`
                    ${position === 'date' || position === 'both'
                      ? html`
                          <!-- Date Column Weather -->
                          <h3>${this._getTranslation('date_column_weather')}</h3>
                          ${this.addBooleanField(
                            'weather.date.show_conditions',
                            this._getTranslation('show_conditions'),
                          )}
                          ${this.addBooleanField(
                            'weather.date.show_high_temp',
                            this._getTranslation('show_high_temp'),
                          )}
                          ${this.addBooleanField(
                            'weather.date.show_low_temp',
                            this._getTranslation('show_low_temp'),
                          )}
                          ${this.addTextField(
                            'weather.date.icon_size',
                            this._getTranslation('icon_size'),
                          )}
                          ${this.addTextField(
                            'weather.date.font_size',
                            this._getTranslation('font_size'),
                          )}
                          ${this.addTextField('weather.date.color', this._getTranslation('color'))}
                        `
                      : html``}
                    ${position === 'event' || position === 'both'
                      ? html`
                          <!-- Event Row Weather -->
                          <h3>${this._getTranslation('event_row_weather')}</h3>
                          ${this.addBooleanField(
                            'weather.event.show_conditions',
                            this._getTranslation('show_conditions'),
                          )}
                          ${this.addBooleanField(
                            'weather.event.show_temp',
                            this._getTranslation('show_temp'),
                          )}
                          ${this.addTextField(
                            'weather.event.icon_size',
                            this._getTranslation('icon_size'),
                          )}
                          ${this.addTextField(
                            'weather.event.font_size',
                            this._getTranslation('font_size'),
                          )}
                          ${this.addTextField('weather.event.color', this._getTranslation('color'))}
                        `
                      : html``}
                  `;
                })()}
              `;
            })()}
          `,
        )}

        <!-- INTERACTIONS -->
        ${this.addExpansionPanel(
          this._getTranslation('interactions'),
          mdiGestureTapHold,
          html`
            <!-- Tap Action -->
            <h3>${this._getTranslation('tap_action')}</h3>
            ${this._renderActionConfig('tap_action')}

            <!-- Hold Action -->
            <h3>${this._getTranslation('hold_action')}</h3>
            ${this._renderActionConfig('hold_action')}

            <!-- Refresh Settings -->
            <h3>${this._getTranslation('refresh_settings')}</h3>
            ${this.addTextField(
              'refresh_interval',
              this._getTranslation('refresh_interval'),
              'number',
            )}
            ${this.addBooleanField(
              'refresh_on_navigate',
              this._getTranslation('refresh_on_navigate'),
            )}
          `,
        )}
      </div>
    `;
  }

  //-----------------------------------------------------------------------------
  // RENDERING HELPERS (UI FIELD GENERATORS)
  //-----------------------------------------------------------------------------

  /**
   * Adds a text field input to the editor.
   * @param name Config key
   * @param label Field label
   * @param type Input type
   * @param defaultValue Default value
   * @returns Lit template for the text field
   */
  addTextField(name: string, label?: string, type?: string, defaultValue?: string): TemplateResult {
    let value = this.getConfigValue(name, defaultValue);

    // Convert undefined values to empty strings for better UX
    if (value === undefined) {
      value = ''; // Empty string instead of undefined
    }

    return html`
      <ha-textfield
        name="${name}"
        label="${label ?? this._getTranslation(name)}"
        type="${type ?? 'text'}"
        .value="${value}"
        @keyup="${this._valueChanged}"
        @change="${this._valueChanged}"
      ></ha-textfield>
    `;
  }

  /**
   * Adds an entity picker field to the editor.
   * @param name Config key
   * @param label Field label
   * @param includeDomains Domains to include
   * @param defaultValue Default value
   * @returns Lit template for the entity picker
   */
  addEntityPickerField(
    name: string,
    label?: string,
    includeDomains?: string[],
    defaultValue?: string,
  ): TemplateResult {
    return html`
      <ha-entity-picker
        .hass="${this.hass}"
        name="${name}"
        label="${label ?? this._getTranslation(name)}"
        .value="${this.getConfigValue(name, defaultValue)}"
        .includeDomains="${includeDomains}"
        @value-changed="${(e: CustomEvent) => {
          e.stopPropagation();
          this.setConfigValue(name, e.detail.value);
        }}"
      ></ha-entity-picker>
    `;
  }

  /**
   * Adds a boolean field (switch) to the editor.
   * @param name Config key
   * @param label Field label
   * @param defaultValue Default value
   * @param changeCallback Optional callback for change events
   * @param uiOnly When true, the field won't be saved to config (UI control only)
   * @returns Lit template for the boolean field
   */
  addBooleanField(
    name: string,
    label?: string,
    defaultValue?: boolean,
    changeCallback?: (event: Event) => void,
    uiOnly: boolean = false,
  ): TemplateResult {
    return html`
      <ha-formfield label="${label ?? this._getTranslation(name)}">
        <ha-switch
          name="${name}"
          .checked="${this.getConfigValue(name, defaultValue)}"
          @change="${(event: Event) => {
            // Only call _valueChanged if this is not a UI-only field
            if (!uiOnly) this._valueChanged(event);
            // Always call the callback if provided
            if (changeCallback) changeCallback(event);
          }}"
        ></ha-switch>
      </ha-formfield>
    `;
  }

  /**
   * Adds a select dropdown field to the editor.
   * @param name Config key
   * @param label Field label
   * @param options Dropdown options
   * @param clearable Whether the field is clearable
   * @param defaultValue Default value
   * @param changeCallback Optional callback for change events
   * @returns Lit template for the select field
   */
  addSelectField(
    name: string,
    label?: string,
    options?: Array<{ value: string; label: string }>,
    clearable?: boolean,
    defaultValue?: string,
    changeCallback?: (value: string) => void,
  ): TemplateResult {
    return html`
      <ha-select
        name="${name}"
        label="${label ?? this._getTranslation(name)}"
        .value="${this.getConfigValue(name, defaultValue)}"
        .clearable="${clearable ?? false}"
        @change="${(event: Event) => {
          this._valueChanged(event);
          if (changeCallback && event.target) {
            const value = (event.target as HTMLSelectElement).value;
            changeCallback(value);
          }
        }}"
        @closed="${(event: Event) => event.stopPropagation()}"
      >
        ${options?.map(
          (option) => html`
            <mwc-list-item value="${option.value}">${option.label}</mwc-list-item>
          `,
        )}
      </ha-select>
    `;
  }

  /**
   * Adds a date picker field styled to match native Home Assistant UI components.
   * @param name Config key
   * @param label Field label
   * @param defaultValue Default value in 'YYYY-MM-DD' format
   * @returns Lit template for the date picker field
   */
  addDateField(name: string, label?: string, defaultValue?: string): TemplateResult {
    let value = this.getConfigValue(name, defaultValue);
    if (value === undefined) value = '';

    // Format date for display using locale settings
    const displayDate =
      value && (typeof value === 'string' || typeof value === 'number')
        ? Helpers.formatDateByLocale(new Date(value as string | number), this.hass?.locale)
        : '';

    return html`
      <div class="date-input">
        <div class="mdc-text-field mdc-text-field--filled">
          <!-- Ripple overlay element for hover effect -->
          <div class="mdc-text-field__ripple"></div>

          <span class="mdc-floating-label mdc-floating-label--float-above">
            ${label ?? this._getTranslation(name)}
          </span>

          <div class="value-container">
            <span class="value-text">${displayDate}</span>
          </div>
        </div>

        <input
          type="date"
          name="${name}"
          .value="${value}"
          @focus="${(e: FocusEvent) => {
            // Apply focus styles when input gets focus
            const parent = (e.target as HTMLElement).closest('.date-input') as HTMLElement;
            const field = parent?.querySelector('.mdc-text-field') as HTMLElement;
            const label = parent?.querySelector('.mdc-floating-label') as HTMLElement;
            const ripple = parent?.querySelector('.mdc-text-field__ripple') as HTMLElement;

            if (field) {
              field.classList.add('focused');
              // Add this line to set the border to blue when focused
              field.style.borderBottom = '2px solid var(--primary-color)';
              // Also set the label color to match the primary color
              if (label) {
                label.style.color = 'var(--primary-color)';
              }
            }

            if (ripple) {
              ripple.style.opacity = '0.08';
            }
          }}"
          @blur="${(e: FocusEvent) => {
            // Remove focus styles when input loses focus
            const parent = (e.target as HTMLElement).closest('.date-input') as HTMLElement;
            const field = parent?.querySelector('.mdc-text-field') as HTMLElement;
            const label = parent?.querySelector('.mdc-floating-label') as HTMLElement;
            const ripple = parent?.querySelector('.mdc-text-field__ripple') as HTMLElement;

            if (field) {
              field.classList.remove('focused');
              // Reset the border when unfocused
              field.style.borderBottom =
                '1px solid var(--mdc-text-field-idle-line-color, var(--secondary-text-color))';
              // Reset the label color
              if (label) {
                label.style.color = 'var(--mdc-select-label-ink-color, rgba(0,0,0,.6))';
              }
            }

            if (ripple) {
              ripple.style.opacity = '0';
            }
          }}"
          @mouseover="${(e: MouseEvent) => {
            // Apply hover styles
            const parent = (e.target as HTMLElement).closest('.date-input') as HTMLElement;
            const field = parent?.querySelector('.mdc-text-field') as HTMLElement;
            const ripple = parent?.querySelector('.mdc-text-field__ripple') as HTMLElement;

            if (field && !field.classList.contains('focused')) {
              field.style.borderBottomColor = 'var(--primary-text-color)';

              if (ripple) {
                ripple.style.opacity = '0.04';
              }
            }
          }}"
          @mouseout="${(e: MouseEvent) => {
            // Remove hover styles
            const parent = (e.target as HTMLElement).closest('.date-input') as HTMLElement;
            const field = parent?.querySelector('.mdc-text-field') as HTMLElement;
            const ripple = parent?.querySelector('.mdc-text-field__ripple') as HTMLElement;

            if (field && !field.classList.contains('focused')) {
              field.style.borderBottomColor =
                'var(--mdc-text-field-idle-line-color, var(--secondary-text-color))';

              if (ripple) {
                ripple.style.opacity = '0';
              }
            }
          }}"
          @change="${(e: Event) => {
            this._valueChanged(e);

            // Also update the display value
            const target = e.target as HTMLInputElement;
            const parent = target.closest('.date-input');
            const valueSpan = parent?.querySelector('.value-container span');
            if (valueSpan && target.value) {
              valueSpan.textContent = new Date(target.value).toLocaleDateString();
            }
          }}"
        />
      </div>
    `;
  }

  /**
   * Adds an expansion panel to the editor.
   * @param header Panel header
   * @param icon Panel icon
   * @param content Panel content
   * @param expanded Whether the panel is expanded by default
   * @returns Lit template for the expansion panel
   */
  addExpansionPanel(
    header: string,
    icon: string,
    content: TemplateResult,
    expanded?: boolean,
  ): TemplateResult {
    return html`
      <ha-expansion-panel .header="${header}" .expanded="${expanded ?? false}" outlined>
        <ha-svg-icon slot="leading-icon" .path=${icon}></ha-svg-icon>
        <div class="panel-content">${content}</div>
      </ha-expansion-panel>
    `;
  }

  /**
   * Adds a button to the editor.
   * @param text Button text
   * @param icon Button icon
   * @param clickFunction Click handler
   * @returns Lit template for the button
   */
  addButton(text: string, icon: string, clickFunction: () => void): TemplateResult {
    return html`
      <ha-button @click="${clickFunction}">
        <ha-icon icon="${icon}"></ha-icon>
        ${text}
      </ha-button>
    `;
  }

  /**
   * Adds an icon picker field to the editor.
   * @param name Config key
   * @param label Field label
   * @returns Lit template for the icon picker
   */
  addIconPickerField(name: string, label?: string): TemplateResult {
    return html`
      <ha-icon-picker
        .hass="${this.hass}"
        name="${name}"
        label="${label ?? this._getTranslation(name)}"
        .value="${this.getConfigValue(name)}"
        @value-changed="${(event: CustomEvent<{ value: string }>) => {
          this.setConfigValue(name, event.detail.value);
        }}"
      ></ha-icon-picker>
    `;
  }

  /**
   * Adds a Today Indicator field with specialized UI.
   * @param name Config key
   * @param label Field label
   * @returns Lit template for the today indicator field
   */
  addTodayIndicatorField(name: string, label?: string): TemplateResult {
    // Define options for today indicator
    const options = [
      { value: 'none', label: this._getTranslation('none') },
      { value: 'dot', label: this._getTranslation('dot') },
      { value: 'pulse', label: this._getTranslation('pulse') },
      { value: 'glow', label: this._getTranslation('glow') },
      { value: 'icon', label: this._getTranslation('icon') },
      { value: 'emoji', label: this._getTranslation('emoji') },
      { value: 'image', label: this._getTranslation('image') },
    ];

    return this._renderTypeSelector(
      name,
      label ?? this._getTranslation(name),
      options,
      'indicator',
    );
  }

  //-----------------------------------------------------------------------------
  // CALENDAR ENTITY RENDERING & MANAGEMENT
  //-----------------------------------------------------------------------------

  /**
   * Renders a calendar entity configuration panel.
   * @param entity The entity config or string
   * @param index Index in the entities array
   * @returns Lit template for the entity panel
   */
  _renderCalendarEntity(entity: string | Types.EntityConfig, index: number): TemplateResult {
    const isStringEntity = typeof entity === 'string';
    const entityValue = isStringEntity ? entity : entity.entity;

    // Create a panel header that shows both label (if set) and entity ID
    const panelHeader =
      isStringEntity || !entity.label
        ? `${this._getTranslation('calendar')}: ${entityValue}`
        : `${this._getTranslation('calendar')}: ${entity.label} (${entityValue})`;

    return html`
      ${this.addExpansionPanel(
        panelHeader,
        mdiCalendar,
        html`
          <!-- Entity Identification Section -->
          <div class="editor-section">
            <h4>${this._getTranslation('entity_identification')}</h4>
            ${this.addEntityPickerField(
              `entities.${index}${isStringEntity ? '' : '.entity'}`,
              this._getTranslation('entity'),
              ['calendar'],
            )}
          </div>

          ${!isStringEntity
            ? html`
                <!-- Display Settings Section -->
                <div class="editor-section">
                  <h4>${this._getTranslation('display_settings')}</h4>

                  <div class="subsection">
                    <h5>${this._getTranslation('label')}</h5>
                    ${(() => {
                      const path = `entities.${index}.label`;
                      const options = [
                        { value: 'none', label: this._getTranslation('none') },
                        { value: 'text', label: this._getTranslation('text_emoji') },
                        { value: 'icon', label: this._getTranslation('icon') },
                        { value: 'image', label: this._getTranslation('image') },
                      ];
                      return this._renderTypeSelector(
                        path,
                        this._getTranslation('label_type'),
                        options,
                        'label',
                      );
                    })()}
                    <div class="helper-text">${this._getTranslation('label_note')}</div>
                  </div>

                  <div class="subsection">
                    <h5>${this._getTranslation('colors')}</h5>
                    ${this.addTextField(
                      `entities.${index}.color`,
                      this._getTranslation('event_color'),
                    )}
                    <div class="helper-text">${this._getTranslation('entity_color_note')}</div>

                    ${this.addTextField(
                      `entities.${index}.accent_color`,
                      this._getTranslation('accent_color'),
                    )}
                    <div class="helper-text">
                      ${this._getTranslation('entity_accent_color_note')}
                    </div>
                  </div>
                </div>

                <!-- Event Filtering Section -->
                <div class="editor-section">
                  <h4>${this._getTranslation('event_filtering')}</h4>

                  ${this.addTextField(
                    `entities.${index}.blocklist`,
                    this._getTranslation('blocklist'),
                  )}
                  <div class="helper-text">${this._getTranslation('blocklist_note')}</div>

                  ${this.addTextField(
                    `entities.${index}.allowlist`,
                    this._getTranslation('allowlist'),
                  )}
                  <div class="helper-text">${this._getTranslation('allowlist_note')}</div>
                </div>

                <!-- Entity Overrides Section -->
                <div class="editor-section">
                  <h4>${this._getTranslation('entity_overrides')}</h4>
                  <div class="helper-text section-note">
                    ${this._getTranslation('entity_overrides_note')}
                  </div>

                  ${this.addTextField(
                    `entities.${index}.compact_events_to_show`,
                    this._getTranslation('compact_events_to_show'),
                    'number',
                  )}
                  <div class="helper-text">
                    ${this._getTranslation('entity_compact_events_note')}
                  </div>

                  ${this.addBooleanField(
                    `entities.${index}.show_time`,
                    this._getTranslation('show_time'),
                  )}
                  <div class="helper-text">${this._getTranslation('entity_show_time_note')}</div>

                  ${this.addBooleanField(
                    `entities.${index}.show_location`,
                    this._getTranslation('show_location'),
                  )}
                  <div class="helper-text">
                    ${this._getTranslation('entity_show_location_note')}
                  </div>

                  ${this.addBooleanField(
                    `entities.${index}.split_multiday_events`,
                    this._getTranslation('split_multiday_events'),
                  )}
                  <div class="helper-text">
                    ${this._getTranslation('entity_split_multiday_note')}
                  </div>
                </div>
              `
            : html``}

          <!-- Entity Action Buttons -->
          <div class="editor-section button-section">
            ${this.addButton(this._getTranslation('remove'), 'mdi:trash-can', () =>
              this._removeCalendarEntity(index),
            )}
            ${isStringEntity
              ? html`
                  ${this.addButton(
                    this._getTranslation('convert_to_advanced'),
                    'mdi:code-json',
                    () => this._convertEntityToObject(index),
                  )}
                `
              : html``}
          </div>
        `,
      )}
    `;
  }

  /**
   * Renders all calendar entities.
   * @returns Lit template for all entity panels
   */
  _renderCalendarEntities(): TemplateResult {
    const entities = this._config?.entities || [];

    return html`
      ${entities.map((entity, index) => this._renderCalendarEntity(entity, index))}
      ${this.addButton(this._getTranslation('add_calendar'), 'mdi:plus', () =>
        this._addCalendarEntity(),
      )}
    `;
  }

  /**
   * Adds a new calendar entity to the config.
   */
  _addCalendarEntity(): void {
    const entities = [...(this._config?.entities || [])];
    entities.push({ entity: 'calendar.calendar' });

    this.setConfigValue('entities', entities);
  }

  /**
   * Removes a calendar entity from the config.
   * @param index Index to remove
   */
  _removeCalendarEntity(index: number): void {
    const entities = [...(this._config?.entities || [])];
    entities.splice(index, 1);
    this.setConfigValue('entities', entities);
  }

  /**
   * Converts a string entity to an object entity in the config.
   * @param index Index to convert
   */
  _convertEntityToObject(index: number): void {
    const entities = [...(this._config?.entities || [])];
    const entityValue = entities[index] as string;
    entities[index] = { entity: entityValue };
    this.setConfigValue('entities', entities);
  }

  //-----------------------------------------------------------------------------
  // ACTION CONFIG RENDERING
  //-----------------------------------------------------------------------------

  /**
   * Renders the action configuration UI for a given action.
   * @param configKey Config key for the action
   * @returns Lit template for the action config
   */
  _renderActionConfig(configKey: string): TemplateResult {
    const actionConfig = this.getConfigValue(configKey, { action: 'none' }) as Record<
      string,
      unknown
    >;
    const action = (actionConfig.action as string) || 'none';

    return html`
      <div class="action-config">
        <ha-select
          name="${configKey}.action"
          .value="${action}"
          @change="${this._valueChanged}"
          @closed="${(e: Event) => e.stopPropagation()}"
        >
          <mwc-list-item value="none">${this._getTranslation('none')}</mwc-list-item>
          <mwc-list-item value="expand">${this._getTranslation('expand')}</mwc-list-item>
          <mwc-list-item value="more-info">${this._getTranslation('more_info')}</mwc-list-item>
          <mwc-list-item value="navigate">${this._getTranslation('navigate')}</mwc-list-item>
          <mwc-list-item value="url">${this._getTranslation('url')}</mwc-list-item>
          <mwc-list-item value="call-service"
            >${this._getTranslation('call_service')}</mwc-list-item
          >
        </ha-select>

        ${action === 'navigate'
          ? html`
              <ha-textfield
                name="${configKey}.navigation_path"
                .value="${actionConfig.navigation_path || ''}"
                label="${this._getTranslation('navigation_path')}"
                @change="${this._valueChanged}"
              ></ha-textfield>
            `
          : html``}
        ${action === 'url'
          ? html`
              <ha-textfield
                name="${configKey}.url_path"
                .value="${actionConfig.url_path || ''}"
                label="${this._getTranslation('url_path')}"
                @change="${this._valueChanged}"
              ></ha-textfield>
            `
          : html``}
        ${action === 'call-service'
          ? html`
              <ha-textfield
                name="${configKey}.service"
                .value="${actionConfig.service || ''}"
                label="${this._getTranslation('service')}"
                @change="${this._valueChanged}"
              ></ha-textfield>
              <ha-textfield
                name="${configKey}.service_data"
                .value="${actionConfig.service_data
                  ? JSON.stringify(actionConfig.service_data)
                  : '{}'}"
                label="${this._getTranslation('service_data')}"
                @change="${this._serviceDataChanged}"
              ></ha-textfield>
            `
          : html``}
      </div>
    `;
  }

  //-----------------------------------------------------------------------------
  // TYPE SELECTOR & VALUE HELPERS
  //-----------------------------------------------------------------------------

  /**
   * Determines the type of value for indicator or label fields.
   * @param value The value to analyze
   * @param context 'indicator' or 'label'
   * @returns The value type as a string
   */
  getValueType(value: unknown, context: 'indicator' | 'label' = 'label'): string {
    // Shared detection for both contexts
    if (!value || value === false) return 'none';

    // Boolean true is 'dot' for indicators only
    if (value === true) {
      return context === 'indicator' ? 'dot' : 'none';
    }

    // String values - shared logic
    if (typeof value === 'string') {
      // Check if value is an MDI icon path
      if (value.startsWith('mdi:')) return 'icon';

      // Check if value is an image path
      if (value.startsWith('/') || /\.(jpg|jpeg|png|gif|svg|webp)$/i.test(value)) return 'image';

      // Context-specific logic
      if (context === 'indicator') {
        // Check for built-in indicator types
        if (['dot', 'pulse', 'glow'].includes(value)) return value;

        // Assume emoji for other strings in indicator context
        return 'emoji';
      }

      // For label context, everything else is text
      return 'text';
    }

    return 'none';
  }

  /**
   * Handles changes to value type selectors for indicators and labels.
   * @param event Change event
   * @param path Config path
   * @param currentValue Current value
   * @param context 'indicator' or 'label'
   */
  _handleValueTypeChange(
    event: Event,
    path: string,
    currentValue: unknown,
    context: 'indicator' | 'label' = 'label',
  ): void {
    // Stop event propagation
    event.stopPropagation();

    const selectedType = (event.target as HTMLSelectElement).value;
    let newValue: string | boolean | undefined;

    // Shared logic for both contexts
    if (selectedType === 'none') {
      newValue = context === 'indicator' ? false : undefined;
    } else if (selectedType === 'icon') {
      newValue =
        typeof currentValue === 'string' && currentValue.startsWith('mdi:')
          ? currentValue
          : context === 'indicator'
            ? 'mdi:star'
            : 'mdi:calendar';
    } else if (selectedType === 'image') {
      if (
        typeof currentValue === 'string' &&
        (currentValue.startsWith('/') || /\.(jpg|jpeg|png|gif|svg|webp)$/i.test(currentValue))
      ) {
        newValue = currentValue;
      } else {
        newValue = context === 'indicator' ? '/local/image.jpg' : '/local/calendar.jpg';
      }
    }
    // Context-specific logic
    else if (context === 'indicator') {
      if (['dot', 'pulse', 'glow'].includes(selectedType)) {
        newValue = selectedType;
      } else if (selectedType === 'emoji') {
        // For emoji type, preserve existing emoji if changing from an existing emoji value
        newValue =
          typeof currentValue === 'string' &&
          !currentValue.startsWith('mdi:') &&
          !/\.(jpg|jpeg|png|gif|svg|webp)$/i.test(currentValue) &&
          !/^\/local\//i.test(currentValue) &&
          !['dot', 'pulse', 'glow'].includes(currentValue)
            ? currentValue // Keep existing emoji
            : '🗓️'; // Default emoji
      }
    } else {
      // label context
      if (selectedType === 'text') {
        // For text/emoji type, preserve existing text if changing from existing text value
        if (
          typeof currentValue === 'string' &&
          this.getValueType(currentValue, 'label') === 'text'
        ) {
          newValue = currentValue;
        } else {
          newValue = '📅'; // Default text/emoji for labels
        }
      }
    }

    this.setConfigValue(path, newValue);
  }

  /**
   * Renders a dropdown selector for indicator or label type.
   * @param path Config path
   * @param label Field label
   * @param options Selector options
   * @param context 'indicator' or 'label'
   * @returns Lit template for the selector
   */
  _renderTypeSelector(
    path: string,
    label: string,
    options: Array<{ value: string; label: string }>,
    context: 'indicator' | 'label' = 'label',
  ): TemplateResult {
    const value = this.getConfigValue(path);
    const valueType = this.getValueType(value, context);

    return html`
      <div class="type-selector-field">
        <ha-select
          name="${path}_type"
          label="${label}"
          .value="${valueType}"
          @change="${(e: Event) => this._handleValueTypeChange(e, path, value, context)}"
          @closed="${(e: Event) => e.stopPropagation()}"
        >
          ${options.map(
            (opt) => html` <mwc-list-item value="${opt.value}">${opt.label}</mwc-list-item> `,
          )}
        </ha-select>

        ${this._renderTypeField(valueType, path, value, context)}
      </div>
    `;
  }

  /**
   * Renders the appropriate field for the selected value type.
   * @param valueType The value type
   * @param path Config path
   * @param value Current value
   * @param context 'indicator' or 'label'
   * @returns Lit template for the field
   */
  _renderTypeField(
    valueType: string,
    path: string,
    value: unknown,
    context: 'indicator' | 'label',
  ): TemplateResult {
    if (valueType === 'icon') {
      return html`
        <div class="icon-picker-wrapper">
          <ha-icon-picker
            .hass="${this.hass}"
            .value="${value as string}"
            @value-changed="${(event: CustomEvent<{ value: string }>) => {
              // When an icon is selected, add 'mdi:' prefix if needed
              const selectedIcon = event.detail.value;
              if (selectedIcon) {
                const prefixedIcon = selectedIcon.startsWith('mdi:')
                  ? selectedIcon
                  : `mdi:${selectedIcon}`;
                this.setConfigValue(path, prefixedIcon);
              } else {
                // Default to dot if cleared for indicator, or empty for label
                this.setConfigValue(path, context === 'indicator' ? 'dot' : '');
              }
            }}"
          ></ha-icon-picker>
        </div>
      `;
    } else if (valueType === 'emoji' || valueType === 'text') {
      const fieldLabel =
        valueType === 'emoji'
          ? this._getTranslation('emoji_value')
          : this._getTranslation('text_value');

      const helperText =
        valueType === 'emoji'
          ? this._getTranslation('emoji_indicator_note')
          : this._getTranslation('text_label_note');

      return html`
        <ha-textfield
          name="${path}"
          label="${fieldLabel}"
          .value="${value as string}"
          @change="${this._valueChanged}"
        ></ha-textfield>
        <div class="helper-text">${helperText}</div>
      `;
    } else if (valueType === 'image') {
      return html`
        <ha-textfield
          name="${path}"
          label="${this._getTranslation('image_path')}"
          .value="${value as string}"
          @change="${this._valueChanged}"
        ></ha-textfield>
        <div class="helper-text">${this._getTranslation('image_indicator_note')}</div>
      `;
    }

    return html``;
  }
}
