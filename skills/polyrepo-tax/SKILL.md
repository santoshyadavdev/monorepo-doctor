---
name: polyrepo-tax
description: Use when a user wants to know what their polyrepo setup costs - bugs from version drift and cross-repo changes, developer and CI time spent on internal dependency bumps, releases and duplicated fixes - converted to money, or wants a business case and migration plan for moving several repositories into a monorepo. Read-only; analyzes git history and writes Markdown and JSON reports.
---

# Polyrepo Tax

Measure what splitting code across repositories costs an organization, from the
repositories' own git history: bugs attributable to repo boundaries, developer
hours and CI minutes spent moving code between repos, the equivalent money, and
a migration plan for the repos that would actually benefit.

Prerequisites: Node ≥ 22.5 and git. Optional: an authenticated `gh` CLI for real CI minutes.
`$S` is this skill's directory (the one holding this file). The work dir is `$W` = `$(node -p 'require("os").tmpdir()')/polyrepo-tax`.

## Rules

- **Read-only.** Never push, open PRs, edit files or run builds in the analysed repos. Allowed writes: clones and config under `$W`, and the reports (default `${tmpdir}/polyrepo-tax-reports`, or a user-given dir).
- Allowed commands: `git clone --bare` / `git fetch` into `$W`, read-only `git` (`log`, `show`, `ls-tree`, `for-each-ref`, `rev-parse`), `node $S/scripts/analyze.mjs`, `node $S/scripts/fetch-ci.mjs` (only `gh api` GETs), and `gh repo list` to discover repos.
- **Estimates, not invoices.** Every number must trace to commits or to a stated assumption. Never invent counts, rates, incidents or CI minutes. Use the user's numbers when given; otherwise use the defaults and label them as defaults.
- **Attribution, not blame.** Bugs are "attributable to repo boundaries" with a confidence level, never "caused by" a person. Do not name individual authors in the summary.
- **Honest recommendation.** If the measured tax is small, coupling is low or payback is longer than the user's horizon, say that a monorepo is not worth it (or only for one cluster). Never inflate assumptions to reach a target.
- Use only the bug categories defined in [references/signals.md](references/signals.md).

## Workflow

1. **Collect inputs** — follow [references/inputs.md](references/inputs.md): get the repo list, the window, internal package scopes, the loaded developer rate and the CI price. Clone the repos with full history into `$W/repos` and write `$W/polyrepo-tax.config.json`.
2. **CI minutes (optional)** — if the repos are on GitHub and `gh auth status` succeeds, run `fetch-ci.mjs` as described in inputs.md. Otherwise skip it: the analyzer uses `ciMinutesPerCommit` and marks CI as `assumed`.
3. **Analyze** — `node "$S/scripts/analyze.mjs" --config "$W/polyrepo-tax.config.json" --out <report dir>`. Signal definitions are in [references/signals.md](references/signals.md); the cost formulas are in [references/cost-model.md](references/cost-model.md).
4. **Review** — read the high- and medium-confidence bugs in the JSON report. For each one that the commit evidence does not support (for example `git show <sha>` shows an unrelated change), add the full SHA to `excludeCommits` in `$W/overrides.json` and rerun step 3 with `"overrides": "overrides.json"` in the config. Tell the user how many you excluded and why.
5. **Migration plan** — follow [references/migration.md](references/migration.md) to turn the report's `migration` section into a phased plan. Append it to the Markdown report under `## Migration plan`.
6. **Present** — follow [references/report-format.md](references/report-format.md): where the reports are, the headline numbers as a range, the top bugs with evidence, the assumptions that drive most of the cost, and the recommendation.

## Tracking

Create a todo per workflow step and mark each done when its output exists.
