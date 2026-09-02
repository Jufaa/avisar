import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';

/**
 * Source files import with the `.js` extension, which is what Node needs once
 * TypeScript emits ESM. Vite does not follow that convention on its own, so
 * this maps `./thing.js` back to `./thing.ts` while tests run.
 */
const resolveTsFromJs: Plugin = {
  name: 'resolve-ts-from-js',
  enforce: 'pre',
  resolveId(source, importer) {
    if (!importer || !source.startsWith('.') || !source.endsWith('.js')) return null;

    const candidate = resolve(dirname(importer), source.replace(/\.js$/, '.ts'));
    return existsSync(candidate) ? candidate : null;
  },
};

export default defineConfig({
  plugins: [resolveTsFromJs],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
