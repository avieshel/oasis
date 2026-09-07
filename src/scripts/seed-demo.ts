import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../infra/crypto';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'demo1234';
const DEMO_DOMAIN = 'identityhub.demo';

function userEmail(slug: string): string {
  return `${slug}.admin@${DEMO_DOMAIN}`;
}

interface DemoUser {
  name: string;
}

interface DemoTicket {
  issueKey: string;
  projectKey: string;
  title: string;
  daysAgo: number;
}

interface DemoTenant {
  slug: string;
  name: string;
  jiraSite: string;
  projectKey: string;
  users: DemoUser[];
  tickets: DemoTicket[];
  items: Array<{
    itemType: string;
    title: string;
    description: string;
    severity: string;
    status: string;
  }>;
}

const TENANTS: DemoTenant[] = [
  {
    slug: 'acme',
    name: 'Acme Corp',
    jiraSite: 'https://acme.atlassian.net',
    projectKey: 'ACME',
    users: [{ name: 'Acme Admin' }],
    tickets: [
      {
        issueKey: 'ACME-101',
        projectKey: 'ACME',
        title: 'Exposed access key in public repo',
        daysAgo: 1,
      },
      {
        issueKey: 'ACME-102',
        projectKey: 'ACME',
        title: 'Over-privileged service account',
        daysAgo: 2,
      },
      {
        issueKey: 'ACME-103',
        projectKey: 'ACME',
        title: 'Stale API key not rotated in 90 days',
        daysAgo: 4,
      },
      {
        issueKey: 'ACME-104',
        projectKey: 'ACME',
        title: 'Publicly readable S3 bucket with PII',
        daysAgo: 7,
      },
      {
        issueKey: 'ACME-105',
        projectKey: 'ACME',
        title: 'Hard-coded credentials in CI config',
        daysAgo: 12,
      },
    ],
    items: [
      {
        itemType: 'exposed-secret',
        title: 'AWS access key committed to public repository',
        description:
          'A long-lived access key was found in a public repo, granting read access to a PII bucket.',
        severity: 'high',
        status: 'new',
      },
      {
        itemType: 'over-permissioned-role',
        title: 'Service account has administrator policy',
        description:
          'The automation service account is attached an administrator policy instead of least privilege.',
        severity: 'medium',
        status: 'new',
      },
      {
        itemType: 'stale-key',
        title: 'API key unused for 90+ days',
        description:
          'An API key minted 120 days ago has not been used in the last 90 days and should be rotated.',
        severity: 'low',
        status: 'new',
      },
      {
        itemType: 'public-storage',
        title: 'S3 bucket allows public read',
        description:
          'Bucket acme-pii-backup is configured with public read ACL exposing customer records.',
        severity: 'critical',
        status: 'new',
      },
      {
        itemType: 'hardcoded-credential',
        title: 'Hard-coded DB password in CI',
        description:
          'A database password is hard-coded in the CI pipeline definition instead of using a secret manager.',
        severity: 'high',
        status: 'closed',
      },
      {
        itemType: 'missing-mfa',
        title: 'Machine console account without MFA',
        description:
          'A shared console account used by automation does not have MFA enforced.',
        severity: 'medium',
        status: 'new',
      },
    ],
  },
  {
    slug: 'globex',
    name: 'Globex Inc',
    jiraSite: 'https://globex.atlassian.net',
    projectKey: 'GLOB',
    users: [{ name: 'Globex Admin' }],
    tickets: [
      {
        issueKey: 'GLOB-201',
        projectKey: 'GLOB',
        title: 'Unused IAM role with admin policy',
        daysAgo: 1,
      },
      {
        issueKey: 'GLOB-202',
        projectKey: 'GLOB',
        title: 'Service account token leaked in logs',
        daysAgo: 3,
      },
      {
        issueKey: 'GLOB-203',
        projectKey: 'GLOB',
        title: 'Machine identity without ownership tag',
        daysAgo: 5,
      },
      {
        issueKey: 'GLOB-204',
        projectKey: 'GLOB',
        title: 'Broad wildcard permissions on automation role',
        daysAgo: 9,
      },
      {
        issueKey: 'GLOB-205',
        projectKey: 'GLOB',
        title: 'Unrotated OAuth client secret',
        daysAgo: 14,
      },
    ],
    items: [
      {
        itemType: 'unused-role',
        title: 'IAM role unused for 60 days',
        description:
          'The role legacy-automation has not been assumed in 60 days but retains admin permissions.',
        severity: 'medium',
        status: 'new',
      },
      {
        itemType: 'leaked-token',
        title: 'Service account token in log stream',
        description:
          'A bearer token appeared in plaintext in the log stream for the ingestion service.',
        severity: 'critical',
        status: 'new',
      },
      {
        itemType: 'unowned-identity',
        title: 'Machine identity has no owner tag',
        description:
          'The service principal globex-sync has no owner or team tag, blocking accountability.',
        severity: 'low',
        status: 'new',
      },
      {
        itemType: 'wildcard-permission',
        title: 'Automation role grants wildcard actions',
        description:
          'The CI deploy role uses wildcard actions and resources, violating least privilege.',
        severity: 'high',
        status: 'new',
      },
      {
        itemType: 'stale-secret',
        title: 'OAuth client secret older than one year',
        description:
          'The OAuth client secret for the billing integration was last rotated 380 days ago.',
        severity: 'medium',
        status: 'closed',
      },
      {
        itemType: 'no-rotation-policy',
        title: 'No rotation policy for machine keys',
        description:
          'Machine identities have no documented rotation policy, creating long-lived credential risk.',
        severity: 'low',
        status: 'new',
      },
    ],
  },
];

function daysAgoToDate(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

async function seedTenant(
  tenant: DemoTenant,
  passwordHash: string,
): Promise<void> {
  const record = await prisma.tenants.upsert({
    where: { slug: tenant.slug },
    update: { name: tenant.name },
    create: { slug: tenant.slug, name: tenant.name },
  });

  for (const u of tenant.users) {
    const email = userEmail(tenant.slug);
    await prisma.users.upsert({
      where: { email },
      update: {},
      create: {
        tenant_id: record.id,
        email,
        name: u.name,
        password_hash: passwordHash,
      },
    });
    const user = await prisma.users.findUniqueOrThrow({ where: { email } });

    const now = new Date();
    for (const t of tenant.tickets) {
      await prisma.tickets_cache.upsert({
        where: {
          user_id_jira_site_project_key_issue_key: {
            user_id: user.id,
            jira_site: tenant.jiraSite,
            project_key: t.projectKey,
            issue_key: t.issueKey,
          },
        },
        update: {
          title: t.title,
          url: `${tenant.jiraSite}/browse/${t.issueKey}`,
          jira_created_at: daysAgoToDate(t.daysAgo),
          reconciled_at: now,
        },
        create: {
          tenant_id: record.id,
          user_id: user.id,
          jira_site: tenant.jiraSite,
          project_key: t.projectKey,
          issue_key: t.issueKey,
          title: t.title,
          url: `${tenant.jiraSite}/browse/${t.issueKey}`,
          jira_created_at: daysAgoToDate(t.daysAgo),
          reconciled_at: now,
        },
      });
    }
  }

  const itemCount = await prisma.oasis_items.count({
    where: { tenant_id: record.id },
  });
  if (itemCount === 0) {
    await prisma.oasis_items.createMany({
      data: tenant.items.map((item) => ({
        tenant_id: record.id,
        item_type: item.itemType,
        title: item.title,
        description: item.description,
        severity: item.severity,
        status: item.status,
      })),
    });
  }
}

async function main(): Promise<void> {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  for (const tenant of TENANTS) {
    await seedTenant(tenant, passwordHash);
  }

  const lines: string[] = [
    '',
    '========================================================',
    ' IdentityHub - demo data seeded',
    '========================================================',
    ' Tenants + users (password for all: demo1234):',
  ];
  for (const tenant of TENANTS) {
    lines.push(
      `   ${userEmail(tenant.slug).padEnd(34)} tenant: ${tenant.slug}`,
    );
  }
  lines.push(
    ` Fake Jira tickets cached per user: ${TENANTS[0].tickets.length}`,
    ' No Jira connection or API keys were created - generate those',
    ' in the UI (Settings -> API keys / Jira) to test the REST API.',
    '========================================================',
    '',
  );
  process.stdout.write(lines.join('\n'));
}

main()
  .catch((e: unknown) => {
    process.stderr.write(`${e instanceof Error ? e.stack : String(e)}\n`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
