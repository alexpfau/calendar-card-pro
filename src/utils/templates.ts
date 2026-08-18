/**
 * Template utilities for Calendar Card Pro
 * Resolves Jinja2 templates through Home Assistant's `render_template` websocket
 */

import * as Logger from './logger';
import * as Types from '../config/types';

//-----------------------------------------------------------------------------
// CONSTANTS
//-----------------------------------------------------------------------------

const RESUBSCRIBE_DEBOUNCE_MS = 300;

const ERR_INVALID_FORMAT = 'invalid_format';

let reportErrorsSupported = true;

//-----------------------------------------------------------------------------
// DETECTION
//-----------------------------------------------------------------------------

/**
 * Determine whether a configuration value contains a Jinja2 template
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

/** Callbacks invoked as Home Assistant pushes template results or errors. */
export interface TemplateCallbacks {
  onResult: (result: string) => void;
  onError: (error: string) => void;
}

function normalizeResult(result: unknown): string {
  if (result === null || result === undefined) {
    return '';
  }
  return typeof result === 'string' ? result : String(result);
}

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
    if (message && 'error' in message) {
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
 */
export class TemplateSubscription {
  private _template?: string;
  private _connection?: Types.Hass['connection'];
  private _unsubscribe?: () => void;
  private _debounceId?: ReturnType<typeof setTimeout>;

  private _hasConnected = false;

  private _version = 0;

  constructor(private readonly callbacks: TemplateCallbacks) {}

  update(hass: Types.Hass | undefined, value: unknown): void {
    const template = isTemplate(value) ? value : undefined;
    const connection = hass?.connection;

    const isFirstConnection = !this._hasConnected && Boolean(connection);
    if (connection) {
      this._hasConnected = true;
    }

    if (template === this._template && connection === this._connection) {
      return;
    }

    this._template = template;
    this._connection = connection;

    this._version++;
    this._clearPending();
    this._teardown();

    if (!template || !hass) {
      return;
    }

    if (isFirstConnection) {
      void this._subscribe(hass, template, this._version);
    } else {
      this._debounceId = setTimeout(() => {
        this._debounceId = undefined;
        void this._subscribe(hass, template, this._version);
      }, RESUBSCRIBE_DEBOUNCE_MS);
    }
  }

  destroy(): void {
    this._version++;
    this._template = undefined;
    this._connection = undefined;
    this._hasConnected = false;
    this._clearPending();
    this._teardown();
  }

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

    if (version !== this._version) {
      unsubscribe();
      return;
    }

    this._unsubscribe = unsubscribe;
  }

  private _clearPending(): void {
    if (this._debounceId) {
      clearTimeout(this._debounceId);
      this._debounceId = undefined;
    }
  }

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
