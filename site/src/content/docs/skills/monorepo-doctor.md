---
title: monorepo-doctor
description: A read-only audit of JS/TS monorepos for package boundaries, circular dependencies, task caching, CI test coverage and test code in production.
---

`monorepo-doctor` is a **read-only** agent skill for npm, yarn, pnpm and bun workspaces, with deeper rules for Nx and Turborepo. It walks an agent through deterministic detection, a source scan, five independent checks, and an evidence-backed Markdown and JSON report.

## What it checks

| Check | What it looks for | Example finding ids |
|---|---|---|
| [Package boundaries](/reference/monorepo-doctor/boundaries/) | Packages too large for their consumers (packages no other workspace package imports are never flagged), imports through another package's internals, knip unlisted/unused dependencies, missing Nx/Turbo boundary enforcement. | `boundaries/deep-import`, `boundaries/nx-missing-module-boundaries-rule`, `boundaries/turbo-boundaries-violation` |
| [Circular dependencies](/reference/monorepo-doctor/circular-deps/) | Package-level cycles and value-import file cycles, one finding per strongly connected group. File cycles are medium when a binding is read during module evaluation, low when every use is deferred, and skipped for idiomatic lazy ORM references. | `circular-deps/package-cycle`, `circular-deps/file-cycle` |
| [Task caching](/reference/monorepo-doctor/caching/) | Nx/Turbo cache configuration that can replay stale results or miss useful hits: missing outputs, undeclared env vars, volatile inputs, dependency-blind test caches. | `caching/missing-outputs`, `caching/undeclared-env`, `caching/build-inputs-include-tests` |
| [CI test coverage](/reference/monorepo-doctor/ci-coverage/) | CI paths where tests silently don't run for changed code: no test command, shallow affected checkout, missing Nx base refs, undeclared workspace dependencies. | `ci-coverage/tests-not-run-in-ci`, `ci-coverage/shallow-checkout-affected`, `ci-coverage/turbo-test-missing-dependson` |
| [Production leakage](/reference/monorepo-doctor/prod-leakage/) | Test files, fixtures, compiled test output or test libraries that can ship in package tarballs or deployable builds. | `prod-leakage/test-files-in-package`, `prod-leakage/test-files-in-build-output`, `prod-leakage/test-lib-in-dependencies` |

Findings must be actionable. When the honest fix is "keep it as-is" — for example `cache: false` on a migration task — the skill notes it in the check's reason instead of reporting a finding.

## How it works

1. **[Detect](/reference/monorepo-doctor/detection/)** — package manager, workspaces, Nx/Turbo config, CI files, and whether `node_modules`, `nx` and `turbo` are installed. Writes `$W/workspace.json`.
2. **[Scan](/reference/monorepo-doctor/scan/)** — walks every package's source once: imports (value vs type-only), env reads, test files. Writes `$W/scan.json`.
3. **Check** — the five checks run independently against the inventory and scan, each writing `$W/findings/<check>.json` with a status of `ok`, `partial` or `skipped` and a reason.
4. **[Render](/reference/monorepo-doctor/report-format/)** — merges findings into `monorepo-doctor-report.md` and `monorepo-doctor-report.json`.

`$W` is the work directory, `<os tmpdir>/monorepo-doctor`.

### Supported workspaces

Packages are discovered from `package.json#workspaces` and `pnpm-workspace.yaml`. With **Nx**, it also reads `nx.json`, `project.json`, package `nx` targets, tags, target defaults, named inputs, and a local Nx graph when the `nx` binary is installed. With **Turborepo**, it reads `turbo.json`, package-level overrides, dry-run metadata when `turbo` is installed, and `turbo boundaries` output when available.

## Output

Two files, written to `<os tmpdir>/monorepo-doctor-reports` by default (outside your repo) or to a directory you name in the prompt:

- `monorepo-doctor-report.md` — the human-readable report
- `monorepo-doctor-report.json` — `summary`, per-check status, and full findings

| Severity | Meaning |
|---|---|
| `critical` | Wrong code can ship, or tests are silently skipped for real changes |
| `high` | Likely incorrect builds/caching or broken CI signal |
| `medium` | Correctness risk under specific conditions, or boundary erosion |
| `low` | Hygiene, performance, cache efficiency or maintainability |

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

**Fix:** Add `"files": ["dist"]` to package.json and exclude tests from the build tsconfig.
````

## Guarantees

The skill must not install dependencies, build, run tests or edit project files. The only writes are the two report files and the work directory `$W`.

It may run:

- the Node snippets in its references (Node built-ins only)
- `npm pack --dry-run --json --ignore-scripts`
- `knip` and `publint` from your repo's `node_modules/.bin` **only** when installed there
- `nx` / `turbo` from your repo's `node_modules/.bin` **only** when installed there, and only for graph, `--dry=json` and `boundaries` inspection — never real task execution

It downloads nothing at runtime by default. If you explicitly allow downloads in your prompt (for example *"Run monorepo-doctor, downloads allowed"*), it may fetch the pinned `knip@6.41.0` and `publint@0.3.25` with install scripts disabled — never other packages or versions.

Nx graph runs with `NX_DAEMON=false NX_NO_CLOUD=true` and a workspace-data directory under `$W`, so it doesn't start the daemon or write `.nx/workspace-data` into your repo. Turbo commands use `TURBO_TELEMETRY_DISABLED=1`.

:::caution[Run it on repositories you trust]
`knip` and Nx load repository configuration files, which can execute config code.
:::

Without `node_modules`, or when knip/publint aren't installed locally (and downloads aren't allowed), those steps are skipped and the check is marked `partial`. Without a local `nx`/`turbo`, static config analysis still runs, but graph refreshes, Turbo dry-run hash comparisons and `turbo boundaries` are marked `partial`.

## Next

- [Run it in CI](/guides/ci/) with a severity threshold.
- [How caching findings work](/guides/caching-and-stale-results/).
- Hand boundary findings to [monorepo-boundaries-cleanup](/skills/monorepo-boundaries-cleanup/).
- Read the full [SKILL.md](/reference/monorepo-doctor/skill/).
