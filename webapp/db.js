/**
 * ================================================================================
 * Goodnotes 6 AI Audio Exporter - IndexedDB Library Manager (Milestone 2)
 * ================================================================================
 * Wrapper ultra-leggero e robusto su IndexedDB:
 * - Database: GoodnotesLibraryDB (versione 1).
 * - Object Store 1: 'notebooks' (chiave: id).
 *   Metadati: { id, name, fileSize, updatedAt, trackCount, ghostTracksCount }.
 * - Object Store 2: 'tracks' (chiave: id, indice: notebookId).
 *   Metadati: { id, notebookId, uuid, filename, cleanTitle, rawTitle, duration,
 *               durationSeconds, recordingDate, dateDisplay, unixTimestamp, size,
 *               sizeMb, audioBlob }.
 * 
 * Funzioni esportate/globali:
 * - saveNotebookWithTracks(notebookInfo, tracksList)
 * - getAllNotebooks()
 * - getTracksForNotebook(notebookId)
 * - deleteNotebook(notebookId)
 * - getTrackAudioBlob(trackId)
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
 * Esegue la migrazione dello schema e crea gli indici necessari.
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

            // Store 'notebooks' con chiave primaria 'id'
            if (!db.objectStoreNames.contains(STORE_NOTEBOOKS)) {
                db.createObjectStore(STORE_NOTEBOOKS, { keyPath: 'id' });
            }

            // Store 'tracks' con chiave primaria 'id' e indice su 'notebookId'
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
 * 
 * @param {Object} notebookInfo - Metadati del quaderno ({ id, name, fileSize, ... })
 * @param {Array<Object>} tracksList - Elenco tracce audio con audioBlob
 * @returns {Promise<boolean>}
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

        // Prepara e memorizza il record del quaderno
        const nbRecord = {
            id: notebookInfo.id,
            name: notebookInfo.name || notebookInfo.title || notebookInfo.id,
            fileSize: notebookInfo.fileSize || notebookInfo.size || 0,
            trackCount: tracksCount,
            updatedAt: notebookInfo.updatedAt || new Date().toISOString(),
            ghostTracksCount: notebookInfo.ghostTracksCount || 0
        };
        notebooksStore.put(nbRecord);

        // Memorizza ciascuna traccia associata
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
 * 
 * @returns {Promise<Array<Object>>}
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
 * Restituisce tutte le tracce audio appartenenti a un quaderno specifico, ordinate cronologicamente.
 * 
 * @param {string} notebookId - ID del quaderno
 * @returns {Promise<Array<Object>>}
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
 * 
 * @param {string} notebookId - ID del quaderno da rimuovere
 * @returns {Promise<boolean>}
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

        // Cancella il record del quaderno
        notebooksStore.delete(notebookId);

        // Cancella tutte le tracce collegate recuperando le chiavi dall'indice
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
 * Recupera direttamente il Blob audio di una traccia specifica per la riproduzione o il download.
 * 
 * @param {string} trackId - ID della traccia
 * @returns {Promise<Blob|null>}
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

// ================================================================================
// REGISTRAZIONE AMBIENTE GLOBALE E COMPATIBILITÀ BROWSER / ESM / NODE
// ================================================================================

const GoodnotesDB = {
    openDatabase,
    saveNotebookWithTracks,
    getAllNotebooks,
    getTracksForNotebook,
    deleteNotebook,
    getTrackAudioBlob
};

if (typeof globalThis !== 'undefined') {
    globalThis.GoodnotesDB = GoodnotesDB;
    globalThis.saveNotebookWithTracks = saveNotebookWithTracks;
    globalThis.getAllNotebooks = getAllNotebooks;
    globalThis.getTracksForNotebook = getTracksForNotebook;
    globalThis.deleteNotebook = deleteNotebook;
    globalThis.getTrackAudioBlob = getTrackAudioBlob;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = GoodnotesDB;
}
