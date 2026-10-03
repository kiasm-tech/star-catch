import type { DeliveryStore, WebhookDelivery } from "@star-catch/pipeline";
import type { StarCatchDb } from "./database.js";
import { toJsonb } from "./jsonb.js";

export class PostgresDeliveryStore implements DeliveryStore {
  constructor(private readonly db: StarCatchDb) {}

  async add(delivery: WebhookDelivery): Promise<boolean> {
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
    return inserted !== undefined;
  }
}
