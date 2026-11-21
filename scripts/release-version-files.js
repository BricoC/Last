import fs from "node:fs";
import path from "node:path";

function replaceVersionLine(content, fileLabel, version) {
  const matches = [...content.matchAll(/^(\s*version\s*=\s*")[^"]+("\s*)$/gm)];
  if (matches.length !== 1) {
    throw new Error(`Impossibile individuare un'unica versione in ${fileLabel}`);
  }
  const match = matches[0];
  const oldVersion = match[0].match(/"([^"]+)"/)?.[1];
  const updated = `${match[1]}${version}${match[2]}`;
  const next = content.slice(0, match.index) + updated + content.slice(match.index + match[0].length);
  return { content: next, oldVersion };
}

function updateTomlPackageVersion(content, fileLabel, version) {
  const sections = [...content.matchAll(/^\[package\]\s*$/gm)];
  if (sections.length !== 1) {
    throw new Error(`Impossibile individuare la sezione [package] in ${fileLabel}`);
  }
  const start = sections[0].index;
  const nextSection = content.slice(start + sections[0][0].length).search(/^\[/m);
  const end = nextSection === -1
    ? content.length
    : start + sections[0][0].length + nextSection;
  const section = content.slice(start, end);
  const updated = replaceVersionLine(section, fileLabel, version);
  return {
    content: content.slice(0, start) + updated.content + content.slice(end),
    oldVersion: updated.oldVersion,
  };
}

function updateCargoLockPackageVersion(content, packageName, fileLabel, version) {
  const starts = [...content.matchAll(/^\[\[package\]\]\s*$/gm)].map((match) => match.index);
  const blocks = starts.map((start, index) => ({
    start,
    end: starts[index + 1] ?? content.length,
  }));
  const matches = blocks.filter(({ start, end }) =>
    /^name\s*=\s*"last"\s*$/m.test(content.slice(start, end))
  );
  if (matches.length !== 1) {
    throw new Error(`Impossibile individuare il pacchetto ${packageName} in ${fileLabel}`);
  }
  const { start, end } = matches[0];
  const updated = replaceVersionLine(content.slice(start, end), fileLabel, version);
  return {
    content: content.slice(0, start) + updated.content + content.slice(end),
    oldVersion: updated.oldVersion,
  };
}

/** Synchronize the release version in every manifest and lockfile used by CI. */
export function syncReleaseVersions(projectRoot, version) {
  const files = {
    packageJson: path.join(projectRoot, "package.json"),
    packageLock: path.join(projectRoot, "package-lock.json"),
    tauriConfig: path.join(projectRoot, "src-tauri", "tauri.conf.json"),
    cargoManifest: path.join(projectRoot, "src-tauri", "Cargo.toml"),
    cargoLock: path.join(projectRoot, "src-tauri", "Cargo.lock"),
  };

  const packageJson = JSON.parse(fs.readFileSync(files.packageJson, "utf8"));
  const packageLock = JSON.parse(fs.readFileSync(files.packageLock, "utf8"));
  const tauriConfig = JSON.parse(fs.readFileSync(files.tauriConfig, "utf8"));
  const cargoManifest = fs.readFileSync(files.cargoManifest, "utf8");
  const cargoLock = fs.readFileSync(files.cargoLock, "utf8");

  if (!packageLock.packages?.[""]) {
    throw new Error("package-lock.json non contiene packages[\"\"]");
  }

  const previousVersions = {
    "package.json": packageJson.version,
    "package-lock.json": packageLock.version,
    "package-lock.json packages[\"\"]": packageLock.packages[""].version,
    "src-tauri/tauri.conf.json": tauriConfig.version,
  };

  packageJson.version = version;
  packageLock.version = version;
  packageLock.packages[""].version = version;
  tauriConfig.version = version;

  const updatedManifest = updateTomlPackageVersion(cargoManifest, "src-tauri/Cargo.toml", version);
  const updatedLock = updateCargoLockPackageVersion(cargoLock, "last", "src-tauri/Cargo.lock", version);
  previousVersions["src-tauri/Cargo.toml"] = updatedManifest.oldVersion;
  previousVersions["src-tauri/Cargo.lock (last)"] = updatedLock.oldVersion;

  // Read and validate all files before writing any, so a malformed lockfile
  // cannot leave the release manifests partially updated.
  fs.writeFileSync(files.packageJson, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
  fs.writeFileSync(files.packageLock, `${JSON.stringify(packageLock, null, 2)}\n`, "utf8");
  fs.writeFileSync(files.tauriConfig, `${JSON.stringify(tauriConfig, null, 2)}\n`, "utf8");
  fs.writeFileSync(files.cargoManifest, updatedManifest.content, "utf8");
  fs.writeFileSync(files.cargoLock, updatedLock.content, "utf8");

  return previousVersions;
}
