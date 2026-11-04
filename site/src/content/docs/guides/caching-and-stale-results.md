---
title: Caching and stale results
description: How monorepo-doctor finds cache configurations that can replay a stale green result, and what it doesn't do.
---

A cache that replays a stale result is the nastiest monorepo failure: everything looks green. monorepo-doctor looks for the configurations that make this possible.

## It doesn't hash inputs itself

monorepo-doctor never reimplements Nx's or Turborepo's hashing, and it never runs real tasks. It finds stale-result risks in two ways.

### 1. Static comparison: what the code reads vs. what the cache key declares

The [source scan](/reference/monorepo-doctor/scan/) records the env vars each package reads and every workspace import. The [caching check](/reference/monorepo-doctor/caching/) compares those against each task's declared cache key:

- **`caching/undeclared-env`** — a cacheable task reads an env var that isn't in Turbo's `env`/`globalEnv` or Nx's `{ "env": NAME }` inputs. A cached pass can be replayed under a different value. `passThroughEnv` doesn't count: it makes the variable available without adding it to the hash.
- **`caching/missing-outputs`** — a build task has no `outputs`, so a cache hit restores nothing.
- **`caching/volatile-input`** — inputs include build artifacts or machine-local files.
- **`ci-coverage/turbo-test-missing-dependson`** — a test task's hash ignores its dependencies, so a change in a dependency can replay an old pass.

### 2. Dry-run stability: `caching/unstable-hash` (Turborepo only)

When a local `turbo` binary is installed, the skill runs `turbo run build --dry=json` twice and reports any task whose hash differs between runs, along with the `inputs` and `environmentVariables` that differ. Only `--dry=json` runs — no task executes.

Without a local `turbo`, the check is marked `partial` with the reason `turbo not installed; dry-run hash comparison skipped`.

## Unnecessary cache misses

The caching check also reports deterministic tasks explicitly configured with `cache: false`: `caching/nx-cache-disabled` for Nx and `caching/turbo-cache-disabled` for Turborepo. Nx analysis resolves applicable `targetDefaults`, package targets, and project overrides; missing cache declarations or missing legacy `cacheableOperations` entries are not treated as explicit false. Inferred targets and runner semantics that cannot be resolved are marked `partial`, not guessed.

Long-running, side-effecting, and external-state-dependent tasks remain deliberately uncached. Review inputs and outputs before enabling caching rather than blanket-enabling all targets.

### Nx defaults and overrides

For example, consider this shared `nx.json` default:

```json
{
  "targetDefaults": {
    "typecheck": { "cache": false }
  }
}
```

An existing deterministic `typecheck` target inheriting that false can produce a low-severity finding. The default does not create targets by itself. A project target with explicit `"cache": true` overrides it and is not included in that finding.

Nx executor-keyed defaults take precedence over target-name defaults; they are not merged together. A selected default with a conflicting executor is skipped, and version-specific command/script compatibility also matters. Only the config object supplying the effective false is reported.

Shared defaults produce one finding per source config object in `nx.json`, without `location.package`. Evidence identifies the source, such as `targetDefaults.typecheck`, and the affected `<project>:<target>` pairs. Package/project-specific findings point to their own manifest or `project.json`. This prevents an overridden or intentionally uncached target from being attributed to a shared finding.

If inference or custom/legacy runner semantics cannot be resolved, that portion is `partial` with an explanation. Other independently proven findings are retained. The [full caching reference](/reference/monorepo-doctor/caching/#resolving-nx-disabled-cache-findings) defines the resolution and exclusion rules.

## Limits

- It finds configurations that **can** replay stale results. It doesn't prove a specific cache entry is stale.
- The dry-run comparison is Turborepo-only; Nx relies on the static checks.
- Env reads are found by scanning source for `process.env.X`, `process.env['X']` and `import.meta.env.X`. Destructured reads (`const { API_URL } = process.env`) and dynamic keys are missed.
