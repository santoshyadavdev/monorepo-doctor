# Signals

The analyzer reads commits on each repo's default branch (`git log --no-merges`) within the window, `package.json` diffs, tags, and the files at `HEAD`. Package ecosystems other than npm contribute to grouping signals (tickets, repeated fixes, tooling churn) but not to dependency bumps.

## Internal packages

A package is internal when an analysed repo publishes it (a `package.json` `name` at `HEAD`) or its name starts with a configured `internalScopes` prefix.

- **Bump** — a commit that changes an internal dependency's version range in a `package.json` upwards. Authors matching `[bot]`, Renovate, Dependabot or github-actions count as bots. One count per (commit, package). A repo bumping its own package (a playground or docs workspace) is not counted.
- **Downgrade** — the same, but to a lower minimum version.
- **Release** — a commit that changes the `version` field of an internal package that another analysed repo consumes, or a tag `vX.Y.Z` / `name@X.Y.Z`. Tags only date releases; costed releases come from version commits. Packages listed in `publicPackages` (also consumed outside the analysed repos) are excluded: they keep releasing in a monorepo.
- **Lag** — days from a release to the consumer's bump to that version.
- **Drift / skew** — at `HEAD`, consumers below the newest known version, and internal packages used at more than one major version across repos.

## Bug categories

Only these categories exist. Each bug carries commit evidence.

| Category | Confidence | Detected when | Why it is a repo-boundary bug |
|---|---|---|---|
| `dependency-regression` | high | A commit downgrades an internal dependency, or is `Revert "<subject>"` of a bump commit in the same repo. | An internal release broke a consumer after it shipped. In a monorepo, the producer change runs the consumer's tests before merge. |
| `duplicated-fix` | medium | Fix commits (see below) with near-identical subjects land in ≥2 repos within `groupWindowDays`, or share a ticket and a subject. | The same code or contract was copied into several repos and had to be fixed in each. |
| `cross-repo-fix` | medium | Fix commits in ≥2 repos share a ticket key (`ABC-123`, `owner/repo#12`) but have different subjects. | One bug needed coordinated changes across repos: the contract between them lives nowhere. |
| `fix-propagation` | medium | A fix commit that also bumps an internal dependency up. | The fix needed a producer release and a consumer bump to reach users. |
| `post-bump-fix` | medium / low | A fix commit within `bumpFixWindowDays` after an internal bump in the same repo. Medium if it names the bumped package or uses compatibility words (breaking, compat, migrate, mismatch…); low if it only lands within 2 days of a **major** internal bump. | The bump exposed an integration break after release. |

A **fix commit** has a `fix:`/`hotfix:`/`bugfix:` conventional prefix (but not the `deps` or `release` scopes), or has no conventional prefix and a subject containing fix/bug/hotfix/regression/broken/crash/incident (but not "typo"). Any other conventional type wins: `docs: fix anchors` and `chore: fix lint` are not fixes. Dependency-update subjects (`chore(deps)`, `fix(deps)`, `update dependency … to v2`) are bumps, not fixes.

Each commit is assigned to at most one bug, in the order of the table rows: regressions, then groups, then single-commit categories.

## Duplicated and coordinated work

Commits that are not bumps, releases or bugs are grouped across repos when they share a ticket key or a near-identical subject (token Jaccard ≥ `similarity` after removing conventional prefixes, ticket keys, PR numbers and SHAs, at least 3 tokens, within `groupWindowDays`). Groups spanning more than twice the window are dropped as long-lived tickets.

- **Repeated maintenance** — every commit in the group only touches CI, lint, format, TypeScript, test-runner, Docker, Renovate or editor config, or is a dependency update (`chore(deps): …`). Each extra repo is a duplicate copy. It is a cost but **not** coupling: every repo has tooling, so it never pulls repos into a migration cluster.
- **Coordinated change** — any other group: one feature or refactor split across repos. This is coupling.

## Known blind spots

State these when the user questions a number:

- Squash-merged PRs hide branch history; merge-commit workflows contribute every branch commit.
- Bugs fixed without a fix-like subject, or never fixed in git (worked around in config, data or ops), are missed. Counts are a floor for the categories above, not a total bug count.
- Bumps in lockfiles only, in non-npm manifests (Maven, Gradle, Go, Python) and Git submodule pointer updates are not counted.
- Similar subjects can coincide by chance; review step 4 in SKILL.md exists to exclude them.
