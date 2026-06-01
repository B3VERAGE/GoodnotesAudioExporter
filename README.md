****Goodnotes Audio Exporter****

GoodNotes Audio Exporter è uno strumento leggero, veloce e focalizzato sulla privacy per estrarre in modo organizzato tutte le registrazioni audio presenti nei tuoi taccuini di GoodNotes (esportati in formato originale .goodnotes o .zip).

Se utilizzi GoodNotes su iPad, iPhone o Mac per registrare lezioni universitarie, riunioni o appunti vocali e hai la necessità di archiviare, condividere o ascoltare le tracce separatamente dall'applicazione senza doverle esportare manualmente una per una, questo tool fa esattamente al caso tuo.

Disponibile sia come interfaccia web interattiva (PWA) che come script Python (CLI) locale.

🌟 Caratteristiche Principali

• Estrazione Intelligente dei Metadati: Associa i file audio reali ai rispettivi nomi personalizzati e alle date di registrazione inserite nell'app GoodNotes.

• Doppia Interfaccia:

	• Progressive Web App (PWA): Interfaccia grafica drag-and-drop drag-and-play che funziona 100% offline e si installa sul tuo dispositivo.

	• Script Python (CLI): Per gli amanti del terminale e per chi desidera scriptare o automatizzare le conversioni in locale.

• Formato Ottimizzato: Estrae direttamente le tracce native in formato .m4a, un formato leggerissimo ma ad alta fedeltà audio.

• Privacy Totale (Local-Only): Nessun server esterno, nessuna API cloud. Tutti i tuoi file vengono elaborati localmente all'interno del browser (PWA) o sul tuo computer (Python). I tuoi appunti e la tua voce rimangono solo tuoi.

🧠 Come Funziona (Sotto il Cofano)

I file con estensione .goodnotes in realtà sono semplici archivi compressi (file ZIP) che contengono al loro interno una struttura complessa di database, metadati e file multimediali.

La sfida con GoodNotes:

All'interno dell'archivio, GoodNotes salva le registrazioni audio all'interno di una cartella di allegati usando dei nomi in codice (stringhe alfanumeriche UUID, ad esempio 3F2504E0-4F89-11D3-9A0C-0305E82C3301.m4a). Di conseguenza, se provi ad aprire manualmente lo zip del quaderno, ti ritroverai con file audio dai nomi impossibili da riconoscere.

La soluzione di GoodNotes Audio Exporter:

1. Parsing dei Metadati: Il tool (sia lo script che la PWA) analizza i file di configurazione interni e i file di indice presenti nel pacchetto .goodnotes.

2. Accoppiamento ID-Nome: Estrae le associazioni chiave-valore che collegano ogni ID univoco (UUID) al nome personalizzato che hai assegnato alla traccia e alla data e ora esatte della registrazione.

3. Rinominamento e Pulizia: Rinomina i file audio originali .m4a applicando uno schema ordinato e leggibile:
[DATA_REGISTRAZIONE] - [NOME_PERSONALIZZATO].m4a
(es. [2026-05-12_10-30-00] - Lezione di Analisi Matematica.m4a)

🌐 1. Utilizzo tramite Progressive Web App (PWA)

La via più semplice, immediata e compatibile con qualsiasi sistema operativo (iPadOS, iOS, Android, macOS, Windows, Linux).

Caratteristiche della PWA:

• Funzionamento Offline: Una volta visitato il sito la prima volta, grazie ai Service Worker integrati, puoi utilizzare l'app anche in aereo o senza alcuna connessione ad internet.

• Installabile: Puoi aggiungerla alla schermata Home del tuo iPad/iPhone o installarla come app nativa sul tuo computer per averla sempre a portata di mano.

• Flessibilità di Download:

	• Download Singolo: Visualizza la lista cronologica di tutte le registrazioni trovate nel documento, con i loro rispettivi nomi e date, e scarica solo l'audio che ti interessa.

	• Download Cumulativo (.zip): Genera istantaneamente all'interno del browser un pacchetto .zip contenente tutte le tracce audio rinominate correttamente, pronto da salvare con un solo click.

Come usarla:

1. Apri la PWA all'indirizzo: [INSERISCI_QUI_IL_LINK_DELLA_TUA_PWA]

2. Se desideri usarla offline, clicca su Condividi -> Aggiungi alla schermata Home (su Safari iOS) o sull'icona Installa nella barra degli indirizzi (su Chrome/Edge).

3. Trascina il tuo file .goodnotes o selezionalo dal gestore file.

4. Scegli se scaricare i singoli file .m4a o il pacchetto .zip completo.

🛠️ 2. Utilizzo tramite Script Python (CLI)

Se preferisci lavorare da terminale o integrare lo strumento in flussi di automazione locali.

Prerequisiti

• Python 3.x installato sul sistema.

• Nessuna libreria esterna richiesta per le funzionalità base (utilizza moduli standard come zipfile, json, os).

Installazione

Clona la repository ed entra nella cartella di progetto:

[bash]
git clone [https://github.com/B3VERAGE/goodnotesaudioexporter.git](https://github.com/B3VERAGE/goodnotesaudioexporter.git)
cd goodnotesaudioexporter


Esecuzione

1. Esporta il tuo quaderno da GoodNotes in formato .goodnotes (assicurandoti che nelle opzioni di esportazione sia inclusa la traccia audio).

2. Sposta o copia il file ottenuto all'interno della cartella temporanea tmp_zips/ nel progetto.

3. Esegui lo script:

[bash]
python goodnotesAudio.py


4. Troverai i file audio estratti, rinominati e ordinati nella cartella exports/.

📂 Struttura della Repository

[text]
goodnotesaudioexporter/
├── goodnotesAudio.py     # Script Python per l'esportazione locale
├── tmp_zips/             # Cartella di input per i file .goodnotes o .zip
├── exports/              # Cartella di output per le tracce audio estratte
├── public/               # File statici e asset per la PWA (HTML, CSS, JS)
│   ├── manifest.json     # Configurazione per l'installazione della PWA
│   └── sw.js             # Service Worker per il funzionamento offline
└── README.md             # Questa documentazione


🤝 Contributi e Supporto

Hai riscontrato problemi con un file specifico? Vorresti proporre un miglioramento dell'interfaccia grafica della PWA o aggiungere una nuova feature allo script Python?

I contributi di qualsiasi tipo sono i benvenuti!

1. Fai un Fork del progetto.

2. Crea un branch per la tua feature (git checkout -b feature/NuovaFeature).

3. Fai un commit delle tue modifiche (git commit -m 'Aggiunta NuovaFeature').

4. Fai un Push sul branch (git push origin feature/NuovaFeature).

5. Apri una Pull Request.

In alternativa, puoi semplicemente segnalare anomalie o suggerimenti aprendo una Issue.

📄 Licenza

Questo progetto è distribuito sotto licenza GNU General Public License v3.0 (GPL-3.0). Consulta il file LICENSE per ulteriori dettagli.
