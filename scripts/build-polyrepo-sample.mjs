// Regenerates the sample polyrepo-tax report served by the docs site from the synthetic fixture.
// Usage: node scripts/build-polyrepo-sample.mjs [--check] [--images]
// The fixture's commits use fixed dates and authors, so the HTML is deterministic.
// --images also writes light-theme PNGs at 2x (full page and a preview of the first screen). It needs
// Playwright with Chromium; image pixels depend on installed fonts, so they are not checked by tests.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeFixture } from '../fixtures/polyrepo/make-fixture.mjs';
import { analyze } from '../skills/polyrepo-tax/scripts/analyze.mjs';
import { renderHtml } from '../skills/polyrepo-tax/scripts/render-html.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const examples = path.join(root, 'site', 'public', 'examples');
export const SAMPLE = path.join(examples, 'polyrepo-tax-report.html');
export const IMAGES = { full: path.join(examples, 'polyrepo-tax-report.png'), preview: path.join(examples, 'polyrepo-tax-report-preview.png') };

export async function buildImages(htmlPath = SAMPLE) {
  const { createRequire } = await import('node:module');
  let chromium;
  try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch {
    throw new Error('--images needs Playwright with Chromium (npm i -D playwright && npx playwright install chromium)');
  }
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light' });
    await page.goto(`file://${htmlPath}`);
    // Light theme, every bug expanded so the image carries its commit evidence.
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'light';
      for (const d of document.querySelectorAll('details.bug')) d.open = true;
    });
    await page.screenshot({ path: IMAGES.full, fullPage: true });
    await page.screenshot({ path: IMAGES.preview });
  } finally {
    await browser.close();
  }
}

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
  if (process.argv.includes('--images')) {
    await buildImages();
    for (const f of Object.values(IMAGES)) console.log(`wrote ${path.relative(root, f)}`);
  }
}
