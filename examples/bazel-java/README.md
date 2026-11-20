# Bazel + Java audit playground

This standalone Bazel workspace has a Java catalog app, a library, and
test-only fixture data. It has **no npm workspace or package.json**. Bazel
8.4.2 (or Bazelisk) and a Java toolchain are enough to build and test it;
Node >= 22.5 is needed only to run the monorepo-doctor audit.

## Run it

From this directory, with a local JDK configured:

```bash
bazel run //apps/catalog:catalog
bazel test //apps/catalog:catalog_test
```

The app prints `Total cents: 1235`. Without a local JDK, Bazel can fetch its
remote Java 17 toolchain instead:

```bash
bazel run --java_runtime_version=remotejdk_17 --tool_java_runtime_version=remotejdk_17 //apps/catalog:catalog
bazel test --java_runtime_version=remotejdk_17 --tool_java_runtime_version=remotejdk_17 //apps/catalog:catalog_test
```

The first Bazel build may download rules and toolchains. The audit never runs
Bazel or downloads them. `//apps/catalog:broken_release` intentionally depends
on test-only data and fails Bazel's analysis; consequently `bazel build //...`
is expected to fail until that seed is fixed.

## Audit it

Install the skill using the [repository instructions](../../README.md#install),
then start your agent **in this directory**:

```text
Run monorepo-doctor on this workspace. Write reports to the default report directory.
```

The audit detects the Bazel workspace without inventing npm packages. Its
boundary and production-leakage checks are `partial`; Java source cycles,
Bazel caching and Bazel CI coverage are not analyzed and those checks are
`skipped`.

Verify the agent-generated report from the parent repository root:

```bash
node scripts/verify-fixture.mjs \
  "$(node -p 'require("os").tmpdir()')/monorepo-doctor-reports/monorepo-doctor-report.json" \
  fixtures/expected/bazel-java.json
```

## Seeded use cases

| Check | Seed and expected finding | Suggested repair |
|---|---|---|
| Bazel visibility | `//libs/catalog:rounding_internal` is tagged `internal` but publicly visible: `boundaries/bazel-public-internal-target`. | Make it private to the package after confirming its consumers. |
| Production build | `//apps/catalog:broken_release` depends on `//libs/testdata:catalog_fixture`, which is `testonly`: `prod-leakage/bazel-testonly-dependency`. | Remove the fixture from the production target; keep it available to `catalog_test`. |

`internal` is a local convention, not a built-in Bazel policy; the untagged
public `catalog` API is valid. Bazel normally blocks the test-only dependency
before a build runs, so that finding does not claim that a fixture shipped.
Static inspection is partial and does not resolve macros, selects, package
groups, or external dependencies.
