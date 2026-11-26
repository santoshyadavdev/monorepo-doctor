import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyze, renderMarkdown, isFixSubject, normalizeSubject, similarity, ticketsOf, minVersion } from '../skills/polyrepo-tax/scripts/analyze.mjs';
import { renderHtml, markdownToHtml } from '../skills/polyrepo-tax/scripts/render-html.mjs';
import { monthRanges, completeRanges, fetchRepo } from '../skills/polyrepo-tax/scripts/fetch-ci.mjs';
import { makeFixture } from '../fixtures/polyrepo/make-fixture.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'polyrepo-tax-'));
const { repos } = makeFixture(root);
const config = { repos, since: '2025-11-01', now: '2026-11-01T00:00:00Z' };
const report = analyze(config);
const byCat = (cat) => report.bugs.filter((b) => b.category === cat);

test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test('subject helpers', () => {
  assert.equal(isFixSubject('fix(deps): update dependency @acme/ui to v1.1.0'), false);
  assert.equal(isFixSubject('chore(deps): bump lodash from 4.17.20 to 4.17.21'), false);
  assert.equal(isFixSubject('fix(date): parse offsets'), true);
  assert.equal(isFixSubject('Hotfix broken login'), true);
  assert.equal(isFixSubject('feat: add prefix option'), false);
  assert.equal(isFixSubject('chore: fix lint issue'), false, 'another conventional type wins over the word fix');
  assert.equal(isFixSubject('docs: fix broken section anchors'), false);
  assert.equal(isFixSubject('Fix typos in README'), false);
  assert.equal(normalizeSubject('fix(date): Date parsing in timezone offsets (#123)'), 'date parsing in timezone offsets');
  assert.equal(similarity('a b', 'a b'), 0, 'subjects under 3 tokens never match');
  assert.deepEqual(ticketsOf('PAY-42 and UTF-8, see acme/ui#7'), ['PAY-42', 'acme/ui#7']);
  assert.deepEqual(minVersion('workspace:^2.1.0'), [2, 1, 0]);
  assert.deepEqual(minVersion('1.x'), [1, 0, 0]);
});

test('detects internal packages, bumps, releases and lag', () => {
  assert.deepEqual(report.internal.packages, [{ pkg: '@acme/ui', repo: 'ui-lib', consumers: ['web-app', 'admin-app'] }]);
  const ups = report.internal.bumps.filter((b) => b.direction === 'up');
  assert.equal(ups.length, 4);
  assert.equal(ups.filter((b) => b.bot).length, 1);
  assert.equal(report.internal.bumps.filter((b) => b.direction === 'down').length, 1);
  assert.equal(report.internal.releases.length, 3);
  assert.equal(report.internal.medianBumpLagDays, 3);
  assert.deepEqual(report.internal.skew, [{ pkg: '@acme/ui', majors: { 1: ['admin-app'], 2: ['web-app'] } }]);
});

test('classifies polyrepo-attributable bugs with confidence', () => {
  assert.equal(byCat('dependency-regression').length, 1);
  assert.equal(byCat('dependency-regression')[0].confidence, 'high');
  const dup = byCat('duplicated-fix');
  assert.equal(dup.length, 1);
  assert.deepEqual(dup[0].repos.sort(), ['admin-app', 'ui-lib', 'web-app']);
  assert.equal(byCat('post-bump-fix').length, 1);
  assert.equal(byCat('post-bump-fix')[0].confidence, 'medium');
  assert.equal(byCat('fix-propagation').length, 1);
  assert.equal(byCat('cross-repo-fix').length, 0);
  assert.ok(!report.bugs.some((b) => b.repos.includes('docs-site')), 'unrelated fix in an isolated repo is not a polyrepo bug');
});

test('groups coordinated and repeated tooling changes', () => {
  assert.equal(report.coordinated.length, 1);
  assert.equal(report.coordinated[0].ticket, 'PAY-42');
  assert.equal(report.duplicatedTooling.length, 1);
  assert.equal(report.duplicatedTooling[0].copies, 3);
});

test('costs every driver once, with scenarios ordered low <= expected <= high', () => {
  const e = report.cost.expected;
  const line = (k) => e.lines.find((l) => l.key === k);
  // 3 costed bumps (fix-propagation bump is costed as the bug): 2 human × 0.5 + 1 bot × 0.2
  assert.equal(line('bumps').count, 3);
  assert.equal(line('bumps').hours, 1.2);
  assert.equal(line('duplicated-fix').hours, 8 + 2 * 1);
  assert.equal(line('post-bump-fix').ciMinutes, 15, 'the bump shown as evidence is not charged twice');
  assert.equal(e.totals.cost, Math.round(e.totals.hours * 100 + e.totals.ciMinutes * 0.008));
  assert.ok(report.cost.low.totals.cost <= e.totals.cost && e.totals.cost <= report.cost.high.totals.cost);
});

test('migration facts: one cluster, isolated docs repo, react conflict', () => {
  assert.deepEqual(report.migration.clusters[0].repos, ['admin-app', 'ui-lib', 'web-app']);
  assert.deepEqual(report.migration.isolated, ['docs-site']);
  assert.deepEqual(report.migration.externalConflicts.map((c) => c.dep), ['react']);
  assert.equal(report.migration.recommendedTool, 'pnpm workspaces + Nx or Turborepo');
  assert.equal(report.migration.oneTime.repos.length, 3);
  assert.ok(report.migration.paybackMonths.expected > 0);
});

test('measured CI data and rate overrides change the money, overrides exclude commits', () => {
  const r2 = analyze({ ...config, rates: { developerHourly: 150, ciPerMinute: 0.016 }, ci: { 'web-app': { totalMinutes: 1100 } } });
  assert.equal(r2.repos.find((r) => r.name === 'web-app').ci.source, 'measured');
  assert.equal(r2.repos.find((r) => r.name === 'web-app').ci.minutesPerCommit, 100);
  assert.ok(r2.cost.expected.totals.cost > report.cost.expected.totals.cost);
  const revert = byCat('dependency-regression')[0].commits[0];
  const sha = execFileSync('git', ['-C', path.join(root, revert.repo), 'rev-parse', revert.sha], { encoding: 'utf8' }).trim();
  const r3 = analyze({ ...config, overrides: { excludeCommits: [sha] } });
  assert.equal(r3.bugs.filter((b) => b.category === 'dependency-regression').length, 0);
});

test('public packages keep their releases in a monorepo, so releases are not costed', () => {
  const r = analyze({ ...config, publicPackages: ['@acme/ui'] });
  assert.equal(r.internal.releases.length, 0);
  assert.equal(r.cost.expected.lines.find((l) => l.key === 'releases').cost, 0);
  assert.equal(r.internal.bumps.length, report.internal.bumps.length, 'bumps still count: workspace:* removes them');
});

test('repeated tooling changes are a cost but not coupling', () => {
  const pair = report.migration.coupling.find((e) => e.repos.join() === 'admin-app,web-app');
  assert.equal(pair.sharedTooling, 1);
  assert.equal(pair.weight, 3, 'only the shared duplicated-fix bug weighs');
});

test('reports missing repos as data problems instead of failing', () => {
  const r = analyze({ ...config, repos: [...repos, path.join(root, 'nope')] });
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /nope: not a git repository/);
});

test('markdown report carries the range, bugs, assumptions and migration inputs', () => {
  const md = renderMarkdown(report);
  for (const s of ['# Polyrepo Tax Report', '**Annualized:**', 'dependency-regression', '## Migration plan inputs', 'docs-site', '## Assumptions', '`react`']) {
    assert.ok(md.includes(s), `missing ${s}`);
  }
});

test('monthRanges splits the window per calendar month', () => {
  assert.deepEqual(monthRanges('2026-01-15', '2026-03-10'), ['2026-01-15..2026-01-31', '2026-02-01..2026-02-28', '2026-03-01..2026-03-09']);
});

test('html report is self-contained, escaped and embeds the plan', () => {
  const html = renderHtml(report, { plan: '## Migration plan\n\n1. **Phase 0** align `react`\n' });
  assert.match(html, /^<!doctype html>/);
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=|https?:\/\/(?!github\.com)/, 'no external resources');
  for (const s of ['Polyrepo tax per year, expected', 'dependency-regression', 'data-filter="high"', 'docs-site', '<strong>Phase 0</strong>', 'prefers-color-scheme: dark']) {
    assert.ok(html.includes(s), `missing ${s}`);
  }
  assert.equal((html.match(/>Migration plan</g) ?? []).length, 1, 'plan heading is not duplicated');
  const hostile = structuredClone(report);
  hostile.bugs[0].title = '<img src=x onerror=alert(1)>';
  assert.ok(!renderHtml(hostile).includes('<img src=x'), 'commit text is escaped');
});

test('markdownToHtml escapes HTML and renders tables and code', () => {
  const out = markdownToHtml('<b>x</b>\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```\n<tag>\n```');
  assert.ok(out.includes('&lt;b&gt;x&lt;/b&gt;'));
  assert.ok(out.includes('<td>1</td><td>2</td>'));
  assert.ok(out.includes('<pre><code>&lt;tag&gt;</code></pre>'));
});

// ---------- regression tests for review findings ----------

function miniRepo(dir, commits) {
  fs.mkdirSync(dir, { recursive: true });
  const g = (args, env = {}) => execFileSync('git', ['-C', dir, ...args], { env: { ...process.env, ...env }, stdio: 'pipe' });
  g(['init', '-q', '-b', 'main']);
  for (const [date, subject, files] of commits) {
    for (const [f, c] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
      fs.writeFileSync(path.join(dir, f), typeof c === 'string' ? c : JSON.stringify(c, null, 2) + '\n');
    }
    g(['add', '-A']);
    const d = `${date}T12:00:00Z`;
    g(['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', subject], { GIT_AUTHOR_NAME: 'A', GIT_AUTHOR_EMAIL: 'a@example.com', GIT_COMMITTER_NAME: 'A', GIT_COMMITTER_EMAIL: 'a@example.com', GIT_AUTHOR_DATE: d, GIT_COMMITTER_DATE: d });
  }
  return dir;
}
const ci = (n) => `on: [push]\njobs: { t: { runs-on: ubuntu-latest, steps: [{ uses: actions/setup-node@v4, with: { node-version: ${n} } }] } }\n`;
const mini = (() => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'polyrepo-tax-mini-'));
  const pkg = (n, v) => ({ name: n, version: v });
  const P = miniRepo(path.join(base, 'producer'), [
    ['2026-01-02', 'initial commit', { 'packages/a/package.json': pkg('@x/a', '1.0.0'), 'packages/b/package.json': pkg('@x/b', '1.0.0'), '.github/workflows/ci.yml': ci(22) }],
    ['2026-02-01', 'chore(release): publish', { 'packages/a/package.json': pkg('@x/a', '1.1.0'), 'packages/b/package.json': pkg('@x/b', '1.1.0') }],
    ['2026-03-01', 'TIX-1 add field to the orders API', { 'src/api.ts': 'export const f = 1;\n' }],
    ['2026-04-01', 'ci: bump node to 24', { '.github/workflows/ci.yml': ci(24) }],
  ]);
  const C = miniRepo(path.join(base, 'consumer'), [
    ['2026-01-03', 'initial commit', { 'package.json': { name: 'consumer', private: true, dependencies: { '@x/a': '^1.0.0', '@x/b': '^1.0.0' } }, '.github/workflows/ci.yml': ci(22) }],
    ['2026-03-02', 'fix: TIX-1 handle new field in checkout', { 'src/checkout.ts': 'export const c = 1;\n' }],
    ['2026-04-02', 'ci: bump node to 24', { '.github/workflows/ci.yml': ci(24) }],
  ]);
  const I = miniRepo(path.join(base, 'isolated'), [
    ['2026-01-04', 'initial commit', { 'package.json': { name: 'isolated', private: true }, '.github/workflows/ci.yml': ci(22) }],
    ['2026-04-03', 'ci: bump node to 24', { '.github/workflows/ci.yml': ci(24) }],
    ['2027-06-01', 'feat: work after the report window', { 'src/late.ts': 'export {};\n' }],
  ]);
  test.after(() => fs.rmSync(base, { recursive: true, force: true }));
  return { base, repos: [P, C, I], config: { repos: [P, C, I], since: '2026-01-01', now: '2027-01-01T00:00:00Z' } };
})();

test('ticket keys are removed before lowercasing, so subjects differing only by ticket match', () => {
  assert.equal(normalizeSubject('PAY-42 add currency field'), normalizeSubject('PAY-43 add currency field'));
  assert.equal(normalizeSubject('fix(ui): PAY-42 add currency field'), 'add currency field');
});

test('history after `now` is excluded from commits and tags', () => {
  const r = analyze(mini.config);
  assert.equal(r.repos.find((x) => x.name === 'isolated').commits, 2);
  const early = analyze({ ...config, now: '2026-04-01T00:00:00Z' });
  assert.equal(early.bugs.filter((b) => b.category === 'duplicated-fix').length, 0, 'April fixes are after now');
  assert.equal(early.internal.releases.length, 2, 'the June release is after now');
});

test('one fix plus related work in another repo is coordination, not a cross-repo bug', () => {
  const r = analyze(mini.config);
  assert.equal(r.bugs.length, 0);
  assert.equal(r.coordinated.length, 1);
  assert.equal(r.coordinated[0].ticket, 'TIX-1');
});

test('a release commit versioning several packages costs one CI run', () => {
  const rel = analyze(mini.config).cost.expected.lines.find((l) => l.key === 'releases');
  assert.equal(rel.count, 2);
  assert.equal(rel.hours, 1);
  assert.equal(rel.ciMinutes, 15);
});

test('zero measured CI minutes is a measurement, not missing data', () => {
  const r = analyze({ ...config, ci: { 'web-app': { totalMinutes: 0 }, 'ui-lib': { totalMinutes: 'n/a' } } });
  assert.deepEqual([r.repos.find((x) => x.name === 'web-app').ci.source, r.repos.find((x) => x.name === 'web-app').ci.minutesPerCommit], ['measured', 0]);
  assert.equal(r.repos.find((x) => x.name === 'ui-lib').ci.source, 'assumed');
});

test('savings and migration cost cover only the repos that would move', () => {
  const r = analyze(mini.config);
  assert.deepEqual(r.migration.isolated, ['isolated']);
  const tooling = r.cost.expected.lines.find((l) => l.key === 'duplicatedTooling');
  assert.equal(tooling.hours, 2, 'the tax counts all three copies');
  assert.equal(tooling.annualSavings, Math.round(1 * 100 + 15 * 0.008), 'only the producer/consumer copy is recovered');
  assert.deepEqual(r.migration.oneTime.repos.sort(), ['consumer', 'producer']);
});

test('unreadable history is reported as a data problem, not an empty repo', () => {
  const empty = path.join(mini.base, 'empty');
  fs.mkdirSync(empty);
  execFileSync('git', ['-C', empty, 'init', '-q']);
  const r = analyze({ ...mini.config, repos: [...mini.repos, empty] });
  assert.ok(r.problems.some((p) => p.startsWith('empty: HEAD has no commits')));
});

test('fetch-ci splits ranges at the 1000-run cap and refuses partial days', () => {
  const perDay = { '2026-01-01': 600, '2026-01-02': 600, '2026-01-03': 10 };
  const count = (range) => {
    const [a, b] = range.split('..');
    return Object.entries(perDay).filter(([d]) => d >= a && d <= b).reduce((s, [, n]) => s + n, 0);
  };
  const ranges = completeRanges('2026-01-01..2026-01-03', count);
  assert.ok(ranges.every((r) => count(r) < 1000));
  assert.equal(ranges.reduce((s, r) => s + count(r), 0), 1210);
  assert.throws(() => completeRanges('2026-01-01..2026-01-01', () => 1000), /cannot list them completely/);
});

test('fetch-ci paginates jobs and keeps a job/wall ratio below 1', () => {
  const calls = [];
  const api = (args) => {
    calls.push(args);
    if (args.includes('.total_count')) return '1\n';
    if (args[0].endsWith('/jobs')) return '2026-01-01T00:00:00Z\t2026-01-01T00:05:00Z\n';
    return '42\t2026-01-01T00:00:00Z\t2026-01-01T00:10:00Z\tpush\tci\n';
  };
  const r = fetchRepo('acme/app', '2026-01-01', '2026-01-02', 5, api);
  assert.equal(r.jobWallRatio, 0.5);
  assert.equal(r.totalMinutes, 5);
  assert.ok(calls.find((c) => c[0].endsWith('/jobs')).includes('--paginate'));
});

test('html: invalid currency codes cannot inject markup; verdict agrees with payback', () => {
  const bad = structuredClone(report);
  bad.rates.currency = '<img src=x onerror=alert(1)>';
  assert.ok(!renderHtml(bad).includes('<img'));
  const short = structuredClone(report);
  short.migration.paybackMonths.expected = 12;
  short.migration.clusters = [{ repos: ['a', 'b'], weight: 2 }];
  const html = renderHtml(short);
  assert.ok(!html.includes('does not pay back a migration within two years'));
  assert.ok(html.includes('Payback is about 12 months, but no cluster'));
});

test('the sample report served by the docs site matches the analyzer output', async () => {
  const { buildSample, SAMPLE } = await import('./build-polyrepo-sample.mjs');
  assert.equal(fs.readFileSync(SAMPLE, 'utf8'), buildSample(), 'stale: run node scripts/build-polyrepo-sample.mjs');
});

test('the docs site has the sample report images', async () => {
  const { IMAGES } = await import('./build-polyrepo-sample.mjs');
  for (const f of Object.values(IMAGES)) {
    const head = fs.readFileSync(f).subarray(0, 24);
    assert.equal(head.subarray(1, 4).toString(), 'PNG', `${f} is a PNG`);
    assert.equal(head.readUInt32BE(16), 2560, `${f} is rendered at 2x (2560 px wide)`);
  }
});
