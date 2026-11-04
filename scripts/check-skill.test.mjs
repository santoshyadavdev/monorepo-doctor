import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkSkill, parseFrontmatter } from './check-skill.mjs';

const roots = [];
after(() => {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
});

function makeSkill({ name = 'demo-skill', description = 'Use when testing.', body = 'See references/a.md.', refs = { 'a.md': 'Defines `x/y`.' }, expected } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-skill-'));
  roots.push(root);
  const dir = path.join(root, 'demo-skill');
  fs.mkdirSync(path.join(dir, 'references'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`);
  for (const [f, c] of Object.entries(refs)) fs.writeFileSync(path.join(dir, 'references', f), c);
  const expDir = path.join(root, 'expected');
  fs.mkdirSync(expDir);
  if (expected) fs.writeFileSync(path.join(expDir, 'f.json'), JSON.stringify(expected));
  return { dir, expDir };
}

test('parseFrontmatter reads name and description', () => {
  assert.deepEqual(parseFrontmatter('---\nname: a\ndescription: Use when x: y\n---\nbody'), { name: 'a', description: 'Use when x: y' });
  assert.equal(parseFrontmatter('no frontmatter'), null);
});

test('parseFrontmatter accepts CRLF and closing marker at EOF', () => {
  assert.deepEqual(parseFrontmatter('---\r\nname: a\r\ndescription: Use when x\r\n---'), { name: 'a', description: 'Use when x' });
});

test('valid skill has no errors', () => {
  const { dir, expDir } = makeSkill({ expected: { mustFind: [{ id: 'x/y' }], cleanPackages: [] } });
  assert.deepEqual(checkSkill(dir, expDir), []);
});

test('name must match directory', () => {
  const { dir, expDir } = makeSkill({ name: 'other' });
  assert.ok(checkSkill(dir, expDir).some((e) => e.includes('must equal directory')));
});

test('description must start with "Use when"', () => {
  const { dir, expDir } = makeSkill({ description: 'Audits things.' });
  assert.ok(checkSkill(dir, expDir).some((e) => e.includes('Use when')));
});

test('description longer than 1024 characters is reported', () => {
  const { dir, expDir } = makeSkill({ description: `Use when ${'x'.repeat(1025)}` });
  assert.ok(checkSkill(dir, expDir).some((e) => e.includes('exceeds 1024')));
});

test('unlinked and missing references are reported', () => {
  const { dir, expDir } = makeSkill({ body: 'See references/missing.md.', refs: { 'a.md': '' } });
  const errors = checkSkill(dir, expDir);
  assert.ok(errors.some((e) => e.includes('references/missing.md')));
  assert.ok(errors.some((e) => e.includes('references/a.md is not linked')));
});

test('missing expected dir is an error when supplied', () => {
  const { dir } = makeSkill();
  assert.deepEqual(checkSkill(dir), []);
  assert.ok(checkSkill(dir, path.join(os.tmpdir(), 'mrd-no-such-dir')).some((e) => e.includes('expected dir not found')));
});

test('expected finding ids must be defined in a reference', () => {
  const { dir, expDir } = makeSkill({ expected: { mustFind: [{ id: 'nope/missing' }], cleanPackages: [] } });
  assert.ok(checkSkill(dir, expDir).some((e) => e.includes('nope/missing')));
});

test('forbidden finding ids must also be defined in a reference', () => {
  const { dir, expDir } = makeSkill({ expected: { mustFind: [], mustNotFind: [{ id: 'nope/missing' }], cleanPackages: [] } });
  assert.ok(checkSkill(dir, expDir).some((e) => e.includes('nope/missing')));
});
