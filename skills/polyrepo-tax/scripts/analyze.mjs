#!/usr/bin/env node
// polyrepo-tax analyzer. Read-only: runs only `git log`, `git show`, `git ls-tree`
// and `git for-each-ref` against the given repositories (bare clones work).
// Usage:
//   node analyze.mjs --config polyrepo-tax.config.json [--out DIR]
//   node analyze.mjs ../repo-a ../repo-b [--since 2025-11-25] [--scope @acme/] [--rate 100]
//                    [--ci-rate 0.008] [--ci ci.json] [--overrides overrides.json] [--out DIR]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderHtml } from './render-html.mjs';

export const DEFAULT_ASSUMPTIONS = {
  // Developer hours per event. Every value is user-overridable and printed in the report.
  bumpHumanHours: 0.5, // open/review/merge a manual internal-dependency bump PR
  bumpBotHours: 0.2, // review + merge a Renovate/Dependabot internal bump PR
  releaseHours: 0.5, // cut and publish an internal release that sibling repos consume
  coordinationHoursPerExtraRepo: 2, // sequencing PRs/releases for one change spread over N repos
  duplicateChangeHoursPerCopy: 1, // re-applying the same tooling/config change in another repo
  bugHours: 8, // triage + fix + release + bump for one polyrepo-attributable bug
  ciMinutesPerCommit: 15, // used only when no CI data is supplied for a repo
  bumpFixWindowDays: 7, // a fix this soon after an internal bump is checked for a link to it
  groupWindowDays: 14, // max spread for "same change in several repos"
  similarity: 0.75, // token Jaccard threshold for "same commit subject"
  migrationDaysPerRepo: 3, // one-time cost to import one repo into the monorepo
  migrationDaysPerConflict: 0.5, // one-time cost to align one external-dependency major-version conflict
  monorepoToolingMonthly: 0, // ongoing $ for remote cache / tooling, if any
};

// Share of each cost a monorepo removes. Documented in references/cost-model.md.
export const SAVINGS = {
  bumps: 1, releases: 1, coordination: 0.75, duplicatedTooling: 1,
  'dependency-regression': 0.9, 'post-bump-fix': 0.9, 'fix-propagation': 1, 'duplicated-fix': 1, 'cross-repo-fix': 0.5,
};

const BOT = /\[bot\]|^renovate|^dependabot|greenkeeper|github-actions|^snyk-bot/i;
const FIX_PREFIX = /^(fix|hotfix|bugfix)(\(([^)]*)\))?!?:/i;
const FIX_WORD = /\b(fix(es|ed)?|bug(fix)?|hotfix|regression|broken|crash(es|ed)?|incident)\b/i;
const DEPS_CHORE = /^(chore|build|fix|ci)\((deps|deps-dev|dependencies)\)|^(update|bump|upgrade)\b.*\b(dependency|dependencies|deps|from .* to|to v?\d)/i;
const RELEASE = /^(chore|build)(\(release\))?:\s*(release|publish|version)|^(release|publish|version)\b|^v?\d+\.\d+\.\d+$/i;
const COMPAT = /\b(compat|compatib\w*|breaking|incompatib\w*|migrat\w*|mismatch|api change|new version|after (the )?(bump|upgrade|update))\b/i;
const TICKET = /\b([A-Z][A-Z0-9]{1,9})-(\d+)\b/g;
const GH_REF = /\b([\w.-]+\/[\w.-]+)#(\d+)\b/g;
const TICKET_STOP = new Set(['UTF', 'ISO', 'SHA', 'RFC', 'ECMA', 'HTTP', 'ES', 'TLS', 'SSL', 'X', 'UTC', 'GMT']);
const CONFIG_FILE = /(^|\/)(\.github\/(workflows|actions)\/|\.gitlab-ci\.yml$|\.circleci\/|Jenkinsfile$|azure-pipelines\.yml$|\.buildkite\/|\.eslintrc|eslint\.config\.|\.prettierrc|prettier\.config\.|tsconfig[\w.-]*\.json$|\.nvmrc$|\.node-version$|\.tool-versions$|renovate\.json5?$|\.github\/dependabot\.yml$|Dockerfile|\.dockerignore$|\.editorconfig$|jest\.config\.|vitest\.config\.|\.npmrc$|\.yarnrc|babel\.config\.|\.babelrc|\.husky\/|\.lintstagedrc|commitlint\.config\.|\.gitignore$|CODEOWNERS$)/;
const GENERIC = new Set(['update readme', 'initial commit', 'wip', 'update', 'fix', 'fix typo', 'typo', 'cleanup', 'merge', 'tests', 'lint', 'format', 'update changelog', 'docs', 'fix tests', 'fix build', 'fix lint']);
const LANG = [
  ['js/ts', /\.(m?[jt]sx?|cjs|cts|vue|svelte)$/], ['java/kotlin', /\.(java|kts?|gradle)$/], ['go', /\.go$/],
  ['python', /\.py$/], ['rust', /\.rs$/], ['csharp', /\.(cs|fs)$/], ['ruby', /\.rb$/], ['swift', /\.swift$/], ['php', /\.php$/],
];
const DAY = 86_400_000;

const git = (repo, args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'pipe'] });
const tryGit = (repo, args) => { try { return git(repo, args); } catch { return ''; } };
const tryJson = (s) => { try { return JSON.parse(s); } catch { return null; } };
const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const days = (a, b) => (Date.parse(b) - Date.parse(a)) / DAY;

export function minVersion(range) {
  if (typeof range !== 'string') return null;
  const m = range.replace(/^workspace:/, '').match(/(\d+)\.(\d+|x|\*)(?:\.(\d+|x|\*))?/);
  if (!m) return null;
  const n = (v) => (v === undefined || v === 'x' || v === '*' ? 0 : Number(v));
  return [Number(m[1]), n(m[2]), n(m[3])];
}
export function cmpVersion(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}
const vstr = (v) => (v ? v.join('.') : '?');

export function normalizeSubject(s) {
  return s.toLowerCase()
    .replace(/^revert\s+"?/, '')
    .replace(/^[a-z]+(\([^)]*\))?!?:\s*/, '')
    .replace(TICKET, ' ').replace(/\(?#\d+\)?/g, ' ').replace(/\b[0-9a-f]{7,40}\b/g, ' ')
    .replace(/[^a-z0-9@/.\s-]+/g, ' ').replace(/\s+/g, ' ').trim();
}
export function similarity(a, b) {
  const ta = new Set(a.split(' ').filter(Boolean));
  const tb = new Set(b.split(' ').filter(Boolean));
  if (ta.size < 3 || tb.size < 3) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}
export function ticketsOf(text) {
  const out = new Set();
  for (const m of text.matchAll(TICKET)) if (!TICKET_STOP.has(m[1])) out.add(`${m[1]}-${m[2]}`);
  for (const m of text.matchAll(GH_REF)) out.add(`${m[1].toLowerCase()}#${m[2]}`);
  return [...out];
}
export const isBot = (c) => BOT.test(c.authorName) || BOT.test(c.authorEmail);
export const isFixSubject = (subject) => {
  if (DEPS_CHORE.test(subject)) return false;
  const pre = subject.match(FIX_PREFIX);
  if (pre) return !/^(deps|deps-dev|dependencies|release)$/i.test(pre[3] ?? '');
  // Another conventional type (docs:, chore:, test:, build:…) wins over the word "fix" in its description.
  if (/^[a-z]+(\([^)]*\))?!?:/i.test(subject)) return false;
  return FIX_WORD.test(subject) && !/\btypos?\b/i.test(subject);
};

// ---------- per-repo collection ----------

function inventory(repo) {
  const files = tryGit(repo, ['ls-tree', '-r', '--name-only', 'HEAD']).split('\n').filter(Boolean);
  const pkgFiles = files.filter((f) => /(^|\/)package\.json$/.test(f) && !/(^|\/)node_modules\//.test(f));
  const packages = [];
  for (const file of pkgFiles) {
    const pkg = tryJson(tryGit(repo, ['show', `HEAD:${file}`]));
    if (!pkg || typeof pkg !== 'object') continue;
    const deps = { ...pkg.peerDependencies, ...pkg.optionalDependencies, ...pkg.devDependencies, ...pkg.dependencies };
    packages.push({ file, name: pkg.name ?? null, version: pkg.version ?? null, private: pkg.private === true, deps });
  }
  const languages = {};
  for (const f of files) {
    if (/(^|\/)(node_modules|vendor|dist|build)\//.test(f)) continue;
    const lang = LANG.find(([, re]) => re.test(f));
    if (lang) languages[lang[0]] = (languages[lang[0]] ?? 0) + 1;
  }
  const has = (f) => files.includes(f);
  const packageManager = has('pnpm-lock.yaml') ? 'pnpm' : has('yarn.lock') ? 'yarn' : has('bun.lockb') || has('bun.lock') ? 'bun' : has('package-lock.json') ? 'npm' : null;
  const buildTools = [
    has('nx.json') && 'nx', has('turbo.json') && 'turbo', has('lerna.json') && 'lerna',
    (has('MODULE.bazel') || has('WORKSPACE') || has('WORKSPACE.bazel')) && 'bazel',
    (has('build.gradle') || has('build.gradle.kts') || has('settings.gradle') || has('settings.gradle.kts')) && 'gradle', has('pom.xml') && 'maven',
    has('go.mod') && 'go', has('Cargo.toml') && 'cargo',
  ].filter(Boolean);
  const ci = files.filter((f) => /^\.github\/workflows\/.+\.ya?ml$|^\.gitlab-ci\.yml$|^\.circleci\/config\.yml$|^Jenkinsfile$|^azure-pipelines\.yml$/.test(f));
  const nodeVersion = has('.nvmrc') ? tryGit(repo, ['show', 'HEAD:.nvmrc']).trim() : null;
  return { files: files.length, packages, languages, packageManager, buildTools, ci, nodeVersion };
}

function commits(repo, since) {
  const out = tryGit(repo, ['log', `--since=${since}`, '--no-merges', '--format=%x1e%H%x1f%aI%x1f%an%x1f%ae%x1f%s%x1f%b%x1f', '--name-only']);
  const list = [];
  for (const rec of out.split('\x1e')) {
    if (!rec.trim()) continue;
    const [sha, date, authorName, authorEmail, subject, body, rest = ''] = rec.split('\x1f');
    list.push({ sha, date, authorName, authorEmail, subject, body: body.trim(), files: rest.split('\n').map((s) => s.trim()).filter(Boolean) });
  }
  return list;
}

// Parse package.json diffs (zero context) into per-commit dependency and version changes.
function manifestChanges(repo, since) {
  const out = tryGit(repo, ['log', `--since=${since}`, '--no-merges', '--format=%x1e%H', '-p', '-U0', '--no-color', '--no-ext-diff', '--', ':(glob)**/package.json']);
  const bySha = new Map();
  for (const rec of out.split('\x1e')) {
    if (!rec.trim()) continue;
    const lines = rec.split('\n');
    const sha = lines[0].trim();
    const files = new Map();
    let file = null;
    for (const line of lines.slice(1)) {
      let m;
      if ((m = line.match(/^\+\+\+ b\/(.+)$/))) { file = m[1]; continue; }
      if ((m = line.match(/^--- a\/(.+)$/))) { file = m[1]; continue; }
      if (line.startsWith('+++') || line.startsWith('---') || !file) continue;
      if (!(m = line.match(/^([-+])\s*"([^"]+)"\s*:\s*"([^"]*)"/))) continue;
      if (!files.has(file)) files.set(file, { removed: new Map(), added: new Map() });
      files.get(file)[m[1] === '-' ? 'removed' : 'added'].set(m[2], m[3]);
    }
    bySha.set(sha, files);
  }
  return bySha;
}

function tags(repo) {
  return tryGit(repo, ['for-each-ref', 'refs/tags', '--format=%(refname:short)%09%(creatordate:iso-strict)'])
    .split('\n').filter(Boolean).map((l) => { const [name, date] = l.split('\t'); return { name, date }; });
}

// ---------- analysis ----------

export function analyze(config) {
  const a = { ...DEFAULT_ASSUMPTIONS, ...config.assumptions };
  const rates = { developerHourly: 100, ciPerMinute: 0.008, currency: 'USD', ...config.rates };
  const now = config.now ?? new Date().toISOString();
  const since = config.since ?? new Date(Date.parse(now) - 365 * DAY).toISOString().slice(0, 10);
  const windowDays = Math.max(1, days(new Date(since).toISOString(), now));
  const exclude = new Set(config.overrides?.excludeCommits ?? []);
  const scopes = config.internalScopes ?? [];
  const problems = [];

  const repos = config.repos.map((r) => {
    const p = typeof r === 'string' ? { path: r } : r;
    const abs = path.resolve(config.baseDir ?? '.', p.path);
    const name = p.name ?? path.basename(abs).replace(/\.git$/, '');
    if (!tryGit(abs, ['rev-parse', '--git-dir'])) { problems.push(`${name}: not a git repository (${abs})`); return null; }
    if (tryGit(abs, ['rev-parse', '--is-shallow-repository']).trim() === 'true') problems.push(`${name}: shallow clone; history before the shallow boundary is missing`);
    const inv = inventory(abs);
    const list = commits(abs, since).filter((c) => !exclude.has(c.sha));
    for (const c of list) c.repo = name;
    return { name, path: abs, github: p.github ?? null, inv, commits: list, manifests: manifestChanges(abs, since), tags: tags(abs) };
  }).filter(Boolean);

  // Internal packages: published by an analysed repo, or matching a configured scope.
  const producerOf = new Map();
  for (const r of repos) for (const p of r.inv.packages) if (p.name) producerOf.set(p.name, r.name);
  const isInternal = (name) => producerOf.has(name) || scopes.some((s) => name.startsWith(s));

  // Releases of internal packages: version-field changes + tags.
  const releases = new Map(); // pkg -> [{version:[..], date, repo, sha}]
  const addRelease = (pkg, version, date, repo, sha) => {
    const v = minVersion(version);
    if (!v || !isInternal(pkg)) return;
    if (!releases.has(pkg)) releases.set(pkg, []);
    const list = releases.get(pkg);
    const prev = list.find((x) => cmpVersion(x.version, v) === 0);
    if (prev) { if (date < prev.date) Object.assign(prev, { date, sha, repo }); } else list.push({ version: v, date, repo, sha });
  };
  const commitBySha = new Map();
  for (const r of repos) for (const c of r.commits) commitBySha.set(`${r.name}:${c.sha}`, c);

  // Per-commit internal bumps.
  const bumps = [];
  const releaseCommits = [];
  for (const r of repos) {
    const fileToName = new Map(r.inv.packages.map((p) => [p.file, p.name]));
    for (const [sha, files] of r.manifests) {
      const c = commitBySha.get(`${r.name}:${sha}`);
      if (!c) continue;
      for (const [file, { removed, added }] of files) {
        if (removed.has('version') && added.has('version')) {
          let name = fileToName.get(file) ?? added.get('name');
          if (!name) name = tryJson(tryGit(r.path, ['show', `${sha}:${file}`]))?.name;
          if (name && isInternal(name)) {
            addRelease(name, added.get('version'), c.date, r.name, sha);
            releaseCommits.push({ repo: r.name, sha, date: c.date, pkg: name, version: added.get('version') });
          }
        }
        for (const [dep, to] of added) {
          // Skip self-references (a playground or docs package depending on its own repo's package).
          if (dep === 'version' || dep === 'name' || !isInternal(dep) || !removed.has(dep) || producerOf.get(dep) === r.name) continue;
          const from = removed.get(dep);
          const vf = minVersion(from), vt = minVersion(to);
          if (!vf || !vt || from === to) continue;
          const direction = cmpVersion(vt, vf) > 0 ? 'up' : cmpVersion(vt, vf) < 0 ? 'down' : 'range';
          if (direction === 'range') continue;
          bumps.push({ repo: r.name, sha, date: c.date, file, pkg: dep, from, to, direction, bot: isBot(c), subject: c.subject });
        }
      }
    }
    for (const t of r.tags) {
      const m = t.name.match(/^(?:(.+)@)?v?(\d+\.\d+\.\d+)$/);
      if (!m) continue;
      const publics = r.inv.packages.filter((p) => p.name && !p.private);
      const pkg = m[1] ?? (publics.length === 1 ? publics[0].name : null);
      if (pkg && t.date >= since) addRelease(pkg, m[2], t.date, r.name, null);
    }
  }
  // Collapse bumps: one per (repo, sha, pkg) — a commit touching several manifests counts once.
  const bumpKey = new Map();
  for (const b of bumps) { const k = `${b.repo}:${b.sha}:${b.pkg}`; if (!bumpKey.has(k)) bumpKey.set(k, b); }
  const uniqueBumps = [...bumpKey.values()].sort((x, y) => x.date.localeCompare(y.date));
  const bumpCommitKeys = new Set(uniqueBumps.map((b) => `${b.repo}:${b.sha}`));
  const releaseDate = (pkg, v) => releases.get(pkg)?.find((x) => cmpVersion(x.version, v) === 0)?.date ?? null;
  for (const b of uniqueBumps) {
    const rd = b.direction === 'up' ? releaseDate(b.pkg, minVersion(b.to)) : null;
    b.lagDays = rd && b.date >= rd ? round(days(rd, b.date)) : null;
  }

  // Consumers: which analysed repos depend (at HEAD) on which internal packages.
  const consumers = [];
  for (const r of repos) {
    const seen = new Set();
    for (const p of r.inv.packages) for (const [dep, range] of Object.entries(p.deps)) {
      if (!isInternal(dep) || producerOf.get(dep) === r.name || seen.has(dep)) continue;
      seen.add(dep);
      consumers.push({ repo: r.name, pkg: dep, range, producer: producerOf.get(dep) ?? null, file: p.file });
    }
  }
  const consumedPkgs = new Set(consumers.map((c) => c.pkg));
  // Packages also consumed outside the analysed repos keep their releases in a monorepo, so those are not costed.
  const isPublic = (pkg) => config.publicPackages === true || (Array.isArray(config.publicPackages) && config.publicPackages.includes(pkg));
  const consumedReleases = releaseCommits.filter((x) => consumedPkgs.has(x.pkg) && !isPublic(x.pkg));
  // Dedupe release commits per (repo, sha).
  const relSeen = new Set();
  const releaseEvents = consumedReleases.filter((x) => { const k = `${x.repo}:${x.sha}:${x.pkg}`; if (relSeen.has(k)) return false; relSeen.add(k); return true; });

  // Drift at HEAD.
  const latestVersion = (pkg) => {
    const fromReleases = releases.get(pkg)?.map((x) => x.version) ?? [];
    const head = repos.flatMap((r) => r.inv.packages).filter((p) => p.name === pkg).map((p) => minVersion(p.version)).filter(Boolean);
    return [...fromReleases, ...head].sort(cmpVersion).at(-1) ?? null;
  };
  const drift = consumers.map((c) => {
    const cur = minVersion(c.range), latest = latestVersion(c.pkg);
    if (!cur || !latest || /^workspace:|^(file|link|portal):/.test(c.range)) return null;
    return { ...c, current: vstr(cur), latest: vstr(latest), majorsBehind: latest[0] - cur[0], behind: cmpVersion(latest, cur) > 0 };
  }).filter(Boolean);
  const skew = [];
  for (const pkg of consumedPkgs) {
    const majors = new Map();
    for (const d of drift.filter((x) => x.pkg === pkg)) {
      const maj = d.current.split('.')[0];
      if (!majors.has(maj)) majors.set(maj, []);
      majors.get(maj).push(d.repo);
    }
    if (majors.size > 1) skew.push({ pkg, majors: Object.fromEntries(majors) });
  }

  // ---------- bugs and duplicated work ----------
  const all = repos.flatMap((r) => r.commits).sort((x, y) => x.date.localeCompare(y.date));
  const used = new Set();
  const key = (c) => `${c.repo}:${c.sha}`;
  const ev = (c) => ({ repo: c.repo, sha: c.sha.slice(0, 10), date: c.date.slice(0, 10), subject: c.subject });
  const bugs = [];

  // 1. dependency-regression (high): downgrade of an internal dependency, or revert of a bump commit.
  for (const c of all) {
    const downs = uniqueBumps.filter((b) => b.repo === c.repo && b.sha === c.sha && b.direction === 'down');
    const rev = c.subject.match(/^Revert "(.+)"$/);
    const revertsBump = rev && all.some((o) => o.repo === c.repo && o.subject === rev[1] && bumpCommitKeys.has(key(o)) && o.date <= c.date);
    if (!downs.length && !revertsBump) continue;
    used.add(key(c));
    bugs.push({
      category: 'dependency-regression', confidence: 'high', repos: [c.repo],
      title: downs.length ? `${c.repo} rolled back ${downs.map((d) => `${d.pkg} ${d.from} → ${d.to}`).join(', ')}` : `${c.repo} reverted an internal dependency bump`,
      why: 'An internal release broke a consumer after it shipped. In a monorepo the producer change runs the consumer\'s tests before merge.',
      commits: [ev(c)],
    });
  }

  // 2. Groups: the same change in several repos (shared ticket, or near-identical subject).
  const candidates = all.filter((c) => !used.has(key(c)) && !bumpCommitKeys.has(key(c)) && !RELEASE.test(c.subject));
  const parent = new Map(candidates.map((c) => [key(c), key(c)]));
  const find = (k) => { while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k); } return k; };
  const union = (x, y) => parent.set(find(x), find(y));
  const linkedBy = new Map();
  const byTicket = new Map();
  for (const c of candidates) for (const t of ticketsOf(`${c.subject}\n${c.body}`)) {
    if (!byTicket.has(t)) byTicket.set(t, []);
    byTicket.get(t).push(c);
  }
  for (const [t, list] of byTicket) {
    if (new Set(list.map((c) => c.repo)).size < 2) continue;
    for (const c of list.slice(1)) union(key(c), key(list[0]));
    for (const c of list) { linkedBy.set(key(c), 'ticket'); c.ticket ??= t; }
  }
  const norm = new Map(candidates.map((c) => [key(c), normalizeSubject(c.subject)]));
  for (let i = 0; i < candidates.length; i++) {
    const ci = candidates[i];
    const ni = norm.get(key(ci));
    if (GENERIC.has(ni)) continue;
    for (let j = i + 1; j < candidates.length; j++) {
      const cj = candidates[j];
      if (days(ci.date, cj.date) > a.groupWindowDays) break;
      if (cj.repo === ci.repo) continue;
      if (similarity(ni, norm.get(key(cj))) >= a.similarity) {
        union(key(ci), key(cj));
        if (!linkedBy.has(key(ci))) linkedBy.set(key(ci), 'similar');
        if (!linkedBy.has(key(cj))) linkedBy.set(key(cj), 'similar');
      }
    }
  }
  const groupsMap = new Map();
  for (const c of candidates) {
    if (!linkedBy.has(key(c))) continue;
    const root = find(key(c));
    if (!groupsMap.has(root)) groupsMap.set(root, []);
    groupsMap.get(root).push(c);
  }
  const coordinated = [], duplicatedTooling = [];
  for (const list of groupsMap.values()) {
    const groupRepos = [...new Set(list.map((c) => c.repo))];
    if (groupRepos.length < 2) continue;
    // Groups spanning more than the window are usually unrelated commits sharing a long-lived ticket.
    if (days(list[0].date, list.at(-1).date) > a.groupWindowDays * 2) continue;
    for (const c of list) used.add(key(c));
    const via = list.some((c) => linkedBy.get(key(c)) === 'ticket') ? 'ticket' : 'similar';
    const ticket = list.find((c) => c.ticket)?.ticket ?? null;
    const commitsEv = list.map(ev);
    const isFix = list.some((c) => isFixSubject(c.subject));
    const configOnly = list.every((c) => (c.files.length && c.files.every((f) => CONFIG_FILE.test(f))) || DEPS_CHORE.test(c.subject));
    const title = ticket && !list[0].subject.includes(ticket) ? `${ticket}: ${list[0].subject}` : list[0].subject;
    if (isFix) {
      const dup = via === 'similar' || list.filter((c) => isFixSubject(c.subject)).every((c, _, arr) => similarity(normalizeSubject(c.subject), normalizeSubject(arr[0].subject)) >= a.similarity);
      bugs.push(dup
        ? { category: 'duplicated-fix', confidence: 'medium', repos: groupRepos, title, why: `The same fix was applied in ${groupRepos.length} repos: duplicated code, or a shared contract that has to be fixed everywhere.`, commits: commitsEv, copies: groupRepos.length }
        : { category: 'cross-repo-fix', confidence: 'medium', repos: groupRepos, title, why: `One bug needed coordinated fixes in ${groupRepos.length} repos (linked by ${ticket ?? 'subject'}); the contract between them lives in no single repo.`, commits: commitsEv });
    } else if (configOnly) {
      duplicatedTooling.push({ repos: groupRepos, title, commits: commitsEv, copies: groupRepos.length, bot: list.every(isBot) });
    } else {
      coordinated.push({ repos: groupRepos, title, via, ticket, commits: commitsEv });
    }
  }

  // 3. Single-commit fixes linked to an internal bump.
  for (const c of all) {
    if (used.has(key(c)) || !isFixSubject(c.subject) && !(FIX_WORD.test(c.body) && !DEPS_CHORE.test(c.subject))) continue;
    const ownUps = uniqueBumps.filter((b) => b.repo === c.repo && b.sha === c.sha && b.direction === 'up');
    if (ownUps.length) {
      used.add(key(c));
      bugs.push({
        category: 'fix-propagation', confidence: 'medium', repos: [c.repo, ...new Set(ownUps.map((b) => producerOf.get(b.pkg)).filter(Boolean))],
        title: `${c.subject}`, why: `The fix reached ${c.repo} only after a release of ${ownUps.map((b) => b.pkg).join(', ')} and a version bump.`,
        commits: [ev(c)],
      });
      continue;
    }
    if (bumpCommitKeys.has(key(c))) continue;
    const prior = uniqueBumps.filter((b) => b.repo === c.repo && b.direction === 'up' && b.date <= c.date && days(b.date, c.date) <= a.bumpFixWindowDays);
    if (!prior.length) continue;
    const text = `${c.subject}\n${c.body}`.toLowerCase();
    const mentions = prior.find((b) => text.includes(b.pkg.toLowerCase()) || (b.pkg.split('/').pop().length >= 4 && new RegExp(`\\b${b.pkg.split('/').pop().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)));
    const lastMajor = prior.findLast((b) => minVersion(b.to)[0] > minVersion(b.from)[0]);
    const confidence = mentions || COMPAT.test(text) ? 'medium' : lastMajor && days(lastMajor.date, c.date) <= 2 ? 'low' : null;
    if (!confidence) continue;
    used.add(key(c));
    const b = mentions ?? (confidence === 'low' ? lastMajor : prior.at(-1));
    bugs.push({
      category: 'post-bump-fix', confidence, repos: [c.repo, producerOf.get(b.pkg)].filter(Boolean),
      title: c.subject, why: `Fix landed ${round(days(b.date, c.date))} days after ${c.repo} bumped ${b.pkg} ${b.from} → ${b.to}${mentions ? ' and names that package' : COMPAT.test(text) ? ' and describes a compatibility break' : ''}.`,
      commits: [{ ...ev(commitBySha.get(`${b.repo}:${b.sha}`)), evidenceOnly: true }, ev(c)],
    });
  }

  // ---------- cost model ----------
  const perRepoCi = {};
  for (const r of repos) {
    const ci = config.ci?.[r.name];
    const landed = r.commits.length || 1;
    perRepoCi[r.name] = ci && ci.totalMinutes > 0
      ? { minutesPerCommit: ci.totalMinutes / Math.max(ci.commits ?? landed, 1), source: 'measured', runs: ci.runs ?? null, totalMinutes: ci.totalMinutes }
      : { minutesPerCommit: a.ciMinutesPerCommit, source: 'assumed' };
  }
  const ciMin = (repo, n = 1) => n * (perRepoCi[repo]?.minutesPerCommit ?? a.ciMinutesPerCommit);
  const conf = { low: ['high'], expected: ['high', 'medium'], high: ['high', 'medium', 'low'] };
  const lines = (scenario) => {
    const out = [];
    // A bump that is itself counted as a fix-propagation bug is costed once, as the bug.
    const ownBug = new Set(bugs.filter((b) => b.category === 'fix-propagation').flatMap((b) => b.commits.map((c) => `${c.repo}:${c.sha}`)));
    const costedBumps = uniqueBumps.filter((b) => b.direction === 'up' && !ownBug.has(`${b.repo}:${b.sha.slice(0, 10)}`));
    const humanBumps = costedBumps.filter((b) => !b.bot);
    const botBumps = costedBumps.filter((b) => b.bot);
    const bumpCommitSet = (list) => [...new Set(list.map((b) => `${b.repo}:${b.sha}`))].map((k) => k.split(':')[0]);
    out.push({ key: 'bumps', label: 'Internal dependency bumps', count: humanBumps.length + botBumps.length,
      hours: humanBumps.length * a.bumpHumanHours + botBumps.length * a.bumpBotHours,
      ciMinutes: bumpCommitSet(costedBumps).reduce((s, repo) => s + ciMin(repo), 0) });
    out.push({ key: 'releases', label: 'Internal releases consumed by sibling repos', count: releaseEvents.length,
      hours: releaseEvents.length * a.releaseHours, ciMinutes: releaseEvents.reduce((s, x) => s + ciMin(x.repo), 0) });
    out.push({ key: 'coordination', label: 'Changes coordinated across repos', count: coordinated.length,
      hours: coordinated.reduce((s, g) => s + (g.repos.length - 1) * a.coordinationHoursPerExtraRepo, 0),
      ciMinutes: coordinated.reduce((s, g) => s + g.commits.filter((c) => c.repo !== g.commits[0].repo).reduce((t, c) => t + ciMin(c.repo), 0), 0) });
    out.push({ key: 'duplicatedTooling', label: 'Same tooling/dependency maintenance repeated per repo', count: duplicatedTooling.length,
      hours: duplicatedTooling.reduce((s, g) => s + (g.copies - 1) * (g.bot ? a.bumpBotHours : a.duplicateChangeHoursPerCopy), 0),
      ciMinutes: duplicatedTooling.reduce((s, g) => s + g.commits.filter((c) => c.repo !== g.commits[0].repo).reduce((t, c) => t + ciMin(c.repo), 0), 0) });
    for (const cat of ['dependency-regression', 'post-bump-fix', 'fix-propagation', 'duplicated-fix', 'cross-repo-fix']) {
      const list = bugs.filter((b) => b.category === cat && conf[scenario].includes(b.confidence));
      out.push({ key: cat, label: `Bugs: ${cat}`, count: list.length,
        hours: list.reduce((s, b) => s + a.bugHours + (b.copies ? (b.copies - 1) * a.duplicateChangeHoursPerCopy : 0), 0),
        ciMinutes: list.reduce((s, b) => s + b.commits.filter((c) => !c.evidenceOnly).reduce((t, c) => t + ciMin(c.repo), 0), 0) });
    }
    const yearly = 365 / windowDays;
    for (const l of out) {
      l.cost = l.hours * rates.developerHourly + l.ciMinutes * rates.ciPerMinute;
      l.savingsShare = SAVINGS[l.key];
      l.annualCost = l.cost * yearly;
      l.annualSavings = l.annualCost * l.savingsShare;
    }
    const sum = (f) => out.reduce((s, l) => s + l[f], 0);
    return {
      lines: out.map((l) => ({ ...l, hours: round(l.hours), ciMinutes: Math.round(l.ciMinutes), cost: Math.round(l.cost), annualCost: Math.round(l.annualCost), annualSavings: Math.round(l.annualSavings) })),
      totals: { hours: round(sum('hours')), ciMinutes: Math.round(sum('ciMinutes')), cost: Math.round(sum('cost')), annualCost: Math.round(sum('annualCost')), annualSavings: Math.round(sum('annualSavings')),
        devCost: Math.round(sum('hours') * rates.developerHourly), ciCost: Math.round(sum('ciMinutes') * rates.ciPerMinute) },
    };
  };
  const scenarios = { low: lines('low'), expected: lines('expected'), high: lines('high') };

  // ---------- migration facts ----------
  const edges = new Map();
  const edge = (x, y) => { const k = [x, y].sort().join(' ↔ '); if (!edges.has(k)) edges.set(k, { repos: [x, y].sort(), dependencies: 0, bumps: 0, sharedChanges: 0, sharedTooling: 0, bugs: 0 }); return edges.get(k); };
  for (const c of consumers) if (c.producer) edge(c.repo, c.producer).dependencies++;
  for (const b of uniqueBumps) { const p = producerOf.get(b.pkg); if (p && p !== b.repo) edge(b.repo, p).bumps++; }
  const pairs = (rs) => rs.flatMap((x, i) => rs.slice(i + 1).map((y) => [x, y]));
  for (const g of coordinated) for (const [x, y] of pairs(g.repos)) edge(x, y).sharedChanges++;
  // Repeated tooling is a cost, but every repo has tooling: it is shown, not used for coupling.
  for (const g of duplicatedTooling) for (const [x, y] of pairs(g.repos)) edge(x, y).sharedTooling++;
  for (const b of bugs) for (const [x, y] of pairs([...new Set(b.repos)])) edge(x, y).bugs++;
  const edgeList = [...edges.values()].filter((e) => e.dependencies + e.bumps + e.sharedChanges + e.bugs > 0).map((e) => ({ ...e, weight: e.dependencies * 2 + e.bumps + e.sharedChanges + e.bugs * 3 })).sort((x, y) => y.weight - x.weight);
  // Clusters: tooling-only links do not justify a migration on their own.
  const cp = new Map(repos.map((r) => [r.name, r.name]));
  const cf = (k) => { while (cp.get(k) !== k) k = cp.get(k); return k; };
  for (const e of edgeList) if (e.dependencies || e.bumps || e.bugs || e.sharedChanges >= 2) cp.set(cf(e.repos[0]), cf(e.repos[1]));
  const clusterMap = new Map();
  for (const r of repos) { const k = cf(r.name); if (!clusterMap.has(k)) clusterMap.set(k, []); clusterMap.get(k).push(r.name); }
  const clusters = [...clusterMap.values()].map((members) => ({
    repos: members.sort(), weight: edgeList.filter((e) => members.includes(e.repos[0]) && members.includes(e.repos[1])).reduce((s, e) => s + e.weight, 0),
  })).sort((x, y) => y.weight - x.weight || y.repos.length - x.repos.length);
  const isolated = clusters.filter((c) => c.repos.length === 1).map((c) => c.repos[0]);

  // External dependency conflicts (different majors across repos) — alignment work before a single lockfile.
  const ext = new Map();
  for (const r of repos) for (const p of r.inv.packages) for (const [dep, range] of Object.entries(p.deps)) {
    if (isInternal(dep)) continue;
    const v = minVersion(range);
    if (!v) continue;
    if (!ext.has(dep)) ext.set(dep, new Map());
    const m = ext.get(dep);
    if (!m.has(v[0])) m.set(v[0], new Set());
    m.get(v[0]).add(r.name);
  }
  const conflicts = [...ext].filter(([, m]) => m.size > 1)
    .map(([dep, m]) => ({ dep, majors: Object.fromEntries([...m].map(([k, s]) => [k, [...s].sort()])), repos: new Set([...m.values()].flatMap((s) => [...s])).size }))
    .sort((x, y) => y.repos - x.repos || x.dep.localeCompare(y.dep));

  const langs = {};
  for (const r of repos) for (const [l, n] of Object.entries(r.inv.languages)) langs[l] = (langs[l] ?? 0) + n;
  const langNames = Object.keys(langs).sort((x, y) => langs[y] - langs[x]);
  const tools = new Set(repos.flatMap((r) => r.inv.buildTools));
  const recommendedTool = langNames.length === 0 ? 'unknown'
    : langNames.every((l) => l === 'js/ts') ? (tools.has('nx') ? 'Nx (already used) on pnpm workspaces' : tools.has('turbo') ? 'Turborepo (already used) on pnpm workspaces' : 'pnpm workspaces + Nx or Turborepo')
      : langNames.every((l) => l === 'java/kotlin') ? 'Gradle composite build, or Bazel for very large graphs'
        : tools.has('bazel') ? 'Bazel (already used)' : 'Nx (polyglot plugins) or Bazel';

  const migrateRepos = repos.filter((r) => !isolated.includes(r.name) || repos.length === 1);
  const migrationDays = migrateRepos.length * a.migrationDaysPerRepo + conflicts.length * a.migrationDaysPerConflict;
  const migrationCost = Math.round(migrationDays * 8 * rates.developerHourly);
  const payback = (s) => {
    const monthly = s.totals.annualSavings / 12 - a.monorepoToolingMonthly;
    return monthly > 0 ? round(migrationCost / monthly) : null;
  };

  return {
    version: 1,
    generatedAt: now,
    window: { since, until: now.slice(0, 10), days: Math.round(windowDays) },
    rates, assumptions: a, problems, publicPackages: config.publicPackages ?? [],
    repos: repos.map((r) => ({
      name: r.name, github: r.github, commits: r.commits.length,
      packages: r.inv.packages.filter((p) => p.name).map((p) => ({ name: p.name, version: p.version, private: p.private })),
      languages: r.inv.languages, packageManager: r.inv.packageManager, buildTools: r.inv.buildTools, ciFiles: r.inv.ci, nodeVersion: r.inv.nodeVersion, ci: perRepoCi[r.name],
    })),
    internal: {
      packages: [...producerOf].filter(([n]) => consumedPkgs.has(n)).map(([pkg, repo]) => ({ pkg, repo, consumers: consumers.filter((c) => c.pkg === pkg).map((c) => c.repo) })),
      bumps: uniqueBumps.map(({ subject, ...b }) => ({ ...b, sha: b.sha.slice(0, 10), date: b.date.slice(0, 10) })),
      releases: releaseEvents.map((x) => ({ ...x, sha: x.sha.slice(0, 10), date: x.date.slice(0, 10) })),
      medianBumpLagDays: median(uniqueBumps.map((b) => b.lagDays).filter((x) => x !== null)),
      drift: drift.filter((d) => d.behind), skew,
    },
    bugs: bugs.map((b, i) => ({ id: `B${i + 1}`, ...b })),
    coordinated, duplicatedTooling,
    cost: scenarios,
    migration: {
      recommendedTool, languages: langs, clusters, isolated, coupling: edgeList.filter((e) => e.weight > 0), externalConflicts: conflicts,
      oneTime: { days: round(migrationDays), cost: migrationCost, repos: migrateRepos.map((r) => r.name) },
      paybackMonths: { low: payback(scenarios.low), expected: payback(scenarios.expected), high: payback(scenarios.high) },
    },
  };
}

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
}

// ---------- rendering ----------

export function renderMarkdown(r) {
  const cur = r.rates.currency === 'USD' ? '$' : `${r.rates.currency} `;
  const money = (n) => `${cur}${Math.round(n).toLocaleString('en-US')}`;
  const e = r.cost.expected;
  const md = [];
  md.push('# Polyrepo Tax Report', '');
  md.push(`**Repos:** ${r.repos.length} · **Window:** ${r.window.since} → ${r.window.until} (${r.window.days} days) · **Rates:** ${money(r.rates.developerHourly)}/dev-hour, ${cur}${r.rates.ciPerMinute}/CI-minute`, '');
  md.push(`**Polyrepo tax in this window (expected):** ${money(e.totals.cost)} — ${e.totals.hours} developer hours (${money(e.totals.devCost)}) + ${e.totals.ciMinutes.toLocaleString('en-US')} CI minutes (${money(e.totals.ciCost)})`, '');
  md.push(`**Annualized:** ${money(r.cost.low.totals.annualCost)} – ${money(r.cost.high.totals.annualCost)} (expected ${money(e.totals.annualCost)}); a monorepo would recover about ${money(e.totals.annualSavings)}/year.`, '');
  const pb = r.migration.paybackMonths;
  md.push(`**Migration:** ~${r.migration.oneTime.days} dev-days (${money(r.migration.oneTime.cost)}) for ${r.migration.oneTime.repos.length} repos → payback ${pb.expected === null ? 'not reached' : `~${pb.expected} months`} (range ${pb.high ?? '—'}–${pb.low ?? 'never'}).`, '');
  const bugCount = (s) => r.bugs.filter((b) => s.includes(b.confidence)).length;
  md.push(`**Polyrepo-attributable bugs:** ${bugCount(['high'])} high-confidence · ${bugCount(['medium'])} medium · ${bugCount(['low'])} low`, '');
  if (r.problems.length) md.push('> **Data problems:** ' + r.problems.join('; '), '');
  md.push('These are estimates from git history, not invoices. Every count links to commits below; every rate and assumption is listed at the end and can be overridden.', '');

  md.push('## Where the time goes (expected scenario)', '');
  md.push('| Cost driver | Events | Dev hours | CI minutes | Cost (window) | Annualized | Monorepo removes |', '|---|---:|---:|---:|---:|---:|---:|');
  for (const l of e.lines) md.push(`| ${l.label} | ${l.count} | ${l.hours} | ${l.ciMinutes.toLocaleString('en-US')} | ${money(l.cost)} | ${money(l.annualCost)} | ${Math.round(l.savingsShare * 100)}% |`);
  md.push(`| **Total** | | **${e.totals.hours}** | **${e.totals.ciMinutes.toLocaleString('en-US')}** | **${money(e.totals.cost)}** | **${money(e.totals.annualCost)}** | **${money(e.totals.annualSavings)}/yr** |`, '');
  md.push('| Scenario | Counts | Window cost | Annualized | Annual savings | Payback |', '|---|---|---:|---:|---:|---:|');
  for (const [k, label] of [['low', 'high-confidence bugs only'], ['expected', 'high + medium'], ['high', 'high + medium + low']]) {
    const s = r.cost[k];
    md.push(`| ${k} | ${label} | ${money(s.totals.cost)} | ${money(s.totals.annualCost)} | ${money(s.totals.annualSavings)} | ${pb[k] === null ? '—' : `${pb[k]} mo`} |`);
  }
  md.push('');

  md.push('## Bugs attributable to repo boundaries', '');
  if (!r.bugs.length) md.push('None found in this window.', '');
  for (const conf of ['high', 'medium', 'low']) {
    const list = r.bugs.filter((b) => b.confidence === conf);
    if (!list.length) continue;
    md.push(`### ${conf[0].toUpperCase()}${conf.slice(1)} confidence (${list.length})`, '');
    for (const b of list) {
      md.push(`- **${b.id} · \`${b.category}\`** — ${b.title} _(${[...new Set(b.repos)].join(', ')})_`);
      md.push(`  - ${b.why}`);
      for (const c of b.commits) md.push(`  - \`${c.repo}@${c.sha}\` ${c.date} — ${c.subject}`);
    }
    md.push('');
  }

  md.push('## Internal dependency churn', '');
  const ib = r.internal;
  const ups = ib.bumps.filter((b) => b.direction === 'up');
  md.push(`- **${ups.length}** internal bump commits (${ups.filter((b) => b.bot).length} by bots, ${ups.filter((b) => !b.bot).length} by people); **${ib.bumps.filter((b) => b.direction === 'down').length}** downgrade(s).`);
  md.push(`- **${ib.releases.length}** internal releases existed to move code between repos${r.publicPackages?.length || r.publicPackages === true ? ' (releases of packages marked public are not counted)' : ''}.`);
  md.push(`- Median lag from release to consumer bump: **${ib.medianBumpLagDays ?? 'n/a'}** days.`);
  if (ib.drift.length) md.push(`- **${ib.drift.length}** consumer(s) behind the latest internal version today; ${ib.drift.filter((d) => d.majorsBehind > 0).length} at least a major version behind.`);
  md.push('');
  if (ib.packages.length) {
    md.push('| Internal package | Producer | Consumers | Bumps | Releases |', '|---|---|---|---:|---:|');
    for (const p of ib.packages) md.push(`| \`${p.pkg}\` | ${p.repo} | ${p.consumers.join(', ')} | ${ups.filter((b) => b.pkg === p.pkg).length} | ${ib.releases.filter((x) => x.pkg === p.pkg).length} |`);
    md.push('');
  }
  if (ib.skew.length) {
    md.push('**Version skew today** (the same internal package at different majors):', '');
    for (const s of ib.skew) md.push(`- \`${s.pkg}\`: ${Object.entries(s.majors).map(([m, rs]) => `v${m} in ${rs.join(', ')}`).join(' · ')}`);
    md.push('');
  }

  if (r.coordinated.length || r.duplicatedTooling.length) {
    md.push('## Duplicated and coordinated work', '');
    for (const g of r.coordinated.slice(0, 15)) md.push(`- **Coordinated change** (${g.repos.join(', ')}): ${g.title} — ${g.commits.map((c) => `\`${c.repo}@${c.sha}\``).join(', ')}`);
    for (const g of r.duplicatedTooling.slice(0, 15)) md.push(`- **Repeated maintenance** ×${g.copies}${g.bot ? ' (bot)' : ''}: ${g.title} — ${g.commits.map((c) => `\`${c.repo}@${c.sha}\``).join(', ')}`);
    const more = Math.max(0, r.coordinated.length - 15) + Math.max(0, r.duplicatedTooling.length - 15);
    if (more) md.push(`- …and ${more} more in the JSON report.`);
    md.push('');
  }

  const m = r.migration;
  md.push('## Migration plan inputs', '');
  md.push(`**Recommended tooling:** ${m.recommendedTool} (languages by file count: ${Object.entries(m.languages).map(([l, n]) => `${l} ${n}`).join(', ') || 'none detected'})`, '');
  md.push('**Clusters** (repos that change together; migrate the heaviest first):', '');
  m.clusters.filter((c) => c.repos.length > 1).forEach((c, i) => md.push(`${i + 1}. ${c.repos.join(', ')} — coupling weight ${c.weight}`));
  if (m.isolated.length) md.push('', `**No measured coupling — keep separate unless there is another reason:** ${m.isolated.join(', ')}`);
  md.push('');
  if (m.coupling.length) {
    md.push('| Repo pair | Internal deps | Bumps | Coordinated changes | Bugs | Weight | Repeated tooling (not weighted) |', '|---|---:|---:|---:|---:|---:|---:|');
    for (const c of m.coupling.slice(0, 20)) md.push(`| ${c.repos.join(' ↔ ')} | ${c.dependencies} | ${c.bumps} | ${c.sharedChanges} | ${c.bugs} | ${c.weight} | ${c.sharedTooling} |`);
    md.push('');
  }
  if (m.externalConflicts.length) {
    md.push(`**External dependencies to align before sharing one lockfile** (${m.externalConflicts.length}):`, '');
    for (const c of m.externalConflicts.slice(0, 15)) md.push(`- \`${c.dep}\`: ${Object.entries(c.majors).map(([v, rs]) => `v${v} (${rs.join(', ')})`).join(' · ')}`);
    if (m.externalConflicts.length > 15) md.push(`- …and ${m.externalConflicts.length - 15} more in the JSON report.`);
    md.push('');
  }

  md.push('## Assumptions', '');
  md.push('| Assumption | Value |', '|---|---|');
  for (const [k, v] of Object.entries(r.assumptions)) md.push(`| \`${k}\` | ${v} |`);
  md.push(`| \`developerHourly\` | ${money(r.rates.developerHourly)} |`, `| \`ciPerMinute\` | ${cur}${r.rates.ciPerMinute} |`, '');
  md.push('| Repo | Commits | CI minutes/commit | CI source |', '|---|---:|---:|---|');
  for (const repo of r.repos) md.push(`| ${repo.name} | ${repo.commits} | ${round(repo.ci.minutesPerCommit)} | ${repo.ci.source} |`);
  md.push('');
  return md.join('\n');
}

// ---------- CLI ----------

function parseArgs(argv) {
  const opts = { repos: [], internalScopes: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--config') opts.config = next();
    else if (a === '--out') opts.out = next();
    else if (a === '--since') opts.since = next();
    else if (a === '--scope') opts.internalScopes.push(next());
    else if (a === '--rate') opts.rate = Number(next());
    else if (a === '--ci-rate') opts.ciRate = Number(next());
    else if (a === '--ci') opts.ci = next();
    else if (a === '--overrides') opts.overrides = next();
    else if (a === '--now') opts.now = next();
    else if (a === '--public') (opts.publicPackages ??= []).push(next());
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else opts.repos.push(a);
  }
  return opts;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    let config = { repos: [], internalScopes: [] };
    if (opts.config) {
      config = JSON.parse(fs.readFileSync(opts.config, 'utf8'));
      config.baseDir = path.dirname(path.resolve(opts.config));
    }
    if (opts.repos.length) config.repos = [...(config.repos ?? []), ...opts.repos];
    if (opts.internalScopes.length) config.internalScopes = [...(config.internalScopes ?? []), ...opts.internalScopes];
    if (opts.since) config.since = opts.since;
    if (opts.now) config.now = opts.now;
    if (opts.publicPackages) config.publicPackages = opts.publicPackages.includes('*') ? true : [...(Array.isArray(config.publicPackages) ? config.publicPackages : []), ...opts.publicPackages];
    config.rates = { ...config.rates };
    if (opts.rate) config.rates.developerHourly = opts.rate;
    if (opts.ciRate) config.rates.ciPerMinute = opts.ciRate;
    const ciPath = opts.ci ?? (typeof config.ci === 'string' ? path.resolve(config.baseDir ?? '.', config.ci) : null);
    if (ciPath) config.ci = JSON.parse(fs.readFileSync(ciPath, 'utf8'));
    const ovPath = opts.overrides ?? (typeof config.overrides === 'string' ? path.resolve(config.baseDir ?? '.', config.overrides) : null);
    if (ovPath) config.overrides = JSON.parse(fs.readFileSync(ovPath, 'utf8'));
    if (!config.repos?.length) throw new Error('no repositories given (pass paths or --config)');
    const report = analyze(config);
    const out = path.resolve(opts.out ?? path.join(os.tmpdir(), 'polyrepo-tax-reports'));
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'polyrepo-tax-report.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(out, 'polyrepo-tax-report.md'), renderMarkdown(report));
    fs.writeFileSync(path.join(out, 'polyrepo-tax-report.html'), renderHtml(report));
    const e = report.cost.expected.totals;
    console.log(`wrote ${path.join(out, 'polyrepo-tax-report')}.{md,json,html}`);
    console.log(`expected: ${e.hours} dev hours + ${e.ciMinutes} CI minutes = ${report.rates.currency} ${e.cost} in ${report.window.days} days; ${report.bugs.length} candidate bugs`);
    for (const p of report.problems) console.error(`WARN: ${p}`);
  } catch (err) {
    console.error(`polyrepo-tax: ${err.message}`);
    process.exit(2);
  }
}
