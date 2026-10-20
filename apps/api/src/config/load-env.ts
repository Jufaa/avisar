import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

/** Load Neon workspace settings and preserve injected production values. */
export function loadEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
  apiDirectory = fileURLToPath(new URL('../..', import.meta.url)),
): void {
  const root = resolve(apiDirectory, '../..');
  config({
    path: [
      resolve(root, '.env.local'),
      resolve(root, '.env'),
      resolve(apiDirectory, '.env.local'),
      resolve(apiDirectory, '.env'),
    ],
    processEnv: environment as Record<string, string>,
    override: false,
  });
}
