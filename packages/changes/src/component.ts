/** The default component map: a file's top-level folder; files at the root share "(root)". */
export function defaultComponentOf(path: string): string {
  const slash = path.indexOf("/");
  return slash > 0 ? path.slice(0, slash) : "(root)";
}
