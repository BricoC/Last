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
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npmCmd, npmArgs, { stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`npm ${npmArgs.join(" ")} terminato con codice ${result.status}`);
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

if (!skipChecks) {
  console.log("\x1b[36m[PREFLIGHT] Esecuzione test e build prima del tag...\x1b[0m");
  runNpm(["test"]);
  runNpm(["run", "build"]);
  runNpm(["run", "check:bundle"]);
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
const tag = `v${version}`;
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

  // 4. Push su GitHub
  console.log("\x1b[36m[PUSH] Invio commit e tag su GitHub...\x1b[0m");
  runGit(["push", "origin", "main"]);
  runGit(["push", "origin", tag]);

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

