import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const { compilerOptions } = JSON.parse(readFileSync(new URL('./tsconfig.base.json', import.meta.url), 'utf8'));
const alias = Object.fromEntries(
  Object.entries(compilerOptions.paths as Record<string, string[]>).map(([name, [target]]) => [
    name,
    fileURLToPath(new URL(target, import.meta.url)),
  ]),
);

export default defineConfig({ resolve: { alias }, test: { environment: 'node' } });
