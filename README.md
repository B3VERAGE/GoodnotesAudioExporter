# 🎙️ Goodnotes 6 AI Audio Exporter & Mac Desktop App

> **Estrattore intelligente di registrazioni audio da quaderni Goodnotes 6 con connessione diretta iCloud (Zero-Space), decodifica Protobuf in-memory, risoluzione cifrari e interfaccia desktop nativa Apple Light Mode.**

---

## 🌟 Caratteristiche Principali

- **Connessione Diretta iCloud (Zero-Space)**: Legge i quaderni `.goodnotes` in streaming direttamente da iCloud Drive (`Università-Docs e Registrazioni`) aprendoli come archivi ZIP in memoria RAM, senza scompattare gigabyte di file su disco locale.
- **Decodifica Protobuf & Metadata MP4**: Decodifica i metadati interni da `index.events.pb` ed estrae la data e l'ora reale di registrazione direttamente dai primi 256 KB del box MP4 (`mvhd`), assegnando a ciascun file il prefisso cronologico `GG_MM - Titolo.m4a`.
- **Risoluzione Cifrari & Font Unicode**: Decodifica automaticamente i titoli cifrati in stile Cesare ($+8/+4$) e normalizza i font matematici Unicode non ricercabili su macOS Spotlight/Finder.
- **Filtraggio Tracce Fantasma**: Esclude preventivamente le registrazioni storiche eliminate dall'utente in Goodnotes ma rimaste nei log dei metadati (eliminando del tutto i file vuoti da 0 MB o senza nome).
- **Applicazione Desktop Standalone per macOS**:
  - Compilata nativamente per Apple Silicon (`dist/Goodnotes Agent.app`).
  - Interfaccia fluida in **Apple Light Mode** basata su WebKit nativo (`WKWebView` / `pywebview`).
  - **Player Audio Integrato** con cache locale auto-pulente (max 50 MB) per ascoltare le anteprime audio prima dell'esportazione.
  - **Negoziazione Dinamica delle Porte**: Evita conflitti (es. porta 8000 già in uso da altri processi) collegando automaticamente frontend e backend alla prima porta TCP disponibile.
- **PWA & WebApp Offline**: Conservata nella directory `webapp/` per l'utilizzo drag-and-drop 100% offline su browser, iPad e iPhone.

---

## 🏗️ Architettura del Progetto

```
.
├── Goodnotes Agent.app         # Bundle standalone macOS precompilato (in dist/)
├── run_desktop_app.py          # Entrypoint GUI desktop nativa macOS (WKWebView + Uvicorn)
├── agent_server.py             # Server API locale asincrono (Starlette)
├── goodnotes_agent.py          # Business logic, decodifica in-memory ed esportazione
├── decode_goodnotes_pb.py      # Decoder Protobuf a basso livello e parser box MP4
├── index.html                  # Dashboard desktop in stile Apple Light Mode
├── app_icon.icns               # Icona macOS personalizzata con logo GE
├── Avvia_Control_Panel.command # Launcher doppio-clic per terminale Mac
├── AGENTS.md                   # Specifiche e regole operative per gli agenti AI
├── MEMORY.md                   # Stato persistente, architettura e bug history
├── .agents/                    # Regole modulari di architettura e testing
└── webapp/                     # Versione PWA client-side drag-and-drop
```

---

## 🚀 Istruzioni di Avvio

### 1. Avvio dell'Applicazione Desktop Nativa macOS
È sufficiente aprire la cartella `dist/` e fare doppio clic su:
```bash
dist/Goodnotes Agent.app
```
oppure avviare il launcher interattivo:
```bash
./Avvia_Control_Panel.command
```

### 2. Esecuzione da Ambiente di Sviluppo (Python)
Attiva l'ambiente virtuale locale ed esegui:
```bash
./.venv/bin/python run_desktop_app.py
```

### 3. Test di Robustezza della Decodifica
Per verificare che tutti i quaderni Goodnotes su iCloud siano decodificabili con 0 errori:
```bash
./.venv/bin/python scratch/verify_decoding_robustness.py
```

---

## 🤖 Squadra di Subagenti Specialisti (`goodnotes-team-plugin`)

Il progetto è gestito da un team di subagenti autonomi con regole definite in `AGENTS.md`:
- **`goodnotes-backend-architect`**: Ristrutturazione backend modulare, Starlette, I/O asincrono e threadpool non bloccante.
- **`goodnotes-ui-specialist`**: Esperienza utente Apple Light Mode, micro-interazioni e floating player.
- **`goodnotes-qa-guard`**: Quality gate, verifica pre-rilascio, packaging PyInstaller e prevenzione regressioni.

---

## 📄 Licenza

Distribuito sotto licenza GNU General Public License v3.0 (GPL-3.0).
