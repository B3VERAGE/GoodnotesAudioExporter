# Task Plan: Micro-Zoom on Milestone 4 (Optional Cloud Sync, Backend Bridge & Release Gate)

> **Parent Reference**: `MASTER_PLAN.md` -> Milestone 4 -> Tasks 4.1, 4.2, 4.3, 4.Final  
> **Parent Reference**: `MASTER_PLAN.md` -> Milestone 4 -> Tasks 4.1, 4.2, 4.3, 4.Final  
> **Status**: Completed (100% Audited & Approved)  
> **Assigned Role**: `goodnotes-backend-architect` / `goodnotes-ui-specialist` / `goodnotes-qa-guard`

---

## 🎯 Milestones 1, 2, 3 Summary (Completed & Approved)
- [x] **Milestone 1**: PWA Shell, Modern Manifest, Apple Touch Icons, Service Worker v7, Apple Glass Install Banner & iOS Modal Guide. (Audited: APPROVED).
- [x] **Milestone 2**: Dedicated Web Worker (`worker.js`), zero UI freeze su file da 1 GB, parità algoritmica 100% con backend v2.0, persistenza locale IndexedDB (`db.js`). (Audited: APPROVED).
- [x] **Milestone 3**: Apple HIG Light & Dark Mode, Floating Audio Player dockable stile Apple Podcasts/Music, MediaSession API, WebKitDirectory & Bento Grid Libreria Locale. (Audited: APPROVED).

---

## 🎯 Milestone 4 Scope & Goal (Completed & Approved)
Perfezionamento della sincronizzazione cloud opzionale, auto-discovery del backend nativo locale e release hardening:
1. **Intelligent Dual-Mode Discovery (Task 4.1)**:
   - All'avvio la PWA interroga `/api/status` (con fallback su `window.location.origin`, `localhost:8000`, `127.0.0.1:8000`).
   - Se il backend nativo locale Mac è attivo, mostra un badge/pill di stato verde: 🟢 *Mac Backend Attivo* con banner rapido e modale Apple Glass per estrarre direttamente i quaderni di iCloud Drive in modalità Zero-Space.
   - Se disconnesso/offline, mostra il pill ambra: 🟡 *Standalone Offline* con funzionamento 100% locale tramite Web Worker.
2. **File System Access API & Persistent Cloud Directory Sync (Task 4.2)**:
   - Integrazione di `window.showDirectoryPicker()` per collegare cartelle Cloud locali (iCloud Drive, Google Drive, OneDrive).
   - Memorizzazione sicura del `FileSystemDirectoryHandle` in IndexedDB (`GoodnotesCloudSyncDB`) per ri-scansionare automaticamente i quaderni.
3. **Safe Batch Export & Streaming ZIP (Task 4.3)**:
   - Streaming HTTP non bloccante via `/api/audio/play` per audio player e download singoli/ZIP senza consumi eccessivi di RAM.
4. **Milestone 4 Release Gate (Task 4.Final)**:
   - Esecuzione audit finale globale con `goodnotes-qa-guard` (100% PASS, 0 regressioni, verdetto **APPROVE** ✅).

---

## 📋 Micro-Steps
- [x] **Step 4.1**: Creare `webapp/cloud_sync.js` per gestire l'auto-discovery del backend (`detectBackendConnection`), `fetchBackendNotebooks`, `analyzeBackendNotebook`, `exportBackendNotebook` e `selectCloudDirectory()`.
- [x] **Step 4.2**: Aggiungere il badge Dual-Mode nella navbar dell'header in `webapp/index.html` e `webapp/index.css`.
- [x] **Step 4.3**: Aggiungere `cloud_sync.js` al pre-caching in `webapp/sw.js` (cache `v8`) e includerlo prima di `app.js` in `webapp/index.html`.
- [x] **Step 4.4**: Testare l'integrazione e convocare `goodnotes-qa-guard` per il Final Release Gate (Audit superato: APPROVE).
