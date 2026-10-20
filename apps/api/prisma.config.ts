import { defineConfig } from 'prisma/config';
import { loadEnvironment } from './src/config/load-env.ts';

loadEnvironment();

const databaseUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  ...(databaseUrl
    ? { engine: 'classic' as const, datasource: { url: databaseUrl } }
    : {}),
});
