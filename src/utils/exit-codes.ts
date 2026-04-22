export const ExitCode = {
  Success: 0,
  Generic: 1,
  Auth: 2,
  RateLimit: 3,
  Network: 4,
  Partial: 5,
  InvalidInput: 6,
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];

export function classifyError(err: unknown): ExitCodeValue {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes('not authenticated') || msg.includes('cookies may be invalid') || msg.includes('authentication failed')) {
      return ExitCode.Auth;
    }
    if (msg.includes('rate limit') || msg.includes('quota') || msg.includes('max retries exceeded')) {
      return ExitCode.RateLimit;
    }
    if (
      msg.includes('timeout') ||
      msg.includes('enotfound') ||
      msg.includes('econnrefused') ||
      msg.includes('network')
    ) {
      return ExitCode.Network;
    }
  }

  if (typeof err === 'object' && err !== null) {
    const obj = err as Record<string, unknown>;
    const status = typeof obj.statusCode === 'number' ? obj.statusCode : typeof obj.status === 'number' ? obj.status : undefined;
    if (status === 401 || status === 403) return ExitCode.Auth;
    if (status === 429) return ExitCode.RateLimit;
  }

  return ExitCode.Generic;
}
