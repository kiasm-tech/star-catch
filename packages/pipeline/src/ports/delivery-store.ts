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

export interface DeliveryStore {
  /** False when the delivery was already stored: GitHub redelivered it. */
  add(delivery: WebhookDelivery): Promise<boolean>;
}
