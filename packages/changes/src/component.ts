/** Folders that hold code rather than name a part of the product. */
const ROOTS = new Set(["src", "lib", "app", "source", "sources"]);
const WORKSPACES = new Set(["packages", "apps", "services", "modules"]);
const JVM = /^src\/(main|test)\/(java|kotlin|scala)\//;
const DOMAIN_TOP = new Set(["com", "org", "net", "io", "dev", "de", "it", "fr", "uk", "nl", "ch", "eu", "co"]);

/**
 * A file's component: the first folder below the code root (`src/pricing/x.ts` → `pricing`), the
 * package in a workspace (`packages/core/…` → `core`), the file's own name when it sits directly in
 * a root (`src/persist.ts` → `persist`), and "(root)" at the top of the repository.
 */
export function defaultComponentOf(path: string): string {
  const jvm = JVM.test(path);
  const parts = path.replace(JVM, "").split("/");
  const file = parts.pop()!;
  if (!path.includes("/")) return "(root)";
  if (WORKSPACES.has(parts[0]!) && parts.length >= 2) return parts[1]!;
  if (jvm && DOMAIN_TOP.has(parts[0]!)) parts.splice(0, 2);
  while (parts.length > 0 && ROOTS.has(parts[0]!)) parts.shift();
  return parts[0] ?? stem(file);
}

const stem = (file: string) => file.replace(/\..*$/, "");
