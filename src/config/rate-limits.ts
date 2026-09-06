export interface RateLimitConfig {
  readonly ttlMs: number;
  readonly limit: number;
}

export interface RateLimitsConfig {
  readonly global: RateLimitConfig;
  readonly login: RateLimitConfig;
  readonly signup: RateLimitConfig;
  readonly ticketCreateUi: RateLimitConfig;
  readonly ticketCreateApi: RateLimitConfig;
  readonly apiKeyCreate: RateLimitConfig;
  readonly apiKeyUse: RateLimitConfig;
  readonly jiraConnect: RateLimitConfig;
  readonly jiraProjects: RateLimitConfig;
}

export const DEFAULT_RATE_LIMITS: RateLimitsConfig = {
  global: { ttlMs: 60_000, limit: 100 },
  login: { ttlMs: 60_000, limit: 5 },
  signup: { ttlMs: 60_000, limit: 10 },
  ticketCreateUi: { ttlMs: 60_000, limit: 30 },
  ticketCreateApi: { ttlMs: 60_000, limit: 60 },
  apiKeyCreate: { ttlMs: 60_000, limit: 10 },
  apiKeyUse: { ttlMs: 60_000, limit: 60 },
  jiraConnect: { ttlMs: 60_000, limit: 10 },
  jiraProjects: { ttlMs: 60_000, limit: 30 },
} as const;

export function getRateLimitConfig(): RateLimitsConfig {
  return {
    global: {
      ttlMs:
        Number(process.env.RATE_LIMIT_GLOBAL_TTL_MS) ||
        DEFAULT_RATE_LIMITS.global.ttlMs,
      limit:
        Number(process.env.RATE_LIMIT_GLOBAL_LIMIT) ||
        DEFAULT_RATE_LIMITS.global.limit,
    },
    login: {
      ttlMs:
        Number(process.env.RATE_LIMIT_LOGIN_TTL_MS) ||
        DEFAULT_RATE_LIMITS.login.ttlMs,
      limit:
        Number(process.env.RATE_LIMIT_LOGIN_LIMIT) ||
        DEFAULT_RATE_LIMITS.login.limit,
    },
    signup: {
      ttlMs:
        Number(process.env.RATE_LIMIT_SIGNUP_TTL_MS) ||
        DEFAULT_RATE_LIMITS.signup.ttlMs,
      limit:
        Number(process.env.RATE_LIMIT_SIGNUP_LIMIT) ||
        DEFAULT_RATE_LIMITS.signup.limit,
    },
    ticketCreateUi: {
      ttlMs:
        Number(process.env.RATE_LIMIT_TICKET_CREATE_UI_TTL_MS) ||
        DEFAULT_RATE_LIMITS.ticketCreateUi.ttlMs,
      limit:
        Number(process.env.RATE_LIMIT_TICKET_CREATE_UI_LIMIT) ||
        DEFAULT_RATE_LIMITS.ticketCreateUi.limit,
    },
    ticketCreateApi: {
      ttlMs:
        Number(process.env.RATE_LIMIT_TICKET_CREATE_API_TTL_MS) ||
        DEFAULT_RATE_LIMITS.ticketCreateApi.ttlMs,
      limit:
        Number(process.env.RATE_LIMIT_TICKET_CREATE_API_LIMIT) ||
        DEFAULT_RATE_LIMITS.ticketCreateApi.limit,
    },
    apiKeyCreate: {
      ttlMs:
        Number(process.env.RATE_LIMIT_API_KEY_CREATE_TTL_MS) ||
        DEFAULT_RATE_LIMITS.apiKeyCreate.ttlMs,
      limit:
        Number(process.env.RATE_LIMIT_API_KEY_CREATE_LIMIT) ||
        DEFAULT_RATE_LIMITS.apiKeyCreate.limit,
    },
    apiKeyUse: {
      ttlMs:
        Number(process.env.RATE_LIMIT_API_KEY_USE_TTL_MS) ||
        DEFAULT_RATE_LIMITS.apiKeyUse.ttlMs,
      limit:
        Number(process.env.RATE_LIMIT_API_KEY_USE_LIMIT) ||
        DEFAULT_RATE_LIMITS.apiKeyUse.limit,
    },
    jiraConnect: {
      ttlMs:
        Number(process.env.RATE_LIMIT_JIRA_CONNECT_TTL_MS) ||
        DEFAULT_RATE_LIMITS.jiraConnect.ttlMs,
      limit:
        Number(process.env.RATE_LIMIT_JIRA_CONNECT_LIMIT) ||
        DEFAULT_RATE_LIMITS.jiraConnect.limit,
    },
    jiraProjects: {
      ttlMs:
        Number(process.env.RATE_LIMIT_JIRA_PROJECTS_TTL_MS) ||
        DEFAULT_RATE_LIMITS.jiraProjects.ttlMs,
      limit:
        Number(process.env.RATE_LIMIT_JIRA_PROJECTS_LIMIT) ||
        DEFAULT_RATE_LIMITS.jiraProjects.limit,
    },
  };
}
