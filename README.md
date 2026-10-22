# Monorepo Skills

Agent skills that find — and then fix — the JS/TS monorepo problems teams keep missing.

📖 **Docs: [monorepo-skills.dev](https://monorepo-skills.dev)** · 🤖 For agents: [`llms.txt`](https://monorepo-skills.dev/llms.txt) · [`llms-full.txt`](https://monorepo-skills.dev/llms-full.txt)

| Skill | What it does |
|---|---|
| [`monorepo-doctor`](https://monorepo-skills.dev/skills/monorepo-doctor/) | Read-only audit: package boundaries, circular dependencies, task caching, CI test coverage, test code in production. Writes Markdown and JSON reports. |
| [`monorepo-boundaries-cleanup`](https://monorepo-skills.dev/skills/monorepo-boundaries-cleanup/) | Refactoring workflow: pays boundary violations down in small PRs against a baseline, then stops for your CI report. |

## monorepo-doctor

`monorepo-doctor` is a read-only AI agent skill for npm, yarn, pnpm, and bun workspaces, with deeper rules for Nx and Turborepo. It guides an agent through deterministic detection, source scanning, five independent audits, and an evidence-backed Markdown and JSON report.

Requires Node ≥ 22.5.

The companion skill [`monorepo-boundaries-cleanup`](skills/monorepo-boundaries-cleanup/SKILL.md) is a refactoring workflow that pays down boundary violations found by monorepo-doctor or by a boundary linter such as `turbo boundaries`, Nx `enforce-module-boundaries`, or dependency-cruiser. It works in small PRs against a baseline: wrong-direction imports, deep imports, undeclared dependencies, cross-workspace test fixtures, and cycles. Unlike monorepo-doctor, it **edits code and opens PRs**, then stops and waits for your CI report.

## What it checks

| Check | What it looks for | Example finding ids |
|---|---|---|
| Package boundaries | Packages that are too large for their consumers (packages no other workspace package imports are never flagged), import through another package's internals, have knip unlisted/unused dependencies, or lack Nx/Turbo boundary enforcement. | `boundaries/deep-import`, `boundaries/nx-missing-module-boundaries-rule`, `boundaries/turbo-boundaries-violation` |
| Circular dependencies | Package-level cycles and value-import file cycles, one finding per strongly connected group. File cycles are medium when a binding is read during module evaluation, low when every use is deferred, and skipped for idiomatic lazy ORM references. | `circular-deps/package-cycle`, `circular-deps/file-cycle` |
| Task caching | Nx/Turbo cache configuration that can replay stale results or miss useful cache hits: missing outputs, undeclared env vars, volatile inputs, and dependency-blind test caches. | `caching/missing-outputs`, `caching/undeclared-env`, `caching/build-inputs-include-tests` |
| CI test coverage | CI paths where tests silently do not run for changed code: no test command, shallow affected checkout, missing Nx base refs, or undeclared workspace dependencies. | `ci-coverage/tests-not-run-in-ci`, `ci-coverage/shallow-checkout-affected`, `ci-coverage/turbo-test-missing-dependson` |
| Production leakage | Test files, fixtures, compiled test outputs, or test libraries that can ship in package tarballs or deployable build outputs. | `prod-leakage/test-files-in-package`, `prod-leakage/test-files-in-build-output`, `prod-leakage/test-lib-in-dependencies` |

Findings must be actionable: when the honest fix is "keep it as-is" (for example `cache: false` on a migration task), the skill notes it in the check's reason instead of reporting a finding.

## Supported workspaces

The skill supports JavaScript and TypeScript monorepos using npm, yarn, pnpm, or bun workspaces. It discovers packages from `package.json#workspaces` and `pnpm-workspace.yaml`, then scans source imports, package manifests, CI files, and build/test configuration.

When Nx is present, it also reads `nx.json`, `project.json`, package `nx` targets, tags, target defaults, named inputs, and local Nx graph output when the local `nx` binary is installed. When Turborepo is present, it reads `turbo.json`, package-level Turbo overrides, dry-run metadata when local `turbo` is installed, and `turbo boundaries` output when available.

## Install

Install from the repository with:

```bash
npx skills add santoshyadavdev/monorepo-doctor
```

The CLI lets you pick which skills to install. To install one directly, add `--skill monorepo-doctor` or `--skill monorepo-boundaries-cleanup`.

Manual installation is also supported. Copy `skills/monorepo-doctor` (and/or `skills/monorepo-boundaries-cleanup`) into one of these locations:

- `~/.claude/skills/` for Claude Code
- `~/.copilot/skills/` for Copilot CLI
- `.github/skills/` inside a repository for repo-scoped use

## Use

Ask your agent to run the skill from the root of the monorepo you want audited:

```text
Run monorepo-doctor on this repo.
```

Scope the audit when you only need specific checks:

```text
Audit only caching and CI coverage with monorepo-doctor.
```

Pay down boundary violations, one batch per PR:

```text
Use monorepo-boundaries-cleanup to fix the next batch of turbo boundaries violations.
```

Use CI mode when the report should fail a run at a severity threshold:

```text
Run monorepo-doctor in CI mode, fail on high.
```

## Output

The skill writes two report files to `$(node -p 'require("os").tmpdir()')/monorepo-doctor-reports` by default (outside your repo), or to an output directory you name in the prompt:

- `monorepo-doctor-report.md` — human-readable audit report
- `monorepo-doctor-report.json` — structured report with `summary`, per-check status, and full findings

Severities follow the skill's rubric:

| Severity | Meaning |
|---|---|
| `critical` | Wrong code can ship or tests are silently skipped for real changes |
| `high` | Likely incorrect builds/caching or broken CI signal |
| `medium` | Correctness risk under specific conditions, or a boundary erosion |
| `low` | Hygiene, performance, cache efficiency, or maintainability |

A short Markdown excerpt looks like this:

````markdown
# Monorepo Doctor Report

**Workspace:** pnpm · turbo · 8 packages

**Summary:** 1 critical · 2 high · 1 medium · 1 low

| Check | Status | Findings | Note |
|---|---|---|---|
| boundaries | ok | 1 |  |
| circular-deps | ok | 0 |  |
| caching | partial | 2 | turbo not installed; dry-run hash comparison skipped |
| ci-coverage | ok | 1 |  |
| prod-leakage | ok | 1 |  |

## Critical

### Publishable package @acme/ui includes test files

- **id:** `prod-leakage/test-files-in-package`
- **where:** `packages/ui/package.json` (@acme/ui)

**Evidence**

```
npm pack --dry-run includes:
src/button.spec.ts
test/fixtures/button.json
```

**Fix:** Add `"files": ["dist"]` to package.json and exclude tests from the build tsconfig.
````

## Guarantees

`monorepo-doctor` is read-only. It must not install dependencies, build, run tests, or edit project files. The only allowed writes are `monorepo-doctor-report.md`, `monorepo-doctor-report.json`, and the skill work directory `$W`, where `$W` is `$(node -p 'require("os").tmpdir()')/monorepo-doctor`. The snippets require a POSIX shell (macOS, Linux, or WSL).

The skill may run the Node snippets in `skills/monorepo-doctor/references`, `npm pack --dry-run --json --ignore-scripts`, `npx --yes knip@6.41.0`, and `npm_config_ignore_scripts=true npx --yes publint@0.3.25` (pinned exact versions). It may run `npx nx` or `npx turbo` only when detection finds a local `node_modules/.bin/nx` or `node_modules/.bin/turbo`; those commands are limited to graph, dry-run JSON, and boundaries inspection, never real task execution. Nx graph runs as `NX_DAEMON=false NX_NO_CLOUD=true NX_WORKSPACE_DATA_DIRECTORY="$W/nx-data" npx nx graph --file="$W/nx-graph.json"` so it does not create `.nx/workspace-data` in the audited repo or start the daemon. Turbo commands use `TURBO_TELEMETRY_DISABLED=1`; `turbo --dry=json` and `turbo boundaries` should not write project files beyond Turborepo's own cache directory.

Without `node_modules`, dependency-resolution checks such as `knip` and `publint` are skipped or marked `partial` (publint is skipped when `node_modules` is missing). `knip` and Nx load repository configuration files, which can execute config code; run the skill only on repositories you trust. Without a local Nx or Turborepo binary, the skill still performs static config analysis, but graph refreshes, Turbo dry-run hash comparisons, and `turbo boundaries` are skipped or marked `partial`.

## CI example

See [Run in CI](https://monorepo-skills.dev/guides/ci/) on the docs site. This example runs the skill in a GitHub Actions job and uploads both reports. Replace the agent command with the non-interactive CLI for your environment. The threshold check must be a separate workflow step after the agent writes the report; an agent-internal threshold cannot fail the job reliably. The example does not install dependencies, so knip/Nx/Turbo sub-steps will be partial; for best coverage, run it after your normal dependency install step.

```yaml
name: monorepo-doctor

on:
  pull_request:
  workflow_dispatch:

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '22.5'

      - name: Run monorepo-doctor (adapt to your agent)
        run: |
          copilot -p "Run the monorepo-doctor skill on this repo and write reports to ./" --allow-all-tools

      - name: Fail on high findings
        run: |
          node -e '
          const fs = require("node:fs");
          const order = ["low", "medium", "high", "critical"];
          const reportPath = process.argv[1];
          const threshold = process.argv[2] || "high";
          const min = order.indexOf(threshold);
          if (!reportPath || min === -1) process.exit(2);
          const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
          const bad = (report.findings || []).filter((f) => order.indexOf(f.severity) >= min);
          for (const f of bad) console.error(`${f.severity.toUpperCase()} ${f.id} ${f.location?.file ?? "—"}`);
          process.exit(bad.length ? 1 : 0);
          ' monorepo-doctor-report.json high

      - name: Upload monorepo-doctor report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: monorepo-doctor-report
          path: |
            monorepo-doctor-report.md
            monorepo-doctor-report.json
```

## Prior art

`monorepo-doctor` builds on existing ecosystem tools and agent references rather than replacing them:

- [nrwl/nx-ai-agents-config](https://github.com/nrwl/nx-ai-agents-config) provides Nx-focused agent skills for Nx workspaces and cache investigation.
- [Turborepo's agent skill](https://github.com/vercel/turborepo/tree/main/skills/turborepo) points agents at Turborepo documentation and conventions.
- [madge](https://github.com/pahen/madge) and [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) analyze dependency graphs and cycles.
- [knip](https://github.com/webpro-nl/knip) finds unused and unlisted dependencies.
- [publint](https://github.com/bluwy/publint) validates package publishing metadata.
- [`@nx/enforce-module-boundaries`](https://nx.dev/features/enforce-module-boundaries) enforces Nx project dependency constraints.
- [`turbo boundaries`](https://turborepo.com/docs/crafting-your-repository/structuring-a-repository#configuring-boundaries) checks Turborepo package boundaries.

What this skill adds is one read-only audit flow across all five concerns, with consistent finding ids, evidence requirements, severity rules, Markdown/JSON output, and CI-friendly failure thresholds.

## Development

Run the tooling with Node ≥ 22.5:

```bash
npm test
npm run check
```

Fixtures live under `fixtures/` and describe seeded monorepo problems for generic pnpm, Nx, and Turborepo workspaces. Expected findings live in `fixtures/expected/*.json`.

Use `scripts/verify-fixture.mjs` to compare a generated report with an expected fixture contract:

```bash
node scripts/verify-fixture.mjs "$(node -p 'require("os").tmpdir()')/monorepo-doctor-reports/monorepo-doctor-report.json" fixtures/expected/generic-pnpm.json
```

`npm run check` validates every skill's frontmatter, reference links, and (for monorepo-doctor) finding-id coverage. It should print:

```text
✓ monorepo-boundaries-cleanup is consistent
✓ monorepo-doctor is consistent
```

### Docs site

The docs at [monorepo-skills.dev](https://monorepo-skills.dev) are an [Astro Starlight](https://starlight.astro.build) site in `site/`. Reference pages, `llms.txt`, and the raw `/skills/**` files are generated from `skills/`, so edit the skill files rather than generated pages.

```bash
cd site && npm ci && npm run dev
```

The site is deployed to Cloudflare Workers (static assets) by Workers Builds, configured in `site/wrangler.jsonc`. `.github/workflows/docs.yml` only runs a build check.
