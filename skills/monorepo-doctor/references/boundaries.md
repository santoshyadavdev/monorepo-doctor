# Check 1 — Package boundaries

Question: are packages split along real seams, and is each package's public API respected?
Inputs: `workspace.json`, `scan.json`. Output: `findings/boundaries.json`.

## Rules

| id | severity | detect | evidence |
|---|---|---|---|
| `boundaries/oversized-package` | low | `scan.packages[p].sourceFiles > 500` or `loc > 50000` (generated files are already excluded by scan) **and** at least 2 other workspace packages import it (`scan.imports` with `target === p`). Apps and leaf packages with no workspace consumers are never flagged: splitting them adds export maps and tags with no consumer that benefits. | counts + the consumers and which subpaths/symbols each uses |
| `boundaries/deep-import` | medium | each `scan.imports` entry with `deep && (declared \|\| fromSource === "project.json")` (undeclared package.json importers are reported by ci-coverage instead) | file:line + import specifier + target's `exports` keys |
| `boundaries/unlisted-dependency` | medium | knip `unlisted` entries | knip output line |
| `boundaries/unused-dependency` | low | knip `dependencies` / `devDependencies` entries | knip output line |
| `boundaries/nx-missing-module-boundaries-rule` | medium | Nx detected and no ESLint config in the root mentions `@nx/enforce-module-boundaries` | list of ESLint config files checked |
| `boundaries/nx-permissive-module-boundaries` | low | the rule exists but `depConstraints` contains `{ sourceTag: '*', onlyDependOnLibsWithTags: ['*'] }` | the config snippet |
| `boundaries/nx-untagged-project` | low | Nx detected, rule absent or permissive, and a project has empty `tags` | project.json path |
| `boundaries/turbo-package-boundaries-tags` | medium | verified Turbo 2.5+ (2.x) and a package-level Turbo config defines `boundaries.tags`, which is root-only | package config path + `boundaries.tags` snippet |
| `boundaries/turbo-tag-package-name-collision` | medium | verified Turbo 2.5+ (2.x) and a root `boundaries.tags` rule key exactly equals a workspace package name | root rule snippet + package.json name and path |
| `boundaries/turbo-boundaries-violation` | medium | each violation printed by `turbo boundaries` | output line |

Group `deep-import` findings: one finding per (from, target) pair, listing up to 5 locations in `evidence`; `location` is the first occurrence.

## Steps

1. Load `workspace.json` and `scan.json`. Apply the size and deep-import rules directly.
2. **knip** — only if `hasNodeModules` and `tools.knip`:
   ```bash
   W="$(node -p 'require("os").tmpdir()')/monorepo-doctor"
   ./node_modules/.bin/knip --reporter json --include dependencies,devDependencies,unlisted --no-progress --no-exit-code
   ```
   If `tools.knip` is false, skip and mark `partial` with reason `knip not installed locally`. Only if the user explicitly allowed downloads, run `npm_config_ignore_scripts=true npx --yes knip@6.41.0` with the same flags instead (exact version, never `@latest`).
   Parse stdout as JSON. Its shape varies by version; look for per-file `dependencies`, `devDependencies` and `unlisted` arrays of `{ name }`. Map the file to its package via `workspace.json`. If knip fails or the output can't be parsed, mark the check `partial` with reason `knip unavailable: <first line of error>`. Do **not** report `unused-dependency` for `@types/*` packages or for tools only referenced in scripts.
3. **Nx** — only if Nx is an orchestrator: read ESLint configs in the root (`eslint.config.{js,mjs,cjs,ts}`, `.eslintrc{,.json,.js,.cjs}`) and every package dir. Apply the three `nx-*` rules. A config that contains `@nx/enforce-module-boundaries` or legacy `@nrwl/nx/enforce-module-boundaries` anywhere counts as present. Group `nx-untagged-project` consistently as one finding per untagged project found from the root and package-dir project configs.
4. **Turborepo static configuration** — if turbo is an orchestrator, even when not installed, follow the static checks below.
5. **Turborepo command** — only if turbo is an orchestrator **and installed**:
   ```bash
   W="$(node -p 'require("os").tmpdir()')/monorepo-doctor"
   TURBO_TELEMETRY_DISABLED=1 ./node_modules/.bin/turbo boundaries
   ```
   One finding per reported violation, except configuration errors already emitted by the static checks: retain the specific static finding and append command evidence instead of duplicating it as `turbo-boundaries-violation`. A nonzero exit caused only by reported violations is a completed inspection. If the command errors with an unknown-command message (turbo < 2.4), skip this sub-step and note it in `reason`. Unexpected execution/config-loading failures are `partial` with the first error line, not a clean result. If not installed, mark this sub-step `partial` with reason `turbo not installed locally`; retain static findings.
6. Write `findings/boundaries.json`.

## Turborepo static configuration

These are configuration errors, not a requirement to adopt tags. [Turbo's boundaries documentation](https://turborepo.com/docs/reference/boundaries) describes optional package `tags` and root `boundaries.tags` rules. The [v2.5.0 schema types](https://github.com/vercel/turborepo/blob/v2.5.0/packages/turbo-types/src/types/config-v2.ts) and [boundary implementation](https://github.com/vercel/turborepo/blob/v2.5.0/crates/turborepo-lib/src/boundaries/tags.rs) establish the two diagnostics (`PackageBoundariesHasTags`, `TagSharesPackageName`), which also exist in the [current implementation](https://github.com/vercel/turborepo/blob/main/crates/turborepo-boundaries/src/tags.rs).

1. Establish the Turbo version from installed `node_modules/turbo/package.json`, otherwise a resolved lockfile version. Without either, an exact stable `2.x.y` dependency or a simple `^2.x.y` / `~2.x.y` declaration with minor >= 5 proves support: pass its lower bound to the helper. Do not treat arbitrary ranges, aliases, prereleases, or another major as verified. This conservative gate is verified for stable 2.x >= 2.5.0; it does not claim tags first appeared in 2.5. For older/unknown/unverified versions, skip these two checks with a `partial` reason, not a finding, and still run the command if installed.
2. Read root `turbo.json` and each discovered workspace package's own `turbo.json` (or `turbo.jsonc` where supported by that version). Parse using the format's actual semantics, not regex matching or naive comment stripping. Respect file precedence for the installed version; unresolved config selection, invalid config, or unsupported inheritance makes that portion `partial` with the file and error. Do not silently substitute `{}` for unreadable files. Missing package configs are normal. Use only a package's own `boundaries.tags` for the package-level check, never root rules inherited via `extends: ["//"]`. Top-level package `tags` are valid.
3. Before calling the helper, exclude `workspace.json` package entries with `source === "project.json"`: these are Nx-only projects, not Turbo workspace packages. Use the helper below with parsed root config and the remaining Turbo workspace packages shaped as `{ name, dir, turboConfig?, turboFile? }`. `dir` comes from `workspace.json`; read `name` from that directory's `package.json` manifest, not an Nx project name or directory fallback. An unreadable manifest or missing manifest name makes that package's checks `partial` with the file and reason. `turboConfig` is the package's own parsed config, and `turboFile` is its workspace-relative path (defaults to `<dir>/turbo.json`). Do not use `workspace.json`'s `tags`: those are Nx tags, not Turbo tags. Locate each emitted config key in the original file and add `location.line` when available.

```js
function turboBoundaryConfigFindings({ version, config, packages, rootFile = 'turbo.json' }) {
  const findings = [];
  const stable = /^2\.(\d+)\.\d+$/.exec(version ?? '');
  if (!stable || Number(stable[1]) < 5) {
    return { findings, reason: `Turbo static boundary configuration checks require verified stable 2.x >= 2.5.0; got ${version ?? 'unknown'}` };
  }
  for (const pkg of packages) {
    if (pkg.turboConfig?.boundaries && Object.hasOwn(pkg.turboConfig.boundaries, 'tags')) {
      const file = pkg.turboFile ?? `${pkg.dir}/turbo.json`;
      findings.push({
        id: 'boundaries/turbo-package-boundaries-tags',
        severity: 'medium',
        title: `${pkg.name} defines root-only boundaries.tags in a package config`,
        location: { file, package: pkg.name },
        evidence: `${file}: boundaries.tags = ${JSON.stringify(pkg.turboConfig.boundaries.tags)}`,
        fix: 'Move tag rules to the root boundaries.tags map, preserving existing rules; keep package labels in top-level tags.',
      });
    }
    if (config.boundaries?.tags && Object.hasOwn(config.boundaries.tags, pkg.name)) {
      findings.push({
        id: 'boundaries/turbo-tag-package-name-collision',
        severity: 'medium',
        title: `Boundary tag ${pkg.name} collides with a workspace package name`,
        location: { file: rootFile, package: pkg.name },
        evidence: `${rootFile}: boundaries.tags[${JSON.stringify(pkg.name)}] = ${JSON.stringify(config.boundaries.tags[pkg.name])}; ${pkg.dir}/package.json: name = ${JSON.stringify(pkg.name)}`,
        fix: 'Rename the rule tag and its package labels/tag references to a distinct label; preserve allow/deny entries that intentionally refer to the package name.',
      });
    }
  }
  return { findings };
}
```

Missing `boundaries`, absent/empty rules, untagged packages, and tags with no rule are valid defaults: emit no missing/permissive/untagged Turbo finding. Package names in `allow`/`deny` are explicitly supported; do not confuse them with rule-map keys. Lists contain literal tags/package names, not Nx-style wildcard constraints. An omitted `allow` permits all; `allow: []` restricts all relations, not a permissive policy. Leave dependency/dependent policy evaluation (including transitive relations and deny precedence) to `turbo boundaries`, rather than approximating it from direct source imports.

## Fix guidance

- deep-import: add the subpath to the target's `exports`, or re-export from its entry point, then import from the package root.
- oversized-package: identify clusters by which consumers import which files (`scan.imports` subpaths); propose 2–3 splits along clusters used by different consumers. If every consumer uses the same parts, don't emit the finding.
- nx-missing-module-boundaries-rule: add `@nx/enforce-module-boundaries` with `depConstraints` based on `scope:*`/`type:*` tags.
