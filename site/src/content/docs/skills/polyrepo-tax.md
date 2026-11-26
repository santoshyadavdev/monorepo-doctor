---
title: polyrepo-tax
description: A read-only skill that prices what a polyrepo setup costs — bugs attributable to repo boundaries, developer time and CI time — and plans a monorepo migration only where it pays back.
---

`polyrepo-tax` builds the business case for (or against) a monorepo from the git history of the repositories your team uses and contributes to. It is **read-only**: it clones the repos as bare repositories and runs only read-only `git` commands, plus optional `gh api` GET requests for CI minutes.

```text
Use polyrepo-tax on acme/web-app, acme/admin-app, acme/ui-lib and acme/api-client for the last 12 months. Our loaded cost is $120/hour.
```

See the [sample report](/sample-reports/polyrepo-tax/) (interactive HTML or a downloadable image), and the [walkthrough](/guides/polyrepo-to-monorepo/) from picking repos to presenting the result.

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
- **Why migrate**, using the polyrepo costs [monorepo.tools](https://monorepo.tools/) lists: cumbersome code sharing, code duplication, costly cross-repo changes and drifting conventions. Each reason appears only when the analysis measured evidence for it, such as internal bumps, duplicated fixes, coordinated changes or version skew.
- **Every tool option, rated out of 10.** The report lists all nine tools on [monorepo.tools/compare](https://monorepo.tools/compare): Bazel, Gradle, Lage, Lerna, moon, Nx, Pants, Rush and Turborepo. The **monorepo.tools rating** comes from a dated snapshot of that matrix: 10 × the features marked "natively supported" ÷ 20. "Implement your own" and "community provided" marks are shown but not scored. A tool is marked as not a fit only when monorepo.tools says it lacks polyglot support and your repos contain more than JS/TS. Languages are detected by file extension: JVM (Java, Kotlin, Groovy), Scala, Clojure, .NET (C#, F#, VB.NET), C/C++, Objective-C, Go, Rust, Zig, Swift, Dart, Python, Ruby, PHP, Perl, Lua, Elixir/Erlang, Haskell and OCaml. monorepo.tools is made by Nx and accepts corrections by pull request. The report says so, and the snapshot lives in `skills/polyrepo-tax/scripts/monorepo-tools.json`.
- **A sources list under the table** names monorepo.tools as the scored source, published by Nx, beside the independent ones.
- **Independent signals next to each rating**, from sources that aren't tool vendors. They're shown but never scored:
  - [State of JS 2024](https://2024.stateofjs.com/en-US/libraries/monorepo_tools/) satisfaction, with the 2021 value for trend.
  - [State of JS 2025](https://2025.stateofjs.com/en-US/other-tools/) regular-use counts.
  - The [Thoughtworks Technology Radar](https://www.thoughtworks.com/radar) ring.

  They cover only some tools. The surveys cover Lerna, Nx, Rush and Turborepo, plus moon as a write-in. The Radar has archived blips for Nx, Turborepo and Gradle, none of them on the current edition. Tools with no coverage show a dash.
- **One-time effort and payback**. If payback is longer than about two years or coupling is weak, the skill recommends not migrating, and points at cheaper fixes such as grouped Renovate updates, shared CI templates or contract tests.

After a migration, run [monorepo-doctor](/skills/monorepo-doctor/) on the new monorepo, then [monorepo-boundaries-cleanup](/skills/monorepo-boundaries-cleanup/) to pay down what it finds.

## Output

`polyrepo-tax-report.html`, `polyrepo-tax-report.md` and `polyrepo-tax-report.json` in `${tmpdir}/polyrepo-tax-reports`, or a directory you name. The HTML report is one self-contained file (no network requests, light and dark mode, printable) meant for sharing: headline range and KPI tiles, an annualized cost-by-driver chart with a table view, bugs filterable by confidence, and the migration plan once the agent has written it. The Markdown report has the headline range, a cost table per driver, every bug with commit evidence, internal-dependency churn and version skew, migration inputs and the assumptions used.

## Run the analyzer directly

```bash
node skills/polyrepo-tax/scripts/analyze.mjs ../ui-lib ../web-app ../admin-app \
  --since 2025-11-25 --rate 120 --ci-rate 0.008 --scope @acme/ --out ./reports
```

Add `--ci ci.json` with output from `skills/polyrepo-tax/scripts/fetch-ci.mjs`, `--public <pkg>` for packages also consumed outside these repos, and `--overrides overrides.json` (`{"excludeCommits": ["<sha>"]}`) to drop false positives after review.
