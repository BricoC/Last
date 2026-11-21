import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

export const INITIAL_BUNDLE_BUDGET = {
  rawBytes: 350 * 1024,
  gzipBytes: 100 * 1024,
};

export function inspectInitialBundle(distDirectory, budget = INITIAL_BUNDLE_BUDGET) {
  const resolvedDist = path.resolve(distDirectory);
  const htmlPath = path.join(resolvedDist, "index.html");
  const html = fs.readFileSync(htmlPath, "utf8");
  const entryUrl = html.match(/<script\b[^>]*\bsrc="([^"]+\.js)(?:\?[^\"]*)?"[^>]*>/)?.[1];
  if (!entryUrl) throw new Error("Non è stato trovato lo script JavaScript principale in dist/index.html");

  const relativeEntryPath = decodeURIComponent(entryUrl.split("?")[0]).replace(/^\/+/, "");
  const entryPath = path.resolve(resolvedDist, relativeEntryPath);
  if (!entryPath.startsWith(`${resolvedDist}${path.sep}`)) {
    throw new Error("Il percorso del bundle principale esce dalla cartella dist");
  }

  const contents = fs.readFileSync(entryPath);
  const result = {
    entryPath,
    rawBytes: contents.byteLength,
    gzipBytes: gzipSync(contents).byteLength,
    budget,
  };
  if (result.rawBytes > budget.rawBytes || result.gzipBytes > budget.gzipBytes) {
    throw new Error(
      `Bundle iniziale oltre budget: ${(result.rawBytes / 1024).toFixed(1)} KB ` +
      `raw, ${(result.gzipBytes / 1024).toFixed(1)} KB gzip; ` +
      `limiti ${(budget.rawBytes / 1024).toFixed(0)} KB raw e ${(budget.gzipBytes / 1024).toFixed(0)} KB gzip.`
    );
  }
  return result;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const result = inspectInitialBundle(path.resolve("dist"));
    console.log(
      `Bundle iniziale OK: ${path.basename(result.entryPath)} — ` +
      `${(result.rawBytes / 1024).toFixed(1)} KB raw, ${(result.gzipBytes / 1024).toFixed(1)} KB gzip.`
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
