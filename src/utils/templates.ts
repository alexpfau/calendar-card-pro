/* eslint-disable import/order */
/**
 * Template utilities for Calendar Card Pro
 *
 * Resolves Jinja2 templates through Home Assistant's `render_template` websocket
 * subscription. Home Assistant renders templates server-side and pushes a new
 * value whenever a referenced entity changes, so no polling is required here.
 * Templates that depend on the current time (for example `now()`) set
 * `listeners.time` and Home Assistant re-renders them on its own timer.
 *
 * This module is deliberately generic so other templated settings can adopt it
 * without duplicating the subscription, debounce and teardown logic.
 */

import * as Types from '../config/types';
import * as Logger from './logger';

//-----------------------------------------------------------------------------
// CONSTANTS
//-----------------------------------------------------------------------------

/**
 * Delay before re-subscribing after a template changes.
 *
 * The visual editor fires a config update on every keystroke, so without this
 * a user typing `{{ now() }}` would open a subscription per character, nearly
 * all of them for invalid intermediate Jinja.
 */
const RESUBSCRIBE_DEBOUNCE_MS = 300;

/** Error code Home Assistant returns when a command fails schema validation. */
const ERR_INVALID_FORMAT = 'invalid_format';

/**
 * Whether this Home Assistant instance accepts the `report_errors` option.
 *
 * `report_errors` was added to `render_template` in Home Assistant 2023.9, and
 * websocket command schemas reject unknown keys, so sending it to an older
 * instance fails the entire subscription. We optimistically send it, then
 * remember a schema rejection for the rest of the session and fall back to a
 * subscription without it (losing runtime error reporting, but still working).
 */
let reportErrorsSupported = true;

//-----------------------------------------------------------------------------
// DETECTION
//-----------------------------------------------------------------------------

/**
 * Determine whether a configuration value contains a Jinja2 template
 *
 * Matches both expression (`{{ ... }}`) and statement (`{% if %}`) delimiters.
 * A literal `{{` in an otherwise static value would be misread as a template;
 * this is documented and considered an acceptable trade-off for not adding a
 * separate configuration key.
 *
 * @param value Value to test
 * @returns True if the value should be rendered as a template
 */
export function isTemplate(value: unknown): value is string {
  return typeof value === 'string' && (value.includes('{{') || value.includes('{%'));
}

//-----------------------------------------------------------------------------
// SUBSCRIPTION
//-----------------------------------------------------------------------------

/**
 * Callbacks invoked as template results and errors arrive
 */
export interface TemplateCallbacks {
  /** Called with each rendered value pushed by Home Assistant */
  onResult: (result: string) => void;
  /** Called with Home Assistant's raw error text when rendering fails */
  onError: (error: string) => void;
}

/**
 * Normalize a rendered template result into a string
 *
 * Home Assistant renders with native type parsing, so results may arrive as
 * numbers, booleans or lists rather than strings.
 *
 * @param result Raw result from Home Assistant
 * @returns String representation, empty for null/undefined
 */
function normalizeResult(result: unknown): string {
  if (result === null || result === undefined) {
    return '';
  }
  return typeof result === 'string' ? result : String(result);
}

/**
 * Determine whether a rejection was caused by schema validation
 *
 * @param error Rejection value from `subscribeMessage`
 * @returns True if Home Assistant rejected the command's shape
 */
function isSchemaRejection(error: unknown): boolean {
  return (error as { code?: string } | undefined)?.code === ERR_INVALID_FORMAT;
}

/**
 * Subscribe to a Jinja2 template rendered by Home Assistant
 *
 * @param hass Home Assistant instance
 * @param template Template string to render
 * @param callbacks Handlers for results and errors
 * @returns Unsubscribe function, or undefined if the subscription failed
 */
export async function subscribeToTemplate(
  hass: Types.Hass | undefined,
  template: string,
  callbacks: TemplateCallbacks,
): Promise<(() => void) | undefined> {
  const connection = hass?.connection;
  if (!connection || !template) {
    return undefined;
  }

  const handleMessage = (message: Types.RenderTemplateResult | Types.RenderTemplateError) => {
    // Errors arrive on the same channel as results when report_errors is on
    if (message && 'error' in message) {
      // Warnings are routine during startup (entities not yet available)
      if (message.level === 'WARNING') {
        Logger.debug('Template warning', { template, error: message.error });
        return;
      }

      Logger.error('Template render error', { template, error: message.error });
      callbacks.onError(message.error);
      return;
    }

    if (message && 'result' in message) {
      callbacks.onResult(normalizeResult(message.result));
    }
  };

  const subscribe = (withReportErrors: boolean) =>
    connection.subscribeMessage<Types.RenderTemplateResult | Types.RenderTemplateError>(
      handleMessage,
      {
        type: 'render_template',
        template,
        ...(withReportErrors ? { report_errors: true } : {}),
      },
    );

  try {
    return await subscribe(reportErrorsSupported);
  } catch (error) {
    // An older Home Assistant rejects the unknown `report_errors` key outright.
    // Retry without it so templating still works, minus runtime error reporting.
    if (reportErrorsSupported && isSchemaRejection(error)) {
      reportErrorsSupported = false;
      Logger.warn(
        'Home Assistant rejected the render_template `report_errors` option; ' +
          'falling back to basic template rendering (requires 2023.9+ for error reporting)',
      );

      try {
        return await subscribe(false);
      } catch (fallbackError) {
        Logger.error('Failed to subscribe to template', {
          template,
          error: fallbackError,
        });
        return undefined;
      }
    }

    // A genuine template error (bad syntax) rejects at subscribe time
    const message = (error as { message?: string } | undefined)?.message;
    Logger.error('Failed to subscribe to template', { template, error });
    callbacks.onError(message ?? String(error));

    return undefined;
  }
}

//-----------------------------------------------------------------------------
// SUBSCRIPTION MANAGER
//-----------------------------------------------------------------------------

/**
 * Manages the lifecycle of a single template subscription
 *
 * Handles debouncing, teardown and out-of-order resolution so callers only need
 * to push the current template on every update and tear down on disconnect.
 */
export class TemplateSubscription {
  private _template?: string;
  private _connection?: Types.Hass['connection'];
  private _unsubscribe?: () => void;
  private _debounceId?: ReturnType<typeof setTimeout>;

  /**
   * Whether a Home Assistant connection has been seen before.
   *
   * The first update that has a connection subscribes immediately so the card
   * paints its title without an artificial delay. Everything after it is
   * debounced, which keeps a user typing `{{` in the editor from being shown a
   * syntax error before they have finished writing the template.
   */
  private _hasConnected = false;

  /** Incremented on every change so stale async resolutions can be discarded */
  private _version = 0;

  constructor(private readonly callbacks: TemplateCallbacks) {}

  /**
   * Push the current Home Assistant instance and template value
   *
   * Safe to call on every update: it compares the template text and connection
   * rather than the `hass` object, which Home Assistant replaces on every state
   * change, and does nothing when neither has changed.
   *
   * @param hass Home Assistant instance
   * @param value Candidate template value (ignored if not a template)
   */
  update(hass: Types.Hass | undefined, value: unknown): void {
    const template = isTemplate(value) ? value : undefined;
    const connection = hass?.connection;

    // The first update carrying a connection gets to subscribe without waiting
    const isFirstConnection = !this._hasConnected && Boolean(connection);
    if (connection) {
      this._hasConnected = true;
    }

    if (template === this._template && connection === this._connection) {
      return;
    }

    this._template = template;
    this._connection = connection;

    // Invalidate in-flight setups and drop the existing subscription
    this._version++;
    this._clearPending();
    this._teardown();

    if (!template || !hass) {
      return;
    }

    // Subscribe immediately on the first connection so the initial paint
    // resolves fast, then debounce so editor keystrokes do not open a
    // subscription per character
    if (isFirstConnection) {
      void this._subscribe(hass, template, this._version);
    } else {
      this._debounceId = setTimeout(() => {
        this._debounceId = undefined;
        void this._subscribe(hass, template, this._version);
      }, RESUBSCRIBE_DEBOUNCE_MS);
    }
  }

  /**
   * Tear down the subscription and cancel any pending work
   */
  destroy(): void {
    this._version++;
    this._template = undefined;
    this._connection = undefined;
    this._hasConnected = false;
    this._clearPending();
    this._teardown();
  }

  /**
   * Open the subscription, discarding the result if it has been superseded
   *
   * @param hass Home Assistant instance
   * @param template Template string to render
   * @param version Version captured before the await
   */
  private async _subscribe(hass: Types.Hass, template: string, version: number): Promise<void> {
    const unsubscribe = await subscribeToTemplate(hass, template, {
      onResult: (result) => {
        if (version === this._version) {
          this.callbacks.onResult(result);
        }
      },
      onError: (error) => {
        if (version === this._version) {
          this.callbacks.onError(error);
        }
      },
    });

    if (!unsubscribe) {
      return;
    }

    // A newer template arrived while we were subscribing
    if (version !== this._version) {
      unsubscribe();
      return;
    }

    this._unsubscribe = unsubscribe;
  }

  /**
   * Cancel a debounced subscribe that has not fired yet
   */
  private _clearPending(): void {
    if (this._debounceId) {
      clearTimeout(this._debounceId);
      this._debounceId = undefined;
    }
  }

  /**
   * Close the active subscription if there is one
   */
  private _teardown(): void {
    if (!this._unsubscribe) {
      return;
    }

    try {
      this._unsubscribe();
    } catch (error) {
      Logger.warn('Failed to unsubscribe from template', error);
    }

    this._unsubscribe = undefined;
  }
}
