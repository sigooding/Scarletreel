import path from "path";
import { fileURLToPath } from "url";
import fs from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const buildId = process.env.SCARLET_REEL_BUILD_ID ?? process.env.VITE_BUILD_ID ?? new Date().toISOString();

/**
 * Exposes EVERY image shipped under public/img to the app as a stable list of
 * { url, label } — the source for the Studio image browser. Scanning the
 * directory (instead of hardcoding) means new art dropped into /img is
 * automatically available to pick, and the stored value stays the stable
 * public path (/img/…) so saves never break on a rebuild.
 *
 * Runs in Node during both `vite dev` and `vite build`, so the list is baked
 * into the bundle for the single-file build too.
 */
function builtinImagesPlugin() {
  const virtualId = "virtual:builtin-images";
  const resolvedId = "\0" + virtualId;
  // Roots scanned for the Studio image browser, each mapped to the public URL
  // prefix it's served under. /img is the scene library; /assets holds shipped
  // sprites such as the character keyframe animations under /assets/animations
  // — the Foreground image and keyframe pickers need those available too.
  const roots = [
    { dir: path.resolve(__dirname, "public/img"), prefix: "/img" },
    { dir: path.resolve(__dirname, "public/assets"), prefix: "/assets" },
  ];
  const exts = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"];

  const labelFor = (rel: string) => {
    const base = rel.replace(/\.[^.]+$/, "");
    const last = base.split("/").pop() ?? base;
    // Strip common pulp prefixes so "bg-office" -> "Office", "ch-lena" ->
    // "Lena", "cover-velvet-alibi" -> "Velvet Alibi". Folders (nw2, etc.)
    // are folded into the path so duplicate names stay disambiguated.
    const stripped = last.replace(/^(bg-|wolf-|cover-|fg-|ch-)/, "");
    const nice = stripped.replace(/[-_]+/g, " ").trim();
    const titled = nice.replace(/\b\w/g, (c) => c.toUpperCase());
    const folder = base.slice(0, Math.max(0, base.length - last.length - 1));
    return folder ? `${titled} (${folder})` : titled;
  };

  const scan = () => {
    const out: { url: string; label: string }[] = [];
    for (const { dir, prefix } of roots) {
      if (!fs.existsSync(dir)) continue;
      const walk = (d: string, rel: string) => {
        let entries: fs.Dirent[];
        try {
          entries = fs.readdirSync(d, { withFileTypes: true });
        } catch {
          return;
        }
        for (const entry of entries) {
          const relPath = rel ? `${rel}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            walk(path.join(d, entry.name), relPath);
          } else {
            const ext = entry.name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
            if (exts.includes(ext)) out.push({ url: `${prefix}/${relPath}`, label: labelFor(relPath) });
          }
        }
      };
      walk(dir, "");
    }
    out.sort((a, b) => a.label.localeCompare(b.label));
    return out;
  };

  return {
    name: "builtin-images",
    resolveId(id: string) {
      if (id === virtualId) return resolvedId;
    },
    load(id: string) {
      if (id !== resolvedId) return null;
      return `export default ${JSON.stringify(scan())};`;
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __SCARLET_REEL_BUILD_ID__: JSON.stringify(buildId),
  },
  // vite-plugin-singlefile pins base to "./" so the built page works from any
  // directory — including a GitHub Pages project site at /<repo>/. Story media
  // (plain strings in the data files, which the bundler never sees) is
  // rewritten against that base at runtime by src/assetPath.ts.
  plugins: [react(), tailwindcss(), viteSingleFile(), builtinImagesPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    // Bind all interfaces so the Arena live-preview proxy (outside the
    // sandbox) can reach the server; localhost-only isn't previewable.
    host: "0.0.0.0",
    // Accept the Arena live-preview host (e.g. <port>-<sandboxId>.e2b.app)
    // instead of rejecting it with a 403.
    allowedHosts: true,
  },
  preview: {
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
