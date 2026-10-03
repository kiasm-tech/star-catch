// Copies the tree-sitter grammars (.wasm) and their tags queries out of the devDependencies into
// grammars/, which is gitignored. Runs as postinstall, with Node's type stripping: erasable syntax only.
import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const GRAMMARS = [
  { pkg: "tree-sitter-typescript", wasm: ["tree-sitter-typescript.wasm", "tree-sitter-tsx.wasm"], tags: "typescript" },
  { pkg: "tree-sitter-javascript", wasm: ["tree-sitter-javascript.wasm"], tags: "javascript" },
  { pkg: "tree-sitter-python", wasm: ["tree-sitter-python.wasm"], tags: "python" },
  { pkg: "tree-sitter-java", wasm: ["tree-sitter-java.wasm"], tags: "java" },
];

export const GRAMMARS_DIR = fileURLToPath(new URL("../grammars/", import.meta.url));

export type Vendored = { copied: string[] } | { missing: string[] };

/** Skips when a package is absent: a production install has no devDependencies. */
export async function vendorGrammars(
  outDir: string = GRAMMARS_DIR,
  resolve: (id: string) => string = createRequire(import.meta.url).resolve,
): Promise<Vendored> {
  const roots = new Map<string, string>();
  const missing: string[] = [];
  for (const { pkg } of GRAMMARS) {
    try {
      roots.set(pkg, path.dirname(resolve(`${pkg}/package.json`)));
    } catch {
      missing.push(pkg);
    }
  }
  if (missing.length > 0) return { missing };

  await mkdir(outDir, { recursive: true });
  const copied: string[] = [];
  for (const { pkg, wasm, tags } of GRAMMARS) {
    const root = roots.get(pkg)!;
    for (const file of wasm) {
      await copyFile(path.join(root, file), path.join(outDir, file));
      copied.push(file);
    }
    await copyFile(path.join(root, "queries", "tags.scm"), path.join(outDir, `${tags}.tags.scm`));
    copied.push(`${tags}.tags.scm`);
  }
  return { copied };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await vendorGrammars();
  console.log(
    "copied" in result
      ? `vendor-grammars: ${result.copied.length} files in grammars/`
      : `vendor-grammars: skipped, not installed: ${result.missing.join(", ")}`,
  );
}
