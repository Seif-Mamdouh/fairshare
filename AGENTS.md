# Project workflow

For each new feature, fetch `origin/main` and create a new descriptive `feature/*` branch from it before making feature changes. Commit coherent changes and push that branch to GitHub as work progresses. Keep unfinished work on its existing feature branch. After implementation review and required checks pass, merge completed feature work into `main` without requesting additional approval. Do not bypass branch protections or required checks. Sync `main` and verify/deploy the merged result; preserve published history.

Keep app source, migrations, tests, and documentation in this repository. Keep credentials, local databases, dependencies, exported bundles, and scratch evidence out of commits. Before pushing, inspect the staged diff and run the relevant checks from `package.json`.

When changing agent receipt behavior or tools, read `docs/AGENT_API.md` and update the OpenAPI contract alongside the implementation. When using Splitwise as a reference, read `docs/REVERSE_ENGINEERING.md` to distinguish observed evidence from independent design choices.
