# Bazel + rules_js audit fixture

A small npm workspace with a Bazel `rules_js` layer. It intentionally includes
one deep JS import, an internal Bazel target exposed to every package, and a
production-tagged target that depends on a `testonly` target. These are audit
seeds, not a production template; the test-only dependency is expected to make
a real Bazel build fail.

Run the source workspace with Node >= 22.5 and npm:

```bash
npm start
npm test
```

To build the valid Bazel target, use Bazel 8.4.2 (or Bazelisk, which reads
`.bazelversion`):

```bash
bazel build //apps/storefront:app
```

The Bazel module pins `rules_nodejs` and `aspect_rules_js`. Bazel itself is not
required to audit this fixture. The `release_bundle` target is intentionally
invalid: Bazel rejects its dependency on a `testonly` target during analysis.
Do not use `bazel build //...` unless you intend to see that failure.

## Audit it

Install the skill using the [repository instructions](../../README.md#install),
then start your agent **in this directory**:

```text
Run monorepo-doctor on this workspace. Write reports to the default report directory.
```

Verify the agent-generated report from the parent repository root:

```bash
node scripts/verify-fixture.mjs \
  "$(node -p 'require("os").tmpdir()')/monorepo-doctor-reports/monorepo-doctor-report.json" \
  fixtures/expected/bazel-rules-js.json
```

## Seeded use cases

| Check | Seed and expected finding |
|---|---|
| Boundaries | Storefront imports the math package's internal source by relative path: `boundaries/deep-import`. Import its public entry point instead. |
| Bazel visibility | The `internal`-tagged `rounding_internal` target is public: `boundaries/bazel-public-internal-target`. Review consumers before narrowing access. |
| Production build | `//apps/storefront:release_bundle` depends on the `testonly` fixture target: `prod-leakage/bazel-testonly-dependency`. Remove the fixture from the production target, while keeping it test-only. |

The Bazel checks are static and always report `partial`: they do not evaluate
macros, selects, package groups, or external dependencies. The `internal` tag
is a fixture convention, not a built-in Bazel policy. A blocked test-only
dependency is a build error, not proof that test code shipped.
