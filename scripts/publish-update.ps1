# Script automatico per il rilascio di una nuova versione di Last
# Uso:
#   .\scripts\publish-update.ps1 -Version "0.1.1" -Notes "Correzioni DDT e miglioramenti interfaccia"

param (
    [Parameter(Mandatory = $true, HelpMessage = "Inserisci la nuova versione (es. 0.1.1)")]
    [string]$Version,

    [Parameter(Mandatory = $false)]
    [string]$Notes = "Nuovo aggiornamento Last Gestionale"
)

# Rimuovi eventuale prefisso 'v' se inserito dall'utente
$CleanVersion = $Version.TrimStart('v').Trim()

if (-not ($CleanVersion -match '^\d+\.\d+\.\d+$')) {
    Write-Host "[ERRORE] La versione deve essere nel formato numerico standard X.Y.Z (es. 0.1.1 o 1.0.0)" -ForegroundColor Red
    exit 1
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Preparazione Rilascio Last Gestionale v$CleanVersion" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Verifica stato Git
$gitStatus = git status --porcelain
if ($gitStatus) {
    Write-Host "[INFO] Trovate modifiche non salvate o non committate. Verranno incluse nel rilascio." -ForegroundColor Yellow
}

# 2. Aggiorna package.json
$pkgPath = "package.json"
$pkgJson = Get-Content $pkgPath -Raw | ConvertFrom-Json
$oldVersion = $pkgJson.version
$pkgJson.version = $CleanVersion
$pkgJson | ConvertTo-Json -Depth 10 | Set-Content $pkgPath -Encoding UTF8
Write-Host "[OK] Aggiornato package.json: v$oldVersion -> v$CleanVersion" -ForegroundColor Green

# 3. Aggiorna src-tauri/tauri.conf.json
$tauriConfPath = "src-tauri/tauri.conf.json"
$tauriJson = Get-Content $tauriConfPath -Raw | ConvertFrom-Json
$tauriJson.version = $CleanVersion
$tauriJson | ConvertTo-Json -Depth 10 | Set-Content $tauriConfPath -Encoding UTF8
Write-Host "[OK] Aggiornato tauri.conf.json: v$CleanVersion" -ForegroundColor Green

# 4. Commit e Tag Git
git add package.json src-tauri/tauri.conf.json
git commit -m "chore(release): bump version to v$CleanVersion"
$tag = "v$CleanVersion"
git tag -a $tag -m "$Notes"

Write-Host "[OK] Creato tag Git: $tag" -ForegroundColor Green

# 5. Push su GitHub
Write-Host "[PUSH] Invio commit e tag su GitHub..." -ForegroundColor Cyan
git push origin main
git push origin $tag

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Rilascio avviato con successo su GitHub!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "GitHub Actions ha iniziato a compilare l'aggiornamento per Windows."
Write-Host "Puoi seguire l'avanzamento qui:" -ForegroundColor Yellow
Write-Host "https://github.com/BricoC/Last/actions" -ForegroundColor White
Write-Host ""
Write-Host "Non appena l'azione termina (circa 3-5 minuti):"
Write-Host "- La release sara' pubblicata automaticamente"
Write-Host "- Tutti i PC/casse scaricheranno l'aggiornamento in background e mostreranno il popup di riavvio."
