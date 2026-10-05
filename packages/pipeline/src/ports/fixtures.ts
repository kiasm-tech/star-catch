import type { PullRequestSnapshot } from "@kiasm-tech/star-catch-contracts";
import type { OpenedWebhook } from "../fixtures/webhook.js";

/** A stored file as read, before any validation: checking it is the core's job. */
export interface StoredJson {
  name: string;
  data: unknown;
}

export interface SyntheticFixtureFiles {
  name: string;
  snapshot: unknown;
  expected: unknown;
  /** `expected-sections.json`; undefined when the file is missing. */
  sections?: unknown;
}

export interface FixtureReader {
  recordedSnapshots(): Promise<StoredJson[]>;
  recordedWebhooks(): Promise<StoredJson[]>;
  /** Sorted by name. */
  syntheticFixtures(): Promise<SyntheticFixtureFiles[]>;
}

export interface Recording {
  id: string;
  snapshot: PullRequestSnapshot;
  webhook: OpenedWebhook;
}

export interface FixtureWriter {
  saveRecording(recording: Recording): Promise<void>;
}
