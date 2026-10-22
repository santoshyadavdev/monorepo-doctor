import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
  }
  return fm;
}

export function checkSkill(skillDir, expectedDir) {
  const errors = [];
  const skillPath = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillPath)) return [`missing ${skillPath}`];
  const skill = fs.readFileSync(skillPath, 'utf8');
  const fm = parseFrontmatter(skill);
  const dirName = path.basename(skillDir);
  if (!fm) errors.push('SKILL.md: missing frontmatter');
  else {
    if (fm.name !== dirName) errors.push(`SKILL.md: name "${fm.name}" must equal directory "${dirName}"`);
    if (!fm.description) errors.push('SKILL.md: missing description');
    else {
      if (!fm.description.startsWith('Use when')) errors.push('SKILL.md: description must start with "Use when"');
      if (fm.description.length > 1024) errors.push('SKILL.md: description exceeds 1024 characters');
    }
  }
  const refDir = path.join(skillDir, 'references');
  const refs = fs.existsSync(refDir) ? fs.readdirSync(refDir).filter((f) => f.endsWith('.md')) : [];
  const linked = new Set([...skill.matchAll(/references\/([\w-]+\.md)/g)].map((m) => m[1]));
  for (const l of linked) if (!refs.includes(l)) errors.push(`SKILL.md links missing file references/${l}`);
  for (const r of refs) if (!linked.has(r)) errors.push(`references/${r} is not linked from SKILL.md`);
  const corpus = refs.map((r) => fs.readFileSync(path.join(refDir, r), 'utf8')).join('\n');
  if (expectedDir && !fs.existsSync(expectedDir)) errors.push(`expected dir not found: ${expectedDir}`);
  else if (expectedDir) {
    for (const f of fs.readdirSync(expectedDir).filter((x) => x.endsWith('.json'))) {
      const exp = JSON.parse(fs.readFileSync(path.join(expectedDir, f), 'utf8'));
      for (const { id } of exp.mustFind) {
        if (!corpus.includes('`' + id + '`')) errors.push(`${f}: finding id ${id} is not defined in any reference file`);
      }
    }
  }
  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const skillsDir = path.join(root, 'skills');
  const skills = fs.readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  let failed = false;
  for (const name of skills) {
    const expected = name === 'monorepo-doctor' ? path.join(root, 'fixtures', 'expected') : undefined;
    const errors = checkSkill(path.join(skillsDir, name), expected);
    for (const e of errors) console.error(`✗ ${name}: ${e}`);
    if (errors.length) failed = true;
    else console.log(`✓ ${name} is consistent`);
  }
  if (failed) process.exit(1);
}
