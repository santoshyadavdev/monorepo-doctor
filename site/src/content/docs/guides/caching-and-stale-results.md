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

## Limits

- It finds configurations that **can** replay stale results. It doesn't prove a specific cache entry is stale.
- The dry-run comparison is Turborepo-only; Nx relies on the static checks.
- Env reads are found by scanning source for `process.env.X`, `process.env['X']` and `import.meta.env.X`. Destructured reads (`const { API_URL } = process.env`) and dynamic keys are missed.
