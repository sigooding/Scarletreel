#!/usr/bin/env node
/**
 * Local setup check.
 *
 * Answers "am I missing something locally?" without guesswork: verifies the
 * Node version, that dependencies are installed and match the lockfile, and
 * that every image/audio file the stories reference actually exists on disk.
 *
 *   node scripts/check-setup.mjs
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

let failures = 0;
const fail = (msg, fix) => {
  failures += 1;
  console.log(`${red("✖")} ${msg}`);
  if (fix) console.log(`  ${dim("fix:")} ${fix}`);
};
const ok = (msg) => console.log(`${green("✔")} ${msg}`);
const warn = (msg) => console.log(`${yellow("!")} ${msg}`);

console.log("\nScarlet Reel — local setup check\n");

/* ---- 1. node version ---- */
const need = 22;
const major = Number(process.versions.node.split(".")[0]);
const minor = Number(process.versions.node.split(".")[1]);
if (major > need || (major === need && minor >= 12) || (major === 20 && minor >= 19)) {
  ok(`Node ${process.versions.node}`);
} else {
  fail(
    `Node ${process.versions.node} is too old — Vite 7 needs ^20.19.0 or >=22.12.0`,
    "install a current Node LTS"
  );
}

/* ---- 2. dependencies installed ---- */
if (!fs.existsSync(path.join(root, "node_modules"))) {
  fail("node_modules is missing", "npm ci");
} else {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const missing = Object.keys(pkg.dependencies ?? {}).filter(
    (d) => !fs.existsSync(path.join(root, "node_modules", d))
  );
  if (missing.length) fail(`missing packages: ${missing.join(", ")}`, "npm ci");
  else ok(`dependencies installed (${Object.keys(pkg.dependencies).length} runtime)`);
}

/* ---- 3. checkout freshness ---- */
try {
  const localHead = execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim();
  const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: root }).toString().trim();
  ok(`on ${branch} at ${localHead}`);
  try {
    const remote = execSync(`git ls-remote origin ${branch}`, { cwd: root, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .split(/\s+/)[0]
      ?.slice(0, 7);
    if (remote && !localHead.startsWith(remote) && !remote.startsWith(localHead)) {
      warn(`remote ${branch} is at ${remote} — your checkout is behind`);
      console.log(`  ${dim("fix:")} git pull`);
    }
  } catch {
    /* offline is fine */
  }
} catch {
  warn("not a git checkout");
}

/* ---- 4. every referenced asset exists ---- */
const dataDir = path.join(root, "src", "data");
const files = fs.existsSync(dataDir) ? fs.readdirSync(dataDir).filter((f) => f.endsWith(".ts")) : [];
const referenced = new Map(); // asset -> story file

for (const f of files) {
  const text = fs.readFileSync(path.join(dataDir, f), "utf8");
  for (const m of text.matchAll(/["'](\/[^"'\s]+\.(?:jpg|jpeg|png|webp|gif|mp3|wav|ogg|mp4|webm))["']/g)) {
    if (!referenced.has(m[1])) referenced.set(m[1], f);
  }
}

// Only the stories actually in the catalogue matter.
const catalogue = fs.existsSync(path.join(dataDir, "stories.ts"))
  ? fs.readFileSync(path.join(dataDir, "stories.ts"), "utf8")
  : "";
const shipped = new Set(
  [...catalogue.matchAll(/from\s+["']\.\/([A-Za-z0-9_]+)["']/g)].map((m) => `${m[1]}.ts`)
);

const missingAssets = [];
const missingRetired = [];
for (const [asset, from] of referenced) {
  const onDisk = fs.existsSync(path.join(root, "public", asset.replace(/^\//, "")));
  if (onDisk) continue;
  (shipped.has(from) ? missingAssets : missingRetired).push(`${asset} ${dim(`(${from})`)}`);
}

if (missingAssets.length) {
  fail(`${missingAssets.length} asset(s) referenced by a PLAYABLE story are missing:`, "git pull");
  for (const a of missingAssets.slice(0, 12)) console.log(`    ${a}`);
} else {
  ok(`all ${referenced.size - missingRetired.length} playable-story assets present`);
}
if (missingRetired.length) {
  console.log(dim(`  (${missingRetired.length} missing asset(s) belong to retired stories — harmless)`));
}

console.log(
  failures
    ? `\n${red(`${failures} problem(s) found.`)}\n`
    : `\n${green("Everything checks out.")} If the game still looks wrong, the cause is stored browser data — open /diagnose.html and press "Fix it".\n`
);
process.exit(failures ? 1 : 0);
