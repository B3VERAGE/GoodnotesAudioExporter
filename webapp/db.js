/**
 * ================================================================================
 * Goodnotes 6 AI Audio Exporter - IndexedDB Library Manager
 * ================================================================================
 * Wrapper ultra-leggero e robusto su IndexedDB:
 * - Database: GoodnotesLibraryDB (versione 1).
 * - Object Store 1: 'notebooks' (chiave: id).
 * - Object Store 2: 'tracks' (chiave: id, indice: notebookId).
 * 
 * Funzioni esportate/globali:
 * - saveNotebookWithTracks(notebookInfo, tracksList)
 * - getAllNotebooks()
 * - getTracksForNotebook(notebookId)
 * - deleteNotebook(notebookId)
 * - getTrackAudioBlob(trackId)
 * - purgeAudioBlobsOnly()
 * - getStorageQuota()
 * ================================================================================
 */

const DB_NAME = 'GoodnotesLibraryDB';
const DB_VERSION = 1;
const STORE_NOTEBOOKS = 'notebooks';
const STORE_TRACKS = 'tracks';
const INDEX_NOTEBOOK_ID = 'notebookId';

let dbInstancePromise = null;

/**
 * Apre e memorizza la connessione singleton al database IndexedDB.
 */
function openDatabase() {
    if (dbInstancePromise) {
        return dbInstancePromise;
    }

    dbInstancePromise = new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            return reject(new Error('IndexedDB non è supportato in questo browser o ambiente.'));
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            if (!db.objectStoreNames.contains(STORE_NOTEBOOKS)) {
                db.createObjectStore(STORE_NOTEBOOKS, { keyPath: 'id' });
            }

            if (!db.objectStoreNames.contains(STORE_TRACKS)) {
                const tracksStore = db.createObjectStore(STORE_TRACKS, { keyPath: 'id' });
                tracksStore.createIndex(INDEX_NOTEBOOK_ID, 'notebookId', { unique: false });
            }
        };

        request.onsuccess = (event) => {
            const db = event.target.result;

            db.onversionchange = () => {
                db.close();
                dbInstancePromise = null;
            };

            resolve(db);
        };

        request.onerror = (event) => {
            dbInstancePromise = null;
            reject(new Error(`Errore apertura IndexedDB: ${event.target.error?.message || 'sconosciuto'}`));
        };
    });

    return dbInstancePromise;
}

/**
 * Salva atomicamente un quaderno e la sua lista di tracce in un'unica transazione readwrite.
 */
async function saveNotebookWithTracks(notebookInfo, tracksList) {
    if (!notebookInfo || !notebookInfo.id) {
        throw new Error('notebookInfo deve contenere una chiave id valida.');
    }

    const db = await openDatabase();

    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_NOTEBOOKS, STORE_TRACKS], 'readwrite');
        const notebooksStore = tx.objectStore(STORE_NOTEBOOKS);
        const tracksStore = tx.objectStore(STORE_TRACKS);

        tx.onerror = (e) => reject(new Error(`Errore transazione saveNotebookWithTracks: ${e.target.error?.message}`));
        tx.oncomplete = () => resolve(true);

        const tracksCount = Array.isArray(tracksList) ? tracksList.length : (notebookInfo.trackCount || 0);

        const nbRecord = {
            id: notebookInfo.id,
            name: notebookInfo.name || notebookInfo.title || notebookInfo.id,
            fileSize: notebookInfo.fileSize || notebookInfo.size || 0,
            trackCount: tracksCount,
            updatedAt: notebookInfo.updatedAt || new Date().toISOString(),
            ghostTracksCount: notebookInfo.ghostTracksCount || 0
        };
        notebooksStore.put(nbRecord);

        if (Array.isArray(tracksList)) {
            for (const track of tracksList) {
                const trackId = track.id || track.uuid || `${notebookInfo.id}_${track.filename}`;
                
                let audioBlob = track.audioBlob;
                if (!audioBlob && track.fileData) {
                    audioBlob = new Blob([track.fileData], { type: 'audio/mp4' });
                }

                const trackRecord = {
                    id: trackId,
                    notebookId: notebookInfo.id,
                    uuid: track.uuid || trackId,
                    filename: track.filename || `${trackId}.m4a`,
                    cleanTitle: track.cleanTitle || track.title || 'Registrazione Senza Nome',
                    rawTitle: track.rawTitle || '',
                    duration: track.duration || 'N/A',
                    durationSeconds: track.durationSeconds || null,
                    recordingDate: track.recordingDate || track.dateDisplay || null,
                    dateDisplay: track.dateDisplay || 'N/A',
                    unixTimestamp: track.unixTimestamp || null,
                    size: track.size || (audioBlob ? audioBlob.size : 0),
                    sizeMb: track.sizeMb || (track.size ? (track.size / (1024 * 1024)).toFixed(2) : '0.00'),
                    audioBlob: audioBlob
                };

                tracksStore.put(trackRecord);
            }
        }
    });
}

/**
 * Restituisce l'elenco di tutti i quaderni salvati in biblioteca, ordinati dal più recente.
 */
async function getAllNotebooks() {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_NOTEBOOKS], 'readonly');
        const store = tx.objectStore(STORE_NOTEBOOKS);
        const req = store.getAll();

        req.onsuccess = () => {
            const list = req.result || [];
            list.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
            resolve(list);
        };

        req.onerror = (e) => reject(new Error(`Errore getAllNotebooks: ${e.target.error?.message}`));
    });
}

/**
 * Restituisce tutte le tracce audio appartenenti a un quaderno specifico.
 */
async function getTracksForNotebook(notebookId) {
    if (!notebookId) return [];

    const db = await openDatabase();

    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_TRACKS], 'readonly');
        const store = tx.objectStore(STORE_TRACKS);
        const index = store.index(INDEX_NOTEBOOK_ID);
        const req = index.getAll(notebookId);

        req.onsuccess = () => {
            const list = req.result || [];
            list.sort((a, b) => (a.unixTimestamp || 0) - (b.unixTimestamp || 0));
            resolve(list);
        };

        req.onerror = (e) => reject(new Error(`Errore getTracksForNotebook: ${e.target.error?.message}`));
    });
}

/**
 * Elimina atomicamente un quaderno e tutte le relative tracce audio memorizzate in IndexedDB.
 */
async function deleteNotebook(notebookId) {
    if (!notebookId) return false;

    const db = await openDatabase();

    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_NOTEBOOKS, STORE_TRACKS], 'readwrite');
        const notebooksStore = tx.objectStore(STORE_NOTEBOOKS);
        const tracksStore = tx.objectStore(STORE_TRACKS);
        const index = tracksStore.index(INDEX_NOTEBOOK_ID);

        tx.onerror = (e) => reject(new Error(`Errore deleteNotebook: ${e.target.error?.message}`));
        tx.oncomplete = () => resolve(true);

        notebooksStore.delete(notebookId);

        const keyReq = index.getAllKeys(notebookId);
        keyReq.onsuccess = () => {
            const trackKeys = keyReq.result || [];
            for (const key of trackKeys) {
                tracksStore.delete(key);
            }
        };
    });
}

/**
 * Recupera direttamente il Blob audio di una traccia specifica.
 */
async function getTrackAudioBlob(trackId) {
    if (!trackId) return null;

    const db = await openDatabase();

    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_TRACKS], 'readonly');
        const store = tx.objectStore(STORE_TRACKS);
        const req = store.get(trackId);

        req.onsuccess = () => {
            const track = req.result;
            if (track && track.audioBlob) {
                resolve(track.audioBlob);
            } else {
                resolve(null);
            }
        };

        req.onerror = (e) => reject(new Error(`Errore getTrackAudioBlob: ${e.target.error?.message}`));
    });
}

/**
 * COMPONENTE 4: Rimuove esclusivamente i Blob audio pesanti dalla tabella tracks,
 * preservando intatti tutti i metadati, nomi decodificati, durate e cronologia dei quaderni.
 */
async function purgeAudioBlobsOnly() {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_TRACKS], 'readwrite');
        const store = tx.objectStore(STORE_TRACKS);
        const req = store.openCursor();
        let purgedCount = 0;

        req.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                const track = cursor.value;
                if (track.audioBlob || track.fileData) {
                    track.audioBlob = null;
                    track.fileData = null;
                    cursor.update(track);
                    purgedCount++;
                }
                cursor.continue();
            } else {
                resolve({ purgedCount });
            }
        };

        req.onerror = (e) => reject(new Error(`Errore purgeAudioBlobsOnly: ${e.target.error?.message}`));
    });
}

/**
 * COMPONENTE 4: Interroga l'API standard navigator.storage.estimate()
 * per calcolare l'occupazione disco totale disponibile per l'app.
 */
async function getStorageQuota() {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
        try {
            const estimate = await navigator.storage.estimate();
            const usage = estimate.usage || 0;
            const quota = estimate.quota || 0;
            const usageMb = (usage / (1024 * 1024)).toFixed(1);
            const quotaMb = quota > 0 ? (quota / (1024 * 1024)).toFixed(0) : '0';
            const quotaGb = quota > 0 ? (quota / (1024 * 1024 * 1024)).toFixed(1) : '0';
            const percent = quota > 0 ? Math.min(100, Math.round((usage / quota) * 100)) : 0;
            return {
                usage,
                quota,
                usageMb,
                quotaMb,
                quotaGb,
                percent
            };
        } catch (err) {
            console.warn('[Storage] Errore stima quota:', err);
        }
    }
    return {
        usage: 0,
        quota: 0,
        usageMb: '0.0',
        quotaMb: '0',
        quotaGb: '0',
        percent: 0
    };
}

// Registrazione Ambiente Globale
const GoodnotesDB = {
    openDatabase,
    saveNotebookWithTracks,
    getAllNotebooks,
    getTracksForNotebook,
    deleteNotebook,
    getTrackAudioBlob,
    purgeAudioBlobsOnly,
    getStorageQuota
};

if (typeof globalThis !== 'undefined') {
    globalThis.GoodnotesDB = GoodnotesDB;
    globalThis.saveNotebookWithTracks = saveNotebookWithTracks;
    globalThis.getAllNotebooks = getAllNotebooks;
    globalThis.getTracksForNotebook = getTracksForNotebook;
    globalThis.deleteNotebook = deleteNotebook;
    globalThis.getTrackAudioBlob = getTrackAudioBlob;
    globalThis.purgeAudioBlobsOnly = purgeAudioBlobsOnly;
    globalThis.getStorageQuota = getStorageQuota;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = GoodnotesDB;
}
