import type { ColumnType, Generated } from "kysely";

/** Written as a JSON string, read back parsed. */
type Json = ColumnType<unknown, string, string>;

export interface WebhookDeliveriesTable {
  delivery_id: string;
  event: string;
  action: string | null;
  /** pg returns bigint as a string. */
  installation_id: ColumnType<string | null, number | null, number | null>;
  received_at: Generated<Date>;
  payload: Json;
  handled_at: ColumnType<Date | null, never, Date>;
}

export interface PrSnapshotsTable {
  repo: string;
  head_sha: string;
  pr_number: number;
  captured_at: Generated<Date>;
  snapshot: Json;
}

export interface CatchVersionsTable {
  catch_id: string;
  head_sha: string;
  repo: string;
  pr_number: number;
  created_at: ColumnType<Date, Date | undefined, Date>;
  version: Json;
}

export interface CatchRunsTable {
  id: Generated<string>;
  repo: string;
  pr_number: number;
  head_sha: string;
  started_at: Generated<Date>;
  finished_at: ColumnType<Date | null, never, Date>;
  status: ColumnType<"running" | "done" | "failed", never, "done" | "failed">;
  step: string | null;
  error: string | null;
  usage: ColumnType<unknown, never, string | null>;
}

export interface RepoSettingsTable {
  repo: string;
  enabled: boolean;
  updated_at: ColumnType<Date, Date | undefined, Date>;
}

/** The star_catch schema, as db/migrations leaves it. */
export interface Database {
  "star_catch.webhook_deliveries": WebhookDeliveriesTable;
  "star_catch.pr_snapshots": PrSnapshotsTable;
  "star_catch.catch_versions": CatchVersionsTable;
  "star_catch.catch_runs": CatchRunsTable;
  "star_catch.repo_settings": RepoSettingsTable;
}
