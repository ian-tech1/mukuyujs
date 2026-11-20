export function reportLink(base: string, code: string, origin = "") {
  const root = base.trim() || origin.trim();
  const normalizedCode = code.trim();
  if (!root) return `/?c=${encodeURIComponent(normalizedCode)}`;
  try {
    const target = new URL(root);
    target.pathname = "/";
    target.search = "";
    target.hash = "";
    target.searchParams.set("c", normalizedCode);
    return target.toString();
  } catch {
    return `${root.replace(/\/+$/, "")}/?c=${encodeURIComponent(normalizedCode)}`;
  }
}
