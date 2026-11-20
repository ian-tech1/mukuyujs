#!/usr/bin/env node
/**
 * Nitro bundles @electric-sql/pglite into one file and drops the sibling
 * pglite.data / wasm blobs that the module loads via import.meta.url.
 * Copy them next to every bundled electric-sql__pglite.mjs so the PGLite
 * fallback can boot in `vite preview` (no DATABASE_URL).
 */
import { copyFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = ["pglite.data", "pglite.wasm", "initdb.wasm"];
const DIST = join(ROOT, "node_modules/@electric-sql/pglite/dist");

function findBundles(dir, hits) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) findBundles(path, hits);
    else if (entry.name === "electric-sql__pglite.mjs") hits.push(path);
  }
}

export function copyPgliteAssets(root = ROOT) {
  const out = join(root, ".vercel/output");
  const dist = join(root, "node_modules/@electric-sql/pglite/dist");
  const bundles = [];
  findBundles(out, bundles);
  let copied = 0;
  for (const bundle of bundles) {
    const dir = dirname(bundle);
    for (const name of ASSETS) {
      const src = join(dist, name);
      const dest = join(dir, name);
      if (!existsSync(src)) continue;
      let same = false;
      try {
        same = statSync(src).size === statSync(dest).size;
      } catch {
        same = false;
      }
      if (same) continue;
      copyFileSync(src, dest);
      copied += 1;
    }
  }
  return { bundles: bundles.length, copied };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  if (!existsSync(DIST)) {
    console.error("[pglite] package dist is missing — skip");
    process.exit(0);
  }
  const { bundles, copied } = copyPgliteAssets();
  console.log(`[pglite] ${bundles} bundle(s), copied ${copied} asset(s)`);
}
