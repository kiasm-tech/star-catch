# Star Catch — implementation plan

Fourteen tasks, from the first GitHub event to a context built by classification alone. Each task
file has an overview, TODOs, how it's verified, and a complete prompt to paste into a Claude Code
session. The backend lives in this repository (`kiasm-tech/star-catch`, see
[backend.md](backend.md)); the pages stay in Crux; `crux-infra` provisions both. The picture:
[diagrams/infrastructure.svg](diagrams/infrastructure.svg).

Specs: [pr-analysis.md](pr-analysis.md) · [spec-update-structure.md](spec-update-structure.md) ·
[backend.md](backend.md) · [changes.md](changes.md) · conventions every prompt follows:
[tasks/conventions.md](tasks/conventions.md)

## Graded path — offline, in order

Everything the study needs. It runs on recorded and synthetic PRs from this repository's CLI, so it
waits for nothing in the Azure migration.

| # | Task | Repo | Size | Board card | Needed for the study |
|---|---|---|---|---|---|
| 01 | [Ingest pull requests](tasks/01-ingest-pull-requests.md) | crux — **done**; moves here in task 04 | M | #12 | Fixtures only |
| 02 | [Define the context](tasks/02-define-the-context.md) | crux — **done**; moves here in task 03 | S | #8 | Yes |
| 03 | [Scaffold the backend](tasks/03-scaffold-backend.md): workspace, CI, `contracts`, `fixtures/`, snapshot recorder, `apps/cli`; task 02's schema and fixtures move here | star-catch | M | #8 | Yes |
| 05 | [Detect changes](tasks/05-detect-changes.md): `packages/changes`, [changes.md](changes.md) M0–M2 | star-catch | XL | #8 | Yes |
| 06 | [Classify and assemble the context](tasks/06-classify-and-assemble.md): rules, fast-model classifier, label cache, links, entry points; assembly in `pipeline` | star-catch | L | #8 | Yes |
| 07 | [Select sections and write the script](tasks/07-sections-and-script.md) | star-catch | L | #8 | Yes |
| 08 | [Silent video, article and detail page](tasks/08-silent-video-and-article.md): scenes and article data here; page and player in Crux, reading `contracts` types from fixture JSON | star-catch + crux | L | #9, #11 | Yes |
| 10 | [Add narration](tasks/10-narration.md): audio here; playback in Crux | star-catch + crux | M | #10 | Yes |
| 11 | [Complete the visual catalogue](tasks/11-visual-catalogue.md) | crux | L | #9 | Partly |
| 14 | [Make the classifier replaceable](tasks/14-replaceable-classifier.md) | star-catch | M | new | No |

## Live path — after Crux's Azure Phases 1 and 4 (Postgres, pg-boss)

| # | Task | Repo | Size | Board card | Needed for the study |
|---|---|---|---|---|---|
| 04 | [Intake, worker and the webhook switch](tasks/04-intake-and-worker.md): `apps/intake`, `apps/worker` (`star-catch.ingest`, `.generate`), `apps/redeliver`; move task 01 out of Crux; Crux consumes `crux.github-event`; point the GitHub App at `intake` | star-catch + crux + crux-infra | L | #12 | No |
| 09 | [Post comments and regenerate](tasks/09-comments-and-regeneration.md) | star-catch | M | #12 | No |
| 12 | [Publish and notify](tasks/12-publish-and-notify.md): publish and recipients here; emails and magic links in Crux (`crux.catch-published`) | star-catch + crux | L | #13 | No |
| 13 | [Ask, react and earn XP](tasks/13-ask-react-earn-xp.md) | crux | M | #14 | No |

Sizes: S = half a day, M = one day, L = two days, XL = four days.

## How verification works

Every check is an automated test that runs offline. Three things make that possible:

- **Recorded fixtures** (task 01): real PRs and their webhook payloads, replayed instead of calling
  GitHub — through the CLI on the graded path, through `pnpm replay` against a local `intake` on the
  live path.
- **Synthetic fixtures** (task 02): thirteen tiny hand-made PRs in TypeScript, Python, Java, JSON
  and SQL, plus one copying PR #921 (task 07), whose correct result is obvious. They're
  the answer key for analysis, classification and section
  choice — nothing downstream is checked by reading output.
- **Mock adapters** for GitHub, the LLM, speech, mail and storage, selected by `STAR_CATCH_MOCK` here
  and the existing `CRUX_MOCK_*` switches in Crux. The LLM and speech are always replaceable
  adapters, never the thing under test. Change analysis needs no mock: it runs in process, in
  milliseconds.

What's left to a person:
- **Task 04:** one-time cloud setup in `crux-infra` — identities for `intake` and the worker, the
  webhook secret in Key Vault, the job's KEDA rule — and switching the GitHub App's webhook URL.
- **Task 06:** the classifier model variable.
- **Tasks 08 and 11:** glance at the page once when accepting the first visual snapshots.
- **Tasks 09, 10, 12:** an optional live check against the sandbox repository, only when the real
  adapter changes.

## Choices that keep it fast

- **Tasks 01 and 02 are done.** They move into this repository instead of being rewritten.
- **Change analysis runs in process.** A tree-sitter declaration diff took 16–222 ms on the
  recorded PRs, so there's no separate service to build or deploy ([changes.md](changes.md) §1).
- **The graded path waits for no infrastructure.** It runs from the CLI on fixtures; the live path
  starts once Crux is on Postgres and pg-boss.
- **Task 08 renders no video files.** Visuals are pure components, so the article and the tests
  reuse them directly.
- **Publishing and engagement are separate tasks** (12 and 13), so each fits in a day or two.
