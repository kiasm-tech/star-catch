import { serve } from "@hono/node-server";
import { compose, jsonLog } from "./compose.js";

const intake = await compose(process.env);
const port = Number(process.env.PORT ?? 8080);
const server = serve({ fetch: intake.app.fetch, port }, () => jsonLog({ listening: port }));

// Container Apps sends SIGTERM before scaling an instance in: finish open requests first.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    server.close(async () => {
      await intake.stop();
      process.exit(0);
    });
  });
}
