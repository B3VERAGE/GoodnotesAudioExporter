# Architecture & System Design — Goodnotes 6 AI Audio Exporter

## System Overview

```
+-------------------------------------------------------------------------------+
|                             macOS Desktop Environment                         |
|                                                                               |
|  +-------------------------------------------------------------------------+  |
|  |             Goodnotes Agent.app (PyInstaller Standalone Bundle)         |  |
|  |                                                                         |  |
|  |  +---------------------------+       +-------------------------------+  |  |
|  |  |   Frontend (WKWebView)    |       |   Backend (Starlette/Uvicorn) |  |  |
|  |  |  - HTML5 / Apple CSS      |<----->|  - Dynamic Free TCP Port      |  |  |
|  |  |  - window.location.origin |  HTTP |  - Async Route Handlers       |  |  |
|  |  |  - Floating Audio Player  |  REST |  - ThreadPool CPU Executors   |  |  |
|  |  +---------------------------+       +-------------------------------+  |  |
|  +------------------------------------------------------|------------------+  |
|                                                         |                     |
|                               In-Memory ZIP / Streaming | (Read / Stream)     |
|                                                         v                     |
|  +-------------------------------------------------------------------------+  |
|  |                iCloud Drive: Università-Docs e Registrazioni            |  |
|  |  - In-Place Read: Notebook.goodnotes (ZIP without extracting to disk)   |  |
|  |  - Direct Stream Export: Destinazione_Materia/GG_MM - Titolo.m4a        |  |
|  +-------------------------------------------------------------------------+  |
+-------------------------------------------------------------------------------+
```

## Key Architectural Principles

1. **Zero-Space iCloud-Direct**:
   - Never extract complete `.goodnotes` ZIP files to disk.
   - Read `index.events.pb` and audio attachments directly in memory using `zipfile.ZipFile`.
   - Temporary cache (`scratch/cache/`) is restricted to max 50 MB and auto-prunes to 20 MB.

2. **Bundle & Path Resilience**:
   - `sys._MEIPASS` contains read-only embedded assets (`index.html`).
   - `WORKSPACE_ROOT` dynamically resolves to the user workspace (or parent of `.app` bundle) to safely persist user files (`.env`, `scratch/export_mappings.json`).

3. **Dynamic Port Negotiation**:
   - The desktop launcher searches for an open TCP port (default 8000; fallback to dynamic socket `0`).
   - The frontend connects using `${window.location.origin}/api` avoiding port collision errors (`{"detail":"Not Found"}`).
