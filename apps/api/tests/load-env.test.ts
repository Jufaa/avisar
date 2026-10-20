import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadEnvironment } from '../src/config/load-env.js';

const scratch: string[] = [];

afterEach(() => {
  for (const directory of scratch.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'avisar-env-test-'));
  scratch.push(root);
  const api = join(root, 'apps/api');
  mkdirSync(api, { recursive: true });
  return { root, api };
}

describe('environment loading', () => {
  it('loads root Neon variables while preserving API-local settings', () => {
    const { root, api } = fixture();
    writeFileSync(join(root, '.env.local'), 'DATABASE_URL=neon\nDATABASE_URL_UNPOOLED=direct\n');
    writeFileSync(join(api, '.env'), 'DATABASE_URL=local\nJWT_SECRET=local-key\n');
    const environment: NodeJS.ProcessEnv = {};
    loadEnvironment(environment, api);
    expect(environment).toMatchObject({ DATABASE_URL: 'neon', DATABASE_URL_UNPOOLED: 'direct', JWT_SECRET: 'local-key' });
  });

  it('keeps hosting-injected variables ahead of files', () => {
    const { root, api } = fixture();
    writeFileSync(join(root, '.env.local'), 'DATABASE_URL=file\n');
    const environment: NodeJS.ProcessEnv = { DATABASE_URL: 'injected' };
    loadEnvironment(environment, api);
    expect(environment.DATABASE_URL).toBe('injected');
  });

  it('preserves the existing API-local setup without root env files', () => {
    const { api } = fixture();
    writeFileSync(join(api, '.env'), 'DATABASE_URL=local\nJWT_SECRET=existing\n');
    const environment: NodeJS.ProcessEnv = {};
    loadEnvironment(environment, api);
    expect(environment).toMatchObject({ DATABASE_URL: 'local', JWT_SECRET: 'existing' });
  });

  it('supports root .env and gives .env.local precedence', () => {
    const { root, api } = fixture();
    writeFileSync(join(root, '.env'), 'DATABASE_URL=root\nNEON_BRANCH=production\n');
    writeFileSync(join(root, '.env.local'), 'DATABASE_URL=root-local\n');
    const environment: NodeJS.ProcessEnv = {};
    loadEnvironment(environment, api);
    expect(environment).toMatchObject({ DATABASE_URL: 'root-local', NEON_BRANCH: 'production' });
  });
});
