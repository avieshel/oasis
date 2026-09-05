import { z } from 'zod';

export const projectKeySchema = z
  .string()
  .min(1)
  .max(10)
  .regex(/^[A-Z][A-Z0-9]{1,9}$/, 'project key must match ^[A-Z][A-Z0-9]{1,9}$');

export const ticketCreateSchema = z.object({
  project_key: projectKeySchema,
  title: z.string().min(1).max(255),
  description: z.string().min(1).max(30_000),
});

export type TicketCreate = z.infer<typeof ticketCreateSchema>;
