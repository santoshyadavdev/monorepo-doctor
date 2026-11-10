---
title: Find packages that depend on apps
description: A read-only audit prompt that finds shared packages depending on apps or services, groups the hits by root cause, and measures the build-graph cost with turbo dry runs.
---

Shared packages under `packages/` should never depend on an app or service. When they do, every consumer of the package inherits the app's build graph. Paste this prompt into your agent to find those dependencies and rank what to fix first.

## Prompt

```text
Audit the monorepo for shared packages (under packages/) that depend on an app or service, either directly or transitively.

1. For every package.json under packages/, list the workspace dependencies that point to apps/*, services, or other non-package workspaces.
2. Search source for imports of app modules. Use `git grep` with a pathspec rather than recursive grep. Search for both package-name imports and relative paths that escape the package.
3. For each hit, record the importing file, the imported symbol, and whether it is used as a type or at runtime.
4. Group the hits by root cause:
    - a schema or generated types
    - test support
    - constants or headers
    - real logic
5. Rank the groups by how many consumers they unblock and how much build-graph weight they remove.

Measure the improvement by comparing `turbo run build --dry=json --filter=<pkg>` before and after. Count tasks and dependency edges. Report numbers, not estimates. Do not change any code.
```

## What to do with the results

The groups map directly onto cleanup batches. Hand the top-ranked group to [monorepo-boundaries-cleanup](/skills/monorepo-boundaries-cleanup/), one root cause per PR, as described in [From audit to cleanup](/guides/doctor-to-cleanup/).
