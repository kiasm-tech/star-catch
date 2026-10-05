# Star Catch

Subscribe to a codebase and find out what actually changed, without reading a single diff.

A merged pull request becomes a short narrated update — synced scenes with narration, plus an article — delivered to people who depend on the software but don't read its code.

This repository is the backend: it receives GitHub's webhooks, analyses pull requests and builds the updates. The pages live in Crux.

## Develop

```sh
pnpm install
pnpm test && pnpm typecheck && pnpm lint
pnpm cli fixtures                                         # check every fixture
pnpm cli analyze fixtures/synthetic/09-ts-extract          # a fixture's change units
pnpm bench                                                # analysis timings on the recorded PRs
STAR_CATCH_MOCK_LLM=true pnpm cli context fixtures/synthetic/08-ui-with-test   # a fixture's context, offline
STAR_CATCH_MOCK_LLM=true pnpm cli script fixtures/synthetic/15-rate-limit-per-org   # both cuts' scripts, template writer
STAR_CATCH_MOCK_LLM=true pnpm cli catch --all --out /tmp/catches              # every catch as Crux reads it
STAR_CATCH_CLASSIFIER_MODEL=… ANTHROPIC_API_KEY=… pnpm eval:classify         # what it would send; --yes sends it
GITHUB_TOKEN=… pnpm cli record pmndrs/zustand 3469         # record a public PR as a fixture
docker compose up -d --wait                               # local Postgres
DATABASE_URL=postgres://star_catch:star_catch@localhost:5432/star_catch pnpm cli migrate
DATABASE_URL=… GITHUB_WEBHOOK_SECRET=dev pnpm intake           # webhook receiver on :8080
DATABASE_URL=… STAR_CATCH_REPOS=pmndrs/zustand STAR_CATCH_MOCK_GITHUB=true pnpm worker --watch
GITHUB_WEBHOOK_SECRET=dev pnpm replay fixtures/webhooks/pmndrs__zustand__3469.opened.json
```

Node 22.12 or later. Tests need Docker running: they start their own Postgres
(`STAR_CATCH_TEST_DATABASE_URL` points them at an existing server instead).

The real classifier needs `STAR_CATCH_CLASSIFIER_MODEL` and `ANTHROPIC_API_KEY`, or `OPENAI_API_KEY`
(with `OPENAI_BASE_URL` for Azure AI Foundry); its labels are cached in `.cache/labels.json`.

Dependency rules: [test/architecture.test.ts](test/architecture.test.ts), mirrored in ESLint.

## Publishing the contracts package

`@kiasm-tech/star-catch-contracts` (`packages/contracts`) is what Crux installs from GitHub
Packages. `.github/workflows/publish-contracts.yml` publishes it when a `contracts-v<version>` tag is
pushed; the tag must match `packages/contracts/package.json`.

1. Bump `version` in `packages/contracts/package.json`, commit, and push the branch:
   `git push -u origin <branch>`.
2. Tag that commit and push the tag:
   ```sh
   git tag contracts-v<version> <branch>
   git push origin contracts-v<version>
   ```
3. Watch the run:
   ```sh
   gh run watch -R kiasm-tech/star-catch "$(gh run list -R kiasm-tech/star-catch --workflow publish-contracts.yml -L 1 --json databaseId -q '.[0].databaseId')"
   ```
4. Check the version is there (`gh auth refresh -s read:packages` if `gh` lacks the scope):
   `gh api /orgs/kiasm-tech/packages/npm/star-catch-contracts/versions --jq '.[].name'`.

Set up once, already done for Crux:

5. Package settings → *Manage Actions access* → add `kiasm-tech/crux` with **Read**, so Crux's CI
   installs with its own `GITHUB_TOKEN`.
6. A classic token with only `read:packages` (SSO-authorised for kiasm-tech) for everything else:
   `export NPM_TOKEN=…` in your shell, and `firebase apphosting:secrets:set NPM_TOKEN` for Crux's
   App Hosting builds.
7. Check it: `npm view @kiasm-tech/star-catch-contracts versions --registry=https://npm.pkg.github.com --//npm.pkg.github.com/:_authToken="$NPM_TOKEN"`.

## Docs

| Doc | Read it for |
| --- | --- |
| [docs/diagrams/infrastructure.svg](docs/diagrams/infrastructure.svg) | What runs where |
| [docs/pr-analysis.md](docs/pr-analysis.md) | The context: units, labels, facts |
| [docs/spec-update-structure.md](docs/spec-update-structure.md) | How an update is built from the context |
