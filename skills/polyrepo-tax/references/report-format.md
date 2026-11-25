# Step 6 — Report

The analyzer writes two files to the output directory (default `${tmpdir}/polyrepo-tax-reports`):

- `polyrepo-tax-report.md` — the human report; step 5 appends `## Migration plan`.
- `polyrepo-tax-report.json` — the full data.

## JSON shape (version 1)

| Key | Contents |
|---|---|
| `window`, `rates`, `assumptions` | Inputs actually used. |
| `problems` | Data problems (missing repo, shallow clone). |
| `repos[]` | Name, commit count, packages, languages, package manager, build tools, CI files, and `ci` (`minutesPerCommit`, `source`: `measured` or `assumed`). |
| `internal` | `packages` (producer → consumers), `bumps`, `releases`, `medianBumpLagDays`, `drift`, `skew`. |
| `bugs[]` | `id`, `category`, `confidence`, `repos`, `title`, `why`, `commits[]` (`repo`, `sha`, `date`, `subject`). |
| `coordinated[]`, `duplicatedTooling[]` | Cross-repo groups with commits. |
| `cost.{low,expected,high}` | `lines[]` per driver (`count`, `hours`, `ciMinutes`, `cost`, `annualCost`, `savingsShare`, `annualSavings`) and `totals`. |
| `migration` | `recommendedTool`, `clusters`, `isolated`, `coupling`, `externalConflicts`, `oneTime`, `paybackMonths`. |

## What to tell the user

Keep the message short; the report has the detail.

1. Paths of both reports.
2. One line: expected cost for the window and annualized range, split into developer and CI money.
3. Bug counts by confidence, and the 3 strongest bugs, each with its commit evidence.
4. The two cost drivers that dominate, and the assumption each depends on, so the user knows which number to challenge.
5. The recommendation: which cluster to migrate first and its payback, which repos to keep separate, or why not to migrate.
6. Data gaps: repos that failed to clone, CI that was assumed, commits you excluded in review.

Never present the expected number without the range, or money without the rates that produced it.
