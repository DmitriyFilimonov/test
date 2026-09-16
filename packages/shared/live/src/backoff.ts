export const DEFAULT_BACKOFF_BASE_MS = 1000;
export const DEFAULT_BACKOFF_MAX_MS = 30_000;
export const DEFAULT_MAX_ATTEMPTS = 10;

export interface BackoffOptions {
  /** Потолок задержки перед первым повтором, мс. По умолчанию 1000. */
  baseMs?: number;
  /** Потолок задержки для любого повтора, мс. По умолчанию 30 с. */
  maxMs?: number;
  /** После стольких неудач подряд попытки прекращаются (status 'failed'). По умолчанию 10. */
  maxAttempts?: number;
  /** Источник случайности для джиттера, [0, 1). По умолчанию Math.random. */
  random?: () => number;
}

export type ResolvedBackoff = Required<BackoffOptions>;

export function resolveBackoff(options: BackoffOptions = {}): ResolvedBackoff {
  return {
    baseMs: options.baseMs ?? DEFAULT_BACKOFF_BASE_MS,
    maxMs: options.maxMs ?? DEFAULT_BACKOFF_MAX_MS,
    maxAttempts: options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    random: options.random ?? Math.random,
  };
}

/**
 * Задержка перед повтором номер `retry` (с 0): full jitter — случайная величина от 0 до
 * min(maxMs, baseMs · 2^retry). Без джиттера все вкладки, потерявшие соединение
 * одновременно, переподключались бы синхронно и били бы сервер волнами.
 */
export function getBackoffDelay(retry: number, { baseMs, maxMs, random }: ResolvedBackoff): number {
  const ceiling = Math.min(maxMs, baseMs * 2 ** retry);
  return Math.round(random() * ceiling);
}
