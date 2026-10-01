# Star Catch — update structure spec (video + article)

How a pull request becomes a technical and a business update: which sections each one has, when a
section is allowed in, and which visual carries it. This replaces both earlier drafts.

---

## 1. The pipeline

```
Pull request
  → Facts       read once from the PR, plus what the model infers (always with a source)
  → Gates       should this PR get an update at all, and which cuts?
  → Selection   sections whose precondition holds, in chapter order, within the length cap
  → Script      one document per cut: chapters → sections → narration + visual + sources
  → Narration   speech first; its timing sets how long every scene lasts
  → Video       Remotion renders one component per visual type
  → Article     the same script as text, each visual shown as its final frame
```

## 2. Principles

1. **One arc, two cuts.** Both cuts follow the same seven chapters in the same order. Switching from
   one cut to the other changes the depth, not the story.
2. **A section appears only if its precondition holds.** Nothing is padded and nothing is guessed.
3. **Explain systems, not code.** The technical cut talks about components, interactions and data,
   never lines, functions or files. The business cut talks about features, people and outcomes,
   never components.
4. **Every sentence has a source.** Each line of narration points to the fact it came from. A
   sentence without a source is removed.
5. **Never invent numbers.** A number appears only if it exists in the facts.
6. **Voice first, picture second.** Narration is generated first. Its timing decides how long each
   scene lasts and when each diagram step appears.
7. **Video and article carry the same content.** Same chapters, same order. A section cut from the
   video for time moves to the article's *Read more*; it isn't lost.

---

## 3. Gates — does this PR get an update?

| Gate | Passes when | If it fails |
|---|---|---|
| **Readable** | Metadata and diff are available and under the size limit (e.g. ≤ 80 files, ≤ 5k lines) | Article only, built from the description |
| **Meaningful** | The change isn't *only* lockfiles, generated files, formatting or bot dependency bumps | No update; one line in the repo digest |
| **Explainable** | A *why* can be stated from the description, a linked issue or the commits | Article only, marked "low context" |
| **Safe** | Nothing shown contains secrets or files on the denylist | Remove that material; skip if nothing is left |
| **Visible** *(business cut only)* | A user-, customer- or process-visible effect can be named | Technical cut only |

---

## 4. Facts — read once per PR

How they are produced: [pr-analysis.md](pr-analysis.md).

Two kinds. **Read** facts come straight from the PR, the repo or CI. **Inferred** facts come from the
model and must cite what they were inferred from.

| Group | Facts | Kind |
|---|---|---|
| Identity | number, title, author, state (open / merged), labels, reviewers | read |
| Intent | why it was done, what was wrong before, linked issues | inferred |
| Shape | components touched (files grouped into named components), components added or removed, size counted in components rather than lines | read + inferred |
| Interactions | flows between components, entry points touched (pages, endpoints, jobs, commands) | inferred |
| Data | entities changed, state or lifecycle fields changed, stores touched | read + inferred |
| Contracts | public API, events or schemas changed; breaking or not | read + inferred |
| Rules | a business rule whose outcome changed (what counts, who may do what) | inferred |
| Users | screens touched, before/after screenshots or preview link, personas affected | read + inferred |
| Rollout | feature flags, migrations, config changes, phased release | read |
| Quality | tests added or changed, CI status | read |
| Reach | components and features that depend on what changed | read |
| Evidence | real numbers from the PR, issue or CI: benchmarks, metrics, counts | read, **never inferred** |

**Shape**, **Interactions** and **Reach** come from the change units' components and links
([pr-analysis.md](pr-analysis.md) steps 8–10).

---

## 5. The shared arc

| # | Chapter | Question it answers | Shown |
|---|---|---|---|
| 1 | **Opening** | What happened, in one sentence? | Always |
| 2 | **Why** | What was wrong before? | If the intent has a "before" |
| 3 | **What changed** | What is different now? | Always |
| 4 | **How it works** | How does it behave now? | If a flow or rule can be shown |
| 5 | **Reach** | Who and what does it touch? | If anything beyond the change itself is affected |
| 6 | **Watch out** | What could go wrong, and when does it land? | If any risk or rollout fact exists |
| 7 | **Wrap** | What should I remember, and what comes next? | Always |

A chapter with no qualifying section is skipped. The chapter bar only lists chapters that are there.

**Inclusion levels** used below:
- **Always** — included once the gates pass.
- **When relevant** — included whenever the precondition holds.
- **If room** — included only if the length cap allows; otherwise it moves to *Read more*.

---

## 6. Technical cut — sections

| Section | Chapter | Include | Precondition | Visual |
|---|---|---|---|---|
| Title & summary | Opening | Always | — | Title card |
| The problem | Why | When relevant | Intent has a "before" | Before/after split |
| Change map | What changed | Always | ≥ 1 component touched | Component map |
| Structure change | What changed | When relevant | Components added, removed or re-wired | Architecture morph |
| Contract change | What changed | When relevant | A public API, event or schema changed | Contract card |
| Data change | What changed | When relevant | A data entity changed | Data model diff |
| Interaction | How it works | When relevant | A flow of ≥ 3 steps across ≥ 2 components | Sequence diagram |
| Lifecycle | How it works | When relevant | A state or status was added, or its transitions changed | State machine |
| Rule | How it works | When relevant | A rule's outcome changed | Decision diagram |
| Data flow | How it works | If room | Data moves through ≥ 3 places | Data flow |
| Reach | Reach | When relevant | ≥ 1 dependent outside the change | Impact rings |
| Verification | Watch out | When relevant | Tests or CI status known | Checklist |
| Risks & rollout | Watch out | Always, if any risk fact | Migration, breaking contract, flag, config change, or untested code | Risk cards + rollout timeline |
| Review focus | Watch out | When relevant | PR is still open | Component map, top 3 ranked |
| Wrap | Wrap | Always | — | Recap (+ next steps if follow-up issues exist) |

## 7. Business cut — sections

| Section | Chapter | Include | Precondition | Visual |
|---|---|---|---|---|
| Headline | Opening | Always | — | Title card with the outcome sentence |
| Before | Why | When relevant | A pain point is stated in the issue or description | User journey, or a "before" screenshot |
| What's new | What changed | Always | Visible gate passed | Screenshot slider if screenshots exist; otherwise system sequence diagram |
| How it works for you | How it works | When relevant | A user-facing flow of ≥ 2 steps | System sequence diagram |
| The rule now | How it works | When relevant | A rule's outcome changed | Decision diagram, in plain words |
| Who it affects | Reach | When relevant | A persona, customer group or feature can be named | Persona cards, or feature map |
| In numbers | Reach | When relevant | A real number exists in Evidence | Metric card |
| What to know | Watch out | When relevant | Breaking, customer-visible, compliance-relevant, or phased rollout | Notice card + rollout timeline |
| What you may need to do | Watch out | When relevant | Someone must act: tell customers, update docs, change pricing | Checklist |
| Wrap | Wrap | Always | — | Recap |

---

## 8. Visual catalogue

One Remotion component per visual. **One visual per section.** A diagram never has more than about
**seven elements**; if it needs more, split it. Every step a diagram reveals is triggered by a word in
the narration. In the article, each visual appears as its final frame.

### Structure

| Visual | Shows | In the video | Cut |
|---|---|---|---|
| **Component map** | Components as boxes, what changed lit up | Boxes settle in, changed ones fill | T |
| **Architecture morph** | The same map before and after | Edges re-route, boxes appear or fade | T |
| **Context diagram** | The product in the middle, users and external systems around it | The external system that changed pulses | T · B |
| **Deployment view** | Services, queues, databases, regions | New pieces slide in | T |

### Behaviour

| Visual | Shows | In the video | Cut |
|---|---|---|---|
| **System sequence diagram (SSD)** | The user and the product as a black box, messages over time | Each message draws as it is spoken | B · T |
| **Sequence diagram** | Components as lifelines, messages between them | Step by step on the narration | T |
| **State machine** | States and the transitions between them | The current path lights up | T · B |
| **Decision diagram** | Conditions leading to outcomes | A token walks the path taken | T · B |
| **Request pipeline** | The stages a request passes through (auth, limits, handling) | A packet travels through the stages | T |
| **Event flow** | Producers, events, consumers | Events fan out to their consumers | T |

### Data

| Visual | Shows | In the video | Cut |
|---|---|---|---|
| **Data flow** | Where data comes from and where it ends up | Packets move along the arrows | T |
| **Data model diff** | Entities as cards, fields added and removed | Fields slide in or strike out | T |
| **Contract card** | What goes in and out of an API, before and after | Fields flip from old to new | T |
| **Permission matrix** | Roles × actions, changed cells marked | Cells flip | T · B |

### People and product

| Visual | Shows | In the video | Cut |
|---|---|---|---|
| **User journey** | Steps a user takes, the changed one marked | The camera walks along the path | B |
| **Swimlane** | Who does what, across people and systems | Lanes fill in order | B · T |
| **Screenshot slider** | The screen before and after | Wipe from old to new | B · T |
| **Persona cards** | Who benefits, and how | Cards deal in one by one | B |
| **Feature map** | Areas of the product touched | Areas light up | B |

### Change over time

| Visual | Shows | In the video | Cut |
|---|---|---|---|
| **Before/after split** | Any two states side by side | Split wipe | T · B |
| **Rollout timeline** | Merge → deploy → flag → everyone | A marker travels the line | T · B |

### Reach and evidence

| Visual | Shows | In the video | Cut |
|---|---|---|---|
| **Impact rings** | The change at the centre, dependents in rings: components (T), features or teams (B) | Rings expand outward | T · B |
| **Metric card** | One real number, with its source | Counts up | T · B |
| **Checklist** | What proves it works, or what someone must do | Items tick | T · B |
| **Risk cards** | A risk and how it's handled | Cards flip from risk to mitigation | T · B |

### Frame and navigation

| Visual | Shows | Cut |
|---|---|---|
| **Title card** | PR, author, state, cut | T · B |
| **Chapter bar** | Chapters present, progress through them — visible throughout | T · B |
| **Glossary card** | One term, defined in a sentence | B |
| **Recap** | The chapter bar with every chapter ticked | T · B |

**Where to start building:** title card, chapter bar, component map, SSD, sequence diagram,
decision diagram and recap. Those seven cover the required sections of both cuts and the most common
optional ones.

---

## 9. Length

- Narration runs at about **150 words per minute**.
- **Business cut: 60–120 s** (≤ 250 words). **Technical cut: 2–5 min** (≤ 650 words). No section over
  60 s.
- Fill order: *Always* sections → *When relevant* in chapter order → *If room*. Stop at the cap.
  Anything that doesn't fit moves to the article's *Read more*.
- If the *Always* sections alone exceed the cap, shorten their narration — never drop them.
- Two voices: calm and precise for the technical cut, warmer for the business cut.

---

## 10. The script document

One document per cut. The model writes it from the facts and the selected sections; it's checked
(§12) before narration is generated.

```jsonc
{
  "cut": "business",
  "pr": { "number": 921, "title": "Rate limits count per organisation, not per key", "state": "merged" },
  "chapters": [
    {
      "id": "how",
      "title": "How it works",
      "sections": [
        {
          "id": "rule",
          "visual": { "type": "decisionDiagram", "data": { "…": "…" } },
          "narration": "If a team uses two keys, <mark name='shared'/>both now count against one limit.",
          "reveals": { "shared": "outcome-shared-limit" },  // voice mark → diagram element
          "sources": ["issue", "description"],
          "article": { "heading": "The rule now", "readMore": false }
        }
      ]
    }
  ]
}
```

## 11. The article

- Chapter titles are headings; section titles are subheadings.
- Each section is the narration rewritten as short prose, followed by the visual's final frame.
- *Read more* holds the sections that didn't fit the video's length cap.
- Each section links to its sources (the PR, the issue).
- Caption under the title: *same content as the video*.

## 12. Checks before a developer sees the draft

| Check | Rule |
|---|---|
| **Sourced** | Every narration sentence has at least one source; unsourced sentences are removed |
| **No invented numbers** | Numbers come only from Evidence |
| **Right altitude** | Technical: no functions, lines or file paths. Business: no component names, and no acronym without a glossary card |
| **Voice matches picture** | Every voice mark exists in its visual, and every step a visual reveals has a mark |
| **Readable diagrams** | At most about seven elements per diagram |
| **Length** | Within the cap; no section over 60 s |
| **Same content** | Video and article have the same chapters in the same order |

What can be fixed automatically is fixed. What can't is flagged in the draft, where the developer
corrects it through the *Fix content* chat.

---

## 13. Worked example — PR #921 *Rate limits count per organisation, not per key*

**Facts that matter:** before, each API key had its own limit, so an organisation with two keys got
twice the quota. The limiter now counts per organisation; three callers (REST, GraphQL, batch
ingest) share one way of computing the limit. A migration carries existing usage over rather than
resetting it. Tests cover two keys competing for one limit. Latency moved from 4.0 to 4.2 ms under
load (stated in the PR). Merged.

| Chapter | Technical cut | Business cut |
|---|---|---|
| Opening | Title & summary | Headline: *every key in an organisation now shares one usage limit* |
| Why | The problem — two keys, two limits | Before — a team splitting traffic across keys got double the quota |
| What changed | Change map (limiter + three callers) · Structure change (callers now share one limit rule) | What's new — SSD: customer's app → API → allowed or limited, one shared limit |
| How it works | Rule — per key → per organisation · Interaction — request → gateway → limiter → store | The rule now — *two keys, one limit* |
| Reach | Impact rings — REST, GraphQL, batch ingest | Who it affects — single-key customers: no change; multi-key customers: combined usage now counts |
| Watch out | Risks & rollout — usage carried over, no reset · Verification — contention tests, latency metric card | What to know — nothing to do; if a customer asks why usage counts differently, it's this change |
| Wrap | Recap | Recap |

**Skipped, and why:** Contract change (no public API changed), Lifecycle (no new state), Review focus
(already merged), In numbers (no business metric in the facts), What you may need to do (no action
required).

Same seven chapters, same order, different depth — that's what makes the two cuts read as one update.

---

## 14. What changed from the drafts

| Draft | Now | Why |
|---|---|---|
| Eight templates (T1–T4, B1–B4) | One seven-chapter arc for both cuts | Structure comes from which sections qualify, not from choosing a template |
| Three lengths (short / standard / deep) | Length follows content, capped per cut | One less choice for the reader; the cap does the work |
| Code walkthrough, folder tree, key types, snippets, dependency lists | Removed | The technical cut explains components and interactions, not code |
| Four tiers (R / P1 / P2 / P3) | Always / When relevant / If room | Easier to reason about, same effect |
| Nine gates | Five | Speech availability and recipients are runtime concerns, not content rules |
| Blast radius v0–v3 | One *impact rings* visual | Its data source improves later; the visual doesn't change |
| 23 technical + 15 business scenes | 15 + 10 sections, 28 visuals | Sections say *what*; visuals say *how it's shown* — kept separate so each can be reused |

---

## 15. Open decisions

| Question | Why it matters |
|---|---|
| Are the caps right — business ≤ 2 min, technical ≤ 5 min? | The designs show 1:32 and 3:41; the drafts allowed up to 5 and 7 minutes |
| Where do screenshots come from — a preview deploy capture, or images in the PR? | Decides how often the business cut gets a screenshot slider instead of an SSD |
| May the technical cut use a component's code name ("RateLimiter"), or only a descriptive one ("the rate limiter")? | Sets the altitude check in §12 |
| Is *Review focus* worth keeping, given drafts are only seen by developers anyway? | It's the only section that exists purely for the draft phase |
