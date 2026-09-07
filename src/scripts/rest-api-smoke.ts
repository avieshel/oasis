import { readFileSync } from 'node:fs';
import pino from 'pino';
import { z } from 'zod';

const logger = pino({ level: 'info', base: undefined });

const CREDS_FILE = 'local/rest-api-credentials.json';

const credentialsSchema = z.object({
  baseUrl: z.string().url().default('http://localhost:3000'),
  rawApiKey: z.string().min(1),
  projectKey: z
    .string()
    .min(1)
    .max(10)
    .regex(/^[A-Z][A-Z0-9]{1,9}$/),
});

interface CreateTicketBody {
  key: string;
  url: string;
}

async function expectStatus(
  label: string,
  res: Response,
  expected: number,
): Promise<unknown> {
  const body = await res.text();
  if (res.status !== expected) {
    logger.error(
      { label, got: res.status, expected, body: body.slice(0, 500) },
      `${label}: expected ${expected}, got ${res.status}`,
    );
    process.exit(1);
  }
  return body.length === 0 ? null : JSON.parse(body);
}

async function main(): Promise<void> {
  let raw: string;
  try {
    raw = readFileSync(CREDS_FILE, 'utf8');
  } catch {
    logger.error(
      `Missing ${CREDS_FILE}. Copy local/rest-api-credentials.example.json and fill it ` +
        `with an API key minted in the UI (Settings → API keys) and tied to a Jira ` +
        `service account. The file is gitignored.`,
    );
    process.exit(1);
  }

  const parsed = credentialsSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    logger.error({ issues: parsed.error.issues }, 'Invalid credentials file');
    process.exit(1);
  }
  const { baseUrl, rawApiKey, projectKey } = parsed.data;

  const base = baseUrl.replace(/\/$/, '');
  const auth = { Authorization: `Bearer ${rawApiKey}` };

  await expectStatus('healthz', await fetch(`${base}/healthz`), 200);

  const doc = (await expectStatus(
    'swagger document',
    await fetch(`${base}/swagger-json`),
    200,
  )) as { paths: Record<string, unknown> };
  const paths = Object.keys(doc.paths);
  if (paths.includes('/api/api/v1/tickets')) {
    logger.error(
      { paths },
      'Swagger document contains a double /api/api prefix (stale server build — restart it)',
    );
    process.exit(1);
  }
  if (!paths.includes('/api/v1/tickets')) {
    logger.error({ paths }, 'Swagger document is missing /api/v1/tickets');
    process.exit(1);
  }

  await expectStatus(
    'invalid key rejected',
    await fetch(`${base}/api/v1/tickets/recent?project_key=${projectKey}`, {
      headers: { Authorization: 'Bearer nope-invalid' },
    }),
    401,
  );

  const title = `REST smoke test ${new Date().toISOString()}`;
  const description =
    'Created by the api:smoke script to verify the machine REST API end-to-end.';
  const created = (await expectStatus(
    'create ticket',
    await fetch(`${base}/api/v1/tickets`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_key: projectKey, title, description }),
    }),
    201,
  )) as CreateTicketBody;
  if (
    !/^[A-Z][A-Z0-9]+-\d+$/.test(created.key) ||
    !created.url.includes(created.key)
  ) {
    logger.error({ created }, 'unexpected create-ticket response shape');
    process.exit(1);
  }

  const recent = (await expectStatus(
    'recent tickets',
    await fetch(`${base}/api/v1/tickets/recent?project_key=${projectKey}`, {
      headers: auth,
    }),
    200,
  )) as Array<{ key: string }>;
  const found = recent.some((ticket) => ticket.key === created.key);
  if (!found) {
    logger.error(
      { created, recentKeys: recent.map((t) => t.key) },
      'created ticket missing from recent list',
    );
    process.exit(1);
  }

  logger.info(
    {
      base,
      projectKey,
      createdKey: created.key,
      createdUrl: created.url,
      recentCount: recent.length,
    },
    'REST API smoke OK — API key authenticates, ticket created and listed',
  );
}

void main().catch((error: unknown) => {
  logger.error(error instanceof Error ? error.message : 'Unexpected error');
  process.exit(1);
});
