/** A webhook delivery as GitHub sent it. */
export interface WebhookDelivery {
  /** X-GitHub-Delivery */
  id: string;
  /** X-GitHub-Event */
  event: string;
  action: string | null;
  installationId: number | null;
  payload: unknown;
}

/** new: first time; pending: stored before but never handled (that attempt failed); handled. */
export type DeliveryStatus = "new" | "pending" | "handled";

export interface DeliveryStore {
  /** Stores the delivery unless GitHub sent it before; a redelivery's payload is not kept. */
  add(delivery: WebhookDelivery): Promise<DeliveryStatus>;
  markHandled(id: string): Promise<void>;
}
