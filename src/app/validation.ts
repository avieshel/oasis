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

export const MAX_TENANT_SLUG_LENGTH = 50;
export const MAX_TENANT_NAME_LENGTH = 80;
export const MAX_USER_NAME_LENGTH = 80;
export const MAX_ENTITY_ID_LENGTH = 64;

export const adminParamSchema = z.object({
  id: z.string().min(1).max(MAX_ENTITY_ID_LENGTH),
});

function isValidTenantSlug(value: string): boolean {
  if (value.length === 0) {
    return false;
  }
  let previous = '';
  for (const char of value) {
    const isAlnum = /[a-z0-9]/.test(char);
    const isHyphen = char === '-';
    if (!isAlnum && !isHyphen) {
      return false;
    }
    if (isHyphen && (previous === '-' || previous === '')) {
      return false;
    }
    previous = char;
  }
  return previous !== '-';
}

export const tenantSlugSchema = z
  .string()
  .min(1)
  .max(MAX_TENANT_SLUG_LENGTH)
  .refine(isValidTenantSlug, {
    message:
      'tenant slug must be lowercase letters/digits separated by single hyphens',
  });

export const tenantNameSchema = z.string().min(1).max(MAX_TENANT_NAME_LENGTH);

export const tenantCreateSchema = z.object({
  slug: tenantSlugSchema,
  name: tenantNameSchema,
});

export type TenantCreateInput = z.infer<typeof tenantCreateSchema>;

export const tenantUpdateSchema = z.object({
  slug: tenantSlugSchema.optional(),
  name: tenantNameSchema.optional(),
});

export type TenantUpdateInput = z.infer<typeof tenantUpdateSchema>;

export const adminUsersQuerySchema = z.object({
  tenant_id: z.string().min(1).max(MAX_ENTITY_ID_LENGTH).optional(),
});

export const userCreateSchema = z.object({
  tenant_id: z.string().min(1).max(MAX_ENTITY_ID_LENGTH),
  email: z.string().email().max(255),
  name: z.string().min(1).max(MAX_USER_NAME_LENGTH).optional(),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
});

export type UserCreateInput = z.infer<typeof userCreateSchema>;

export const userUpdateSchema = z.object({
  email: z.string().email().max(255).optional(),
  name: z.string().min(1).max(MAX_USER_NAME_LENGTH).optional(),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH)
    .max(MAX_PASSWORD_LENGTH)
    .optional(),
});

export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

export const signupSchema = z
  .object({
    email: z.string().email().max(255),
    password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
    tenant_id: z.string().min(1).max(MAX_ENTITY_ID_LENGTH).optional(),
    new_tenant: z
      .object({
        slug: tenantSlugSchema,
        name: tenantNameSchema,
      })
      .optional(),
  })
  .refine((data) => !(data.tenant_id && data.new_tenant), {
    message: 'Provide either tenant_id or new_tenant, not both',
    path: ['tenant_id'],
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
  project_key: projectKeySchema.optional(),
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

export const adminConnectionsQuerySchema = z.object({
  user_id: z.string().min(1).max(MAX_ENTITY_ID_LENGTH).optional(),
  tenant_id: z.string().min(1).max(MAX_ENTITY_ID_LENGTH).optional(),
});

export type AdminConnectionsQuery = z.infer<typeof adminConnectionsQuerySchema>;

export const adminConnectionCreateSchema = jiraConnectSchema.extend({
  user_id: z.string().min(1).max(MAX_ENTITY_ID_LENGTH),
});

export type AdminConnectionCreateInput = z.infer<
  typeof adminConnectionCreateSchema
>;

export const adminConnectionDetailQuerySchema = z.object({
  reveal_token: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export type AdminConnectionDetailQuery = z.infer<
  typeof adminConnectionDetailQuerySchema
>;

export const apiKeyCreateSchema = z.object({
  name: z.string().min(1).max(MAX_API_KEY_NAME_LENGTH),
  allowed_project_keys: z
    .array(projectKeySchema)
    .max(MAX_API_KEY_PROJECTS)
    .optional(),
});

export type ApiKeyCreateInput = z.infer<typeof apiKeyCreateSchema>;

export const ITEM_STATUSES = ['new', 'closed', 'jira-ticket'] as const;
export const ITEM_SEVERITIES = [
  'info',
  'low',
  'medium',
  'high',
  'critical',
] as const;
export const MAX_ITEM_TYPE_LENGTH = 64;
export const MAX_ITEMS_LIMIT = 50;
export const DEFAULT_ITEMS_LIMIT = 10;

export const itemsQuerySchema = z.object({
  status: z.enum(ITEM_STATUSES).optional(),
  severity: z.enum(ITEM_SEVERITIES).optional(),
  type: z.string().min(1).max(MAX_ITEM_TYPE_LENGTH).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_ITEMS_LIMIT).optional(),
});

export type ItemsQuery = z.infer<typeof itemsQuerySchema>;

export const itemParamSchema = z.object({
  id: z.string().min(1).max(MAX_ENTITY_ID_LENGTH),
});

export const itemUpdateSchema = z.object({
  status: z.enum(ITEM_STATUSES).refine((status) => status !== 'jira-ticket', {
    message: 'status must be new or closed',
  }),
});

export type ItemUpdate = z.infer<typeof itemUpdateSchema>;

export const itemTicketCreateSchema = z.object({
  project_key: projectKeySchema,
});

export type ItemTicketCreate = z.infer<typeof itemTicketCreateSchema>;
