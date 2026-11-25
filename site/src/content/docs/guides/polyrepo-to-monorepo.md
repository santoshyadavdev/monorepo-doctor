---
title: Build the business case for a monorepo
description: Use polyrepo-tax to measure what splitting code across repositories costs in bugs, developer time and CI, decide whether a monorepo pays back, and plan the migration.
---

"Should we move to a monorepo?" usually gets argued from opinion. [polyrepo-tax](/skills/polyrepo-tax/) answers it from evidence: the git history of the repositories your team already works across. It is read-only, and its answer is allowed to be **no**.

:::tip[See the output first]
Open the [sample HTML report](/examples/polyrepo-tax-report.html). It was generated from four small test repos with planted history: a UI library, two apps that consume it, and an unrelated docs site.
:::

## 1. Pick the repositories

List the repos your team uses **and contributes to**: the apps, and the internal libraries they consume. A library left out can't show up as a dependency, so its bumps and regressions are missed.

You need Node ≥ 22.5 and git. For measured CI minutes, also an authenticated [`gh` CLI](https://cli.github.com); without it, CI time is assumed and labelled as such.

## 2. Ask your agent

```text
Use polyrepo-tax on acme/web-app, acme/admin-app, acme/ui-lib and acme/api-client
for the last 12 months. Our loaded developer cost is $120/hour.
```

The agent asks once for anything missing, with defaults you can accept:

| Input | Default | Why it matters |
|---|---|---|
| Window | last 12 months | Shorter windows are noisier; results are annualized. |
| Loaded cost per developer hour | 100 USD | Converts hours to money. Salary + benefits + overhead ÷ working hours. |
| CI price per minute | 0.008 USD | Larger, macOS or self-hosted runners cost differently. |
| Internal package scopes | packages the repos publish | e.g. `@acme/`, for libraries in repos you didn't list. |
| Packages used outside these repos | none | Their releases continue after a migration, so they're not counted as waste. |

It then clones each repo as a bare clone with full history into a temp directory. It never pushes, edits or builds anything.

## 3. Review what it found

Before presenting numbers, the agent reads every high- and medium-confidence bug and excludes any that the commit evidence doesn't support, then reruns. You should skim them too: each one lists its commits.

| Category | Confidence | Example |
|---|---|---|
| `dependency-regression` | high | `web-app` reverts its bump of `@acme/ui` 2.0 |
| `duplicated-fix` | medium | `fix: date parsing in timezone offsets` lands in three repos in one week |
| `cross-repo-fix` | medium | Fix commits in `api` and `web-app` share ticket `PAY-42` |
| `fix-propagation` | medium | A fix only reaches `web-app` by releasing and bumping `@acme/money` |
| `post-bump-fix` | medium / low | `fix: adapt checkout to @acme/ui Button API`, two days after a bump |

Counts are a floor: a bug fixed without a fix-like commit subject is invisible to git history. See [signals](/reference/polyrepo-tax/signals/) for the exact rules and blind spots.

## 4. Read the report

The skill writes `polyrepo-tax-report.html`, `.md` and `.json`. The HTML report is the one to share. It's a single file that makes no network requests, but it contains repo names, commit subjects and SHAs, so treat it as confidential as the repos.

- **Headline:** the polyrepo tax per year as a range. Low counts high-confidence bugs only, high counts every bug, and expected is in between. Quote the range, not only the expected number.
- **Where the money goes:** annualized cost per driver: internal bumps, internal releases, coordinated changes, repeated maintenance, and each bug category. Hover a bar for hours, CI minutes and how much a monorepo removes.
- **Verdict and payback:** one-time migration effort against yearly savings, for the repos that would move.
- **Migration:** coupled clusters, isolated repos to keep separate, coupling between repo pairs, and external dependencies to align first.
- **Assumptions:** every hour estimate and rate the numbers depend on.

When someone challenges a number, change the assumption, not the conclusion. The [cost model](/reference/polyrepo-tax/cost-model/) lists each one (for example 8 hours per bug, 0.5 hours per manual bump), and the report names the two drivers that dominate.

## 5. Decide

| The report shows | Do this |
|---|---|
| Payback within about two years and a cluster with coupling weight ≥ 5 | Migrate that cluster first; leave isolated repos alone. |
| Short payback but weak coupling | Treat it as a small, uncertain gain. Fix the top drivers in place first. |
| Payback longer than two years, or none | Don't migrate. Group Renovate updates, share a CI template, add contract tests between producer and consumer. |

On the public [unjs](https://github.com/unjs) repos (`ufo`, `defu`, `ofetch`, `h3`, `destr`), the measured tax is about $640 a year against roughly $11,600 of migration effort. The skill says not to migrate. It still finds one real duplicated fix shared by `ufo` and `h3`.

## 6. Plan and migrate

When the answer is yes, the agent writes a phased plan into the report:

1. **Phase 0, no repo moves:** align conflicting external dependency majors, and agree on one package manager, Node version and lint config.
2. **Phase 1:** import the heaviest cluster with history (`nx import`, `git subtree add` or `git filter-repo`). Replace internal version ranges with `workspace:*`, and set up affected-only CI.
3. **Next phases:** the remaining clusters, in order of coupling.

Then run [monorepo-doctor](/skills/monorepo-doctor/) on the new monorepo and pay down what it finds with [monorepo-boundaries-cleanup](/guides/doctor-to-cleanup/). A few months later, rerun polyrepo-tax on the old repos' history to compare against bumps and duplicated fixes after the move.
