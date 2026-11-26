# Step 6 — Report

The analyzer writes three files to the output directory (default `${tmpdir}/polyrepo-tax-reports`):

- `polyrepo-tax-report.html` — the shareable report: headline range, cost-by-driver chart, filterable bug list with commit evidence, churn, migration and assumptions. One self-contained file with no network requests, light and dark mode, printable. Re-render it with `render-html.mjs` after writing `migration-plan.md`.
- `polyrepo-tax-report.md` — the same content as Markdown; step 5 appends the migration plan.
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
| `migration` | `recommendedTool`, `toolOptions[]` (every monorepo.tools tool: `rating` /10, `counts` per mark, `categories[]`, `gaps`, `fit`, `fitReason`, `alreadyUsed`, `independent`: State of JS and Thoughtworks Radar data where a source covers the tool, else `null`), `whyMigrate[]` (monorepo.tools reasons with measured `evidence`), `toolSource` (URLs, snapshot date, publisher, legend, `independent` sources with metric and coverage), `clusters`, `isolated`, `coupling`, `externalConflicts`, `oneTime`, `paybackMonths`. |

## What to tell the user

Keep the message short; the report has the detail.

1. Paths of the reports; suggest the HTML file for sharing with leadership. It contains repo names, commit subjects and SHAs, so it is as confidential as the repos.
2. One line: expected cost for the window and annualized range, split into developer and CI money.
3. Bug counts by confidence, and the 3 strongest bugs, each with its commit evidence.
4. The two cost drivers that dominate, and the assumption each depends on, so the user knows which number to challenge.
5. The recommendation: which cluster to migrate first and its payback, which repos to keep separate, or why not to migrate. When recommending a migration, give the measured reasons from `migration.whyMigrate`, and the top fitting tools from `migration.toolOptions` with their ratings and the monorepo.tools source. The full table is in the report.
6. Data gaps: repos that failed to clone, CI that was assumed, commits you excluded in review.

Never present the expected number without the range, or money without the rates that produced it.
