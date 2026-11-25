// Regenerates the sample polyrepo-tax HTML report served by the docs site from the synthetic fixture.
// Usage: node scripts/build-polyrepo-sample.mjs [--check]
// The fixture's commits use fixed dates and authors, so the output is deterministic.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeFixture } from '../fixtures/polyrepo/make-fixture.mjs';
import { analyze } from '../skills/polyrepo-tax/scripts/analyze.mjs';
import { renderHtml } from '../skills/polyrepo-tax/scripts/render-html.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SAMPLE = path.join(root, 'site', 'public', 'examples', 'polyrepo-tax-report.html');

export function buildSample() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'polyrepo-sample-'));
  try {
    const { repos } = makeFixture(tmp);
    const report = analyze({ repos, since: '2025-11-01', now: '2026-11-01T00:00:00Z', rates: { developerHourly: 100, ciPerMinute: 0.008, currency: 'USD' } });
    const plan = fs.readFileSync(path.join(root, 'fixtures', 'polyrepo', 'migration-plan.md'), 'utf8');
    return renderHtml(report, { plan });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const html = buildSample();
  if (process.argv.includes('--check')) {
    const ok = fs.existsSync(SAMPLE) && fs.readFileSync(SAMPLE, 'utf8') === html;
    console.log(ok ? '✓ sample polyrepo-tax report is up to date' : '✗ sample report is stale: run node scripts/build-polyrepo-sample.mjs');
    process.exit(ok ? 0 : 1);
  }
  fs.mkdirSync(path.dirname(SAMPLE), { recursive: true });
  fs.writeFileSync(SAMPLE, html);
  console.log(`wrote ${path.relative(root, SAMPLE)}`);
}
