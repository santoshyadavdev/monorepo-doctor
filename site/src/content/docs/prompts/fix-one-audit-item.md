---
title: Fix one audit item
description: An implementation prompt that takes a single item from one of the audit prompts and turns it into a small, validated draft PR with a measured build-graph improvement.
---

The audit guides ([packages that depend on apps](/prompts/packages-depending-on-apps/), [convenience re-exports](/prompts/convenience-re-exports/), [leftover compatibility shims](/prompts/compatibility-shims/)) only report findings. This prompt fixes one of them. Paste it into your agent, replacing `<one item from the audit>` with a single row or group from an audit result and `<pkg>` with the affected package.

Unlike the audits, this prompt **edits code, installs dependencies, and opens a PR**.

## Prompt

```text
Implement only <one item from the audit>. Keep the PR small and self-contained.

1. Move the code, or repoint the imports, to the owning package. Do not leave a shim unless external consumers require one.
2. Update package.json dependencies so that each consumer declares exactly what it imports, then run `pnpm install`.
3. Update any guard that references the changed paths:
    - lint ratchet baselines (they fail when a count shrinks as well as when it grows; regenerate with the documented `:update` script)
    - authorization or enrollment checkers that hard-code file paths
    - dependency-boundary rules
4. Validate through the repo entry points, never raw tsc or npx:
    - `pnpm --filter "<pkg>..." typecheck`
    - the affected tests
    - `pnpm lint` or the specific guard
    - `git diff --check`
5. Open a draft PR using the repository template. Include the build-graph or task-count improvement, with the command you used to measure it.
```

## What to do next

Review the draft PR, wait for CI, and merge it yourself. Then re-run the audit that produced the item to confirm it is gone before picking the next one. For a guided version of this loop, see [From audit to cleanup](/guides/doctor-to-cleanup/).
