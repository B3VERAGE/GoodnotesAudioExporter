# 🧠 MEMORY.md — Goodnotes

> Ultimo aggiornamento: 2026-09-23

## 🎯 Stato attuale
L'applicazione è stata trasformata in un'app desktop nativa per macOS (`dist/Goodnotes Agent.app`) con interfaccia Apple Light Mode e architettura "Zero-Space" collegata direttamente a iCloud Drive. Tutti i bug di avvio (conflitti di porta, persistenza API key, tracce fantasma rimosse da Goodnotes) sono stati risolti e validati con test di robustezza al 100% su tutti i quaderni reali. La richiesta attuale è di ristrutturare il backend ed ottimizzare l'efficienza complessiva del sistema.

## 📁 File chiave
- `AGENTS.md`: Specifiche del progetto, matrice di delegazione subagenti (`goodnotes-team-plugin`) e workflow skill.
- `.agents/rules/`: Regole modulari per architettura, pattern backend asincroni e standard di decodifica/testing.
- `README.md`: Documentazione tecnica completa del repository GitHub.
- `run_desktop_app.py`: Entrypoint dell'applicazione desktop nativa macOS (pywebview + server Uvicorn in daemon thread con binding dinamico su porta libera).
- `agent_server.py`: Server API Starlette locale; gestisce gli endpoint REST per scansione iCloud, decodifica metadati, streaming audio preview, configurazione API key e apertura folder picker nativo.
- `goodnotes_agent.py`: Logica di business e integrazione SDK; parsing in-memory dei file `.goodnotes` (zip), decodifica Protobuf, decifratura titoli (Caesar + Unicode Math) ed esportazione con deduplicazione Smart Skip.
- `decode_goodnotes_pb.py`: Modulo originale standalone di decodifica Protobuf e manipolazione stream MP4 (`mvhd` box per data registrazione reale).
- `index.html`: Dashboard frontend moderna in stile Apple Light Mode, con player audio fluttuante, visualizzazione cartelle iCloud e badge di data/stato.
- `Goodnotes Agent.spec`: Specifica PyInstaller per la compilazione del bundle `.app` nativo Apple Silicon con icona personalizzata `app_icon.icns`.

## 🧩 Fatti permanenti
- **Repository GitHub**: `https://github.com/B3VERAGE/GoodnotesAudioExporter.git` (utente `B3VERAGE`).
- **Plugin Subagenti**: `goodnotes-team-plugin` in `~/.gemini/config/plugins/goodnotes-team-plugin/` con 3 agenti (`goodnotes-backend-architect`, `goodnotes-ui-specialist`, `goodnotes-qa-guard`) e router `goodnotes-team-router`.
- **Architettura Zero-Space**: I quaderni Goodnotes non vengono scompattati su disco locale. Vengono aperti in memoria come flussi ZIP direttamente dal percorso iCloud (`~/Library/Mobile Documents/com~apple~CloudDocs/Università-Docs e Registrazioni`).
- **Risoluzione percorsi bundle**: All'interno del pacchetto `.app`, `sys._MEIPASS` contiene le risorse embedded (`index.html`), mentre `WORKSPACE_ROOT` risale dinamicamente al folder esterno dell'app per caricare `.env` e salvare `scratch/export_mappings.json`.
- **Rilevamento porte dinamiche**: La porta default è la 8000; se occupata, `run_desktop_app.py` seleziona la prima porta TCP libera sul localhost e `index.html` ricava dinamicamente `API_URL` da `window.location.origin`.
- **Validazione Gemini**: Chiave memorizzata in `.env` come `GEMINI_API_KEY`; la validazione avviene tramite GET a `generativelanguage.googleapis.com/v1beta/models?key=...`.

## 🐛 Bug noti & risoluzioni
- `{"detail":"Not Found"}` all'avvio → Porta 8000 occupata da processo `open-terminal` esterno → Risolto con selezione dinamica porta libera in `run_desktop_app.py` e URL dinamico in `index.html`.
- Perdita della `GEMINI_API_KEY` al riavvio → `load_dotenv()` caricava dal CWD di avvio bundle anziché da `WORKSPACE_ROOT` → Risolto forzando `load_dotenv(os.path.join(WORKSPACE_ROOT, ".env"))`.
- Tracce "Mancanti" e "Registrazioni Senza Nome" da 0 MB → Goodnotes lascia riferimenti storici in `index.events.pb` anche dopo aver eliminato i file fisici → Risolto filtrando in `analyze_notebook_audios` solo i file effettivamente presenti in `attachments/`.
- Nomi cifrati o font strani → Goodnotes applica cifrari stile Cesare (+8/+4) e font matematici Unicode → Risolto con normalizzazione ASCII e decodifica alfabetica su `clean_filename`.

## 📋 Prossimi passi
1. Refactoring modulare del backend: separare `agent_server.py` e `goodnotes_agent.py` in moduli dedicati (core/decoder, services/icloud, api/routes, core/config) eliminando logica duplicata e script monolitici.
2. Ottimizzazione delle performance di I/O e caching: implementare caching LRU in-memory dei metadati Protobuf già decodificati e I/O asincrono per l'accesso ai file `.goodnotes` su iCloud.
3. Disaccoppiamento threadpool per operazioni CPU-bound: migrare la decodifica protobuf e la manipolazione audio su executor asincroni non bloccanti per massimizzare la reattività della GUI.
