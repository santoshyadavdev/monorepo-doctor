#!/usr/bin/env node
// Collects GitHub Actions minutes per repository for polyrepo-tax. Read-only: only `gh api` GET requests.
// Usage: node fetch-ci.mjs --config polyrepo-tax.config.json [--since 2025-11-25] [--sample 30] [--out ci.json]
//        node fetch-ci.mjs --repo name=owner/repo [--repo ...] --since 2025-11-25 --out ci.json
// Total = wall-clock minutes of every completed run in the window. Runs fan out into parallel jobs that are
// billed separately, so job minutes are sampled for up to --sample runs per repo and the total is scaled
// by the sampled job/wall ratio.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const gh = (args) => execFileSync('gh', ['api', '-X', 'GET', ...args], { encoding: 'utf8', maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'pipe'] });
const minutes = (a, b) => Math.max(0, (Date.parse(b) - Date.parse(a)) / 60000);

// The runs API returns at most 1000 results per filtered query, so query one month at a time.
export function monthRanges(since, until) {
  const out = [];
  let start = new Date(`${since}T00:00:00Z`);
  const end = new Date(`${until}T00:00:00Z`);
  while (start < end) {
    const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    const stop = next < end ? next : end;
    out.push(`${start.toISOString().slice(0, 10)}..${new Date(stop - 86_400_000).toISOString().slice(0, 10)}`);
    start = stop;
  }
  return out;
}

export function fetchRepo(slug, since, until, sample) {
  const runs = [];
  for (const range of monthRanges(since, until)) {
    const out = gh([`repos/${slug}/actions/runs`, '-f', `created=${range}`, '-f', 'per_page=100', '-f', 'status=completed', '--paginate',
      '--jq', '.workflow_runs[] | [.id, .run_started_at, .updated_at, .event, .name] | @tsv']);
    for (const line of out.split('\n').filter(Boolean)) {
      const [id, started, updated, event, name] = line.split('\t');
      runs.push({ id, wall: minutes(started, updated), event, name });
    }
  }
  const wall = runs.reduce((s, r) => s + r.wall, 0);
  let ratio = 1, sampled = 0;
  if (sample > 0 && runs.length) {
    const step = Math.max(1, Math.floor(runs.length / sample));
    let w = 0, j = 0;
    for (let i = 0; i < runs.length && sampled < sample; i += step) {
      try {
        const jobs = gh([`repos/${slug}/actions/runs/${runs[i].id}/jobs`, '-f', 'per_page=100', '--jq', '.jobs[] | [.started_at, .completed_at] | @tsv']);
        const jm = jobs.split('\n').filter(Boolean).reduce((s, l) => { const [a, b] = l.split('\t'); return b && b !== 'null' ? s + Math.max(1, Math.ceil(minutes(a, b))) : s; }, 0);
        if (runs[i].wall > 0) { w += runs[i].wall; j += jm; sampled++; }
      } catch { /* skip runs whose jobs were deleted */ }
    }
    if (w > 0) ratio = Math.max(1, j / w);
  }
  const byWorkflow = {};
  for (const r of runs) byWorkflow[r.name] = Math.round((byWorkflow[r.name] ?? 0) + r.wall * ratio);
  return { runs: runs.length, wallMinutes: Math.round(wall), jobWallRatio: Math.round(ratio * 100) / 100, sampledRuns: sampled, totalMinutes: Math.round(wall * ratio), byWorkflow, since, until };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const repos = [];
  const config = opt('--config') ? JSON.parse(fs.readFileSync(opt('--config'), 'utf8')) : {};
  for (const r of config.repos ?? []) {
    if (typeof r === 'object' && r.github) repos.push({ name: r.name ?? path.basename(r.path).replace(/\.git$/, ''), slug: r.github });
  }
  argv.forEach((a, i) => { if (a === '--repo') { const [name, slug] = argv[i + 1].split('='); repos.push({ name, slug: slug ?? name }); } });
  const until = opt('--until') ?? new Date().toISOString().slice(0, 10);
  const since = opt('--since') ?? config.since ?? new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  const sample = Number(opt('--sample') ?? 30);
  if (!repos.length) { console.error('fetch-ci: no repos with a "github" slug (use --config or --repo name=owner/repo)'); process.exit(2); }
  const result = {};
  for (const r of repos) {
    try {
      result[r.name] = fetchRepo(r.slug, since, until, sample);
      console.error(`${r.name}: ${result[r.name].runs} runs, ${result[r.name].totalMinutes} minutes (job/wall ×${result[r.name].jobWallRatio})`);
    } catch (err) {
      console.error(`WARN ${r.name}: ${String(err.stderr || err.message).trim().split('\n')[0]} — CI cost for this repo will be assumed`);
    }
  }
  const out = opt('--out') ?? 'ci.json';
  fs.writeFileSync(out, JSON.stringify(result, null, 2));
  console.error(`wrote ${out}`);
}
