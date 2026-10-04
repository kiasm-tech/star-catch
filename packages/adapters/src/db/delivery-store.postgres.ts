import { sql } from "kysely";
import type { DeliveryStatus, DeliveryStore, WebhookDelivery } from "@star-catch/pipeline";
import type { StarCatchDb } from "./database.js";
import { toJsonb } from "./jsonb.js";

export class PostgresDeliveryStore implements DeliveryStore {
  constructor(private readonly db: StarCatchDb) {}

  async add(delivery: WebhookDelivery): Promise<DeliveryStatus> {
    const inserted = await this.db
      .insertInto("star_catch.webhook_deliveries")
      .values({
        delivery_id: delivery.id,
        event: delivery.event,
        action: delivery.action,
        installation_id: delivery.installationId,
        payload: toJsonb(delivery.payload),
      })
      .onConflict((oc) => oc.column("delivery_id").doNothing())
      .returning("delivery_id")
      .executeTakeFirst();
    if (inserted) return "new";
    const stored = await this.db
      .selectFrom("star_catch.webhook_deliveries")
      .select("handled_at")
      .where("delivery_id", "=", delivery.id)
      .executeTakeFirstOrThrow();
    return stored.handled_at ? "handled" : "pending";
  }

  async markHandled(id: string): Promise<void> {
    await this.db
      .updateTable("star_catch.webhook_deliveries")
      .set({ handled_at: sql<Date>`now()` })
      .where("delivery_id", "=", id)
      .execute();
  }
}
