/** How a queue retries and deduplicates; applied when the queue is created. */
export interface QueueSpec {
  name: string;
  /** Attempts after the first, with exponential backoff. */
  retryLimit: number;
  /** At most one waiting and one running job per singletonKey. */
  deduplicate: boolean;
}

export interface JobQueue {
  /** False when the queue already holds a job with the same singletonKey. */
  send(queue: string, data: object, options?: { singletonKey?: string }): Promise<boolean>;
  /**
   * Hands each job that is due to `handle`, one at a time, until none is left; returns how many
   * ran. A throw fails the job and the queue retries it later. Data arrives unvalidated.
   */
  drain(queue: string, handle: (data: unknown) => Promise<void>): Promise<number>;
}
