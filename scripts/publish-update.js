import fs from "fs";
import { execSync } from "child_process";

// Uso: node ./scripts/publish-update.js 0.1.1 "Descrizione novita"
const args = process.argv.slice(2);
let version = args[0];
let notes = args[1] || "Nuovo aggiornamento Last Gestionale";

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

// 1. Aggiorna package.json (senza BOM)
const pkgPath = "package.json";
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
const oldVersion = pkg.version;
pkg.version = version;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
console.log(`\x1b[32m[OK] Aggiornato package.json: v${oldVersion} -> v${version}\x1b[0m`);

// 2. Aggiorna src-tauri/tauri.conf.json (senza BOM)
const tauriPath = "src-tauri/tauri.conf.json";
const tauriConf = JSON.parse(fs.readFileSync(tauriPath, "utf-8"));
tauriConf.version = version;
fs.writeFileSync(tauriPath, JSON.stringify(tauriConf, null, 2) + "\n", "utf-8");
console.log(`\x1b[32m[OK] Aggiornato src-tauri/tauri.conf.json: v${version}\x1b[0m`);

// 3. Commit e Tag Git
const tag = `v${version}`;
try {
  execSync("git add package.json src-tauri/tauri.conf.json", { stdio: "inherit" });
  execSync(`git commit -m "chore(release): bump version to ${tag}"`, { stdio: "inherit" });
  execSync(`git tag -a ${tag} -m "${notes}"`, { stdio: "inherit" });
  console.log(`\x1b[32m[OK] Creato tag Git: ${tag}\x1b[0m`);

  // 4. Push su GitHub
  console.log("\x1b[36m[PUSH] Invio commit e tag su GitHub...\x1b[0m");
  execSync("git push origin main", { stdio: "inherit" });
  execSync(`git push origin ${tag}`, { stdio: "inherit" });

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
