# Check 5 — Test code in production

Question: do test files, fixtures or test libraries end up in a published package or a deployable build?
Output: `findings/prod-leakage.json`.

Test files are `scan.packages[p].testFiles` (the scan classifies `*.spec.*`, `*.test.*`, and files under `__tests__/`, `__mocks__/`, `test/`, `tests/`, `e2e/`, or `cypress/`) plus fixture directories (`fixtures?/`) when checking package tarballs and build outputs.
Test libraries: `vitest`, `jest`, `@jest/*`, `mocha`, `chai`, `sinon`, `@testing-library/*`, `cypress`, `playwright`, `@playwright/test`, `msw`, `nock`, `supertest`, `ts-jest`, `@vitest/*`.

## Rules

| id | severity | detect |
|---|---|---|
| `prod-leakage/test-files-in-package` | critical | publishable package (`private !== true`) whose tarball contains test files. |
| `prod-leakage/test-files-in-build-output` | critical | a package's existing output dir contains compiled test files (`*.spec.js`, `*.test.js`, `*.spec.d.ts`, …). Only treat a dir as build output when it is the tsconfig `outDir`, referenced by `main`/`exports`/`files`, or gitignored, **and** the package has a build script or Nx build target. Only check dirs that exist — never build. Evidence should note the output may be stale. |
| `prod-leakage/build-tsconfig-includes-tests` | high | the build tsconfig `include`s the test files' location and its `exclude` doesn't match them. Build tsconfig = file passed via `-p`/`--project` in the `build` script, else Nx build target `options.tsConfig`, else `tsconfig.build.json`, else `tsconfig.lib.json`, else `tsconfig.json` when the build script is plain `tsc`. Skip packages with neither a build script nor an Nx build target. |
| `prod-leakage/test-lib-in-dependencies` | high (medium if `private`) | a test library appears in `dependencies` (not `devDependencies`). Consumers install it in production. |
| `prod-leakage/bazel-testonly-dependency` | high | a Bazel target explicitly tagged `production` and marked `testonly = False` has a literal local dependency path to a target explicitly marked `testonly = True`. Bazel normally rejects this at analysis; it is not evidence that test code shipped. |
| `prod-leakage/publint-issue` | error→high, warning→medium, suggestion→low | `publint` messages for publishable packages. |

For a Bazel-only workspace, skip the JS package/build-output subchecks and keep
this check `partial`; Java build outputs and shipped artifacts are not analyzed.

## Steps

1. For each publishable package (non-private, `source: package.json`), list the tarball contents with the workspace's package manager.
   If `workspace.json` has `packageManager: "pnpm"` and `pnpm` is on `PATH`:
   ```bash
   W="$(node -p 'require("os").tmpdir()')/monorepo-doctor"
   (cd "<pkg-dir>" && npm_config_manage_package_manager_versions=false npm_config_ignore_scripts=true pnpm pack --dry-run --json 2>&1)
   ```
   pnpm rewrites `workspace:` ranges the way `pnpm publish` does, so it succeeds where `npm pack` fails on them. `npm_config_manage_package_manager_versions=false` stops pnpm from downloading the version named in `packageManager`, and `npm_config_ignore_scripts=true` skips `prepack`/`prepare`/`postpack` (`pnpm pack` has no `--ignore-scripts` flag). The output is a single object: parse `files[].path`. A failure is printed as JSON `{ "error": { "code", "message" } }`; use `error.message` as the failure line. `--dry-run` and `--json` need pnpm ≥ 10; if pnpm answers `Unknown options`, use `npm pack` below.
   Otherwise (npm, yarn, bun, or pnpm unavailable):
   ```bash
   W="$(node -p 'require("os").tmpdir()')/monorepo-doctor"
   (cd "<pkg-dir>" && npm pack --dry-run --json --ignore-scripts 2>&1)
   ```
   Parse `[0].files[].path`. For either command, any match of the test pattern → `test-files-in-package` (list up to 10 in `evidence`), and name the command used in `evidence`.
   Parse stdout as JSON. If the pack command fails (e.g. `workspace:` protocol under npm), capture the first stderr/stdout line, then fall back to reasoning: if the package has no `files` field and no `.npmignore`, every file not in `.gitignore` ships — compare against `scan.packages[p].testFiles`. If `.npmignore` exists without `files`, honor its simple ignore/negation patterns where possible and state that this is a fallback. If `files` is present, test files ship only if a `files` entry matches them. If `publishConfig.directory` is set, evaluate that directory as the publish root. State in `evidence` that the fallback was used and include the first failure line.
2. Check existing build output dirs for compiled test files.
3. Resolve each package's build tsconfig and check `include`/`exclude` against `scan.packages[p].testFiles`. Treat `include: ["src"]` as `src/**/*`. Follow the full `extends` chain for `include`/`exclude` (the nearest config that sets each wins; paths are relative to the config that declares them) and compare `testFiles` against the effective values. If a link in the chain can't be resolved, mark the check `partial` and name the unresolved config in `reason`.
4. Check `dependencies` against the test-library list.
5. If `hasNodeModules` and `tools.publint`, for each publishable package that has its build output present:
   ```bash
   W="$(node -p 'require("os").tmpdir()')/monorepo-doctor"
   npm_config_ignore_scripts=true ./node_modules/.bin/publint "<pkg-dir>" 2>&1
   ```
   If `tools.publint` is false, skip and mark `partial` with reason `publint not installed locally`. Only if the user explicitly allowed downloads, run `npm_config_ignore_scripts=true npx --yes publint@0.3.25 "<pkg-dir>"` instead — or, for a pnpm workspace, `npm_config_manage_package_manager_versions=false pnpm dlx publint@0.3.25 "<pkg-dir>"` (`pnpm dlx` runs no dependency build scripts unless `--allow-build` is passed; never pass it). Exact version, never `@latest`.
   publint prints sections `Errors:`, `Warnings:`, `Suggestions:` followed by numbered messages. One finding per message. Skip when `node_modules` is missing. Skip unbuilt packages and set status `partial` with reason `publint skipped for unbuilt packages: …`.
6. **Bazel test-only targets** — only if Bazel is an orchestrator. Merge `prod-leakage.findings` from `$W/bazel.json`, generated by [bazel.md](bazel.md), and retain its partial reason alongside other skipped subchecks. A test-only target being public, or being used by a test, is not a production leak. If the file is missing or invalid, mark this check `partial` with the failure reason.
7. Write `findings/prod-leakage.json`.

## Fix guidance

- test-files-in-package: add `"files": ["dist"]` to package.json (preferred over `.npmignore`).
- build-tsconfig-includes-tests: `"exclude": ["**/*.spec.ts", "**/*.test.ts", "**/__tests__/**"]`.
- test-lib-in-dependencies: move it to `devDependencies`.
