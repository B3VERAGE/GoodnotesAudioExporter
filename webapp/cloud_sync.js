/**
 * ================================================================================
 * Goodnotes 6 AI Audio Exporter - Cloud Sync & Backend Bridge (Milestone 4)
 * ================================================================================
 * Modulo dedicato alla sincronizzazione cloud e al discovery del backend Starlette:
 * 1. detectBackendConnection(): Tenta di contattare /api/status con timeout 1200ms.
 * 2. fetchBackendNotebooks(origin): Elenca i quaderni iCloud presenti sul Mac.
 * 3. analyzeBackendNotebook(origin, notebookPath): Avvia analisi Zero-Space backend.
 * 4. exportBackendNotebook(origin, notebookPath, outputDir, options): Esporta le tracce.
 * 5. selectCloudDirectory(): Collega cartella Cloud locale tramite File System Access API.
 * 6. scanDirectoryHandle(handle): Scansiona ricorsivamente i file .goodnotes.
 * ================================================================================
 */

const CLOUD_SYNC_DB_NAME = 'GoodnotesCloudSyncDB';
const CLOUD_SYNC_DB_VERSION = 1;
const CLOUD_SYNC_STORE_HANDLES = 'handles';
const KEY_SAVED_DIR_HANDLE = 'saved_cloud_directory_handle';

let cloudDbPromise = null;

/**
 * Inizializza e restituisce la connessione singleton a IndexedDB per gli handle Cloud.
 */
function openCloudSyncDB() {
    if (cloudDbPromise) return cloudDbPromise;

    cloudDbPromise = new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            return reject(new Error('IndexedDB non è disponibile in questo ambiente.'));
        }

        const request = indexedDB.open(CLOUD_SYNC_DB_NAME, CLOUD_SYNC_DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(CLOUD_SYNC_STORE_HANDLES)) {
                db.createObjectStore(CLOUD_SYNC_STORE_HANDLES);
            }
        };

        request.onsuccess = (event) => {
            const db = event.target.result;
            db.onversionchange = () => {
                db.close();
                cloudDbPromise = null;
            };
            resolve(db);
        };

        request.onerror = (event) => {
            cloudDbPromise = null;
            reject(new Error(`Errore apertura IndexedDB CloudSync: ${event.target.error?.message}`));
        };
    });

    return cloudDbPromise;
}

/**
 * Salva l'handle di una cartella Cloud in IndexedDB per riutilizzarlo nelle sessioni successive.
 * @param {FileSystemDirectoryHandle} handle 
 */
async function saveStoredDirectoryHandle(handle) {
    if (!handle) return false;
    try {
        const db = await openCloudSyncDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([CLOUD_SYNC_STORE_HANDLES], 'readwrite');
            const store = tx.objectStore(CLOUD_SYNC_STORE_HANDLES);
            const req = store.put(handle, KEY_SAVED_DIR_HANDLE);
            req.onsuccess = () => resolve(true);
            req.onerror = (e) => reject(new Error(`Errore salvataggio handle: ${e.target.error?.message}`));
        });
    } catch (err) {
        console.warn('[CloudSync] Impossibile salvare handle in IndexedDB:', err);
        return false;
    }
}

/**
 * Recupera l'handle salvato in precedenza da IndexedDB.
 * @returns {Promise<FileSystemDirectoryHandle|null>}
 */
async function getStoredDirectoryHandle() {
    try {
        const db = await openCloudSyncDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([CLOUD_SYNC_STORE_HANDLES], 'readonly');
            const store = tx.objectStore(CLOUD_SYNC_STORE_HANDLES);
            const req = store.get(KEY_SAVED_DIR_HANDLE);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = (e) => reject(new Error(`Errore recupero handle: ${e.target.error?.message}`));
        });
    } catch (err) {
        console.warn('[CloudSync] Impossibile leggere handle da IndexedDB:', err);
        return null;
    }
}

/**
 * Verifica e richiede i permessi di lettura/scrittura per un handle FileSystem.
 * @param {FileSystemHandle} handle 
 * @param {boolean} readWrite 
 * @returns {Promise<boolean>}
 */
async function verifyHandlePermission(handle, readWrite = false) {
    if (!handle) return false;
    const options = { mode: readWrite ? 'readwrite' : 'read' };
    try {
        if ((await handle.queryPermission(options)) === 'granted') {
            return true;
        }
        if ((await handle.requestPermission(options)) === 'granted') {
            return true;
        }
    } catch (err) {
        console.warn('[CloudSync] Errore verifica permessi handle:', err);
    }
    return false;
}

/**
 * Esegue una richiesta di test con timeout rigoroso a un URL di stato.
 * @param {string} url 
 * @param {number} timeoutMs 
 * @returns {Promise<{ ok: boolean, data?: any }>}
 */
async function testStatusUrl(url, timeoutMs = 1200) {
    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: controller.signal
        });
        clearTimeout(timerId);

        if (response.ok) {
            const data = await response.json();
            if (data && (data.status || data.risorse_directory || data.notebooks_in_risorse !== undefined)) {
                return { ok: true, data };
            }
        }
    } catch (err) {
        clearTimeout(timerId);
    }

    return { ok: false };
}

/**
 * 1. detectBackendConnection()
 * Rileva se il server Python locale è attivo senza bloccare l'UI o il ciclo di vita offline.
 * Controlla in cascata:
 * - window.location.origin (se http/https)
 * - http://localhost:8000
 * - http://127.0.0.1:8000
 * 
 * @returns {Promise<{ connected: boolean, origin?: string, status?: any }>}
 */
async function detectBackendConnection() {
    const candidateOrigins = [];

    if (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
        candidateOrigins.push(window.location.origin);
    }

    if (!candidateOrigins.includes('http://localhost:8000')) {
        candidateOrigins.push('http://localhost:8000');
    }
    if (!candidateOrigins.includes('http://127.0.0.1:8000')) {
        candidateOrigins.push('http://127.0.0.1:8000');
    }

    for (const origin of candidateOrigins) {
        const targetUrl = `${origin}/api/status`;
        const testResult = await testStatusUrl(targetUrl, 1200);

        if (testResult.ok) {
            console.log(`[CloudSync] ✅ Backend Goodnotes rilevato su: ${origin}`);
            return {
                connected: true,
                origin: origin,
                status: testResult.data
            };
        }
    }

    console.log('[CloudSync] ℹ️ Nessun backend rilevato (Modalità Standalone Offline 100%).');
    return { connected: false };
}

/**
 * 2. fetchBackendNotebooks(origin)
 * Chiama /api/notebooks per ottenere l'elenco dei quaderni rilevati sul Mac da iCloud Drive.
 * 
 * @param {string} [origin] 
 * @returns {Promise<Array<Object>>}
 */
async function fetchBackendNotebooks(origin) {
    let targetOrigin = origin;
    if (!targetOrigin) {
        const det = await detectBackendConnection();
        if (!det.connected) {
            throw new Error('Backend Mac non raggiungibile.');
        }
        targetOrigin = det.origin;
    }

    const response = await fetch(`${targetOrigin}/api/notebooks`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
        throw new Error(`Errore recupero quaderni dal backend: HTTP ${response.status}`);
    }

    return await response.json();
}

/**
 * 3. analyzeBackendNotebook(origin, notebookPath)
 * Avvia l'analisi Zero-Space in-memory sul backend tramite POST /api/analyze.
 * 
 * @param {string} [origin] 
 * @param {string} notebookPath - Nome o percorso relativo/assoluto del quaderno
 * @returns {Promise<Object>}
 */
async function analyzeBackendNotebook(origin, notebookPath) {
    let targetOrigin = origin;
    if (!targetOrigin) {
        const det = await detectBackendConnection();
        if (!det.connected) throw new Error('Backend Mac non raggiungibile.');
        targetOrigin = det.origin;
    }

    if (!notebookPath) {
        throw new Error("Parametro 'notebookPath' mancante per l'analisi.");
    }

    const response = await fetch(`${targetOrigin}/api/analyze`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({ notebook: notebookPath })
    });

    if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        throw new Error(errorJson.error || `Errore analisi backend: HTTP ${response.status}`);
    }

    return await response.json();
}

/**
 * 4. exportBackendNotebook(origin, notebookPath, outputDir, options)
 * Esegue l'esportazione batch non bloccante delle tracce sul Mac tramite POST /api/export.
 * 
 * @param {string} [origin] 
 * @param {string} notebookPath 
 * @param {string} [outputDir] 
 * @param {Object} [options] 
 * @returns {Promise<Object>}
 */
async function exportBackendNotebook(origin, notebookPath, outputDir, options = {}) {
    let targetOrigin = origin;
    if (!targetOrigin) {
        const det = await detectBackendConnection();
        if (!det.connected) throw new Error('Backend Mac non raggiungibile.');
        targetOrigin = det.origin;
    }

    const payload = {
        notebook: notebookPath,
        custom_export_dir: outputDir || undefined,
        format: options.format || 'm4a',
        selected_uuids: options.selected_uuids || undefined
    };

    const response = await fetch(`${targetOrigin}/api/export`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        throw new Error(errorJson.error || `Errore esportazione backend: HTTP ${response.status}`);
    }

    return await response.json();
}

/**
 * 5. selectCloudDirectory()
 * Sfrutta window.showDirectoryPicker() (Desktop Chrome/Edge/Safari 15.2+)
 * per selezionare e autorizzare l'accesso a una cartella Cloud locale.
 * Salva l'handle in IndexedDB per successive scansioni automatiche.
 * 
 * @returns {Promise<FileSystemDirectoryHandle>}
 */
async function selectCloudDirectory() {
    if (typeof window === 'undefined' || typeof window.showDirectoryPicker !== 'function') {
        throw new Error('La selezione cartelle (File System Access API) non è supportata da questo browser. Usa Chrome, Edge o Safari 15.2+ su desktop.');
    }

    const handle = await window.showDirectoryPicker({
        id: 'goodnotes_cloud_drive_picker',
        mode: 'read'
    });

    if (handle) {
        await saveStoredDirectoryHandle(handle);
    }

    return handle;
}

/**
 * 6. scanDirectoryHandle(handle, pathPrefix, depth, maxDepth)
 * Scansiona ricorsivamente una cartella autorizzata alla ricerca di file .goodnotes o .zip.
 * 
 * @param {FileSystemDirectoryHandle} handle 
 * @param {string} [pathPrefix=''] 
 * @param {number} [depth=0] 
 * @param {number} [maxDepth=4] 
 * @returns {Promise<Array<Object>>}
 */
async function scanDirectoryHandle(handle, pathPrefix = '', depth = 0, maxDepth = 4) {
    if (!handle || depth > maxDepth) return [];

    const isPermitted = await verifyHandlePermission(handle, false);
    if (!isPermitted) {
        console.warn(`[CloudSync] Permessi negati per l'handle: ${handle.name}`);
        return [];
    }

    const foundFiles = [];

    try {
        for await (const entry of handle.values()) {
            const relPath = pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name;

            if (entry.kind === 'file') {
                const lowerName = entry.name.toLowerCase();
                if (lowerName.endsWith('.goodnotes') || lowerName.endsWith('.zip')) {
                    try {
                        const fileObj = await entry.getFile();
                        foundFiles.push({
                            name: entry.name,
                            relativePath: relPath,
                            handle: entry,
                            file: fileObj,
                            size: fileObj.size,
                            sizeMb: (fileObj.size / (1024 * 1024)).toFixed(2),
                            lastModified: fileObj.lastModified,
                            lastModifiedDate: new Date(fileObj.lastModified).toISOString()
                        });
                    } catch (fErr) {
                        console.warn(`[CloudSync] Impossibile leggere file ${entry.name}:`, fErr);
                    }
                }
            } else if (entry.kind === 'directory') {
                if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
                    const subFiles = await scanDirectoryHandle(entry, relPath, depth + 1, maxDepth);
                    foundFiles.push(...subFiles);
                }
            }
        }
    } catch (scanErr) {
        console.warn(`[CloudSync] Errore iterazione directory ${handle.name}:`, scanErr);
    }

    return foundFiles;
}

// Esportazione dell'interfaccia nel namespace globale CloudSync
const CloudSync = {
    detectBackendConnection,
    fetchBackendNotebooks,
    analyzeBackendNotebook,
    exportBackendNotebook,
    selectCloudDirectory,
    scanDirectoryHandle,
    getStoredDirectoryHandle,
    verifyHandlePermission,
    saveStoredDirectoryHandle
};

if (typeof globalThis !== 'undefined') {
    globalThis.CloudSync = CloudSync;
    globalThis.detectBackendConnection = detectBackendConnection;
    globalThis.fetchBackendNotebooks = fetchBackendNotebooks;
    globalThis.analyzeBackendNotebook = analyzeBackendNotebook;
    globalThis.exportBackendNotebook = exportBackendNotebook;
    globalThis.selectCloudDirectory = selectCloudDirectory;
    globalThis.scanDirectoryHandle = scanDirectoryHandle;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CloudSync;
}
