// ================================================================================
// GoodNotes 6 Audio Exporter & Renamer - Client-Side Logic (100% Offline PWA)
// Milestone 3: Apple HIG Frontend, Tactile Motion, Floating Audio Player & IDB Library
// ================================================================================

// Riferimenti agli elementi HTML principali
const dropZone = document.getElementById('file-drop-zone');
const fileInput = document.getElementById('goodnotes-file-input');
const folderInput = document.getElementById('folder-input');
const browseFolderBtn = document.getElementById('browse-folder-btn');
const loader = document.getElementById('app-loader');
const loaderStatus = document.getElementById('loader-status');
const loaderProgress = document.getElementById('loader-progress');
const resultsPanel = document.getElementById('results-panel');
const recordingsContainer = document.getElementById('recordings-container');
const notebookNameSpan = document.getElementById('notebook-name');
const notebookStatsSpan = document.getElementById('notebook-stats');
const downloadAllBtn = document.getElementById('download-all-btn');
const downloadFilesBtn = document.getElementById('download-files-btn');
const errorAlert = document.getElementById('error-alert');
const errorMessage = document.getElementById('error-message');

// Riferimenti alla Sezione Libreria Offline
const librarySection = document.getElementById('library-section');
const libraryToggleBtn = document.getElementById('library-toggle-btn');
const libraryBadgeCount = document.getElementById('library-badge-count');
const libraryCloseBtn = document.getElementById('library-close-btn');
const libraryList = document.getElementById('library-list');

// Riferimenti al Floating Audio Player
const floatingPlayer = document.getElementById('floating-audio-player');
const playerTrackTitle = document.getElementById('player-track-title');
const playerNotebookName = document.getElementById('player-notebook-name');
const playerCurrentTime = document.getElementById('player-current-time');
const playerTotalTime = document.getElementById('player-total-time');
const playerScrubber = document.getElementById('player-scrubber');
const playerProgressFill = document.getElementById('player-progress-fill');
const playerPlayBtn = document.getElementById('player-play-btn');
const playerPlaySvg = document.getElementById('player-play-svg');
const playerPauseSvg = document.getElementById('player-pause-svg');
const playerSkipBackBtn = document.getElementById('player-skip-back-btn');
const playerSkipForwardBtn = document.getElementById('player-skip-forward-btn');
const playerShareBtn = document.getElementById('player-share-btn');
const playerCloseBtn = document.getElementById('player-close-btn');
const speedPills = document.querySelectorAll('.speed-pill');

// Riferimenti Milestone 4 (Cloud Sync & Backend Bridge)
const connectionStatusPill = document.getElementById('connection-status-pill');
const connectionStatusText = document.getElementById('connection-status-text');
const backendQuickBanner = document.getElementById('backend-quick-banner');
const backendQuickScanActionBtn = document.getElementById('backend-quick-scan-action-btn');
const icloudMacScanBtn = document.getElementById('icloud-mac-scan-btn');
const cloudDirPickerBtn = document.getElementById('cloud-dir-picker-btn');
const icloudNotebooksModal = document.getElementById('icloud-notebooks-modal');
const icloudModalCloseBtn = document.getElementById('icloud-modal-close');
const icloudSearchInput = document.getElementById('icloud-search-input');
const icloudNotebooksList = document.getElementById('icloud-notebooks-list');

// Riferimenti Componenti 1-4 (Cloud Banner, Ricerca Istantanea, Quota Storage, iOS Guide)
const unifiedBrowseBtn = document.getElementById('unified-browse-btn');
const unifiedCloudBtn = document.getElementById('unified-cloud-btn');
const cloudPersistentBanner = document.getElementById('cloud-persistent-banner');
const cloudPersistentName = document.getElementById('cloud-persistent-name');
const cloudPersistentRescanBtn = document.getElementById('cloud-persistent-rescan-btn');
const iosFilesGuideModal = document.getElementById('ios-files-guide-modal');
const iosFilesGuideChooseBtn = document.getElementById('ios-files-guide-choose-btn');
const iosFilesGuideCloseBtn = document.getElementById('ios-files-guide-close-btn');
const cloudIosInfoModal = document.getElementById('cloud-ios-info-modal');
const cloudIosChooseBtn = document.getElementById('cloud-ios-choose-btn');
const cloudIosCloseBtn = document.getElementById('cloud-ios-close-btn');

// Supporto File System Access API
const supportsDirectoryPicker = typeof window.showDirectoryPicker === 'function';

function updateCloudButtonVisibility() {
    if (!unifiedCloudBtn) return;
    unifiedCloudBtn.style.display = 'inline-flex';
}
updateCloudButtonVisibility();

const trackSearchBar = document.getElementById('track-search-bar');
const trackSearchInput = document.getElementById('track-search-input');
const trackSearchClearBtn = document.getElementById('track-search-clear-btn');
const trackSearchCount = document.getElementById('track-search-count');

const storageQuotaContainer = document.getElementById('storage-quota-container');
const storageQuotaText = document.getElementById('storage-quota-text');
const storageProgressBar = document.getElementById('storage-progress-bar');
const purgeAudioBtn = document.getElementById('purge-audio-btn');

let backendConnectionState = { connected: false, origin: null, data: null };
let icloudCachedNotebooks = [];

// Stato dell'applicazione in memoria
let activeNotebookData = null;
let currentLang = 'it';

// ================================================================================
// GESTORE DEL FLOATING AUDIO PLAYER (APPLE HIG & TACTILE AUDIO PLAYBACK)
// ================================================================================

class FloatingPlayerManager {
    constructor() {
        this.audio = new Audio();
        this.currentTrack = null;
        this.currentTrackIndex = null;
        this.tracksList = [];
        this.notebookName = '';
        this.isUserScrubbing = false;
        this.currentAudioUrl = null;

        // Recupera velocità salvata in precedenza (Componente 3)
        const savedSpeed = parseFloat(localStorage.getItem('gn_playback_speed') || '1');
        this.playbackRate = (!isNaN(savedSpeed) && savedSpeed > 0) ? savedSpeed : 1.0;

        this.initEventListeners();
        this.setPlaybackRate(this.playbackRate);
    }

    initEventListeners() {
        // Aggiornamento tempo e avanzamento continuo
        this.audio.addEventListener('timeupdate', () => {
            if (!this.isUserScrubbing && this.audio.duration) {
                const current = this.audio.currentTime;
                const duration = this.audio.duration;
                const percent = (current / duration) * 100;

                playerCurrentTime.innerText = this.formatTime(current);
                playerScrubber.value = percent;
                playerProgressFill.style.width = `${percent}%`;

                this.updateMediaSessionPositionState();
            }
        });

        // Metadati caricati (durata totale esatta)
        this.audio.addEventListener('loadedmetadata', () => {
            if (this.audio.duration) {
                playerTotalTime.innerText = this.formatTime(this.audio.duration);
                this.updateMediaSessionPositionState();
            }
        });

        // Fine traccia: passa alla successiva o resetta
        this.audio.addEventListener('ended', () => {
            if (this.currentTrackIndex !== null && this.currentTrackIndex + 1 < this.tracksList.length) {
                this.playTrackAtIndex(this.currentTrackIndex + 1);
            } else {
                this.setPlayState(false);
                playerScrubber.value = 0;
                playerProgressFill.style.width = '0%';
                playerCurrentTime.innerText = '0:00';
            }
        });

        // Gestione errori di riproduzione
        this.audio.addEventListener('error', (e) => {
            console.error('[AudioPlayer] Errore riproduzione:', e);
            this.setPlayState(false);
        });

        // Scrubber interattivo: input continuo durante il trascinamento touch / mouse
        playerScrubber.addEventListener('input', () => {
            this.isUserScrubbing = true;
            if (this.audio.duration) {
                const targetTime = (playerScrubber.value / 100) * this.audio.duration;
                playerCurrentTime.innerText = this.formatTime(targetTime);
                playerProgressFill.style.width = `${playerScrubber.value}%`;
            }
        });

        // Rilascio scrubber: seek istantaneo preciso
        playerScrubber.addEventListener('change', () => {
            if (this.audio.duration) {
                const targetTime = (playerScrubber.value / 100) * this.audio.duration;
                this.audio.currentTime = targetTime;
            }
            this.isUserScrubbing = false;
        });

        // Play / Pausa
        playerPlayBtn.addEventListener('click', () => {
            this.togglePlayPause();
        });

        // Salta indietro 15 secondi
        playerSkipBackBtn.addEventListener('click', () => {
            this.skip(-15);
        });

        // Salta avanti 15 secondi
        playerSkipForwardBtn.addEventListener('click', () => {
            this.skip(15);
        });

        // Selettore velocità pillole (0.75x, 1x, 1.25x, 1.5x, 2x)
        speedPills.forEach(pill => {
            pill.addEventListener('click', () => {
                const speed = parseFloat(pill.dataset.speed || '1');
                this.setPlaybackRate(speed);
            });
        });

        // Condivisione con Web Share API o fallback
        playerShareBtn.addEventListener('click', () => {
            this.shareCurrentTrack();
        });

        // Chiusura player
        playerCloseBtn.addEventListener('click', () => {
            this.closePlayer();
        });
    }

    formatTime(seconds) {
        if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    setPlaybackRate(rate) {
        this.playbackRate = rate;
        this.audio.playbackRate = rate;
        speedPills.forEach(p => {
            p.classList.toggle('active', parseFloat(p.dataset.speed) === rate);
        });
        try {
            localStorage.setItem('gn_playback_speed', rate.toString());
        } catch (e) {}
    }

    skip(seconds) {
        if (!this.audio.duration) return;
        const newTime = Math.min(Math.max(0, this.audio.currentTime + seconds), this.audio.duration);
        this.audio.currentTime = newTime;
        const percent = (newTime / this.audio.duration) * 100;
        playerScrubber.value = percent;
        playerProgressFill.style.width = `${percent}%`;
        playerCurrentTime.innerText = this.formatTime(newTime);
        this.updateMediaSessionPositionState();
    }

    setPlayState(isPlaying) {
        if (isPlaying) {
            playerPlaySvg.style.display = 'none';
            playerPauseSvg.style.display = 'block';
            playerPlayBtn.setAttribute('title', 'Metti in pausa');
        } else {
            playerPlaySvg.style.display = 'block';
            playerPauseSvg.style.display = 'none';
            playerPlayBtn.setAttribute('title', 'Riproduci');
        }

        // Aggiorna icone ed equalizzatore nei singoli elementi della lista (Componente 2)
        if (this.currentTrackIndex !== null) {
            const listBtn = document.getElementById(`play-btn-${this.currentTrackIndex}`);
            if (listBtn) {
                listBtn.innerHTML = isPlaying ? getPauseIconSvg() : getPlayIconSvg();
            }
            const itemElem = listBtn?.closest('.recording-item');
            if (itemElem) {
                itemElem.classList.toggle('is-playing', isPlaying);
                itemElem.classList.toggle('is-paused', !isPlaying);
                const indicator = itemElem.querySelector('.audio-playing-indicator');
                if (indicator) {
                    indicator.style.display = isPlaying ? 'inline-flex' : 'none';
                }
            }
        }
    }

    togglePlayPause() {
        if (!this.currentTrack) return;
        if (this.audio.paused) {
            this.audio.play().then(() => {
                this.setPlayState(true);
            }).catch(e => {
                console.error('[AudioPlayer] Playback fallito:', e);
            });
        } else {
            this.audio.pause();
            this.setPlayState(false);
        }
    }

    async playTrackAtIndex(index, tracksList = null, notebookName = '') {
        if (tracksList) {
            this.tracksList = tracksList;
        }
        if (notebookName) {
            this.notebookName = notebookName;
        }

        if (!this.tracksList || !this.tracksList[index]) return;

        // Se è la stessa traccia attualmente caricata, fai toggle
        if (this.currentTrackIndex === index && this.currentTrack) {
            this.togglePlayPause();
            return;
        }

        // Resetta lo stato visivo della traccia precedente nella lista
        if (this.currentTrackIndex !== null) {
            const oldBtn = document.getElementById(`play-btn-${this.currentTrackIndex}`);
            if (oldBtn) oldBtn.innerHTML = getPlayIconSvg();
            const oldItem = oldBtn?.closest('.recording-item');
            if (oldItem) {
                oldItem.classList.remove('is-playing', 'is-paused');
                const oldInd = oldItem.querySelector('.audio-playing-indicator');
                if (oldInd) oldInd.style.display = 'none';
            }
        }

        const track = this.tracksList[index];
        this.currentTrack = track;
        this.currentTrackIndex = index;

        // Recupera il Blob audio (da memoria o da IndexedDB)
        let blob = track.audioBlob;
        if (!blob && track.fileData) {
            blob = new Blob([track.fileData], { type: 'audio/mp4' });
            track.audioBlob = blob;
        }
        if (!blob && typeof GoodnotesDB !== 'undefined' && track.id) {
            try {
                blob = await GoodnotesDB.getTrackAudioBlob(track.id);
                track.audioBlob = blob;
            } catch (err) {
                console.warn('[AudioPlayer] Impossibile recuperare blob da IndexedDB:', err);
            }
        }
        if (!blob && track.audioUrl) {
            if (this.currentAudioUrl && this.currentAudioUrl.startsWith('blob:')) {
                URL.revokeObjectURL(this.currentAudioUrl);
            }
            this.currentAudioUrl = track.audioUrl;
            this.audio.src = this.currentAudioUrl;
            this.audio.playbackRate = this.playbackRate;

            const titleText = track.cleanTitle || track.titleClean || track.filename;
            playerTrackTitle.innerText = titleText;
            playerNotebookName.innerText = this.notebookName || 'Goodnotes Audio';
            playerCurrentTime.innerText = '0:00';
            playerTotalTime.innerText = track.duration || '0:00';
            playerScrubber.value = 0;
            playerProgressFill.style.width = '0%';

            floatingPlayer.style.display = 'block';
            this.audio.play().then(() => {
                this.setPlayState(true);
                this.setupMediaSession();
            }).catch(err => {
                console.warn('[AudioPlayer] Autoplay bloccato:', err);
                this.setPlayState(false);
            });
            return;
        }

        if (!blob) {
            showError('Impossibile riprodurre la traccia: dati audio non disponibili.');
            return;
        }

        // Libera URL blob precedente se esisteva
        if (this.currentAudioUrl) {
            URL.revokeObjectURL(this.currentAudioUrl);
        }
        this.currentAudioUrl = URL.createObjectURL(blob);
        this.audio.src = this.currentAudioUrl;
        this.audio.playbackRate = this.playbackRate;

        // Aggiorna interfaccia utente del player
        const titleText = track.cleanTitle || track.titleClean || track.filename;
        playerTrackTitle.innerText = titleText;
        playerNotebookName.innerText = this.notebookName || 'Goodnotes Audio';
        playerCurrentTime.innerText = '0:00';
        playerTotalTime.innerText = track.duration || '0:00';
        playerScrubber.value = 0;
        playerProgressFill.style.width = '0%';

        // Mostra il floating player docked
        floatingPlayer.style.display = 'block';

        // Avvia riproduzione
        this.audio.play().then(() => {
            this.setPlayState(true);
            this.setupMediaSession();
        }).catch(err => {
            console.warn('[AudioPlayer] Autoplay bloccato:', err);
            this.setPlayState(false);
        });
    }

    // Integrazione completa con Apple MediaSession API
    setupMediaSession() {
        if (!('mediaSession' in navigator) || !this.currentTrack) return;

        const title = this.currentTrack.cleanTitle || this.currentTrack.filename;
        navigator.mediaSession.metadata = new MediaMetadata({
            title: title,
            artist: 'Goodnotes',
            album: this.notebookName || 'Lezioni Goodnotes',
            artwork: [
                { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
                { src: 'apple-touch-icon.png', sizes: '180x180', type: 'image/png' }
            ]
        });

        // Controlli MediaSession
        try {
            navigator.mediaSession.setActionHandler('play', () => this.togglePlayPause());
            navigator.mediaSession.setActionHandler('pause', () => this.togglePlayPause());
            navigator.mediaSession.setActionHandler('seekbackward', () => this.skip(-15));
            navigator.mediaSession.setActionHandler('seekforward', () => this.skip(15));
            navigator.mediaSession.setActionHandler('seekto', (details) => {
                if (details.seekTime !== undefined && this.audio.duration) {
                    this.audio.currentTime = details.seekTime;
                }
            });
            navigator.mediaSession.setActionHandler('previoustrack', () => {
                if (this.currentTrackIndex > 0) {
                    this.playTrackAtIndex(this.currentTrackIndex - 1);
                }
            });
            navigator.mediaSession.setActionHandler('nexttrack', () => {
                if (this.currentTrackIndex + 1 < this.tracksList.length) {
                    this.playTrackAtIndex(this.currentTrackIndex + 1);
                }
            });
        } catch (e) {
            console.warn('[MediaSession] Handler parziale:', e);
        }
    }

    updateMediaSessionPositionState() {
        if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
        if (this.audio.duration && !isNaN(this.audio.duration) && this.audio.duration > 0) {
            try {
                navigator.mediaSession.setPositionState({
                    duration: this.audio.duration,
                    playbackRate: this.audio.playbackRate,
                    position: Math.min(this.audio.currentTime, this.audio.duration)
                });
            } catch (e) {}
        }
    }

    // Condivisione nativa Apple Web Share API
    async shareCurrentTrack() {
        if (!this.currentTrack) return;
        const track = this.currentTrack;
        let blob = track.audioBlob;
        if (!blob && track.fileData) {
            blob = new Blob([track.fileData], { type: 'audio/mp4' });
        }

        if (!blob) {
            downloadSingleTrack(this.currentTrackIndex);
            return;
        }

        const fileName = track.filename.endsWith('.m4a') ? track.filename : `${track.filename}.m4a`;
        const file = new File([blob], fileName, { type: 'audio/mp4' });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    files: [file],
                    title: track.cleanTitle || track.filename,
                    text: `Registrazione audio Goodnotes: ${track.cleanTitle || track.filename}`
                });
                return;
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.warn('[WebShare] Condivisione fallita, fallback su download:', err);
                    downloadSingleTrack(this.currentTrackIndex);
                }
                return;
            }
        }

        // Fallback su download
        downloadSingleTrack(this.currentTrackIndex);
    }

    closePlayer() {
        this.audio.pause();
        this.setPlayState(false);
        if (this.currentAudioUrl) {
            URL.revokeObjectURL(this.currentAudioUrl);
            this.currentAudioUrl = null;
        }
        if (this.currentTrackIndex !== null) {
            const btn = document.getElementById(`play-btn-${this.currentTrackIndex}`);
            if (btn) btn.innerHTML = getPlayIconSvg();
            const item = btn?.closest('.recording-item');
            if (item) {
                item.classList.remove('is-playing', 'is-paused');
                const ind = item.querySelector('.audio-playing-indicator');
                if (ind) ind.style.display = 'none';
            }
        }
        this.currentTrack = null;
        this.currentTrackIndex = null;
        floatingPlayer.style.display = 'none';
    }
}

// Istanza singleton del player
const playerManager = new FloatingPlayerManager();

// ================================================================================
// COSTANTI, ACRONIMI E TABELLE DI RICONOSCIMENTO LINGUISTICO
// ================================================================================

const WHITELIST_ACRONYMS = new Set([
    "ECG", "BPCO", "SCA", "RCU", "CEC", "PAD", "RR", "IFP"
]);

const SUBJECT_PREFIXES = new Set([
    "CV:", "CC:", "CT:", "SMED:", "ANTROPO:", "POLM:"
]);

const ITALIAN_ACCENTED_CHARS = new Set(["à", "è", "é", "ì", "ò", "ù", "À", "È", "É", "Ì", "Ò", "Ù"]);

const ITALIAN_STOPWORDS = new Set([
    "di", "del", "della", "delle", "dei", "degli", "il", "lo", "la", "i", "gli", "le",
    "un", "uno", "una", "e", "ed", "in", "su", "per", "con", "tra", "fra", "da", "dal",
    "dalla", "non", "intro", "comunicazione", "medico", "paziente", "lezione", "corso",
    "esame", "clinica", "clinico", "sindrome", "patologia", "patologie", "arteriti",
    "aneurismi", "tiroide", "paratiroide", "cuore", "polmone", "polmonare", "polmonari",
    "mortalita", "mortalità", "storia", "antica", "grecia", "morte", "inizio"
]);

const CAESAR_TARGET_KEYWORDS = new Set([
    "aterosclerosi", "necrosi", "tumori", "vescica", "cistiti", "patologie",
    "polmonari", "ostruzione", "restrizione", "infettive", "cardiopatie",
    "infarto", "angina", "prostata", "arteriti", "aneurismi", "tiroide",
    "paratiroide", "ipertensione"
]);

const MAC_TO_UNIX_OFFSET = 2082844800;

// Dizionario delle traduzioni per internazionalizzazione (IT / EN)
const TRANSLATIONS = {
    it: {
        title: "GoodNotes Audio Exporter",
        subtitle: "Estrai, decifra e rinomina le tue lezioni audio in totale privacy",
        dropzoneTitle: "Trascina qui il tuo quaderno .goodnotes",
        dropzoneSubtitle: "oppure tocca per sfogliare i tuoi file",
        browseFolder: "Sfoglia intera cartella",
        libraryBtn: "Libreria",
        libraryTitle: "Libreria Locale Offline",
        librarySubtitle: "I quaderni e le registrazioni audio precedentemente estratti e memorizzati in locale",
        libraryEmpty: "Nessun quaderno salvato in memoria locale. Trascina un file per iniziare.",
        openNotebook: "Apri Quaderno",
        deleteNotebook: "Elimina",
        confirmDeleteNotebook: "Vuoi eliminare questo quaderno e le relative registrazioni dalla memoria locale?",
        loaderExtracting: "Lettura ed estrazione del pacchetto .goodnotes in corso...",
        loaderParsing: "Analisi del database index.events.pb...",
        loaderScanning: "Scansione dei file audio e analisi delle date...",
        loaderFinalizing: "Preparazione del download delle tracce...",
        loaderZipProgress: "Creazione del pacchetto ZIP finale in corso...",
        loaderZipCompressing: "Compressione finale dello ZIP...",
        zipButton: "Scarica tutto (.zip)",
        filesButton: "Scarica m4a singoli",
        unnamedRecording: "Registrazione Senza Nome",
        clipAudio: "Clip Audio",
        errorInvalidFile: "File non valido. Si prega di trascinare un file di tipo .goodnotes o .zip.",
        errorNoFolderFiles: "Nessun file .goodnotes o .zip valido trovato nella cartella selezionata.",
        errorNoEvents: "Il file caricato non sembra un quaderno Goodnotes valido (manca index.events.pb).",
        errorNoFolder: "Nessuna cartella attachments trovata nel quaderno. Non ci sono registrazioni.",
        errorNoAudio: "Nessuna registrazione audio attiva trovata all'interno del quaderno.",
        errorZip: "Errore durante la creazione dello ZIP: ",
        errorDownload: "Errore durante il download delle tracce: ",
        trackTag: "Traccia",
        dateTag: "Data",
        durationTag: "Durata",
        weightTag: "Peso",
        statsSuffix: "registrazioni audio estratte (duplicati rimossi)",
        footerText: "Disegnato e sviluppato in locale al 100% offline. Sincronizzazione automatica con iCloud attiva.",
        downloadSingle: "Scarica traccia singola",
        downloadingSingle: "Download in corso: ",
        playAudio: "Ascolta traccia",
        pauseAudio: "Metti in pausa",
        pwaBannerBadge: "PWA Apple Light & Dark",
        pwaBannerTitle: "Aggiungi a Schermata Home / Desktop",
        pwaBannerDesc: "Usa l'app a schermo intero e offline in totale privacy.",
        pwaInstallBtn: "Installa",
        pwaDismissBtn: "Non ora",
        pwaIosTitle: "Aggiungi a Schermata Home",
        pwaIosDesc: "Installa l'app su iPhone o iPad per accedere direttamente dalla tua schermata Home in modalità standalone 100% offline.",
        pwaIosStep1: "Tocca il pulsante Condividi",
        pwaIosStep1Suffix: "nella barra inferiore di Safari.",
        pwaIosStep2: "Scorri verso il basso e tocca \"Aggiungi alla schermata Home\"",
        pwaIosStep3: "Conferma toccando \"Aggiungi\" in alto a destra. L'app apparirà sulla tua Home!",
        pwaIosDismiss: "Ho capito",
        statusStandalone: "Standalone Offline",
        statusConnected: "Mac Backend Attivo",
        statusPillTitleConnected: "Connesso al backend Mac (Zero-Space iCloud attivo)",
        statusPillTitleStandalone: "Modalità di elaborazione attiva in locale nel browser (100% Offline)",
        cloudDirPickerLabel: "Collega Cloud Drive",
        icloudMacScanLabel: "Scansione Rapida iCloud Mac (Zero-Space)",
        backendBannerTitle: "Backend Mac Rilevato",
        backendBannerDesc: "Accedi direttamente ai quaderni di iCloud Drive senza dover fare drag & drop.",
        backendBannerBtn: "Sfoglia Quaderni Mac",
        icloudModalTitle: "Quaderni iCloud Drive (Mac)",
        icloudModalDesc: "Seleziona un quaderno per estrarre e decodificare le registrazioni in memoria (Zero-Space).",
        noICloudNotebooksFound: "Nessun quaderno .goodnotes trovato su iCloud Drive Mac.",
        loadAndExtractBtn: "Carica ed Estrai"
    },
    en: {
        title: "GoodNotes Audio Exporter",
        subtitle: "Extract, decrypt and rename your audio lectures in total privacy",
        dropzoneTitle: "Drag and drop your .goodnotes notebook here",
        dropzoneSubtitle: "or tap to browse your files",
        browseFolder: "Browse full folder",
        libraryBtn: "Library",
        libraryTitle: "Offline Local Library",
        librarySubtitle: "Notebooks and audio recordings previously extracted and saved locally",
        libraryEmpty: "No notebooks saved locally. Drag a file to get started.",
        openNotebook: "Open Notebook",
        deleteNotebook: "Delete",
        confirmDeleteNotebook: "Do you want to delete this notebook and its recordings from local storage?",
        loaderExtracting: "Reading and extracting the .goodnotes package...",
        loaderParsing: "Analyzing the index.events.pb database...",
        loaderScanning: "Scanning audio files and analyzing dates...",
        loaderFinalizing: "Preparing track download...",
        loaderZipProgress: "Creating the final ZIP package...",
        loaderZipCompressing: "Final compression of the ZIP file...",
        zipButton: "Download all (.zip)",
        filesButton: "Download single m4as",
        unnamedRecording: "Unnamed Recording",
        clipAudio: "Audio Clip",
        errorInvalidFile: "Invalid file. Please drag and drop a .goodnotes or .zip file only.",
        errorNoFolderFiles: "No valid .goodnotes or .zip files found in selected folder.",
        errorNoEvents: "The uploaded file does not seem to be a valid Goodnotes notebook (missing index.events.pb).",
        errorNoFolder: "No attachments folder found in the notebook. There are no recordings.",
        errorNoAudio: "No active audio recordings found in the notebook.",
        errorZip: "Error while creating ZIP: ",
        errorDownload: "Error while downloading tracks: ",
        trackTag: "Track",
        dateTag: "Date",
        durationTag: "Duration",
        weightTag: "Size",
        statsSuffix: "audio recordings extracted (duplicates removed)",
        footerText: "Designed and developed 100% locally offline. Automatic iCloud sync active.",
        downloadSingle: "Download single track",
        downloadingSingle: "Downloading: ",
        playAudio: "Play track",
        pauseAudio: "Pause",
        pwaBannerBadge: "PWA Apple Light & Dark",
        pwaBannerTitle: "Add to Home Screen / Desktop",
        pwaBannerDesc: "Use the app in fullscreen and 100% offline in total privacy.",
        pwaInstallBtn: "Install",
        pwaDismissBtn: "Not now",
        pwaIosTitle: "Add to Home Screen",
        pwaIosDesc: "Install the app on iPhone or iPad to open directly from your Home Screen in 100% offline standalone mode.",
        pwaIosStep1: "Tap the Share button",
        pwaIosStep1Suffix: "in the bottom bar of Safari.",
        pwaIosStep2: "Scroll down and tap \"Add to Home Screen\"",
        pwaIosStep3: "Confirm by tapping \"Add\" in the top right. The app will appear on your Home Screen!",
        pwaIosDismiss: "Got it",
        statusStandalone: "Standalone Offline",
        statusConnected: "Mac Backend Active",
        statusPillTitleConnected: "Connected to Mac backend (Zero-Space iCloud active)",
        statusPillTitleStandalone: "Processing active locally in browser (100% Offline)",
        cloudDirPickerLabel: "Connect Cloud Drive",
        icloudMacScanLabel: "Quick iCloud Mac Scan (Zero-Space)",
        backendBannerTitle: "Mac Backend Detected",
        backendBannerDesc: "Access notebooks directly from iCloud Drive without drag & drop.",
        backendBannerBtn: "Browse Mac Notebooks",
        icloudModalTitle: "iCloud Drive Notebooks (Mac)",
        icloudModalDesc: "Select a notebook to extract and decode recordings in-memory (Zero-Space).",
        noICloudNotebooksFound: "No .goodnotes notebooks found on Mac iCloud Drive.",
        loadAndExtractBtn: "Load & Extract"
    }
};

function applyLanguage(langCode) {
    currentLang = langCode;
    const l = TRANSLATIONS[langCode];
    
    document.getElementById('lang-btn-it').classList.toggle('active', langCode === 'it');
    document.getElementById('lang-btn-en').classList.toggle('active', langCode === 'en');
    
    document.getElementById('app-title').innerText = l.title;
    document.getElementById('app-subtitle').innerText = l.subtitle;
    
    const dropzoneTitle = document.getElementById('dropzone-title');
    const dropzoneSubtitle = document.getElementById('dropzone-subtitle');
    const browseFolderLabel = document.getElementById('browse-folder-label');
    const libraryBtnLabel = document.getElementById('library-btn-label');
    const libraryTitleElem = document.getElementById('library-title');
    const librarySubtitleElem = document.getElementById('library-subtitle');
    const footerTextElem = document.getElementById('footer-text');

    if (dropzoneTitle) dropzoneTitle.innerText = l.dropzoneTitle;
    if (dropzoneSubtitle) dropzoneSubtitle.innerText = l.dropzoneSubtitle;
    if (browseFolderLabel) browseFolderLabel.innerText = l.browseFolder;
    if (libraryBtnLabel) libraryBtnLabel.innerText = l.libraryBtn;
    if (libraryTitleElem) libraryTitleElem.innerText = l.libraryTitle;
    if (librarySubtitleElem) librarySubtitleElem.innerText = l.librarySubtitle;
    if (footerTextElem) footerTextElem.innerText = l.footerText;
    
    const downloadZipBtn = document.getElementById('download-all-btn');
    const downloadM4aBtn = document.getElementById('download-files-btn');
    
    if (downloadZipBtn) {
        const svg = downloadZipBtn.querySelector('svg');
        downloadZipBtn.innerHTML = '';
        if (svg) downloadZipBtn.appendChild(svg);
        downloadZipBtn.appendChild(document.createTextNode(' ' + l.zipButton));
    }
    
    if (downloadM4aBtn) {
        const svg = downloadM4aBtn.querySelector('svg');
        downloadM4aBtn.innerHTML = '';
        if (svg) downloadM4aBtn.appendChild(svg);
        downloadM4aBtn.appendChild(document.createTextNode(' ' + l.filesButton));
    }
    
    const pwaTitle = document.getElementById('pwa-banner-title');
    const pwaDesc = document.getElementById('pwa-banner-desc');
    const pwaBtnText = document.getElementById('pwa-banner-btn-text');
    const pwaHeaderLabel = document.getElementById('pwa-header-install-label');
    const iosTitle = document.getElementById('ios-modal-title');
    const iosDesc = document.getElementById('ios-modal-desc');
    const iosDismiss = document.getElementById('pwa-ios-modal-dismiss');
    const iosStep1 = document.getElementById('ios-step-1');
    const iosStep2 = document.getElementById('ios-step-2');
    const iosStep3 = document.getElementById('ios-step-3');

    if (pwaTitle) pwaTitle.innerText = l.pwaBannerTitle;
    if (pwaDesc) pwaDesc.innerText = l.pwaBannerDesc;
    if (pwaBtnText) pwaBtnText.innerText = l.pwaInstallBtn;
    if (pwaHeaderLabel) pwaHeaderLabel.innerText = l.pwaInstallBtn;
    if (iosTitle) iosTitle.innerText = l.pwaIosTitle;
    if (iosDesc) iosDesc.innerText = l.pwaIosDesc;
    if (iosDismiss) iosDismiss.innerText = l.pwaIosDismiss;
    if (iosStep1) iosStep1.innerText = l.pwaIosStep1;
    if (iosStep2) iosStep2.innerHTML = l.pwaIosStep2;
    if (iosStep3) iosStep3.innerHTML = l.pwaIosStep3;

    const cloudDirPickerLabel = document.getElementById('cloud-dir-picker-label');
    const icloudMacScanLabel = document.getElementById('icloud-mac-scan-label');
    const backendBannerTitle = document.getElementById('backend-banner-title');
    const backendBannerDesc = document.getElementById('backend-banner-desc');
    const backendBannerBtnText = document.getElementById('backend-banner-btn-text');
    const icloudModalTitle = document.getElementById('icloud-modal-title');
    const icloudModalDesc = document.getElementById('icloud-modal-desc');

    if (cloudDirPickerLabel) cloudDirPickerLabel.innerText = l.cloudDirPickerLabel;
    if (icloudMacScanLabel) icloudMacScanLabel.innerText = l.icloudMacScanLabel;
    if (backendBannerTitle) backendBannerTitle.innerText = l.backendBannerTitle;
    if (backendBannerDesc) backendBannerDesc.innerText = l.backendBannerDesc;
    if (backendBannerBtnText) backendBannerBtnText.innerText = l.backendBannerBtn;
    if (icloudModalTitle) icloudModalTitle.innerText = l.icloudModalTitle;
    if (icloudModalDesc) icloudModalDesc.innerText = l.icloudModalDesc;
    if (typeof updateBackendUIState === 'function') updateBackendUIState();

    if (activeNotebookData) {
        renderResults();
    }
}

// ================================================================================
// DECODIFICA DEL CIFRARIO DI CESARE E PULIZIA TITOLI
// ================================================================================

function isLikelyItalianWord(word) {
    const cleanW = word.toLowerCase().replace(/[^a-zàèéìòù]/g, '');
    if (cleanW.length < 2) return false;
    return ITALIAN_STOPWORDS.has(cleanW);
}

function containsTargetKeyword(text) {
    const words = text.toLowerCase().split(/[^a-zàèéìòù0-9]+/);
    for (const w of words) {
        if (CAESAR_TARGET_KEYWORDS.has(w)) return true;
    }
    return false;
}

function countTargetKeywords(text) {
    const words = text.toLowerCase().split(/[^a-zàèéìòù0-9]+/);
    let count = 0;
    for (const w of words) {
        if (CAESAR_TARGET_KEYWORDS.has(w)) count++;
    }
    return count;
}

function isAlreadyPlainText(text) {
    if (containsTargetKeyword(text)) return true;
    const words = text.split(/[\s_\-–—]+/);
    let italianHits = 0;
    let validWords = 0;
    for (const w of words) {
        if (w.length >= 2) {
            validWords++;
            if (isLikelyItalianWord(w)) italianHits++;
        }
    }
    return validWords > 0 && (italianHits / validWords) >= 0.3;
}

function caesarShift(text, shift) {
    let result = '';
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (ITALIAN_ACCENTED_CHARS.has(char)) {
            result += char;
            continue;
        }
        const code = text.charCodeAt(i);
        if (code >= 65 && code <= 90) {
            result += String.fromCharCode(((code - 65 - shift + 26) % 26) + 65);
        } else if (code >= 97 && code <= 122) {
            result += String.fromCharCode(((code - 97 - shift + 26) % 26) + 97);
        } else {
            result += char;
        }
    }
    return result;
}

function findBestCaesarShift(text) {
    if (isAlreadyPlainText(text)) return 0;
    let bestShift = 0;
    let maxKeywordMatches = 0;

    for (let shift = 1; shift < 26; shift++) {
        const candidate = caesarShift(text, shift);
        const matches = countTargetKeywords(candidate);
        if (matches > maxKeywordMatches) {
            maxKeywordMatches = matches;
            bestShift = shift;
        }
    }
    if (maxKeywordMatches > 0) return bestShift;

    let bestItalianScore = 0;
    for (let shift = 1; shift < 26; shift++) {
        const candidate = caesarShift(text, shift);
        const words = candidate.split(/[\s_\-–—]+/);
        let score = 0;
        for (const w of words) {
            if (isLikelyItalianWord(w)) score++;
        }
        if (score > bestItalianScore) {
            bestItalianScore = score;
            bestShift = shift;
        }
    }
    return bestItalianScore >= 2 ? bestShift : 0;
}

function decodeCaesar(text) {
    const shift = findBestCaesarShift(text);
    return shift === 0 ? text : caesarShift(text, shift);
}

function cleanTitle(raw) {
    if (!raw) return TRANSLATIONS[currentLang].unnamedRecording;
    let decoded = decodeCaesar(raw);
    let working = decoded.replace(/\.m4a$/i, '').trim();

    for (const prefix of SUBJECT_PREFIXES) {
        if (working.toUpperCase().startsWith(prefix)) {
            working = prefix + working.substring(prefix.length).trim();
            break;
        }
    }

    const segments = working.split(':');
    let prefixPart = '';
    let mainPart = working;

    if (segments.length > 1 && SUBJECT_PREFIXES.has(segments[0].trim().toUpperCase() + ':')) {
        prefixPart = segments[0].trim().toUpperCase() + ': ';
        mainPart = segments.slice(1).join(':').trim();
    }

    const words = mainPart.split(/\s+/);
    const capitalizedWords = words.map(w => {
        const upper = w.toUpperCase();
        if (WHITELIST_ACRONYMS.has(upper)) return upper;
        if (w.length > 0) {
            return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        }
        return w;
    });

    const finalTitle = prefixPart + capitalizedWords.join(' ');
    return finalTitle.replace(/[\\/:*?"<>|]/g, '-').trim();
}

function buildExportFilename(cleanName, datePrefix, ext = 'm4a') {
    const safeTitle = (cleanName || TRANSLATIONS[currentLang].unnamedRecording).replace(/[\\/:*?"<>|]/g, '-').trim();
    if (datePrefix) {
        return `${datePrefix}_${safeTitle}.${ext}`;
    }
    return `${safeTitle}.${ext}`;
}

// ================================================================================
// GESTIONE DEL WEB WORKER PER ZERO-FREEZE BACKGROUND PROCESSING
// ================================================================================

let appWorker = null;

function getWorker() {
    if (!appWorker) {
        appWorker = new Worker('worker.js');
    }
    return appWorker;
}

// ================================================================================
// LIBRERIA OFFLINE PERSISTENTE (INDEXEDDB)
// ================================================================================

async function initLibrary() {
    if (typeof GoodnotesDB === 'undefined') return;

    try {
        const notebooks = await GoodnotesDB.getAllNotebooks();
        updateLibraryBadge(notebooks.length);
        renderLibraryCards(notebooks);
        updateStorageQuotaDisplay();
    } catch (err) {
        console.warn('[Library] Impossibile caricare quaderni da IndexedDB:', err);
    }
}

async function updateStorageQuotaDisplay() {
    if (typeof GoodnotesDB === 'undefined' || !storageQuotaText || !storageProgressBar) return;
    try {
        const quota = await GoodnotesDB.getStorageQuota();
        if (quota) {
            storageQuotaText.innerText = `${quota.usageFormatted} di ${quota.quotaFormatted} (${quota.percent}%)`;
            storageProgressBar.style.width = `${Math.min(quota.percent, 100)}%`;
            if (quota.percent > 85) {
                storageProgressBar.style.background = '#FF3B30';
            } else if (quota.percent > 60) {
                storageProgressBar.style.background = '#FF9500';
            } else {
                storageProgressBar.style.background = 'var(--accent)';
            }
        }
    } catch (e) {
        console.warn('[Storage] Quota non disponibile:', e);
    }
}

function updateLibraryBadge(count) {
    if (libraryBadgeCount) {
        if (count > 0) {
            libraryBadgeCount.innerText = count;
            libraryBadgeCount.style.display = 'inline-flex';
        } else {
            libraryBadgeCount.style.display = 'none';
        }
    }
}

function renderLibraryCards(notebooks) {
    if (!libraryList) return;
    const l = TRANSLATIONS[currentLang];

    if (!notebooks || notebooks.length === 0) {
        libraryList.innerHTML = `<div class="library-empty-state">${l.libraryEmpty}</div>`;
        return;
    }

    libraryList.innerHTML = '';
    notebooks.forEach(nb => {
        const dateStr = nb.updatedAt ? new Date(nb.updatedAt).toLocaleDateString() : 'N/A';
        const sizeStr = nb.fileSize ? (nb.fileSize / (1024 * 1024)).toFixed(1) + ' MB' : '';

        const card = document.createElement('div');
        card.className = 'library-card';
        card.innerHTML = `
            <div class="library-card-info">
                <span class="library-card-badge">${nb.trackCount || 0} ${l.trackTag}</span>
                <strong class="library-card-title">${nb.name || nb.id}</strong>
                <div class="library-card-meta">
                    <span>${l.dateTag}: ${dateStr}</span>
                    ${sizeStr ? `<span>${l.weightTag}: ${sizeStr}</span>` : ''}
                </div>
            </div>
            <div class="library-card-actions">
                <button class="btn btn-primary" style="flex: 1; min-height: 38px; font-size: 0.85rem;" onclick="loadNotebookFromLibrary('${nb.id}')">
                    ${l.openNotebook}
                </button>
                <button class="btn-icon" title="${l.deleteNotebook}" style="width: 38px; height: 38px;" onclick="handleDeleteNotebook('${nb.id}')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </div>
        `;
        libraryList.appendChild(card);
    });
}

// Caricamento immediato di un quaderno precedentemente salvato in IndexedDB
window.loadNotebookFromLibrary = async function(notebookId) {
    if (typeof GoodnotesDB === 'undefined') return;

    try {
        showLoader(TRANSLATIONS[currentLang].loaderExtracting);
        updateProgress(30);

        const tracks = await GoodnotesDB.getTracksForNotebook(notebookId);
        updateProgress(80);

        activeNotebookData = {
            name: notebookId,
            list: tracks.map((t, idx) => ({
                uuid: t.uuid || t.id,
                filename: t.filename,
                cleanTitle: t.cleanTitle || t.titleClean,
                titleClean: t.cleanTitle || t.titleClean,
                dateDisplay: t.dateDisplay,
                duration: t.duration,
                sizeMb: t.sizeMb,
                audioBlob: t.audioBlob,
                id: t.id
            }))
        };

        hideLibrary();
        renderResults();
        updateProgress(100);
        setTimeout(hideLoader, 250);

    } catch (err) {
        hideLoader();
        showError('Errore caricamento quaderno da libreria: ' + err.message);
    }
};

window.handleDeleteNotebook = async function(notebookId) {
    if (typeof GoodnotesDB === 'undefined') return;
    const l = TRANSLATIONS[currentLang];

    if (confirm(l.confirmDeleteNotebook)) {
        try {
            await GoodnotesDB.deleteNotebook(notebookId);
            const remaining = await GoodnotesDB.getAllNotebooks();
            updateLibraryBadge(remaining.length);
            renderLibraryCards(remaining);

            // Se il quaderno attualmente aperto è stato eliminato, chiudi i risultati
            if (activeNotebookData && activeNotebookData.name === notebookId) {
                activeNotebookData = null;
                resultsPanel.style.display = 'none';
                dropZone.style.display = 'flex';
                playerManager.closePlayer();
            }
        } catch (err) {
            showError('Errore eliminazione quaderno: ' + err.message);
        }
    }
};

function toggleLibrary() {
    if (librarySection.style.display === 'none' || !librarySection.style.display) {
        librarySection.style.display = 'flex';
        initLibrary();
    } else {
        librarySection.style.display = 'none';
    }
}

function hideLibrary() {
    if (librarySection) librarySection.style.display = 'none';
}

if (libraryToggleBtn) libraryToggleBtn.addEventListener('click', toggleLibrary);
if (libraryCloseBtn) libraryCloseBtn.addEventListener('click', hideLibrary);

// ================================================================================
// ELABORAZIONE DEI FILE .GOODNOTES E CARTELLE
// ================================================================================

async function processGoodnotesFile(file) {
    hideError();
    const l = TRANSLATIONS[currentLang];
    showLoader(l.loaderExtracting);
    updateProgress(5);

    // Esegui elaborazione tramite Web Worker per non bloccare la UI
    if (typeof Worker !== 'undefined') {
        try {
            const worker = getWorker();
            const fileBuffer = await file.arrayBuffer();

            const onMessagePromise = new Promise((resolve, reject) => {
                const messageHandler = (e) => {
                    const msg = e.data;
                    if (!msg) return;

                    if (msg.type === 'PROGRESS') {
                        updateProgress(msg.percent || 10);
                        if (msg.statusText) {
                            loaderStatus.innerText = msg.statusText;
                        }
                    } else if (msg.type === 'SUCCESS') {
                        worker.removeEventListener('message', messageHandler);
                        resolve(msg.data);
                    } else if (msg.type === 'ERROR') {
                        worker.removeEventListener('message', messageHandler);
                        reject(new Error(msg.error || 'Errore worker sconosciuto.'));
                    }
                };

                const errorHandler = (err) => {
                    worker.removeEventListener('message', messageHandler);
                    worker.removeEventListener('error', errorHandler);
                    reject(new Error(err.message || 'Errore di esecuzione nel Worker.'));
                };

                worker.addEventListener('message', messageHandler);
                worker.addEventListener('error', errorHandler);
            });

            worker.postMessage(
                {
                    type: 'PARSE_NOTEBOOK',
                    fileData: fileBuffer,
                    fileName: file.name
                },
                [fileBuffer]
            );

            const result = await onMessagePromise;

            activeNotebookData = {
                name: result.notebookName,
                list: result.tracks
            };

            // Salvataggio atomico persistente in IndexedDB
            if (typeof GoodnotesDB !== 'undefined') {
                try {
                    await GoodnotesDB.saveNotebookWithTracks(
                        {
                            id: result.notebookName,
                            name: result.notebookName,
                            fileSize: file.size,
                            trackCount: result.totalTracks,
                            ghostTracksCount: result.ghostTracksCount || 0
                        },
                        result.tracks
                    );
                    initLibrary();
                } catch (dbErr) {
                    console.warn('[IndexedDB] Errore salvataggio:', dbErr);
                }
            }

            renderResults();
            updateProgress(100);
            setTimeout(hideLoader, 250);
            return;

        } catch (workerErr) {
            console.warn('[Worker] Errore elaborazione worker, avvio fallback:', workerErr);
        }
    }

    // Fallback su Main Thread con JSZip
    try {
        const zip = new JSZip();
        const zipContent = await zip.loadAsync(file);
        
        let eventsFile = zipContent.file("index.events.pb") || zipContent.file("events.pb");
        if (!eventsFile) {
            const matches = zipContent.file(/index\.events\.pb$/i);
            if (matches.length > 0) eventsFile = matches[0];
        }

        const eventsData = eventsFile ? await eventsFile.async("uint8array") : null;
        updateProgress(35);
        loaderStatus.innerText = l.loaderScanning;

        const audioAttachments = [];
        zipContent.forEach((relativePath, zipEntry) => {
            if (!zipEntry.dir && relativePath.toLowerCase().endsWith('.m4a')) {
                const parts = relativePath.split('/');
                const filename = parts[parts.length - 1];
                const uuid = filename.replace(/\.m4a$/i, '');
                audioAttachments.push({
                    relativePath: relativePath,
                    filename: filename,
                    uuid: uuid,
                    zipEntry: zipEntry
                });
            }
        });

        if (audioAttachments.length === 0) {
            throw new Error(l.errorNoAudio);
        }

        const finalExportList = [];
        for (let i = 0; i < audioAttachments.length; i++) {
            const cand = audioAttachments[i];
            const fileData = await cand.zipEntry.async("uint8array");
            const cleanT = cand.uuid;
            const destFilename = `${i + 1}_${cand.filename}`;

            finalExportList.push({
                uuid: cand.uuid,
                filename: destFilename,
                titleClean: cleanT,
                cleanTitle: cleanT,
                dateDisplay: new Date().toLocaleDateString(),
                duration: 'N/A',
                sizeMb: (fileData.byteLength / (1024 * 1024)).toFixed(2),
                fileData: fileData
            });
            updateProgress(40 + Math.floor((i / audioAttachments.length) * 45));
        }

        activeNotebookData = {
            name: file.name.replace(/\.goodnotes$/, '').replace(/\.zip$/, ''),
            list: finalExportList
        };

        if (typeof GoodnotesDB !== 'undefined') {
            try {
                await GoodnotesDB.saveNotebookWithTracks(
                    {
                        id: activeNotebookData.name,
                        name: activeNotebookData.name,
                        fileSize: file.size,
                        trackCount: finalExportList.length
                    },
                    finalExportList
                );
                initLibrary();
            } catch (dbErr) {}
        }

        renderResults();
        updateProgress(100);
        setTimeout(hideLoader, 250);

    } catch (e) {
        hideLoader();
        showError(e.message);
    }
}

// Gestione selezione intera cartella webkitdirectory o file multipli
function handleFolderSelection(files) {
    if (!files || files.length === 0) return;
    const l = TRANSLATIONS[currentLang];

    const validFiles = Array.from(files).filter(f => 
        f.name.endsWith('.goodnotes') || f.name.endsWith('.zip')
    );

    if (validFiles.length === 0) {
        showError(l.errorNoFolderFiles);
        return;
    }

    // Se c'è un solo quaderno, processalo immediatamente
    if (validFiles.length === 1) {
        processGoodnotesFile(validFiles[0]);
    } else {
        // Se ce ne sono molteplici, mostra l'elenco nel modal per la scelta dell'utente
        if (icloudNotebooksModal) {
            const titleEl = document.getElementById('icloud-modal-title');
            const descEl = document.getElementById('icloud-modal-desc');
            if (titleEl) titleEl.innerText = `${validFiles.length} Quaderni Rilevati`;
            if (descEl) descEl.innerText = 'Seleziona quale quaderno desideri estrarre e ascoltare:';

            icloudNotebooksModal.style.display = 'flex';
            if (icloudNotebooksList) {
                icloudNotebooksList.innerHTML = '';
                validFiles.forEach(f => {
                    const card = document.createElement('div');
                    card.className = 'icloud-notebook-card';
                    const sizeMb = (f.size / (1024 * 1024)).toFixed(1);
                    card.innerHTML = `
                        <div class="icloud-notebook-details">
                            <div class="icloud-notebook-name">${f.name.replace(/\.goodnotes$/i, '')}</div>
                            <div class="icloud-notebook-meta">
                                <span>${sizeMb} MB</span>
                            </div>
                        </div>
                        <button class="apple-btn-open-notebook">Apri</button>
                    `;
                    card.querySelector('.apple-btn-open-notebook').addEventListener('click', () => {
                        icloudNotebooksModal.style.display = 'none';
                        processGoodnotesFile(f);
                    });
                    icloudNotebooksList.appendChild(card);
                });
            }
        } else {
            processGoodnotesFile(validFiles[0]);
        }
    }
}

// ================================================================================
// RENDERING GRAFICO E DOWNLOAD
// ================================================================================

function getPlayIconSvg() {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
    </svg>`;
}

function getPauseIconSvg() {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <rect x="6" y="4" width="4" height="16"></rect>
        <rect x="14" y="4" width="4" height="16"></rect>
    </svg>`;
}

function renderResults(filterQuery = '') {
    if (!activeNotebookData) return;
    
    const l = TRANSLATIONS[currentLang];
    notebookNameSpan.innerText = activeNotebookData.name;
    
    const query = (typeof filterQuery === 'string' ? filterQuery : '').trim().toLowerCase();
    const filteredList = activeNotebookData.list.filter(item => {
        if (!query) return true;
        const nameMatch = item.filename && item.filename.toLowerCase().includes(query);
        const dateMatch = item.dateDisplay && item.dateDisplay.toLowerCase().includes(query);
        return nameMatch || dateMatch;
    });

    notebookStatsSpan.innerText = `${activeNotebookData.list.length} ${l.statsSuffix}`;
    if (trackSearchCount) {
        trackSearchCount.innerText = `${filteredList.length} ${filteredList.length === 1 ? 'traccia' : 'tracce'}`;
    }
    
    recordingsContainer.innerHTML = '';
    
    if (filteredList.length === 0) {
        recordingsContainer.innerHTML = `<div style="text-align: center; padding: 2.5rem 1rem; color: var(--text-secondary); font-size: 0.9rem;">Nessuna registrazione trovata per "<strong>${filterQuery}</strong>".</div>`;
        resultsPanel.style.display = 'flex';
        return;
    }
    
    filteredList.forEach((item) => {
        const originalIndex = activeNotebookData.list.indexOf(item);
        const isCurrentlyPlaying = playerManager.currentTrackIndex === originalIndex;
        const isPaused = isCurrentlyPlaying && playerManager.audio.paused;

        const itemHtml = `
            <div class="recording-item ${isCurrentlyPlaying ? 'is-playing' : ''} ${isPaused ? 'is-paused' : ''}" data-track-index="${originalIndex}">
                <div class="recording-details">
                    <div class="recording-name-clean">
                        <span>${item.filename}</span>
                        <div class="audio-playing-indicator" style="display: ${(isCurrentlyPlaying && !isPaused) ? 'inline-flex' : 'none'};">
                            <span class="sound-bar bar-1"></span>
                            <span class="sound-bar bar-2"></span>
                            <span class="sound-bar bar-3"></span>
                        </div>
                    </div>
                    <div class="recording-meta">
                        <span class="recording-tag">${l.trackTag} ${originalIndex + 1}</span>
                        <span>${l.dateTag}: ${item.dateDisplay}</span>
                        <span>${l.durationTag}: ${item.duration}</span>
                        <span>${l.weightTag}: ${item.sizeMb} MB</span>
                    </div>
                </div>
                <div class="recording-actions">
                    <button id="play-btn-${originalIndex}" class="btn-icon" title="${l.playAudio}" onclick="playerManager.playTrackAtIndex(${originalIndex}, activeNotebookData.list, activeNotebookData.name)">
                        ${(isCurrentlyPlaying && !isPaused) ? getPauseIconSvg() : getPlayIconSvg()}
                    </button>
                    <button class="btn-icon" title="${l.downloadSingle}" onclick="downloadSingleTrack(${originalIndex})">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                    </button>
                </div>
            </div>
        `;
        recordingsContainer.insertAdjacentHTML('beforeend', itemHtml);
    });
    
    resultsPanel.style.display = 'flex';
}

function downloadSingleTrack(index) {
    if (!activeNotebookData || !activeNotebookData.list[index]) return;
    const track = activeNotebookData.list[index];
    
    let blob = track.audioBlob;
    if (!blob && track.fileData) {
        blob = new Blob([track.fileData], { type: 'audio/mp4' });
    }
    
    if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = track.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } else if (track.audioUrl) {
        const a = document.createElement('a');
        a.href = track.audioUrl;
        a.download = track.filename;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
}

// Download aggregato ZIP in background worker
async function downloadAllAsZip() {
    if (!activeNotebookData || !activeNotebookData.list.length) return;
    
    const l = TRANSLATIONS[currentLang];
    showLoader(l.loaderZipProgress);
    updateProgress(5);

    if (typeof Worker !== 'undefined') {
        try {
            const worker = getWorker();
            const zipName = `${activeNotebookData.name}_Audio.zip`;

            const zipPromise = new Promise((resolve, reject) => {
                const messageHandler = (e) => {
                    const msg = e.data;
                    if (!msg) return;

                    if (msg.type === 'PROGRESS') {
                        updateProgress(msg.percent || 10);
                        if (msg.statusText) loaderStatus.innerText = msg.statusText;
                    } else if (msg.type === 'ZIP_SUCCESS') {
                        worker.removeEventListener('message', messageHandler);
                        resolve(msg.data);
                    } else if (msg.type === 'ERROR') {
                        worker.removeEventListener('message', messageHandler);
                        reject(new Error(msg.error || 'Errore generazione ZIP.'));
                    }
                };

                const errorHandler = (err) => {
                    worker.removeEventListener('message', messageHandler);
                    worker.removeEventListener('error', errorHandler);
                    reject(new Error(err.message || 'Errore worker durante lo ZIP.'));
                };

                worker.addEventListener('message', messageHandler);
                worker.addEventListener('error', errorHandler);
            });

            worker.postMessage({
                type: 'GENERATE_ZIP',
                tracks: activeNotebookData.list,
                zipName: zipName
            });

            const zipResult = await zipPromise;

            const url = URL.createObjectURL(zipResult.blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = zipResult.fileName || zipName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            hideLoader();
            return;

        } catch (workerZipErr) {
            console.warn('[Worker] Errore ZIP in worker, fallback:', workerZipErr);
        }
    }

    // Fallback ZIP su main thread
    try {
        const zip = new JSZip();
        let added = 0;
        
        for (const track of activeNotebookData.list) {
            const content = track.audioBlob || track.fileData;
            zip.file(track.filename, content);
            added++;
            updateProgress(10 + Math.floor((added / activeNotebookData.list.length) * 80));
        }
        
        updateProgress(90);
        loaderStatus.innerText = l.loaderZipCompressing;
        
        const content = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(content);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `${activeNotebookData.name}_Audio.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        hideLoader();
    } catch (e) {
        hideLoader();
        showError(l.errorZip + e.message);
    }
}

// Download sequenziale di tutti i singoli m4a
async function downloadAllAsFiles() {
    if (!activeNotebookData) return;
    
    const l = TRANSLATIONS[currentLang];
    try {
        showLoader(l.loaderFinalizing);
        updateProgress(10);
        
        for (let i = 0; i < activeNotebookData.list.length; i++) {
            const track = activeNotebookData.list[i];
            loaderStatus.innerText = `${l.downloadingSingle}${track.filename} (${i + 1}/${activeNotebookData.list.length})`;
            downloadSingleTrack(i);
            updateProgress(10 + Math.floor(((i + 1) / activeNotebookData.list.length) * 90));
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        hideLoader();
    } catch (e) {
        hideLoader();
        showError(l.errorDownload + e.message);
    }
}

// ================================================================================
// GESTIONE DEGLI EVENTI E DELL'INTERFACCIA
// ================================================================================

function showLoader(message) {
    loaderStatus.innerText = message;
    loaderProgress.style.width = "0%";
    loader.style.display = 'flex';
    dropZone.style.display = 'none';
    resultsPanel.style.display = 'none';
}

function updateProgress(percentage) {
    loaderProgress.style.width = `${percentage}%`;
}

function hideLoader() {
    loader.style.display = 'none';
    dropZone.style.display = 'flex';
}

function showError(msg) {
    errorMessage.innerText = msg;
    errorAlert.style.display = 'flex';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function hideError() {
    errorAlert.style.display = 'none';
}

// Drag & Drop
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    
    if (e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (file.name.endsWith('.goodnotes') || file.name.endsWith('.zip')) {
            processGoodnotesFile(file);
        } else {
            showError(TRANSLATIONS[currentLang].errorInvalidFile);
        }
    }
});

dropZone.addEventListener('click', (e) => {
    // Non propagare se si è cliccato sui bottoni d'azione
    if (e.target.closest('#browse-folder-btn') || 
        e.target.closest('#unified-browse-btn') || 
        e.target.closest('#unified-cloud-btn') || 
        e.target.closest('#cloud-dir-picker-btn') || 
        e.target.closest('#icloud-mac-scan-btn')) return;

    if (iosFilesGuideModal) {
        iosFilesGuideModal.style.display = 'flex';
        return;
    }
    fileInput.click();
});

fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
        if (fileInput.files.length === 1) {
            processGoodnotesFile(fileInput.files[0]);
        } else {
            handleFolderSelection(fileInput.files);
        }
    }
});

if (browseFolderBtn && folderInput) {
    browseFolderBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        folderInput.click();
    });

    folderInput.addEventListener('change', () => {
        handleFolderSelection(folderInput.files);
    });
}

downloadAllBtn.addEventListener('click', downloadAllAsZip);
downloadFilesBtn.addEventListener('click', downloadAllAsFiles);

// Switcher lingua
document.getElementById('lang-btn-it').addEventListener('click', () => applyLanguage('it'));
document.getElementById('lang-btn-en').addEventListener('click', () => applyLanguage('en'));

// Rilevamento automatico lingua (default italiano)
let defaultLang = 'it';
if (navigator.language && !navigator.language.startsWith('it')) {
    defaultLang = 'en';
}
applyLanguage(defaultLang);

// Inizializza la libreria offline e la sincronizzazione al caricamento del DOM
document.addEventListener('DOMContentLoaded', () => {
    initLibrary();
    initPwaInstallUI();
    initBackendConnection();
    checkSavedCloudDirectory();
});

// ================================================================================
// PWA STANDALONE DETECTION & ADD TO HOME SCREEN / DESKTOP GUIDE
// ================================================================================

const PWA_DISMISSED_KEY = 'gn_pwa_install_dismissed';
let deferredInstallPrompt = null;

function isRunningStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true ||
           document.referrer.includes('android-app://');
}

function isIosOrIpadSafari() {
    const ua = window.navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isWebkit = /WebKit/.test(ua);
    const isChrome = /CriOS/.test(ua);
    const isFirefox = /FxiOS/.test(ua);
    return isIos && isWebkit && !isChrome && !isFirefox;
}

function initPwaInstallUI() {
    const banner = document.getElementById('pwa-install-banner');
    const headerBtn = document.getElementById('pwa-header-install-btn');
    const actionBtn = document.getElementById('pwa-install-banner-btn');
    const dismissBtn = document.getElementById('pwa-install-dismiss-btn');
    const iosModal = document.getElementById('pwa-ios-modal');
    const iosCloseBtn = document.getElementById('pwa-ios-modal-close');
    const iosDismissBtn = document.getElementById('pwa-ios-modal-dismiss');

    if (!banner) return;

    if (isRunningStandalone()) {
        banner.style.display = 'none';
        if (headerBtn) headerBtn.style.display = 'none';
        return;
    }

    const isDismissed = localStorage.getItem(PWA_DISMISSED_KEY) === 'true';

    if (headerBtn) {
        headerBtn.style.display = 'inline-flex';
    }

    if (!isDismissed) {
        banner.style.display = 'flex';
    }

    const handleInstallTrigger = async () => {
        if (deferredInstallPrompt) {
            deferredInstallPrompt.prompt();
            const choice = await deferredInstallPrompt.userChoice;
            if (choice.outcome === 'accepted') {
                banner.style.display = 'none';
                if (headerBtn) headerBtn.style.display = 'none';
            }
            deferredInstallPrompt = null;
        } else if (isIosOrIpadSafari()) {
            if (iosModal) iosModal.style.display = 'flex';
        } else {
            if (iosModal) iosModal.style.display = 'flex';
        }
    };

    if (actionBtn) actionBtn.onclick = handleInstallTrigger;
    if (headerBtn) headerBtn.onclick = handleInstallTrigger;

    if (dismissBtn) {
        dismissBtn.onclick = () => {
            banner.style.display = 'none';
            localStorage.setItem(PWA_DISMISSED_KEY, 'true');
        };
    }

    if (iosCloseBtn) {
        iosCloseBtn.onclick = () => {
            if (iosModal) iosModal.style.display = 'none';
        };
    }
    if (iosDismissBtn) {
        iosDismissBtn.onclick = () => {
            if (iosModal) iosModal.style.display = 'none';
        };
    }

    if (iosModal) {
        iosModal.onclick = (e) => {
            if (e.target === iosModal) {
                iosModal.style.display = 'none';
            }
        };
    }
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    initPwaInstallUI();
});

window.addEventListener('appinstalled', () => {
    const banner = document.getElementById('pwa-install-banner');
    const headerBtn = document.getElementById('pwa-header-install-btn');
    if (banner) banner.style.display = 'none';
    if (headerBtn) headerBtn.style.display = 'none';
    deferredInstallPrompt = null;
});

// ================================================================================
// GESTIONE BACKEND BRIDGE & ICLOUD MODAL (MILESTONE 4)
// ================================================================================

async function initBackendConnection() {
    if (typeof CloudSync === 'undefined') return;

    try {
        const result = await CloudSync.detectBackendConnection();
        backendConnectionState = result;
        updateBackendUIState();
    } catch (err) {
        console.warn('[BackendBridge] Errore rilevamento:', err);
        backendConnectionState = { connected: false, origin: null };
        updateBackendUIState();
    }
}

function updateBackendUIState() {
    const l = TRANSLATIONS[currentLang];
    if (!connectionStatusPill) return;

    if (backendConnectionState.connected) {
        connectionStatusPill.className = 'status-pill status-connected';
        if (connectionStatusText) connectionStatusText.innerText = l.statusConnected || 'Mac Backend Attivo';
        connectionStatusPill.title = l.statusPillTitleConnected || 'Connesso al backend Mac (Zero-Space iCloud attivo)';
        
        if (backendQuickBanner) backendQuickBanner.style.display = 'flex';
        if (icloudMacScanBtn) icloudMacScanBtn.style.display = 'none';
    } else {
        connectionStatusPill.className = 'status-pill status-standalone';
        if (connectionStatusText) connectionStatusText.innerText = l.statusStandalone || 'Standalone Offline';
        connectionStatusPill.title = l.statusPillTitleStandalone || 'Modalità di elaborazione attiva in locale nel browser (100% Offline)';
        
        if (backendQuickBanner) backendQuickBanner.style.display = 'none';
        if (icloudMacScanBtn) icloudMacScanBtn.style.display = 'none';
    }
    updateCloudButtonVisibility();
}

async function openICloudNotebooksModal() {
    if (!backendConnectionState.connected) return;
    if (icloudNotebooksModal) icloudNotebooksModal.style.display = 'flex';
    if (icloudNotebooksList) {
        icloudNotebooksList.innerHTML = '<div style="padding: 1.5rem; text-align: center; color: var(--text-secondary);"><div class="spinner" style="margin: 0 auto 0.75rem auto;"></div>Caricamento quaderni da iCloud Drive...</div>';
    }

    try {
        const notebooks = await CloudSync.fetchBackendNotebooks(backendConnectionState.origin);
        icloudCachedNotebooks = notebooks || [];
        renderICloudNotebooks(icloudCachedNotebooks);
    } catch (err) {
        if (icloudNotebooksList) {
            icloudNotebooksList.innerHTML = `<div style="padding: 1rem; color: var(--danger); text-align: center;">Errore durante la scansione: ${err.message}</div>`;
        }
    }
}

function renderICloudNotebooks(notebooks) {
    if (!icloudNotebooksList) return;
    const l = TRANSLATIONS[currentLang];

    if (!notebooks || notebooks.length === 0) {
        icloudNotebooksList.innerHTML = `<div style="padding: 1.5rem; text-align: center; color: var(--text-secondary);">${l.noICloudNotebooksFound || 'Nessun quaderno .goodnotes trovato.'}</div>`;
        return;
    }

    icloudNotebooksList.innerHTML = '';
    notebooks.forEach((nb) => {
        const card = document.createElement('div');
        card.className = 'icloud-notebook-card';
        card.innerHTML = `
            <div class="icloud-notebook-details">
                <div class="icloud-notebook-name" title="${nb.name}">${nb.name}</div>
                <div class="icloud-notebook-meta">
                    <span>${nb.folder || 'iCloud'}</span>
                    <span>•</span>
                    <span>${nb.size_mb} MB</span>
                </div>
            </div>
            <button class="apple-btn-open-notebook" data-path="${nb.relative_path || nb.name}">
                ${l.loadAndExtractBtn || 'Carica ed Estrai'}
            </button>
        `;

        card.querySelector('.apple-btn-open-notebook').addEventListener('click', () => {
            loadBackendNotebook(nb);
        });

        icloudNotebooksList.appendChild(card);
    });
}

async function loadBackendNotebook(notebook) {
    if (icloudNotebooksModal) icloudNotebooksModal.style.display = 'none';
    hideError();
    const l = TRANSLATIONS[currentLang];
    showLoader(`Analisi Zero-Space in corso: ${notebook.name}...`);
    updateProgress(35);

    try {
        const result = await CloudSync.analyzeBackendNotebook(backendConnectionState.origin, notebook.relative_path || notebook.name);
        updateProgress(80);

        if (result.error) {
            throw new Error(result.error);
        }

        const recordings = (result.recordings || []).map((rec, idx) => ({
            id: `${result.notebook}_${rec.uuid}`,
            uuid: rec.uuid,
            filename: rec.export_filename,
            cleanTitle: rec.clean_title,
            rawTitle: rec.raw_title,
            duration: rec.duration,
            dateDisplay: rec.date || rec.creation_time || 'N/A',
            unixTimestamp: rec.unix_timestamp,
            size: rec.size_bytes,
            sizeMb: rec.size_mb,
            audioUrl: `${backendConnectionState.origin}/api/audio/play?notebook=${encodeURIComponent(result.notebook)}&uuid=${encodeURIComponent(rec.uuid)}`
        }));

        activeNotebookData = {
            name: result.notebook,
            list: recordings,
            isBackend: true,
            notebookPath: result.notebook_path
        };

        if (typeof GoodnotesDB !== 'undefined') {
            try {
                await GoodnotesDB.saveNotebookWithTracks(
                    {
                        id: result.notebook,
                        name: result.notebook,
                        fileSize: notebook.size_mb ? Math.round(notebook.size_mb * 1024 * 1024) : 0,
                        trackCount: recordings.length,
                        ghostTracksCount: result.ghost_tracks_count || 0
                    },
                    recordings
                );
                initLibrary();
            } catch (dbErr) {
                console.warn('[IndexedDB] Errore salvataggio:', dbErr);
            }
        }

        renderResults();
        updateProgress(100);
        setTimeout(hideLoader, 250);
    } catch (err) {
        hideLoader();
        showError(`Errore caricamento quaderno da backend: ${err.message}`);
    }
}

async function handleCloudDirectoryPicker() {
    if (!supportsDirectoryPicker) {
        showError("La selezione diretta di cartelle non è supportata su questo browser. Usa 'Sfoglia cartella' per selezionare il tuo file .goodnotes.");
        return;
    }
    try {
        const handle = await CloudSync.selectCloudDirectory();
        showLoader('Scansione cartella Cloud in corso...');
        updateProgress(30);

        const files = await CloudSync.scanDirectoryHandle(handle);
        hideLoader();

        if (files.length === 0) {
            showError('Nessun quaderno .goodnotes trovato nella cartella selezionata.');
            return;
        }

        if (files.length === 1) {
            processGoodnotesFile(files[0].file);
        } else {
            // Se molteplici, mostra la lista per la selezione
            if (icloudNotebooksModal) icloudNotebooksModal.style.display = 'flex';
            const converted = files.map(f => ({
                name: f.name.replace(/\.goodnotes$/i, ''),
                folder: f.relativePath,
                size_mb: f.sizeMb,
                fileObj: f.file
            }));

            if (icloudNotebooksList) {
                icloudNotebooksList.innerHTML = '';
                converted.forEach(nb => {
                    const card = document.createElement('div');
                    card.className = 'icloud-notebook-card';
                    card.innerHTML = `
                        <div class="icloud-notebook-details">
                            <div class="icloud-notebook-name">${nb.name}</div>
                            <div class="icloud-notebook-meta">
                                <span>${nb.folder}</span>
                                <span>•</span>
                                <span>${nb.size_mb} MB</span>
                            </div>
                        </div>
                        <button class="apple-btn-open-notebook">Apri</button>
                    `;
                    card.querySelector('.apple-btn-open-notebook').addEventListener('click', () => {
                        if (icloudNotebooksModal) icloudNotebooksModal.style.display = 'none';
                        processGoodnotesFile(nb.fileObj);
                    });
                    icloudNotebooksList.appendChild(card);
                });
            }
        }
    } catch (err) {
        hideLoader();
        if (err.name !== 'AbortError') {
            showError(`Errore selezione cartella Cloud: ${err.message}`);
        }
    }
}

// Event Listeners Milestone 4
if (icloudMacScanBtn) {
    icloudMacScanBtn.addEventListener('click', openICloudNotebooksModal);
}
if (backendQuickScanActionBtn) {
    backendQuickScanActionBtn.addEventListener('click', openICloudNotebooksModal);
}
if (icloudModalCloseBtn) {
    icloudModalCloseBtn.addEventListener('click', () => {
        if (icloudNotebooksModal) icloudNotebooksModal.style.display = 'none';
    });
}
if (icloudNotebooksModal) {
    icloudNotebooksModal.addEventListener('click', (e) => {
        if (e.target === icloudNotebooksModal) {
            icloudNotebooksModal.style.display = 'none';
        }
    });
}
if (icloudSearchInput) {
    icloudSearchInput.addEventListener('input', () => {
        const query = icloudSearchInput.value.toLowerCase().trim();
        const filtered = icloudCachedNotebooks.filter(nb => 
            nb.name.toLowerCase().includes(query) || (nb.folder && nb.folder.toLowerCase().includes(query))
        );
        renderICloudNotebooks(filtered);
    });
}
if (cloudDirPickerBtn) {
    cloudDirPickerBtn.addEventListener('click', handleCloudDirectoryPicker);
}

// ================================================================================
// COMPONENTI 1-4: EVENT LISTENERS & LOGICA INTERATTIVA APPLE HIG
// ================================================================================

// Componente 1: Helper Riconoscimento iOS/iPadOS
function isIosOrIpad() {
    const ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// Componente 1: Pulsanti di Selezione Unificati & Guida Esportazione
if (unifiedBrowseBtn) {
    unifiedBrowseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (iosFilesGuideModal) {
            iosFilesGuideModal.style.display = 'flex';
        } else {
            fileInput.click();
        }
    });
}

if (unifiedCloudBtn) {
    unifiedCloudBtn.addEventListener('click', (e) => {
        if (e) e.stopPropagation();
        if (backendConnectionState && backendConnectionState.connected) {
            openICloudNotebooksModal();
        } else if (supportsDirectoryPicker) {
            handleCloudDirectoryPicker();
        } else if (!isIosOrIpad() && folderInput) {
            folderInput.click();
        } else {
            // Su iOS / iPad: mostra il modal esplicativo e poi apri la selezione multipla iCloud Drive / File
            if (cloudIosInfoModal) {
                cloudIosInfoModal.style.display = 'flex';
            } else {
                fileInput.click();
            }
        }
    });
}

// Modal Guida: Azione "Sfoglia Ora"
if (iosFilesGuideChooseBtn) {
    iosFilesGuideChooseBtn.addEventListener('click', () => {
        if (iosFilesGuideModal) iosFilesGuideModal.style.display = 'none';
        fileInput.click();
    });
}

// Modal Guida: Chiusura tramite bottone "X"
if (iosFilesGuideCloseBtn) {
    iosFilesGuideCloseBtn.addEventListener('click', () => {
        if (iosFilesGuideModal) iosFilesGuideModal.style.display = 'none';
    });
}

// Modal Guida: Chiusura toccando lo sfondo (backdrop)
if (iosFilesGuideModal) {
    iosFilesGuideModal.addEventListener('click', (e) => {
        if (e.target === iosFilesGuideModal) {
            iosFilesGuideModal.style.display = 'none';
        }
    });
}

// Modal Informativo iOS Cloud: Azione "Sfoglia iCloud Drive / File"
if (cloudIosChooseBtn) {
    cloudIosChooseBtn.addEventListener('click', () => {
        if (cloudIosInfoModal) cloudIosInfoModal.style.display = 'none';
        fileInput.click();
    });
}

// Modal Informativo iOS Cloud: Chiusura tramite "X"
if (cloudIosCloseBtn) {
    cloudIosCloseBtn.addEventListener('click', () => {
        if (cloudIosInfoModal) cloudIosInfoModal.style.display = 'none';
    });
}

// Modal Informativo iOS Cloud: Chiusura toccando lo sfondo (backdrop)
if (cloudIosInfoModal) {
    cloudIosInfoModal.addEventListener('click', (e) => {
        if (e.target === cloudIosInfoModal) {
            cloudIosInfoModal.style.display = 'none';
        }
    });
}

// Persistent Cloud Banner
async function checkSavedCloudDirectory() {
    if (typeof GoodnotesCloudSyncDB === 'undefined') return;
    try {
        const stored = await GoodnotesCloudSyncDB.getStoredDirectoryHandle();
        if (stored && stored.handle && cloudPersistentBanner) {
            cloudPersistentBanner.style.display = 'flex';
            if (cloudPersistentName) cloudPersistentName.innerText = stored.name || 'Cartella Cloud';
        }
    } catch (e) {
        console.warn('[CloudSync] Errore verifica directory salvata:', e);
    }
}

if (cloudPersistentRescanBtn) {
    cloudPersistentRescanBtn.addEventListener('click', async () => {
        if (typeof GoodnotesCloudSyncDB === 'undefined') return;
        const stored = await GoodnotesCloudSyncDB.getStoredDirectoryHandle();
        if (stored && stored.handle) {
            const hasPerm = await GoodnotesCloudSyncDB.verifyHandlePermission(stored.handle);
            if (hasPerm) {
                showLoader('Scansione della cartella cloud...');
                const notebooks = await GoodnotesCloudSyncDB.scanDirectoryHandle(stored.handle);
                hideLoader();
                if (notebooks && notebooks.length > 0) {
                    renderICloudNotebooks(notebooks, stored.name);
                    openICloudNotebooksModal();
                } else {
                    showError('Nessun quaderno .goodnotes trovato nella cartella.');
                }
            } else {
                handleCloudDirectoryPicker();
            }
        } else {
            handleCloudDirectoryPicker();
        }
    });
}

// Componente 2: Barra di Ricerca Istantanea Tracce
if (trackSearchInput) {
    trackSearchInput.addEventListener('input', (e) => {
        const val = e.target.value;
        if (trackSearchClearBtn) {
            trackSearchClearBtn.style.display = val ? 'flex' : 'none';
        }
        renderResults(val);
    });
}

if (trackSearchClearBtn) {
    trackSearchClearBtn.addEventListener('click', () => {
        if (trackSearchInput) {
            trackSearchInput.value = '';
            trackSearchClearBtn.style.display = 'none';
            renderResults('');
            trackSearchInput.focus();
        }
    });
}

// Componente 4: Svuota Cache Audio
if (purgeAudioBtn) {
    purgeAudioBtn.addEventListener('click', async () => {
        if (!confirm('Vuoi liberare spazio cancellando solo i file audio memorizzati in cache? I titoli, le durate e i quaderni rimarranno salvati.')) {
            return;
        }
        try {
            showLoader('Pulizia cache audio in corso...');
            const count = await GoodnotesDB.purgeAudioBlobsOnly();
            hideLoader();
            alert(`Cache audio liberata con successo! Rimosso audio da ${count} registrazioni.`);
            await initLibrary();
        } catch (err) {
            hideLoader();
            showError('Errore durante la pulizia della cache audio: ' + err.message);
        }
    });
}

// Componente 3: Scorciatoie da tastiera Apple HIG
window.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) {
        if (e.key === 'Escape') {
            e.target.blur();
        }
        return;
    }

    if (e.code === 'Space') {
        e.preventDefault();
        playerManager.togglePlayPause();
    } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        playerManager.skip(-15);
    } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        playerManager.skip(15);
    } else if (e.key === 'Escape') {
        const openModal = document.querySelector('.apple-modal-backdrop[style*="flex"], .modal-backdrop[style*="flex"]');
        if (openModal) {
            openModal.style.display = 'none';
        } else if (librarySection && librarySection.style.display !== 'none') {
            librarySection.style.display = 'none';
        } else if (floatingPlayer && floatingPlayer.style.display !== 'none') {
            playerManager.closePlayer();
        }
    }
});

