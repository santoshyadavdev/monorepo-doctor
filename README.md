# Monorepo Skills

Agent skills that find — and then fix — the JS/TS monorepo problems teams keep missing.

📖 **Docs: [monorepo-skills.dev](https://monorepo-skills.dev)** · 🤖 For agents: [`llms.txt`](https://monorepo-skills.dev/llms.txt) · [`llms-full.txt`](https://monorepo-skills.dev/llms-full.txt)

| Skill | What it does |
|---|---|
| [`monorepo-doctor`](https://monorepo-skills.dev/skills/monorepo-doctor/) | Read-only JS/TS audit plus limited static Bazel visibility and `testonly` checks, including standalone Java workspaces. Writes Markdown and JSON reports. |
| [`monorepo-boundaries-cleanup`](https://monorepo-skills.dev/skills/monorepo-boundaries-cleanup/) | Refactoring workflow: pays boundary violations down in small PRs against a baseline, then stops for your CI report. |
| [`polyrepo-tax`](https://monorepo-skills.dev/skills/polyrepo-tax/) | Read-only business case: mines the git history of the repos you work across for bugs attributable to repo boundaries, developer and CI time spent moving code between repos, converts it to money, and plans a monorepo migration only for the repos that would pay it back. |

## monorepo-doctor

`monorepo-doctor` is a read-only AI agent skill for npm, yarn, pnpm, and bun workspaces, with deeper rules for Nx and Turborepo and limited Bazel target checks. It guides an agent through deterministic detection, source scanning, independent audits, and an evidence-backed Markdown and JSON report.

Requires Node ≥ 22.5.

The companion skill [`monorepo-boundaries-cleanup`](skills/monorepo-boundaries-cleanup/SKILL.md) is a refactoring workflow that pays down boundary violations found by monorepo-doctor or by a boundary linter such as `turbo boundaries`, Nx `enforce-module-boundaries`, or dependency-cruiser. It works in small PRs against a baseline: wrong-direction imports, deep imports, undeclared dependencies, cross-workspace test fixtures, and cycles. Unlike monorepo-doctor, it **edits code and opens PRs**, then stops and waits for your CI report.

## polyrepo-tax

`polyrepo-tax` answers "what is our polyrepo setup costing us, and is a monorepo worth it?" from the repositories' own history. Give it the repos you use and contribute to; it clones them read-only and reports:

- **Bugs attributable to repo boundaries**, with commit evidence and a confidence level: internal-dependency rollbacks and reverts (high), the same fix landing in several repos, one bug fixed across repos under one ticket, fixes that needed a release and a bump to propagate, and fixes right after an internal bump (medium).
- **Developer time** spent on internal dependency bumps, releases that exist only to move code between repos, changes coordinated across repos, and the same tooling or dependency maintenance repeated per repo.
- **CI time** per repo, measured from GitHub Actions when `gh` is authenticated, otherwise assumed and labelled as such.
- **Money**: a low / expected / high range at your loaded hourly rate and CI price, annualized, with every assumption printed and overridable.
- **Migration plan**: repo coupling clusters (migrate the heaviest first, keep isolated repos separate), external dependency conflicts to align before sharing a lockfile, recommended tooling, one-time effort and payback. When the payback isn't there, it says not to migrate.

```text
Use polyrepo-tax on acme/web-app, acme/admin-app, acme/ui-lib and acme/api-client for the last 12 months. Our loaded cost is $120/hour.
```

It writes `polyrepo-tax-report.html` (a self-contained page to share with leadership: headline range, cost chart, filterable bugs with commit evidence, migration plan), plus Markdown and JSON. See the [sample report](https://monorepo-skills.dev/examples/polyrepo-tax-report.html) and the [walkthrough](https://monorepo-skills.dev/guides/polyrepo-to-monorepo/).

| Bug category | Confidence | Detected when |
|---|---|---|
| `dependency-regression` | high | A repo downgrades an internal dependency or reverts a bump of it. |
| `duplicated-fix` | medium | Near-identical fix commits land in two or more repos within two weeks. |
| `cross-repo-fix` | medium | Fix commits in two or more repos share a ticket key. |
| `fix-propagation` | medium | A fix commit is itself an internal dependency bump. |
| `post-bump-fix` | medium / low | A fix lands within a week of an internal bump and names the package or a compatibility break; low only right after a major bump. |

Counts are a floor: bugs fixed without a fix-like commit subject are invisible to git history. Money is `developer hours × loaded rate + CI minutes × CI price`, from documented per-event assumptions the report prints and you can override. Savings and payback only count the repos that would move.

The analyzer (`skills/polyrepo-tax/scripts/analyze.mjs`) is a dependency-free Node script that runs only read-only `git` commands, and also works standalone:

```bash
node skills/polyrepo-tax/scripts/analyze.mjs ../ui-lib ../web-app ../admin-app --since 2025-11-25 --rate 120 --out ./reports
```

## What it checks

| Check | What it looks for | Example finding ids |
|---|---|---|
| Package boundaries | Packages that are too large for their consumers (packages no other workspace package imports are never flagged), import through another package's internals, have knip unlisted/unused dependencies, lack Nx enforcement, have invalid Turbo boundary configuration / reported violations, or expose explicitly internal Bazel targets publicly. | `boundaries/deep-import`, `boundaries/nx-missing-module-boundaries-rule`, `boundaries/turbo-package-boundaries-tags`, `boundaries/turbo-tag-package-name-collision`, `boundaries/turbo-boundaries-violation`, `boundaries/bazel-public-internal-target` |
| Circular dependencies | Package-level cycles and value-import file cycles, one finding per strongly connected group. File cycles are medium when a binding is read during module evaluation, low when every use is deferred, and skipped for idiomatic lazy ORM references. | `circular-deps/package-cycle`, `circular-deps/file-cycle` |
| Task caching | Nx/Turbo cache configuration that can replay stale results or miss useful cache hits: missing outputs, undeclared env vars, volatile inputs, and dependency-blind test caches. | `caching/missing-outputs`, `caching/undeclared-env`, `caching/build-inputs-include-tests` |
| CI test coverage | CI paths where tests silently do not run for changed code: no test command, shallow affected checkout, missing Nx base refs, invalid Turbo comparison ranges, or undeclared workspace dependencies. | `ci-coverage/tests-not-run-in-ci`, `ci-coverage/shallow-checkout-affected`, `ci-coverage/turbo-invalid-comparison-base`, `ci-coverage/turbo-test-missing-dependson` |
| Production leakage | Test files, fixtures, compiled test outputs, or test libraries that can ship in package tarballs or deployable build outputs; production-tagged Bazel targets with invalid `testonly` dependencies. | `prod-leakage/test-files-in-package`, `prod-leakage/test-files-in-build-output`, `prod-leakage/test-lib-in-dependencies`, `prod-leakage/bazel-testonly-dependency` |

Findings must be actionable: when the honest fix is "keep it as-is" (for example `cache: false` on a migration task), the skill notes it in the check's reason instead of reporting a finding.

## Supported workspaces

The full audit supports JavaScript and TypeScript monorepos using npm, yarn, pnpm, or bun workspaces. It discovers packages from `package.json#workspaces` and `pnpm-workspace.yaml`, then scans source imports, package manifests, CI files, and build/test configuration.

Bazel is also recognized from `MODULE.bazel`, `REPO.bazel`, or a `WORKSPACE` file, including standalone Java workspaces without npm or `package.json`. The skill itself still needs Node.js for its read-only scripts. Its initial Bazel checks inspect literal local BUILD targets for `internal` tags exposed publicly and explicitly `production`-tagged, non-test targets depending on explicit `testonly` targets. The `internal` tag is a project convention, not a Bazel rule. Bazel normally blocks the latter dependency during analysis, so it is a build error, not proof of shipped test code.

Bazel inspection is always `partial`: macros, selects, package groups, external dependencies and other dynamic graph features are not resolved. In a Bazel-only workspace, Java source, cycles, caching and CI test coverage are not analyzed; those checks are `skipped`, not reported clean. See the [Bazel reference](skills/monorepo-doctor/references/bazel.md) for the exact supported syntax.

When Nx is present, it also reads `nx.json`, `project.json`, package `nx` targets, tags, target defaults, named inputs, and local Nx graph output when the local `nx` binary is installed. When Turborepo is present, it reads `turbo.json`, package-level Turbo overrides, dry-run metadata when local `turbo` is installed, and `turbo boundaries` output when available.

Turbo boundary configuration is also checked without a local binary when a supported version is established (stable 2.x >= 2.5.0). It catches root-only `boundaries.tags` placed in a package config and root rule names that collide with workspace package names. Turbo tags and policies remain optional: absent rules and untagged packages are not findings, and package names in allow/deny lists are valid.

### Nx and Turborepo coverage

The checks cover the same risks where possible, but respect each tool's configuration and defaults.

| Capability | Nx | Turborepo |
|---|---|---|
| Unnecessarily disabled caching (low) | `caching/nx-cache-disabled`: effective explicit `cache: false` on deterministic targets, after compatible defaults and project/package overrides. | `caching/turbo-cache-disabled`: explicit `cache: false` on deterministic tasks. |
| Boundary configuration | Missing/permissive ESLint enforcement and untagged projects under those conditions. | `boundaries/turbo-package-boundaries-tags` and `boundaries/turbo-tag-package-name-collision` (medium); optional tags/policies are not required. |
| Affected CI comparison (high) | `ci-coverage/nx-affected-base-missing`: no configured base or SHA setup. | `ci-coverage/turbo-invalid-comparison-base`: a proven broken comparison, not merely an omitted explicit base. |
| Dependency-aware test caching | `ci-coverage/nx-test-inputs-ignore-deps` | `ci-coverage/turbo-test-missing-dependson` |
| Repeated dry-run hash comparison | No equivalent in the read-only workflow. | `caching/unstable-hash`, when local Turbo is installed. |

Intentionally uncached side-effecting or external-state-dependent tasks are excluded. Unresolved Nx inference or Turbo runtime comparison values produce a `partial` check with a reason, not speculative findings. Shared Nx defaults are reported once per source config object, with affected project/target pairs in evidence rather than `location.package`.

See the [caching guide](https://monorepo-skills.dev/guides/caching-and-stale-results/), [CI guide](https://monorepo-skills.dev/guides/ci/), and [skill overview](https://monorepo-skills.dev/skills/monorepo-doctor/) for examples and limits.

## Install

Install from the repository with:

```bash
npx skills add santoshyadavdev/monorepo-doctor
```

The CLI lets you pick which skills to install. To install one directly, add `--skill monorepo-doctor`, `--skill monorepo-boundaries-cleanup` or `--skill polyrepo-tax`.

Manual installation is also supported. Copy `skills/monorepo-doctor`, `skills/monorepo-boundaries-cleanup` and/or `skills/polyrepo-tax` (including its `scripts/` folder) into one of these locations:

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

Price your polyrepo setup and decide whether to migrate:

```text
Use polyrepo-tax on acme/web-app, acme/admin-app and acme/ui-lib for the last 12 months. Our loaded cost is $120/hour.
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

The skill may run the Node snippets in `skills/monorepo-doctor/references`, `npm pack --dry-run --json --ignore-scripts`, and the repo's own `node_modules/.bin/knip`, `publint`, `nx` and `turbo` only when detection finds them installed. It downloads nothing at runtime by default; only if you explicitly allow downloads in your prompt may it fetch the pinned `knip@6.41.0` and `publint@0.3.25` (with install scripts disabled). Nx and Turbo commands are limited to graph, dry-run JSON, and boundaries inspection, never real task execution. Nx graph runs as `NX_DAEMON=false NX_NO_CLOUD=true NX_WORKSPACE_DATA_DIRECTORY="$W/nx-data" ./node_modules/.bin/nx graph --file="$W/nx-graph.json"` so it does not create `.nx/workspace-data` in the audited repo or start the daemon. Turbo commands use `TURBO_TELEMETRY_DISABLED=1`; `turbo --dry=json` and `turbo boundaries` should not write project files beyond Turborepo's own cache directory.

Without `node_modules`, or when `knip`/`publint` aren't installed locally and downloads aren't allowed, those steps are skipped and the check is marked `partial`. `knip` and Nx load repository configuration files, which can execute config code; run the skill only on repositories you trust. Without a local Nx or Turborepo binary, the skill still performs static config analysis, but graph refreshes, Turbo dry-run hash comparisons, and `turbo boundaries` are skipped or marked `partial`.

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

### Runnable React + Turborepo sample

[`examples/react-turbo`](examples/react-turbo/) contains two React apps
(storefront and admin) and four shared libraries using npm workspaces and Turbo.
It intentionally seeds boundary, file-cycle, caching, CI test-cache, and package
leakage problems while remaining runnable. Its README includes setup, audit
prompts, suggested repairs, and a report-verification command using
[`fixtures/expected/react-turbo.json`](fixtures/expected/react-turbo.json).

### Runnable Angular + Nx sample

[`examples/angular-nx`](examples/angular-nx/) is an integrated Nx workspace with
two Angular apps (storefront and admin) and four libraries defined by
`project.json` files and `tsconfig.base.json` path aliases. It intentionally
seeds Nx-specific problems: a relative deep import, missing module-boundary
enforcement and an untagged project, a file cycle, missing build outputs, no
`production` named input, disabled typecheck caching, dependency-blind test
inputs, an `nx affected` run without a base, and a build tsconfig that compiles
specs. Its README includes setup, suggested repairs, and a report-verification
command using
[`fixtures/expected/angular-nx.json`](fixtures/expected/angular-nx.json).

### Bazel + rules_js audit fixture

[`examples/bazel-rules-js`](examples/bazel-rules-js/) overlays Bazel
`rules_js` targets on a small npm workspace. It seeds a JS deep import, an
internal target with public visibility, and a production target depending on a
`testonly` target. The Bazel checks are static and always report partial
status.
Its README has the audit prompt and report-verification command for
[`fixtures/expected/bazel-rules-js.json`](fixtures/expected/bazel-rules-js.json).

### Bazel + Java audit fixture

[`examples/bazel-java`](examples/bazel-java/) is a standalone Bazel Java
workspace with a runnable catalog app and test. It needs no npm workspace;
the audit uses Node.js, while building uses Bazel and a Java toolchain. The
fixture seeds a publicly visible internal target and an invalid production
dependency on test-only data. Its README lists the valid run/test targets and
the report-verification command for
[`fixtures/expected/bazel-java.json`](fixtures/expected/bazel-java.json).

Run the tooling with Node ≥ 22.5:

```bash
npm test
npm run check
```

Fixtures live under `fixtures/` and describe seeded monorepo problems for generic pnpm, Nx, Turborepo, and Bazel JS/Java workspaces. Expected findings live in `fixtures/expected/*.json`.

The caching check includes `caching/nx-cache-disabled` and `caching/turbo-cache-disabled` for deterministic tasks explicitly configured not to cache; deliberately uncached tasks are excluded. The Nx fixture covers shared defaults, executor-key precedence, package targets, project overrides, and deliberate uncached tasks. Fixture contracts can select findings by `id` and optional `package` / `file` / `evidenceIncludes` (an array of required literal substrings, all matched in the finding's evidence); optional `mustNotFind` entries reject false positives at every severity (unlike `cleanPackages`, which allows low-severity findings).

The Turborepo CI fixtures distinguish shallow history from invalid comparison ranges: `invalid-affected-base.yml` compares `HEAD` to itself using env overrides; `invalid-filter-base.yml` uses `[HEAD...HEAD]`, which valid env overrides cannot repair. Both have full history. `valid-comparison-bases.yml` covers automatic PR/push defaults, explicit PR endpoints, non-Git filters, task-argument forwarding, and a union that still selects all packages. `unknown-comparison-base.yml` requires a partial CI-coverage reason, not a speculative invalid-base finding.

Use `scripts/verify-fixture.mjs` to compare a generated report with an expected fixture contract:

```bash
node scripts/verify-fixture.mjs "$(node -p 'require("os").tmpdir()')/monorepo-doctor-reports/monorepo-doctor-report.json" fixtures/expected/generic-pnpm.json
```

Expected entries accept an optional `file` (matching `location.file`) as well as `package`. Optional `mustNotFind` entries use the same matching rules to reject false positives; the Turbo contract uses them to protect valid defaults and prevent duplicate shallow-history findings. These contracts verify agent-generated reports; the Node tests exercise the verifier, not an automated implementation of the agent's semantic audit.

Optional `checks` entries match `report.checks` by `check` and require the specified `status`. A `reasonIncludes` array requires a nonempty string reason containing every literal substring. The Turbo contract requires `ci-coverage` to be `partial` with a reason naming `unknown-comparison-base.yml` and stating `unavailable runtime comparison`, while still rejecting an invalid-base finding for that workflow.

`npm run check` validates every skill's frontmatter, reference links, and (for monorepo-doctor) finding-id coverage. It should print:

```text
✓ monorepo-boundaries-cleanup is consistent
✓ monorepo-doctor is consistent
✓ polyrepo-tax is consistent
```

### polyrepo-tax fixture and sample report

[`fixtures/polyrepo/make-fixture.mjs`](fixtures/polyrepo/make-fixture.mjs) builds four small git repositories with dated history: a UI library, two apps that consume it, and an unrelated docs site. It seeds a reverted bump, a fix copied into three repos, a post-bump fix, a fix that ships through a bump, a ticket split across repos, a CI change repeated per repo, and a React 17/18 conflict. `scripts/polyrepo-tax.test.mjs` asserts what the analyzer finds in it.

The docs site serves a sample report built from that fixture at [`site/public/examples/polyrepo-tax-report.html`](site/public/examples/polyrepo-tax-report.html). Regenerate it after changing the analyzer or renderer; `npm test` fails while it is stale:

```bash
node scripts/build-polyrepo-sample.mjs
```

### Docs site

The docs at [monorepo-skills.dev](https://monorepo-skills.dev) are an [Astro Starlight](https://starlight.astro.build) site in `site/`. Reference pages, `llms.txt`, and the raw `/skills/**` files are generated from `skills/`, so edit the skill files rather than generated pages.

```bash
cd site && npm ci && npm run dev
```

The site is deployed to Cloudflare Workers (static assets) by Workers Builds, configured in `site/wrangler.jsonc`. `.github/workflows/docs.yml` only runs a build check.
