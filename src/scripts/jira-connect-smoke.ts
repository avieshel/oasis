import { readFileSync } from 'node:fs';
import pino from 'pino';
import { z } from 'zod';
import { loadConfig } from '../config';
import { PrismaService } from '../infra/db';
import { openSecret, sealSecret } from '../infra/crypto';
import { JiraClient } from '../modules/jira/jira.client';
import { JiraRepository } from '../modules/jira/jira.repository';

const logger = pino({ level: 'info', base: undefined });

const credentialsSchema = z.object({
  siteUrl: z.string().url(),
  email: z.string().email(),
  apiToken: z.string().min(1),
  userEmail: z.string().email().optional(),
});

const CREDS_FILE = 'local/jira-credentials.json';

async function main(): Promise<void> {
  let raw: string;
  try {
    raw = readFileSync(CREDS_FILE, 'utf8');
  } catch {
    logger.error(
      `Missing ${CREDS_FILE}. Copy local/jira-credentials.example.json and fill it in (the file is gitignored). ` +
        `Note: this file is only read by the jira:smoke script — the running app never reads it.`,
    );
    process.exit(1);
  }

  const parsed = credentialsSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    logger.error(
      { issues: parsed.error.issues },
      'Invalid Jira credentials file',
    );
    process.exit(1);
  }
  const { siteUrl, email, apiToken, userEmail } = parsed.data;

  const config = loadConfig();
  const prisma = new PrismaService();
  await prisma.$connect();

  try {
    const user = await prisma.users.findUnique({
      where: { email: userEmail ?? 'avi@oasis.com' },
    });
    if (!user) {
      logger.error('Demo user not found. Run `npm run db:seed` first.');
      process.exit(1);
    }

    const client = new JiraClient({ siteUrl, email, apiToken });
    const myself = await client.getMyself();
    const serverInfo = await client.serverInfo();
    const projects = await client.listProjects();

    const siteOrigin = new URL(siteUrl).origin;
    const sealed = sealSecret(apiToken, config.APP_SECRET);
    const repository = new JiraRepository(prisma);
    await repository.upsertApiTokenConnection(user.tenant_id, user.id, {
      siteUrl: siteOrigin,
      email,
      apiTokenCipher: sealed.cipher,
      apiTokenNonce: sealed.nonce,
      cloudId: serverInfo.cloudId || null,
    });

    const stored = await repository.findByUser(user.tenant_id, user.id);
    const roundTripOk =
      stored?.api_token_cipher != null &&
      stored.api_token_nonce != null &&
      openSecret(
        stored.api_token_cipher,
        stored.api_token_nonce,
        config.APP_SECRET,
      ) === apiToken;

    logger.info(
      {
        site: new URL(siteOrigin).host,
        accountId: myself.accountId,
        displayName: myself.displayName,
        projects: projects.map((p) => p.key),
        projectCount: projects.length,
        mode: 'api_token',
        cloudId: serverInfo.cloudId || null,
        storedInDb: roundTripOk,
      },
      roundTripOk
        ? 'Jira test connection OK'
        : 'Jira test connection OK, but DB round-trip FAILED',
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  logger.error(
    error instanceof Error && error.message
      ? error.message
      : 'Unexpected error',
  );
  process.exit(1);
});
