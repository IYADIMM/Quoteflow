import { readConfig } from './config.mjs';

let clientPromise;
export async function getPrisma() {
  const config = readConfig();
  if (!config.databaseUrl) throw new Error('DATABASE_URL is required for PostgreSQL persistence.');
  if (!clientPromise) clientPromise = (async () => {
    const [{ PrismaClient }, { PrismaPg }] = await Promise.all([import('../generated/prisma/client'), import('@prisma/adapter-pg')]);
    const adapter = new PrismaPg({ connectionString: config.databaseUrl, max: 5, idleTimeoutMillis: 10000, connectionTimeoutMillis: 5000 });
    return new PrismaClient({ adapter, log: config.production ? ['error'] : ['warn', 'error'] });
  })().catch(error => { clientPromise = undefined; throw error; });
  return clientPromise;
}
