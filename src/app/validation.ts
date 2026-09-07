import { z } from 'zod';

export const MAX_PROJECT_KEY_LENGTH = 10;
export const MAX_TICKET_TITLE_LENGTH = 255;
export const MAX_TICKET_DESCRIPTION_LENGTH = 30_000;
export const MAX_JIRA_SITE_URL_LENGTH = 255;
export const MAX_API_TOKEN_LENGTH = 1024;

export const MAX_API_KEY_NAME_LENGTH = 64;
export const MAX_API_KEY_PROJECTS = 50;

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

export const signupSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
});

export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const projectKeySchema = z
  .string()
  .min(1)
  .max(MAX_PROJECT_KEY_LENGTH)
  .regex(/^[A-Z][A-Z0-9]{1,9}$/, 'project key must match ^[A-Z][A-Z0-9]{1,9}$');

export const ticketCreateSchema = z.object({
  project_key: projectKeySchema,
  title: z.string().min(1).max(MAX_TICKET_TITLE_LENGTH),
  description: z.string().min(1).max(MAX_TICKET_DESCRIPTION_LENGTH),
});

export type TicketCreate = z.infer<typeof ticketCreateSchema>;

export const jiraRecentTicketsQuerySchema = z.object({
  project_key: projectKeySchema,
  refresh: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export type JiraRecentTicketsQuery = z.infer<
  typeof jiraRecentTicketsQuerySchema
>;

export const jiraConnectSchema = z.object({
  site_url: z.string().url().max(MAX_JIRA_SITE_URL_LENGTH),
  email: z.string().email().max(255),
  api_token: z.string().min(1).max(MAX_API_TOKEN_LENGTH),
});

export type JiraConnectInput = z.infer<typeof jiraConnectSchema>;

export const apiKeyCreateSchema = z.object({
  name: z.string().min(1).max(MAX_API_KEY_NAME_LENGTH),
  allowed_project_keys: z
    .array(projectKeySchema)
    .max(MAX_API_KEY_PROJECTS)
    .optional(),
});

export type ApiKeyCreateInput = z.infer<typeof apiKeyCreateSchema>;
