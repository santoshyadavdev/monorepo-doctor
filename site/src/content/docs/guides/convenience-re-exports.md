---
title: Find convenience re-exports
description: A read-only audit prompt that finds re-exports forwarding symbols from other workspace packages, classifies each one, and recommends whether to keep or remove it.
---

Convenience re-exports (`export * from` and `export { X } from`) make a package look like the owner of symbols that live elsewhere. Each one can force consumers to install or build a package they would not otherwise need. Paste this prompt into your agent, replacing `<package>` with the package to audit.

## Prompt

```text
Find convenience re-exports in <package>: `export * from` and `export { X } from` statements that forward symbols owned by another workspace package.

For each re-export:

- Name the owning package. Say whether the re-export forces consumers to install or build that package when they would not otherwise need it.
- Count consumers with `git grep` and note which ones already depend on the owning package.
- Classify it:
  (a) Type-only. Usually keep it, because it has no runtime cost.
  (b) A runtime value with few consumers. Remove it and point consumers at the owner.
  (c) Real code that only looks like a re-export. Keep it.
  (d) Many consumers. Defer it to its own PR.

Produce a table with these columns: symbol, owner, consumers, classification, recommended action. Do not edit any files yet.
```

## What to do with the results

Class (b) rows are the quick wins and can usually go in one PR. Give each class (d) row its own PR. Hand them to [monorepo-boundaries-cleanup](/skills/monorepo-boundaries-cleanup/) as described in [From audit to cleanup](/guides/doctor-to-cleanup/).
