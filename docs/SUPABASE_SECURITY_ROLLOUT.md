# Last · Rollout della sicurezza Supabase

Last usa Supabase Auth per identificare le postazioni cloud. Solo gli account Supabase presenti in `last_private.workstations` con `revoked_at IS NULL` possono sincronizzare le tabelle di Last. Ogni postazione autorizzata ha accesso ai dati condivisi del gestionale. I profili Last, gli hash delle password locali e i permessi dell'interfaccia restano nel database SQLite di ciascuna postazione. Le password locali sono memorizzate con PBKDF2-HMAC-SHA-256, salt casuale individuale e 600.000 iterazioni; gli hash SHA-256 delle versioni precedenti vengono sostituiti al primo accesso riuscito, senza cambiare la password dell'utente. Le sessioni e le credenziali Supabase seguono il ripristino locale descritto sotto e non vengono inserite nel profilo Last, nel file di configurazione o nei backup.

## Ripristino della sessione Supabase su Windows

Su Windows Last salva la sessione Supabase nel file `supabase.session.local.bin` nella cartella dati privata dell'app. Il contenuto serializzato (email, password se presente e refresh token) viene protetto con Windows DPAPI tramite `CryptProtectData`, senza l'opzione `CRYPTPROTECT_LOCAL_MACHINE`: può quindi essere decifrato solo nel contesto dell'account Windows che lo ha protetto. Alla riapertura Last usa `CryptUnprotectData` per ripristinare la sessione; se il file manca, è corrotto o viene copiato su un altro PC/account Windows, la sessione non è ripristinabile e occorre accedere di nuovo al Cloud. Il file non va copiato né incluso nei backup trasferibili. La protezione DPAPI descritta è implementata per Windows; sulle piattaforme non Windows il backend segnala che DPAPI non è disponibile.

La tabella cloud storica `public.app_users`, se presente, resta disponibile per l'amministratore PostgreSQL e viene esclusa dalle API client e dalla pubblicazione Realtime. Prima del passaggio, controllare utenti e privilegi locali su ogni PC. Considerare potenzialmente esposte le password i cui hash erano nel cloud e cambiarle, anche sugli altri servizi in cui fossero state riutilizzate. La gestione dei profili su più PC avviene ora su ciascuna postazione. Conservare l'eventuale archivio dei vecchi utenti solo in un backup amministrativo protetto, secondo le regole di conservazione aziendali.

## Preparazione e collaudo

1. Preparare una copia isolata del database Supabase con dati fittizi o anonimizzati e una copia coerente di SQLite per l'app desktop. Su un nuovo progetto usare **Copia SQL** in **Impostazioni → Cloud & Database**. Su un progetto già inizializzato applicare le due migrazioni in sequenza. [Scritture offline e fatture](../src/features/settings/data-import/supabaseOfflineWrites.sql) · [Accesso per postazione](../src/features/settings/data-import/supabaseStationAccess.sql)
2. Nell'istanza di collaudo abilitare Supabase Auth con email e password e disattivare registrazioni pubbliche e accessi anonimi da Auth. Creare dal pannello amministrativo un account separato per PC. Usare una password distinta dalle password Last. Condividere le credenziali della postazione tramite il canale sicuro aziendale.
3. Applicare gli script dal SQL Editor come proprietario degli oggetti. Il progetto deve avere Realtime con Authorized Broadcast, `realtime.messages` e `realtime.send`. Verificare eventuali viste, funzioni RPC, Edge Functions o schemi esposti che leggono `app_users` o accedono alle tabelle di Last per conto di utenti non autorizzati. La migrazione di sicurezza gestisce le tabelle pubbliche note a Last e i relativi canali. La migrazione delle scritture offline è richiesta per le nuove righe dei listini e per l'invio delle fatture.
4. Aggiungere in `last_private.workstations` gli UUID degli account approvati. Sostituire i due valori di esempio con l'UUID di **Authentication → Users** e il nome effettivo del PC, ripetendo l'operazione per ogni postazione.

   ```sql
   INSERT INTO last_private.workstations (user_id, label)
   VALUES ('<uuid-account-auth>', '<nome-postazione>');
   ```

5. Verificare sul progetto isolato questi esiti.

   | Identità | API sui dati Last | API su `app_users` | Realtime Last |
   | --- | --- | --- | --- |
   | Chiave pubblica sola | Lettura e scrittura negate | Negata | Accesso ai canali privati negato |
   | Account Auth fuori elenco o revocato | Letture e scritture bloccate da RLS. La RPC di verifica deve negare l'accesso | Negata | Un nuovo accesso ai canali è negato |
   | Postazione autorizzata | Letture, inserimenti, aggiornamenti ed eliminazioni previsti dai flussi esistenti | Negata | Riceve eventi privati dal database. L'invio di broadcast dai client è bloccato |

6. Provare due istanze dell'app desktop con account diversi. Accedere dal pulsante **Accedi al Cloud**, verificare i conteggi in **Cloud & Database** e provare download iniziale, sincronizzazione DDT, ordini, offerte e gli altri moduli, incluse le modifiche e le eliminazioni. Provare ad avviare l'app senza connessione, modificare una bozza, tornare online, autenticarsi e verificare che la coda si svuoti. Provare anche la scadenza del token, la riapertura del client e la revoca di una postazione. Se il progetto ospita altri client, per esempio NoMan V1, verificare e aggiornare i loro accessi e gli abbonamenti legacy prima della finestra operativa. La migrazione rimuove le tabelle gestite da Last dalla pubblicazione `supabase_realtime` e passa ai canali privati.

## Passaggio al progetto operativo

Procedere solo dopo il collaudo e l'approvazione operativa. Prima della finestra, censire postazioni, integrazioni, policy personalizzate e code locali. Preparare il nuovo client, gli account Auth e un backup verificato di cloud e postazioni. Durante la finestra, fermare le scritture dai vecchi client, applicare la migrazione SQL, registrare le postazioni autorizzate e distribuire il client aggiornato. Usare la chiave **publishable** o una JWT legacy con ruolo `anon` come chiave API pubblica in Last. Le credenziali amministrative restano negli strumenti amministrativi. Verificare una postazione pilota prima di riaprire la sincronizzazione a tutte le altre. Le vecchie versioni che usano solo la chiave pubblica perderanno l'accesso cloud quando la migrazione sarà applicata.

Per sospendere una postazione, impostare `revoked_at = now()` per il suo UUID, revocare le sessioni dell'account in Supabase Auth e disconnettere il client. Il controllo REST è applicato da RLS sulle righe e Last verifica l'autorizzazione con una RPC. Realtime può mantenere l'autorizzazione in cache per una connessione già aperta fino a rinnovo o riconnessione. Verificare l'effettiva chiusura della connessione e il rifiuto di una nuova sottoscrizione prima di considerare completata la revoca.

La migrazione SQL è transazionale. Se fallisce prima del commit, correggere il problema sulla copia di collaudo. Se emerge un problema dopo il commit, sospendere la sincronizzazione, continuare a lavorare offline e usare una correzione in avanti che mantenga la chiusura dell'accesso anonimo. Conservare i dati locali in coda e usare il backup verificato se servisse un ripristino amministrativo.

## Aggiornamento di sincronizzazione e numerazione

Per un progetto già migrato agli accessi per postazione, collaudare e applicare questi script con il proprietario dello schema prima di distribuire il client aggiornato.

1. [DDT, scritture atomiche e storico delle revisioni](../src/features/settings/data-import/supabaseDdtConsistency.sql)
2. [Numerazione dei preventivi](../src/features/settings/data-import/supabaseQuoteNumbering.sql)
3. [Revisioni dei tre flussi listini](../src/features/settings/data-import/supabasePriceListRevisions.sql)
4. [Identità fiscale delle fatture](../src/features/settings/data-import/supabaseInvoiceIdentity.sql)

Per un progetto nuovo, **Impostazioni → Cloud & Database → Copia SQL** genera lo schema completo con questi script. Le migrazioni SQLite si applicano al primo avvio. Conservare un backup verificato del progetto Supabase e dei database locali prima del passaggio.

Le migrazioni dei preventivi e delle fatture si interrompono se trovano già numeri assegnati a documenti diversi o testate duplicate con la stessa identità fiscale, numero e data. Riconciliare quei documenti con i dati aziendali prima di riprovare. I numeri già assegnati vengono preservati. In una postazione configurata per il cloud, un preventivo nuovo salvato offline riceve il numero quando Supabase può riservarlo.

Durante il passaggio sospendere le scritture dei client precedenti e aggiornare tutte le postazioni che condividono i dati. Verificare su due postazioni un articolo creato localmente, un DDT storico modificato ed eliminato durante una disconnessione, due salvataggi simultanei di preventivi e due fatture di emittenti omonimi. Sul primo download DDT il client confronta anche i documenti locali già sincronizzati del progetto con l'inventario cloud. I DDT mancanti vengono spostati nel cestino locale.
