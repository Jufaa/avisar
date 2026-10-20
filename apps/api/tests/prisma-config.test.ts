import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/config/load-env.js', () => ({ loadEnvironment: vi.fn() }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('Prisma CLI connection', () => {
  it('uses the direct Neon URL for migrations', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://pooled.invalid/db');
    vi.stubEnv('DATABASE_URL_UNPOOLED', 'postgresql://direct.invalid/db');
    const { default: config } = await import('../prisma.config.ts');
    expect(config.datasource?.url).toBe('postgresql://direct.invalid/db');
  });

  it('preserves local setups with only DATABASE_URL', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost/local');
    vi.stubEnv('DATABASE_URL_UNPOOLED', undefined);
    const { default: config } = await import('../prisma.config.ts');
    expect(config.datasource?.url).toBe('postgresql://localhost/local');
  });

  it('can load for offline client generation without database credentials', async () => {
    vi.stubEnv('DATABASE_URL', undefined);
    vi.stubEnv('DATABASE_URL_UNPOOLED', undefined);
    const { default: config } = await import('../prisma.config.ts');
    expect(config.datasource).toBeUndefined();
  });
});
