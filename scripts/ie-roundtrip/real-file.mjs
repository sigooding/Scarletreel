#!/usr/bin/env node
/**
 * Import the REAL shipped case file (nobodys-witness-draft.reel.json, ~48MB,
 * 86 bundled assets) through the real import path and report whether every
 * asset reference resolves at play time.
 *
 *   npm i --no-save fake-indexeddb && node scripts/ie-roundtrip/real-file.mjs
 */
import { spawnSync } from "node:child_process";
import { buildSync } from "esbuild";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "..");
const require = createRequire(path.join(root, "package.json"));
const target = process.argv[2] ?? path.join(root, "nobodys-witness-draft.reel.json");

let fakeIdbUrl;
try {
  fakeIdbUrl = pathToFileURL(require.resolve("fake-indexeddb/auto")).href;
} catch {
  console.log("SKIP — fake-indexeddb not installed. Run `npm ci` first.");
  process.exit(0);
}

const dir = mkdtempSync(path.join(tmpdir(), "scarlet-realfile-"));
try {
  const outfile = path.join(dir, "real-file.mjs");
  buildSync({
    entryPoints: [path.join(here, "real-file.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node18",
    outfile,
    logLevel: "warning",
    absWorkingDir: root,
  });
  const loader = path.join(dir, "loader.mjs");
  writeFileSync(loader, `await import(${JSON.stringify(fakeIdbUrl)});\nawait import(${JSON.stringify(outfile)});\n`);

  const res = spawnSync(process.execPath, [loader, target], { encoding: "utf8", cwd: root, maxBuffer: 64 * 1024 * 1024 });
  process.stdout.write(res.stdout ?? "");
  if (res.stderr) console.error(res.stderr.split("\n").filter((l) => !l.startsWith("    at ")).join("\n"));
  process.exitCode = res.status ?? 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
