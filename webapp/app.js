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
let activeNotebookData = null;
let currentLang = 'it';
let currentAudio = null;
let currentPlayingIndex = null;

// ================================================================================
// COSTANTI, ACRONIMI E TABELLE DI RICONOSCIMENTO LINGUISTICO
// ================================================================================

// Acronimi medici da preservare rigorosamente in MAIUSCOLO
const WHITELIST_ACRONYMS = new Set([
    "ECG", "BPCO", "SCA", "RCU", "CEC", "PAD", "RR", "IFP"
]);

// Prefissi di materia noti (con due punti)
const SUBJECT_PREFIXES = new Set([
    "CV:", "CC:", "CT:", "SMED:", "ANTROPO:", "POLM:"
]);

// Vocali accentate italiane che devono essere RIGOROSAMENTE preservate da qualsiasi shift
const ITALIAN_ACCENTED_CHARS = new Set(["à", "è", "é", "ì", "ò", "ù", "À", "È", "É", "Ì", "Ò", "Ù"]);

// Parole e radici italiane comuni per determinare se il testo grezzo è già in chiaro
const ITALIAN_STOPWORDS = new Set([
    "di", "del", "della", "delle", "dei", "degli", "il", "lo", "la", "i", "gli", "le",
    "un", "uno", "una", "e", "ed", "in", "su", "per", "con", "tra", "fra", "da", "dal",
    "dalla", "non", "intro", "comunicazione", "medico", "paziente", "lezione", "corso",
    "esame", "clinica", "clinico", "sindrome", "patologia", "patologie", "arteriti",
    "aneurismi", "tiroide", "paratiroide", "cuore", "polmone", "polmonare", "polmonari",
    "mortalita", "mortalità", "storia", "antica", "grecia", "morte", "inizio"
]);

// Parole bersaglio per confermare l'effettiva cifratura Cesare (lunghezza >= 5)
const CAESAR_TARGET_KEYWORDS = new Set([
    "aterosclerosi", "necrosi", "tumori", "vescica", "cistiti", "patologie",
    "polmonari", "ostruzione", "restrizione", "infettive", "cardiopatie",
    "infarto", "angina", "prostata", "arteriti", "aneurismi", "tiroide",
    "paratiroide", "ipertensione"
]);

// Costante offset secondi tra 1 gennaio 1904 (Mac epoch) e 1 gennaio 1970 (Unix epoch)
const MAC_TO_UNIX_OFFSET = 2082844800;

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
        downloadingSingle: "Download in corso: ",
        playAudio: "Ascolta anteprima",
        pauseAudio: "Pausa anteprima"
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
        downloadingSingle: "Downloading: ",
        playAudio: "Play preview",
        pauseAudio: "Pause preview"
    }
};

function applyLanguage(langCode) {
    currentLang = langCode;
    const l = TRANSLATIONS[langCode];
    
    document.getElementById('lang-btn-it').classList.toggle('active', langCode === 'it');
    document.getElementById('lang-btn-en').classList.toggle('active', langCode === 'en');
    
    document.getElementById('app-title').innerText = l.title;
    document.getElementById('app-subtitle').innerText = l.subtitle;
    
    const dropzoneTitle = dropZone.querySelector('h3');
    const dropzoneSubtitle = dropZone.querySelector('p');
    if (dropzoneTitle) dropzoneTitle.innerText = l.dropzoneTitle;
    if (dropzoneSubtitle) dropzoneSubtitle.innerText = l.dropzoneSubtitle;
    
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
    
    const footer = document.querySelector('.app-footer p');
    if (footer) footer.innerText = l.footerText;
    
    if (activeNotebookData) {
        renderResults();
    }
}

// ================================================================================
// TABELLA DI TRADUZIONE SIMBOLI MATEMATICI UNICODE -> ASCII
// ================================================================================

function buildMathTranslationTable() {
    const table = new Map();

    for (let i = 0; i < 26; i++) {
        const upper = String.fromCharCode(65 + i);
        const lower = String.fromCharCode(97 + i);

        // Math Bold Uppercase & Lowercase
        table.set(0x1D400 + i, upper);
        table.set(0x1D41A + i, lower);

        // Math Italic Uppercase & Lowercase (con gap Planck constant 0x210E per 'h')
        table.set(0x1D434 + i, upper);
        if (i === 7) {
            table.set(0x210E, 'h');
        } else {
            table.set(0x1D44E + i, lower);
        }

        // Math Bold Italic
        table.set(0x1D468 + i, upper);
        table.set(0x1D482 + i, lower);

        // Math Sans-Serif Regular
        table.set(0x1D5A0 + i, upper);
        table.set(0x1D5BA + i, lower);

        // Math Sans-Serif Bold
        table.set(0x1D5D4 + i, upper);
        table.set(0x1D5EE + i, lower);

        // Math Sans-Serif Italic
        table.set(0x1D608 + i, upper);
        table.set(0x1D622 + i, lower);

        // Math Sans-Serif Bold Italic
        table.set(0x1D63C + i, upper);
        table.set(0x1D656 + i, lower);

        // Math Monospace
        table.set(0x1D670 + i, upper);
        table.set(0x1D68A + i, lower);
    }

    // Dotless i e dotless j
    table.set(0x1D6A4, 'i');
    table.set(0x1D6A5, 'j');

    // Cifre matematiche Unicode (0-9)
    for (let i = 0; i < 10; i++) {
        const d = String(i);
        table.set(0x1D7CE + i, d); // Bold
        table.set(0x1D7D8 + i, d); // Double-struck
        table.set(0x1D7E2 + i, d); // Sans-serif
        table.set(0x1D7EC + i, d); // Sans-serif bold
        table.set(0x1D7F6 + i, d); // Monospace
    }

    return table;
}

const MATH_TRANSLATION_TABLE = buildMathTranslationTable();

function normalizeUnicode(text) {
    if (!text) return "";
    return text.normalize("NFC");
}

function normalizeUnicodeMath(text) {
    if (!text) return "";
    const norm = normalizeUnicode(text);
    const out = [];
    for (const char of norm) {
        const cp = char.codePointAt(0);
        if (MATH_TRANSLATION_TABLE.has(cp)) {
            out.push(MATH_TRANSLATION_TABLE.get(cp));
        } else {
            out.push(char);
        }
    }
    return out.join("");
}

// ================================================================================
// DECIFRATURA CESARE SELETTIVA E PROTEZIONE ACCENTI
// ================================================================================

function decryptCaesar(text) {
    const out = [];
    const isAllUpper = text === text.toUpperCase() && /[A-Z]/.test(text);

    for (let idx = 0; idx < text.length; idx++) {
        const c = text[idx];

        // PROTEZIONE TASSATIVA: caratteri accentati italiani e non-ASCII rimangono intatti
        if (ITALIAN_ACCENTED_CHARS.has(c) || !(/[a-zA-Z]/.test(c))) {
            if (/[0-9]/.test(c)) {
                const decDig = (c.charCodeAt(0) - 48 - 6 + 20) % 10;
                out.push(String.fromCharCode(48 + decDig));
            } else {
                out.push(c);
            }
            continue;
        }

        const isUpper = (c >= 'A' && c <= 'Z');
        const cIdx = c.charCodeAt(0) - (isUpper ? 65 : 97);

        if (isAllUpper) {
            const pIdx = (cIdx - 4 + 26) % 26;
            out.push(String.fromCharCode(65 + pIdx));
        } else {
            if (idx === 0 && isUpper) {
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
    if (!text || text.trim().length < 4) return false;

    const rawClean = normalizeUnicodeMath(text).toLowerCase();
    const words = rawClean.match(/[a-zA-Zàèéìòù]+/g) || [];
    if (words.length === 0) return false;

    // 1. Se il testo grezzo contiene già stop-word o termini italiani chiaramente leggibili, NON è cifrato!
    const italianClearMatches = words.filter(w => ITALIAN_STOPWORDS.has(w)).length;
    if (italianClearMatches >= 1 && words.length > 1) {
        return false;
    }

    // 2. Se una delle parole grezze coincide esattamente con parole lunghe italiane, è in chiaro
    if (words.some(w => CAESAR_TARGET_KEYWORDS.has(w))) {
        return false;
    }

    // 3. Decifra il candidato e verifica se emergono parole bersaglio italiane reali
    const dec = decryptCaesar(text).toLowerCase();
    const decWords = new Set(dec.match(/[a-zA-Zàèéìòù]+/g) || []);

    for (const target of CAESAR_TARGET_KEYWORDS) {
        if (decWords.has(target)) return true;
    }

    // 4. Casi specifici storici di cifratura documentati
    if (dec.includes("tumtiri") || dec.includes("tum tir") || dec.includes("ipert polm")) {
        return true;
    }

    return false;
}

// ================================================================================
// FORMATTAZIONE CASING E COSTRUZIONE NOMI FILE
// ================================================================================

function formatTitleCasing(text) {
    if (!text) return "";

    const tokens = text.split(/\s+/);
    const formatted = [];
    const minorWords = new Set(["di", "del", "della", "delle", "dei", "degli", "il", "lo", "la", "i", "gli", "le", "un", "uno", "una", "e", "ed", "in", "su", "per", "con", "tra", "fra", "da", "a"]);
    const romanNumerals = new Set(["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"]);

    for (let idx = 0; idx < tokens.length; idx++) {
        const rawTok = tokens[idx];
        const match = rawTok.match(/^([^a-zA-Z0-9àèéìòùÀÈÉÌÒÙ]*)(.*?)([^a-zA-Z0-9àèéìòùÀÈÉÌÒÙ]*)$/);
        if (!match) {
            formatted.push(rawTok);
            continue;
        }

        const prefix = match[1];
        const word = match[2];
        const suffix = match[3];

        if (!word) {
            formatted.push(rawTok);
            continue;
        }

        const wordUp = word.toUpperCase();
        let formattedWord = "";

        // Caso 1: Acronimo medico o prefisso
        if (WHITELIST_ACRONYMS.has(wordUp) || SUBJECT_PREFIXES.has(wordUp + suffix)) {
            formattedWord = wordUp;
        }
        // Caso 2: Preposizione o congiunzione minore non all'inizio
        else if (idx > 0 && minorWords.has(word.toLowerCase()) && !formatted[formatted.length - 1].endsWith(':')) {
            formattedWord = word.toLowerCase();
        }
        // Caso 3: Numero romano legittimo (I - XII)
        else if (romanNumerals.has(wordUp)) {
            formattedWord = wordUp;
        }
        // Caso 4: Parola standard -> Capitalize (con supporto accenti)
        else {
            formattedWord = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        }

        formatted.push(`${prefix}${formattedWord}${suffix}`);
    }

    return formatted.join(" ");
}

function cleanTitle(title) {
    if (!title || typeof title !== 'string') {
        return currentLang === 'it' ? "Registrazione Senza Nome" : "Unnamed Recording";
    }

    let nameClean = normalizeUnicodeMath(title);

    // Decifratura Cesare controllata
    if (isCaesarEncrypted(nameClean)) {
        nameClean = decryptCaesar(nameClean);
    }

    // Correzioni ortografiche note
    const lowerName = nameClean.toLowerCase();
    if (lowerName.includes("anuerismi")) {
        nameClean = nameClean.replace(/anuerismi/gi, 'aneurismi');
    }
    if (lowerName.includes("tumtiri") || lowerName.includes("tum tir e paratir")) {
        nameClean = "Tum tir e paratir";
    } else if (lowerName.includes("mxmlb")) {
        nameClean = "Ipert polm, tum card";
    }

    // Sanitizzazione caratteri vietati nei filesystem (tranne i due punti dei prefissi gestiti in export)
    nameClean = nameClean.replace(/[\/\\\*\?"<>\|]/g, '-');

    // Casing intelligente
    nameClean = formatTitleCasing(nameClean);

    // Pulizia punteggiatura orfana finale
    nameClean = nameClean.replace(/[\s,:;\.\-_]+$/, '').trim();

    return nameClean || (currentLang === 'it' ? "Registrazione Senza Nome" : "Unnamed Recording");
}

function buildExportFilename(rawTitle, datePrefix = null, ext = "m4a") {
    const titleClean = cleanTitle(rawTitle);

    // Nel filesystem i due punti ':' sono vietati su Windows e problematici su macOS
    // Trasforma 'CV: Aneurismi' in 'CV - Aneurismi'
    let fsTitle = titleClean.replace(/[:\/\\*\?"<>\|]/g, ' - ');
    fsTitle = fsTitle.replace(/\s*-\s*-\s*/g, ' - ');
    fsTitle = fsTitle.replace(/\s+/g, ' ').replace(/^[\s\-]+|[\s\-]+$/g, '');

    const extClean = ext.replace(/^\.+/, '').toLowerCase();
    if (datePrefix && datePrefix !== "00_00") {
        return `${datePrefix} - ${fsTitle}.${extClean}`;
    }
    return `${fsTitle}.${extClean}`;
}

function getFilenameScore(filename) {
    let score = 0;
    const nameLower = filename.toLowerCase();
    for (const kw of CAESAR_TARGET_KEYWORDS) {
        if (nameLower.includes(kw)) score += 15;
    }
    for (const kw of ITALIAN_STOPWORDS) {
        if (nameLower.includes(kw)) score += 5;
    }
    for (const acr of WHITELIST_ACRONYMS) {
        if (filename.includes(acr)) score += 20;
    }
    for (const gibberish of ["xwtuwvq", "izbmzqbq", "kizlqwxibqm", "uitibbqm", "qvb", "xtmczi", "jkm", "jiri", "leicica"]) {
        if (nameLower.includes(gibberish)) score -= 50;
    }
    return score;
}

// ================================================================================
// PARSING MP4 ATOMO MVHD (HEAD & TAIL) E FORMATTAZIONE DURATE
// ================================================================================

function formatDurationSeconds(secondsTotal) {
    if (secondsTotal === null || secondsTotal === undefined || secondsTotal <= 0) {
        return "N/A";
    }
    const sec = Math.round(secondsTotal);
    const hours = Math.floor(sec / 3600);
    const minutes = Math.floor((sec % 3600) / 60);
    const seconds = sec % 60;
    if (hours > 0) {
        return `${hours}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
    }
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}

function formatDurationNs(nanosecs) {
    if (typeof nanosecs !== 'number' || nanosecs <= 0) return null;
    const totalSeconds = Math.floor(nanosecs / 1000000000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
        return `${hours}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
    }
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}

function parseMvhdBytes(data) {
    const result = {
        creationDate: null,
        unixTimestamp: null,
        timescale: null,
        durationUnits: null,
        durationSeconds: null,
        durationFormatted: "N/A"
    };

    if (!data || data.length < 24) return result;

    // Cerca 'mvhd' (0x6d, 0x76, 0x68, 0x64)
    let idx = -1;
    for (let i = 0; i <= data.length - 8; i++) {
        if (data[i] === 0x6d && data[i + 1] === 0x76 && data[i + 2] === 0x68 && data[i + 3] === 0x64) {
            idx = i;
            break;
        }
    }

    if (idx === -1 || idx + 8 > data.length) return result;

    const version = data[idx + 4];
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    let creationTimeRaw = 0;
    let timescale = 0;
    let duration = 0;

    try {
        if (version === 0) {
            if (idx + 24 > data.length) return result;
            creationTimeRaw = view.getUint32(idx + 8, false);
            timescale = view.getUint32(idx + 16, false);
            duration = view.getUint32(idx + 20, false);
        } else if (version === 1) {
            if (idx + 36 > data.length) return result;
            const highC = view.getUint32(idx + 8, false);
            const lowC = view.getUint32(idx + 12, false);
            creationTimeRaw = highC * 4294967296 + lowC;
            timescale = view.getUint32(idx + 24, false);
            const highD = view.getUint32(idx + 28, false);
            const lowD = view.getUint32(idx + 32, false);
            duration = highD * 4294967296 + lowD;
        } else {
            return result;
        }

        if (creationTimeRaw > MAC_TO_UNIX_OFFSET) {
            const unixTime = creationTimeRaw - MAC_TO_UNIX_OFFSET;
            // Sanity check: compreso tra 2000 e 2040
            if (unixTime >= 946684800 && unixTime <= 2208988800) {
                result.unixTimestamp = unixTime;
                result.creationDate = new Date(unixTime * 1000);
            }
        }

        if (timescale > 0) {
            result.timescale = timescale;
            result.durationUnits = duration;
            result.durationSeconds = duration / timescale;
            result.durationFormatted = formatDurationSeconds(result.durationSeconds);
        }
    } catch (err) {
        // Nessun throw su frammenti binari non standard
    }

    return result;
}

function parseMvhdFromBytes(dataBytes, maxHeadBytes = 262144) {
    // 1. Prova nei primi 256 KB (head)
    const headLen = Math.min(dataBytes.length, maxHeadBytes);
    const headData = dataBytes.subarray(0, headLen);
    let res = parseMvhdBytes(headData);
    if (res.creationDate && res.durationFormatted !== "N/A") {
        return res;
    }

    // 2. Se non trovato o mancano info, cerca negli ultimi 1.5 MB (tail)
    const tailLen = Math.min(dataBytes.length, 1572864);
    if (tailLen > 0 && dataBytes.length > maxHeadBytes) {
        const tailData = dataBytes.subarray(dataBytes.length - tailLen);
        const resTail = parseMvhdBytes(tailData);
        if (resTail.creationDate || resTail.durationFormatted !== "N/A") {
            if (!res.creationDate && resTail.creationDate) {
                res.creationDate = resTail.creationDate;
                res.unixTimestamp = resTail.unixTimestamp;
            }
            if (res.durationFormatted === "N/A" && resTail.durationFormatted !== "N/A") {
                res.timescale = resTail.timescale;
                res.durationUnits = resTail.durationUnits;
                res.durationSeconds = resTail.durationSeconds;
                res.durationFormatted = resTail.durationFormatted;
            }
        }
    }

    return res;
}

// ================================================================================
// DECODIFICATORE PROTOBUF BINARIO
// ================================================================================

function readVarint(arr, offsetRef) {
    let value = 0;
    let multiplier = 1;
    let shift = 0;
    while (true) {
        if (offsetRef.val >= arr.length) return null;
        let byte = arr[offsetRef.val++];
        value += (byte & 0x7f) * multiplier;
        if (!(byte & 0x80)) break;
        multiplier *= 128;
        shift += 7;
        if (shift > 64) return null; // Previene loop infiniti
    }
    return value;
}

function bytesToString(bytes) {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
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
            
            // Messaggio 160: Associazione Sessione -> Attachment UUID & Durata
            if (decoded[160]) {
                const f160 = decodeProtobufFields(decoded[160]);
                const s_id = f160[1] ? bytesToString(f160[1]).toUpperCase() : null;
                const att_id = f160[2] ? bytesToString(f160[2]).toUpperCase() : null;
                const duration_ns = f160[4] || null;
                
                if (s_id && att_id) {
                    sessionToAttachment[s_id] = att_id;
                    if (duration_ns) {
                        const fmt = formatDurationNs(duration_ns);
                        if (fmt) {
                            sessionToDuration[s_id] = fmt;
                        }
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
    
    // Unione dei dati: NESSUNA TRACCIA SCARTATA SE MANCA LA DURATA!
    const mappaAudio = {};
    for (const [s_id, att_uuid] of Object.entries(sessionToAttachment)) {
        const raw_title = sessionToTitle[s_id] || "";
        const duration = sessionToDuration[s_id] || null;
        
        mappaAudio[att_uuid] = {
            uuid: att_uuid,
            raw_title: raw_title,
            title: cleanTitle(raw_title),
            duration: duration,
            session_id: s_id
        };
    }
    
    return mappaAudio;
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
        
        const fileKeys = Object.keys(mappaAudio);
        let completedFiles = 0;
        
        for (const attUuid of fileKeys) {
            const info = mappaAudio[attUuid];
            const attFile = zip.file(`attachments/${attUuid}`);
            if (attFile) {
                const attData = await attFile.async("uint8array");
                const mvhdInfo = parseMvhdFromBytes(attData);
                
                let creationDate = mvhdInfo.creationDate;
                if (!creationDate) {
                    creationDate = attFile.date || new Date();
                }
                
                // Durata: priorità a Protobuf, fallback automatico su atomo mvhd
                let finalDuration = info.duration;
                if (!finalDuration || finalDuration === "N/A") {
                    finalDuration = mvhdInfo.durationFormatted || "N/A";
                }
                
                candidates.push({
                    uuid: attUuid,
                    fileData: attData,
                    rawTitle: info.raw_title,
                    titleOriginal: info.title,
                    dateObj: creationDate,
                    unixTimestamp: mvhdInfo.unixTimestamp || (creationDate ? Math.floor(creationDate.getTime() / 1000) : 0),
                    duration: finalDuration,
                    size: attData.length
                });
            }
            completedFiles++;
            updateProgress(50 + Math.floor((completedFiles / fileKeys.length) * 20));
        }
        
        if (candidates.length === 0) {
            throw new Error(l.errorNoAudio);
        }
        
        // Deduplicazione fisica in base alla dimensione esatta del file
        const sizeMap = {};
        for (const cand of candidates) {
            if (!sizeMap[cand.size]) sizeMap[cand.size] = [];
            sizeMap[cand.size].push(cand);
        }
        
        const deduplicatedCandidates = [];
        for (const size of Object.keys(sizeMap)) {
            const list = sizeMap[size];
            if (list.length > 1) {
                list.sort((a, b) => {
                    const scoreA = (!a.rawTitle || a.rawTitle.trim() === "") ? -100 : getFilenameScore(a.titleOriginal);
                    const scoreB = (!b.rawTitle || b.rawTitle.trim() === "") ? -100 : getFilenameScore(b.titleOriginal);
                    return scoreB - scoreA;
                });
                deduplicatedCandidates.push(list[0]);
            } else {
                deduplicatedCandidates.push(list[0]);
            }
        }
        
        // Ordinamento cronologico
        deduplicatedCandidates.sort((a, b) => (a.unixTimestamp || 0) - (b.unixTimestamp || 0));
        
        // Assegnazione dei nomi finali coerenti con sanitizzazione filesystem
        let clipCounter = 1;
        const finalExportList = [];
        
        for (const cand of deduplicatedCandidates) {
            let rawTitle = cand.rawTitle;
            if (!rawTitle || rawTitle.trim() === "") {
                rawTitle = `${l.clipAudio} ${clipCounter}`;
                clipCounter++;
            }
            
            // Prefisso Data: GG_MM
            let datePrefix = "00_00";
            let dateDisplay = "N/A";
            if (cand.dateObj && !isNaN(cand.dateObj.getTime())) {
                const day = cand.dateObj.getDate().toString().padStart(2, '0');
                const month = (cand.dateObj.getMonth() + 1).toString().padStart(2, '0');
                const year = cand.dateObj.getFullYear();
                const hours = cand.dateObj.getHours().toString().padStart(2, '0');
                const minutes = cand.dateObj.getMinutes().toString().padStart(2, '0');
                datePrefix = `${day}_${month}`;
                dateDisplay = `${day}/${month}/${year} ${hours}:${minutes}`;
            }
            
            const destFilename = buildExportFilename(rawTitle, datePrefix, "m4a");
            const cleanT = cleanTitle(rawTitle);
            
            finalExportList.push({
                uuid: cand.uuid,
                filename: destFilename,
                titleClean: cleanT,
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
        
        renderResults();
        
        updateProgress(100);
        setTimeout(hideLoader, 250);
        
    } catch (e) {
        hideLoader();
        showError(e.message);
    }
}

// ================================================================================
// RENDERING GRAFICO E RIPRODUZIONE AUDIO ANTEPRIMA
// ================================================================================

function togglePlayAudio(index) {
    if (!activeNotebookData || !activeNotebookData.list[index]) return;
    const track = activeNotebookData.list[index];
    const btn = document.getElementById(`play-btn-${index}`);

    if (currentAudio && currentPlayingIndex === index) {
        currentAudio.pause();
        currentAudio = null;
        currentPlayingIndex = null;
        if (btn) btn.innerHTML = getPlayIconSvg();
        return;
    }

    if (currentAudio) {
        currentAudio.pause();
        if (currentPlayingIndex !== null) {
            const oldBtn = document.getElementById(`play-btn-${currentPlayingIndex}`);
            if (oldBtn) oldBtn.innerHTML = getPlayIconSvg();
        }
        currentAudio = null;
        currentPlayingIndex = null;
    }

    const blob = new Blob([track.fileData], { type: 'audio/mp4' });
    const url = URL.createObjectURL(blob);
    currentAudio = new Audio(url);
    currentPlayingIndex = index;

    if (btn) btn.innerHTML = getPauseIconSvg();

    currentAudio.play().catch(e => {
        console.error("Playback error:", e);
        if (btn) btn.innerHTML = getPlayIconSvg();
        currentAudio = null;
        currentPlayingIndex = null;
    });

    currentAudio.onended = () => {
        if (btn) btn.innerHTML = getPlayIconSvg();
        currentAudio = null;
        currentPlayingIndex = null;
        URL.revokeObjectURL(url);
    };
}

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
                    <button id="play-btn-${index}" class="btn-icon" title="${l.playAudio}" onclick="togglePlayAudio(${index})">
                        ${getPlayIconSvg()}
                    </button>
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

// Switcher lingua
document.getElementById('lang-btn-it').addEventListener('click', () => applyLanguage('it'));
document.getElementById('lang-btn-en').addEventListener('click', () => applyLanguage('en'));

// Rilevamento automatico lingua utente (default italiano)
let defaultLang = 'it';
if (navigator.language && !navigator.language.startsWith('it')) {
    defaultLang = 'en';
}
applyLanguage(defaultLang);
