---
title: Getting started
description: Install the monorepo skills and run your first audit.
---

## Requirements

- An AI coding agent that supports [Agent Skills](https://agentskills.io) — Claude Code, GitHub Copilot CLI, Cursor, Codex and others.
- Node ≥ 22.5 on the machine running the agent. The skill's scripts use only Node built-ins.
- A POSIX shell (macOS, Linux or WSL).

## Install

Install all three skills with the [`skills` CLI](https://skills.sh):

```bash
npx skills add santoshyadavdev/monorepo-doctor
```

Install only one of them:

```bash
npx skills add santoshyadavdev/monorepo-doctor --skill monorepo-doctor
npx skills add santoshyadavdev/monorepo-doctor --skill monorepo-boundaries-cleanup
npx skills add santoshyadavdev/monorepo-doctor --skill polyrepo-tax
```

### Manual install

Copy `skills/monorepo-doctor`, `skills/monorepo-boundaries-cleanup` or `skills/polyrepo-tax` (including its `scripts/` folder) from the [repository](https://github.com/santoshyadavdev/monorepo-doctor) into one of:

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

## Try the React and Turborepo example

The [React + Turborepo example](https://github.com/santoshyadavdev/monorepo-doctor/tree/master/examples/react-turbo) is a runnable npm workspace with two React apps and four shared libraries. It intentionally contains boundary, file-cycle, caching, CI test-cache and production-leakage problems for teams to investigate. It is an audit playground, **not a production template**.

Clone the repository and prepare the example (Node ≥ 22.5 and npm 10):

```bash
git clone https://github.com/santoshyadavdev/monorepo-doctor.git
cd monorepo-doctor/examples/react-turbo
npm ci
npm test
npm run build
```

After [installing the skill](#install), start your agent in `examples/react-turbo` and ask:

```text
Run monorepo-doctor on this workspace. Write reports to the default report directory.
```

The audit itself does not install dependencies, build or run tests. You can audit without installing; Turbo inspection will be partial. Knip and publint are not included in the example, so their optional inspections remain partial.

From the repository root, compare the generated JSON report against the example's expected findings:

```bash
node scripts/verify-fixture.mjs \
  "$(node -p 'require("os").tmpdir()')/monorepo-doctor-reports/monorepo-doctor-report.json" \
  fixtures/expected/react-turbo.json
```

The [example README](https://github.com/santoshyadavdev/monorepo-doctor/blob/master/examples/react-turbo/README.md) lists the seeded findings, suggested repairs and commands to run the apps. The verifier checks an agent-generated report; it does not run the audit. Copy the example to a separate repository before experimenting with fixes, and do not publish its sample packages.

## Try the Angular and Nx example

The [Angular + Nx example](https://github.com/santoshyadavdev/monorepo-doctor/tree/master/examples/angular-nx) is a runnable integrated Nx workspace with two Angular apps and four libraries, wired through `project.json` files and `tsconfig.base.json` path aliases. It intentionally contains Nx-specific boundary, file-cycle, caching, affected-CI and build-tsconfig problems. Like the React example, it is an audit playground, **not a production template**.

Use Node.js 22.12 or later on the 22.x release line, or Node.js 24.x, and npm 10 or later.

```bash
cd monorepo-doctor/examples/angular-nx
npm ci
npm test
npm run build
```

Start your agent in `examples/angular-nx` and use the same audit prompt. Without `npm ci`, Nx graph inspection is partial. From the repository root, verify the report against its contract:

```bash
node scripts/verify-fixture.mjs \
  "$(node -p 'require("os").tmpdir()')/monorepo-doctor-reports/monorepo-doctor-report.json" \
  fixtures/expected/angular-nx.json
```

The [example README](https://github.com/santoshyadavdev/monorepo-doctor/blob/master/examples/angular-nx/README.md) lists the seeded findings, suggested repairs, negative controls and commands to serve both apps.

## Try the Bazel examples

The [Bazel + Java example](https://github.com/santoshyadavdev/monorepo-doctor/tree/master/examples/bazel-java) is a standalone workspace with a runnable Java app and test. It does **not** need npm or a `package.json`. With Bazel 8.4.2 (or Bazelisk) and a Java toolchain installed:

```bash
cd monorepo-doctor/examples/bazel-java
bazel run //apps/catalog:catalog
bazel test //apps/catalog:catalog_test
```

Its `broken_release` target intentionally fails Bazel analysis because it depends on test-only data; avoid `bazel build //...` unless you intend to see that failure. See the [Java example README](https://github.com/santoshyadavdev/monorepo-doctor/blob/master/examples/bazel-java/README.md) for a remote-JDK alternative.

Start your agent in `examples/bazel-java` and use the same audit prompt. The audit uses Node.js but does not run Bazel or install dependencies. It reports the Bazel boundary and test-only checks as `partial`; it skips Java source cycles, Bazel caching and Bazel CI coverage. From the repository root, verify the report:

```bash
node scripts/verify-fixture.mjs \
  "$(node -p 'require("os").tmpdir()')/monorepo-doctor-reports/monorepo-doctor-report.json" \
  fixtures/expected/bazel-java.json
```

The [Bazel + rules_js example](https://github.com/santoshyadavdev/monorepo-doctor/tree/master/examples/bazel-rules-js) demonstrates the same target checks alongside a JavaScript workspace.

## Fix what it found

When the report shows boundary violations, hand them to the cleanup skill one batch at a time:

```text
Use monorepo-boundaries-cleanup to fix the next batch of turbo boundaries violations.
```

See [From audit to cleanup](/guides/doctor-to-cleanup/) for the full loop.
