# Step 1 — Inputs

Ask for anything below that the user has not given, in **one** message. Offer the default for each so they can just say "use defaults".

| Input | Default | Notes |
|---|---|---|
| Repositories | — (required) | Git URLs, `owner/repo` slugs, local paths, or "all repos in org X that team Y contributes to". Include the libraries the apps consume, not only the apps. |
| Window | last 12 months | Shorter windows are noisier; the report annualizes. |
| Internal package scopes | packages published by the listed repos | e.g. `@acme/`. Add a scope when apps consume internal packages from repos that are not in the list. |
| Loaded developer cost per hour | 100 USD | Salary + benefits + overhead ÷ working hours. Ask for their number; teams often use 75–150 USD. |
| CI price per minute | 0.008 USD | GitHub-hosted 2-core Linux list price at the time of writing. Ask for theirs: larger runners, macOS, self-hosted and plan discounts all differ. |
| Currency | USD | Set `rates.currency`; the report prints it. |
| Packages also used outside these repos | none | Packages published for other teams or open source keep releasing after a migration, so their releases are not costed. Put them in `publicPackages` (or `true` for all). |

To expand "all repos in org X": `gh repo list X --limit 1000 --no-archived --json nameWithOwner,pushedAt`. Show the list and ask which to include. Do not guess team membership.

## Clone

Use bare clones with full history. Shallow clones are reported as a data problem because they hide most history.

```bash
W="$(node -p 'require("os").tmpdir()')/polyrepo-tax"
mkdir -p "$W/repos"
# one per repo; for local paths, skip cloning and use the path directly
git clone --bare --quiet https://github.com/acme/web-app.git "$W/repos/web-app.git"
```

If a clone fails (no access, SSO), tell the user and continue with the others; list the missing repos in the final summary.

## Config

Write `$W/polyrepo-tax.config.json`. Paths are relative to the config file.

```json
{
  "repos": [
    { "name": "ui-lib", "path": "repos/ui-lib.git", "github": "acme/ui-lib" },
    { "name": "web-app", "path": "repos/web-app.git", "github": "acme/web-app" }
  ],
  "since": "2025-11-25",
  "internalScopes": ["@acme/"],
  "publicPackages": [],
  "rates": { "developerHourly": 100, "ciPerMinute": 0.008, "currency": "USD" },
  "assumptions": {},
  "ci": "ci.json"
}
```

Put only overrides the user gave in `assumptions` (see cost-model.md for names). Leave out `"ci"` if step 2 is skipped.

## CI minutes (optional)

Only when `gh auth status` succeeds and repos have a `github` slug:

```bash
node "$S/scripts/fetch-ci.mjs" --config "$W/polyrepo-tax.config.json" --out "$W/ci.json"
```

It sums the wall-clock time of every completed GitHub Actions run in the window. The API caps a filtered query at 1000 runs, so it queries one month at a time and splits any range at the cap until each part is complete; if a single day still hits the cap, that repo fails and keeps the assumed CI minutes. It also samples job timings for up to 30 runs per repo (`--sample`) and scales the total by the measured job/wall ratio, which can be below 1 when queueing inflates wall-clock time. It makes only GET requests. A repo that fails keeps the assumed per-commit CI minutes; mention it.

Other CI systems: if the user can export total CI minutes per repo for the window, write `ci.json` by hand as `{ "<repo name>": { "totalMinutes": 12345 } }`.
