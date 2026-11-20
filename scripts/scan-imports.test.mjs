import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verify } from './verify-fixture.mjs';

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
  function run(reference, script) {
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
  run('detection.md', 'detect.mjs');
  run('scan.md', 'scan.mjs');
  const workspace = JSON.parse(fs.readFileSync(path.join(work, 'workspace.json'), 'utf8'));
  if (workspace.orchestrators.some((o) => o.name === 'bazel')) run('bazel.md', 'bazel-audit.mjs');
  run('circular-deps.md', 'cycles.mjs');
}

function verifyBazelContract(bazel, expected, otherChecks = []) {
  const findings = ['boundaries', 'prod-leakage'].flatMap((check) =>
    bazel[check].findings.map((finding) => ({ ...finding, check })));
  const summary = Object.fromEntries(['critical', 'high', 'medium', 'low'].map((severity) =>
    [severity, findings.filter((finding) => finding.severity === severity).length]));
  const checks = ['boundaries', 'prod-leakage'].map((check) => ({ check, ...bazel[check] })).concat(otherChecks);
  const names = new Set(checks.map((check) => check.check));
  const contract = {
    ...expected,
    mustFind: expected.mustFind.filter((finding) => finding.id.includes('/bazel-')),
    mustNotFind: (expected.mustNotFind ?? []).filter((finding) => finding.id.includes('/bazel-')),
    checks: (expected.checks ?? []).filter((check) => names.has(check.check)),
  };
  assert.deepEqual(verify({ version: 1, workspace: {}, summary, checks, findings }, contract), {
    missing: [], unexpected: [], cleanViolations: [], schemaErrors: [], checkErrors: [], ok: true,
  });
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

test('Bazel rules_js example exposes its deep import and Bazel boundary seeds', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bazel-rules-js-scan-'));
  const work = path.join(temp, 'work');
  const example = path.join(root, 'examples', 'bazel-rules-js');
  try {
    runSkillSnippets(example, work);
    const workspace = JSON.parse(fs.readFileSync(path.join(work, 'workspace.json'), 'utf8'));
    const scan = JSON.parse(fs.readFileSync(path.join(work, 'scan.json'), 'utf8'));
    const bazel = JSON.parse(fs.readFileSync(path.join(work, 'bazel.json'), 'utf8'));
    const cycles = JSON.parse(fs.readFileSync(path.join(work, 'findings', 'circular-deps.json'), 'utf8'));
    const expected = JSON.parse(fs.readFileSync(path.join(root, 'fixtures', 'expected', 'bazel-rules-js.json'), 'utf8'));

    assert.deepEqual(workspace.orchestrators.map((o) => o.name), ['bazel']);
    assert.deepEqual(workspace.packages.map((p) => p.name).sort(), [
      '@sample/math-core', '@sample/storefront', '@sample/test-utils',
    ]);
    assert.deepEqual(scan.imports.filter((entry) => entry.deep).map((entry) => ({
      from: entry.from, target: entry.target, spec: entry.spec,
    })), [{
      from: '@sample/storefront',
      target: '@sample/math-core',
      spec: '../../../packages/math-core/src/internal/rounding.js',
    }]);
    assert.equal(scan.imports.find((entry) => entry.deep).declared, true);
    assert.equal(cycles.status, 'partial');
    assert.match(cycles.reason, /Bazel dependency and non-JS source cycles/);
    verifyBazelContract(bazel, expected);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('standalone Bazel Java example produces the expected scoped findings', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bazel-java-scan-'));
  const work = path.join(temp, 'work');
  const example = path.join(root, 'examples', 'bazel-java');
  try {
    runSkillSnippets(example, work);
    const workspace = JSON.parse(fs.readFileSync(path.join(work, 'workspace.json'), 'utf8'));
    const scan = JSON.parse(fs.readFileSync(path.join(work, 'scan.json'), 'utf8'));
    const bazel = JSON.parse(fs.readFileSync(path.join(work, 'bazel.json'), 'utf8'));
    const cycles = JSON.parse(fs.readFileSync(path.join(work, 'findings', 'circular-deps.json'), 'utf8'));
    const expected = JSON.parse(fs.readFileSync(path.join(root, 'fixtures', 'expected', 'bazel-java.json'), 'utf8'));

    assert.deepEqual(workspace.orchestrators.map((o) => o.name), ['bazel']);
    assert.deepEqual(workspace.packages, []);
    assert.deepEqual(workspace.bazel.buildFiles, [
      'apps/catalog/BUILD.bazel', 'libs/catalog/BUILD.bazel', 'libs/testdata/BUILD.bazel',
    ]);
    assert.deepEqual(scan.imports, []);
    assert.equal(cycles.status, 'skipped');
    verifyBazelContract(bazel, expected, [{ check: 'circular-deps', ...cycles }]);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('Bazel static scan follows literal local paths and leaves ambiguous targets unflagged', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bazel-literals-'));
  const example = path.join(temp, 'workspace');
  const work = path.join(temp, 'work');
  try {
    fs.mkdirSync(example);
    fs.writeFileSync(path.join(example, 'MODULE.bazel'), 'module(name = "example")\n');
    fs.writeFileSync(path.join(example, 'BUILD'), 'filegroup(name = "ignored", tags = ["internal"], visibility = ["//visibility:public"])\n');
    fs.writeFileSync(path.join(example, 'BUILD.bazel'), `
load("@rules_java//java:defs.bzl", "java_binary", java_lib = "java_library")
package(default_visibility = ["//visibility:public"])
# java_lib(name = "commented", tags = ["internal"], visibility = ["//visibility:public"])
filegroup(name = "inherited", tags = ["internal"])
java_lib(name = "macro_default", tags = ["internal"])
java_lib(name = "private", tags = ["internal"], visibility = ["//visibility:private"])
java_lib(name = "api", visibility = ["//visibility:public"])
java_lib(name = "dynamic_visibility", tags = ["internal"], visibility = select({"//conditions:default": ["//visibility:public"]}))
java_lib(name = "dynamic_tags", tags = select({"//conditions:default": ["internal"]}))
java_lib(name = "string_tags", tags = "internal", visibility = ["//visibility:public"])
filegroup(name = "conditional", tags = ["internal"], visibility = ["//visibility:public"]) if False else None
filegroup(name = "fixture", srcs = ["fixture.txt"], testonly = True)
filegroup(name = "bridge", srcs = [":fixture"])
java_binary(name = "production", tags = ["production"], testonly = False, data = [":bridge"])
java_binary(name = "conditional_production", tags = ["production"], testonly = False, data = [":fixture"]) if False else None
java_binary(name = "test_user", tags = ["production"], testonly = True, data = [":fixture"])
java_binary(name = "unknown_testonly", tags = ["production"], data = [":fixture"])
java_binary(name = "dynamic_data", tags = ["production"], testonly = False, data = select({"//conditions:default": [":fixture"]}))
`);
    fs.mkdirSync(path.join(example, 'nested'));
    fs.writeFileSync(path.join(example, 'nested', 'MODULE.bazel'), 'module(name = "nested")\n');
    fs.writeFileSync(path.join(example, 'nested', 'BUILD.bazel'), 'filegroup(name = "nested", tags = ["internal"], visibility = ["//visibility:public"])\n');
    fs.writeFileSync(path.join(example, '.bazelignore'), '# Not part of this workspace\nignored/\n');
    fs.mkdirSync(path.join(example, 'ignored'));
    fs.writeFileSync(path.join(example, 'ignored', 'BUILD.bazel'), 'filegroup(name = "ignored", tags = ["internal"], visibility = ["//visibility:public"])\n');
    fs.mkdirSync(path.join(example, 'custom'));
    fs.writeFileSync(path.join(example, 'custom', 'BUILD.bazel'), `
load("//:defs.bzl", "java_library")
java_library(name = "custom_macro", tags = ["internal"], visibility = ["//visibility:public"])
`);
    fs.mkdirSync(path.join(example, 'shadowed'));
    fs.writeFileSync(path.join(example, 'shadowed', 'BUILD.bazel'), `
load("//:defs.bzl", "replacement")
filegroup = replacement
filegroup(name = "shadowed", tags = ["internal"], visibility = ["//visibility:public"])
`);
    fs.mkdirSync(path.join(example, 'shadowed_tuple'));
    fs.writeFileSync(path.join(example, 'shadowed_tuple', 'BUILD.bazel'), `
load("//:defs.bzl", "replacement")
filegroup, unused = replacement, None
filegroup(name = "shadowed_tuple", tags = ["internal"], visibility = ["//visibility:public"])
`);
    fs.mkdirSync(path.join(example, 'shadowed_package'));
    fs.writeFileSync(path.join(example, 'shadowed_package', 'BUILD.bazel'), `
load("//:defs.bzl", "replacement")
package = replacement
package(default_visibility = ["//visibility:public"])
filegroup(name = "not_public", tags = ["internal"])
`);
    fs.writeFileSync(path.join(example, 'REPO.bazel'), 'repo(default_visibility = ["//visibility:private"])\n');

    runSkillSnippets(example, work);
    const workspace = JSON.parse(fs.readFileSync(path.join(work, 'workspace.json'), 'utf8'));
    const bazel = JSON.parse(fs.readFileSync(path.join(work, 'bazel.json'), 'utf8'));
    assert.deepEqual(workspace.bazel.buildFiles, [
      'BUILD.bazel', 'custom/BUILD.bazel', 'shadowed/BUILD.bazel',
      'shadowed_package/BUILD.bazel', 'shadowed_tuple/BUILD.bazel',
    ]);
    assert.equal(bazel.boundaries.status, 'partial');
    assert.deepEqual(bazel.boundaries.findings.map((finding) => finding.title), [
      'Internal-tagged target //:inherited is publicly visible',
    ]);
    assert.equal(bazel['prod-leakage'].findings.length, 1);
    assert.match(bazel['prod-leakage'].findings[0].evidence, /\/\/:production.*\n\/\/:production.*\/\/:bridge\n\/\/:bridge.*\/\/:fixture/s);
    assert.match(bazel['prod-leakage'].reason, /macros, selects, package groups and external dependencies/);

    fs.writeFileSync(path.join(example, 'REPO.bazel'), 'ignore_directories(["**/custom"])\n');
    runSkillSnippets(example, work);
    const unresolved = JSON.parse(fs.readFileSync(path.join(work, 'bazel.json'), 'utf8'));
    for (const check of ['boundaries', 'prod-leakage']) {
      assert.deepEqual(unresolved[check].findings, []);
      assert.match(unresolved[check].reason, /REPO\.bazel ignore_directories is not resolved/);
    }

    fs.unlinkSync(path.join(example, 'REPO.bazel'));
    fs.unlinkSync(path.join(example, '.bazelignore'));
    fs.mkdirSync(path.join(example, '.bazelignore'));
    runSkillSnippets(example, work);
    const unreadable = JSON.parse(fs.readFileSync(path.join(work, 'bazel.json'), 'utf8'));
    assert.deepEqual(unreadable.boundaries.findings, []);
    assert.match(unreadable.boundaries.reason, /\.bazelignore:/);
    assert.deepEqual(unreadable['prod-leakage'].findings, []);

    fs.rmdirSync(path.join(example, '.bazelignore'));
    fs.writeFileSync(path.join(example, '.bazelignore'), './\n');
    assert.throws(() => runSkillSnippets(example, work), (error) => {
      assert.equal(error.status, 2);
      assert.match(error.stderr.toString(), /NO_WORKSPACE/);
      return true;
    });
    const ignoredRoot = JSON.parse(fs.readFileSync(path.join(work, 'workspace.json'), 'utf8'));
    assert.deepEqual(ignoredRoot.bazel.buildFiles, []);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
