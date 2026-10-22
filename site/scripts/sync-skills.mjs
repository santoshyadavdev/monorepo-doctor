// Mirrors ../skills into the site so the skill files stay the single source of truth:
// - public/skills/<skill>/...            raw Markdown for agents
// - src/content/docs/reference/<skill>/  rendered reference pages for humans
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = join(dirname(fileURLToPath(import.meta.url)), '..');
const skillsDir = join(site, '..', 'skills');
const repo = 'https://github.com/santoshyadavdev/monorepo-doctor';
const rawOut = join(site, 'public', 'skills');
const pagesOut = join(site, 'src', 'content', 'docs', 'reference');

rmSync(rawOut, { recursive: true, force: true });
rmSync(pagesOut, { recursive: true, force: true });

const yaml = (s) => JSON.stringify(s);
const slug = (file) => file.replace(/\.md$/, '').toLowerCase();

function order(title, file) {
  if (file === 'SKILL.md') return 0;
  const phase = /^Phase (\d+)/.exec(title);
  if (phase) return Number(phase[1]);
  const check = /^Check (\d+)/.exec(title);
  if (check) return 10 + Number(check[1]);
  return 50;
}

function toPage(skill, file, src) {
  let body = src.replace(/^---\n[\s\S]*?\n---\n/, '');
  const h1 = /^#\s+(.+)$/m.exec(body);
  const title = file === 'SKILL.md' ? `${skill} — SKILL.md` : (h1?.[1] ?? file);
  if (h1) body = body.replace(h1[0], '');
  body = body
    .replace(/\]\(references\/([\w-]+)\.md\)/g, (_, n) => `](/reference/${skill}/${n}/)`)
    .replace(/\]\(\.?\/?([\w-]+)\.md\)/g, (_, n) => `](/reference/${skill}/${n}/)`);
  const sourcePath = file === 'SKILL.md' ? `skills/${skill}/SKILL.md` : `skills/${skill}/references/${file}`;
  const fm = [
    '---',
    `title: ${yaml(title)}`,
    `description: ${yaml(`${skill} skill source: ${sourcePath}`)}`,
    `editUrl: ${yaml(`${repo}/edit/master/${sourcePath}`)}`,
    'sidebar:',
    `  order: ${order(title, file)}`,
    ...(file === 'SKILL.md' ? ['  label: SKILL.md'] : []),
    '---',
    '',
    ':::note',
    `Generated from [\`${sourcePath}\`](${repo}/blob/master/${sourcePath}). Raw Markdown for agents: [\`/${sourcePath}\`](/${sourcePath}).`,
    ':::',
    '',
    '',
  ].join('\n');
  return fm + body.trimStart();
}

const skills = readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
for (const skill of skills) {
  const dir = join(skillsDir, skill);
  cpSync(dir, join(rawOut, skill), { recursive: true });
  const out = join(pagesOut, skill);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'skill.md'), toPage(skill, 'SKILL.md', readFileSync(join(dir, 'SKILL.md'), 'utf8')));
  const refs = join(dir, 'references');
  if (existsSync(refs)) {
    for (const file of readdirSync(refs).filter((f) => f.endsWith('.md'))) {
      writeFileSync(join(out, `${slug(file)}.md`), toPage(skill, file, readFileSync(join(refs, file), 'utf8')));
    }
  }
}
console.log(`synced ${skills.length} skills: ${skills.join(', ')}`);
