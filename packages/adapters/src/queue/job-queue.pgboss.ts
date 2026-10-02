import { PgBoss } from "pg-boss";
import type { JobQueue, QueueSpec } from "@star-catch/pipeline";

/** The core's queues on pg-boss, in its own `pgboss` schema (shared with Crux). */
export class PgBossJobQueue implements JobQueue {
  private constructor(private readonly boss: PgBoss) {}

  /** Starts pg-boss, which creates or migrates its schema, and creates the queues. */
  static async start(url: string, queues: readonly QueueSpec[]): Promise<PgBossJobQueue> {
    const boss = new PgBoss({ connectionString: url, schedule: false });
    // Without a listener an error event would crash the process.
    boss.on("error", (error) => console.error("pg-boss:", error));
    await boss.start();
    for (const spec of queues) {
      await boss.createQueue(spec.name, {
        retryLimit: spec.retryLimit,
        retryBackoff: true,
        policy: spec.deduplicate ? "stately" : "standard",
      });
    }
    return new PgBossJobQueue(boss);
  }

  async send(queue: string, data: object, options: { singletonKey?: string } = {}): Promise<boolean> {
    return (await this.boss.send(queue, data, options)) !== null;
  }

  async drain(queue: string, handle: (data: unknown) => Promise<void>): Promise<number> {
    let ran = 0;
    for (;;) {
      const [job] = await this.boss.fetch<object>(queue, { batchSize: 1 });
      if (!job) return ran;
      ran++;
      try {
        await handle(job.data);
        await this.boss.complete(queue, job.id);
      } catch (error) {
        await this.boss.fail(queue, job.id, { message: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  stop(): Promise<void> {
    return this.boss.stop();
  }
}
