# React + Turborepo audit playground

A runnable npm workspace with **two React apps and four libraries**. It contains
intentional audit findings; it is not a production-ready template. Prices are
integer cents and all catalog data is local, with no services or credentials.

| Workspace | Purpose |
|---|---|
| `apps/storefront` | React storefront, port 5173 |
| `apps/admin` | React catalog admin, port 5174 |
| `packages/ui` | Shared React product card |
| `packages/data` | Catalog and internal inventory |
| `packages/utils` | Price and name formatting; intentionally publishable |
| `packages/test-utils` | Private product factories, used only by tests |

Both apps depend on UI and data. Admin, UI, and data depend on utils.
The apps and UI use test-utils as a dev dependency. Libraries export source
directly, so they need no build step; Vite bundles them into each app.

## Run it

Use Node >= 22.5 and npm 10. From this directory:

```bash
npm ci
npm test
npm run build
npm run dev
```

Open <http://localhost:5173> and <http://localhost:5174>. To start only one app:

```bash
npm run dev -- --filter=@sample/storefront
```

## Audit it

Install the skill using the [repository instructions](../../README.md#install),
then start your agent **in this directory**, not the parent repository:

```text
Run monorepo-doctor on this workspace. Write reports to the default report directory.
```

The audit itself must not install dependencies, build, or run tests. You can
audit before installing; local Turbo inspection will then be partial. Knip and
publint are not installed here, so those optional inspections remain partial.

After the agent writes its report, verify it from the **parent repository root**:

```bash
node scripts/verify-fixture.mjs \
  "$(node -p 'require("os").tmpdir()')/monorepo-doctor-reports/monorepo-doctor-report.json" \
  fixtures/expected/react-turbo.json
```

This checks an actual agent-generated report, not a canned report or an automated
implementation of the skill.

## Seeded use cases

| Check | Seed and expected finding | Suggested repair |
|---|---|---|
| Boundaries | Storefront imports `@sample/data/src/inventory.js`: `boundaries/deep-import`. Data deliberately has no export map, so this still runs. | Export inventory from data's entry point, import it there, and add an export map. |
| Circular dependencies | `utils/src/labels.js` and `normalize.js` import each other: `circular-deps/file-cycle` (low; the imported value is read only inside a function). | Move the default label into a dependency-free module. |
| Caching | Root build task has no outputs: `caching/missing-outputs`. A cache hit replays logs but cannot restore app `dist/` files. | Add `"outputs": ["dist/**"]` to build. |
| Caching | Build has no test exclusions: `caching/build-inputs-include-tests`. | Exclude test files from build inputs while retaining `$TURBO_DEFAULT$`. |
| CI coverage | Cacheable test task is `{}`: `ci-coverage/turbo-test-missing-dependson`. Changes in workspace dependencies do not invalidate consumer test caches. | Add `"dependsOn": ["^test"]` (all six workspaces have tests). |
| Production leakage | Publishable utils has neither `files` nor `.npmignore`, so `src/index.test.js` ships: `prod-leakage/test-files-in-package`. | Allowlist production source files, or build and publish only test-free output. |

The nested `.github/workflows/ci.yml` is audit input. It becomes active only if
this example is copied to its own repository root. It runs tests before landing
and fetches full history; those are not seeded problems.

There is deliberately **no package dependency cycle** (which would prevent Turbo
from running), no undeclared workspace import, and no missing package test script.
The persistent, uncached dev task is intentional and should not be flagged.
The contract lists these negative controls too. Additional evidence-backed
findings are allowed; the contract does not require an exact finding count.

To experiment with repairs, copy this directory to a separate repository first.
The expected contract describes the original broken configuration and should
stop passing as you fix the seeds. Never publish these sample packages.
