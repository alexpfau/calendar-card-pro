/**
 * Logging utilities for Calendar Card Pro
 * Provides consistent log formatting, level-based filtering, and error handling
 */

import * as Constants from '../config/constants';

let BANNER_SHOWN = false;

/** Numeric log levels ordered from least to most verbose. */
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

const currentLogLevel = Constants.LOGGING.CURRENT_LOG_LEVEL;

interface LogLevelOverrideHost {
  calendarCardProDebug?: unknown;
  calendarCardProLogLevel?: unknown;
}

function effectiveLogLevel(): LogLevel {
  const host = globalThis as unknown as LogLevelOverrideHost;

  const explicit = host.calendarCardProLogLevel;
  if (
    typeof explicit === 'number' &&
    Number.isInteger(explicit) &&
    explicit >= LogLevel.ERROR &&
    explicit <= LogLevel.DEBUG
  ) {
    return explicit;
  }

  if (host.calendarCardProDebug === true) return LogLevel.DEBUG;

  return currentLogLevel;
}

const LOG_STYLES = {
  title: [
    'background: #424242',
    'color: white',
    'display: inline-block',
    'line-height: 20px',
    'text-align: center',
    'border-radius: 20px 0 0 20px',
    'font-size: 12px',
    'font-weight: bold',
    'padding: 4px 8px 4px 12px',
    'margin: 5px 0',
  ].join(';'),

  version: [
    'background: #4fc3f7',
    'color: white',
    'display: inline-block',
    'line-height: 20px',
    'text-align: center',
    'border-radius: 0 20px 20px 0',
    'font-size: 12px',
    'font-weight: bold',
    'padding: 4px 12px 4px 8px',
    'margin: 5px 0',
  ].join(';'),

  prefix: ['color: #4fc3f7', 'font-weight: bold'].join(';'),

  error: ['color: #f44336', 'font-weight: bold'].join(';'),

  warn: ['color: #ff9800', 'font-weight: bold'].join(';'),
};

//-----------------------------------------------------------------------------
// INITIALIZATION FUNCTIONS
//-----------------------------------------------------------------------------

/**
 * Initialize the logger with the component version
 *
 * @param version Current component version
 */
export function initializeLogger(version: string): void {
  printVersionBanner(version);
}

/**
 * Print the startup banner once per page session.
 *
 * @param version Current component version
 */
export function printVersionBanner(version: string): void {
  if (BANNER_SHOWN) return;

  console.groupCollapsed(
    `%c${Constants.LOGGING.PREFIX}%cv${version} `,
    LOG_STYLES.title,
    LOG_STYLES.version,
  );
  console.log(
    '%c Description: %c A calendar card that supports multiple calendars with individual styling. ',
    'font-weight: bold',
    'font-weight: normal',
  );
  console.log(
    '%c GitHub: %c https://github.com/alexpfau/calendar-card-pro ',
    'font-weight: bold',
    'font-weight: normal',
  );
  console.groupEnd();

  BANNER_SHOWN = true;
}

//-----------------------------------------------------------------------------
// PRIMARY PUBLIC API FUNCTIONS
//-----------------------------------------------------------------------------

/**
 * Enhanced error logging that handles different error types and contexts
 *
 * @param messageOrError - Error object, message string, or other value
 * @param context - Optional context (string, object, or unknown)
 * @param data - Additional data to include in the log
 */
export function error(
  messageOrError: string | Error | unknown,
  context?: string | Record<string, unknown> | unknown,
  ...data: unknown[]
): void {
  if (effectiveLogLevel() < LogLevel.ERROR) return;

  const safeContext = formatUnknownContext(context);

  if (messageOrError instanceof Error) {
    const errorMessage = messageOrError.message || 'Unknown error';
    const contextInfo = typeof safeContext === 'string' ? ` during ${safeContext}` : '';
    const [formattedMsg, style] = formatLogMessage(
      `Error${contextInfo}: ${errorMessage}`,
      LOG_STYLES.error,
    );

    console.error(formattedMsg, style);

    if (messageOrError.stack) {
      console.error(messageOrError.stack);
    }

    if (safeContext && typeof safeContext === 'object') {
      console.error('Context:', {
        ...safeContext,
        timestamp: new Date().toISOString(),
      });
    }

    if (data.length > 0) {
      console.error('Additional data:', ...data);
    }
  } else if (typeof messageOrError === 'string') {
    const contextInfo = typeof safeContext === 'string' ? ` during ${safeContext}` : '';
    const [formattedMsg, style] = formatLogMessage(
      `${messageOrError}${contextInfo}`,
      LOG_STYLES.error,
    );

    if (safeContext && typeof safeContext === 'object') {
      console.error(formattedMsg, style, {
        context: {
          ...safeContext,
          timestamp: new Date().toISOString(),
        },
        ...(data.length > 0 ? { additionalData: data } : {}),
      });
    } else if (data.length > 0) {
      console.error(formattedMsg, style, ...data);
    } else {
      console.error(formattedMsg, style);
    }
  } else {
    const contextInfo = typeof safeContext === 'string' ? ` during ${safeContext}` : '';
    const [formattedMsg, style] = formatLogMessage(
      `Unknown error${contextInfo}:`,
      LOG_STYLES.error,
    );

    console.error(formattedMsg, style, messageOrError);

    if (safeContext && typeof safeContext === 'object') {
      console.error('Context:', {
        ...safeContext,
        timestamp: new Date().toISOString(),
      });
    }

    if (data.length > 0) {
      console.error('Additional data:', ...data);
    }
  }
}

/**
 * Log a warning message
 */
export function warn(message: string, ...data: unknown[]): void {
  simpleLog(LogLevel.WARN, message, LOG_STYLES.warn, console.warn, ...data);
}

/**
 * Log a configuration deprecation notice
 */
export function deprecation(message: string, ...data: unknown[]): void {
  const [formattedMsg, styleArg] = formatLogMessage(message, LOG_STYLES.warn);
  if (data.length > 0) {
    console.warn(formattedMsg, styleArg, ...data);
  } else {
    console.warn(formattedMsg, styleArg);
  }
}

/**
 * Log an info message
 */
export function info(message: string, ...data: unknown[]): void {
  simpleLog(LogLevel.INFO, message, LOG_STYLES.prefix, console.log, ...data);
}

/**
 * Log a debug message
 */
export function debug(message: string, ...data: unknown[]): void {
  simpleLog(LogLevel.DEBUG, message, LOG_STYLES.prefix, console.log, ...data);
}

//-----------------------------------------------------------------------------
// INTERNAL HELPER FUNCTIONS
//-----------------------------------------------------------------------------

function simpleLog(
  level: LogLevel,
  message: string,
  style: string,
  consoleMethod: (...args: unknown[]) => void,
  ...data: unknown[]
): void {
  if (effectiveLogLevel() < level) return;

  const [formattedMsg, styleArg] = formatLogMessage(message, style);
  if (data.length > 0) {
    consoleMethod(formattedMsg, styleArg, ...data);
  } else {
    consoleMethod(formattedMsg, styleArg);
  }
}

function formatLogMessage(message: string, style: string): [string, string] {
  return [`%c[${Constants.LOGGING.PREFIX}] ${message}`, style];
}

function formatUnknownContext(context: unknown): string | Record<string, unknown> | undefined {
  if (context === undefined || context === null) {
    return undefined;
  }

  if (typeof context === 'string') {
    return context;
  }

  if (typeof context === 'object') {
    try {
      return { ...(context as Record<string, unknown>) };
    } catch {
      try {
        return { value: JSON.stringify(context) };
      } catch {
        return { value: String(context) };
      }
    }
  }

  return String(context);
}
