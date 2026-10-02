# Star Catch

Subscribe to a codebase and find out what actually changed, without reading a single diff.

A merged pull request becomes a short narrated update — synced scenes with narration, plus an article — delivered to people who depend on the software but don't read its code.

This repository is the backend: it receives GitHub's webhooks, analyses pull requests and builds the updates. The pages live in Crux.

## Develop

```sh
pnpm install
pnpm test && pnpm typecheck && pnpm lint
pnpm cli fixtures                                         # check every fixture
GITHUB_TOKEN=… pnpm cli record pmndrs/zustand 3469         # record a public PR as a fixture
```

Layout and rules: [docs/backend.md](docs/backend.md) §3.

## Docs

| Doc | Read it for |
| --- | --- |
| [docs/backend.md](docs/backend.md) | Services, queues, data, the contract with Crux |
| [docs/diagrams/infrastructure.svg](docs/diagrams/infrastructure.svg) | What runs where |
| [docs/changes.md](docs/changes.md) | How change units are computed and classified |
| [docs/pr-analysis.md](docs/pr-analysis.md) | The context: units, labels, facts |
| [docs/spec-update-structure.md](docs/spec-update-structure.md) | How an update is built from the context |
