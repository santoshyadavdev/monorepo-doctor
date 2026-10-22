---
title: From audit to cleanup
description: Use monorepo-doctor to measure boundary problems and monorepo-boundaries-cleanup to pay them down, one PR at a time.
---

The two skills form a loop: **monorepo-doctor measures, monorepo-boundaries-cleanup fixes, monorepo-doctor measures again.**

## 1. Measure

```text
Run monorepo-doctor on this repo.
```

The findings that feed the cleanup skill are:

- `boundaries/*` — deep imports, unlisted dependencies, boundary-linter violations
- `circular-deps/*` — package and file cycles
- `ci-coverage/undeclared-workspace-dependency` — imports of workspace packages that aren't declared

If you already have a boundary linter, its output works just as well.

## 2. Baseline

If the linter has no baseline, the first cleanup PR adds one, so CI fails only on **new** violations while the old ones are paid down:

```text
Use monorepo-boundaries-cleanup to add a baseline for our current turbo boundaries violations.
```

## 3. Fix one batch per PR

```text
Use monorepo-boundaries-cleanup to fix the next batch.
```

The agent picks one root cause, applies the least invasive fix, verifies, opens the PR, and **stops**. You review it, report the CI result, and merge it yourself.

## 4. Repeat, then go strict

Re-run monorepo-doctor or the linter after each merge. When the baseline is empty, the last PR makes the linter strict so any violation fails CI.
