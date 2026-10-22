---
title: Contributing
description: Develop and test the skills and this documentation site.
---

## Skills

Requires Node ≥ 22.5. From the repository root:

```bash
npm test        # unit tests for the scripts
npm run check   # frontmatter, reference links and finding-id coverage for every skill
```

Fixtures under `fixtures/` seed known problems into generic pnpm, Nx and Turborepo workspaces; expected findings live in `fixtures/expected/*.json`. Compare a generated report against a fixture contract with:

```bash
node scripts/verify-fixture.mjs "$(node -p 'require("os").tmpdir()')/monorepo-doctor-reports/monorepo-doctor-report.json" fixtures/expected/generic-pnpm.json
```

## Docs site

The site lives in `site/` and is built with [Astro Starlight](https://starlight.astro.build).

```bash
cd site
npm ci
npm run dev     # syncs ../skills, then starts the dev server
npm run build   # syncs ../skills, then builds to site/dist
```

Pages under **Reference** and the raw files under `/skills/` are generated from `skills/` by `site/scripts/sync-skills.mjs` — edit the skill files, not the generated pages. The site deploys to [monorepo-skills.dev](https://monorepo-skills.dev) on Cloudflare Workers (static assets) through Workers Builds: pushes to `master` deploy production, and pull requests get preview URLs. Config lives in `site/wrangler.jsonc`; `npm run preview:cf` serves the build locally with Wrangler.
