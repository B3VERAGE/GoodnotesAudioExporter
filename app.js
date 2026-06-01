// ================================================================================
// GoodNotes 6 Audio Exporter & Renamer - Client-Side Logic (100% Offline PWA)
// ================================================================================

// Riferimenti agli elementi HTML
const dropZone = document.getElementById('file-drop-zone');
const fileInput = document.getElementById('goodnotes-file-input');
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

// Stato dell'applicazione in memoria
// Stato dell'applicazione in memoria
let activeNotebookData = null;
let currentLang = 'en';

// parole chiave italiane per valutare l'accuratezza dei titoli decrittati
const CLEAN_KEYWORDS = [
    "polmoni", "inizio", "patologie", "ostruzione", "restrizione", "infettive", "covid", 
    "tumori", "malattie", "interstiziali", "pleura", "mal", "cardiopatie", "cong", 
    "aneurismi", "arteriti", "necrosi", "inf", "tumori", "vescica", "cistiti", 
    "aterosclerosi", "prostata", "ipertensione", "cardiaco", "aorta", "stenosi",
    "insufficienza", "protesi", "valvolari", "asma", "ecg", "fisiologia", "respiratoria",
    "trombosi", "venosa", "profonda", "dissecazione", "ischemia", "acuta", "arto",
    "inf", "trapianto", "terapia", "dispnea", "dispositivi", "semeiotica", "anatomia"
];

// Dizionario delle traduzioni per internazionalizzazione (IT / EN)
const TRANSLATIONS = {
    it: {
        title: "GoodNotes Audio Exporter",
        subtitle: "Estrai, decifra e rinomina le tue lezioni audio in totale privacy",
        dropzoneTitle: "Trascina qui il tuo quaderno .goodnotes",
        dropzoneSubtitle: "oppure tocca per sfogliare i tuoi file",
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
        errorInvalidFile: "File non valido. Si prega di trascinare esclusivamente un file di tipo .goodnotes o .zip.",
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
        downloadingSingle: "Download in corso: "
    },
    en: {
        title: "GoodNotes Audio Exporter",
        subtitle: "Extract, decrypt and rename your audio lectures in total privacy",
        dropzoneTitle: "Drag and drop your .goodnotes notebook here",
        dropzoneSubtitle: "or tap to browse your files",
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
        downloadingSingle: "Downloading: "
    }
};

function applyLanguage(langCode) {
    currentLang = langCode;
    const l = TRANSLATIONS[langCode];
    
    // Cambia pulsante attivo
    document.getElementById('lang-btn-it').classList.toggle('active', langCode === 'it');
    document.getElementById('lang-btn-en').classList.toggle('active', langCode === 'en');
    
    // Testi statici
    document.getElementById('app-title').innerText = l.title;
    document.getElementById('app-subtitle').innerText = l.subtitle;
    
    // Dropzone
    const dropzoneTitle = dropZone.querySelector('h3');
    const dropzoneSubtitle = dropZone.querySelector('p');
    if (dropzoneTitle) dropzoneTitle.innerText = l.dropzoneTitle;
    if (dropzoneSubtitle) dropzoneSubtitle.innerText = l.dropzoneSubtitle;
    
    // Pulsanti (se visibili)
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
    
    // Footer
    const footer = document.querySelector('.app-footer p');
    if (footer) footer.innerText = l.footerText;
    
    // Aggiorna elenco tracce se presenti
    if (activeNotebookData) {
        renderResults();
    }
}

// ================================================================================
// DECODIFICATORE PROTOBUF BINARIO ULTRA-LEGGERO E NATIVO
// ================================================================================

function readVarint(arr, offsetRef) {
    let value = 0;
    let multiplier = 1;
    while (true) {
        if (offsetRef.val >= arr.length) return null;
        let byte = arr[offsetRef.val++];
        value += (byte & 0x7f) * multiplier;
        if (!(byte & 0x80)) break;
        multiplier *= 128;
    }
    return value;
}

function bytesToString(bytes) {
    return new TextDecoder("utf-8").decode(bytes);
}

function decodeProtobufFields(bytes) {
    const fields = {};
    let offset = 0;
    while (offset < bytes.length) {
        const offsetRef = { val: offset };
        const tag = readVarint(bytes, offsetRef);
        if (tag === null) break;
        offset = offsetRef.val;
        
        const wireType = tag % 8;
        const fieldNumber = Math.floor(tag / 8);
        
        if (wireType === 0) {
            const val = readVarint(bytes, offsetRef);
            if (val === null) break;
            offset = offsetRef.val;
            fields[fieldNumber] = val;
        } else if (wireType === 1) {
            if (offset + 8 > bytes.length) break;
            const valBytes = bytes.subarray(offset, offset + 8);
            offset += 8;
            fields[fieldNumber] = valBytes;
        } else if (wireType === 2) {
            const len = readVarint(bytes, offsetRef);
            if (len === null) break;
            offset = offsetRef.val;
            if (offset + len > bytes.length) break;
            const valBytes = bytes.subarray(offset, offset + len);
            offset += len;
            fields[fieldNumber] = valBytes;
        } else if (wireType === 5) {
            if (offset + 4 > bytes.length) break;
            const valBytes = bytes.subarray(offset, offset + 4);
            offset += 4;
            fields[fieldNumber] = valBytes;
        } else {
            break;
        }
    }
    return fields;
}

function parseEventsMapping(eventsPbData) {
    const sessionToAttachment = {};
    const sessionToTitle = {};
    const sessionToDuration = {};
    
    const stream = new Uint8Array(eventsPbData);
    let offset = 0;
    
    while (offset < stream.length) {
        const offsetRef = { val: offset };
        const length = readVarint(stream, offsetRef);
        if (length === null) break;
        offset = offsetRef.val;
        
        const msgEnd = offset + length;
        if (msgEnd > stream.length) break;
        
        const msgBytes = stream.subarray(offset, msgEnd);
        offset = msgEnd;
        
        try {
            const decoded = decodeProtobufFields(msgBytes);
            
            // Messaggio 160: Associazione Sessione -> Attachment UUID
            if (decoded[160]) {
                const f160 = decodeProtobufFields(decoded[160]);
                const s_id = f160[1] ? bytesToString(f160[1]).toUpperCase() : null;
                const att_id = f160[2] ? bytesToString(f160[2]).toUpperCase() : null;
                const duration_ns = f160[4] || null;
                
                if (s_id && att_id) {
                    sessionToAttachment[s_id] = att_id;
                    if (duration_ns) {
                        sessionToDuration[s_id] = formatDuration(duration_ns);
                    }
                }
            }
            
            // Messaggio 164: Associazione Sessione -> Titolo
            if (decoded[164]) {
                const f164 = decodeProtobufFields(decoded[164]);
                const s_id = f164[1] ? bytesToString(f164[1]).toUpperCase() : null;
                const f3Bytes = f164[3];
                
                if (s_id && f3Bytes) {
                    const f3 = decodeProtobufFields(f3Bytes);
                    const title = f3[1] ? bytesToString(f3[1]) : null;
                    if (title) {
                        sessionToTitle[s_id] = title;
                    }
                }
            }
        } catch (e) {
            // Salta i messaggi corrotti
        }
    }
    
    // Unione dei dati
    const mappaAudio = {};
    for (const [s_id, att_uuid] of Object.entries(sessionToAttachment)) {
        const title = sessionToTitle[s_id] || "";
        const duration = sessionToDuration[s_id] || "N/A";
        
        if (duration !== "N/A") {
            mappaAudio[att_uuid] = {
                uuid: att_uuid,
                title: title,
                duration: duration,
                session_id: s_id
            };
        }
    }
    
    return mappaAudio;
}

// ================================================================================
// ALGORITMI DI PULIZIA E DECRITTAZIONE
// ================================================================================

function formatDuration(nanosecs) {
    if (typeof nanosecs !== 'number' || nanosecs <= 0) return "N/A";
    const totalSeconds = Math.floor(nanosecs / 1000000000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    if (hours > 0) {
        return `${hours}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
    }
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}

function normalizeMathBold(text) {
    const out = [];
    for (const char of text) {
        const o = char.codePointAt(0);
        
        // Normalizzazione font matematici in lettere standard
        if (o >= 0x1D400 && o <= 0x1D419) out.push(String.fromCodePoint(65 + (o - 0x1D400))); // Bold A-Z
        else if (o >= 0x1D41A && o <= 0x1D433) out.push(String.fromCodePoint(97 + (o - 0x1D41A))); // Bold a-z
        else if (o >= 0x1D434 && o <= 0x1D44D) out.push(String.fromCodePoint(65 + (o - 0x1D434))); // Italic A-Z
        else if (o >= 0x1D44E && o <= 0x1D467) out.push(String.fromCodePoint(97 + (o - 0x1D44E))); // Italic a-z
        else if (o >= 0x1D468 && o <= 0x1D481) out.push(String.fromCodePoint(65 + (o - 0x1D468))); // Bold Italic A-Z
        else if (o >= 0x1D482 && o <= 0x1D49B) out.push(String.fromCodePoint(97 + (o - 0x1D482))); // Bold Italic a-z
        else if (o >= 0x1D5D4 && o <= 0x1D5ED) out.push(String.fromCodePoint(65 + (o - 0x1D5D4))); // Sans Bold A-Z
        else if (o >= 0x1D5EE && o <= 0x1D607) out.push(String.fromCodePoint(97 + (o - 0x1D5EE))); // Sans Bold a-z
        else if (o >= 0x1D7CE && o <= 0x1D7D7) out.push(String.fromCodePoint(48 + (o - 0x1D7CE))); // Bold Digits 0-9
        else out.push(char);
    }
    return out.join("");
}

function decryptCaesar(text) {
    const out = [];
    const isAllUpper = text === text.toUpperCase() && /[A-Z]/.test(text);
    
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        const code = c.charCodeAt(0);
        
        if (/[0-9]/.test(c)) {
            const decDig = (code - 48 - 6 + 20) % 10;
            out.push(String.fromCharCode(48 + decDig));
            continue;
        }
        
        if (!/[a-zA-Z]/.test(c)) {
            out.push(c);
            continue;
        }
        
        const isUpper = c === c.toUpperCase();
        const cIdx = code - (isUpper ? 65 : 97);
        
        if (isAllUpper) {
            const pIdx = (cIdx - 4 + 26) % 26;
            out.push(String.fromCharCode(65 + pIdx));
        } else {
            if (i === 0 && isUpper) {
                const pIdx = (cIdx - 4 + 26) % 26;
                out.push(String.fromCharCode(65 + pIdx));
            } else {
                const pIdx = (cIdx + 18 + 26) % 26;
                out.push(String.fromCharCode(97 + pIdx));
            }
        }
    }
    return out.join("");
}

function isCaesarEncrypted(text) {
    const dec = decryptCaesar(text).toLowerCase();
    for (const kw of CLEAN_KEYWORDS) {
        if (dec.includes(kw)) return true;
    }
    return false;
}

function cleanFilename(name) {
    let nameClean = normalizeMathBold(name);
    if (isCaesarEncrypted(nameClean)) {
        nameClean = decryptCaesar(nameClean);
    }
    
    // Rimuove caratteri non ammessi nei nomi dei file
    nameClean = nameClean.replace(/[\/\\:\*\?"<>\|]/g, '-').trim();
    
    // Correzioni di typo specifici
    if (nameClean.toLowerCase().includes("tumtiri") || nameClean.toLowerCase().includes("tum tir e paratir")) {
        nameClean = "Tum Tir E Paratir";
    } else if (nameClean.toLowerCase().includes("anuerismi")) {
        nameClean = "Aneurismi";
    } else if (nameClean.toLowerCase().includes("ipert polm") || nameClean.toLowerCase().includes("mxmlb")) {
        nameClean = "Ipert Polm, Tum Card";
    }
    
    // Title Case per uniformità grafica
    return nameClean.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function getMp4CreationTime(dataBytes) {
    let idx = -1;
    // Cerca il blocco 'mvhd' (0x6d 0x76 0x68 0x64)
    for (let i = 0; i < dataBytes.length - 20; i++) {
        if (dataBytes[i] === 0x6d && dataBytes[i+1] === 0x76 && dataBytes[i+2] === 0x68 && dataBytes[i+3] === 0x64) {
            idx = i;
            break;
        }
    }
    if (idx === -1) return null;
    
    const version = dataBytes[idx + 4];
    let secondsSince1904 = 0;
    if (version === 0) {
        const view = new DataView(dataBytes.buffer, dataBytes.byteOffset + idx + 8, 4);
        secondsSince1904 = view.getUint32(0, false);
    } else if (version === 1) {
        const view = new DataView(dataBytes.buffer, dataBytes.byteOffset + idx + 8, 8);
        const high = view.getUint32(0, false);
        const low = view.getUint32(4, false);
        secondsSince1904 = high * 4294967296 + low;
    } else {
        return null;
    }
    
    const unixTime = secondsSince1904 - 2082844800;
    return new Date(unixTime * 1000);
}

function getFilenameScore(filename) {
    let score = 0;
    const nameLower = filename.toLowerCase();
    for (const kw of CLEAN_KEYWORDS) {
        if (nameLower.includes(kw)) score += 10;
    }
    for (const gibberish of ["xwtuwvq", "izbmzqbq", "kizlqwxibqm", "uitibbqm", "qvb", "xtmczi", "jkm", "jiri", "leicica"]) {
        if (nameLower.includes(gibberish)) score -= 50;
    }
    return score;
}

// ================================================================================
// CORE ENGINE: ESTRAZIONE E DECODIFICA DEL NOTEBOOK
// ================================================================================
async function processGoodnotesFile(file) {
    const l = TRANSLATIONS[currentLang];
    try {
        hideError();
        showLoader(l.loaderExtracting);
        updateProgress(10);
        
        // Estrazione del file ZIP
        const zip = await JSZip.loadAsync(file);
        
        updateProgress(30);
        loaderStatus.innerText = l.loaderParsing;
        
        const eventsPb = zip.file("index.events.pb");
        if (!eventsPb) {
            throw new Error(l.errorNoEvents);
        }
        
        const eventsData = await eventsPb.async("uint8array");
        const mappaAudio = parseEventsMapping(eventsData);
        
        updateProgress(50);
        loaderStatus.innerText = l.loaderScanning;
        
        const candidates = [];
        const attachmentsFolder = zip.folder("attachments");
        
        if (!attachmentsFolder) {
            throw new Error(l.errorNoFolder);
        }
        
        // Raccogliamo tutti gli audio presenti
        const fileKeys = Object.keys(mappaAudio);
        let completedFiles = 0;
        
        for (const attUuid of fileKeys) {
            const info = mappaAudio[attUuid];
            const attFile = zip.file(`attachments/${attUuid}`);
            if (attFile) {
                const attData = await attFile.async("uint8array");
                let creationDate = getMp4CreationTime(attData);
                if (!creationDate) {
                    creationDate = attFile.date || new Date();
                }
                
                candidates.push({
                    uuid: attUuid,
                    fileData: attData,
                    titleOriginal: info.title,
                    dateObj: creationDate,
                    duration: info.duration,
                    size: attData.length
                });
            }
            completedFiles++;
            updateProgress(50 + Math.floor((completedFiles / fileKeys.length) * 20));
        }
        
        if (candidates.length === 0) {
            throw new Error(l.errorNoAudio);
        }
        
        // Deduplicazione fisica in base alla dimensione
        const sizeMap = {};
        for (const cand of candidates) {
            if (!sizeMap[cand.size]) sizeMap[cand.size] = [];
            sizeMap[cand.size].push(cand);
        }
        
        const deduplicatedCandidates = [];
        for (const size of Object.keys(sizeMap)) {
            const list = sizeMap[size];
            if (list.length > 1) {
                // Scegliamo il candidato col nome migliore
                list.sort((a, b) => {
                    const scoreA = (!a.titleOriginal || a.titleOriginal.trim() === "") ? -100 : getFilenameScore(cleanFilename(a.titleOriginal));
                    const scoreB = (!b.titleOriginal || b.titleOriginal.trim() === "") ? -100 : getFilenameScore(cleanFilename(b.titleOriginal));
                    return scoreB - scoreA;
                });
                deduplicatedCandidates.push(list[0]);
            } else {
                deduplicatedCandidates.push(list[0]);
            }
        }
        
        // Ordinamento cronologico
        deduplicatedCandidates.sort((a, b) => a.dateObj - b.dateObj);
        
        // Assegnazione dei nomi finali coerenti
        let clipCounter = 1;
        const finalExportList = [];
        
        for (const cand of deduplicatedCandidates) {
            let cleanTitle = "";
            if (!cand.titleOriginal || cand.titleOriginal.trim() === "") {
                cleanTitle = `${l.clipAudio} ${clipCounter}`;
                clipCounter++;
            } else {
                cleanTitle = cleanFilename(cand.titleOriginal);
            }
            
            // Date formatting: GG_MM
            const day = cand.dateObj.getDate().toString().padStart(2, '0');
            const month = (cand.dateObj.getMonth() + 1).toString().padStart(2, '0');
            const year = cand.dateObj.getFullYear();
            const datePrefix = `${day}_${month}`;
            const dateDisplay = `${day}/${month}/${year}`;
            
            const destFilename = `${datePrefix} - ${cleanTitle}.m4a`;
            
            finalExportList.push({
                uuid: cand.uuid,
                filename: destFilename,
                titleClean: cleanTitle,
                dateDisplay: dateDisplay,
                duration: cand.duration,
                sizeMb: (cand.size / (1024 * 1024)).toFixed(2),
                fileData: cand.fileData
            });
        }
        
        updateProgress(90);
        loaderStatus.innerText = l.loaderFinalizing;
        
        // Memorizza i dati per il download
        activeNotebookData = {
            name: file.name.replace(/\.goodnotes$/, '').replace(/\.zip$/, ''),
            list: finalExportList
        };
        
        // Rendering dell'interfaccia
        renderResults();
        
        updateProgress(100);
        setTimeout(hideLoader, 250);
        
    } catch (e) {
        hideLoader();
        showError(e.message);
    }
}}

// ================================================================================
// RENDERING GRAFICO DELL'INTERFACCIA UTENTE
// ================================================================================

function renderResults() {
    if (!activeNotebookData) return;
    
    const l = TRANSLATIONS[currentLang];
    notebookNameSpan.innerText = activeNotebookData.name;
    notebookStatsSpan.innerText = `${activeNotebookData.list.length} ${l.statsSuffix}`;
    
    recordingsContainer.innerHTML = '';
    
    activeNotebookData.list.forEach((item, index) => {
        const itemHtml = `
            <div class="recording-item">
                <div class="recording-details">
                    <div class="recording-name-clean">${item.filename}</div>
                    <div class="recording-meta">
                        <span class="recording-tag">${l.trackTag} ${index + 1}</span>
                        <span>${l.dateTag}: ${item.dateDisplay}</span>
                        <span>${l.durationTag}: ${item.duration}</span>
                        <span>${l.weightTag}: ${item.sizeMb} MB</span>
                    </div>
                </div>
                <div class="recording-actions">
                    <button class="btn-icon" title="${l.downloadSingle}" onclick="downloadSingleTrack(${index})">
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
    
    const blob = new Blob([track.fileData], { type: 'audio/mp4' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = track.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Download di tutte le tracce aggregate in un unico archivio ZIP
async function downloadAllAsZip() {
    if (!activeNotebookData) return;
    
    const l = TRANSLATIONS[currentLang];
    try {
        showLoader(l.loaderZipProgress);
        updateProgress(10);
        
        const zip = new JSZip();
        let added = 0;
        
        for (const track of activeNotebookData.list) {
            zip.file(track.filename, track.fileData);
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

// Download di tutte le tracce singolarmente in sequenza
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
            // Intervallo di sicurezza per evitare blocchi del browser su download multipli
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

// Eventi di Drag and Drop
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

// Evento di Click sulla DropZone per aprire il selettore file nativo
dropZone.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
        processGoodnotesFile(fileInput.files[0]);
    }
});

downloadAllBtn.addEventListener('click', downloadAllAsZip);
downloadFilesBtn.addEventListener('click', downloadAllAsFiles);

// Aggiunta ascoltatori per i bottoni dello switcher lingua
document.getElementById('lang-btn-it').addEventListener('click', () => applyLanguage('it'));
document.getElementById('lang-btn-en').addEventListener('click', () => applyLanguage('en'));

// Rilevamento automatico lingua utente
let defaultLang = 'en';
if (navigator.language && navigator.language.startsWith('it')) {
    defaultLang = 'it';
}
applyLanguage(defaultLang);
