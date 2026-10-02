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
}

export interface PrSnapshotsTable {
  repo: string;
  head_sha: string;
  pr_number: number;
  captured_at: Generated<Date>;
  snapshot: Json;
}

/** The star_catch schema, as db/migrations leaves it. */
export interface Database {
  "star_catch.webhook_deliveries": WebhookDeliveriesTable;
  "star_catch.pr_snapshots": PrSnapshotsTable;
}
