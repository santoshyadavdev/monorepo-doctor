---
title: Getting started
description: Install the monorepo skills and run your first audit.
---

## Requirements

- An AI coding agent that supports [Agent Skills](https://agentskills.io) — Claude Code, GitHub Copilot CLI, Cursor, Codex and others.
- Node ≥ 22.5 on the machine running the agent. The skill's scripts use only Node built-ins.
- A POSIX shell (macOS, Linux or WSL).

## Install

Install both skills with the [`skills` CLI](https://skills.sh):

```bash
npx skills add santoshyadavdev/monorepo-doctor
```

Install only one of them:

```bash
npx skills add santoshyadavdev/monorepo-doctor --skill monorepo-doctor
npx skills add santoshyadavdev/monorepo-doctor --skill monorepo-boundaries-cleanup
```

### Manual install

Copy `skills/monorepo-doctor` or `skills/monorepo-boundaries-cleanup` from the [repository](https://github.com/santoshyadavdev/monorepo-doctor) into one of:

| Location | Scope |
|---|---|
| `~/.claude/skills/` | Claude Code, all projects |
| `~/.copilot/skills/` | Copilot CLI, all projects |
| `.github/skills/` in a repository | that repository only |

## Run your first audit

From the root of the monorepo, ask your agent:

```text
Run monorepo-doctor on this repo.
```

Scope it to the checks you care about:

```text
Audit only caching and CI coverage with monorepo-doctor.
```

Write the reports somewhere specific (by default they go to `<os tmpdir>/monorepo-doctor-reports`, outside your repo):

```text
Run monorepo-doctor and write the reports to ./reports.
```

The agent finishes with a summary and the paths to `monorepo-doctor-report.md` and `monorepo-doctor-report.json`.

:::tip[Install dependencies first for the best coverage]
The audit works on a fresh clone, but `knip`, `publint`, Nx graph refreshes and Turbo dry runs need `node_modules` with those tools installed locally. The skill doesn't download them unless you explicitly allow downloads in your prompt. Without them, the affected checks are reported as `partial` with a reason — never silently skipped.
:::

## Fix what it found

When the report shows boundary violations, hand them to the cleanup skill one batch at a time:

```text
Use monorepo-boundaries-cleanup to fix the next batch of turbo boundaries violations.
```

See [From audit to cleanup](/guides/doctor-to-cleanup/) for the full loop.
