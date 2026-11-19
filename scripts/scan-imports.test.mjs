import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scanMd = fs.readFileSync(path.join(root, 'skills', 'monorepo-doctor', 'references', 'scan.md'), 'utf8');

const stripCommentsMatch = scanMd.match(/const stripComments = [^;]+;/);
const allNamedMatch = scanMd.match(/function allNamedSpecifiersAreTypeOnly\([\s\S]*?\n\}/);

assert.ok(stripCommentsMatch, 'stripComments should be defined in scan.md');
assert.ok(allNamedMatch, 'allNamedSpecifiersAreTypeOnly should be defined in scan.md');

const allNamedSpecifiersAreTypeOnly = new Function(`${stripCommentsMatch[0]}; return (${allNamedMatch[0]});`)();

test('allNamedSpecifiersAreTypeOnly: returns true when all specifiers inside braces are type-only', () => {
  assert.equal(allNamedSpecifiersAreTypeOnly('{ type A, type B } from '), true);
  assert.equal(allNamedSpecifiersAreTypeOnly('{\n  type A,\n  type B as C\n} from '), true);
  assert.equal(allNamedSpecifiersAreTypeOnly('{ type A } from '), true);
});

test('allNamedSpecifiersAreTypeOnly: returns false when default import precedes braces', () => {
  assert.equal(allNamedSpecifiersAreTypeOnly('Button, { type ButtonProps } from '), false);
  assert.equal(allNamedSpecifiersAreTypeOnly('React, { type FC, type ReactNode } from '), false);
  assert.equal(allNamedSpecifiersAreTypeOnly('apiClient, { type RequestConfig } from '), false);
});

test('allNamedSpecifiersAreTypeOnly: returns false when comments precede braces with default import', () => {
  assert.equal(allNamedSpecifiersAreTypeOnly('Button, /* props */ { type ButtonProps } from '), false);
  assert.equal(allNamedSpecifiersAreTypeOnly('Button, // inline comment\n { type ButtonProps } from '), false);
});

test('allNamedSpecifiersAreTypeOnly: returns false when mixed value and type specifiers exist inside braces', () => {
  assert.equal(allNamedSpecifiersAreTypeOnly('{ A, type B } from '), false);
  assert.equal(allNamedSpecifiersAreTypeOnly('{ A as B, type C } from '), false);
});

test('allNamedSpecifiersAreTypeOnly: returns false when no braces exist', () => {
  assert.equal(allNamedSpecifiersAreTypeOnly('* as utils from '), false);
  assert.equal(allNamedSpecifiersAreTypeOnly('DefaultExport from '), false);
  assert.equal(allNamedSpecifiersAreTypeOnly(''), false);
});

const lineStartsMatch = scanMd.match(/function lineStarts\(text\) \{[\s\S]*?\n\}/);
const lineAtMatch = scanMd.match(/function lineAt\(starts, idx\) \{[\s\S]*?\n\}/);
const importLoopMatch = scanMd.match(/const importRe = [^;]+;[\s\S]*?for \(const m of text\.matchAll\(importRe\)\) \{[\s\S]*?\n    \}/);

assert.ok(lineStartsMatch, 'lineStarts should be defined in scan.md');
assert.ok(lineAtMatch, 'lineAt should be defined in scan.md');
assert.ok(importLoopMatch, 'import loop should be defined in scan.md');

const extractSpecsFromScanMd = new Function(
  'text',
  `${lineStartsMatch[0]};
   ${lineAtMatch[0]};
   ${stripCommentsMatch[0]};
   ${allNamedMatch[0]};
   const starts = lineStarts(text);
   const specs = [];
   ${importLoopMatch[0]};
   return specs;`
);

test('scanner import logic retains default import when mixed with type specifiers', () => {
  const code = "import Button, { type ButtonProps } from '@acme/ui';\n";
  const specs = extractSpecsFromScanMd(code);

  assert.equal(specs.length, 1, 'scanner loop should extract one import');
  assert.equal(specs[0].spec, '@acme/ui', 'extracted specifier should be @acme/ui');
  assert.equal(specs[0].line, 1, 'extracted line number should be 1');
});

test('scanner import logic drops pure type-only imports', () => {
  const code = "import { type ComponentProps } from '@acme/types';\n";
  const specs = extractSpecsFromScanMd(code);

  assert.equal(specs.length, 0, 'scanner loop should drop pure type-only imports');
});

function runSkillSnippets(example, work) {
  for (const [reference, script] of [['detection.md', 'detect.mjs'], ['scan.md', 'scan.mjs'], ['circular-deps.md', 'cycles.mjs']]) {
    const markdown = fs.readFileSync(path.join(root, 'skills', 'monorepo-doctor', 'references', reference), 'utf8');
    const marker = `cat > "$W/${script}" <<'EOF'\n`;
    const start = markdown.indexOf(marker);
    assert.notEqual(start, -1, `${script} snippet must exist`);
    const end = markdown.indexOf('\nEOF', start + marker.length);
    assert.notEqual(end, -1, `${script} snippet must terminate`);
    const code = markdown.slice(start + marker.length, end)
      .replace("const work = path.join(os.tmpdir(), 'monorepo-doctor');", `const work = ${JSON.stringify(work)};`);
    execFileSync(process.execPath, ['--input-type=module', '-e', code], { cwd: example });
  }
}

test('React Turbo example exposes its seeded deep import and file cycle without a package cycle', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'react-turbo-scan-'));
  const work = path.join(temp, 'work');
  const example = path.join(root, 'examples', 'react-turbo');
  try {
    runSkillSnippets(example, work);
    const workspace = JSON.parse(fs.readFileSync(path.join(work, 'workspace.json'), 'utf8'));
    const scan = JSON.parse(fs.readFileSync(path.join(work, 'scan.json'), 'utf8'));
    const cycles = JSON.parse(fs.readFileSync(path.join(work, 'findings', 'circular-deps.json'), 'utf8'));

    assert.equal(workspace.packages.length, 6);
    assert.deepEqual(workspace.ciFiles, ['.github/workflows/ci.yml']);
    assert.deepEqual(scan.imports.filter((entry) => entry.deep).map((entry) => ({
      from: entry.from, target: entry.target, declared: entry.declared,
    })), [{ from: '@sample/storefront', target: '@sample/data', declared: true }]);
    assert.deepEqual(scan.imports.filter((entry) => !entry.declared), []);
    assert.deepEqual(cycles.findings.map((finding) => ({
      id: finding.id, package: finding.location.package,
    })), [{ id: 'circular-deps/file-cycle', package: '@sample/utils' }]);
    assert.ok(cycles.findings[0].evidence.includes('packages/utils/src/labels.js'));
    assert.ok(cycles.findings[0].evidence.includes('packages/utils/src/normalize.js'));
    assert.ok(scan.packages['@sample/utils'].testFiles.includes('packages/utils/src/index.test.js'));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});


test('Angular Nx example exposes its seeded deep import and file cycle without a package cycle', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'angular-nx-scan-'));
  const work = path.join(temp, 'work');
  const example = path.join(root, 'examples', 'angular-nx');
  try {
    runSkillSnippets(example, work);
    const workspace = JSON.parse(fs.readFileSync(path.join(work, 'workspace.json'), 'utf8'));
    const scan = JSON.parse(fs.readFileSync(path.join(work, 'scan.json'), 'utf8'));
    const cycles = JSON.parse(fs.readFileSync(path.join(work, 'findings', 'circular-deps.json'), 'utf8'));

    assert.deepEqual(workspace.orchestrators.map((o) => o.name), ['nx']);
    assert.deepEqual(workspace.packages.map((p) => [p.name, p.source]).sort(), [
      ['admin', 'project.json'], ['data', 'project.json'], ['storefront', 'project.json'],
      ['test-utils', 'project.json'], ['ui', 'project.json'], ['utils', 'project.json'],
    ]);
    assert.deepEqual(workspace.packages.filter((p) => !p.tags.length).map((p) => p.name), ['data']);
    assert.deepEqual(workspace.ciFiles, ['.github/workflows/ci.yml']);
    assert.deepEqual(scan.imports.filter((entry) => entry.deep).map((entry) => ({
      from: entry.from, target: entry.target, kind: entry.kind,
    })), [{ from: 'storefront', target: 'data', kind: 'relative' }]);
    assert.ok(scan.imports.some((entry) => entry.kind === 'alias' && entry.from === 'admin' && entry.target === 'utils' && !entry.deep));
    assert.deepEqual(cycles.findings.map((finding) => ({
      id: finding.id, package: finding.location.package,
    })), [{ id: 'circular-deps/file-cycle', package: 'data' }]);
    assert.ok(cycles.findings[0].evidence.includes('libs/data/src/lib/catalog.ts'));
    assert.ok(cycles.findings[0].evidence.includes('libs/data/src/lib/inventory.ts'));
    assert.ok(scan.packages.utils.testFiles.includes('libs/utils/src/lib/price.spec.ts'));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
