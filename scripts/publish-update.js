import { spawnSync } from "child_process";
import { syncReleaseVersions } from "./release-version-files.js";

// Uso: node ./scripts/publish-update.js 0.1.1 "Descrizione novita"
const args = process.argv.slice(2);
let version = args[0];
const notes = args.slice(1).join(" ") || "Nuovo aggiornamento Last Gestionale";

function runGit(args) {
  const result = spawnSync("git", args, { stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`git ${args[0]} terminato con codice ${result.status}`);
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

