# Step 5 — Migration plan

Write the plan from the report's `migration` section. Use only facts from the report and the repos; mark anything else as a suggestion.

## Decide scope first

- **Migrate:** the coupled clusters in `migration.clusters`, heaviest first.
- **Keep separate:** `migration.isolated`. Say why: no shared packages, no co-changes and no shared bugs in the window.
- **Don't migrate at all** when expected payback is longer than 24 months, or the user's horizon if they gave one, or every cluster has a weight below 5. Say so plainly, and suggest cheaper fixes for the top cost drivers instead: Renovate grouping and automerge for internal bumps, a shared CI template, contract tests between producer and consumer.

## Plan template

Append this under `## Migration plan` in the Markdown report, filled in:

1. **Target layout and tooling** — `migration.recommendedTool`. Propose `apps/<repo>` for deployables and `packages/<name>` for libraries. If one repo already uses Nx, Turborepo or Bazel, build on it rather than adding a second tool.
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
