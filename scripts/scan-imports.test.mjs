import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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

