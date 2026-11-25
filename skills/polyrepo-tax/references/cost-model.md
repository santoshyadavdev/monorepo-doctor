# Cost model

`cost = developer hours × developerHourly + CI minutes × ciPerMinute`, computed per cost driver, then annualized as `cost × 365 / window days`.

## Assumptions

All are overridable through `assumptions` in the config. The report prints the values it used.

| Name | Default | Used for |
|---|---:|---|
| `bumpHumanHours` | 0.5 | Each internal bump by a person: open, review, merge, babysit CI. |
| `bumpBotHours` | 0.2 | Each internal bump by a bot: review and merge. |
| `releaseHours` | 0.5 | Each internal release consumed by a sibling repo, except `publicPackages`. |
| `coordinationHoursPerExtraRepo` | 2 | Each extra repo in a coordinated change: sequencing PRs, waiting on releases, cross-repo review. |
| `duplicateChangeHoursPerCopy` | 1 | Each extra copy of a repeated maintenance change or duplicated fix (`bumpBotHours` instead when every copy is by a bot). |
| `bugHours` | 8 | Each bug: triage, fix, review, release, bump. Duplicated fixes add `duplicateChangeHoursPerCopy` per extra repo. |
| `ciMinutesPerCommit` | 15 | CI minutes per landed commit when a repo has no CI data. With CI data: `totalMinutes ÷ commits in window`. |
| `bumpFixWindowDays` | 7 | `post-bump-fix` window. |
| `groupWindowDays` | 14 | Max spread of one cross-repo group. |
| `similarity` | 0.75 | Subject similarity threshold. |
| `migrationDaysPerRepo` | 3 | One-time import + CI + ownership work per migrated repo. |
| `migrationDaysPerConflict` | 0.5 | One-time alignment per external dependency with conflicting majors. |
| `monorepoToolingMonthly` | 0 | Ongoing monorepo cost (remote cache, larger runners), subtracted before payback. |

If the user has better numbers (for example "a production incident costs us 20 hours on average"), use them and say so.

## CI minutes per driver

Each driver's commits (bump commits, release commits, every commit in a bug, each extra-repo commit in a group) × that repo's CI minutes per commit. This treats an overhead commit as costing as much CI as an average landed change in that repo, including its PR runs.

## Scenarios

| Scenario | Bugs included |
|---|---|
| `low` | high confidence only |
| `expected` | high + medium |
| `high` | high + medium + low |

Non-bug drivers are identical across scenarios. Present `low`–`high` as the range, `expected` as the headline.

## Monorepo savings

Share of each driver a monorepo with workspace dependencies (`workspace:*`), affected-only CI and atomic commits removes:

| Driver | Removed | Reason |
|---|---:|---|
| Internal bumps, internal releases | 100% | Consumers build against source; no publish/bump cycle. |
| Repeated tooling changes, duplicated fixes, fix propagation | 100% | One config and one copy of the code. |
| Coordinated changes | 75% | One atomic PR; review across teams still costs time. |
| Dependency regressions, post-bump fixes | 90% | The producer PR runs consumer tests; some breaks still slip past tests. |
| Cross-repo fixes | 50% | Atomic fix, but the bug can still happen. |

Payback months = one-time migration cost ÷ (annual savings ÷ 12 − `monorepoToolingMonthly`). One-time cost = (`migrationDaysPerRepo` × repos in coupled clusters + `migrationDaysPerConflict` × external conflicts) × 8 × `developerHourly`. Isolated repos are excluded from migration cost and from the recommendation.

The model does not count costs that are real but hard to measure from git: onboarding to N toolchains, context switching, slower discovery of shared code, and security patches applied N times (unless they show up as repeated changes). Mention them qualitatively, never as numbers.
