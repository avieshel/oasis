import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/infra/crypto';

const prisma = new PrismaClient();

async function main() {
  const password = 'demo1234';
  const passwordHash = await hashPassword(password);
  const testPasswordHash = await hashPassword('password');

  const tenant1 = await prisma.tenants.upsert({
    where: { slug: 'acme' },
    update: {},
    create: { name: 'Acme Corp', slug: 'acme' },
  });

  const tenant2 = await prisma.tenants.upsert({
    where: { slug: 'globex' },
    update: {},
    create: { name: 'Globex Inc', slug: 'globex' },
  });

  await prisma.users.upsert({
    where: { email: 'alice@acme.com' },
    update: {},
    create: {
      tenant_id: tenant1.id,
      email: 'alice@acme.com',
      password_hash: passwordHash,
    },
  });

  await prisma.users.upsert({
    where: { email: 'bob@globex.com' },
    update: {},
    create: {
      tenant_id: tenant2.id,
      email: 'bob@globex.com',
      password_hash: passwordHash,
    },
  });

  const oasisTenant = await prisma.tenants.upsert({
    where: { slug: 'oasis' },
    update: {},
    create: { name: 'Oasis', slug: 'oasis' },
  });

  await prisma.users.upsert({
    where: { email: 'avi@oasis.com' },
    update: {},
    create: {
      tenant_id: oasisTenant.id,
      email: 'avi@oasis.com',
      password_hash: testPasswordHash,
    },
  });

  console.log('Demo users created:');
  console.log('  alice@acme.com / demo1234 (tenant: acme)');
  console.log('  bob@globex.com / demo1234 (tenant: globex)');
  console.log('  avi@oasis.com / password (tenant: oasis)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
