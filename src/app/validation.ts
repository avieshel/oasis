import { z } from 'zod';

export const MAX_PROJECT_KEY_LENGTH = 10;
export const MAX_TICKET_TITLE_LENGTH = 255;
export const MAX_TICKET_DESCRIPTION_LENGTH = 30_000;

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
