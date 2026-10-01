# Star Catch — roadmap

Every step to get from today to the full product, in order, across the three repositories.
Detail lives in the linked docs; this file is only the checklist. Picture:
[docs/diagrams/infrastructure.svg](docs/diagrams/infrastructure.svg).

`[sc]` star-catch · `[cx]` crux · `[inf]` crux-infra · numbers are task files in `docs/tasks/`.

## 0. Settle the plan (this week)

- [ ] Review and commit the new docs: `backend.md`, `changes.md`, `implementation-plan.md`, `PLAN.md` `[sc]`; `docs/azure-migration.md` `[cx]`
- [ ] Decide: test-case units ([docs/changes.md](docs/changes.md) §3.1, changes fixture 08)
- [ ] Create `kiasm-tech/star-catch` on GitHub and push this repo `[sc]`
- [ ] Delete the local `crux-ast-diff` prototype (never pushed)

## 1. Graded path — offline, before the study runs (04/11)

Nothing here waits for Azure. Everything runs from the CLI on recorded and synthetic PRs.

- [ ] **03** Scaffold the backend: pnpm workspace, CI, `packages/contracts`, `fixtures/` and task 02's schema moved from Crux, `apps/cli` `[sc]`
- [ ] **05** `packages/changes` M0–M2: parse, declarations, verdicts, change types, refactorings `[sc]`
- [ ] **06** Classification (rules, fast model, label cache), links and entry points, context assembly (`changes` M3–M4) `[sc]`
- [ ] **07** Sections and script `[sc]`
- [ ] **08** Scenes and article data `[sc]`; detail page and player reading `contracts` types from fixture JSON `[cx]`
- [ ] **10** Narration audio `[sc]`; synced playback `[cx]`
- [ ] **11** Visual catalogue `[cx]`
- [ ] Study: protocol, pilot, runs, analysis (SC-15 … SC-19, dates in `PLAN.md` §4)

## 2. Crux on Azure — can run alongside step 1

Phases from Crux's `docs/azure-migration.md`.

- [ ] Phase 0: `crux-infra` applies dev (environment, Postgres, Blob, Key Vault) `[inf]`
- [ ] Phase 1: Postgres replaces Firestore `[cx]`
- [ ] Phase 2: Better Auth replaces Firebase Auth `[cx]`
- [ ] Phase 3: polling replaces `onSnapshot` `[cx]`
- [ ] Phase 4: pg-boss + `crux-worker` job `[cx]` `[inf]`
- [ ] Phase 5: deploy to Container Apps, delete Firebase `[cx]` `[inf]`

## 3. Live path — after Phases 1 and 4 (Tier B, December–January)

- [ ] `crux-infra`: `star-catch-intake`, `star-catch-worker`, `star-catch-redeliver`, identities, webhook secret `[inf]`
- [ ] **04** `intake`, `worker`, `redeliver`; move task 01 out of Crux `[sc]`; `crux-worker` consumes `crux.github-event` `[cx]`
- [ ] Switch the GitHub App's webhook URL to `intake`; delete Crux's webhook route, ingest code and sweep `[cx]`
- [ ] Crux reads drafts through `contracts` and `star_catch` views; settings write `public` `[cx]`
- [ ] **09** PR comments and `@star-catch update` `[sc]`
- [ ] **12** Publish on merge `[sc]`; emails with magic links from `crux.catch-published` `[cx]`
- [ ] **13** Ask, react, earn XP `[cx]`
- [ ] **14** Make the classifier replaceable: label dataset, gold corrections, evaluation harness `[sc]`
- [ ] Prod: apply `crux-infra` prod, point the domain, watch a week of deliveries `[inf]`

## 4. Later

- [ ] Go in `packages/changes`, then C#, Kotlin, Rust, Ruby, PHP as users need them `[sc]`
- [ ] Jev: train on `star_catch.unit_labels`, route it first and the model only below a confidence threshold `[sc]`
- [ ] MP4 export as a Container Apps Job (SC-38) `[cx]` `[inf]`
- [ ] Weekly multi-repo digest (SC-39), private-repo policy (SC-40), Slack delivery (SC-41)
- [ ] Inline `revise` endpoint on `intake`, only if fix-mode chat feels slow `[sc]`

## For every later change

1. Update the doc it touches (`backend.md`, `changes.md`, `pr-analysis.md`, Crux's `azure-migration.md`).
2. Add the answer key first: a synthetic fixture or a recorded PR whose correct result is obvious.
3. Write a task file with a prompt (`docs/tasks/`, following `tasks/conventions.md`).
4. Branch, implement, run the task's checks; contracts change → bump the major and update Crux in
   the same week.
5. Tick it here and move the card on `BOARD.md`.
