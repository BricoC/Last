import { spawnSync } from "child_process";
import { syncReleaseVersions } from "./release-version-files.js";

// Uso: node ./scripts/publish-update.js 0.1.1 "Descrizione novita" [--skip-checks]
const rawArgs = process.argv.slice(2);
const skipChecks = rawArgs.includes("--skip-checks");
const args = rawArgs.filter((arg) => arg !== "--skip-checks");
let version = args[0];
const notes = args.slice(1).join(" ") || "Nuovo aggiornamento Last Gestionale";

function runGit(gitArgs) {
  const result = spawnSync("git", gitArgs, { stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`git ${gitArgs[0]} terminato con codice ${result.status}`);
}

function readGit(gitArgs) {
  const result = spawnSync("git", gitArgs, { encoding: "utf8", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`git ${gitArgs[0]} terminato con codice ${result.status}`);
  return (result.stdout || "").trim();
}

function runNpm(npmArgs) {
  const npmExecPath = process.env.npm_execpath;
  const result = npmExecPath
    ? spawnSync(process.execPath, [npmExecPath, ...npmArgs], { stdio: "inherit", shell: false })
    : spawnSync("npm", npmArgs, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`npm ${npmArgs.join(" ")} terminato con codice ${result.status}`);
}

function runCargo(cargoArgs) {
  const result = spawnSync("cargo", cargoArgs, { stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`cargo ${cargoArgs.join(" ")} terminato con codice ${result.status}`);
}

if (!version) {
  console.error("\x1b[31m[ERRORE] Devi specificare la versione. Esempio:\x1b[0m");
  console.error("  npm run release 0.1.2");
  console.error('  npm run release 0.1.2 "Descrizione novita"');
  process.exit(1);
}

// Rimuove eventuale 'v' iniziale
version = version.replace(/^v/i, "").trim();

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`\x1b[31m[ERRORE] Versione '${version}' non valida. Usa il formato X.Y.Z (es. 0.1.2)\x1b[0m`);
  process.exit(1);
}

// Preflight Git: impedisce rilasci da branch errati o con modifiche locali/staged non committate
const currentBranch = readGit(["rev-parse", "--abbrev-ref", "HEAD"]);
if (currentBranch !== "main") {
  console.error(`\x1b[31m[ERRORE] Il rilascio deve partire dal branch 'main' (branch attuale: '${currentBranch}').\x1b[0m`);
  process.exit(1);
}

const dirtyStatus = readGit(["status", "--porcelain"]);
if (dirtyStatus) {
  console.error("\x1b[31m[ERRORE] Working tree o staging area non puliti. Committa o metti in stash prima del rilascio:\x1b[0m");
  console.error(dirtyStatus);
  process.exit(1);
}

const tag = `v${version}`;
const pkgJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
const currentVersion = String(pkgJson.version || "0.0.0").trim();
const compareSemver = (a, b) => {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
};
if (compareSemver(version, currentVersion) <= 0) {
  console.error(`\x1b[31m[ERRORE] La nuova versione v${version} deve essere strettamente maggiore della versione attuale v${currentVersion}.\x1b[0m`);
  process.exit(1);
}

runGit(["fetch", "origin", "main", "--tags"]);
const behindCount = Number(readGit(["rev-list", "--count", "HEAD..origin/main"]) || "0");
if (behindCount > 0) {
  console.error(`\x1b[31m[ERRORE] Il branch locale 'main' è indietro di ${behindCount} commit rispetto a 'origin/main'. Esegui git pull prima del rilascio.\x1b[0m`);
  process.exit(1);
}

try {
  const existingLocalTag = readGit(["tag", "-l", tag]);
  if (existingLocalTag === tag) {
    console.error(`\x1b[31m[ERRORE] Il tag locale ${tag} esiste già.\x1b[0m`);
    process.exit(1);
  }
  const existingRemoteTag = readGit(["ls-remote", "--tags", "origin", `refs/tags/${tag}`]);
  if (existingRemoteTag) {
    console.error(`\x1b[31m[ERRORE] Il tag remoto ${tag} esiste già su origin.\x1b[0m`);
    process.exit(1);
  }
} catch (err) {
  console.error("\x1b[31m[ERRORE] Impossibile verificare i tag remoti su origin:\x1b[0m", err.message);
  process.exit(1);
}

if (!skipChecks) {
  console.log("\x1b[36m[PREFLIGHT] Esecuzione test, build e controlli Rust prima del tag...\x1b[0m");
  runNpm(["test"]);
  runNpm(["run", "build"]);
  runNpm(["run", "check:bundle"]);
  runCargo(["fmt", "--manifest-path", "src-tauri/Cargo.toml", "--check"]);
  runCargo(["test", "--manifest-path", "src-tauri/Cargo.toml", "--locked"]);
  runCargo(["clippy", "--manifest-path", "src-tauri/Cargo.toml", "--all-targets", "--all-features", "--locked", "--", "-D", "warnings"]);
}

console.log("\x1b[36m==========================================================\x1b[0m");
console.log(`\x1b[36m  Preparazione Rilascio Last Gestionale v${version}\x1b[0m`);
console.log("\x1b[36m==========================================================\x1b[0m");

// 1. Aggiorna manifest e lockfile prima di creare il commit/tag.
const previousVersions = syncReleaseVersions(process.cwd(), version);
for (const [file, oldVersion] of Object.entries(previousVersions)) {
  console.log(`\x1b[32m[OK] Aggiornato ${file}: v${oldVersion} -> v${version}\x1b[0m`);
}

// 3. Commit e Tag Git
try {
  runGit([
    "add",
    "package.json",
    "package-lock.json",
    "src-tauri/tauri.conf.json",
    "src-tauri/Cargo.toml",
    "src-tauri/Cargo.lock",
  ]);
  runGit(["commit", "-m", `chore(release): bump version to ${tag}`]);
  runGit(["tag", "-a", tag, "-m", notes]);
  console.log(`\x1b[32m[OK] Creato tag Git: ${tag}\x1b[0m`);

  // 4. Push atomico su GitHub
  console.log("\x1b[36m[PUSH] Invio atomico di commit e tag su GitHub...\x1b[0m");
  runGit(["push", "--atomic", "origin", "main", tag]);

  console.log("\n\x1b[32m==========================================================\x1b[0m");
  console.log("\x1b[32m  Rilascio avviato con successo su GitHub!\x1b[0m");
  console.log("\x1b[32m==========================================================\x1b[0m");
  console.log("GitHub Actions ha iniziato a compilare l'aggiornamento per Windows.");
  console.log("Puoi seguire l'avanzamento qui:");
  console.log("👉 https://github.com/BricoC/Last/actions\n");
} catch (err) {
  console.error("\x1b[31m[ERRORE durante il commit/push Git]:\x1b[0m", err.message);
  process.exit(1);
}

