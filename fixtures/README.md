# Star Catch fixtures

`snapshots/` holds recorded pull requests and `webhooks/` a matching `pull_request.opened` payload
for each. With `STAR_CATCH_MOCK=true` the GitHub adapter serves these snapshots instead of calling
GitHub; tests replay the payloads.

Recorded with `GITHUB_TOKEN=… pnpm cli record pmndrs/zustand 3443 3469 3555` (public repos only;
any personal token):

| PR | Shape |
|---|---|
| pmndrs/zustand#3443 | Refactor removing a duplicate type augmentation — one source file |
| pmndrs/zustand#3469 | Fix with a test — one source file, one test file |
| pmndrs/zustand#3555 | Larger fix with tests — one source file, one test file |

Chosen as a small public TypeScript repository.

## Synthetic

`synthetic/NN-name/` holds tiny hand-made PRs whose correct context is obvious — the answer key for
change detection and classification. Each folder has:

- `snapshot.json` — a `PullRequestSnapshot` for `acme/shop` with its own PR number, fake 40-char
  hex shas and `installationId: null`. Every file has `baseContent`/`headContent` as its status
  implies and a unified-diff `patch` (hunks only, as GitHub returns it) with matching
  `additions`/`deletions`.
- `expected.json` — a partial context (`ContextExpectationSchema`) stating only what is
  unambiguous. A field left out is not checked; an array that is present is the whole set, so
  `"units": []` means no units. Never state intent or visibility — those are the classifier's.

`loadSyntheticFixtures()` and `expectContextMatches()` in `packages/testkit` load them and compare
a context with an expectation.

To add one: create the next `NN-name/` folder, write the base and head versions of each file, and
take the patch from `git diff --no-index -U3 base head`, dropping the lines before the first `@@`.
Keep files a few lines long and end them with a newline. `pnpm cli fixtures` checks every fixture:
the contracts, the patch counts, and that each patch turns the base content into the head content.

| Fixture | Answer |
|---|---|
| 01-formatting-only | TS function re-indented → notAChange |
| 02-comment-only | Comments inside a TS function edited → notAChange |
| 03-rename-only | TS function renamed, two callers updated → all structural, rename |
| 04-lockfile-only | `pnpm-lock.yaml` changed → excluded as lockfile, no units |
| 05-condition-change | Discount threshold changed → behavioural, conditionChanged; a problem sentence |
| 06-config-key | New key in `config/flags.json` → configKey added, kind configuration |
| 07-migration | SQL migration adds a column → schemaEntity added, risk dataMigration |
| 08-ui-with-test | Page text and its test changed → ui unit, a test-case unit, covers link, page entry point |
| 09-ts-extract | TS block extracted into a helper → both structural, extract |
| 10-python-rename | Python function renamed, callers updated → structural, rename |
| 11-python-condition | Python threshold changed → behavioural, conditionChanged |
| 12-python-extract | Python method extracted → structural, extract |
| 13-java-extract-move | Java method extracted, another moved to another class → structural, extract and move |
