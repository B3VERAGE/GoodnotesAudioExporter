# 🧠 MEMORY.md — Goodnotes

> Ultimo aggiornamento: 2026-09-24

## 🎯 Stato attuale
Ristrutturazione completa del backend v2.0 e allineamento al 100% della PWA client-side completati. Risolti tutti i problemi di tracce non rilevate (fallback su atomo `mvhd` e inclusione tracce prive di durata Protobuf) e di corruzione dei nomi/lettere saltate (protezione vocali accentate italiane, Cesare statistico senza falsi positivi, whitelist acronimi medici). Validati con successo tutti i 4 quaderni reali su iCloud (113 tracce fisiche estratte, 7 ghost tracks eliminate, 0 errori). Compilato e verificato il nuovo bundle standalone macOS Apple Silicon (`dist/Goodnotes Agent.app`).

## 📁 File chiave
- `backend/config.py`: Gestione dinamica percorsi (`WORKSPACE_ROOT`, `sys._MEIPASS`), caricamento `.env` assoluto e discovery porte TCP libere.
- `backend/core/title_cleaner.py`: Normalizzazione Unicode NFC, decodifica simboli matematici completi, protezione vocali accentate italiane, Cesare statistico e whitelist acronimi medici (`ECG`, `BPCO`, `SCA`, `RCU`, `CEC`, `PAD`).
- `backend/core/mp4_parser.py`: In-memory parser atomo `mvhd` (head 256KB & tail 1.5MB) per data di creazione reale (-2082844800) e durata fallback.
- `backend/core/protobuf_decoder.py`: Deserializzazione in-memory con `blackboxprotobuf` da `index.events.pb`.
- `backend/services/icloud_scanner.py`: Scansione ricorsiva con validazione zip e firma `index.events.pb`, tolleranza NFD/NFC, esclusione cartelle spuri.
- `backend/services/cache_manager.py`: Caching in-memory thread-safe con validità `(path, mtime, size)` e latenza hit < 0.1 ms.
- `backend/services/audio_exporter.py`: Pipeline Zero-Space per streaming in-memory diretto, sanitizzazione filesystem e Smart Skip deduplicazione.
- `backend/api/routes.py` & `backend/api/server.py`: Starlette API asincrona con 13 route, offloading CPU/disk via `asyncio.to_thread` e porta dinamica.
- `webapp/app.js`: PWA client-side 100% offline con piena parità algoritmica rispetto al backend v2.0 per Safari / iPadOS.
- `Goodnotes Agent.spec`: Configurazione PyInstaller aggiornata con inclusione package `backend` e `hiddenimports`.
- `dist/Goodnotes Agent.app`: Bundle desktop standalone nativo per macOS (Apple Silicon arm64).

## 🧩 Fatti permanenti
- **Repository GitHub**: `https://github.com/B3VERAGE/GoodnotesAudioExporter.git` (branch `main`).
- **Indipendenza assoluta da AI**: Il core engine (scansione, decodifica Protobuf, MP4 parser, pulizia titoli ed export) è 100% locale, deterministico e offline. L'API Gemini è opzionale e limitata alle funzioni di chat assistant.
- **Architettura Zero-Space**: I quaderni `.goodnotes` non vengono mai scompattati su disco locale; vengono manipolati come stream ZIP in-memory direttamente da iCloud Drive (`Università-Docs e Registrazioni`).
- **Parità algoritmica Desktop/PWA**: Sia il backend Python sia la PWA client-side in `webapp/app.js` condividono le medesime logiche di decifratura titoli, gestione date e fallback durata `mvhd`.
- **Rilevamento porte dinamiche**: La porta predefinita è 8000; se occupata, il server negozia la prima porta TCP libera sul localhost e il frontend rileva `API_URL` da `window.location.origin`.

## 🐛 Bug noti & risoluzioni
- Tracce non rilevate con durata assente nel Protobuf → Eliminato scarto `if duration != "N/A"` e integrato fallback su box `mvhd` (timescale/duration).
- Lettere saltate e corruzione vocali accentate (`è` -> caratteri errati) → Isolate e protette le vocali accentate italiane prima delle operazioni alfabetiche.
- Falsi positivi cifrario Cesare su parole italiane corte (`tum`, `tir`, `inizio`) → Introdotta validazione statistica con soglia rigida di parole non italiane prima di tentare lo shift.
- Acronimi medici (`ECG`, `BPCO`, `SCA`, `RCU`, `PAD`) trasformati in minuscolo → Implementata whitelist esplicita che ne preserva il case originale.
- Archivi estranei o cartelle con spazi (`audio non miei `) che bloccavano l'analisi → Aggiunta verifica preventiva della firma `index.events.pb` all'interno degli zip.

## 📋 Prossimi passi
1. Validazione utente su eventuali quaderni Goodnotes storici aggiuntivi per verificare ulteriori variazioni di formato o cifrari non ancora censiti.
2. Implementazione della selezione multi-cartella o custom directory picker nella PWA offline per iPadOS/Safari.
3. Aggiunta opzionale di esportazione batch concorrente/parallela per cartelle con più di 10 quaderni pesanti (> 1 GB ciascuno).
