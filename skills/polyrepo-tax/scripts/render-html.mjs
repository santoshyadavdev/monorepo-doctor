#!/usr/bin/env node
// Renders a polyrepo-tax JSON report as one self-contained HTML file (no network requests).
// Usage: node render-html.mjs <polyrepo-tax-report.json> [--plan migration-plan.md] [--out report.html]
// Without --plan, a migration-plan.md next to the JSON is embedded when present.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function moneyFormatter(currency) {
  try {
    const full = new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 });
    const compact = new Intl.NumberFormat('en-US', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 });
    return { full: (n) => full.format(n), compact: (n) => (Math.abs(n) < 10_000 ? full.format(n) : compact.format(n)) };
  } catch {
    // Not an ISO 4217 code: keep only characters that are safe in HTML text and attributes.
    const label = String(currency).replace(/[^A-Za-z0-9 ._-]/g, '').slice(0, 12) || 'USD';
    const f = (n) => `${label} ${Math.round(n).toLocaleString('en-US')}`;
    return { full: f, compact: f };
  }
}
const num = (n) => Math.round(n).toLocaleString('en-US');

// One line per tool from the independent sources; null when none covers it. Never feeds the rating.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const month = (ym) => { const [y, m] = ym.split('-'); return `${MONTHS[Number(m) - 1]} ${y}`; };
export function independentSignals(ind) {
  if (!ind) return null;
  const parts = [];
  const s24 = ind.stateOfJs2024;
  if (s24) {
    const years = Object.keys(s24.satisfaction).sort();
    const pct = (y) => `${Math.round(s24.satisfaction[y] * 100)}%`;
    parts.push(`State of JS 2024 satisfaction ${pct(years.at(-1))}${years.length > 1 ? ` (${pct(years[0])} in ${years[0]})` : ''}`);
  }
  if (ind.stateOfJs2025) parts.push(`State of JS 2025 regular use ${ind.stateOfJs2025.regularUse.toLocaleString('en-US')}${ind.stateOfJs2025.writeIn ? ' (write-in)' : ''}`);
  if (ind.radar) parts.push(`Thoughtworks Radar ${ind.radar.ring} (${month(ind.radar.edition)}, archived)`);
  return parts.join(' · ');
}

// Every source behind the tool options table, monorepo.tools first: the one that is scored, and who publishes it.
export function toolSources(src, total) {
  const list = [{
    name: 'monorepo.tools', url: src.urls[1], publisher: 'published by Nx', retrieved: src.retrieved, role: 'scored',
    metric: `Feature matrix. monorepo.tools rating = 10 × features marked "${src.legend.native}" ÷ ${total}; "${src.legend.implement}" and "${src.legend.community}" are counted but not scored. The page says it aims to be objective and accepts corrections by pull request`,
    covers: 'all tools in the table; the rating and the feature columns come from it',
  }];
  for (const x of src.independent?.sources ?? []) list.push({ ...x, role: 'independent, not scored' });
  return list.map((x) => ({ ...x, metric: x.metric.replace(/\.$/, ''), covers: x.covers.replace(/\.$/, '') }));
}

// Minimal, escaped Markdown for the agent-written migration plan: headings, lists, code, tables, emphasis, links.
export function markdownToHtml(md) {
  const inline = (s) => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>');
  const out = [];
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  let list = null;
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) {
      closeList();
      const code = [];
      while (++i < lines.length && !/^```/.test(lines[i])) code.push(lines[i]);
      out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
      continue;
    }
    if (/^\|.*\|\s*$/.test(line) && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? '')) {
      closeList();
      const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()));
      const head = cells(line);
      i++;
      const rows = [];
      while (i + 1 < lines.length && /^\|.*\|\s*$/.test(lines[i + 1])) rows.push(cells(lines[++i]));
      out.push(`<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    let m;
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) { closeList(); const lvl = Math.min(m[1].length + 2, 5); out.push(`<h${lvl}>${inline(m[2])}</h${lvl}>`); continue; }
    if ((m = line.match(/^\s*([-*]|\d+\.)\s+(.*)$/))) {
      const type = /\d/.test(m[1]) ? 'ol' : 'ul';
      if (list !== type) { closeList(); out.push(`<${type}>`); list = type; }
      out.push(`<li>${inline(m[2])}</li>`);
      continue;
    }
    if (!line.trim()) { closeList(); continue; }
    closeList();
    out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  return out.join('\n');
}

export function renderHtml(r, { plan } = {}) {
  const fmt = moneyFormatter(r.rates.currency ?? 'USD');
  const e = r.cost.expected;
  const pb = r.migration.paybackMonths;
  const bugsBy = (c) => r.bugs.filter((b) => b.confidence === c);
  const repoList = r.repos.map((x) => x.name).join(', ');
  const ciMeasured = r.repos.filter((x) => x.ci?.source === 'measured').length;
  const paybackText = pb.expected === null ? 'Not reached' : pb.expected > 120 ? '10+ years' : `${pb.expected} months`;
  // Payback decides the message; weak coupling only qualifies a short payback, never contradicts it.
  const strongCluster = r.migration.clusters.some((c) => c.repos.length > 1 && c.weight >= 5);
  const verdict = pb.expected === null || pb.expected > 24
    ? { cls: 'verdict-no', text: 'The measured tax does not pay back a migration within two years. Fix the top cost drivers in place instead, or migrate only the most coupled cluster.' }
    : strongCluster
      ? { cls: 'verdict-yes', text: `Migrating the coupled repos pays back in about ${pb.expected} months at the expected estimate.` }
      : { cls: 'verdict-no', text: `Payback is about ${pb.expected} months, but no cluster has a coupling weight of 5 or more. Treat it as a small, uncertain gain: fixing the top cost drivers in place may be cheaper.` };

  // Annualized cost by driver: one series, ranked, zero rows left to the table.
  const drivers = e.lines.filter((l) => l.annualCost > 0).sort((a, b) => b.annualCost - a.annualCost);
  const max = Math.max(1, ...drivers.map((l) => l.annualCost));
  const bars = drivers.map((l) => {
    const pct = (l.annualCost / max) * 100;
    const tip = `${l.label}: ${fmt.full(l.annualCost)}/yr · ${l.count} event${l.count === 1 ? '' : 's'} · ${l.hours} dev h · ${num(l.ciMinutes)} CI min in window · monorepo removes ${Math.round(l.savingsShare * 100)}%`;
    return `<div class="bar-row" tabindex="0" data-tip="${esc(tip)}"><div class="bar-label">${esc(l.label.replace(/^Bugs: /, 'Bugs · '))}</div><div class="bar-track"><div class="bar" style="width:${pct.toFixed(2)}%"></div><span class="bar-value">${esc(fmt.compact(l.annualCost))}</span></div></div>`;
  }).join('');

  // Low / expected / high range on one axis.
  const lo = r.cost.low.totals.annualCost, ex = e.totals.annualCost, hi = r.cost.high.totals.annualCost;
  const span = Math.max(1, hi * 1.08);
  const at = (v) => `${((v / span) * 100).toFixed(2)}%`;
  const range = `<div class="range" role="img" aria-label="Annualized cost range ${esc(fmt.full(lo))} to ${esc(fmt.full(hi))}, expected ${esc(fmt.full(ex))}">
    <div class="range-axis"></div>
    <div class="range-span" style="left:${at(lo)};width:calc(${at(hi)} - ${at(lo)})"></div>
    <div class="range-dot" style="left:${at(ex)}" tabindex="0" data-tip="Expected (high + medium confidence bugs): ${esc(fmt.full(ex))}/yr"></div>
    <div class="range-tick" style="left:${at(lo)}" data-tip="Low (high-confidence bugs only): ${esc(fmt.full(lo))}/yr" tabindex="0"><span>Low ${esc(fmt.compact(lo))}</span></div>
    <div class="range-tick" style="left:${at(hi)}" data-tip="High (all bugs incl. low confidence): ${esc(fmt.full(hi))}/yr" tabindex="0"><span>High ${esc(fmt.compact(hi))}</span></div>
  </div>`;

  const costTable = `<table><thead><tr><th>Cost driver</th><th class="n">Events</th><th class="n">Dev hours</th><th class="n">CI minutes</th><th class="n">Cost (window)</th><th class="n">Annualized</th><th class="n">Monorepo removes</th></tr></thead><tbody>
    ${e.lines.map((l) => `<tr><td>${esc(l.label)}</td><td class="n">${l.count}</td><td class="n">${l.hours}</td><td class="n">${num(l.ciMinutes)}</td><td class="n">${fmt.full(l.cost)}</td><td class="n">${fmt.full(l.annualCost)}</td><td class="n">${Math.round(l.savingsShare * 100)}%</td></tr>`).join('')}
    </tbody><tfoot><tr><th>Total</th><th></th><th class="n">${e.totals.hours}</th><th class="n">${num(e.totals.ciMinutes)}</th><th class="n">${fmt.full(e.totals.cost)}</th><th class="n">${fmt.full(e.totals.annualCost)}</th><th class="n">${fmt.full(e.totals.annualSavings)}/yr</th></tr></tfoot></table>`;

  const scenarioTable = `<table><thead><tr><th>Scenario</th><th>Bugs counted</th><th class="n">Window cost</th><th class="n">Annualized</th><th class="n">Annual savings</th><th class="n">Payback</th></tr></thead><tbody>
    ${[['low', 'high confidence only'], ['expected', 'high + medium'], ['high', 'high + medium + low']].map(([k, label]) => {
      const s = r.cost[k].totals;
      return `<tr${k === 'expected' ? ' class="row-em"' : ''}><td>${k}</td><td>${label}</td><td class="n">${fmt.full(s.cost)}</td><td class="n">${fmt.full(s.annualCost)}</td><td class="n">${fmt.full(s.annualSavings)}</td><td class="n">${pb[k] === null ? '—' : `${pb[k]} mo`}</td></tr>`;
    }).join('')}</tbody></table>`;

  // Drawn with CSS: the half-filled circle glyph renders inconsistently across fonts.
  const confIcon = { high: '<span class="dot dot-high" aria-hidden="true"></span>', medium: '<span class="dot dot-medium" aria-hidden="true"></span>', low: '<span class="dot dot-low" aria-hidden="true"></span>' };
  const bugCards = r.bugs.map((b) => `<details class="bug" data-conf="${b.confidence}">
      <summary><span class="badge badge-${b.confidence}">${confIcon[b.confidence]} ${b.confidence}</span><code class="cat">${esc(b.category)}</code><span class="bug-title">${esc(b.title)}</span><span class="bug-repos">${esc([...new Set(b.repos)].join(', '))}</span></summary>
      <p>${esc(b.why)}</p>
      <ul class="commits">${b.commits.map((c) => `<li><code>${esc(c.repo)}@${esc(c.sha)}</code> <span class="muted">${esc(c.date)}</span> ${esc(c.subject)}${c.evidenceOnly ? ' <span class="muted">(context)</span>' : ''}</li>`).join('')}</ul>
    </details>`).join('');

  const ib = r.internal;
  const ups = ib.bumps.filter((b) => b.direction === 'up');
  const pkgTable = ib.packages.length ? `<table><thead><tr><th>Internal package</th><th>Producer</th><th>Consumers</th><th class="n">Bumps</th><th class="n">Releases</th></tr></thead><tbody>
    ${ib.packages.map((p) => `<tr><td><code>${esc(p.pkg)}</code></td><td>${esc(p.repo)}</td><td>${esc(p.consumers.join(', '))}</td><td class="n">${ups.filter((b) => b.pkg === p.pkg).length}</td><td class="n">${ib.releases.filter((x) => x.pkg === p.pkg).length}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No internal package is consumed across the analysed repos.</p>';

  const groups = [
    ...r.coordinated.map((g) => ({ kind: 'Coordinated change', ...g })),
    ...r.duplicatedTooling.map((g) => ({ kind: `Repeated maintenance ×${g.copies}${g.bot ? ' (bot)' : ''}`, ...g })),
  ];
  const groupList = groups.length ? `<ul class="groups">${groups.map((g) => `<li><strong>${esc(g.kind)}</strong> <span class="muted">${esc(g.repos.join(', '))}</span><br>${esc(g.title)}<br><span class="muted">${g.commits.map((c) => `<code>${esc(c.repo)}@${esc(c.sha)}</code>`).join(' ')}</span></li>`).join('')}</ul>` : '<p class="muted">None found.</p>';

  const m = r.migration;
  const clusters = m.clusters.filter((c) => c.repos.length > 1);
  const clusterList = clusters.length ? `<ol class="clusters">${clusters.map((c) => `<li><strong>${esc(c.repos.join(', '))}</strong> <span class="muted">coupling weight ${c.weight}</span></li>`).join('')}</ol>` : '<p class="muted">No coupled repos.</p>';
  const whyHtml = m.whyMigrate?.length ? `<h3>Why migrate</h3><p class="muted">The polyrepo costs <a href="https://monorepo.tools/" rel="noopener">monorepo.tools</a> lists, shown only where this report measured them.</p>
    <ul>${m.whyMigrate.map((w) => `<li><strong>${esc(w.polyrepo)}</strong> → ${esc(w.monorepo)}. <span class="muted">Measured: ${esc(w.evidence.join(', '))}.</span></li>`).join('')}</ul>` : '';
  const src = m.toolSource;
  const cats = m.toolOptions?.[0]?.categories.map((c) => c.category) ?? [];
  const optionsHtml = m.toolOptions?.length ? `<h3>Tool options</h3>
    <p class="muted">Every tool compared on <a href="${esc(src.urls[1])}" rel="noopener">monorepo.tools/compare</a> (snapshot ${esc(src.retrieved)}). The rating and every column up to “${esc(src.legend.none)}” come from monorepo.tools, which is published by Nx; the last column is from independent sources and is not scored.</p>
    <div class="table-wrap"><table><thead><tr><th>Tool</th><th class="n">monorepo.tools rating /10</th>${cats.map((c) => `<th class="n">${esc(c)}</th>`).join('')}<th class="n">${esc(src.legend.implement)}</th><th class="n">${esc(src.legend.community)}</th><th class="n">${esc(src.legend.none)}</th><th>Fit</th><th>Already used</th><th>Independent signals <span class="muted">(not scored)</span></th></tr></thead><tbody>
    ${m.toolOptions.map((t) => `<tr><td><a href="${esc(t.repo)}" rel="noopener">${esc(t.name)}</a>${t.by && t.by !== t.name ? ` <span class="muted">${esc(t.by)}</span>` : ''}</td><td class="n"><strong>${t.rating.toFixed(1)}</strong></td>${t.categories.map((c) => `<td class="n">${c.native}/${c.total}</td>`).join('')}<td class="n">${t.counts.implement}</td><td class="n">${t.counts.community}</td><td class="n">${t.counts.none}</td><td>${t.fit ? 'yes' : `no <span class="muted">(${esc(t.fitReason)})</span>`}</td><td>${t.alreadyUsed ? 'yes' : '—'}</td><td class="signals">${(independentSignals(t.independent) ?? '—').split(' · ').map(esc).join('<br>')}</td></tr>`).join('')}</tbody></table></div>
    <h4>Sources</h4><ul class="muted">${toolSources(src, m.toolOptions[0].total).map((x) => `<li><a href="${esc(x.url)}" rel="noopener">${esc(x.name)}</a> (${esc(x.publisher)}, retrieved ${esc(x.retrieved)}; <strong>${esc(x.role)}</strong>). ${esc(x.metric)}. Covers: ${esc(x.covers)}.</li>`).join('')}</ul>` : '';
  const couplingTable = m.coupling.length ? `<table><thead><tr><th>Repo pair</th><th class="n">Internal deps</th><th class="n">Bumps</th><th class="n">Coordinated changes</th><th class="n">Bugs</th><th class="n">Weight</th><th class="n">Repeated tooling (not weighted)</th></tr></thead><tbody>
    ${m.coupling.slice(0, 30).map((c) => `<tr><td>${esc(c.repos.join(' ↔ '))}</td><td class="n">${c.dependencies}</td><td class="n">${c.bumps}</td><td class="n">${c.sharedChanges}</td><td class="n">${c.bugs}</td><td class="n">${c.weight}</td><td class="n">${c.sharedTooling ?? 0}</td></tr>`).join('')}</tbody></table>` : '';
  const conflicts = m.externalConflicts.length ? `<table><thead><tr><th>External dependency</th><th>Majors in use</th></tr></thead><tbody>
    ${m.externalConflicts.slice(0, 40).map((c) => `<tr><td><code>${esc(c.dep)}</code></td><td>${Object.entries(c.majors).map(([v, rs]) => `v${esc(v)} <span class="muted">(${esc(rs.join(', '))})</span>`).join(' · ')}</td></tr>`).join('')}</tbody></table>${m.externalConflicts.length > 40 ? `<p class="muted">…and ${m.externalConflicts.length - 40} more in the JSON report.</p>` : ''}` : '<p class="muted">No conflicting major versions.</p>';

  const assumptions = `<table><thead><tr><th>Assumption</th><th class="n">Value</th></tr></thead><tbody>
    ${Object.entries(r.assumptions).map(([k, v]) => `<tr><td><code>${esc(k)}</code></td><td class="n">${esc(v)}</td></tr>`).join('')}
    <tr><td><code>developerHourly</code></td><td class="n">${fmt.full(r.rates.developerHourly)}</td></tr>
    <tr><td><code>ciPerMinute</code></td><td class="n">${esc(r.rates.currency)} ${esc(r.rates.ciPerMinute)}</td></tr></tbody></table>`;
  const repoTable = `<table><thead><tr><th>Repo</th><th class="n">Commits</th><th>Stack</th><th class="n">CI min/commit</th><th>CI source</th></tr></thead><tbody>
    ${r.repos.map((x) => `<tr><td>${esc(x.name)}</td><td class="n">${x.commits}</td><td>${esc([x.packageManager, ...x.buildTools].filter(Boolean).join(', ') || '—')}</td><td class="n">${Math.round(x.ci.minutesPerCommit * 10) / 10}</td><td>${esc(x.ci.source)}</td></tr>`).join('')}</tbody></table>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Polyrepo Tax Report</title>
<style>
:root {
  color-scheme: light;
  --surface: #ffffff; --surface-2: #f6f6f4; --line: #e4e4e0;
  --text: #191919; --text-2: #5f5f5b; --accent: #257de0; --track: #eef3fb;
  --yes: #0a7d22; --no: #a55a00;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --surface: #161616; --surface-2: #1f1f1f; --line: #333333;
    --text: #efefef; --text-2: #a3a3a3; --accent: #338ced; --track: #1c2735;
    --yes: #4cc363; --no: #e8a34c;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --surface: #161616; --surface-2: #1f1f1f; --line: #333333;
  --text: #efefef; --text-2: #a3a3a3; --accent: #338ced; --track: #1c2735;
  --yes: #4cc363; --no: #e8a34c;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--surface); color: var(--text); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
main { max-width: 1040px; margin: 0 auto; padding: 32px 16px 64px; }
h1 { font-size: 28px; margin: 0 0 4px; letter-spacing: -0.01em; }
h2 { font-size: 20px; margin: 48px 0 12px; padding-top: 16px; border-top: 1px solid var(--line); }
h3 { font-size: 16px; margin: 24px 0 8px; }
h4, h5 { font-size: 15px; margin: 16px 0 6px; }
p { margin: 8px 0; }
code { font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
pre { background: var(--surface-2); padding: 12px; border-radius: 8px; overflow-x: auto; }
a { color: var(--accent); }
.muted { color: var(--text-2); }
.meta { color: var(--text-2); margin: 0 0 24px; }
.hero { display: grid; grid-template-columns: 1.4fr 1fr; gap: 16px; align-items: stretch; }
.hero-main, .tile { background: var(--surface-2); border-radius: 12px; padding: 20px; }
.hero-label, .tile-label { color: var(--text-2); font-size: 13px; }
.hero-value { font-size: 44px; font-weight: 650; letter-spacing: -0.02em; line-height: 1.1; margin: 6px 0; font-variant-numeric: tabular-nums; }
.tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.tile-value { font-size: 22px; font-weight: 600; margin-top: 4px; font-variant-numeric: tabular-nums; }
.tile-note { color: var(--text-2); font-size: 12px; }
.verdict { margin: 16px 0 0; padding: 12px 16px; border-radius: 10px; background: var(--surface-2); border-left: 4px solid; }
.verdict-yes { border-color: var(--yes); } .verdict-no { border-color: var(--no); }
.range { position: relative; height: 56px; margin: 12px 8px 4px; }
.range-axis { position: absolute; left: 0; right: 0; top: 18px; height: 1px; background: var(--line); }
.range-span { position: absolute; top: 14px; height: 9px; border-radius: 5px; background: var(--track); }
.range-dot { position: absolute; top: 9px; width: 18px; height: 18px; margin-left: -9px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 2px var(--surface); cursor: default; }
.range-tick { position: absolute; top: 12px; width: 2px; height: 13px; margin-left: -1px; background: var(--text-2); }
.range-tick span { position: absolute; top: 18px; left: 50%; transform: translateX(-50%); white-space: nowrap; font-size: 12px; color: var(--text-2); }
.range-tick:first-of-type span { transform: none; left: 0; }
.chart { margin: 8px 0 4px; }
.bar-row { display: grid; grid-template-columns: minmax(140px, 34%) 1fr; gap: 12px; align-items: center; padding: 5px 0; border-radius: 6px; }
.bar-row:hover, .bar-row:focus-visible { background: var(--surface-2); outline: none; }
.bar-label { font-size: 13px; color: var(--text); text-align: right; }
.bar-track { display: flex; align-items: center; gap: 8px; min-width: 0; }
.bar { height: 20px; min-width: 2px; background: var(--accent); border-radius: 0 4px 4px 0; }
.bar-value { font-size: 13px; color: var(--text-2); white-space: nowrap; font-variant-numeric: tabular-nums; }
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 8px 0; }
th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
thead th { color: var(--text-2); font-weight: 600; }
tfoot th { border-bottom: 0; }
.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.row-em td { font-weight: 600; }
.filters { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 12px; }
.filters button { font: inherit; font-size: 13px; padding: 5px 12px; border-radius: 999px; border: 1px solid var(--line); background: var(--surface); color: var(--text); cursor: pointer; }
.filters button[aria-pressed="true"] { background: var(--text); color: var(--surface); border-color: var(--text); }
.bug { border: 1px solid var(--line); border-radius: 10px; padding: 10px 14px; margin: 8px 0; }
.bug summary { cursor: pointer; display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; }
.bug-title { font-weight: 600; flex: 1 1 260px; min-width: 0; overflow-wrap: anywhere; }
.bug-repos { color: var(--text-2); font-size: 13px; }
.cat { color: var(--text-2); }
.badge { font-size: 12px; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--line); text-transform: capitalize; }
.badge-high { background: var(--text); color: var(--surface); border-color: var(--text); }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; border: 1.5px solid currentColor; vertical-align: 0; margin-right: 2px; }
.dot-high { background: currentColor; }
.dot-medium { background: linear-gradient(90deg, currentColor 50%, transparent 50%); }
.commits { margin: 6px 0 0; padding-left: 18px; font-size: 13px; overflow-wrap: anywhere; }
.groups, .clusters { padding-left: 20px; }
.groups li, .clusters li { margin: 8px 0; overflow-wrap: anywhere; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 8px 0; }
.signals { min-width: 240px; }
.plan { background: var(--surface-2); border-radius: 12px; padding: 4px 20px 12px; }
#tip { position: fixed; pointer-events: none; z-index: 10; max-width: 320px; padding: 8px 10px; border-radius: 8px; font-size: 12px; background: var(--text); color: var(--surface); box-shadow: 0 4px 16px rgb(0 0 0 / .25); opacity: 0; }
footer { margin-top: 48px; color: var(--text-2); font-size: 12px; }
@media (max-width: 720px) {
  .hero { grid-template-columns: 1fr; }
  .hero-value { font-size: 36px; }
  .bar-row { grid-template-columns: 1fr; gap: 2px; }
  .bar-label { text-align: left; }
}
@media print {
  #tip, .filters { display: none; }
  .bug { break-inside: avoid; }
  details.bug:not([open]) > *:not(summary) { display: block; }
}
</style>
</head>
<body>
<main>
<h1>Polyrepo Tax Report</h1>
<p class="meta">${r.repos.length} repos (${esc(repoList)}) · ${esc(r.window.since)} → ${esc(r.window.until)} (${r.window.days} days) · ${fmt.full(r.rates.developerHourly)}/dev-hour · ${esc(r.rates.currency)} ${esc(r.rates.ciPerMinute)}/CI-minute</p>
${r.problems.length ? `<p class="verdict verdict-no"><strong>Data problems:</strong> ${esc(r.problems.join('; '))}</p>` : ''}

<section class="hero" aria-label="Headline numbers">
  <div class="hero-main">
    <div class="hero-label">Polyrepo tax per year, expected</div>
    <div class="hero-value">${fmt.full(ex)}</div>
    <div class="muted">${fmt.full(lo)} – ${fmt.full(hi)} depending on which bugs you count</div>
    ${range}
  </div>
  <div class="tiles">
    <div class="tile"><div class="tile-label">Developer time (window)</div><div class="tile-value">${num(e.totals.hours)} h</div><div class="tile-note">${fmt.full(e.totals.devCost)}</div></div>
    <div class="tile"><div class="tile-label">CI time (window)</div><div class="tile-value">${num(e.totals.ciMinutes)} min</div><div class="tile-note">${fmt.full(e.totals.ciCost)} · ${ciMeasured ? `measured for ${ciMeasured} of ${r.repos.length} repos` : 'assumed'}</div></div>
    <div class="tile"><div class="tile-label">Bugs attributable to repo boundaries</div><div class="tile-value">${bugsBy('high').length + bugsBy('medium').length}</div><div class="tile-note">${bugsBy('high').length} high · ${bugsBy('medium').length} medium · ${bugsBy('low').length} low confidence</div></div>
    <div class="tile"><div class="tile-label">Migration payback</div><div class="tile-value">${esc(paybackText)}</div><div class="tile-note">${fmt.full(m.oneTime.cost)} one-time · saves ${fmt.full(e.totals.annualSavings)}/yr</div></div>
  </div>
</section>
<p class="verdict ${verdict.cls}">${esc(verdict.text)}</p>
<p class="muted">Estimates from git history, not invoices. Every count links to commits below; every rate and assumption is listed at the end and can be overridden.</p>

<h2>Where the money goes</h2>
<p class="muted">Annualized cost per driver, expected scenario. Hover or focus a bar for hours and CI minutes.</p>
<div class="chart">${bars || '<p class="muted">No measurable polyrepo cost in this window.</p>'}</div>
<details><summary>Table view</summary><div class="table-wrap">${costTable}</div></details>
<h3>Scenarios</h3>
<div class="table-wrap">${scenarioTable}</div>

<h2>Bugs attributable to repo boundaries</h2>
${r.bugs.length ? `<div class="filters" role="group" aria-label="Filter by confidence">
  <button type="button" data-filter="all" aria-pressed="true">All ${r.bugs.length}</button>
  ${['high', 'medium', 'low'].map((c) => `<button type="button" data-filter="${c}" aria-pressed="false">${confIcon[c]} ${c[0].toUpperCase()}${c.slice(1)} ${bugsBy(c).length}</button>`).join('')}
</div>
<div id="bugs">${bugCards}</div>` : '<p class="muted">None found in this window.</p>'}

<h2>Internal dependency churn</h2>
<div class="stats">
  <div class="tile"><div class="tile-label">Internal bumps</div><div class="tile-value">${ups.length}</div><div class="tile-note">${ups.filter((b) => b.bot).length} by bots · ${ups.filter((b) => !b.bot).length} by people</div></div>
  <div class="tile"><div class="tile-label">Internal releases to move code</div><div class="tile-value">${ib.releases.length}</div><div class="tile-note">${(r.publicPackages === true || r.publicPackages?.length) ? 'public packages excluded' : 'packages consumed by sibling repos'}</div></div>
  <div class="tile"><div class="tile-label">Median release → bump lag</div><div class="tile-value">${ib.medianBumpLagDays ?? 'n/a'}${ib.medianBumpLagDays === null ? '' : ' days'}</div><div class="tile-note">time a consumer runs old code</div></div>
  <div class="tile"><div class="tile-label">Consumers behind today</div><div class="tile-value">${ib.drift.length}</div><div class="tile-note">${ib.drift.filter((d) => d.majorsBehind > 0).length} a major version or more</div></div>
</div>
<div class="table-wrap">${pkgTable}</div>
${ib.skew.length ? `<h3>Version skew today</h3><ul>${ib.skew.map((s) => `<li><code>${esc(s.pkg)}</code>: ${Object.entries(s.majors).map(([v, rs]) => `v${esc(v)} in ${esc(rs.join(', '))}`).join(' · ')}</li>`).join('')}</ul>` : ''}

<h2>Duplicated and coordinated work</h2>
${groupList}

<h2>Migration</h2>
<p><strong>Recommended tooling:</strong> ${esc(m.recommendedTool)} <span class="muted">(${esc(Object.entries(m.languages).map(([l, n]) => `${l} ${n} files`).join(', ') || 'no languages detected')})</span></p>
${whyHtml}
${optionsHtml}
<h3>Clusters to migrate, heaviest first</h3>
${clusterList}
${m.isolated.length ? `<p><strong>Keep separate</strong> (no measured coupling): ${esc(m.isolated.join(', '))}</p>` : ''}
<p><strong>One-time effort:</strong> ~${m.oneTime.days} dev-days (${fmt.full(m.oneTime.cost)}) for ${m.oneTime.repos.length} repos · <strong>payback</strong> ${pb.expected === null ? 'not reached' : `~${pb.expected} months`} <span class="muted">(range ${pb.high ?? '—'} – ${pb.low ?? 'never'} months)</span></p>
${couplingTable ? `<h3>Coupling between repos</h3><div class="table-wrap">${couplingTable}</div>` : ''}
<h3>External dependencies to align first</h3>
<div class="table-wrap">${conflicts}</div>
${plan ? `<h3>Migration plan</h3><div class="plan">${markdownToHtml(plan.replace(/^\s*#{1,6}\s*Migration plan\s*\n/i, ''))}</div>` : ''}

<h2>Assumptions</h2>
<div class="table-wrap">${assumptions}</div>
<div class="table-wrap">${repoTable}</div>

<footer>Generated ${esc(r.generatedAt)} by the polyrepo-tax skill. Full data: polyrepo-tax-report.json.</footer>
</main>
<div id="tip" role="tooltip"></div>
<script>
(() => {
  const tip = document.getElementById('tip');
  const show = (el, x, y) => {
    tip.textContent = el.dataset.tip;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(x + 12, innerWidth - w - 8)) + 'px';
    tip.style.top = Math.max(8, y - h - 12) + 'px';
    tip.style.opacity = 1;
  };
  const hide = () => { tip.style.opacity = 0; };
  for (const el of document.querySelectorAll('[data-tip]')) {
    el.addEventListener('pointermove', (ev) => show(el, ev.clientX, ev.clientY));
    el.addEventListener('pointerleave', hide);
    el.addEventListener('focus', () => { const b = el.getBoundingClientRect(); show(el, b.left + 16, b.top); });
    el.addEventListener('blur', hide);
  }
  const buttons = document.querySelectorAll('.filters button');
  for (const btn of buttons) btn.addEventListener('click', () => {
    for (const b of buttons) b.setAttribute('aria-pressed', String(b === btn));
    for (const card of document.querySelectorAll('#bugs .bug')) card.hidden = btn.dataset.filter !== 'all' && card.dataset.conf !== btn.dataset.filter;
  });
})();
</script>
</body>
</html>
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const input = argv.find((a, i) => !a.startsWith('--') && !['--plan', '--out'].includes(argv[i - 1]));
  if (!input) { console.error('usage: render-html.mjs <polyrepo-tax-report.json> [--plan migration-plan.md] [--out report.html]'); process.exit(2); }
  const report = JSON.parse(fs.readFileSync(input, 'utf8'));
  const planPath = opt('--plan') ?? path.join(path.dirname(input), 'migration-plan.md');
  const plan = fs.existsSync(planPath) ? fs.readFileSync(planPath, 'utf8') : undefined;
  const out = opt('--out') ?? path.join(path.dirname(input), 'polyrepo-tax-report.html');
  fs.writeFileSync(out, renderHtml(report, { plan }));
  console.log(`wrote ${out}${plan ? ` (with ${path.basename(planPath)})` : ''}`);
}
