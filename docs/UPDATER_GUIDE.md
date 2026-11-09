# Guida Aggiornamenti Automatici & Chiavi di Sicurezza (Last)

Questo documento riassume il funzionamento del sistema di aggiornamento automatico (in stile Windows Update) integrato nell'applicazione desktop **Last**.

---

## 1. Come funziona l'Aggiornamento

### Controllo Silenzioso in Background
- All'avvio dell'applicazione o a intervalli regolari, Last interroga silenziosamente l'endpoint di release su GitHub:
  `https://github.com/BricoC/Last/releases/latest/download/latest.json`
- Il controllo è asincrono: non causa alcun rallentamento all'avvio né blocca le operazioni dell'utente.

### Download in Background
- Se viene rilevata una versione più recente rispetto a quella installata, il programma inizia a scaricare il pacchetto di aggiornamento in background.
- L'operatore può continuare a fare DDT, ordini o consultare listini senza alcuna interruzione.

### Notifica Discreta nella Dashboard
- Appena il pacchetto è stato scaricato e validato crittograficamente, compare un popup discreto nella Dashboard:
  - **"Riavvia e Aggiorna ora"**: chiude l'app e la riapre in 3 secondi con la nuova versione applicata.
  - **"Più tardi"**: l'aggiornamento rimane pronto in locale e verrà applicato automaticamente alla successiva apertura del programma.

### Sicurezza Dati e Database al 100%
- L'updater sostituisce **solamente** i file del programma (l'eseguibile e gli asset).
- Il database SQLite principale (`LastData.db`), la cartella dei backup, le impostazioni aziendali e le sessioni utente **non vengono mai toccati né sovrascritti**.

### Differenza tra `git push` e Release
- I comandi `git add`, `git commit` e `git push` salvano solo la cronologia del codice su GitHub.
- **Nessun PC si aggiorna con un semplice push**. L'aggiornamento viene distribuito ai computer dei punti vendita solo ed esclusivamente quando viene creata una **Release ufficiale** (es. `v1.0.1`).

---

## 2. Come funzionano le Chiavi e Dove si trovano

Tauri 2 utilizza una coppia di chiavi crittografiche asimmetriche (Minisign Ed25519) per garantire l'autenticità degli aggiornamenti ed evitare file manomessi:

### A. Chiave Pubblica (nel programma)
- È inserita direttamente nel file di configurazione dell'app in [`src-tauri/tauri.conf.json`](../src-tauri/tauri.conf.json):
  ```json
  "plugins": {
    "updater": {
      "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEY2OUREOEQzNTFDMUZEOTIKUldTUy9jRlIwOWlkOW1VMnB1RFYwRXV6YWhKU24xTUl1ZGR0d1E1aUpMY2ttbDN3a1dHUVZJQlAK",
      "endpoints": [
        "https://github.com/BricoC/Last/releases/latest/download/latest.json"
      ]
    }
  }
  ```
- Tutti i PC client usano questa chiave pubblica per verificare che l'aggiornamento sia firmato digitalmente da te.

### B. Chiave Privata (sul tuo PC master)
- È il "timbro segreto" indispensabile per firmare i pacchetti prima della pubblicazione.
- **Percorso file sul tuo PC**:
  `C:\Users\Brico Class\.tauri\last_updater.key`
- **File della chiave pubblica locale**:
  `C:\Users\Brico Class\.tauri\last_updater.key.pub`

> [!CAUTION]
> **Non condividere mai la chiave privata e non caricarla sul repository pubblico.**
> Se utilizzi GitHub Actions per compilare e rilasciare automaticamente dal cloud, il contenuto di `last_updater.key` andrà inserito nei *Repository Secrets* di GitHub sotto la variabile `TAURI_SIGNING_PRIVATE_KEY`.

---

## 3. Come Inviare e Pubblicare un Aggiornamento (Passo 4)

La distribuzione degli aggiornamenti è automatizzata al 100% tramite GitHub Actions e lo script di rilascio.

### Configurazione Una Tantum (Solo la prima volta su GitHub)
1. Apri la repository del tuo progetto su GitHub: `https://github.com/BricoC/Last`
2. Vai su **Settings** &rarr; **Secrets and variables** &rarr; **Actions**.
3. Clicca su **New repository secret**.
4. Nome: `SHAK_SIGNING_PRIVATE_KEY` (oppure `TAURI_SIGNING_PRIVATE_KEY`)
5. Valore: copia e incolla l'intero testo contenuto nel file della tua chiave privata:
   `D:\BricoClassFiles\OneDrive\Last\File vari\1. Chiavi Firma Updater\last_updater.key`
   *(oppure da `C:\Users\Brico Class\.tauri\last_updater.key`)*
6. Clicca su **Add secret**. Fatto!

### Procedura per Rilasciare un Nuovo Aggiornamento a Tutti i PC
Quando hai finito le tue modifiche e vuoi inviare l'aggiornamento ai negozi:

1. Apri il terminale nella cartella del progetto e lancia semplicemente:
   ```bash
   npm run release 0.1.2 "Descrizione delle novita"
   ```
2. Lo script farà tutto in automatico:
   - Aggiorna la versione nei file di configurazione
   - Crea il commit e il tag Git (es. `v0.1.1`)
   - Spinge le modifiche su GitHub
   - GitHub Actions compilerà l'applicazione, firmerà i file con la chiave privata e pubblicherà la Release con il file `latest.json`.
3. Entro pochi minuti, tutti i computer dei punti vendita rileveranno l'aggiornamento, lo scaricheranno in background e mostreranno il popup per riavviare!


