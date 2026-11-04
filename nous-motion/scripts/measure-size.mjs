// Mede o gzip REAL do que cada entrada carrega (JS + chunks compartilhados estáticos + CSS único).
// Não é garantia: é a medição do build atual.
import { readFileSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const dist = new URL("../dist/", import.meta.url).pathname;
const BUDGET = 30 * 1024;
const gz = (f) => gzipSync(readFileSync(join(dist, f)), { level: 9 }).length;

function staticDeps(file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  const src = readFileSync(join(dist, file), "utf8");
  for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)[^"';]*?from\s*["'](\.\/[^"']+)["']|(?:^|\n)\s*import\s*["'](\.\/[^"']+)["']/g)) {
    staticDeps((m[1] ?? m[2]).replace("./", ""), seen);
  }
  return seen;
}

const css = existsSync(join(dist, "style.css")) ? gz("style.css") : 0;
const rows = [];
for (const entry of ["index", "loader", "button", "transition", "editor"]) {
  const files = [...staticDeps(`${entry}.js`)];
  const js = files.reduce((n, f) => n + gz(f), 0);
  rows.push({ entry, files: files.length, jsGz: js, cssGz: css });
}
const kb = (n) => (n / 1024).toFixed(2) + " KB";
console.log("entrada      arquivos  JS gzip      CSS gzip (único, compartilhado)");
for (const r of rows) console.log(`${r.entry.padEnd(12)} ${String(r.files).padEnd(9)} ${kb(r.jsGz).padEnd(12)} ${kb(r.cssGz)}`);
const core = rows.find((r) => r.entry === "index");
const withEditorFree = core.jsGz + css;
console.log(`\nNúcleo (index, sem editor) + CSS: ${kb(withEditorFree)} — orçamento ${kb(BUDGET)}: ${withEditorFree <= BUDGET ? "DENTRO" : "ACIMA"}`);
console.log("Obs.: medição deste build; não é garantia para versões futuras.");
