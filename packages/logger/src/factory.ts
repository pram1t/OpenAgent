/**
 * Logger Factory
 *
 * Creates configured Pino loggers with support for:
 * - Pretty printing in development
 * - JSON output in production
 * - Child loggers with context
 * - Request ID correlation
 */

import pino from 'pino';
import type { LoggerConfig, LogLevel, LogContext, Logger } from './types.js';

/**
 * Map string levels to Pino numeric levels
 */
const LEVEL_MAP: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
  silent: Infinity,
};

/**
 * Determine if we're in production environment
 */
function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Get default log level based on environment
 */
function getDefaultLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL as LogLevel | undefined;
  if (envLevel && envLevel in LEVEL_MAP) {
    return envLevel;
  }
  return isProduction() ? 'info' : 'debug';
}

/**
 * Get default format based on environment
 */
function getDefaultFormat(): 'json' | 'pretty' {
  const envFormat = process.env.LOG_FORMAT;
  if (envFormat === 'json' || envFormat === 'pretty') {
    return envFormat;
  }
  return isProduction() ? 'json' : 'pretty';
}

/**
 * Create a new logger instance
 */
export function createLogger(config: LoggerConfig = {}): Logger {
  const level = config.level || getDefaultLevel();
  const format = config.format || getDefaultFormat();
  const name = config.name || 'mustard';

  const pinoOptions: pino.LoggerOptions = {
    name,
    level,
    timestamp: config.timestamp !== false ? pino.stdTimeFunctions.isoTime : false,
    base: config.context || undefined,
  };

  // Use pretty printing in non-production or when explicitly requested
  let transport: pino.TransportSingleOptions | undefined;
  if (format === 'pretty') {
    transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    };
  }

  const pinoLogger = transport
    ? pino(pinoOptions, pino.transport(transport))
    : pino(pinoOptions);

  return wrapPinoLogger(pinoLogger, level);
}

/**
 * Wrap a Pino logger to match our Logger interface
 */
function wrapPinoLogger(pinoLogger: pino.Logger, level: LogLevel): Logger {
  const logger: Logger = {
    get level() {
      return level;
    },

    child(context: LogContext): Logger {
      return wrapPinoLogger(pinoLogger.child(context), level);
    },

    trace(msgOrContext: string | LogContext, msgOrUndefined?: string | LogContext): void {
      if (typeof msgOrContext === 'string') {
        if (msgOrUndefined && typeof msgOrUndefined === 'object') {
          pinoLogger.trace(msgOrUndefined, msgOrContext);
        } else {
          pinoLogger.trace(msgOrContext);
        }
      } else {
        pinoLogger.trace(msgOrContext, msgOrUndefined as string);
      }
    },

    debug(msgOrContext: string | LogContext, msgOrUndefined?: string | LogContext): void {
      if (typeof msgOrContext === 'string') {
        if (msgOrUndefined && typeof msgOrUndefined === 'object') {
          pinoLogger.debug(msgOrUndefined, msgOrContext);
        } else {
          pinoLogger.debug(msgOrContext);
        }
      } else {
        pinoLogger.debug(msgOrContext, msgOrUndefined as string);
      }
    },

    info(msgOrContext: string | LogContext, msgOrUndefined?: string | LogContext): void {
      if (typeof msgOrContext === 'string') {
        if (msgOrUndefined && typeof msgOrUndefined === 'object') {
          pinoLogger.info(msgOrUndefined, msgOrContext);
        } else {
          pinoLogger.info(msgOrContext);
        }
      } else {
        pinoLogger.info(msgOrContext, msgOrUndefined as string);
      }
    },

    warn(msgOrContext: string | LogContext, msgOrUndefined?: string | LogContext): void {
      if (typeof msgOrContext === 'string') {
        if (msgOrUndefined && typeof msgOrUndefined === 'object') {
          pinoLogger.warn(msgOrUndefined, msgOrContext);
        } else {
          pinoLogger.warn(msgOrContext);
        }
      } else {
        pinoLogger.warn(msgOrContext, msgOrUndefined as string);
      }
    },

    error(
      msgOrContextOrError: string | LogContext | Error,
      msgOrUndefined?: string | LogContext
    ): void {
      if (msgOrContextOrError instanceof Error) {
        pinoLogger.error(
          { err: msgOrContextOrError },
          msgOrUndefined as string || msgOrContextOrError.message
        );
      } else if (typeof msgOrContextOrError === 'string') {
        if (msgOrUndefined && typeof msgOrUndefined === 'object') {
          pinoLogger.error(msgOrUndefined, msgOrContextOrError);
        } else {
          pinoLogger.error(msgOrContextOrError);
        }
      } else {
        pinoLogger.error(msgOrContextOrError, msgOrUndefined as string);
      }
    },

    fatal(
      msgOrContextOrError: string | LogContext | Error,
      msgOrUndefined?: string | LogContext
    ): void {
      if (msgOrContextOrError instanceof Error) {
        pinoLogger.fatal(
          { err: msgOrContextOrError },
          msgOrUndefined as string || msgOrContextOrError.message
        );
      } else if (typeof msgOrContextOrError === 'string') {
        if (msgOrUndefined && typeof msgOrUndefined === 'object') {
          pinoLogger.fatal(msgOrUndefined, msgOrContextOrError);
        } else {
          pinoLogger.fatal(msgOrContextOrError);
        }
      } else {
        pinoLogger.fatal(msgOrContextOrError, msgOrUndefined as string);
      }
    },
  };

  return logger;
}

/**
 * Default logger instance
 */
let defaultLogger: Logger | null = null;

/**
 * Get or create the default logger
 */
export function getLogger(): Logger {
  if (!defaultLogger) {
    defaultLogger = createLogger();
  }
  return defaultLogger;
}

/**
 * Set the default logger
 */
export function setDefaultLogger(logger: Logger): void {
  defaultLogger = logger;
}

/**
 * Reset the default logger (mainly for testing)
 */
export function resetDefaultLogger(): void {
  defaultLogger = null;
}
