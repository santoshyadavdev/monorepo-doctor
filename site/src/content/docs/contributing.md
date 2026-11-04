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

### Fixture contracts

`mustFind` entries require a matching finding ID; optional `package` and `file` match `location.package` and `location.file` exactly. Optional `evidenceIncludes` requires every listed literal substring in the finding's evidence. Use separate selectors for separate source config objects so one finding cannot accidentally satisfy both expectations:

```json
{
  "id": "caching/nx-cache-disabled",
  "file": "nx.json",
  "evidenceIncludes": ["targetDefaults.typecheck", "@nxf/api:typecheck"]
}
```

Shared defaults intentionally omit `location.package`: assert their source paths and affected project/target pairs through evidence. `mustNotFind` accepts the same selectors and rejects matches at any severity, including low. By contrast, `cleanPackages` rejects only medium-or-higher findings attributed to the named packages; it cannot protect a package mentioned only in shared evidence.

Optional `checks` assertions inspect the corresponding entry in `report.checks`. They require an exact `status`; `reasonIncludes` also requires a nonempty string reason containing every listed literal substring. For example, the Turbo fixture requires:

```json
{
  "checks": [
    {
      "check": "ci-coverage",
      "status": "partial",
      "reasonIncludes": [
        "unknown-comparison-base.yml",
        "unavailable runtime comparison"
      ]
    }
  ]
}
```

Keep the matching `mustNotFind` assertion for `ci-coverage/turbo-invalid-comparison-base` in that unknown-value workflow. The absence of a speculative finding alone does not prove that the audit acknowledged unavailable evidence. Existing contracts without `checks`, `mustNotFind`, or evidence selectors remain supported.

## Docs site

The site lives in `site/` and is built with [Astro Starlight](https://starlight.astro.build).

```bash
cd site
npm ci
npm run dev     # syncs ../skills, then starts the dev server
npm run build   # syncs ../skills, then builds to site/dist
```

Pages under **Reference** and the raw files under `/skills/` are generated from `skills/` by `site/scripts/sync-skills.mjs` — edit the skill files, not the generated pages. The site deploys to [monorepo-skills.dev](https://monorepo-skills.dev) on Cloudflare Workers (static assets) through Workers Builds: pushes to `master` deploy production, and pull requests get preview URLs. Config lives in `site/wrangler.jsonc`; `npm run preview:cf` serves the build locally with Wrangler.
