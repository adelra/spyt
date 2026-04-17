import chalk from 'chalk';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

let currentLevel: LogLevel = 'info';

const levels: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return levels[level] >= levels[currentLevel];
}

export function debug(message: string, ...args: unknown[]): void {
  if (shouldLog('debug')) {
    console.log(chalk.gray(`[debug] ${message}`), ...args);
  }
}

export function info(message: string, ...args: unknown[]): void {
  if (shouldLog('info')) {
    console.log(chalk.blue('ℹ'), message, ...args);
  }
}

export function success(message: string, ...args: unknown[]): void {
  if (shouldLog('info')) {
    console.log(chalk.green('✓'), message, ...args);
  }
}

export function warn(message: string, ...args: unknown[]): void {
  if (shouldLog('warn')) {
    console.log(chalk.yellow('⚠'), message, ...args);
  }
}

export function error(message: string, ...args: unknown[]): void {
  if (shouldLog('error')) {
    console.error(chalk.red('✗'), message, ...args);
  }
}

const HTTP_STATUS: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized (token expired or invalid)',
  403: 'Forbidden (insufficient permissions)',
  404: 'Not Found',
  429: 'Rate Limited',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
};

export function formatError(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const obj = err as Record<string, unknown>;

    // HTTP-like errors with statusCode + body
    if (typeof obj.statusCode === 'number') {
      const body = obj.body as Record<string, unknown> | undefined;
      const apiError = body?.error as Record<string, unknown> | undefined;
      const apiMsg = apiError?.message ?? body?.message;
      const statusText = HTTP_STATUS[obj.statusCode] ?? `HTTP ${obj.statusCode}`;
      return apiMsg ? `${statusText}: ${apiMsg}` : statusText;
    }
  }

  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null) return JSON.stringify(err);
  return String(err);
}
