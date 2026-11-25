## Migration plan

1. **Target layout and tooling** — pnpm workspaces + Turborepo: `packages/ui` (from `ui-lib`), `apps/web` (from `web-app`), `apps/admin` (from `admin-app`). `docs-site` stays in its own repo: no shared packages, co-changes or shared bugs in the window.
2. **Phase 0 — prepare (no repo moves).**
   - Upgrade `react` from v17 to v18 in `admin-app`, in its own PR.
   - Agree on pnpm, one Node version and one lint/format config.
   - No new internal packages outside the monorepo.
3. **Phase 1 — import with history.** `ui-lib` first, then `web-app` and `admin-app`, each with `git subtree add --prefix=<dest> <repo-url> main`.
   - Replace `@acme/ui` version ranges with `workspace:*` and drop its publish step.
   - CI runs `turbo run test --affected` so a change to `packages/ui` runs both apps' tests before merge.
   - Move CODEOWNERS entries under each new directory; archive the old repos once open PRs are merged or moved.
4. **Verify** — run `monorepo-doctor` on the new monorepo, then `monorepo-boundaries-cleanup` for what it finds.

| Phase | Repos | Effort |
|---|---|---|
| 0 | admin-app | 0.5 dev-days |
| 1 | ui-lib, web-app, admin-app | 9 dev-days |

Risks: CI capacity during the transition, mistakes in the history import, and ownership of `packages/ui`.
