# Task Plan: Ristrutturazione Backend & Efficienza Goodnotes Audio Exporter

## Overview
Ristrutturare il backend monolitico in un package modulare moderno (`backend/`), risolvere alla radice gli errori di ritrovamento registrazioni e di modifica dei nomi (lettere saltate, acronimi distrutti, accenti italiani), introdurre concorrenza asincrona con threadpool e caching LRU, e convalidare il tutto con test di robustezza e compilazione standalone.

---

### Phase 1: Architettura Modulare & Motore Titoli (`title_cleaner.py`)
- [x] Creare la struttura del package `backend/` (`__init__.py`, `config.py`, `core/`, `services/`, `api/`)
- [x] Implementare `backend/core/title_cleaner.py`:
  - Normalizzazione Unicode NFD/NFC e decodifica completa Math Bold/Italic/Sans/Mono
  - Rilevamento Cesare statistico privo di falsi positivi (sicuro su parole italiane e lettere accentate)
  - Whitelist di protezione per acronimi medici e sigle di materia (`ECG`, `BPCO`, `SCA`, `RCU`, `CEC`, `PAD`, `CV`, `CC`, `CT`, `SMED`, `ANTROPO`, `POLM`)
  - Sanitizzazione punteggiatura orfana
- [x] Test & Review Fase 1: Verifica su tutte le 113 tracce reali dei 4 quaderni iCloud.

### Phase 2: Core Decoders & Low-Level Parsers
- [x] Implementare `backend/core/mp4_parser.py`: parsing atomo `mvhd` in-memory (head & tail) per timestamp Unix reale e durata fallback
- [x] Implementare `backend/core/protobuf_decoder.py`: deserializzazione in-memory di `index.events.pb` con blackboxprotobuf
- [x] Test & Review Fase 2: Benchmark tempi di parsing ed estrazione metadati.

### Phase 3: Servizi iCloud & Caching LRU
- [x] Implementare `backend/services/icloud_scanner.py`:
  - Riconoscimento rigoroso quaderni tramite firma Goodnotes (`index.events.pb` presente)
  - Esclusione archivi spuri (`AnatoPat_Audio.zip`, file in `audio non miei `)
  - Tolleranza Unicode NFD/NFC per percorsi macOS
- [x] Implementare `backend/services/cache_manager.py`: cache LRU basata su `(canonical_path, file_mtime, file_size)`
- [x] Implementare `backend/services/audio_exporter.py`: streaming Zero-Space con Smart Skip
- [x] Test & Review Fase 3: Scansione iCloud e verifica assenza di zip errati.

### Phase 4: API Asincrona & Refactoring Server
- [x] Implementare `backend/api/routes.py` e `backend/api/server.py`:
  - Concorrenza non bloccante via `asyncio.to_thread` per operazioni CPU-bound
  - Endpoint REST: `/status`, `/notebooks`, `/analyze`, `/export`, `/audio/play`, `/export-paths`, `/config`
- [x] Aggiornare `agent_server.py`, `goodnotes_agent.py` e `run_desktop_app.py` per integrarsi con il nuovo package modulare
- [x] Test & Review Fase 4: Verifica API locale su porta dinamica e streaming audio preview.

### Phase 5: Quality Gate & Verifica Standalone
- [x] Aggiornamento ed esecuzione test suite `scratch/verify_decoding_robustness.py`
- [x] Recompilazione bundle standalone macOS (`Goodnotes Agent.app`) con PyInstaller
- [x] Verifica finale dell'applicazione e report di chiusura
