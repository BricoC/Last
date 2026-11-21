import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inspectInitialBundle } from "./check-initial-bundle.js";

const temporaryDirectories = [];

function createDist(entryName, contents) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "last-bundle-check-"));
  temporaryDirectories.push(root);
  const dist = path.join(root, "dist");
  fs.mkdirSync(path.join(dist, "assets"), { recursive: true });
  fs.writeFileSync(path.join(dist, "index.html"), `<script type="module" src="/assets/${entryName}"></script>`);
  fs.writeFileSync(path.join(dist, "assets", entryName), contents);
  return dist;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("inspectInitialBundle", () => {
  it("misura il JS entry e la sua dimensione gzip entro budget", () => {
    const result = inspectInitialBundle(createDist("index-test.js", "console.log('ok')"), {
      rawBytes: 100,
      gzipBytes: 100,
    });

    expect(result.rawBytes).toBeGreaterThan(0);
    expect(result.gzipBytes).toBeGreaterThan(0);
  });

  it("fallisce se il bundle supera il budget", () => {
    const dist = createDist("index-large.js", "x".repeat(256));
    expect(() => inspectInitialBundle(dist, { rawBytes: 100, gzipBytes: 100 })).toThrow("oltre budget");
  });

  it("rifiuta un percorso di entry che esce da dist", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "last-bundle-check-"));
    temporaryDirectories.push(root);
    const dist = path.join(root, "dist");
    fs.mkdirSync(dist);
    fs.writeFileSync(path.join(dist, "index.html"), '<script type="module" src="/../outside.js"></script>');

    expect(() => inspectInitialBundle(dist)).toThrow("esce dalla cartella dist");
  });
});
