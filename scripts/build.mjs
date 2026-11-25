// Build the app into one self-contained dist/index.html.
// Claude artifacts load scripts only inline or from a few CDNs, so the bundle is inlined.
//
// Usage: node scripts/build.mjs

import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "src");

const result = await build({
  entryPoints: [path.join(src, "main.js")],
  bundle: true,
  format: "iife",
  target: ["es2022"],
  minify: true,
  legalComments: "none",
  write: false,
  define: { "process.env.NODE_ENV": '"production"' },
});
// Keep the inline script from closing early.
const js = result.outputFiles[0].text
  .replace(/<\/script/gi, "<\\/script")
  .replace(/<!--/g, "<\\!--");
const css =
  (await readFile(path.join(src, "shared/theme.css"), "utf8")) +
  "\n" +
  (await readFile(path.join(src, "app.css"), "utf8"));
const html = (await readFile(path.join(src, "index.html"), "utf8"))
  .replace("/*__CSS__*/", () => css)
  .replace("/*__JS__*/", () => js);
await mkdir(path.join(root, "dist"), { recursive: true });
await writeFile(path.join(root, "dist/index.html"), html);
console.log(`dist/index.html  ${(html.length / 1024).toFixed(0)} KB`);
