import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { syncReleaseVersions } from "./release-version-files.js";

const temporaryRoots = [];

function createReleaseFixture(cargoLock = `# lockfile\n\n[[package]]\nname = "last"\nversion = "0.3.3"\ndependencies = []\n`) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "last-release-version-"));
  temporaryRoots.push(root);
  fs.mkdirSync(path.join(root, "src-tauri"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "last", version: "0.3.3" }));
  fs.writeFileSync(
    path.join(root, "package-lock.json"),
    JSON.stringify({
      name: "last",
      version: "0.3.3",
      lockfileVersion: 3,
      packages: { "": { name: "last", version: "0.3.3" } },
    })
  );
  fs.writeFileSync(path.join(root, "src-tauri", "tauri.conf.json"), JSON.stringify({ version: "0.3.3" }));
  fs.writeFileSync(
    path.join(root, "src-tauri", "Cargo.toml"),
    '[package]\nname = "last"\nversion = "0.3.3"\nedition = "2021"\n\n[dependencies]\nserde = "1"\n'
  );
  fs.writeFileSync(path.join(root, "src-tauri", "Cargo.lock"), cargoLock);
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    const resolvedRoot = path.resolve(root);
    const resolvedTemp = path.resolve(os.tmpdir());
    if (resolvedRoot.startsWith(`${resolvedTemp}${path.sep}`)) {
      fs.rmSync(resolvedRoot, { recursive: true, force: true });
    }
  }
});

describe("syncReleaseVersions", () => {
  it("updates every manifest and lockfile without changing unrelated fields", () => {
    const root = createReleaseFixture();
    const previous = syncReleaseVersions(root, "0.3.4");

    expect(Object.values(previous)).toEqual(Array(6).fill("0.3.3"));
    expect(JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version).toBe("0.3.4");
    const packageLock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
    expect(packageLock.version).toBe("0.3.4");
    expect(packageLock.packages[""].version).toBe("0.3.4");
    expect(JSON.parse(fs.readFileSync(path.join(root, "src-tauri", "tauri.conf.json"), "utf8")).version).toBe("0.3.4");
    expect(fs.readFileSync(path.join(root, "src-tauri", "Cargo.toml"), "utf8")).toContain('version = "0.3.4"');
    expect(fs.readFileSync(path.join(root, "src-tauri", "Cargo.lock"), "utf8")).toContain('version = "0.3.4"');
    expect(fs.readFileSync(path.join(root, "src-tauri", "Cargo.toml"), "utf8")).toContain('serde = "1"');
  });

  it("fails before writing manifests if the Cargo lockfile lacks the app package", () => {
    const root = createReleaseFixture("# lockfile without the app package\n");

    expect(() => syncReleaseVersions(root, "0.3.4")).toThrow(/pacchetto last/);
    expect(JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version).toBe("0.3.3");
  });
});
