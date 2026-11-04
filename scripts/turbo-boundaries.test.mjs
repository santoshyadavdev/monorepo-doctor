import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verify } from './verify-fixture.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reference = fs.readFileSync(path.join(root, 'skills/monorepo-doctor/references/boundaries.md'), 'utf8');
const helper = reference.match(/function turboBoundaryConfigFindings\([\s\S]*?\n\}/);
assert.ok(helper, 'boundaries.md must define the static Turbo checks');
const analyze = new Function(`return (${helper[0]});`)();
const pkg = (name = '@test/web', turboConfig) => ({ name, dir: 'apps/web', turboConfig });
const check = (config = {}, packages = [pkg()], version = '2.5.0', rootFile) =>
  analyze({ config, packages, version, rootFile });

test('optional tags, absent policies and empty permissions are valid', () => {
  for (const config of [{}, { boundaries: {} }, { boundaries: { tags: {} } },
    { boundaries: { tags: { public: {} } } },
    { boundaries: { tags: { public: { dependencies: { allow: [], deny: [] } } } } }]) {
    assert.deepEqual(check(config), { findings: [] });
    assert.deepEqual(check(config, [pkg('@test/web', { tags: ['public', 'no-rule'], extends: ['//'] })]), { findings: [] });
  }
});

test('package-level boundaries.tags is invalid even when the map is empty', () => {
  for (const tags of [{}, { public: { dependencies: { deny: ['internal'] } } }]) {
    const { findings } = check({}, [pkg('@test/web', { extends: ['//'], boundaries: { tags } })]);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].id, 'boundaries/turbo-package-boundaries-tags');
    assert.equal(findings[0].severity, 'medium');
    assert.deepEqual(findings[0].location, { file: 'apps/web/turbo.json', package: '@test/web' });
    assert.ok(findings[0].evidence.includes(JSON.stringify(tags)));
  }
});

test('root rule-map keys cannot equal workspace package names', () => {
  const config = { boundaries: { tags: { '@test/web': {}, public: {} } } };
  const { findings } = check(config);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].id, 'boundaries/turbo-tag-package-name-collision');
  assert.deepEqual(findings[0].location, { file: 'turbo.json', package: '@test/web' });
  assert.ok(findings[0].evidence.includes('apps/web/package.json: name = "@test/web"'));
});

test('package names in allow/deny lists and top-level labels are valid', () => {
  const config = { boundaries: { tags: { public: {
    dependencies: { allow: ['@test/web'], deny: ['internal'] },
    dependents: { deny: ['@test/web'] },
  } } } };
  assert.deepEqual(check(config, [pkg('@test/web', { tags: ['@test/web', 'public'] })]), { findings: [] });
});

test('root rules are not mistaken for package-owned rules via extends', () => {
  const config = { boundaries: { tags: { public: { dependencies: { deny: ['internal'] } } } } };
  assert.deepEqual(check(config, [pkg('@test/web', { extends: ['//'], tags: ['public'] })]), { findings: [] });
});

test('unverified, older, prerelease and future-major versions skip static checks', () => {
  const config = { boundaries: { tags: { '@test/web': {} } } };
  for (const version of [undefined, '', '2.3.0', '2.4.0', '2.5.0-canary.1', '3.0.0', '^2.5.0', '>=2.5.0']) {
    const result = analyze({ version, config, packages: [pkg('@test/web', { boundaries: { tags: {} } })] });
    assert.deepEqual(result.findings, []);
    assert.match(result.reason, /require verified stable 2.x >= 2.5.0/);
  }
  for (const version of ['2.5.0', '2.5.1', '2.10.0']) {
    assert.equal(check(config, [pkg()], version).findings.length, 1);
  }
});

test('JSONC locations use the selected filenames and are workspace-relative', () => {
  const config = { boundaries: { tags: { '@test/web': {} } } };
  const packages = [{ ...pkg('@test/web', { boundaries: { tags: {} } }), turboFile: 'apps/web/turbo.jsonc' }];
  const { findings } = check(config, packages, '2.5.0', 'turbo.jsonc');
  assert.deepEqual(findings.map((f) => f.location.file), ['apps/web/turbo.jsonc', 'turbo.jsonc']);
});

test('rule-map lookups require own keys and exact package-name matches', () => {
  assert.deepEqual(check({ boundaries: { tags: {} } }, [pkg('toString')]), { findings: [] });
  assert.deepEqual(check({ boundaries: { tags: { '@test/we': {}, '*': {} } } }), { findings: [] });
});

test('Turbo fixture produces both expected configuration findings without flagging clean package', () => {
  const fixture = path.join(root, 'fixtures/turborepo');
  const read = (file) => JSON.parse(fs.readFileSync(path.join(fixture, file), 'utf8'));
  const declaration = read('package.json').devDependencies.turbo;
  assert.match(declaration, /^\^2\.[5-9]\.\d+$/);
  const packages = ['apps/web', 'packages/clean'].map((dir) => {
    const file = `${dir}/turbo.json`;
    return { name: read(`${dir}/package.json`).name, dir,
      ...(fs.existsSync(path.join(fixture, file)) ? { turboConfig: read(file), turboFile: file } : {}) };
  });
  const { findings, reason } = analyze({ version: declaration.slice(1), config: read('turbo.json'), packages });
  assert.equal(reason, undefined);
  assert.equal(findings.length, 2);
  const expected = JSON.parse(fs.readFileSync(path.join(root, 'fixtures/expected/turborepo.json'), 'utf8'));
  const report = {
    version: 1, workspace: {}, checks: [],
    summary: { critical: 0, high: 0, medium: 2, low: 0 },
    findings: findings.map((f) => ({ ...f, check: 'boundaries' })),
  };
  const result = verify(report, {
    ...expected, checks: [],
    mustFind: expected.mustFind.filter((f) => f.id.startsWith('boundaries/')),
    mustNotFind: (expected.mustNotFind ?? []).filter((f) => f.id.startsWith('boundaries/')),
  });
  assert.deepEqual(result, { missing: [], unexpected: [], cleanViolations: [], schemaErrors: [], checkErrors: [], ok: true });
});
