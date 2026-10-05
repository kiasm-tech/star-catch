import { describe, expect, it } from "vitest";
import { analyze } from "./analyze.js";
import type { AnalyzeInput } from "./schema.js";

type File = AnalyzeInput["files"][number];
/** A file whose only change is the body of every declaration in it: `1` becomes `2`. */
const changed = (path: string, source: string): File => ({ path, status: "modified", base: source.replaceAll("2", "1"), head: source });

async function entryPoints(...files: File[]) {
  return (await analyze({ files })).entryPoints.map((e) => `${e.unitId.split("#")[1]} ${e.type}`);
}

describe("entry points", () => {
  it.each<[string, File, string[]]>([
    ["a Next.js page", changed("app/billing/page.tsx", "export default function Billing() {\n  return <p>2</p>;\n}\n"), ["Billing page"]],
    ["a Pages Router page", changed("pages/about.tsx", "export default function About() {\n  return <p>2</p>;\n}\n"), ["About page"]],
    ["a Pages Router API route", changed("pages/api/orders.ts", "export default function handler() {\n  return 2;\n}\n"), ["handler apiRoute"]],
    [
      "an App Router route handler",
      changed("app/api/orders/route.ts", "export async function GET() {\n  return 2;\n}\nfunction helper() {\n  return 2;\n}\n"),
      ["GET apiRoute"],
    ],
    [
      "an Express handler",
      changed("src/server.ts", 'export function listOrders() {\n  return 2;\n}\nexport function unused() {\n  return 2;\n}\napp.get("/orders", auth, listOrders);\n'),
      ["listOrders apiRoute"],
    ],
    ["a FastAPI route", changed("api/orders.py", '@router.get("/orders")\ndef list_orders():\n    return 2\n'), ["list_orders apiRoute"]],
    ["a Flask route", changed("app.py", '@app.route("/")\n@login_required\ndef index():\n    return 2\n'), ["index apiRoute"]],
    [
      "a Spring endpoint",
      changed("src/main/java/Orders.java", 'class Orders {\n  @GetMapping("/orders")\n  public int list() { return 2; }\n  @Override public String toString() { return "2"; }\n}\n'),
      ["Orders.list apiRoute"],
    ],
    [
      "a scheduled job",
      changed("src/main/java/Sweep.java", 'class Sweep {\n  @Scheduled(cron = "0 0 * * *")\n  void run() { int a = 2; }\n}\n'),
      ["Sweep.run job"],
    ],
    ["a Celery task", changed("tasks.py", "@shared_task\ndef send():\n    return 2\n"), ["send job"]],
    ["a click command", changed("cli.py", "@click.command()\ndef main():\n    return 2\n"), ["main command"]],
    ["a script's main guard", changed("tools/sync.py", 'def run():\n    return 1\n\nif __name__ == "__main__":\n    run(2)\n'), ["sync.py command"]],
  ])("finds %s", async (_case, file, expected) => {
    expect(await entryPoints(file)).toEqual(expected);
  });

  it.each<[string, File]>([
    ["a named export from a page file", changed("app/billing/page.tsx", "export function Banner() {\n  return <p>2</p>;\n}\n")],
    ["a default export outside the router", changed("components/Card.tsx", "export default function Card() {\n  return <p>2</p>;\n}\n")],
    ["a plain decorator", changed("lib.py", "@cache\ndef total():\n    return 2\n")],
    ["a decorator-like string in a body", changed("lib.py", 'def total():\n    x = """\n@app.get("/x")\n"""\n    return 2\n')],
  ])("ignores %s", async (_case, file) => {
    expect(await entryPoints(file)).toEqual([]);
  });

  it("skips units that didn't change", async () => {
    const file: File = { path: "app/page.tsx", status: "modified", base: "export default function P() {\n    return <p/>;\n}\n", head: "export default function P() {\n  return <p/>;\n}\n" };
    expect(await entryPoints(file)).toEqual([]);
  });

  it.each<[string, File, string]>([
    ["an App Router handler", changed("app/(shop)/api/orders/route.ts", "export async function POST() {\n  return 2;\n}\n"), "POST /api/orders"],
    ["an App Router page", changed("app/billing/page.tsx", "export default function Billing() {\n  return <p>2</p>;\n}\n"), "/billing"],
    ["a Pages Router index", changed("pages/index.tsx", "export default function Home() {\n  return <p>2</p>;\n}\n"), "/"],
    ["a Pages Router API route", changed("pages/api/orders.ts", "export default function handler() {\n  return 2;\n}\n"), "/api/orders"],
    ["an Express registration", changed("src/server.ts", 'export function listOrders() {\n  return 2;\n}\napp.get("/orders", listOrders);\n'), "GET /orders"],
    ["a FastAPI decorator", changed("api/orders.py", '@router.post("/orders")\ndef create():\n    return 2\n'), "POST /orders"],
    ["a Flask route without a method", changed("app.py", '@app.route("/")\ndef index():\n    return 2\n'), "/"],
    ["a Spring mapping", changed("src/main/java/Orders.java", 'class Orders {\n  @GetMapping(path = "/orders")\n  public int list() { return 2; }\n}\n'), "GET /orders"],
  ])("records the route of %s", async (_name, file, expected) => {
    const [entry] = (await analyze({ files: [file] })).entryPoints;
    expect([entry?.route?.method, entry?.route?.path].filter((p) => p !== undefined).join(" ")).toBe(expected);
  });

  it("records no route for a job", async () => {
    const [entry] = (await analyze({ files: [changed("tasks.py", "@shared_task\ndef send():\n    return 2\n")] })).entryPoints;
    expect(entry).toEqual({ unitId: "tasks.py#send", type: "job" });
  });
});

