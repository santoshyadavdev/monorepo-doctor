# Check 2 — Circular dependencies

Output: `findings/circular-deps.json`.

| id | severity | detect |
|---|---|---|
| `circular-deps/package-cycle` | high | a strongly connected component (SCC) in the package graph (`workspaceDeps`, or the Nx project graph when Nx is installed). One finding per SCC. |
| `circular-deps/file-cycle` | medium when eager, low when deferred, skipped when idiomatic (see step 3) | an SCC of 2+ files among a package's own files (`scan.fileEdges`). One finding per SCC, not per simple cycle: cycles that share files share a fix. |

Package cycles break topological builds (`^build` order is undefined), cause stale caches and make packages unpublishable independently.
File cycles cause `undefined`/TDZ errors only when a module reads an imported binding **while it is being evaluated** (eager). When every cross-edge use is deferred (inside a function, component render or callback), ESM live bindings make it work at runtime and the cost is coupling: larger bundles/chunks, Fast Refresh full reloads, and tests that need mocks to break the cycle.

## Steps

1. If Nx is installed, refresh the graph and use it as the package graph:
   ```bash
   W="$(node -p 'require("os").tmpdir()')/monorepo-doctor"
   rm -f "$W/nx-graph.json" "$W/nx-graph.failed"
   NX_DAEMON=false NX_NO_CLOUD=true NX_WORKSPACE_DATA_DIRECTORY="$W/nx-data" ./node_modules/.bin/nx graph --file="$W/nx-graph.json" \
     || touch "$W/nx-graph.failed"
   ```
   The file has `graph.dependencies[project] = [{ target }]`. Otherwise use `workspace.json` `workspaceDeps`.
   If Turborepo is installed, `TURBO_TELEMETRY_DISABLED=1 ./node_modules/.bin/turbo run build --dry=json` failing with a message containing `cyclic` is also evidence. Turbo dry-run JSON writes no project files beyond Turborepo's own cache directory.
   Status: the `workspaceDeps` graph is complete for package.json-based workspaces, so missing turbo does **not** make this check partial. Under Nx without a local install, mark `partial` with reason `nx not installed; project graph inferred from package.json only`; if Nx is installed but `nx graph` fails, mark `partial` with reason `nx graph failed; project graph inferred from package.json only` (Nx also infers edges from imports and `implicitDependencies`).
2. Run the cycle snippet:

```bash
W="$(node -p 'require("os").tmpdir()')/monorepo-doctor"
cat > "$W/cycles.mjs" <<'EOF'
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const work = path.join(os.tmpdir(), 'monorepo-doctor');
const ws = JSON.parse(fs.readFileSync(path.join(work, 'workspace.json'), 'utf8'));
const scan = JSON.parse(fs.readFileSync(path.join(work, 'scan.json'), 'utf8'));
const nxGraphPath = path.join(work, 'nx-graph.json');

// Tarjan: strongly connected components with 2+ nodes (or a self-loop), nodes sorted.
function sccs(graph) {
  const index = new Map(), low = new Map(), onStack = new Set(), stack = [], out = [];
  let i = 0;
  const visit = (n) => {
    index.set(n, i); low.set(n, i++); stack.push(n); onStack.add(n);
    for (const m of graph.get(n) ?? []) {
      if (!index.has(m)) { visit(m); low.set(n, Math.min(low.get(n), low.get(m))); }
      else if (onStack.has(m)) low.set(n, Math.min(low.get(n), index.get(m)));
    }
    if (low.get(n) === index.get(n)) {
      const comp = [];
      let m;
      do { m = stack.pop(); onStack.delete(m); comp.push(m); } while (m !== n);
      if (comp.length > 1 || (graph.get(n) ?? []).includes(n)) out.push(comp.sort());
    }
  };
  for (const n of graph.keys()) if (!index.has(n)) visit(n);
  return out;
}
const innerEdges = (graph, comp) => comp.flatMap((a) => (graph.get(a) ?? []).filter((b) => comp.includes(b)).map((b) => [a, b]));

const nx = ws.orchestrators.find((o) => o.name === 'nx');
const graphFailed = Boolean(nx?.installed) && (fs.existsSync(path.join(work, 'nx-graph.failed')) || !fs.existsSync(nxGraphPath));
const useNxGraph = Boolean(nx?.installed) && !graphFailed;
let pkgGraph;
if (useNxGraph) {
  const g = JSON.parse(fs.readFileSync(nxGraphPath, 'utf8')).graph;
  pkgGraph = new Map(Object.entries(g.dependencies).map(([k, v]) => [k, v.map((d) => d.target).filter((t) => g.nodes[t])]));
} else {
  pkgGraph = new Map(ws.packages.map((p) => [p.name, p.workspaceDeps]));
}
const byName = new Map(ws.packages.map((p) => [p.name, p]));
const findings = [];
for (const c of sccs(pkgGraph)) {
  const first = byName.get(c[0]);
  findings.push({
    id: 'circular-deps/package-cycle', severity: 'high',
    title: `Package cycle: ${c.join(' ↔ ')}`,
    location: { file: first ? `${first.dir}/package.json` : 'package.json', package: c[0] },
    evidence: innerEdges(pkgGraph, c).map(([a, b]) => `${a} depends on ${b}`).join('\n'),
    fix: 'Extract the shared code into a new package both can depend on, or invert one edge (dependency injection / events). Remove the back-edge from package.json.',
  });
}
for (const [pkg, edges] of Object.entries(scan.fileEdges)) {
  const g = new Map();
  for (const [a, b] of edges) { if (!g.has(a)) g.set(a, []); g.get(a).push(b); }
  for (const c of sccs(g)) {
    const e = innerEdges(g, c);
    findings.push({
      id: 'circular-deps/file-cycle', severity: 'low',
      title: `File cycle in ${pkg} (${c.length} files)`,
      location: { file: c[0], package: pkg },
      evidence: e.slice(0, 15).map(([a, b]) => `${a} → ${b}`).join('\n') + (e.length > 15 ? `\n… ${e.length - 15} more edges` : ''),
      fix: 'Move the shared symbols into a third module that both import, or merge the files.',
    });
  }
}
const status = nx && !useNxGraph ? 'partial' : 'ok';
const result = { status, findings };
if (status === 'partial') result.reason = graphFailed
  ? 'nx graph failed; project graph inferred from package.json only'
  : 'nx not installed; project graph inferred from package.json only';
fs.writeFileSync(path.join(work, 'findings', 'circular-deps.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ packageCycles: findings.filter((f) => f.id.endsWith('package-cycle')).length, fileCycles: findings.filter((f) => f.id.endsWith('file-cycle')).length }));
EOF
node "$W/cycles.mjs"
```

3. Review every `file-cycle` finding (the snippet writes them as `low`; you must classify each before rendering). For each edge in `evidence`, open the import line and find where each imported name is used in the importing file.
   - **Drop** an edge that is not a real value import (inside a comment, type-only). Drop the finding if the component no longer has a cycle.
   - **Eager** — an imported binding is read during module evaluation: a top-level call or property read, `class X extends Imported`, a top-level object/array/spread built from it, decorator arguments, or a top-level `const` initialized from it. Any eager edge → `severity: "medium"`; quote the eager line in `evidence`.
   - **Deferred** — every use is inside a function body, component render, hook, or callback → keep `low`.
   - **Idiomatic, skip** — all edges deferred and the files are ORM schema/entity modules using lazy references (Drizzle `.references(() => t.id)` / `relations(...)`, TypeORM/MikroORM `() => Entity` decorators, Sequelize/Objection associations set up in functions). Remove the finding and add `"N idiomatic ORM schema cycles skipped (lazy references)"` to `reason`.
   - **Cost evidence** (add to `evidence` when present): a `.tsx`/`.jsx` file in the cycle that exports a non-component value next to components (React Fast Refresh falls back to a full reload when it is edited); test files that `vi.mock`/`jest.mock` a module in the cycle.
   - **Fix:** name the back-edge — the smallest set of exported symbols that, moved into a new module, breaks the cycle (e.g. "Move `tabLabel` from `shell.tsx` to `workspace/tab-label.ts`; import it from shell, coach-sheet and saved").
   - Rewrite `title` to name the files and the shared symbol, e.g. `shell.tsx ↔ coach-sheet.tsx, saved.tsx via tabLabel`.
4. If more than 20 file-cycle components exist in one package, keep the 20 smallest and add `"reason": "N file-cycle components; showing 20 smallest"` with status `partial`.
