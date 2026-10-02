import type { DeliveryStore } from "../ports/delivery-store.js";
import type { JobQueue } from "../ports/job-queue.js";
import { routeDelivery } from "./route.js";

/** A delivery whose signature the caller has checked. */
export interface IncomingWebhook {
  deliveryId: string;
  event: string;
  payload: Record<string, unknown>;
}

export type WebhookOutcome = { outcome: "duplicate" } | { outcome: "stored" } | { outcome: "queued"; queue: string };

/**
 * Store, route, enqueue — nothing that waits on GitHub or reads other tables, so it answers fast.
 * A delivery counts as handled only after its job is queued: if that fails, GitHub's redelivery
 * routes it again.
 */
export async function receiveWebhook(
  { deliveries, queue }: { deliveries: DeliveryStore; queue: JobQueue },
  { deliveryId, event, payload }: IncomingWebhook,
): Promise<WebhookOutcome> {
  const installation = payload.installation as { id?: unknown } | undefined;
  const status = await deliveries.add({
    id: deliveryId,
    event,
    action: typeof payload.action === "string" ? payload.action : null,
    installationId: typeof installation?.id === "number" ? installation.id : null,
    payload,
  });
  if (status === "handled") return { outcome: "duplicate" };

  const route = routeDelivery(deliveryId, event, payload);
  if (route) await queue.send(route.queue, route.data, route.singletonKey ? { singletonKey: route.singletonKey } : {});
  await deliveries.markHandled(deliveryId);
  return route ? { outcome: "queued", queue: route.queue } : { outcome: "stored" };
}
