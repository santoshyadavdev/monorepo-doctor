# Step 5 — Migration plan

Write the plan from the report's `migration` section. Use only facts from the report and the repos; mark anything else as a suggestion.

## Decide scope first

- **Migrate:** the coupled clusters in `migration.clusters`, heaviest first.
- **Keep separate:** `migration.isolated`. Say why: no shared packages, no co-changes and no shared bugs in the window.
- **Don't migrate at all** when expected payback is longer than 24 months, or the user's horizon if they gave one, or every cluster has a weight below 5. Say so plainly, and suggest cheaper fixes for the top cost drivers instead: Renovate grouping and automerge for internal bumps, a shared CI template, contract tests between producer and consumer.

## Why migrate and tool options

The report carries two sections built from a dated snapshot of [monorepo.tools](https://monorepo.tools/) (`scripts/monorepo-tools.json`). Copy them into the plan as they are. Do not add tools, change ratings or give reasons the report does not list.

- **Why migrate** — `migration.whyMigrate`: the polyrepo costs monorepo.tools names (cumbersome code sharing, code duplication, costly cross-repo changes, hard-to-enforce conventions). Each appears only when this report measured evidence for it, with the counts. Present it as monorepo.tools' reasons, backed by this team's numbers.
- **Tool options** — `migration.toolOptions`: every tool monorepo.tools compares, not just one pick. Show all of them in a table with the rating, the per-category counts, the partial and unsupported counts, fit and whether the team already uses the tool.
  - **monorepo.tools rating /10** = 10 × the features monorepo.tools marks "natively supported" ÷ the number of compared features. "Implement your own" and "community provided" are counted but not scored. Always call it the monorepo.tools rating, never just "the rating" or a neutral score.
  - **Sources** — list every source under the table, monorepo.tools first, each with its publisher, retrieval date, role and coverage: monorepo.tools (published by Nx, scored), State of JS 2024 and 2025, and the Thoughtworks Radar (independent, not scored). The report renders this list; keep it when copying the table.
  - **Fit** is `no` only when monorepo.tools marks polyglot support "not supported" and the repos contain more than JS/TS. Otherwise every tool fits; don't infer more.
  - State `migration.toolSource`: the URLs, the snapshot date, and that monorepo.tools is made by Nx and accepts corrections by pull request. A feature count isn't a quality score: the team's stack, existing tools and skills matter too. Call those out as considerations, not as rating changes.
  - **Independent signals (not scored)** — each option carries `independent`, from sources that aren't tool vendors: State of JS 2024 satisfaction (with its 2021 value), State of JS 2025 regular-use counts, and the Thoughtworks Technology Radar ring. They cover only some tools. Show "—" where none applies, never fill a gap, and never fold them into the rating: they measure sentiment, usage or expert opinion, not features. Say that every Radar blip shown is archived (none is on the current edition), and give its date.
  - If the snapshot is older than about six months, or the user doubts a mark, tell them to check monorepo.tools/compare and update `scripts/monorepo-tools.json`. The same applies to new State of JS editions or Radar volumes. Never patch marks or signals from memory.

## Plan template

Write this to `migration-plan.md` in the report directory, filled in, append it to `polyrepo-tax-report.md`, then re-render the HTML report (`render-html.mjs` embeds `migration-plan.md` from the same directory):

1. **Target layout and tooling** — the tool options table, then the pick: `migration.recommendedTool` is the stack-based default. If the team chooses another fitting tool from the table, use that one. Propose `apps/<repo>` for deployables and `packages/<name>` for libraries. If one repo already uses Nx, Turborepo or Bazel, build on it rather than adding a second tool.
2. **Phase 0 — prepare (no repo moves).**
   - Align each entry in `migration.externalConflicts`, starting with those in the most repos. Each is a normal PR in the existing repo.
   - Agree on one package manager, Node version and lint/format config (from `repos[].packageManager`, `nodeVersion`).
   - Freeze new internal packages outside the monorepo.
3. **Phase 1 — first cluster.** Import the producer libraries, then their consumers, keeping history:
   - Nx: `nx import <repo-url> <dest-dir>`
   - Otherwise: `git subtree add --prefix=<dest-dir> <repo-url> <branch>`, or rewrite with `git filter-repo --to-subdirectory-filter <dest-dir>` and merge with `--allow-unrelated-histories`.
   - Replace internal version ranges with `workspace:*` and delete the publish step for packages no external consumer uses.
   - Set up affected-only CI (`nx affected` / `turbo run --affected` / Bazel target selection) so a change runs only the tests it can break.
   - Move each repo's CODEOWNERS entries under its new directory.
   - Archive the old repo (read-only, README pointing to the new path) once its last open PRs are merged or moved.
4. **Phase 2+** — the next clusters in order of weight.
5. **Verify** — run the `monorepo-doctor` skill on the new monorepo for boundaries, cycles, caching, CI coverage and test leakage. Use `monorepo-boundaries-cleanup` to pay down what it finds.
6. **Measure** — rerun polyrepo-tax on the old repos for the pre-migration window, and track bumps, duplicated fixes and regressions after the move.

State the one-time effort (`migration.oneTime`) and payback range, and the risks: CI capacity during the transition, history-rewrite mistakes, ownership disputes, and teams that release independently.
