---
title: FAQ
description: Common questions about the monorepo skills.
---

## Does monorepo-doctor change my repository?

No. It doesn't install, build, run tests or edit files. It writes two report files — to your temp directory by default — and a scratch work directory under your temp directory. See [Guarantees](/skills/monorepo-doctor/#guarantees).

## Does monorepo-boundaries-cleanup merge PRs?

No. It opens one PR per batch and stops. Merging is always yours, even if you tell it to "just get it merged".

## Which agents does it work with?

Any agent that supports the [Agent Skills](https://agentskills.io) format, including Claude Code, GitHub Copilot CLI, Cursor and Codex.

## Do I need Nx or Turborepo?

No. Plain npm, yarn, pnpm and bun workspaces are supported. Nx and Turborepo unlock extra caching and boundary rules.

## Do I need to install dependencies first?

It's recommended, not required. Without `node_modules` or a local `nx`/`turbo`, the affected sub-checks are marked `partial` with a reason.

## Is it published to npm?

No. Skills are installed from GitHub with `npx skills add santoshyadavdev/monorepo-doctor`, or by copying the skill directory.

## Why did it skip something I expected it to flag?

Findings must be actionable. When the right answer is "keep it as-is" — `cache: false` on a migration, a lazy ORM reference cycle, an unconsumed large package — the skill explains it in the check's reason instead of raising a finding.
