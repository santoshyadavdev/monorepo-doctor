---
title: Run in CI
description: Run monorepo-doctor in a GitHub Actions job and fail the build at a severity threshold.
---

You can run monorepo-doctor on every pull request and fail the job when findings reach a severity threshold.

## How it fits together

1. A non-interactive agent CLI runs the skill and writes the reports into the workspace.
2. A **separate workflow step** reads `monorepo-doctor-report.json` and exits non-zero at the threshold. An agent-internal threshold can't fail the job reliably, so keep this step outside the agent.
3. Both reports are uploaded as an artifact.

You can also ask for CI mode in a prompt — the agent then prints the failing findings for you:

```text
Run monorepo-doctor in CI mode, fail on high.
```

## GitHub Actions example

Replace the agent command with the non-interactive CLI for your environment.

```yaml
name: monorepo-doctor

on:
  pull_request:
  workflow_dispatch:

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '22.5'

      - name: Run monorepo-doctor (adapt to your agent)
        run: |
          copilot -p "Run the monorepo-doctor skill on this repo and write reports to ./" --allow-all-tools

      - name: Fail on high findings
        run: |
          node -e '
          const fs = require("node:fs");
          const order = ["low", "medium", "high", "critical"];
          const reportPath = process.argv[1];
          const threshold = process.argv[2] || "high";
          const min = order.indexOf(threshold);
          if (!reportPath || min === -1) process.exit(2);
          const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
          const bad = (report.findings || []).filter((f) => order.indexOf(f.severity) >= min);
          for (const f of bad) console.error(`${f.severity.toUpperCase()} ${f.id} ${f.location?.file ?? "—"}`);
          process.exit(bad.length ? 1 : 0);
          ' monorepo-doctor-report.json high

      - name: Upload monorepo-doctor report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: monorepo-doctor-report
          path: |
            monorepo-doctor-report.md
            monorepo-doctor-report.json
```

:::tip[Install dependencies for full coverage]
This example doesn't install dependencies, so the knip, Nx graph and Turbo dry-run steps will be `partial`. For best coverage, run the audit after your normal install step.
:::

## Threshold values

`low`, `medium`, `high` or `critical`. A finding fails the job when its severity is at or above the threshold. See the [severity rubric](/skills/monorepo-doctor/#output).
