// Builds four small git repositories with seeded polyrepo history for polyrepo-tax tests.
// Usage: node fixtures/polyrepo/make-fixture.mjs <empty-dir>
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HUMAN = ['Dana Dev', 'dana@example.com'];
const BOT = ['renovate[bot]', '29139614+renovate[bot]@users.noreply.github.com'];

function repo(root, name) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  const git = (args, env = {}) => execFileSync('git', ['-C', dir, ...args], { env: { ...process.env, ...env }, stdio: 'pipe' });
  git(['init', '-q', '-b', 'main']);
  git(['config', 'commit.gpgsign', 'false']);
  return {
    dir,
    commit(date, subject, files, [an, ae] = HUMAN) {
      for (const [f, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
        fs.writeFileSync(path.join(dir, f), typeof content === 'string' ? content : JSON.stringify(content, null, 2) + '\n');
      }
      git(['add', '-A']);
      const d = `${date}T12:00:00Z`;
      git(['commit', '-q', '-m', subject], { GIT_AUTHOR_NAME: an, GIT_AUTHOR_EMAIL: ae, GIT_COMMITTER_NAME: an, GIT_COMMITTER_EMAIL: ae, GIT_AUTHOR_DATE: d, GIT_COMMITTER_DATE: d });
    },
  };
}

export function makeFixture(root) {
  const ci = (node) => `name: ci\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/setup-node@v4\n        with: { node-version: ${node} }\n`;

  const ui = repo(root, 'ui-lib');
  const uiPkg = (version) => ({ name: '@acme/ui', version, dependencies: { react: '^18.2.0' } });
  ui.commit('2025-12-01', 'initial commit', { 'package.json': uiPkg('1.0.0'), 'src/index.ts': 'export {};\n', '.github/workflows/ci.yml': ci(20) });
  ui.commit('2026-01-05', 'chore(release): 1.1.0', { 'package.json': uiPkg('1.1.0') });
  ui.commit('2026-03-01', 'feat!: rename Button variant prop', { 'src/button.ts': 'export const v = 2;\n' });
  ui.commit('2026-03-01', 'chore(release): 2.0.0', { 'package.json': uiPkg('2.0.0') });
  ui.commit('2026-04-10', 'fix: date parsing in timezone offsets', { 'src/date.ts': 'export const d = 1;\n' });
  ui.commit('2026-05-01', 'ci: bump node to 22', { '.github/workflows/ci.yml': ci(22) });
  ui.commit('2026-06-01', 'PAY-42 add currency field to Money type', { 'src/money.ts': 'export const m = 1;\n' });
  ui.commit('2026-06-03', 'chore(release): 2.1.0', { 'package.json': uiPkg('2.1.0') });

  const web = repo(root, 'web-app');
  const webPkg = (ui) => ({ name: 'web-app', private: true, dependencies: { '@acme/ui': ui, react: '^18.2.0' } });
  web.commit('2025-12-02', 'initial commit', { 'package.json': webPkg('^1.0.0'), 'src/main.ts': 'export {};\n', '.github/workflows/ci.yml': ci(20) });
  web.commit('2026-01-08', 'fix(deps): update dependency @acme/ui to v1.1.0', { 'package.json': webPkg('^1.1.0') }, BOT);
  web.commit('2026-03-04', 'chore: bump @acme/ui to 2.0.0', { 'package.json': webPkg('^2.0.0') });
  web.commit('2026-03-05', 'Revert "chore: bump @acme/ui to 2.0.0"', { 'package.json': webPkg('^1.1.0') });
  web.commit('2026-03-10', 'chore: bump @acme/ui to 2.0.0 with Button migration', { 'package.json': webPkg('^2.0.0') });
  web.commit('2026-03-12', 'fix: adapt checkout to @acme/ui Button API', { 'src/checkout.ts': 'export const c = 1;\n' });
  web.commit('2026-04-11', 'fix: date parsing in timezone offsets', { 'src/date.ts': 'export const d = 1;\n' });
  web.commit('2026-05-02', 'ci: bump node to 22', { '.github/workflows/ci.yml': ci(22) });
  web.commit('2026-06-04', 'PAY-42 show currency in checkout', { 'src/checkout.ts': 'export const c = 2;\n' });
  web.commit('2026-06-05', 'fix: pick up money rounding from ui 2.1', { 'package.json': webPkg('^2.1.0') });
  web.commit('2026-07-01', 'feat: add wishlist page', { 'src/wishlist.ts': 'export const w = 1;\n' });

  const admin = repo(root, 'admin-app');
  const adminPkg = { name: 'admin-app', private: true, dependencies: { '@acme/ui': '^1.0.0', react: '^17.0.2' } };
  admin.commit('2025-12-03', 'initial commit', { 'package.json': adminPkg, 'src/main.ts': 'export {};\n', '.github/workflows/ci.yml': ci(20) });
  admin.commit('2026-04-12', 'fix(date): date parsing in timezone offsets', { 'src/date.ts': 'export const d = 1;\n' });
  admin.commit('2026-05-03', 'ci: bump node to 22', { '.github/workflows/ci.yml': ci(22) });

  const docs = repo(root, 'docs-site');
  docs.commit('2025-12-04', 'initial commit', { 'package.json': { name: 'docs-site', private: true, dependencies: { astro: '^5.0.0' } }, 'src/index.md': '# Docs\n' });
  docs.commit('2026-02-01', 'docs: add getting started guide', { 'src/start.md': '# Start\n' });
  docs.commit('2026-06-20', 'fix: broken link in getting started guide', { 'src/start.md': '# Start!\n' });

  return { root, repos: ['ui-lib', 'web-app', 'admin-app', 'docs-site'].map((r) => path.join(root, r)) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(process.argv[2] ?? 'polyrepo-fixture');
  fs.mkdirSync(root, { recursive: true });
  const { repos } = makeFixture(root);
  console.log(repos.join('\n'));
}
