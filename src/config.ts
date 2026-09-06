import 'dotenv/config';
import { z } from 'zod';

export const appConfigSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  APP_SECRET: z.string().min(32, 'APP_SECRET must be at least 32 characters'),
  ALLOW_OPEN_SIGNUP: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  JIRA_CACHE_TTL_MS: z.coerce.number().int().positive().default(30000),
  SESSION_IDLE_TTL_MS: z.coerce.number().int().positive().optional(),
  SESSION_ABSOLUTE_TTL_MS: z.coerce.number().int().positive().optional(),
  CORS_ORIGIN: z.string().optional(),

  RATE_LIMIT_GLOBAL_TTL_MS: z.coerce.number().int().positive().optional(),
  RATE_LIMIT_GLOBAL_LIMIT: z.coerce.number().int().positive().optional(),
  RATE_LIMIT_LOGIN_TTL_MS: z.coerce.number().int().positive().optional(),
  RATE_LIMIT_LOGIN_LIMIT: z.coerce.number().int().positive().optional(),
  RATE_LIMIT_SIGNUP_TTL_MS: z.coerce.number().int().positive().optional(),
  RATE_LIMIT_SIGNUP_LIMIT: z.coerce.number().int().positive().optional(),
  RATE_LIMIT_TICKET_CREATE_UI_TTL_MS: z.coerce
    .number()
    .int()
    .positive()
    .optional(),
  RATE_LIMIT_TICKET_CREATE_UI_LIMIT: z.coerce
    .number()
    .int()
    .positive()
    .optional(),
  RATE_LIMIT_TICKET_CREATE_API_TTL_MS: z.coerce
    .number()
    .int()
    .positive()
    .optional(),
  RATE_LIMIT_TICKET_CREATE_API_LIMIT: z.coerce
    .number()
    .int()
    .positive()
    .optional(),
  RATE_LIMIT_API_KEY_CREATE_TTL_MS: z.coerce
    .number()
    .int()
    .positive()
    .optional(),
  RATE_LIMIT_API_KEY_CREATE_LIMIT: z.coerce
    .number()
    .int()
    .positive()
    .optional(),
  RATE_LIMIT_API_KEY_USE_TTL_MS: z.coerce.number().int().positive().optional(),
  RATE_LIMIT_API_KEY_USE_LIMIT: z.coerce.number().int().positive().optional(),
  RATE_LIMIT_JIRA_CONNECT_TTL_MS: z.coerce.number().int().positive().optional(),
  RATE_LIMIT_JIRA_CONNECT_LIMIT: z.coerce.number().int().positive().optional(),
  RATE_LIMIT_JIRA_PROJECTS_TTL_MS: z.coerce
    .number()
    .int()
    .positive()
    .optional(),
  RATE_LIMIT_JIRA_PROJECTS_LIMIT: z.coerce.number().int().positive().optional(),
});

export type AppConfig = z.infer<typeof appConfigSchema>;

export function validateConfig(config: Record<string, unknown>): AppConfig {
  const parsed = appConfigSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return parsed.data;
}

export function loadConfig(): AppConfig {
  return validateConfig({
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    DATABASE_URL: process.env.DATABASE_URL,
    APP_SECRET: process.env.APP_SECRET,
    ALLOW_OPEN_SIGNUP: process.env.ALLOW_OPEN_SIGNUP,
    COOKIE_SECURE: process.env.COOKIE_SECURE,
    JIRA_CACHE_TTL_MS: process.env.JIRA_CACHE_TTL_MS,
    SESSION_IDLE_TTL_MS: process.env.SESSION_IDLE_TTL_MS,
    SESSION_ABSOLUTE_TTL_MS: process.env.SESSION_ABSOLUTE_TTL_MS,
    CORS_ORIGIN: process.env.CORS_ORIGIN,
  });
}
