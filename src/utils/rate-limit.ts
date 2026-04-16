import * as logger from './logger.js';

const DEFAULT_MIN_INTERVAL_MS = 100;
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_BACKOFF_BASE_MS = 1000;

export interface RateLimiterOptions {
  minIntervalMs?: number;
  maxRetries?: number;
  backoffBaseMs?: number;
}

export class RateLimiter {
  private lastCallTime = 0;
  private readonly minIntervalMs: number;
  private readonly maxRetries: number;
  private readonly backoffBaseMs: number;

  constructor(options: RateLimiterOptions = {}) {
    this.minIntervalMs = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.backoffBaseMs = options.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;
  }

  async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastCallTime;
    if (elapsed < this.minIntervalMs) {
      const waitMs = this.minIntervalMs - elapsed;
      await sleep(waitMs);
    }
    this.lastCallTime = Date.now();
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.throttle();

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err: unknown) {
        if (isRateLimitError(err) && attempt < this.maxRetries) {
          const backoffMs = this.backoffBaseMs * Math.pow(2, attempt);
          logger.warn(`Rate limited. Retrying in ${backoffMs}ms (attempt ${attempt + 1}/${this.maxRetries})`);
          await sleep(backoffMs);
          continue;
        }
        throw err;
      }
    }

    throw new Error('Max retries exceeded');
  }
}

function isRateLimitError(err: unknown): boolean {
  if (err instanceof Error) {
    const message = err.message.toLowerCase();
    if (message.includes('rate limit') || message.includes('quota')) return true;
  }
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code: number }).code;
    if (code === 429 || code === 403) return true;
  }
  if (typeof err === 'object' && err !== null && 'status' in err) {
    const status = (err as { status: number }).status;
    if (status === 429) return true;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
