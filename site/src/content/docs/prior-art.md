---
title: Prior art
description: The tools and agent references these skills build on.
---

The monorepo skills build on existing tools rather than replacing them:

- [nrwl/nx-ai-agents-config](https://github.com/nrwl/nx-ai-agents-config) — Nx-focused agent skills for Nx workspaces and cache investigation.
- [Turborepo's agent skill](https://github.com/vercel/turborepo/tree/main/skills/turborepo) — points agents at Turborepo docs and conventions.
- [madge](https://github.com/pahen/madge) and [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) — dependency graphs and cycles.
- [knip](https://github.com/webpro-nl/knip) — unused and unlisted dependencies.
- [publint](https://github.com/bluwy/publint) — package publishing metadata.
- [`@nx/enforce-module-boundaries`](https://nx.dev/features/enforce-module-boundaries) — Nx project dependency constraints.
- [`turbo boundaries`](https://turborepo.com/docs/crafting-your-repository/structuring-a-repository#configuring-boundaries) — Turborepo package boundaries.

What these skills add is one read-only audit flow across all five concerns — consistent finding ids, evidence requirements, severity rules, Markdown/JSON output and CI thresholds — plus a disciplined workflow for fixing what it finds.
