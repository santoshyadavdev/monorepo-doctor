# Angular + Nx audit playground

A runnable integrated Nx workspace with **two Angular apps and four libraries**.
It contains intentional audit findings; it is not a production-ready template.
Prices are integer cents and all catalog data is local, with no services or
credentials.

| Project | Path | Purpose |
|---|---|---|
| `storefront` | `apps/storefront` | Angular storefront, port 4200 |
| `admin` | `apps/admin` | Angular catalog admin, port 4201 |
| `ui` | `libs/ui` | Shared standalone product-card component |
| `data` | `libs/data` | Catalog and internal inventory |
| `utils` | `libs/utils` | Price and name formatting; the only buildable library |
| `test-utils` | `libs/test-utils` | Product factories, used only by tests |

Projects are defined by `project.json` files (no per-project `package.json`).
Libraries are imported through the `@sample/*` path aliases in
`tsconfig.base.json`, and the Angular application builder compiles them from
source into each app. Both apps depend on UI and data; admin, UI and data use
utils; UI tests use test-utils. Unit tests use Vitest on plain TypeScript
models; the root `vitest.config.mts` maps the same aliases.

The stack is Angular 21.2 (standalone, zoneless), Nx 24, TypeScript 5.9 and
Vitest 4. Angular 21 is used because Nx 24.0's Angular builder adapter cannot
yet load Angular 22's builder packages.

## Run it

Use Node >= 22.5 and npm 10 or later. From this directory:

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run dev
```

Open <http://localhost:4200> and <http://localhost:4201>. To start only one app:

```bash
npx nx serve storefront
```

`npx nx graph` shows the project graph. Source-file analysis is enabled
explicitly in `nx.json` (`pluginsConfig["@nx/js"].analyzeSourceFiles`), so Nx
infers project dependencies from imports.

## Audit it

Install the skill using the [repository instructions](../../README.md#install),
then start your agent **in this directory**, not the parent repository:

```text
Run monorepo-doctor on this workspace. Write reports to the default report directory.
```

The audit itself must not install dependencies, build, or run tests. You can
audit before installing; Nx graph inspection will then be partial. Knip and
publint are not installed here, so those optional inspections remain partial.

After the agent writes its report, verify it from the **parent repository root**:

```bash
node scripts/verify-fixture.mjs \
  "$(node -p 'require("os").tmpdir()')/monorepo-doctor-reports/monorepo-doctor-report.json" \
  fixtures/expected/angular-nx.json
```

This checks an actual agent-generated report, not a canned report or an automated
implementation of the skill.

## Seeded use cases

| Check | Seed and expected finding | Suggested repair |
|---|---|---|
| Boundaries | `storefront.model.ts` imports `../../../../libs/data/src/lib/inventory` by relative path: `boundaries/deep-import`. | Expose what the storefront needs (e.g. stock) from `@sample/data` and import the alias. |
| Boundaries | No ESLint config uses `@nx/enforce-module-boundaries`: `boundaries/nx-missing-module-boundaries-rule`. | Add the rule with `depConstraints` based on the existing `scope:*` / `type:*` tags. |
| Boundaries | `libs/data/project.json` has `"tags": []` while every other project is tagged: `boundaries/nx-untagged-project`. | Tag it, e.g. `["scope:shared", "type:data"]`. |
| Circular dependencies | `data/src/lib/catalog.ts` and `inventory.ts` import each other: `circular-deps/file-cycle` (low; each import is read only inside a function). | Move the product list into a dependency-free module. |
| Caching | `utils:build` runs `tsc` into `dist/out-tsc/utils`, outside Nx's default outputs, with no `outputs`: `caching/missing-outputs`. A cache hit cannot restore the compiled files. | Add `"outputs": ["{workspaceRoot}/dist/out-tsc/utils"]`. |
| Caching | `nx.json` has no `production` named input, and build uses default inputs: `caching/build-inputs-include-tests`. | Add a `production` input that negates `*.spec.ts`, and use `["production", "^production"]` for build. |
| Caching | `targetDefaults.typecheck` sets `"cache": false` for both apps' deterministic `tsc --noEmit`: `caching/nx-cache-disabled`. | Set `"cache": true` with appropriate inputs. |
| CI coverage | `targetDefaults.test.inputs` is `["default"]`, with no `^` entry: `ci-coverage/nx-test-inputs-ignore-deps`. Changing utils can replay cached admin tests. | Use `["default", "^production"]`. |
| CI coverage | The nested workflow runs `nx affected` with no `--base`, no `nrwl/nx-set-shas`, no `NX_BASE` and no `defaultBase`: `ci-coverage/nx-affected-base-missing`. Nx then compares against `main`, which may not exist. | Add `nrwl/nx-set-shas@v4` before `nx affected`. |
| Production leakage | `libs/utils/tsconfig.lib.json` includes `src/**/*.ts` without excluding specs: `prod-leakage/build-tsconfig-includes-tests`. After a build, `dist/out-tsc/utils/lib/price.spec.js` exists. | Add `"exclude": ["src/**/*.spec.ts"]`. |

The nested `.github/workflows/ci.yml` is audit input. It becomes active only if
this example is copied to its own repository root. It fetches full history and
runs tests before landing; those are not seeded problems.

There is deliberately **no project dependency cycle**, no untagged project other
than `data`, no permissive boundary rule (the rule is absent), and no project
without a test target. The apps' `tsconfig.app.json` files exclude specs. The
`serve` target is explicitly uncached and `continuous`; that is intentional and
should not be flagged. The contract lists these negative controls too.
Additional evidence-backed findings are allowed; for example, running
`npm run build` first can also surface `prod-leakage/test-files-in-build-output`
for utils. The contract does not require an exact finding count.

To experiment with repairs, copy this directory to a separate repository first.
The expected contract describes the original broken configuration and should
stop passing as you fix the seeds.
