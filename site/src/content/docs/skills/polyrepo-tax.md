---
title: polyrepo-tax
description: A read-only skill that prices what a polyrepo setup costs — bugs attributable to repo boundaries, developer time and CI time — and plans a monorepo migration only where it pays back.
---

`polyrepo-tax` builds the business case for (or against) a monorepo from the git history of the repositories your team uses and contributes to. It is **read-only**: it clones the repos as bare repositories and runs only read-only `git` commands, plus optional `gh api` GET requests for CI minutes.

```text
Use polyrepo-tax on acme/web-app, acme/admin-app, acme/ui-lib and acme/api-client for the last 12 months. Our loaded cost is $120/hour.
```

## What it measures

| Signal | Example | Confidence |
|---|---|---|
| `dependency-regression` | `web-app` rolls `@acme/ui` back from 2.0 to 1.1, or reverts the bump | high |
| `duplicated-fix` | `fix: date parsing in timezone offsets` lands in three repos in one week | medium |
| `cross-repo-fix` | `PAY-42` needs fix commits in `api` and `web-app` | medium |
| `fix-propagation` | `fix: pick up rounding fix` bumps `@acme/money` | medium |
| `post-bump-fix` | `fix: adapt checkout to @acme/ui Button API` two days after the bump | medium / low |
| Internal bumps and releases | Renovate and human bumps of internal packages, release-to-bump lag | — |
| Coordinated changes | One ticket split across repos | — |
| Repeated maintenance | The same CI, lint or dependency update applied in every repo | — |

Counts are a floor, not a total: bugs fixed without a fix-like commit subject are invisible to git history.

## How money is computed

`developer hours × loaded hourly rate + CI minutes × CI price per minute`, per cost driver, annualized. Hours come from documented per-event assumptions (for example 0.5 h per human internal bump, 8 h per bug). CI minutes per commit come from GitHub Actions history when available. The report shows a **low / expected / high** range (high-confidence bugs only → all bugs) and the share of each driver a monorepo removes. Every assumption is printed and can be overridden.

## Migration plan

The analyzer builds a coupling graph between repos from shared internal dependencies, bumps, coordinated changes and shared bugs. Repeated tooling is a cost but not coupling. From that graph it proposes:

- **Clusters** to migrate, heaviest first, and **isolated repos** to keep separate.
- **External dependency conflicts** (for example React 17 vs 18) to align before sharing one lockfile.
- **Tooling** that fits the detected stack: pnpm workspaces + Nx or Turborepo for JS/TS; Gradle or Bazel for JVM; Nx or Bazel for polyglot.
- **One-time effort and payback**. If payback is longer than about two years or coupling is weak, the skill recommends not migrating, and points at cheaper fixes such as grouped Renovate updates, shared CI templates or contract tests.

After a migration, run [monorepo-doctor](/skills/monorepo-doctor/) on the new monorepo, then [monorepo-boundaries-cleanup](/skills/monorepo-boundaries-cleanup/) to pay down what it finds.

## Output

`polyrepo-tax-report.md` and `polyrepo-tax-report.json` in `${tmpdir}/polyrepo-tax-reports`, or a directory you name. The Markdown report has the headline range, a cost table per driver, every bug with commit evidence, internal-dependency churn and version skew, migration inputs and the assumptions used.

## Run the analyzer directly

```bash
node skills/polyrepo-tax/scripts/analyze.mjs ../ui-lib ../web-app ../admin-app \
  --since 2025-11-25 --rate 120 --ci-rate 0.008 --scope @acme/ --out ./reports
```

Add `--ci ci.json` with output from `scripts/fetch-ci.mjs`, `--public <pkg>` for packages also consumed outside these repos, and `--overrides overrides.json` (`{"excludeCommits": ["<sha>"]}`) to drop false positives after review.
