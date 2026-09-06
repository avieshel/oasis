export interface SessionConfig {
  readonly idleTtlMs: number;
  readonly absoluteTtlMs: number;
}

export const SESSION_COOKIE_NAME = 'sid';
export const CSRF_COOKIE_NAME = 'csrf_token';
export const CSRF_HEADER_NAME = 'x-csrf-token';

export const DEFAULT_SESSION_TTLS = {
  idleTtlMs: 30 * 60_000,
  absoluteTtlMs: 12 * 60 * 60_000,
} as const;

export const SESSION_TOKEN_BYTES = 32;
export const CSRF_TOKEN_BYTES = 32;

export function getSessionConfig(): SessionConfig {
  return {
    idleTtlMs:
      Number(process.env.SESSION_IDLE_TTL_MS) || DEFAULT_SESSION_TTLS.idleTtlMs,
    absoluteTtlMs:
      Number(process.env.SESSION_ABSOLUTE_TTL_MS) ||
      DEFAULT_SESSION_TTLS.absoluteTtlMs,
  };
}
