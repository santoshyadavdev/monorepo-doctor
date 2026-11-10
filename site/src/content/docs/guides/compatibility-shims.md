---
title: Find leftover compatibility shims
description: An audit prompt that finds re-export shims and barrel files left behind by earlier extractions, lists their remaining importers, and proposes which to remove.
---

When code moves to a new package, the old location often keeps a shim that re-exports from the new home so existing imports keep working. Once the migration is done, these shims stay behind and keep old paths alive in `exports`, tsconfig, test config, and lint baselines. Paste this prompt into your agent to find them.

## Prompt

```text
Find compatibility shims and barrel files left behind by earlier extractions. These are files that only re-export from a new home, and package `exports` entries that point at them.

For each one, list the remaining importers. If there are none, or every importer can be repointed in one small change, propose removing it.

Check for:

- package.json "exports" subpaths
- tsconfig path aliases
- vitest aliases
- lint-guard baselines that mention the old path
```

## What to do with the results

You can usually remove a shim with no importers in the same PR as its `exports` entry, path aliases, and baseline lines. For shims that still have importers, repoint the importers first, then remove the shim. Hand each one to [monorepo-boundaries-cleanup](/skills/monorepo-boundaries-cleanup/) as described in [From audit to cleanup](/guides/doctor-to-cleanup/).
