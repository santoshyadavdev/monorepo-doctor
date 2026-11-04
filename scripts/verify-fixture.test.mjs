import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { verify } from './verify-fixture.mjs';

const finding = (id, severity, pkg) => ({
  id, check: id.split('/')[0], severity, title: 't', evidence: 'e', fix: 'f',
  location: pkg ? { file: 'x', package: pkg } : { file: 'x' },
});
const report = (findings) => {
  const summary = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) summary[f.severity]++;
  return { version: 1, workspace: {}, summary, checks: [], findings };
};
const expected = {
  fixture: 'demo',
  cleanPackages: ['@x/clean'],
  mustFind: [{ id: 'circular-deps/package-cycle' }, { id: 'boundaries/deep-import', package: '@x/app' }],
};

test('passes when every expected finding is present', () => {
  const r = verify(report([finding('circular-deps/package-cycle', 'high'), finding('boundaries/deep-import', 'medium', '@x/app')]), expected);
  assert.equal(r.ok, true);
});

test('reports missing ids', () => {
  const r = verify(report([finding('circular-deps/package-cycle', 'high')]), expected);
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing.map((m) => m.id), ['boundaries/deep-import']);
});

test('package must match when expected specifies one', () => {
  const r = verify(report([finding('circular-deps/package-cycle', 'high'), finding('boundaries/deep-import', 'medium', '@x/other')]), expected);
  assert.deepEqual(r.missing.map((m) => m.id), ['boundaries/deep-import']);
});

test('file selector distinguishes shared defaults from package target findings', () => {
  const f = { ...finding('caching/nx-cache-disabled', 'low'), location: { file: 'nx.json' } };
  const exp = { cleanPackages: [], mustFind: [{ id: f.id, file: 'libs/api/package.json' }] };
  assert.deepEqual(verify(report([f]), exp).missing, exp.mustFind);
  assert.equal(verify(report([f]), { ...exp, mustFind: [{ id: f.id, file: 'nx.json' }] }).ok, true);
});

test('mustNotFind rejects low-severity false positives with matching package and file', () => {
  const f = { ...finding('caching/nx-cache-disabled', 'low', '@x/clean'), location: { file: 'libs/clean/project.json', package: '@x/clean' } };
  const exp = { cleanPackages: ['@x/clean'], mustFind: [], mustNotFind: [{ id: f.id, package: '@x/clean', file: f.location.file }] };
  const result = verify(report([f]), exp);
  assert.equal(result.ok, false);
  assert.deepEqual(result.unexpected, [f]);
  assert.deepEqual(result.cleanViolations, []);
  assert.equal(verify(report([f]), { ...exp, mustNotFind: [{ id: f.id, package: '@x/other' }] }).ok, true);
  assert.equal(verify(report([f]), { ...exp, mustNotFind: [{ id: f.id, file: 'nx.json' }] }).ok, true);
  assert.equal(verify(report([f]), { ...exp, mustNotFind: [{ id: 'caching/undeclared-env' }] }).ok, true);
  assert.equal(verify(report([]), exp).ok, true);
});

test('evidence selectors require every literal substring in string evidence', () => {
  const f = { ...finding('caching/nx-cache-disabled', 'low'), evidence: 'source[.*] @x/app:lint' };
  const exp = { cleanPackages: [], mustFind: [{ id: f.id, evidenceIncludes: ['source[.*]', '@x/app:lint'] }] };
  assert.equal(verify(report([f]), exp).ok, true);
  for (const evidence of ['source[.*]', '@x/app:lint', 'sourceX @x/app:lint', null, {}]) {
    assert.deepEqual(verify(report([{ ...f, evidence }]), exp).missing, exp.mustFind);
  }
});

test('Nx fixture contract requires each shared default and its affected project/target pairs', () => {
  const exp = JSON.parse(fs.readFileSync(new URL('../fixtures/expected/nx.json', import.meta.url), 'utf8'));
  const shared = [
    { ...finding('caching/nx-cache-disabled', 'low'), location: { file: 'nx.json' }, evidence: 'targetDefaults.typecheck: { "cache": false }; affected: @nxf/api:typecheck' },
    { ...finding('caching/nx-cache-disabled', 'low'), location: { file: 'nx.json' }, evidence: 'targetDefaults["nx:run-commands"]: { "cache": false }; affected: @nxf/api:lint' },
  ];
  const findings = [...shared, ...exp.mustFind.filter((e) => !e.evidenceIncludes).map((e) => ({
    ...finding(e.id, e.id === 'caching/nx-cache-disabled' ? 'low' : 'high', e.package),
    location: { file: e.file ?? 'nx.json', ...(e.package ? { package: e.package } : {}) },
  }))];
  assert.equal(verify(report(findings), exp).ok, true);
  for (const f of shared) {
    const result = verify(report(findings.filter((entry) => entry !== f)), exp);
    assert.equal(result.ok, false);
    assert.equal(result.missing.length, 1);
    assert.equal(result.missing[0].file, 'nx.json');
    const withoutPair = findings.map((entry) => entry === f
      ? { ...entry, evidence: entry.evidence.replace(/@nxf\/api:\S+/, '@nxf/other:lint') }
      : entry);
    assert.equal(verify(report(withoutPair), exp).ok, false);
    const falsePositive = { ...f, evidence: `${f.evidence}, @nxf/clean:lint` };
    assert.deepEqual(verify(report([...findings, falsePositive]), exp).unexpected, [falsePositive]);
  }
  for (const file of ['nx.json', 'libs/api/package.json', 'libs/api/project.json']) {
    const withoutSource = findings.filter((f) => f.id !== 'caching/nx-cache-disabled' || f.location.file !== file);
    assert.equal(verify(report(withoutSource), exp).ok, false);
  }
  const falsePositive = finding('caching/nx-cache-disabled', 'low', '@nxf/clean');
  assert.deepEqual(verify(report([...findings, falsePositive]), exp).unexpected, [falsePositive]);
});

test('file must match when expected distinguishes invocations of the same rule', () => {
  const id = 'ci-coverage/turbo-invalid-comparison-base';
  const f = finding(id, 'high');
  f.location.file = '.github/workflows/invalid-affected-base.yml';
  const exp = {
    cleanPackages: [],
    mustFind: [
      { id, file: f.location.file },
      { id, file: '.github/workflows/invalid-filter-base.yml' },
    ],
  };
  assert.deepEqual(verify(report([f]), exp).missing, [exp.mustFind[1]]);
});

test('mustNotFind rejects false positives only in the specified file and package', () => {
  const id = 'ci-coverage/turbo-invalid-comparison-base';
  const f = finding(id, 'high', '@x/app');
  const exp = { cleanPackages: [], mustFind: [], mustNotFind: [{ id, file: 'x', package: '@x/app' }] };
  const r = verify(report([f]), exp);
  assert.equal(r.ok, false);
  assert.deepEqual(r.unexpected, [f]);
  assert.equal(verify(report([f]), { ...exp, mustNotFind: [{ id, file: 'other' }] }).ok, true);
  assert.equal(verify(report([f]), { ...exp, mustNotFind: [{ id, package: '@x/other' }] }).ok, true);
  assert.equal(verify(report([f]), { ...exp, mustNotFind: [{ id }] }).ok, false);
  assert.equal(verify(report([]), exp).ok, true);
});

test('Turbo fixture contract requires both broken invocations and rejects safe/unknown base findings', () => {
  const exp = JSON.parse(fs.readFileSync(new URL('../fixtures/expected/turborepo.json', import.meta.url), 'utf8'));
  const positives = exp.mustFind.map((e) => {
    const f = finding(e.id, 'high', e.package);
    if (e.file) f.location.file = e.file;
    return f;
  });
  assert.equal(verify(report(positives), exp).ok, true);
  const id = 'ci-coverage/turbo-invalid-comparison-base';
  for (const e of exp.mustFind.filter((e) => e.id === id)) {
    const incomplete = positives.filter((f) => f.location.file !== e.file);
    assert.deepEqual(verify(report(incomplete), exp).missing, [e]);
  }
  for (const e of exp.mustNotFind) {
    const falsePositive = { ...finding(e.id, 'high'), location: { file: e.file } };
    const r = verify(report([...positives, falsePositive]), exp);
    assert.equal(r.ok, false);
    assert.deepEqual(r.unexpected, [falsePositive]);
  }
});

test('medium+ findings on clean packages fail; low is allowed', () => {
  const base = [finding('circular-deps/package-cycle', 'high'), finding('boundaries/deep-import', 'medium', '@x/app')];
  assert.equal(verify(report([...base, finding('boundaries/oversized-package', 'low', '@x/clean')]), expected).ok, true);
  const r = verify(report([...base, finding('caching/undeclared-env', 'medium', '@x/clean')]), expected);
  assert.equal(r.cleanViolations.length, 1);
  assert.equal(r.ok, false);
});

test('schema errors: missing keys, bad severity, summary mismatch', () => {
  const bad = report([{ id: 'a/b', severity: 'urgent' }]);
  bad.summary.high = 5;
  delete bad.checks;
  const r = verify(bad, { ...expected, mustFind: [] });
  assert.ok(r.schemaErrors.some((e) => e.includes('"checks"')));
  assert.ok(r.schemaErrors.some((e) => e.includes('invalid severity')));
  assert.ok(r.schemaErrors.some((e) => e.includes('missing "fix"')));
  assert.ok(r.schemaErrors.some((e) => e.includes('summary')));
});

test('inherited property names are not valid severities', () => {
  const f = finding('circular-deps/package-cycle', 'toString');
  const r = verify({ version: 1, workspace: {}, summary: { critical: 0, high: 0, medium: 0, low: 0 }, checks: [], findings: [f] }, { cleanPackages: [], mustFind: [] });
  assert.ok(r.schemaErrors.some((e) => e.includes('invalid severity "toString"')));
});
